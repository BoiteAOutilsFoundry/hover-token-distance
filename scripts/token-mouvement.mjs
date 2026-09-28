/**
 * Ancien point d'entrée, conservé pour les références existantes.
 * La logique de déplacement se trouve désormais dans movement/ ; le raccordement
 * aux interactions Foundry est dans foundry/drag-interactions.mjs.
 *
 * main.mjs est le seul point d'entrée déclaré dans module.json. Réimporter ce
 * même module ES ne réenregistre pas les hooks une seconde fois.
 * Voir docs/architecture.md pour savoir quel fichier modifier.
 */
import "./main.mjs";
