/** Animation des déplacements réels, une fois le dépôt natif traité. */

/**
 * Visite les étapes puis la destination, dans l'ordre.
 * Toutes les positions reçues sont celles du document (coin supérieur gauche),
 * après conversion des centres par le contrôleur de déplacement.
 */
export async function moveTokenAlongAnchoredRoute(state) {
  const token = state.token;
  if (!token?.document) return;

  const route = [...state.waypoints, state.finalDocument]
    .filter(point => Number.isFinite(point?.x) && Number.isFinite(point?.y));

  // Évite les segments nuls et les doublons successifs.
  const uniqueRoute = [];
  let previous = state.originDocument;
  for (const point of route) {
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < 1) continue;
    uniqueRoute.push(point);
    previous = point;
  }

  // Sécurité si un autre module a malgré tout déplacé le document pendant le
  // dépôt : repartir de l'origine avant de jouer les segments prévus.
  if (token.document.x !== state.originDocument.x || token.document.y !== state.originDocument.y) {
    await token.document.update(state.originDocument, { animate: false });
  }

  for (const point of uniqueRoute) {
    const from = { x: token.document.x, y: token.document.y };
    const pixels = Math.hypot(point.x - from.x, point.y - from.y);
    const gridSize = Math.max(canvas.grid?.size ?? 100, 1);
    const duration = Math.clamp
      ? Math.clamp(Math.round((pixels / gridSize) * 140), 140, 650)
      : Math.max(140, Math.min(650, Math.round((pixels / gridSize) * 140)));

    await token.document.update(point, {
      animate: true,
      animation: { duration }
    });

    // Le document reçoit immédiatement ses nouvelles coordonnées alors que le
    // Token continue encore son animation à l'écran. Il faut attendre sa vraie
    // position visuelle avant d'envoyer le segment suivant, sinon Foundry coupe
    // les animations et le token ne passe pas correctement par les ancrages.
    await waitForTokenVisualPosition(token, point, duration);
  }
}

/** Attend l'arrivée visuelle, car la mise à jour du document ne suffit pas. */
async function waitForTokenVisualPosition(token, destination, expectedDuration = 0) {
  const tolerance = 0.75;
  const timeout = Math.max(1200, Number(expectedDuration) * 4);
  const startedAt = performance.now();

  while (performance.now() - startedAt < timeout) {
    const x = Number(token?.x ?? token?.position?.x);
    const y = Number(token?.y ?? token?.position?.y);

    if (Number.isFinite(x) && Number.isFinite(y)
      && Math.abs(x - destination.x) <= tolerance
      && Math.abs(y - destination.y) <= tolerance) {
      return;
    }

    await new Promise(resolve => requestAnimationFrame(resolve));
  }

  // Repli défensif : le document est déjà à destination. On force seulement
  // l'affichage local si une animation externe est restée bloquée.
  if (token?.position?.set) token.position.set(destination.x, destination.y);
}
