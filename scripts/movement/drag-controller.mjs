/**
 * Contrôleur principal du glisser-déposer.
 * Il crée l’état du trajet, suit le clone de prévisualisation, place les étapes
 * et coordonne le calcul, le rendu puis l’animation finale.
 */
import { MODULE_ID } from "../shared/constants.mjs";
import { translate } from "../i18n/localization.mjs";
import { hoverState, movementState } from "../shared/state.mjs";
import { hideTooltip } from "../ui/tooltip.mjs";
import { blockNextNativeTokenMove } from "../foundry/native-token-move.mjs";
import { addCombatMovement } from "./combat-movement.mjs";
import { buildCostSamples, centerToDocumentPosition } from "./route-calculator.mjs";
import { clearOverlay, ensureOverlay, renderDragMeasurement } from "./route-renderer.mjs";
import { moveTokenAlongAnchoredRoute } from "./token-animation.mjs";

/** Démarre une mesure uniquement pour un token que l'utilisateur peut contrôler. */
export function beginDragMeasurement(token, event, managerData = null) {
  const original = token?._original ?? token;
  if (!original?.document || !original.isOwner) return;

  const origin = { x: original.center.x, y: original.center.y };
  movementState.dragState = {
    token: original,
    origin,
    originDocument: { x: original.document.x, y: original.document.y },
    destination: { ...origin },
    waypoints: [],
    cancelled: false,
    interactionManager: token.mouseInteractionManager ?? null,
    lastEvent: event,
    interactionData: managerData ?? null
  };

  hoverState.hoveredToken = null;
  hideTooltip();
  ensureOverlay();
  updateDragMeasurement(token, event, managerData);
}

/** Suit le centre du clone Foundry, puis redessine le trajet sans déplacer le document. */
export function updateDragMeasurement(token, event, managerData = null) {
  const state = movementState.dragState;
  if (!state || state.cancelled) return;
  const original = token?._original ?? token;
  if (state.token !== original) return;

  state.lastEvent = event;
  state.interactionData = managerData ?? event?.interactionData ?? state.interactionData ?? null;
  state.interactionManager = token.mouseInteractionManager ?? state.interactionManager ?? null;

  const data = state.interactionData ?? {};
  const rawClones = data.clones;
  // Les modules tiers peuvent fournir les clones sous plusieurs formes.
  const clones = Array.isArray(rawClones)
    ? rawClones
    : rawClones instanceof Map
      ? Array.from(rawClones.values())
      : rawClones && typeof rawClones === "object"
        ? Object.values(rawClones)
        : [];
  const dragPreview = clones.find(clone => (clone?._original ?? clone) === state.token) ?? clones[0];

  if (dragPreview?.center && Number.isFinite(dragPreview.center.x) && Number.isFinite(dragPreview.center.y)) {
    state.destination = { x: dragPreview.center.x, y: dragPreview.center.y };
  } else if (Number.isFinite(data.destination?.x) && Number.isFinite(data.destination?.y)) {
    state.destination = {
      x: data.destination.x + (state.token.w ?? 0) / 2,
      y: data.destination.y + (state.token.h ?? 0) / 2
    };
  } else {
    const p = event?.global ?? event?.data?.global;
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) {
      state.destination = canvas.stage.worldTransform.applyInverse(new PIXI.Point(p.x, p.y));
    }
  }

  renderDragMeasurement(state);
}

/**
 * Prépare une copie indépendante du trajet avant que Foundry détruise son clone.
 * Les étapes passent ici des centres de tokens aux coins des documents.
 */
function snapshotDragStateForDrop() {
  const state = movementState.dragState;
  if (!state) return null;

  // La destination de MouseInteractionManager n'utilise pas toujours le même
  // référentiel selon la taille du token et l'état du drag. Le tracé, lui, est
  // construit depuis le centre réel du clone. On reconvertit donc toujours ce
  // centre vers les coordonnées du document pour éviter le décalage bas-droite.
  const finalDocument = centerToDocumentPosition(state.destination, state.token);

  const routePoints = [state.origin, ...state.waypoints, state.destination];
  const movementCost = buildCostSamples(routePoints, state.token).at(-1)?.totalCost ?? 0;

  return {
    token: state.token,
    originDocument: { ...state.originDocument },
    waypoints: state.waypoints.map(point => centerToDocumentPosition(point, state.token)),
    finalDocument,
    movementCost,
    cancelled: state.cancelled
  };
}

/**
 * Laisse Foundry terminer le dépôt, puis joue les étapes et comptabilise le trajet.
 * Cette fonction reste synchrone lorsque le callback Foundry l'est : son résultat
 * sert aussi à piloter la machine d'état du gestionnaire d'interactions.
 */
export function handleDragDrop(runNative) {
  const state = snapshotDragStateForDrop();
  const hasRoute = Boolean(state && !state.cancelled && state.waypoints.length);
  const nativeDropBlocker = hasRoute ? blockNextNativeTokenMove(state.token) : null;

  let result;
  try {
    // Le blocage est installé AVANT le dépôt. Foundry peut ainsi détruire son
    // aperçu normalement, sans envoyer le token directement à la destination.
    result = runNative();
  } catch (error) {
    nativeDropBlocker?.cancel();
    cleanupDragMeasurement();
    throw error;
  }

  const finishDrop = async () => {
    // Attendre l'interception évite qu'une mise à jour native tardive remplace
    // la position du premier point d'ancrage.
    if (nativeDropBlocker) await nativeDropBlocker.wait();
    cleanupDragMeasurement();
    if (!state) return;

    if (state.cancelled) {
      await state.token.document.update(state.originDocument, { animate: false });
      return;
    }

    if (hasRoute) await moveTokenAlongAnchoredRoute(state);
    addCombatMovement(state.token, state.movementCost);
  };

  // Certains modules renvoient une promesse depuis leur callback : préserver
  // ce contrat et propager leur erreur après avoir libéré le hook temporaire.
  if (result instanceof Promise) {
    return result.then(async value => {
      await finishDrop();
      return value;
    }, error => {
      nativeDropBlocker?.cancel();
      cleanupDragMeasurement();
      throw error;
    });
  }

  void finishDrop().catch(error => {
    console.error(`${MODULE_ID} | ${translate("errors.finishMovement")}`, error);
  });
  return result;
}

/** Fixe le centre courant comme étape ; un second appui au même endroit est ignoré. */
export function placeWaypoint() {
  const state = movementState.dragState;
  if (!state || state.cancelled) return;
  const point = { ...state.destination };
  const previous = state.waypoints.at(-1) ?? state.origin;
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;

  state.waypoints.push(point);
  renderDragMeasurement(state);
}

/** Demande à Foundry d'annuler le drag et de retirer lui-même son clone visuel. */
export function cancelCurrentDrag() {
  if (!movementState.dragState) return;

  const state = movementState.dragState;
  state.cancelled = true;
  state.waypoints = [];
  state.destination = { ...state.origin };

  // Annule le déplacement sans créer, déplacer ou conserver de clone visuel.
  clearOverlay();
  hideTooltip();

  const manager = state.interactionManager ?? state.token?.mouseInteractionManager;
  if (manager?.isDragging && typeof manager.cancel === "function") {
    manager.cancel(state.lastEvent);
  } else {
    // Repli défensif si le gestionnaire n'est plus dans un état de drag.
    state.token.document.update(state.originDocument, { animate: false });
    cleanupDragMeasurement();
  }

  ui.notifications?.info(translate("notifications.movementCancelled"));
}

/** Oublie la mesure et efface l'affichage ; le suivi en combat reste disponible. */
export function cleanupDragMeasurement() {
  movementState.dragState = null;
  clearOverlay();
  hideTooltip();
}
