HOVER TOKEN DISTANCE — VERSION 1.1.2
Compatible avec Foundry VTT 12.x

FONCTIONS
- Affiche la distance entre le token sélectionné et un token survolé.
- Affiche la distance du trajet pendant le glisser-déposer d'un token.
- Colore le trajet :
  - vert jusqu'à la vitesse normale ;
  - jaune jusqu'au double de cette vitesse, correspondant à Sprinter ;
  - rouge au-delà.
- La touche Y fixe une étape et permet de mesurer un trajet avec plusieurs virages.
- La touche U annule le trajet et remet l'aperçu au point de départ.
- Les raccourcis sont modifiables dans « Configuration des contrôles » de Foundry.
- Le passage sur un autre token situé à la même élévation coûte le double de distance.

RACCOURCIS PAR DÉFAUT
- Y : fixer une étape.
- U : annuler le déplacement en cours.

Les raccourcis se modifient dans :
Paramètres du jeu > Configuration des contrôles > Hover Token Distance.

DÉPLACEMENT
La vitesse est lue dans les données de mouvement de l'acteur D&D 5e. Lorsque plusieurs vitesses existent, le module emploie la plus élevée. Un token sans vitesse exploitable conserve l'affichage de distance, mais le trajet reste vert faute de seuil connu.

LIMITES
- Mesure en deux dimensions ; l'élévation sert uniquement à déterminer si deux tokens occupent le même niveau.
- Le terrain difficile est calculé sur la portion du trajet recouverte par un autre token visible.
- Avec des points d’ancrage, le module bloque le déplacement natif en ligne droite et déplace le token successivement par chaque étape jusqu’à la destination finale.

DIAGNOSTIC
En cas de problème, ouvrez les outils développeur avec F12, onglet Console, et cherchez une ligne commençant par : hover-token-distance

## Suivi du déplacement en combat

Pendant un combat, le module mémorise temporairement la distance déjà parcourue par chaque combattant. Les couleurs du trajet tiennent compte du déplacement restant lors des déplacements suivants. Le compteur de l'entité est remis à zéro au début de son prochain tour.


## Changelog
See CHANGELOG.md for version history.
