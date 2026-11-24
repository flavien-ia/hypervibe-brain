// lang.js: the language of everything the person reads, and how numbers are
// written in it.
//
// A leaf module (it imports nothing), so that the dictionaries can use
// number() without a circle of imports. The texts themselves are in i18n/,
// and i18n.js chooses between them.

/** @typedef {import("../contract.d.ts").Lang} Lang */

/** The languages that have a dictionary; any other falls back to English. */
export const LANGUAGES = /** @type {const} */ (["en", "fr"]);

/** @type {Lang} */
let current = "en";

/**
 * Sets the language of the page: "fr" or "en", anything else is English.
 * @param {unknown} lang
 * @returns {Lang} the language kept
 */
export function setLanguage(lang) {
  current = lang === "fr" ? "fr" : "en";
  numbers = null;
  return current;
}

/** @returns {Lang} */
export const language = () => current;

/**
 * The locale that formats the dates and the numbers (Intl). French is always
 * fr-FR, as the page always was. English follows the browser when the browser
 * is in English (12 or 24 hours, day before month or after), else en-US.
 * @returns {string}
 */
export function locale() {
  if (current === "fr") return "fr-FR";
  const own = typeof navigator === "undefined" ? "" : navigator.language ?? "";
  return own.toLowerCase().startsWith("en") ? own : "en-US";
}

/** @type {Intl.NumberFormat | null} */
let numbers = null;

/**
 * A whole number as the language writes it ("12 345" in French, "12,345" in English).
 * @param {number} n
 * @returns {string}
 */
export function number(n) {
  numbers ??= new Intl.NumberFormat(locale());
  return numbers.format(Math.round(n));
}
