/**
 * Traductions propres au module, indépendantes de la langue globale de Foundry.
 * Les dictionnaires ES sont disponibles dès init, sans chargement réseau asynchrone
 * ni modification de game.i18n (qui appartient à l'ensemble de l'application).
 */
import { MODULE_ID, SETTING_LANGUAGE } from "../shared/constants.mjs";
import english from "./en.mjs";
import french from "./fr.mjs";

export const DEFAULT_LANGUAGE = "en";
const translations = { en: english, fr: french };

/** Revient à l'anglais avant l'enregistrement du réglage ou si sa valeur est inconnue. */
export function getLanguage() {
  try {
    const language = globalThis.game?.settings?.get(MODULE_ID, SETTING_LANGUAGE);
    return Object.hasOwn(translations, language) ? language : DEFAULT_LANGUAGE;
  } catch {
    // Foundry lève une erreur lorsqu'un réglage n'est pas encore enregistré.
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Traduit une clé et remplace ses {paramètres} sans interpréter de HTML.
 * Une traduction manquante utilise l'anglais ; une clé inconnue reste visible
 * afin de pouvoir la retrouver facilement dans les dictionnaires.
 */
export function translate(key, parameters = {}) {
  const dictionary = translations[getLanguage()];
  const template = Object.hasOwn(dictionary, key)
    ? dictionary[key]
    : Object.hasOwn(english, key) ? english[key] : key;
  return template.replace(/\{(\w+)\}/g, (placeholder, name) =>
    Object.hasOwn(parameters, name) ? String(parameters[name]) : placeholder
  );
}
