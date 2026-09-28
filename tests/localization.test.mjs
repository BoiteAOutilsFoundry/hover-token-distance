import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import english from "../scripts/i18n/en.mjs";
import french from "../scripts/i18n/fr.mjs";
import { getLanguage, translate } from "../scripts/i18n/localization.mjs";
import { MODULE_ID, SETTING_LANGUAGE, TOOLTIP_ID } from "../scripts/shared/constants.mjs";
import { registerKeybindings, registerSettings } from "../scripts/settings.mjs";
import { formatDistance, formatDistanceLabel } from "../scripts/ui/tooltip.mjs";
import { beginDragMeasurement, cancelCurrentDrag, cleanupDragMeasurement } from "../scripts/movement/drag-controller.mjs";
import { destroyOverlay, ensureOverlay, renderDragMeasurement } from "../scripts/movement/route-renderer.mjs";
import { createToken, installFoundryEnvironment } from "./helpers/foundry.mjs";

beforeEach(() => installFoundryEnvironment());
afterEach(() => {
  cleanupDragMeasurement();
  destroyOverlay();
});

test("les dictionnaires contiennent les mêmes textes et paramètres", () => {
  assert.deepEqual(Object.keys(french).sort(), Object.keys(english).sort());
  const parameters = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const key of Object.keys(english)) {
    assert.ok(english[key].trim(), key);
    assert.ok(french[key].trim(), key);
    assert.deepEqual(parameters(french[key]), parameters(english[key]), key);
  }
});

test("l'anglais est utilisé par défaut même lorsque Foundry est en français", () => {
  assert.equal(game.i18n.lang, "fr");
  assert.equal(getLanguage(), "en", "repli avant l'enregistrement du réglage");
  registerSettings();
  registerKeybindings();
  const setting = game.settings.settings.get(`${MODULE_ID}.${SETTING_LANGUAGE}`);
  assert.equal(setting.default, "en");
  assert.equal(setting.scope, "client");
  assert.equal(setting.requiresReload, true);
  assert.deepEqual(setting.choices, { en: "English", fr: "Français" });
  assert.equal(setting.name, "Module language");
  assert.equal(translate("notifications.movementCancelled"), "Movement cancelled.");
  assert.equal(formatDistance(1.25), "1.25");
});

test("le français sauvegardé traduit tous les paramètres et raccourcis dès l'initialisation", async () => {
  registerSettings();
  await game.settings.set(MODULE_ID, SETTING_LANGUAGE, "fr");
  const saved = new Map([[`${MODULE_ID}.${SETTING_LANGUAGE}`, game.settings.get(MODULE_ID, SETTING_LANGUAGE)]]);
  const environment = installFoundryEnvironment({ settingsValues: saved });
  game.i18n.lang = "en";
  registerSettings();
  registerKeybindings();
  assert.equal(getLanguage(), "fr");
  assert.equal(game.i18n.lang, "en", "la langue globale reste indépendante");
  const language = environment.settings.get(`${MODULE_ID}.language`);
  assert.equal(language.name, french["settings.language.name"]);
  assert.equal(language.hint, french["settings.language.hint"]);
  const terrain = environment.settings.get(`${MODULE_ID}.tokensAreDifficultTerrain`);
  assert.equal(terrain.name, french["settings.difficultTerrain.name"]);
  assert.equal(terrain.hint, french["settings.difficultTerrain.hint"]);
  for (const [action, key] of [["placeWaypoint", "waypoint"], ["cancelDrag", "cancel"]]) {
    const binding = environment.keybindings.get(`${MODULE_ID}.${action}`);
    assert.equal(binding.name, french[`keybindings.${key}.name`]);
    assert.equal(binding.hint, french[`keybindings.${key}.hint`]);
  }
  assert.equal(formatDistanceLabel(1.25, "ft"), "1,25 ft");
  assert.equal(formatDistanceLabel(1.25), "1,25");
  await game.settings.set(MODULE_ID, SETTING_LANGUAGE, "en");
  assert.equal(formatDistanceLabel(1.25, "ft"), "1.25 ft");
});

test("l'infobulle de terrain difficile, les étapes et la notification suivent la langue du module", async () => {
  registerSettings();
  const token = createToken();
  canvas.tokens.placeables = [token, createToken({ id: "obstacle", x: 100 })];
  const messages = [];
  ui.notifications.info = message => messages.push(message);
  const state = {
    token, origin: token.center, waypoints: [{ x: 75, y: 50 }], destination: { x: 250, y: 50 }
  };
  for (const [language, label, waypoint, notification] of [
    ["en", "15 m · difficult terrain", "1.25 m", "Movement cancelled."],
    ["fr", "15 m · terrain difficile", "1,25 m", "Déplacement annulé."]
  ]) {
    await game.settings.set(MODULE_ID, SETTING_LANGUAGE, language);
    renderDragMeasurement(state);
    assert.equal(document.getElementById(TOOLTIP_ID).textContent, label);
    assert.equal(ensureOverlay().children[0].text, waypoint);
    beginDragMeasurement(token, {}, { destination: { x: 100, y: 0 } });
    cancelCurrentDrag();
    assert.equal(messages.at(-1), notification);
  }
});

test("une préférence inconnue revient à l'anglais et les paramètres restent du texte", () => {
  installFoundryEnvironment({ settingsValues: new Map([[`${MODULE_ID}.${SETTING_LANGUAGE}`, "de"]]) });
  registerSettings();
  assert.equal(getLanguage(), "en");
  assert.equal(translate("notifications.movementCancelled"), "Movement cancelled.");
  assert.equal(translate("unknown.key"), "unknown.key");
  assert.equal(translate("toString"), "toString");
  assert.equal(translate("distance.withUnits", { distance: "$&", units: "<m>" }), "$& <m>");
});
