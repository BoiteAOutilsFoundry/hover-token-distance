const MODULE_ID = "hover-token-distance";
const TOOLTIP_ID = `${MODULE_ID}-tooltip`;
const KEY_WAYPOINT = "placeWaypoint";
const KEY_CANCEL = "cancelDrag";
const SETTING_DIFFICULT_TERRAIN = "tokensAreDifficultTerrain";

let hoveredToken = null;
let dragState = null;
let overlay = null;
let interactionPatched = false;
const combatMovementSpent = new Map();

Hooks.once("init", () => {
  registerSettings();
  registerKeybindings();
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module chargé`);
  ensureTooltip();
});

Hooks.on("canvasReady", () => {
  installInteractionTracking();
  ensureOverlay();
});

Hooks.on("hoverToken", (token, hovered) => {
  if (!canvas?.ready || dragState) return;
  if (!hovered) {
    if (hoveredToken === token) hoveredToken = null;
    hideTooltip();
    return;
  }
  hoveredToken = token;
  refreshTooltip();
});

Hooks.on("controlToken", () => refreshTooltip());
Hooks.on("deleteCombat", combat => {
  const prefix = `${combat.id}:`;
  for (const key of combatMovementSpent.keys()) {
    if (key.startsWith(prefix)) combatMovementSpent.delete(key);
  }
});
Hooks.on("updateToken", () => {
  if (!dragState) refreshTooltip();
});
Hooks.on("canvasPan", () => {
  if (dragState) renderDragMeasurement();
  else refreshTooltip();
});
Hooks.on("canvasTearDown", () => {
  hoveredToken = null;
  cleanupDragMeasurement();
  hideTooltip();
  if (overlay && !overlay.destroyed) overlay.destroy({ children: true });
  overlay = null;
});

function registerSettings() {
  game.settings.register(MODULE_ID, SETTING_DIFFICULT_TERRAIN, {
    name: "Les tokens créent du terrain difficile",
    hint: "Quand cette option est activée, chaque case occupée par un autre token coûte le double de sa distance normale lorsqu’elle est traversée.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
    onChange: () => {
      if (dragState) renderDragMeasurement();
    }
  });
}

function registerKeybindings() {
  game.keybindings.register(MODULE_ID, KEY_WAYPOINT, {
    name: "Hover Token Distance : fixer une étape",
    hint: "Pendant le déplacement d'un token, fixe le point actuel comme étape du trajet.",
    editable: [{ key: "KeyY" }],
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0,
    onDown: () => {
      if (!dragState || dragState.cancelled) return false;
      placeWaypoint();
      return true;
    }
  });

  game.keybindings.register(MODULE_ID, KEY_CANCEL, {
    name: "Hover Token Distance : annuler le déplacement",
    hint: "Annule le trajet en cours, efface les étapes et replace le token à son point de départ.",
    editable: [{ key: "KeyU" }],
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0,
    onDown: () => {
      if (!dragState) return false;
      cancelCurrentDrag();
      return true;
    }
  });
}

function installInteractionTracking() {
  if (interactionPatched) return;

  const manager = canvas?.tokens?.placeables?.find(t => t.mouseInteractionManager)?.mouseInteractionManager
    ?? canvas?.mouseInteractionManager;
  const ManagerClass = manager?.constructor;
  const proto = ManagerClass?.prototype;
  if (!proto || typeof proto.callback !== "function") {
    console.error(`${MODULE_ID} | MouseInteractionManager.callback introuvable`);
    return;
  }

  const original = proto.callback;
  proto.callback = function(action, event, ...args) {
    const target = this.target;
    const isToken = target?.document?.documentName === "Token";

    if (!isToken || !["dragLeftStart", "dragLeftMove", "dragLeftDrop", "dragLeftCancel"].includes(action)) {
      return original.call(this, action, event, ...args);
    }

    if (action === "dragLeftStart") {
      const result = original.call(this, action, event, ...args);
      try {
        beginDragMeasurement(target, event, this.interactionData);
      } catch (error) {
        console.error(`${MODULE_ID} | Impossible de démarrer la mesure`, error);
      }
      return result;
    }

    if (action === "dragLeftMove") {
      const result = original.call(this, action, event, ...args);
      try {
        updateDragMeasurement(target, event, this.interactionData);
      } catch (error) {
        console.error(`${MODULE_ID} | Erreur pendant la mesure`, error);
      }
      return result;
    }

    if (action === "dragLeftDrop") {
      const state = snapshotDragStateForDrop(this.interactionData);
      const hasRoute = Boolean(state && !state.cancelled && state.waypoints.length);

      // Le dépôt natif de Foundry reste intact. En particulier, on ne renvoie
      // jamais son clone visuel au point de départ : cela créait le token
      // fantôme persistant. Le token réel sera replacé silencieusement à son
      // origine juste avant de rejouer un trajet avec points d'ancrage.

      let result;
      try {
        result = original.call(this, action, event, ...args);
      } catch (error) {
        cleanupDragMeasurement();
        throw error;
      }

      const finishDrop = async () => {
        // Foundry termine et détruit lui-même son aperçu de glisser-déposer.
        // Le module ne crée, ne déplace et ne conserve aucun clone de token.
        cleanupDragMeasurement();
        if (!state) return;

        if (state.cancelled) {
          await state.token.document.update(state.originDocument, { animate: false });
          return;
        }

        if (hasRoute) await moveTokenAlongAnchoredRoute(state);
        addCombatMovement(state.token, state.movementCost);
      };

      if (result instanceof Promise) {
        return result.then(async value => {
          await finishDrop();
          return value;
        }, async error => {
          cleanupDragMeasurement();
          throw error;
        });
      }

      void finishDrop();
      return result;
    }

    try {
      return original.call(this, action, event, ...args);
    } finally {
      cleanupDragMeasurement();
    }
  };

  interactionPatched = true;
  console.log(`${MODULE_ID} | Suivi raccordé à MouseInteractionManager.callback`);
}

function beginDragMeasurement(token, event, managerData = null) {
  const original = token?._original ?? token;
  if (!original?.document || !original.isOwner) return;

  const origin = { x: original.center.x, y: original.center.y };
  dragState = {
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

  hoveredToken = null;
  hideTooltip();
  ensureOverlay();
  updateDragMeasurement(token, event, managerData);
}

function updateDragMeasurement(token, event, managerData = null) {
  if (!dragState || dragState.cancelled) return;
  const original = token?._original ?? token;
  if (dragState.token !== original) return;

  dragState.lastEvent = event;
  dragState.interactionData = managerData ?? event?.interactionData ?? dragState.interactionData ?? null;
  dragState.interactionManager = token.mouseInteractionManager ?? dragState.interactionManager ?? null;

  const data = dragState.interactionData ?? {};
  const rawClones = data.clones;
  const clones = Array.isArray(rawClones)
    ? rawClones
    : rawClones instanceof Map
      ? Array.from(rawClones.values())
      : rawClones && typeof rawClones === "object"
        ? Object.values(rawClones)
        : [];
  const dragPreview = clones.find(c => (c?._original ?? c) === dragState.token) ?? clones[0];

  if (dragPreview?.center && Number.isFinite(dragPreview.center.x) && Number.isFinite(dragPreview.center.y)) {
    dragState.destination = { x: dragPreview.center.x, y: dragPreview.center.y };
  } else if (Number.isFinite(data.destination?.x) && Number.isFinite(data.destination?.y)) {
    dragState.destination = {
      x: data.destination.x + (dragState.token.w ?? 0) / 2,
      y: data.destination.y + (dragState.token.h ?? 0) / 2
    };
  } else {
    const p = event?.global ?? event?.data?.global;
    if (Number.isFinite(p?.x) && Number.isFinite(p?.y)) {
      dragState.destination = canvas.stage.worldTransform.applyInverse(new PIXI.Point(p.x, p.y));
    }
  }

  renderDragMeasurement();
}

function snapshotDragStateForDrop(managerData = null) {
  if (!dragState) return null;

  // La destination de MouseInteractionManager n'utilise pas toujours le même
  // référentiel selon la taille du token et l'état du drag. Le tracé, lui, est
  // construit depuis le centre réel du clone. On reconvertit donc toujours ce
  // centre vers les coordonnées du document pour éviter le décalage bas-droite.
  const finalDocument = centerToDocumentPosition(dragState.destination, dragState.token);

  const routePoints = [dragState.origin, ...dragState.waypoints, dragState.destination];
  const movementCost = buildCostSamples(routePoints, dragState.token).at(-1)?.totalCost ?? 0;

  return {
    token: dragState.token,
    originDocument: { ...dragState.originDocument },
    waypoints: dragState.waypoints.map(point => centerToDocumentPosition(point, dragState.token)),
    finalDocument,
    movementCost,
    cancelled: dragState.cancelled
  };
}

function centerToDocumentPosition(point, token) {
  return {
    x: Math.round(point.x - (token.w ?? 0) / 2),
    y: Math.round(point.y - (token.h ?? 0) / 2)
  };
}

async function moveTokenAlongAnchoredRoute(state) {
  const token = state.token;
  if (!token?.document) return;

  const route = [...state.waypoints, state.finalDocument]
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));

  // Évite les segments nuls et les doublons successifs.
  const uniqueRoute = [];
  let previous = state.originDocument;
  for (const point of route) {
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1) continue;
    uniqueRoute.push(point);
    previous = point;
  }

  // Le dépôt natif s'est terminé normalement à la destination. On replace
  // silencieusement le token réel à son origine avant de jouer les segments.
  if (token.document.x !== state.originDocument.x || token.document.y !== state.originDocument.y) {
    await token.document.update(state.originDocument, { animate: false });
  }

  for (const point of uniqueRoute) {
    const from = { x: token.document.x, y: token.document.y };
    const pixels = Math.hypot(point.x - from.x, point.y - from.y);
    const gridSize = Math.max(canvas.grid?.size ?? 100, 1);
    const duration = Math.clamp
      ? Math.clamp(Math.round((pixels / gridSize) * 140), 140, 650)
      : Math.max(140, Math.min(650, Math.round((pixels / gridSize) * 140)));

    await token.document.update(point, {
      animate: true,
      animation: { duration }
    });

    // Le document reçoit immédiatement ses nouvelles coordonnées alors que le
    // Token continue encore son animation à l'écran. Il faut attendre sa vraie
    // position visuelle avant d'envoyer le segment suivant, sinon Foundry coupe
    // les animations et le token ne passe pas correctement par les ancrages.
    await waitForTokenVisualPosition(token, point, duration);
  }
}

async function waitForTokenVisualPosition(token, destination, expectedDuration = 0) {
  const tolerance = 0.75;
  const timeout = Math.max(1200, Number(expectedDuration) * 4);
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeout) {
    const x = Number(token?.x ?? token?.position?.x);
    const y = Number(token?.y ?? token?.position?.y);

    if (Number.isFinite(x) && Number.isFinite(y)
      && Math.abs(x - destination.x) <= tolerance
      && Math.abs(y - destination.y) <= tolerance) {
      return;
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  // Repli défensif : le document est déjà à destination. On force seulement
  // l'affichage local si une animation externe est restée bloquée.
  if (token?.position?.set) token.position.set(destination.x, destination.y);
}

function placeWaypoint() {
  if (!dragState || dragState.cancelled) return;
  const point = { ...dragState.destination };
  const previous = dragState.waypoints.at(-1) ?? dragState.origin;
  if (Math.hypot(point.x - previous.x, point.y - previous.y) < 2) return;

  dragState.waypoints.push(point);
  renderDragMeasurement();
}

function cancelCurrentDrag() {
  if (!dragState) return;

  const state = dragState;
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

  ui.notifications?.info("Déplacement annulé.");
}

function renderDragMeasurement() {
  if (!dragState || dragState.cancelled || !canvas?.ready) return;
  const graphics = ensureOverlay();
  if (!graphics) return;
  graphics.clear();
  for (const child of [...graphics.children]) child.destroy?.({ children: true });
  graphics.removeChildren();

  const points = [dragState.origin, ...dragState.waypoints, dragState.destination];
  const movement = getMovementAllowance(dragState.token);
  const dashLimit = movement > 0 ? movement * 2 : Infinity;
  const spentMovement = getCombatMovementSpent(dragState.token);
  const remainingNormal = movement > 0 ? Math.max(0, movement - spentMovement) : Infinity;
  const remainingDash = Number.isFinite(dashLimit) ? Math.max(0, dashLimit - spentMovement) : Infinity;
  const samples = buildCostSamples(points, dragState.token);

  drawColoredSamples(graphics, samples, remainingNormal, remainingDash);
  drawWaypointMarkers(graphics, points, samples);

  const total = samples.at(-1)?.totalCost ?? 0;
  const raw = samples.at(-1)?.totalDistance ?? 0;
  const units = canvas.scene?.grid?.units?.trim() ?? "";
  const terrainNote = total > raw + 0.001 ? " · terrain difficile" : "";
  showTooltip(`${formatDistance(total)}${units ? ` ${units}` : ""}${terrainNote}`, null, dragState.destination);
}

function buildCostSamples(points, movingToken) {
  const difficultEnabled = game.settings.get(MODULE_ID, SETTING_DIFFICULT_TERRAIN);
  const samples = [{ point: points[0], totalCost: 0, totalDistance: 0 }];
  let totalCost = 0;
  let totalDistance = 0;
  const gridSize = Math.max(canvas.grid?.size ?? 100, 20);

  // Calcul continu : le trajet suit exactement le pointeur et les points
  // d’ancrage. Aucun recentrage ni déplacement case par case n’est appliqué.
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
    const a = points[segmentIndex];
    const b = points[segmentIndex + 1];
    const pixels = Math.hypot(b.x - a.x, b.y - a.y);
    const divisions = Math.max(1, Math.ceil(pixels / (gridSize / 4)));
    let previous = a;

    for (let i = 1; i <= divisions; i++) {
      const t = i / divisions;
      const current = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      };
      const baseDistance = measureDistance(previous, current);
      const midpoint = {
        x: (previous.x + current.x) / 2,
        y: (previous.y + current.y) / 2
      };
      const difficult = difficultEnabled && overlapsAnotherToken(midpoint, movingToken);
      const cost = baseDistance * (difficult ? 2 : 1);

      totalDistance += baseDistance;
      totalCost += cost;
      samples.push({
        point: current,
        previous,
        distance: baseDistance,
        cost,
        difficult,
        totalDistance,
        totalCost,
        waypoint: i === divisions ? segmentIndex + 1 : null
      });
      previous = current;
    }
  }

  return samples;
}

function measureDistance(a, b) {
  try {
    const measured = canvas.grid.measurePath([a, b]);
    if (Number.isFinite(measured?.distance)) return measured.distance;
  } catch (_error) {
    // Repli ci-dessous pour les grilles ou systèmes atypiques.
  }

  const pixels = Math.hypot(b.x - a.x, b.y - a.y);
  const size = canvas.grid?.size || 100;
  const distance = canvas.scene?.grid?.distance || 5;
  return pixels / size * distance;
}

function overlapsAnotherToken(point, movingToken) {
  const tokens = canvas.tokens?.placeables ?? [];
  const movingElevation = Number(movingToken.document?.elevation ?? 0);

  return tokens.some(token => {
    if (token === movingToken || token.document?.hidden || !token.visible) return false;
    const elevation = Number(token.document?.elevation ?? 0);
    if (elevation !== movingElevation) return false;
    return token.bounds?.contains?.(point.x, point.y) ?? false;
  });
}

function drawColoredSamples(graphics, samples, normalRemaining, dashRemaining) {
  if (samples.length < 2) return;
  const colors = {
    normal: 0x35c759,
    dash: 0xffcc00,
    exceeded: 0xff3b30
  };

  for (let i = 1; i < samples.length; i++) {
    const sample = samples[i];
    const start = samples[i - 1];
    let fromCost = start.totalCost;
    let fromPoint = start.point;
    const endCost = sample.totalCost;
    const endPoint = sample.point;

    const boundaries = [normalRemaining, dashRemaining]
      .filter(value => Number.isFinite(value) && value > fromCost && value < endCost)
      .sort((a, b) => a - b);

    for (const boundary of [...boundaries, endCost]) {
      const ratio = endCost === fromCost ? 1 : (boundary - fromCost) / (endCost - fromCost);
      const toPoint = {
        x: fromPoint.x + (endPoint.x - fromPoint.x) * ratio,
        y: fromPoint.y + (endPoint.y - fromPoint.y) * ratio
      };
      const color = fromCost < normalRemaining ? colors.normal : fromCost < dashRemaining ? colors.dash : colors.exceeded;
      const bandWidth = Math.max(14, (canvas.grid?.size ?? 100) * 0.24);
      graphics.lineStyle(bandWidth, color, 0.45);
      graphics.moveTo(fromPoint.x, fromPoint.y);
      graphics.lineTo(toPoint.x, toPoint.y);
      fromPoint = toPoint;
      fromCost = boundary;
    }
  }
}

function drawWaypointMarkers(graphics, points, samples) {
  const units = canvas.scene?.grid?.units?.trim() ?? "";
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const cost = cumulativeCostAtPoint(samples, point);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.beginFill(0x111111, 0.95);
    graphics.drawCircle(point.x, point.y, 8);
    graphics.endFill();
    addCanvasLabel(point, `${formatDistance(cost)}${units ? ` ${units}` : ""}`);
  }
}

function cumulativeCostAtPoint(samples, point) {
  let nearest = samples[0];
  let nearestDistance = Infinity;
  for (const sample of samples) {
    const d = Math.hypot(sample.point.x - point.x, sample.point.y - point.y);
    if (d < nearestDistance) {
      nearest = sample;
      nearestDistance = d;
    }
  }
  return nearest.totalCost ?? 0;
}

function addCanvasLabel(point, text) {
  if (!overlay) return;
  const style = new PIXI.TextStyle({
    fontFamily: "Arial",
    fontSize: 14,
    fontWeight: "bold",
    fill: 0xffffff,
    stroke: 0x000000,
    strokeThickness: 4,
    align: "center"
  });
  const label = new PIXI.Text(text, style);
  label.anchor.set(0.5, 1);
  label.position.set(point.x, point.y - 12);
  overlay.addChild(label);
}


function getCombatantForToken(token) {
  const combat = game.combat;
  if (!combat?.started || !token?.document) return null;

  const sceneId = token.document.parent?.id ?? canvas.scene?.id;
  return combat.combatants.find(combatant => {
    const tokenId = combatant.tokenId ?? combatant.token?.id;
    const combatantSceneId = combatant.sceneId ?? combatant.token?.parent?.id ?? combat.scene?.id;
    return tokenId === token.document.id && (!combatantSceneId || combatantSceneId === sceneId);
  }) ?? null;
}

function getCombatMovementKey(combat, combatant) {
  return `${combat.id}:${combatant.id}`;
}

function getActiveTurnKey(combat, combatant) {
  if (combat.combatant?.id !== combatant.id) return null;
  return `${Number(combat.round ?? 0)}:${Number(combat.turn ?? -1)}`;
}

function getCombatMovementRecord(token) {
  const combat = game.combat;
  const combatant = getCombatantForToken(token);
  if (!combat || !combatant) return null;

  const key = getCombatMovementKey(combat, combatant);
  const activeTurnKey = getActiveTurnKey(combat, combatant);
  let record = combatMovementSpent.get(key);

  // Dès que ce combattant obtient un nouveau tour, son déplacement consommé
  // repart automatiquement à zéro. Les autres combattants conservent leur état
  // jusqu'à leur propre prochain tour.
  if (!record || (activeTurnKey && record.turnKey !== activeTurnKey)) {
    record = { spent: 0, turnKey: activeTurnKey };
    combatMovementSpent.set(key, record);
  }

  return record;
}

function getCombatMovementSpent(token) {
  return Number(getCombatMovementRecord(token)?.spent ?? 0);
}

function addCombatMovement(token, distance) {
  const amount = Number(distance);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const record = getCombatMovementRecord(token);
  if (!record) return;
  record.spent = Math.max(0, Number(record.spent ?? 0) + amount);
}

function getMovementAllowance(token) {
  const movement = token.actor?.system?.attributes?.movement;
  if (!movement) return 0;

  const activeMode = movement.hover && Number(movement.hover) > 0 ? "hover" : null;
  const values = [
    activeMode ? Number(movement[activeMode]) : 0,
    Number(movement.walk),
    Number(movement.fly),
    Number(movement.swim),
    Number(movement.climb),
    Number(movement.burrow)
  ].filter(value => Number.isFinite(value) && value > 0);

  return values.length ? Math.max(...values) : 0;
}

function ensureOverlay() {
  if (!canvas?.ready) return null;
  if (overlay && !overlay.destroyed) return overlay;

  overlay = new PIXI.Graphics();
  overlay.name = `${MODULE_ID}-overlay`;
  overlay.eventMode = "none";
  overlay.zIndex = 100000;

  // Le stage est stable sur Foundry V12 et utilise les mêmes coordonnées monde
  // que les tokens. Cela évite les conflits avec les groupes canvas ajoutés par
  // des modules comme Roofs.
  canvas.stage.sortableChildren = true;
  canvas.stage.addChild(overlay);
  return overlay;
}

function clearOverlay() {
  if (!overlay || overlay.destroyed) return;
  overlay.clear?.();
  for (const child of [...overlay.children]) child.destroy?.({ children: true });
  overlay.removeChildren();
}

function cleanupDragMeasurement() {
  dragState = null;
  clearOverlay();
  hideTooltip();
}

function getSourceToken() {
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 1) return controlled[0];

  const character = game.user?.character;
  if (!character) return null;

  const active = character.getActiveTokens?.(true, true) ?? [];
  return active.length === 1 ? active[0] : null;
}

function refreshTooltip() {
  if (dragState) return;
  if (!hoveredToken?.scene || !hoveredToken.visible) {
    hideTooltip();
    return;
  }

  const source = getSourceToken();
  if (!source || source === hoveredToken || !source.scene) {
    hideTooltip();
    return;
  }

  try {
    const origin = source.center;
    const destination = hoveredToken.center;
    const distance = canvas.grid.measurePath([origin, destination])?.distance;

    if (!Number.isFinite(distance)) {
      hideTooltip();
      return;
    }

    const units = canvas.scene?.grid?.units?.trim() ?? "";
    showTooltip(`${formatDistance(distance)}${units ? ` ${units}` : ""}`, hoveredToken);
  } catch (error) {
    console.error(`${MODULE_ID} | Erreur de mesure`, error);
    hideTooltip();
  }
}

function formatDistance(distance) {
  const rounded = Math.round(distance * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString(game.i18n?.lang ?? "fr", { maximumFractionDigits: 2 });
}

function ensureTooltip() {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);
  return tooltip;
}

function showTooltip(text, token = null, worldPosition = null) {
  const tooltip = ensureTooltip();
  tooltip.textContent = text;
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");

  const point = worldPosition ?? (token ? { x: token.center.x, y: token.bounds.top } : null);
  if (!point) return;
  const screenPoint = canvas.stage.worldTransform.apply(new PIXI.Point(point.x, point.y));

  tooltip.style.left = `${Math.round(screenPoint.x)}px`;
  tooltip.style.top = `${Math.round(screenPoint.y - 10)}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) return;
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}
