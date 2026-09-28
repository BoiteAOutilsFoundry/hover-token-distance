/**
 * Dessin du trajet et des étapes sur une couche PIXI dédiée.
 * Le contrôleur fournit l'état à afficher ; ce fichier ne déplace aucun token.
 */
import { MODULE_ID } from "../shared/constants.mjs";
import { formatDistanceLabel, showTooltip } from "../ui/tooltip.mjs";
import { translate } from "../i18n/localization.mjs";
import { getMovementAllowance } from "../systems/movement-allowance.mjs";
import { buildCostSamples } from "./route-calculator.mjs";
import { getCombatMovementSpent } from "./combat-movement.mjs";

let overlay = null;
const ROUTE_COLORS = { normal: 0x35c759, dash: 0xffcc00, exceeded: 0xff3b30 };

/**
 * Recalcule le coût et les seuils restants, puis remplace le dessin précédent.
 * @param {import("../shared/state.mjs").DragState|null} state Trajet en cours.
 */
export function renderDragMeasurement(state) {
  if (!state || state.cancelled || !canvas?.ready) return;
  const graphics = ensureOverlay();
  if (!graphics) return;
  clearOverlay();

  const points = [state.origin, ...state.waypoints, state.destination];
  const movement = getMovementAllowance(state.token);
  const dashLimit = movement > 0 ? movement * 2 : Infinity;
  const spentMovement = getCombatMovementSpent(state.token);
  // Infinity garde le trajet vert lorsque le système ne fournit aucune vitesse.
  const remainingNormal = movement > 0 ? Math.max(0, movement - spentMovement) : Infinity;
  const remainingDash = Number.isFinite(dashLimit) ? Math.max(0, dashLimit - spentMovement) : Infinity;
  const samples = buildCostSamples(points, state.token);

  drawColoredSamples(graphics, samples, remainingNormal, remainingDash);
  drawWaypointMarkers(graphics, points, samples);

  const total = samples.at(-1)?.totalCost ?? 0;
  const raw = samples.at(-1)?.totalDistance ?? 0;
  const units = canvas.scene?.grid?.units?.trim() ?? "";
  const distance = formatDistanceLabel(total, units);
  const label = total > raw + 0.001
    ? translate("distance.difficultTerrain", { distance })
    : distance;
  showTooltip(label, null, state.destination);
}

/** Découpe un segment aux seuils de vitesse pour placer précisément les couleurs. */
function drawColoredSamples(graphics, samples, normalRemaining, dashRemaining) {
  if (samples.length < 2) return;

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
      const color = fromCost < normalRemaining
        ? ROUTE_COLORS.normal
        : fromCost < dashRemaining ? ROUTE_COLORS.dash : ROUTE_COLORS.exceeded;
      const bandWidth = Math.max(14, (canvas.grid?.size ?? 100) * 0.24);
      graphics.lineStyle(bandWidth, color, 0.45);
      graphics.moveTo(fromPoint.x, fromPoint.y);
      graphics.lineTo(toPoint.x, toPoint.y);
      fromPoint = toPoint;
      fromCost = boundary;
    }
  }
}

/** Dessine un repère et le coût cumulé à chaque étape, sans étiqueter les extrémités. */
function drawWaypointMarkers(graphics, points, samples) {
  const units = canvas.scene?.grid?.units?.trim() ?? "";
  for (let i = 1; i < points.length - 1; i++) {
    const point = points[i];
    const cost = cumulativeCostAtPoint(samples, point);
    graphics.lineStyle(2, 0xffffff, 1);
    graphics.beginFill(0x111111, 0.95);
    graphics.drawCircle(point.x, point.y, 8);
    graphics.endFill();
    addCanvasLabel(point, formatDistanceLabel(cost, units));
  }
}

/** Retrouve le coût du point échantillonné le plus proche de l'étape. */
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

/** Ajoute une étiquette lisible au-dessus de l'étape, dans les coordonnées de la scène. */
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

/** Crée au besoin le dessin de la scène courante, sans intercepter les événements souris. */
export function ensureOverlay() {
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

/** Efface les traits et détruit les anciennes étiquettes pour libérer leurs ressources. */
export function clearOverlay() {
  if (!overlay || overlay.destroyed) return;
  overlay.clear?.();
  for (const child of [...overlay.children]) child.destroy?.({ children: true });
  overlay.removeChildren();
}

/** Retire la couche à la fermeture d'une scène ; la suivante en créera une nouvelle. */
export function destroyOverlay() {
  if (overlay && !overlay.destroyed) overlay.destroy({ children: true });
  overlay = null;
}
