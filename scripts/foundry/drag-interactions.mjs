/**
 * Raccordement du glisser-déposer à MouseInteractionManager de Foundry V12.
 * Toute adaptation à une autre version de cette API commence dans ce fichier.
 * @see https://foundryvtt.com/api/v12/classes/client.MouseInteractionManager.html
 */
import { MODULE_ID } from "../shared/constants.mjs";
import { translate } from "../i18n/localization.mjs";
import {
  beginDragMeasurement,
  cleanupDragMeasurement,
  handleDragDrop,
  updateDragMeasurement
} from "../movement/drag-controller.mjs";

let interactionPatched = false;
const DRAG_ACTIONS = new Set(["dragLeftStart", "dragLeftMove", "dragLeftDrop", "dragLeftCancel"]);

/**
 * Entoure le callback existant une seule fois pour la session.
 * Le prototype est partagé par les gestionnaires des scènes successives ;
 * le modifier à chaque canvasReady multiplierait les mesures et les mises à jour.
 */
export function installInteractionTracking() {
  if (interactionPatched) return;

  const manager = canvas?.tokens?.placeables?.find(token => token.mouseInteractionManager)?.mouseInteractionManager
    ?? canvas?.mouseInteractionManager;
  const proto = manager?.constructor?.prototype;
  if (!proto || typeof proto.callback !== "function") {
    console.error(`${MODULE_ID} | ${translate("logs.interactionMissing")}`);
    return;
  }

  const original = proto.callback;
  proto.callback = function(action, event, ...args) {
    const target = this.target;
    const isToken = target?.document?.documentName === "Token";
    const runNative = () => original.call(this, action, event, ...args);

    // Les clics, le bouton droit et les objets autres que les tokens restent
    // entièrement gérés par le callback installé avant notre module.
    if (!isToken || !DRAG_ACTIONS.has(action)) return runNative();

    if (action === "dragLeftDrop") return handleDragDrop(runNative);

    if (action === "dragLeftCancel") {
      try {
        return runNative();
      } finally {
        cleanupDragMeasurement();
      }
    }

    // Foundry doit d'abord créer ou déplacer son clone de prévisualisation.
    // On lit ensuite sa position, en conservant la valeur de retour native.
    const result = runNative();
    try {
      if (action === "dragLeftStart") beginDragMeasurement(target, event, this.interactionData);
      else updateDragMeasurement(target, event, this.interactionData);
    } catch (error) {
      console.error(`${MODULE_ID} | ${translate("errors.dragMeasurement")}`, error);
    }
    return result;
  };

  interactionPatched = true;
  console.log(`${MODULE_ID} | ${translate("logs.interactionConnected")}`);
}
