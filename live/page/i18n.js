// i18n.js: the texts the page words itself, in the person's language.
//
// The rule: everything inside the code is English; everything the person
// reads is in the language of their brain (`vocabulary.lang`, "fr" or "en",
// served with the map and alone by GET /api/vocabulary). Anything else is
// English. The texts live in i18n/en.js and i18n/fr.js, one key each: a plain
// string, or a function when the text takes values or a plural. A key missing
// from a language falls back to English.
//
// The texts the server words itself (its own dictionaries, i18n/) arrive in
// the same language and are shown as they are: they are not in these files.

import en from "./i18n/en.js";
import fr from "./i18n/fr.js";
import { language, setLanguage } from "./lang.js";
import { recall, remember } from "./storage.js";

/** @typedef {import("./i18n/en.js").Dictionary} Dictionary */
/** @typedef {import("../contract.d.ts").Lang} Lang */

/** @type {Record<Lang, Partial<Dictionary>>} */
const DICTIONARIES = { en, fr };

/**
 * One text of the page, in the current language.
 *
 *   t("refresh")              a plain text
 *   t("notesCount", 3)        a text that takes values (a function in the dictionary)
 *
 * @template {keyof Dictionary} K
 * @param {K} key
 * @param {Dictionary[K] extends (...values: infer A) => unknown ? A : []} values
 * @returns {Dictionary[K] extends (...values: any[]) => infer R ? R : Dictionary[K]}
 */
export function t(key, ...values) {
  const entry = DICTIONARIES[language()][key] ?? en[key];
  // @ts-expect-error the conditional types above describe this line; TypeScript cannot follow them through a generic key
  return typeof entry === "function" ? entry(...values) : entry;
}

/**
 * Fills the static texts of the document from the dictionary. An element says
 * which key it shows, and where:
 *
 *   data-i18n="key"               its text
 *   data-i18n-html="key"          its content, for a text of ours that carries tags
 *   data-i18n-tip="key"           its tooltip (data-tip, tooltip.js)
 *   data-i18n-label="key"         its aria-label
 *   data-i18n-placeholder="key"   its placeholder
 *
 * The markup carries the English text; this replaces it. Run again when the
 * language changes.
 * @param {ParentNode} [root]
 */
export function applyStaticTexts(root = document) {
  /** @param {string} name @returns {string} */
  const text = (name) => String(t(/** @type {keyof Dictionary} */ (name)));
  /** @param {string} attribute @param {(el: HTMLElement, key: string) => void} put */
  const each = (attribute, put) => {
    for (const el of /** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(`[${attribute}]`))) put(el, el.getAttribute(attribute) ?? "");
  };
  each("data-i18n", (el, key) => { el.textContent = text(key); });
  each("data-i18n-html", (el, key) => { el.innerHTML = text(key); });
  each("data-i18n-tip", (el, key) => { el.dataset.tip = text(key); });
  each("data-i18n-label", (el, key) => { el.setAttribute("aria-label", text(key)); });
  each("data-i18n-placeholder", (el, key) => { el.setAttribute("placeholder", text(key)); });
  if (root === document) document.documentElement.lang = language();
}

/**
 * Takes a language for the page: sets it, fills the static texts, and keeps
 * it for the next visit (so that the page then starts in it at once, before
 * the server has said anything).
 * @param {unknown} lang
 * @param {{ keep?: boolean }} [how] `keep: false`: a guess (the server did not answer), not worth remembering
 * @returns {Lang}
 */
export function useLanguage(lang, { keep = true } = {}) {
  const kept = setLanguage(lang);
  if (keep) remember("lang", kept);
  applyStaticTexts();
  return kept;
}

/**
 * The language to start with: the one of the last visit, at once, when there
 * is one; else the brain's, asked to the server (without an answer, English).
 * @param {{ fresh?: boolean }} [how] `fresh`: ask the server even when a language is remembered (a page that has the time: the history, the legend), and follow what it says
 * @returns {Promise<Lang>}
 */
export async function startLanguage({ fresh = false } = {}) {
  const known = recall("lang");
  if (known) useLanguage(known, { keep: false });
  if (known && !fresh) return language();
  try {
    /** @type {import("../contract.d.ts").Vocabulary} */
    const vocabulary = await (await fetch("/api/vocabulary")).json();
    if (vocabulary.lang !== known) useLanguage(vocabulary.lang);
  } catch {
    if (!known) useLanguage("en", { keep: false });
  }
  return language();
}
