/**
 * Mesure d'un trajet avec la grille et les tokens de la scène courante.
 * Ce fichier ne dessine rien et ne modifie aucun document Foundry.
 */
import { MODULE_ID, SETTING_DIFFICULT_TERRAIN } from "../shared/constants.mjs";

/**
 * Échantillonne le trajet par portions d'environ un quart de case.
 * Chaque échantillon distingue la distance géométrique du coût de mouvement,
 * doublé si son milieu traverse un autre token. Les cumuls servent aux couleurs,
 * à l'infobulle et au compteur de combat ; ils utilisent les unités de la scène.
 * @param {import("../shared/state.mjs").Point[]} points Centres, dans l'ordre du trajet.
 * @param {object} movingToken Token déplacé, exclu du terrain difficile.
 * @returns {object[]} Points mesurés avec totalDistance et totalCost.
 */
export function buildCostSamples(points, movingToken) {
  const difficultEnabled = game.settings.get(MODULE_ID, SETTING_DIFFICULT_TERRAIN);
  const samples = [{ point: points[0], totalCost: 0, totalDistance: 0 }];
  let totalCost = 0;
  let totalDistance = 0;
  const gridSize = Math.max(canvas.grid?.size ?? 100, 20);

  // Calcul continu : le trajet suit exactement le pointeur et les points
  // d’ancrage. Aucun recentrage ni déplacement case par case n’est appliqué.
  for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex++) {
    const a = points[segmentIndex];
    const b = points[segmentIndex + 1];
    const pixels = Math.hypot(b.x - a.x, b.y - a.y);
    const divisions = Math.max(1, Math.ceil(pixels / (gridSize / 4)));
    let previous = a;

    for (let i = 1; i <= divisions; i++) {
      const t = i / divisions;
      const current = {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t
      };
      const baseDistance = measureDistance(previous, current);
      const midpoint = {
        x: (previous.x + current.x) / 2,
        y: (previous.y + current.y) / 2
      };
      const difficult = difficultEnabled && overlapsAnotherToken(midpoint, movingToken);
      const cost = baseDistance * (difficult ? 2 : 1);

      totalDistance += baseDistance;
      totalCost += cost;
      samples.push({
        point: current,
        previous,
        distance: baseDistance,
        cost,
        difficult,
        totalDistance,
        totalCost,
        waypoint: i === divisions ? segmentIndex + 1 : null
      });
      previous = current;
    }
  }

  return samples;
}

/**
 * Délègue la mesure aux règles de la grille Foundry V12.
 * Le calcul en pixels ne sert que si cette API échoue ou renvoie une valeur invalide.
 * @see https://foundryvtt.com/api/v12/classes/foundry.grid.BaseGrid.html#measurePath
 */
export function measureDistance(a, b) {
  try {
    const measured = canvas.grid.measurePath([a, b]);
    if (Number.isFinite(measured?.distance)) return measured.distance;
  } catch (_error) {
    // Repli ci-dessous pour les grilles ou systèmes atypiques.
  }

  const pixels = Math.hypot(b.x - a.x, b.y - a.y);
  const size = canvas.grid?.size || 100;
  const distance = canvas.scene?.grid?.distance || 5;
  return pixels / size * distance;
}

/** Vérifie la présence d'un token visible au même niveau, à partir de ses limites. */
function overlapsAnotherToken(point, movingToken) {
  const tokens = canvas.tokens?.placeables ?? [];
  const movingElevation = Number(movingToken.document?.elevation ?? 0);

  return tokens.some(token => {
    if (token === movingToken || token.document?.hidden || !token.visible) return false;
    const elevation = Number(token.document?.elevation ?? 0);
    if (elevation !== movingElevation) return false;
    return token.bounds?.contains?.(point.x, point.y) ?? false;
  });
}

/** Convertit un centre en coin supérieur gauche, y compris pour les tokens de grande taille. */
export function centerToDocumentPosition(point, token) {
  return {
    x: Math.round(point.x - (token.w ?? 0) / 2),
    y: Math.round(point.y - (token.h ?? 0) / 2)
  };
}
