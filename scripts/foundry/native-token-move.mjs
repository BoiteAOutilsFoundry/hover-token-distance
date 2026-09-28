/**
 * Interception temporaire du déplacement natif lors d'un trajet avec étapes.
 * preUpdateToken est la variante Token du hook preUpdateDocument : retourner
 * false de manière synchrone annule la mise à jour sur le client initiateur.
 * @see https://foundryvtt.com/api/functions/hookEvents.preUpdateDocument.html
 */

/**
 * Bloque une seule mise à jour de position du token par l'utilisateur courant.
 * wait() attend cette interception ; cancel() libère le hook si le dépôt échoue.
 * Le délai de secours couvre les dépôts qui ne produisent aucune mise à jour.
 */
export function blockNextNativeTokenMove(token) {
  let hookId = null;
  let timeoutId = null;
  let settled = false;
  let resolveWait;

  const promise = new Promise(resolve => {
    resolveWait = resolve;
  });

  const finish = () => {
    if (settled) return;
    settled = true;
    if (hookId !== null) Hooks.off("preUpdateToken", hookId);
    if (timeoutId !== null) clearTimeout(timeoutId);
    resolveWait();
  };

  hookId = Hooks.on("preUpdateToken", (document, change, _options, userId) => {
    if (document !== token?.document && document?.id !== token?.document?.id) return;
    if (userId && game.user?.id && userId !== game.user.id) return;

    const changesPosition = Object.hasOwn(change ?? {}, "x") || Object.hasOwn(change ?? {}, "y");
    if (!changesPosition) return;

    // Le hook est retiré avant que le trajet manuel ne commence. Seule la
    // mise à jour de position générée par le dépôt natif est donc annulée.
    finish();
    return false;
  });

  // Repli défensif : certaines configurations de Foundry peuvent terminer le
  // dépôt sans produire de mise à jour de document (destination inchangée,
  // module tiers, etc.). On ne bloque alors jamais le trajet manuel.
  timeoutId = setTimeout(finish, 350);

  return {
    wait: () => promise,
    cancel: finish
  };
}
