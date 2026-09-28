/**
 * Point d’entrée unique du module.
 * Son rôle est volontairement limité à l’initialisation et au raccordement
 * des hooks Foundry ; toute la logique métier vit dans les autres fichiers.
 */
import { MODULE_ID } from "./shared/constants.mjs";
import { translate } from "./i18n/localization.mjs";
import { movementState } from "./shared/state.mjs";
import { ensureTooltip } from "./ui/tooltip.mjs";
import { cleanupHoverDistance, refreshTooltip, registerHoverDistanceHooks } from "./hover/token-distance.mjs";
import { registerKeybindings, registerSettings } from "./settings.mjs";
import { installInteractionTracking } from "./foundry/drag-interactions.mjs";
import { clearCombatMovement } from "./movement/combat-movement.mjs";
import { cleanupDragMeasurement } from "./movement/drag-controller.mjs";
import { destroyOverlay, ensureOverlay, renderDragMeasurement } from "./movement/route-renderer.mjs";

// Les réglages et raccourcis doivent être déclarés pendant l'initialisation.
Hooks.once("init", () => {
  registerSettings();
  registerKeybindings();
  registerHoverDistanceHooks();
});

// Le DOM et les données de jeu sont prêts ; le canvas peut encore être absent.
Hooks.once("ready", () => {
  ensureTooltip();
  console.log(`${MODULE_ID} | ${translate("logs.ready")}`);
});

// Ce hook revient à chaque scène. L'installation des interactions est idempotente.
Hooks.on("canvasReady", () => {
  installInteractionTracking();
  ensureOverlay();
});

// Un changement de scène conserve les compteurs ; supprimer le combat les efface.
Hooks.on("deleteCombat", combat => clearCombatMovement(combat));

// Replacer l'infobulle HTML après un déplacement ou un zoom de la caméra.
Hooks.on("canvasPan", () => {
  if (movementState.dragState) renderDragMeasurement(movementState.dragState);
  else refreshTooltip();
});

// Libérer les références aux tokens et les objets PIXI de la scène précédente.
Hooks.on("canvasTearDown", () => {
  cleanupHoverDistance();
  cleanupDragMeasurement();
  destroyOverlay();
});
