import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createToken, installFoundryEnvironment } from "./helpers/foundry.mjs";
import { MODULE_ID, TOOLTIP_ID } from "../scripts/shared/constants.mjs";
import { addCombatMovement, getCombatMovementSpent } from "../scripts/movement/combat-movement.mjs";
import { beginDragMeasurement, cleanupDragMeasurement } from "../scripts/movement/drag-controller.mjs";
import { ensureOverlay, renderDragMeasurement } from "../scripts/movement/route-renderer.mjs";
import { movementState } from "../scripts/shared/state.mjs";

test("le manifeste charge le module, ses hooks et ses ressources sur deux scènes successives", async () => {
  const environment = installFoundryEnvironment();
  canvas.mouseInteractionManager = new class {
    callback() { return true; }
  }();
  const manifest = JSON.parse(await readFile(new URL("../module.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.esmodules, ["scripts/main.mjs"]);
  for (const entry of manifest.esmodules) await import(new URL(`../${entry}`, import.meta.url));
  await import("../scripts/token-mouvement.mjs");
  assert.equal(Hooks.count("init"), 1, "l'ancien chemin ne doit pas doubler l'initialisation");
  assert.equal(Hooks.count("canvasReady"), 1);

  Hooks.callAll("init");
  Hooks.callAll("ready");
  Hooks.callAll("canvasReady");
  Hooks.callAll("canvasReady");
  assert.equal(environment.settings.size, 2);
  assert.equal(environment.keybindings.size, 2);
  assert.equal(environment.settings.get(`${MODULE_ID}.tokensAreDifficultTerrain`).default, true);
  assert.equal(environment.settings.get(`${MODULE_ID}.language`).default, "en");
  const tooltip = document.getElementById(TOOLTIP_ID);
  assert.ok(tooltip);
  assert.equal(environment.elements.size, 1);

  // Survol, mouvement de caméra et personnage assigné au joueur.
  const source = createToken();
  const target = createToken({ id: "target", x: 200 });
  canvas.tokens.controlled = [source];
  Hooks.callAll("hoverToken", target, true);
  assert.equal(tooltip.textContent, "10 m");
  assert.equal(tooltip.style.left, "250px");
  canvas.stage.worldTransform.apply = point => ({ x: point.x + 10, y: point.y + 20 });
  Hooks.callAll("canvasPan");
  assert.equal(tooltip.style.left, "260px");
  canvas.tokens.controlled = [];
  game.user.character = { getActiveTokens: () => [source] };
  Hooks.callAll("controlToken");
  assert.equal(tooltip.classList.contains("visible"), true);
  game.user.character = null;
  Hooks.callAll("controlToken");
  assert.equal(tooltip.classList.contains("visible"), false);

  // Le déplacement utilise la même infobulle et reste prioritaire sur le survol.
  canvas.tokens.controlled = [source];
  beginDragMeasurement(source, {}, { clones: [{ _original: source, center: { x: 150, y: 50 } }] });
  Hooks.callAll("hoverToken", target, true);
  assert.equal(tooltip.textContent, "5 m");
  cleanupDragMeasurement();

  // Les seuils normaux et de sprint tiennent compte du mouvement déjà consommé.
  source.actor = { system: { attributes: { movement: { walk: 5 } } } };
  const combatant = { id: "fighter", tokenId: source.document.id, sceneId: canvas.scene.id };
  game.combat = { id: "combat", started: true, round: 1, turn: 0, combatant, combatants: [combatant] };
  addCombatMovement(source, 2);
  const state = { token: source, origin: source.center, destination: { x: 350, y: 50 }, waypoints: [] };
  renderDragMeasurement(state);
  const overlay = ensureOverlay();
  assert.deepEqual([...new Set(overlay.strokes.map(stroke => stroke.color))], [0x35c759, 0xffcc00, 0xff3b30]);
  assert.equal(overlay.strokes.find(stroke => stroke.color === 0xffcc00).from.x, 110);
  assert.equal(overlay.strokes.find(stroke => stroke.color === 0xff3b30).from.x, 210);
  source.actor = null;
  renderDragMeasurement(state);
  assert.deepEqual([...new Set(overlay.strokes.map(stroke => stroke.color))], [0x35c759]);

  // Le changement de scène détruit le dessin, mais conserve les compteurs du combat.
  Hooks.callAll("canvasTearDown");
  assert.equal(overlay.destroyed, true);
  assert.equal(movementState.dragState, null);
  assert.equal(tooltip.classList.contains("visible"), false);
  assert.equal(getCombatMovementSpent(source), 2);
  Hooks.callAll("canvasReady");
  assert.notEqual(ensureOverlay(), overlay);
  assert.equal(document.getElementById(TOOLTIP_ID), tooltip);
  Hooks.callAll("deleteCombat", game.combat);
  assert.equal(getCombatMovementSpent(source), 0);
  Hooks.callAll("canvasTearDown");
});
