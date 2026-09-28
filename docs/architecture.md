# Comprendre et modifier le module

Le module utilise les modules ES natifs (`.mjs`) de Foundry VTT 12. Il n'y a pas
de compilation ni de dépendance JavaScript à installer pour jouer.

## Organisation

```text
hover-token-distance/
├── module.json                     # Identité, compatibilité et fichiers chargés par Foundry
├── scripts/
│   ├── main.mjs                    # Initialisation et cycle de vie des scènes
│   ├── settings.mjs                # Langue, terrain difficile et raccourcis Y/U
│   ├── token-mouvement.mjs          # Ancien chemin, redirigé vers main.mjs
│   ├── foundry/
│   │   ├── drag-interactions.mjs    # Raccordement aux événements de glisser-déposer
│   │   └── native-token-move.mjs    # Blocage temporaire du dépôt en ligne droite
│   ├── hover/
│   │   └── token-distance.mjs       # Distance entre le token source et le token survolé
│   ├── i18n/
│   │   ├── en.mjs                   # Textes anglais (langue par défaut)
│   │   ├── fr.mjs                   # Textes français
│   │   └── localization.mjs         # Choix de langue et remplacement des paramètres
│   ├── movement/
│   │   ├── drag-controller.mjs      # Début, aperçu, étapes, dépôt et annulation
│   │   ├── route-calculator.mjs     # Mesure et surcoût du terrain difficile
│   │   ├── route-renderer.mjs       # Dessin PIXI, couleurs et étiquettes des étapes
│   │   ├── token-animation.mjs      # Animation successive des étapes
│   │   └── combat-movement.mjs      # Distance consommée par combattant
│   ├── shared/
│   │   ├── constants.mjs            # Identifiants stables du module et des préférences
│   │   └── state.mjs                # Token survolé et trajet temporaire, avec types JSDoc
│   ├── systems/
│   │   └── movement-allowance.mjs   # Lecture des vitesses de l'acteur
│   └── ui/
│       └── tooltip.mjs              # Création, texte et position de l'infobulle HTML
├── styles/
│   └── hover-token-distance.css    # Apparence de l'infobulle
├── docs/
│   ├── architecture.md             # Ce guide
│   └── verification.md             # Tests locaux et vérifications dans Foundry
├── tests/                          # Scénarios automatisés et doubles des API Foundry
├── tools/check.mjs                 # Syntaxe, chemins, casse et dépendances circulaires
├── package.json                    # Commandes de développement uniquement
├── README.md                       # Utilisation du module
├── changelog.md                     # Historique des changements
└── LICENSE
```

`module.json` charge uniquement `scripts/main.mjs`. Celui-ci importe les
fonctionnalités et enregistre les hooks. Les autres fichiers exportent des
fonctions ; ils ne lancent pas leur propre initialisation au moment de l'import.

L'ancien fichier `token-mouvement.mjs` est une redirection de compatibilité. Il
ne contient plus une seconde copie du module. Pour modifier le comportement,
ouvrir les fichiers de `movement/` ou `foundry/` indiqués ci-dessus.

## Déroulement d'un déplacement

1. `foundry/drag-interactions.mjs` laisse le callback existant de Foundry créer
   son clone de prévisualisation, puis appelle le contrôleur.
2. `drag-controller.mjs` conserve l'origine et lit le centre du clone à chaque
   mouvement. La touche Y ajoute ce centre à la liste des étapes.
3. `route-calculator.mjs` mesure le trajet. Il distingue la distance parcourue
   du coût, qui augmente sur le terrain difficile.
4. `route-renderer.mjs` affiche le trajet à partir de ce coût, de la vitesse
   fournie par `systems/` et du mouvement déjà dépensé en combat.
5. Au dépôt, le contrôleur copie le trajet avant que Foundry supprime son clone.
   Sans étape, Foundry conserve son déplacement habituel. Avec étapes,
   `native-token-move.mjs` intercepte une mise à jour de position, puis
   `token-animation.mjs` visite les étapes dans l'ordre.
6. Le contrôleur ajoute le coût au suivi de combat et efface l'aperçu. La touche
   U passe par l'annulation du gestionnaire Foundry et ne consomme pas de mouvement.

L'adaptateur souris conserve le `this`, les arguments et la valeur de retour du
callback qu'il entoure. Le retour reste synchrone quand celui de Foundry l'est.
Le traitement asynchrone des étapes se poursuit séparément ; ses erreurs sont
journalisées avec le préfixe `hover-token-distance`.

## Les trois types de coordonnées

| Donnée | Repère | Utilisation |
| --- | --- | --- |
| `origin`, `destination`, `waypoints` du trajet en cours | Centre du token, en pixels de la scène | Mesure et dessin PIXI |
| `originDocument`, étapes et destination de l'animation | Coin supérieur gauche, en pixels de la scène | `TokenDocument.update()` |
| Position CSS de l'infobulle | Pixels de l'écran | Affichage HTML après transformation par le stage |

La conversion centre → document se fait dans `centerToDocumentPosition()` au
moment de copier le trajet. Ne pas la refaire dans l'animation : cela décalerait
le token, particulièrement lorsqu'il occupe plusieurs cases.

Les distances et les coûts utilisent les unités de la scène. La lecture des
vitesses de l'acteur conserve les valeurs fournies par le système ; elle ne
convertit pas les pieds en mètres, ni l'inverse.

## Durée de vie des données

| Donnée | Fichier propriétaire | Nettoyage |
| --- | --- | --- |
| Token survolé et trajet en cours | `shared/state.mjs` | Fin de survol, fin de drag ou fermeture de scène selon la donnée |
| Couche PIXI et étiquettes | `movement/route-renderer.mjs` | Effacement entre les dessins, destruction à `canvasTearDown` |
| Infobulle HTML | `ui/tooltip.mjs` | Masquée lorsqu'elle n'est plus utile, réutilisée entre les scènes |
| Installation du callback souris | `foundry/drag-interactions.mjs` | Une installation pour la session du client |
| Hook qui bloque un dépôt | `foundry/native-token-move.mjs` | Première position interceptée, annulation ou délai de 350 ms |
| Coût consommé par combattant | `movement/combat-movement.mjs` | Première lecture de son nouveau tour, suppression du combat ou rechargement de la page |

Le suivi du combat est local au navigateur. Il survit au changement de scène,
mais n'est ni enregistré dans le monde ni synchronisé entre les joueurs.

## Où intervenir

| Modification souhaitée | Fichier à lire en premier |
| --- | --- |
| Changer les touches ou ajouter une option | `scripts/settings.mjs` |
| Modifier un texte affiché ou sa traduction | `scripts/i18n/en.mjs` et `scripts/i18n/fr.mjs` |
| Changer le choix du token source au survol | `scripts/hover/token-distance.mjs` |
| Modifier le terrain difficile ou la mesure | `scripts/movement/route-calculator.mjs` |
| Changer les couleurs ou l'épaisseur du trajet | `scripts/movement/route-renderer.mjs` |
| Changer l'apparence ou le format de l'infobulle | `styles/hover-token-distance.css`, puis `scripts/ui/tooltip.mjs` |
| Adapter les vitesses à un autre système de jeu | `scripts/systems/movement-allowance.mjs` |
| Modifier le suivi des tours de combat | `scripts/movement/combat-movement.mjs` |
| Changer la vitesse des animations | `scripts/movement/token-animation.mjs` |
| Adapter le module à une autre version de Foundry | `scripts/foundry/`, puis les appels à la grille et à PIXI |

Les clés de `shared/constants.mjs` identifient aussi les réglages déjà enregistrés.
Leur renommage nécessite une migration des préférences. Un changement de nom
de fichier demande seulement d'actualiser ses imports et, pour un point d'entrée
ou une feuille de style, le manifeste.

## Traductions

Les textes affichés par le code du module sont identifiés par des clés dans
`scripts/i18n/en.mjs` et `scripts/i18n/fr.mjs`. Les deux fichiers doivent contenir
les mêmes clés et les mêmes paramètres entre accolades. Par exemple :

```js
// Dans le dictionnaire anglais :
"distance.difficultTerrain": "{distance} · difficult terrain"

// Dans le code qui affiche le message :
translate("distance.difficultTerrain", { distance: "15 m" });
```

Pour modifier un texte, modifier les deux dictionnaires. Pour en ajouter un,
créer la même clé dans les deux langues, puis utiliser `translate()` à l'endroit
où le texte est affiché. Les tests vérifient que les clés et paramètres concordent.

Le réglage `hover-token-distance.language` est de type `String`, de portée
`client`, avec `en` par défaut et `fr` comme autre choix. Il est enregistré avant
les autres paramètres et raccourcis, afin de lire une préférence française déjà
sauvegardée dès l'initialisation. Son changement demande un rechargement pour
recréer les libellés des interfaces Foundry.

Ces dictionnaires sont importés comme des modules ES : ils sont disponibles de
manière synchrone pendant `init`. Ils ne passent pas par `game.i18n.localize()`,
qui suit la langue globale de Foundry et ne permettrait pas ce choix indépendant.
`localization.mjs` ne modifie pas `game.i18n`. Une préférence inconnue revient à
l'anglais ; une traduction absente utilise aussi le texte anglais.

`formatDistanceLabel()` applique la langue aux nombres et à la présentation de
la mesure. Les unités appartiennent à la scène : elles ne sont ni traduites ni
converties. Les commentaires du code et la documentation restent en français.
Les métadonnées statiques de `module.json`, visibles avant le chargement du monde,
utilisent l'anglais pour la description et conservent le nom propre du module.

## Références Foundry V12

Le sélecteur de langue utilise un réglage client avec `choices` et
`requiresReload`, décrits dans
[ClientSettings.register](https://foundryvtt.com/api/v12/classes/client.ClientSettings.html#register).

Le raccordement utilise le callback du gestionnaire d'interactions et conserve
la méthode existante dans une fermeture. Voir
[MouseInteractionManager](https://foundryvtt.com/api/v12/classes/client.MouseInteractionManager.html).

Le hook d'interception doit retourner `false` immédiatement pour annuler la
mise à jour. Il ne doit pas devenir une fonction `async`. Voir
[preUpdateDocument](https://foundryvtt.com/api/v12/functions/hookEvents.preUpdateDocument.html),
dont `preUpdateToken` est la variante pour les tokens.

La mesure utilise la grille de la scène. Voir
[BaseGrid.measurePath](https://foundryvtt.com/api/v12/classes/foundry.grid.BaseGrid.html#measurePath).

La lecture du clone (`_original`, données d'interaction) reste un point à
revérifier lors d'une migration de Foundry. L'accès aux dimensions, au centre
et à l'animation est documenté dans
[Token](https://foundryvtt.com/api/v12/classes/client.Token.html).
