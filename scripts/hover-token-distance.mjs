const MODULE_ID = "hover-token-distance";
const TOOLTIP_ID = `${MODULE_ID}-tooltip`;

let hoveredToken = null;

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | Module chargé`);
  ensureTooltip();
});

Hooks.on("hoverToken", (token, hovered) => {
  if (!canvas?.ready) return;

  if (!hovered) {
    if (hoveredToken === token) hoveredToken = null;
    hideTooltip();
    return;
  }

  hoveredToken = token;
  refreshTooltip();
});

// Recalcule l'affichage lorsque le token source change ou se déplace.
Hooks.on("controlToken", () => refreshTooltip());
Hooks.on("updateToken", () => refreshTooltip());
Hooks.on("canvasPan", () => refreshTooltip());
Hooks.on("canvasTearDown", () => {
  hoveredToken = null;
  hideTooltip();
});

function getSourceToken() {
  // Priorité au token actuellement sélectionné par le joueur.
  const controlled = canvas.tokens?.controlled ?? [];
  if (controlled.length === 1) return controlled[0];

  // Secours : token actif associé au personnage assigné à l'utilisateur.
  const character = game.user?.character;
  if (!character) return null;

  const active = character.getActiveTokens?.(true, true) ?? [];
  return active.length === 1 ? active[0] : null;
}

function refreshTooltip() {
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
    const measurement = canvas.grid.measurePath([origin, destination]);
    const distance = measurement?.distance;

    if (!Number.isFinite(distance)) {
      hideTooltip();
      return;
    }

    const units = canvas.scene?.grid?.units?.trim() ?? "";
    const formatted = formatDistance(distance);
    showTooltip(`${formatted}${units ? ` ${units}` : ""}`, hoveredToken);
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

function showTooltip(text, token) {
  const tooltip = ensureTooltip();
  tooltip.textContent = text;
  tooltip.classList.add("visible");
  tooltip.setAttribute("aria-hidden", "false");

  // Conversion des coordonnées de scène vers les coordonnées de l'écran.
  const worldPoint = new PIXI.Point(token.center.x, token.bounds.top);
  const screenPoint = canvas.stage.worldTransform.apply(worldPoint);

  tooltip.style.left = `${Math.round(screenPoint.x)}px`;
  tooltip.style.top = `${Math.round(screenPoint.y - 10)}px`;
}

function hideTooltip() {
  const tooltip = document.getElementById(TOOLTIP_ID);
  if (!tooltip) return;
  tooltip.classList.remove("visible");
  tooltip.setAttribute("aria-hidden", "true");
}
