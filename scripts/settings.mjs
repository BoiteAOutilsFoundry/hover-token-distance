/** Enregistrement des réglages du monde et du client, ainsi que des raccourcis clavier. */
import {
  KEY_CANCEL,
  KEY_WAYPOINT,
  MODULE_ID,
  SETTING_DIFFICULT_TERRAIN,
  SETTING_LANGUAGE
} from "./shared/constants.mjs";
import { DEFAULT_LANGUAGE, translate } from "./i18n/localization.mjs";
import { movementState } from "./shared/state.mjs";
import { cancelCurrentDrag, placeWaypoint } from "./movement/drag-controller.mjs";
import { renderDragMeasurement } from "./movement/route-renderer.mjs";

/** Enregistre d'abord la langue, puis les réglages dont les libellés en dépendent. */
export function registerSettings() {
  registerLanguageSetting();
  game.settings.register(MODULE_ID, SETTING_DIFFICULT_TERRAIN, {
    name: translate("settings.difficultTerrain.name"),
    hint: translate("settings.difficultTerrain.hint"),
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    restricted: true,
    onChange: () => {
      if (movementState.dragState) renderDragMeasurement(movementState.dragState);
    }
  });
}

/**
 * Chaque client choisit sa langue sans changer celle du monde ni des autres joueurs.
 * Le rechargement réenregistre aussi les noms des raccourcis dans la bonne langue.
 */
function registerLanguageSetting() {
  game.settings.register(MODULE_ID, SETTING_LANGUAGE, {
    name: translate("settings.language.name"),
    hint: translate("settings.language.hint"),
    scope: "client",
    config: true,
    type: String,
    choices: {
      en: translate("settings.language.english"),
      fr: translate("settings.language.french")
    },
    default: DEFAULT_LANGUAGE,
    requiresReload: true
  });

  // La préférence sauvegardée n'est lisible qu'après register(). Actualiser
  // le réglage enregistré évite de garder son propre libellé en anglais après
  // un redémarrage avec le français sélectionné. settings est le registre public de Foundry.
  const setting = game.settings.settings.get(`${MODULE_ID}.${SETTING_LANGUAGE}`);
  setting.name = translate("settings.language.name");
  setting.hint = translate("settings.language.hint");
}

/**
 * Enregistre Y pour créer une étape et U pour annuler le déplacement.
 * Retourner false hors déplacement laisse Foundry et les autres modules
 * traiter ces touches ; true indique que notre raccourci les a utilisées.
 */
export function registerKeybindings() {
  game.keybindings.register(MODULE_ID, KEY_WAYPOINT, {
    name: translate("keybindings.waypoint.name"),
    hint: translate("keybindings.waypoint.hint"),
    editable: [{ key: "KeyY" }],
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0,
    onDown: () => {
      if (!movementState.dragState || movementState.dragState.cancelled) return false;
      placeWaypoint();
      return true;
    }
  });

  game.keybindings.register(MODULE_ID, KEY_CANCEL, {
    name: translate("keybindings.cancel.name"),
    hint: translate("keybindings.cancel.hint"),
    editable: [{ key: "KeyU" }],
    restricted: false,
    precedence: CONST.KEYBINDING_PRECEDENCE?.NORMAL ?? 0,
    onDown: () => {
      if (!movementState.dragState) return false;
      cancelCurrentDrag();
      return true;
    }
  });
}
