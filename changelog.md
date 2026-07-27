## 1.1.1 — Correction

- Correction d’une concurrence entre le déplacement natif de Foundry et le trajet animé du module.
- Lorsqu’un trajet contient des points d’ancrage, la mise à jour native en ligne droite est annulée.
- Le token passe désormais successivement par chaque point d’ancrage sans déplacement tardif vers une autre destination.

## Added

- Points d'ancrage permettant de créer un trajet personnalisé.
- Déplacement animé du token via chaque point d'ancrage.
- Affichage du coût du terrain difficile.
- Prise en compte des créatures traversées comme terrain difficile en fonction de l'espace qu'elles occupent sur la grille (paramètre de taille du token).
- Suivi du déplacement consommé pendant un combat.
- Calcul du déplacement restant sur plusieurs déplacements successifs au cours du même tour.
- Affichage de la distance cumulée parcourue.