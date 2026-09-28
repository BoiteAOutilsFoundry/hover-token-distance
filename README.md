# Hover Token Distance

Affiche les distances au survol et pendant le déplacement des tokens dans
**Foundry VTT 12.x**. Le manifeste déclare la version **12.343** comme vérifiée.

## Utilisation

Sélectionner un token et en survoler un autre pour voir leur distance. Pendant
un glisser-déposer, le module affiche le coût du trajet et permet d'ajouter des
étapes avant de relâcher le token.

| Commande | Action |
| --- | --- |
| **Y** pendant le déplacement | Fixer une étape du trajet |
| **U** pendant le déplacement | Annuler le trajet et revenir à l'origine |

Les touches se modifient dans **Paramètres du jeu → Configuration des contrôles →
Hover Token Distance**.

Le trajet est vert jusqu'à la vitesse normale, jaune jusqu'à son double
(Sprinter), puis rouge. Ces couleurs indiquent le budget disponible ; elles
n'empêchent pas le déplacement. La vitesse retenue est la plus grande valeur
positive dans les données de mouvement de l'acteur, selon la structure utilisée
par D&D 5e. Sans vitesse reconnue, la mesure reste disponible et le trajet est vert.

## Terrain difficile et combat

Le réglage **Les tokens créent du terrain difficile** double le coût des portions
qui traversent un autre token visible à la même élévation. Il est activé par
défaut et se configure dans les réglages du module, au niveau du monde.

Pendant un combat, les trajets suivants tiennent compte de la distance déjà
consommée par chaque combattant. Son compteur repart de zéro lors de la première
mesure de son prochain tour. Ce suivi est temporaire et propre au navigateur :
il n'est pas synchronisé entre les joueurs et disparaît au rechargement de la page.

## Langue du module

Dans **Paramètres du jeu → Configuration des paramètres → Hover Token Distance**,
le réglage **Module language / Langue du module** permet de choisir **English**
ou **Français**. L'anglais est sélectionné par défaut, indépendamment de la
langue de Foundry. Chaque joueur peut faire son propre choix sur son client.

Enregistrer le réglage et accepter le rechargement proposé par Foundry pour
actualiser tous les libellés. Les paramètres, raccourcis, infobulles,
notifications et messages de diagnostic suivent ce choix. Les décimales utilisent
un point en anglais et une virgule en français ; les unités de la scène sont conservées.

## Fonctionnement actuel

- La distance est mesurée en deux dimensions. L'élévation sert uniquement à
  déterminer quels tokens peuvent créer du terrain difficile.
- Le terrain difficile est estimé en échantillonnant le trajet à l'intérieur
  des limites des autres tokens.
- Avec des étapes, le module intercepte le dépôt natif en ligne droite et anime
  successivement les positions prévues jusqu'à la destination.
- Les vitesses de l'acteur doivent utiliser des unités cohérentes avec la scène ;
  le module ne convertit pas ces unités.

## Développer le module

Commencer par [le guide d'architecture](docs/architecture.md) : il décrit les
dossiers, le déroulement d'un déplacement et le fichier à modifier pour chaque
fonctionnalité. `scripts/main.mjs` est le point d'entrée chargé par Foundry.

Le code est organisé dans `scripts/hover/`, `scripts/movement/`, `scripts/foundry/`,
`scripts/systems/`, `scripts/ui/` et `scripts/i18n/`. Les commentaires expliquent le rôle des
fonctions et les précautions liées aux coordonnées et à l'animation.

Avec Node.js 22 ou plus récent :

```sh
npm run check
npm test
```

Aucune installation de dépendance ni compilation n'est nécessaire. Voir
[la procédure de vérification](docs/verification.md) pour les contrôles à
effectuer dans Foundry et le contenu de l'archive à distribuer.

En cas de problème en jeu, ouvrir **F12 → Console** et chercher le préfixe
`hover-token-distance`.

Historique : [changelog.md](changelog.md). Licence : [MIT](LICENSE).
