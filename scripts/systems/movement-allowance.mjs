/**
 * Lecture des vitesses dans la structure d'acteur utilisée par D&D 5e.
 * C'est le point à adapter pour prendre en charge un autre système de jeu.
 * Les distances sont reprises telles quelles, sans conversion d'unités.
 */

/**
 * Conserve la règle actuelle : prendre la plus grande vitesse positive.
 * Zéro signifie « vitesse inconnue » ; le rendu affiche alors tout en vert.
 */
export function getMovementAllowance(token) {
  const movement = token.actor?.system?.attributes?.movement;
  if (!movement) return 0;

  const activeMode = movement.hover && Number(movement.hover) > 0 ? "hover" : null;
  const values = [
    activeMode ? Number(movement[activeMode]) : 0,
    Number(movement.walk),
    Number(movement.fly),
    Number(movement.swim),
    Number(movement.climb),
    Number(movement.burrow)
  ].filter(value => Number.isFinite(value) && value > 0);

  return values.length ? Math.max(...values) : 0;
}
