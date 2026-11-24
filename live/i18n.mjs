// i18n.mjs: what the server words for the person, in their language.
//
// The rule: everything inside the code is English; everything the person
// sees is in their language. That language is `lang` in the brain's
// brain.json (brain.mjs gives it): French or English today, anything else is
// English. The texts live in i18n/en.mjs and i18n/fr.mjs, one key each; a key
// missing from a language falls back to English.

import en from "./i18n/en.mjs";
import fr from "./i18n/fr.mjs";

/** @typedef {import("./i18n/en.mjs").Dictionary} Dictionary */
/** @typedef {"fr" | "en"} Lang */

/** @type {Record<string, Dictionary>} */
const DICTIONARIES = { en, fr: { ...en, ...fr } };

/**
 * The texts of one language (English for a language without a dictionary).
 * @param {string | null | undefined} lang
 * @returns {Dictionary}
 */
export const t = (lang) => DICTIONARIES[String(lang)] ?? en;

/**
 * The computer's language, for the rare message that comes before any brain
 * is known (no brain found): the environment first, then what Node reports.
 * @returns {Lang}
 */
export function osLanguage() {
  const pick = (v) => (v && !/^(C|POSIX)([._]|$)/i.test(v) ? v : "");
  let locale = pick(process.env.LC_ALL) || pick(process.env.LC_MESSAGES) || pick(process.env.LANG);
  if (!locale) {
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    } catch {
      locale = "";
    }
  }
  return String(locale).toLowerCase().startsWith("fr") ? "fr" : "en";
}

/**
 * How often a source runs, in words: "day", "week", "hour" or a number of
 * minutes ("15m"). Null when its `every` is none of these.
 * @param {Dictionary} say
 * @param {unknown} every
 * @returns {string | null}
 */
export function rhythm(say, every) {
  if (every === "day") return say.rhythmDay;
  if (every === "week") return say.rhythmWeek;
  if (every === "hour") return say.rhythmHour;
  return /^\d+m$/.test(String(every)) ? say.everyMinutes(parseInt(String(every), 10)) : null;
}
