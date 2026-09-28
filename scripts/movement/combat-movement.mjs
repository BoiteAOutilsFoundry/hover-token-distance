/**
 * Distance consommée par combattant, dans ce client uniquement.
 * Ce cache reste disponible lors d'un changement de scène, mais disparaît
 * au rechargement de la page ou à la suppression du combat concerné.
 */
const combatMovementSpent = new Map();

/** Associe un token à un combattant du combat actif, en vérifiant aussi sa scène. */
function getCombatantForToken(token) {
  const combat = game.combat;
  if (!combat?.started || !token?.document) return null;

  const sceneId = token.document.parent?.id ?? canvas.scene?.id;
  return combat.combatants.find(combatant => {
    const tokenId = combatant.tokenId ?? combatant.token?.id;
    const combatantSceneId = combatant.sceneId ?? combatant.token?.parent?.id ?? combat.scene?.id;
    return tokenId === token.document.id && (!combatantSceneId || combatantSceneId === sceneId);
  }) ?? null;
}

/** Deux combats différents peuvent contenir le même acteur : leur suivi reste séparé. */
function getCombatMovementKey(combat, combatant) {
  return `${combat.id}:${combatant.id}`;
}

/** Un combattant inactif conserve son compteur jusqu'à son propre prochain tour. */
function getActiveTurnKey(combat, combatant) {
  if (combat.combatant?.id !== combatant.id) return null;
  return `${Number(combat.round ?? 0)}:${Number(combat.turn ?? -1)}`;
}

/** Initialise le compteur, ou le réinitialise à la première lecture d'un nouveau tour. */
function getCombatMovementRecord(token) {
  const combat = game.combat;
  const combatant = getCombatantForToken(token);
  if (!combat || !combatant) return null;

  const key = getCombatMovementKey(combat, combatant);
  const activeTurnKey = getActiveTurnKey(combat, combatant);
  let record = combatMovementSpent.get(key);

  // Dès que ce combattant obtient un nouveau tour, son déplacement consommé
  // repart automatiquement à zéro. Les autres combattants conservent leur état
  // jusqu'à leur propre prochain tour.
  if (!record || (activeTurnKey && record.turnKey !== activeTurnKey)) {
    record = { spent: 0, turnKey: activeTurnKey };
    combatMovementSpent.set(key, record);
  }

  return record;
}

/** Renvoie zéro hors combat ; la distance est exprimée dans les unités de la scène. */
export function getCombatMovementSpent(token) {
  return Number(getCombatMovementRecord(token)?.spent ?? 0);
}

/** Comptabilise le coût d'un trajet terminé, en ignorant les valeurs invalides. */
export function addCombatMovement(token, distance) {
  const amount = Number(distance);
  if (!Number.isFinite(amount) || amount <= 0) return;

  const record = getCombatMovementRecord(token);
  if (!record) return;
  record.spent = Math.max(0, Number(record.spent ?? 0) + amount);
}

/** Efface les données mémorisées pour un combat supprimé. */
export function clearCombatMovement(combat) {
  const prefix = `${combat.id}:`;
  for (const key of combatMovementSpent.keys()) {
    if (key.startsWith(prefix)) combatMovementSpent.delete(key);
  }
}
