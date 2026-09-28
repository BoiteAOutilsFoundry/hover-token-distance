# Changelog

## Non publié

### Ajouts
- Choix de langue English / Français dans les paramètres du module, propre à chaque
  client, avec l'anglais par défaut indépendamment de la langue de Foundry.
- Textes d'interface et de diagnostic centralisés dans `scripts/i18n/` ; format
  des nombres adapté à la langue choisie. Rechargement demandé après changement.
- Tests des traductions, de la préférence sauvegardée et des messages affichés.

### Maintenance
- Finalisation de la structure par responsabilité : intégration Foundry, survol,
  déplacement, interface et lecture des données du système de jeu.
- État graphique, installation des interactions et compteurs de combat limités
  aux composants qui les utilisent.
- Remplacement de l'ancien script de mouvement dupliqué par une redirection vers
  le point d'entrée unique, sans second enregistrement des hooks.
- Commentaires en français, guide d'architecture et procédure de vérification.
- Ajout de tests de régression et de commandes de contrôle sans dépendance externe.
- Journalisation des erreurs du trajet asynchrone après un dépôt synchrone.
- Conservation des identifiants, réglages, raccourcis et règles de calcul existants.

## [1.1.3] - 2026-07-29

### Changed
- Réorganisation complète du code en modules ES spécialisés.
- Séparation de la mesure au survol, du calcul de trajet, du rendu, de l’animation et du suivi en combat.
- Ajout de commentaires de documentation dans tous les fichiers JavaScript.
- Aucun changement fonctionnel prévu pour l’utilisateur.

## [1.1.2] - 2026-07-28

### Added
- New release for foundry VTT publication
