# Vérifier une modification

## Vérifications locales

Avec Node.js 22 ou plus récent, depuis la racine du projet :

```sh
npm run check
npm test
```

Ces commandes n'installent aucune dépendance. On peut aussi lancer directement
`node tools/check.mjs` et `node --test tests/*.test.mjs`.

- `check` vérifie la syntaxe des fichiers `.mjs`, les ressources du manifeste,
  les chemins importés et leur casse exacte, puis l'absence de dépendance
  circulaire depuis le point d'entrée. La vérification de casse permet de
  repérer sous Windows des erreurs qui empêcheraient le chargement sous Linux.
- Les tests couvrent les coûts, le terrain difficile, le combat, les étapes,
  l'annulation, les erreurs de dépôt, le blocage temporaire de la mise à jour
  native, l'attente de l'animation visuelle, le survol et le cycle de vie des scènes.
  Ils vérifient aussi les dictionnaires, l'anglais par défaut, la préférence française
  au redémarrage, les nombres, les notifications et les libellés dans les deux langues.

`tests/helpers/foundry.mjs` simule uniquement les interfaces utilisées. Il ne
reproduit pas le véritable moteur PIXI, le réseau, les murs ni les règles des
différentes grilles Foundry. Un test qui passe confirme le comportement du code
face à ces interfaces ; il ne certifie pas à lui seul l'intégration en jeu.

## Vérification dans Foundry V12

Activer le module dans un monde de développement, puis recharger la page pour
charger les nouveaux modules ES. Ouvrir la console avec F12 et rechercher les
messages commençant par `hover-token-distance`.

| Scénario | Résultat à vérifier |
| --- | --- |
| Ouvrir les paramètres sans préférence de langue enregistrée | « Module language » propose English par défaut, même si Foundry est en français |
| Choisir Français, enregistrer et accepter le rechargement | « Langue du module », ses explications et les autres réglages sont en français |
| Ouvrir la configuration des contrôles après ce rechargement | Noms et explications de Y et U dans la langue du module ; touches personnalisées conservées |
| Mesurer une distance décimale, traverser un terrain difficile puis annuler | Point et « difficult terrain » / « Movement cancelled. » en anglais ; virgule et « terrain difficile » / « Déplacement annulé. » en français |
| Repasser à English, enregistrer et recharger | Tous les libellés reviennent en anglais ; le choix reste enregistré à la prochaine ouverture |
| Utiliser un autre client sans changer sa préférence | Son module reste en anglais ; la langue globale de Foundry et celle des autres clients ne changent pas |
| Sélectionner un token puis en survoler un autre | Distance lisible ; l'infobulle suit le zoom et le déplacement de la caméra |
| Déplacer un token sans étape | Déplacement Foundry habituel et disparition du tracé au dépôt |
| Placer deux étapes avec Y, puis relâcher | Le token visite les étapes dans l'ordre, sans saut direct à la destination |
| Appuyer deux fois sur Y au même endroit | Une seule étape à cet emplacement |
| Refaire le trajet avec un token de plusieurs cases | Aucun décalage entre l'aperçu et l'arrivée réelle |
| Appuyer sur U pendant un trajet avec étapes | Retour à l'origine, disparition du clone et du tracé |
| Traverser un autre token visible au même niveau | Coût augmenté ; l'option terrain difficile désactivée retire ce surcoût |
| Utiliser un token caché ou à une autre élévation comme obstacle | Aucun surcoût pour cet obstacle |
| Dépasser la vitesse puis son double | Passage du vert au jaune, puis au rouge |
| Déplacer un acteur sans vitesse reconnue | Distance affichée et trajet vert |
| Déplacer deux fois un combattant pendant son tour | Le second tracé tient compte du mouvement consommé ; son prochain tour repart de zéro |
| Changer de scène puis revenir | Aucun tracé résiduel et aucun doublon de traitement ; le compteur du combat est conservé |

Répéter les scénarios de déplacement avec les grilles et les modules tiers
réellement utilisés dans le monde, ainsi qu'avec un compte joueur possédant le
token. Vérifier les déplacements avec étapes près des murs selon les règles
attendues du monde : cette refactorisation conserve le mécanisme existant de
mises à jour successives des documents et n'ajoute pas de calcul de collision.

## Distribution

Foundry charge directement `module.json`, `scripts/` et `styles/`. L'archive de
distribution doit garder les sous-dossiers de `scripts/` et placer `module.json`
à la racine. Inclure également `README.md`, `changelog.md` et `LICENSE`.

Les dossiers `tests/`, `tools/`, les fichiers de configuration de développement
et les données de l'IDE ne sont pas nécessaires à l'exécution du module.
