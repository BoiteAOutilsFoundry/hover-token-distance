import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { createToken, installFoundryEnvironment } from "./helpers/foundry.mjs";
import { installInteractionTracking } from "../scripts/foundry/drag-interactions.mjs";
import { cleanupDragMeasurement, placeWaypoint } from "../scripts/movement/drag-controller.mjs";
import { clearCombatMovement, getCombatMovementSpent } from "../scripts/movement/combat-movement.mjs";
import { destroyOverlay, ensureOverlay } from "../scripts/movement/route-renderer.mjs";
import { MODULE_ID, TOOLTIP_ID } from "../scripts/shared/constants.mjs";
import { movementState } from "../scripts/shared/state.mjs";
import { registerKeybindings, registerSettings } from "../scripts/settings.mjs";

// Le callback reste synchrone par défaut, comme celui de Foundry V12.
// Chaque scénario fournit uniquement la réaction native dont il a besoin.
class InteractionManager {
  isDragging = true;
  calls = [];
  handler = () => true;
  constructor(target) { this.target = target; }
  callback(action, event, ...args) {
    this.calls.push({ action, event, args });
    return this.handler(action, event, ...args);
  }
  cancel(event) {
    this.isDragging = false;
    this.callback("dragLeftCancel", event);
  }
}

let environment;
beforeEach(() => {
  environment = installFoundryEnvironment();
  canvas.mouseInteractionManager = new InteractionManager({});
  installInteractionTracking();
  registerSettings();
  registerKeybindings();
});

afterEach(() => {
  if (game.combat) clearCombatMovement(game.combat);
  cleanupDragMeasurement();
  destroyOverlay();
});

/** Prépare un token, son clone et un combat pour vérifier aussi la consommation. */
function prepareDrag(options = {}) {
  const token = createToken(options);
  const preview = { _original: token, center: token.center };
  const manager = new InteractionManager(token);
  token.mouseInteractionManager = manager;
  manager.interactionData = { clones: [preview] };
  canvas.tokens.placeables = [token];
  const combatant = { id: "fighter", tokenId: token.document.id, sceneId: canvas.scene.id };
  game.combat = { id: "combat", started: true, round: 1, turn: 0, combatant, combatants: [combatant] };
  return { token, preview, manager };
}

test("le raccordement est unique et transmet les autres interactions sans modification", () => {
  const callback = InteractionManager.prototype.callback;
  installInteractionTracking();
  assert.equal(InteractionManager.prototype.callback, callback);
  const manager = new InteractionManager({ document: { documentName: "Drawing" } });
  const event = {};
  const result = { accepted: true };
  manager.handler = () => result;
  assert.equal(manager.callback("dragLeftDrop", event, "extra"), result);
  assert.deepEqual(manager.calls, [{ action: "dragLeftDrop", event, args: ["extra"] }]);
  assert.equal(Hooks.count("preUpdateToken"), 0);
});

test("les raccourcis laissent passer les touches hors déplacement et les tokens non possédés", () => {
  assert.equal(environment.keybindings.get(`${MODULE_ID}.placeWaypoint`).onDown(), false);
  assert.equal(environment.keybindings.get(`${MODULE_ID}.cancelDrag`).onDown(), false);
  const { token, manager } = prepareDrag();
  token.isOwner = false;
  assert.equal(manager.callback("dragLeftStart", {}), true);
  assert.equal(movementState.dragState, null);
});

test("sans étape, le dépôt natif déplace le token et son coût est ajouté une seule fois", async () => {
  const { token, preview, manager } = prepareDrag();
  manager.callback("dragLeftStart", {});
  preview.center = { x: 150, y: 50 };
  manager.callback("dragLeftMove", {});
  manager.handler = () => token.document.update({ x: 100, y: 0 }).then(() => "native-result");
  assert.equal(await manager.callback("dragLeftDrop", {}), "native-result");
  assert.equal(token.updates.length, 1);
  assert.deepEqual(token.updates[0].change, { x: 100, y: 0 });
  assert.equal(getCombatMovementSpent(token), 5);
  assert.equal(movementState.dragState, null);
  assert.equal(Hooks.count("preUpdateToken"), 0);
});

test("avec étapes, un grand token passe par chaque ancrage sans saut natif ni décalage", async () => {
  const { token, preview, manager } = prepareDrag({ w: 200, h: 300 });
  manager.callback("dragLeftStart", {});
  preview.center = { x: 200, y: 150 };
  manager.callback("dragLeftMove", {});
  const waypoint = environment.keybindings.get(`${MODULE_ID}.placeWaypoint`);
  assert.equal(waypoint.onDown(), true);
  waypoint.onDown();
  assert.equal(ensureOverlay().children.length, 1, "pas de doublon lors d'un second appui");
  preview.center = { x: 200, y: 250 };
  manager.callback("dragLeftMove", {});
  manager.handler = () => token.document.update({ x: 100, y: 100 }).then(() => true);
  assert.equal(await manager.callback("dragLeftDrop", {}), true);
  assert.deepEqual(token.updates.map(update => update.change), [{ x: 100, y: 0 }, { x: 100, y: 100 }]);
  assert.equal(getCombatMovementSpent(token), 10);
  assert.equal(Hooks.count("preUpdateToken"), 0);
  assert.equal(ensureOverlay().children.length, 0);
});

test("un dépôt synchrone garde son résultat booléen pendant que les étapes se terminent", async () => {
  const { token, preview, manager } = prepareDrag();
  manager.callback("dragLeftStart", {});
  preview.center = { x: 150, y: 50 };
  manager.callback("dragLeftMove", {});
  placeWaypoint();
  preview.center = { x: 150, y: 150 };
  manager.callback("dragLeftMove", {});
  manager.handler = () => {
    void token.document.update({ x: 100, y: 100 });
    return true;
  };
  assert.equal(manager.callback("dragLeftDrop", {}), true);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(token.updates.map(update => update.change), [{ x: 100, y: 0 }, { x: 100, y: 100 }]);
  assert.equal(getCombatMovementSpent(token), 10);
});

test("U annule le drag via Foundry et nettoie l'affichage sans consommer de mouvement", () => {
  const { token, preview, manager } = prepareDrag();
  manager.callback("dragLeftStart", {});
  preview.center = { x: 150, y: 50 };
  const event = {};
  manager.callback("dragLeftMove", event);
  placeWaypoint();
  assert.equal(environment.keybindings.get(`${MODULE_ID}.cancelDrag`).onDown(), true);
  assert.equal(manager.calls.at(-1).action, "dragLeftCancel");
  assert.equal(manager.calls.at(-1).event, event);
  assert.equal(movementState.dragState, null);
  assert.equal(token.updates.length, 0);
  assert.equal(getCombatMovementSpent(token), 0);
  assert.equal(ensureOverlay().strokes.length, 0);
  assert.equal(document.getElementById(TOOLTIP_ID).classList.contains("visible"), false);
});

test("une erreur native synchrone ou asynchrone libère le bloqueur et reste propagée", async () => {
  for (const asynchronous of [false, true]) {
    const { token, preview, manager } = prepareDrag();
    manager.callback("dragLeftStart", {});
    preview.center = { x: 150, y: 50 };
    manager.callback("dragLeftMove", {});
    placeWaypoint();
    const error = new Error("Échec du dépôt natif");
    manager.handler = () => {
      if (asynchronous) return Promise.reject(error);
      throw error;
    };
    if (asynchronous) await assert.rejects(manager.callback("dragLeftDrop", {}), error);
    else assert.throws(() => manager.callback("dragLeftDrop", {}), error);
    assert.equal(Hooks.count("preUpdateToken"), 0);
    assert.equal(movementState.dragState, null);
    assert.equal(getCombatMovementSpent(token), 0);
  }
});

test("le centre du bon clone est lu dans une liste, une Map ou un objet", () => {
  const { token, manager } = prepareDrag();
  const preview = { _original: token, center: { x: 150, y: 50 } };
  const other = { center: { x: 999, y: 999 } };
  for (const clones of [[other, preview], new Map([["other", other], ["token", preview]]), { other, preview }]) {
    manager.interactionData = { clones };
    manager.callback("dragLeftStart", {});
    assert.equal(document.getElementById(TOOLTIP_ID).textContent, "5 m");
    cleanupDragMeasurement();
  }
});
