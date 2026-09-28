/** Infobulle HTML commune au survol et au déplacement, placée au-dessus du canvas. */
import { TOOLTIP_ID } from "../shared/constants.mjs";
import { getLanguage, translate } from "../i18n/localization.mjs";

/** Arrondit à deux décimales et utilise la langue choisie pour ce module. */
export function formatDistance(distance) {
  const rounded = Math.round(distance * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toLocaleString(getLanguage(), { maximumFractionDigits: 2 });
}

/** Formate la mesure ; les unités viennent de la scène et ne sont pas traduites. */
export function formatDistanceLabel(distance, units = "") {
  return translate(units ? "distance.withUnits" : "distance.value", {
    distance: formatDistance(distance), units
  });
}

/** Crée une seule infobulle pour toute la session, réutilisée entre les scènes. */
export function ensureTooltip() {
  let tooltip = document.getElementById(TOOLTIP_ID);
  if (tooltip) return tooltip;

  tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.setAttribute("aria-hidden", "true");
  document.body.appendChild(tooltip);
  return tooltip;
}

/**
 * Affiche du texte au-dessus d'un token ou d'un point de la scène.
 * Le tracé PIXI utilise les pixels de la scène ; le HTML utilise les pixels
 * de l'écran. La transformation du stage tient compte du zoom et de la caméra.
 */
export function showTooltip(text, token = null, worldPosition = null) {
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

/** Masque l'infobulle sans retirer son élément HTML, afin de le réutiliser. */
export function hideTooltip() {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) return;
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}
