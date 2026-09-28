import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createToken, installFoundryEnvironment } from "./helpers/foundry.mjs";
import { buildCostSamples, centerToDocumentPosition, measureDistance } from "../scripts/movement/route-calculator.mjs";
import { addCombatMovement, clearCombatMovement, getCombatMovementSpent } from "../scripts/movement/combat-movement.mjs";
import { getMovementAllowance } from "../scripts/systems/movement-allowance.mjs";
import { moveTokenAlongAnchoredRoute } from "../scripts/movement/token-animation.mjs";
import { blockNextNativeTokenMove } from "../scripts/foundry/native-token-move.mjs";
import { registerSettings } from "../scripts/settings.mjs";

beforeEach(() => {
  installFoundryEnvironment();
  registerSettings();
});

test("le coût suit les virages du trajet et double seulement sur le terrain difficile", () => {
  const token = createToken();
  const obstacle = createToken({ id: "obstacle", x: 100 });
  canvas.tokens.placeables = [token, obstacle];
  const points = [{ x: 50, y: 50 }, { x: 250, y: 50 }, { x: 250, y: 150 }];
  const result = buildCostSamples(points, token).at(-1);
  assert.equal(result.totalDistance, 15);
  assert.equal(result.totalCost, 20);

  game.settings.get = () => false;
  assert.equal(buildCostSamples(points, token).at(-1).totalCost, 15);
});

test("les tokens cachés, invisibles ou à une autre élévation ne créent pas de surcoût", () => {
  const token = createToken();
  const points = [{ x: 50, y: 50 }, { x: 250, y: 50 }];
  for (const condition of ["hidden", "invisible", "elevated"]) {
    const obstacle = createToken({ id: "obstacle", x: 100 });
    obstacle.document.hidden = condition === "hidden";
    obstacle.visible = condition !== "invisible";
    obstacle.document.elevation = condition === "elevated" ? 10 : 0;
    canvas.tokens.placeables = [token, obstacle];
    assert.equal(buildCostSamples(points, token).at(-1).totalCost, 10, condition);
  }
});

test("la mesure utilise la grille Foundry et conserve son repli en pixels", () => {
  canvas.grid.measurePath = () => ({ distance: 7 });
  assert.equal(measureDistance({ x: 0, y: 0 }, { x: 100, y: 0 }), 7);
  canvas.grid.measurePath = () => { throw new Error("Grille indisponible"); };
  assert.equal(measureDistance({ x: 0, y: 0 }, { x: 100, y: 0 }), 5);
});

test("le centre d'un grand token est converti vers son coin supérieur gauche", () => {
  assert.deepEqual(centerToDocumentPosition({ x: 450, y: 350 }, { w: 200, h: 300 }), { x: 350, y: 200 });
});

test("le budget conserve la plus grande vitesse connue et accepte les acteurs sans vitesse", () => {
  assert.equal(getMovementAllowance({ actor: { system: { attributes: { movement: { walk: 6, fly: 12, swim: "9" } } } } }), 12);
  assert.equal(getMovementAllowance({}), 0);
});

test("le déplacement se cumule, persiste hors de son tour et repart à zéro au prochain tour", () => {
  const token = createToken();
  const combatant = { id: "combatant-1", tokenId: token.document.id, sceneId: canvas.scene.id };
  game.combat = {
    id: "combat-1", started: true, round: 1, turn: 0,
    combatant, combatants: [combatant]
  };
  clearCombatMovement(game.combat);
  addCombatMovement(token, 5);
  addCombatMovement(token, 3);
  addCombatMovement(token, -4);
  assert.equal(getCombatMovementSpent(token), 8);
  game.combat.combatant = { id: "other" };
  game.combat.turn = 1;
  assert.equal(getCombatMovementSpent(token), 8);
  game.combat.combatant = combatant;
  game.combat.round = 2;
  game.combat.turn = 0;
  assert.equal(getCombatMovementSpent(token), 0);
  addCombatMovement(token, 2);
  clearCombatMovement(game.combat);
  assert.equal(getCombatMovementSpent(token), 0);
});

test("aucun déplacement n'est mémorisé hors combat ou pour une autre scène", () => {
  const token = createToken();
  addCombatMovement(token, 5);
  assert.equal(getCombatMovementSpent(token), 0);
  game.combat = {
    id: "combat-2", started: true,
    combatants: [{ id: "combatant-2", tokenId: token.document.id, sceneId: "other-scene" }]
  };
  addCombatMovement(token, 5);
  assert.equal(getCombatMovementSpent(token), 0);
});

test("l'animation visite les étapes dans l'ordre et ignore les doublons", async () => {
  const token = createToken();
  await moveTokenAlongAnchoredRoute({
    token, originDocument: { x: 0, y: 0 },
    waypoints: [{ x: 100, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
    finalDocument: { x: 200, y: 100 }
  });
  assert.deepEqual(token.updates.map(update => update.change), [
    { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 100 }
  ]);
  assert.ok(token.updates.every(update => update.options.animate && update.options.animation.duration === 140));
});

test("le bloqueur ne refuse qu'une mise à jour de position du token et de l'utilisateur concernés", async () => {
  const token = createToken();
  const blocker = blockNextNativeTokenMove(token);
  assert.equal(Hooks.call("preUpdateToken", { id: "other" }, { x: 20 }, {}, game.user.id), true);
  assert.equal(Hooks.call("preUpdateToken", token.document, { rotation: 90 }, {}, game.user.id), true);
  assert.equal(Hooks.call("preUpdateToken", token.document, { x: 20 }, {}, "other-user"), true);
  assert.equal(Hooks.call("preUpdateToken", token.document, { x: 20 }, {}, game.user.id), false);
  await blocker.wait();
  assert.equal(Hooks.count("preUpdateToken"), 0);
  assert.equal(Hooks.call("preUpdateToken", token.document, { x: 20 }, {}, game.user.id), true);
});

test("annuler le bloqueur libère immédiatement le hook temporaire", async () => {
  const blocker = blockNextNativeTokenMove(createToken());
  blocker.cancel();
  blocker.cancel();
  await blocker.wait();
  assert.equal(Hooks.count("preUpdateToken"), 0);
});

test("le bloqueur expire si le dépôt ne déclenche aucune mise à jour", async () => {
  const blocker = blockNextNativeTokenMove(createToken());
  await blocker.wait();
  assert.equal(Hooks.count("preUpdateToken"), 0);
});

test("le segment suivant attend la position visuelle, même si le document est déjà à destination", async () => {
  const token = createToken();
  const frames = [];
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  token.document.update = async (change, options) => {
    token.updates.push({ change, options });
    Object.assign(token.document, change);
    // L'affichage ne suit pas encore : l'animation est contrôlée par ce scénario.
  };
  const movement = moveTokenAlongAnchoredRoute({
    token, originDocument: { x: 0, y: 0 },
    waypoints: [{ x: 100, y: 0 }], finalDocument: { x: 100, y: 100 }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(token.updates.length, 1);
  assert.equal(token.x, 0);
  token.position.set(100, 0);
  frames.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(token.updates.length, 2);
  token.position.set(100, 100);
  frames.shift()();
  await movement;
});
