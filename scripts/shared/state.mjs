/**
 * Seul état commun au survol et au glisser-déposer.
 * Il permet aux deux fonctionnalités de se partager l'infobulle : le trajet
 * est prioritaire pendant un déplacement. main.mjs le nettoie à la fin d'une scène.
 * Le dessin, le raccordement à Foundry et le combat gardent leur état dans
 * leurs fichiers respectifs : ils n'ont pas besoin d'être modifiés ici.
 */
export const hoverState = { hoveredToken: null };

/**
 * @typedef {object} Point
 * @property {number} x Position horizontale en pixels de la scène.
 * @property {number} y Position verticale en pixels de la scène.
 */

/**
 * @typedef {object} DragState
 * @property {object} token Token réel, distinct du clone de prévisualisation.
 * @property {Point} origin Centre du token au début du déplacement.
 * @property {Point} originDocument Coin supérieur gauche enregistré par Foundry.
 * @property {Point} destination Centre actuel du clone de prévisualisation.
 * @property {Point[]} waypoints Centres des étapes fixées par le joueur.
 * @property {boolean} cancelled Empêche de mesurer ou valider un trajet annulé.
 * @property {object|null} interactionManager Gestionnaire Foundry qui peut annuler le drag.
 * @property {object} lastEvent Dernier événement souris, utilisé lors de l'annulation.
 * @property {object|null} interactionData Données de prévisualisation fournies par Foundry.
 */

/** @type {{dragState: DragState|null}} */
export const movementState = {
  dragState: null
};
