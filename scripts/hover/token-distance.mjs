/**
 * Mesure de distance entre le token source et le token actuellement survolé.
 * Ce fichier ne gère aucun déplacement : il ne fait qu’écouter le survol et
 * afficher une distance directe dans l’infobulle.
 */
import { MODULE_ID } from "../shared/constants.mjs";
import { hoverState, movementState } from "../shared/state.mjs";
import { formatDistanceLabel, hideTooltip, showTooltip } from "../ui/tooltip.mjs";
import { translate } from "../i18n/localization.mjs";

/** Privilégie l'unique token sélectionné, puis celui du personnage du joueur. */
function getSourceToken() {
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 1) return controlled[0];

  const character = game.user?.character;
  if (!character) return null;

  const active = character.getActiveTokens?.(true, true) ?? [];
  return active.length === 1 ? active[0] : null;
}

/** Mesure de centre à centre avec la grille Foundry ; le glisser-déposer est prioritaire. */
export function refreshTooltip() {
  if (movementState.dragState) return;
  if (!hoverState.hoveredToken?.scene || !hoverState.hoveredToken.visible) {
    hideTooltip();
    return;
  }

  const source = getSourceToken();
  if (!source || source === hoverState.hoveredToken || !source.scene) {
    hideTooltip();
    return;
  }

  try {
    const origin = source.center;
    const destination = hoverState.hoveredToken.center;
    const distance = canvas.grid.measurePath([origin, destination])?.distance;

    if (!Number.isFinite(distance)) {
      hideTooltip();
      return;
    }

    const units = canvas.scene?.grid?.units?.trim() ?? "";
    showTooltip(formatDistanceLabel(distance, units), hoverState.hoveredToken);
  } catch (error) {
    console.error(`${MODULE_ID} | ${translate("errors.hoverMeasurement")}`, error);
    hideTooltip();
  }
}

/** Enregistre tous les hooks propres à la mesure token à token. */
export function registerHoverDistanceHooks() {
  Hooks.on("hoverToken", (token, hovered) => {
    if (!canvas?.ready || movementState.dragState) return;

    if (!hovered) {
      if (hoverState.hoveredToken === token) hoverState.hoveredToken = null;
      hideTooltip();
      return;
    }

    hoverState.hoveredToken = token;
    refreshTooltip();
  });

  // Une sélection ou un déplacement peut changer la distance sans nouveau survol.
  Hooks.on("controlToken", () => refreshTooltip());
  Hooks.on("updateToken", () => {
    if (!movementState.dragState) refreshTooltip();
  });
}

/** Nettoie la référence au token survolé lors d’un changement de scène. */
export function cleanupHoverDistance() {
  hoverState.hoveredToken = null;
  hideTooltip();
}
