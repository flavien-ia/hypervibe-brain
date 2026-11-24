// format.js: how the page writes a text, a number, a date or a duration.
//
// Dates and numbers go through Intl, in the locale of the page's language
// (lang.js); the words around them come from the dictionary (i18n.js).

import { t } from "./i18n.js";
import { locale, number } from "./lang.js";

export { number };

// ------------------------------------------------------------ texts

/** @type {Record<string, string>} */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

/**
 * A text made safe to place in HTML (content or attribute between double quotes).
 * @param {unknown} text
 * @returns {string}
 */
export const escapeHtml = (text) => String(text).replace(/[&<>"]/g, (c) => ENTITIES[c]);

/**
 * A text cut to `max` characters, with an ellipsis.
 * @param {string} text
 * @param {number} max
 * @returns {string}
 */
export const shorten = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The combining accents, U+0300 to U+036F: marks without a letter, given by
 * their code points because they cannot be read as characters.
 */
const ACCENTS = new RegExp(`[${String.fromCodePoint(0x300)}-${String.fromCodePoint(0x36f)}]`, "g");

/**
 * A text without accents, in lower case: what a filter compares.
 * @param {unknown} text
 * @returns {string}
 */
export const plain = (text) => String(text ?? "").normalize("NFD").replace(ACCENTS, "").toLowerCase();

/**
 * A colour that came from a configuration file ends up in a style="...": it
 * only passes if it has the shape of a colour, else a neutral grey.
 * @param {unknown} color
 * @returns {string}
 */
export const safeColor = (color) => (/^(#[0-9a-f]{3,8}|[a-z]+|(rgb|hsl)a?\([\d\s.,%/]+\))$/i.test(String(color ?? "")) ? String(color) : "#9aa0b8");

/**
 * A number that came from a configuration file ends up in a value="...": a number, or the fallback.
 * @param {unknown} value
 * @param {number} fallback
 * @returns {number}
 */
export const numberOr = (value, fallback) => (value !== null && value !== "" && Number.isFinite(Number(value)) ? Number(value) : fallback);

/**
 * The initials of a tool without a logo: the first letters of its first two words of more than two letters.
 * @param {string} name
 * @returns {string}
 */
export const initials = (name) => name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter((word) => word.length > 2).slice(0, 2).map((word) => word[0].toUpperCase()).join("");

// ------------------------------------------------------------ numbers

/**
 * A large number in short ("12,3 k"), a small one in full.
 * @param {number} n
 * @returns {string}
 */
export const compact = (n) => (n >= 10_000 ? new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(n) : number(n));

/**
 * An amount in dollars, as the language writes it: to the cent under ten dollars, to the dollar above.
 * @param {number} n
 * @returns {string}
 */
export const dollars = (n) => new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: n < 10 ? 2 : 0, maximumFractionDigits: n < 10 ? 2 : 0 }).format(n);

/**
 * The median of a list of numbers; 0 for an empty list.
 * @param {number[]} values
 * @returns {number}
 */
export function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

// ------------------------------------------------------------ dates

/** @type {Map<string, Intl.DateTimeFormat>} */
const dateFormats = new Map();

/**
 * A date written with Intl, in the page's locale.
 * @param {Date | string | number} date
 * @param {Intl.DateTimeFormatOptions} options
 * @returns {string}
 */
export function formatDate(date, options) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "Invalid Date"; // what toLocaleString() says; Intl would throw
  const key = `${locale()}|${JSON.stringify(options)}`;
  let format = dateFormats.get(key);
  if (!format) dateFormats.set(key, (format = new Intl.DateTimeFormat(locale(), options)));
  return format.format(d);
}

/** @type {Intl.DateTimeFormatOptions} */
const CLOCK = { hour: "2-digit", minute: "2-digit" };
/** The weekday, the day and the month in full: "lundi 9 novembre", "Monday, November 9". @type {Intl.DateTimeFormatOptions} */
export const FULL_DAY = { weekday: "long", day: "numeric", month: "long" };
/** The date and the time in figures, as toLocaleString() writes them. @type {Intl.DateTimeFormatOptions} */
export const FIGURES = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" };

/** The time of a moment, to the minute. @param {Date | string | number} date */
export const clock = (date) => formatDate(date, CLOCK);
/** The time of a moment, to the second. @param {Date | string | number} date */
export const clockSeconds = (date) => formatDate(date, { ...CLOCK, second: "2-digit" });

/** @param {Date} d */
const isToday = (d) => new Date().toDateString() === d.toDateString();

/**
 * When something happened, in a sentence: "today at 14:05", "9 November at 14:05"; "never" without a date.
 * @param {string | null | undefined} iso
 * @returns {string}
 */
export function shortDate(iso) {
  if (!iso) return t("never");
  const d = new Date(iso);
  return isToday(d) ? t("todayAt", clock(d)) : formatDate(d, { day: "numeric", month: "long", ...CLOCK });
}

/**
 * When something happened, short, for a list: "today 14:05", "9 Nov 14:05".
 * @param {string} iso
 * @returns {string}
 */
export function shortWhen(iso) {
  const d = new Date(iso);
  return `${isToday(d) ? t("today") : formatDate(d, { day: "numeric", month: "short" })} ${clock(d)}`;
}

/**
 * How long until a moment: "in 12 min", "in 3 h 05", "on Sunday at 18:00".
 * @param {number} time milliseconds
 * @returns {string}
 */
export function untilThen(time) {
  const m = Math.round((time - Date.now()) / 60_000);
  if (m <= 1) return t("inLessThanAMinute");
  if (m < 60) return t("inMinutes", m);
  const h = Math.floor(m / 60);
  return h < 24 ? t("inHours", h, String(m % 60).padStart(2, "0")) : t("onDayAt", formatDate(time, { weekday: "long" }), clock(time));
}

/**
 * The day of a moment, in local time (YYYY-MM-DD): written by hand, it is called once per line of the usage journal.
 * @param {Date | string | number} date
 * @returns {string}
 */
export function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ------------------------------------------------------------ durations

/**
 * How long a call took: "850 ms", "2,4 s".
 * @param {number} ms
 * @returns {string}
 */
export const duration = (ms) => (ms >= 1000 ? t("seconds", (ms / 1000).toLocaleString(locale(), { maximumFractionDigits: 1 })) : `${number(ms)} ms`);

/**
 * How long a run took, roughly: "42 s", "3 min".
 * @param {number} seconds
 * @returns {string}
 */
export const runTime = (seconds) => (seconds < 60 ? t("seconds", seconds) : t("minutes", Math.round(seconds / 60)));

// ------------------------------------------------------------ the journal's words

/**
 * Why a source ran, in words, from what the journal says (`why`: "time",
 * "vault", "now", "file:<path>", "files moved since...", "skill:<name>",
 * "source:<name>"). An unknown reason is shown as it is.
 * @param {unknown} reason
 * @returns {string}
 */
export function wordWhy(reason) {
  const why = String(reason ?? "");
  if (!why || why === "time") return t("whyTime");
  if (why === "vault") return t("whyVault");
  if (why === "now") return t("whyNow");
  // The last three parts of the path are enough to recognise the file.
  if (why.startsWith("file:")) return t("whyFile", why.slice(5).trim().replace(/^[a-z]+:\/\//i, "").split(/[\\/]/).filter(Boolean).slice(-3).join(" / "));
  if (why.startsWith("files moved since")) return t("whyFilesMoved");
  if (why.startsWith("skill:")) return t("whySkill", why.slice(6));
  if (why.startsWith("source:")) return t("whySource", why.slice(7));
  return why;
}

/**
 * When a write was taken back, in words: "Undone today at 14:05", "Undone on 9 November at 14:05".
 * @param {string} iso
 * @returns {string}
 */
export function wordUndone(iso) {
  const d = new Date(iso);
  return isToday(d) ? t("undoneToday", clock(d)) : t("undoneOn", formatDate(d, { day: "numeric", month: "long", ...CLOCK }));
}

/**
 * The name of a conversation that read the brain: its title, else its client.
 * @param {import("../contract.d.ts").ReadEvent} read
 * @returns {string}
 */
export const conversationName = (read) => read.convTitle || (read.client ? `${read.client}` : t("unknownConversation"));

/**
 * What a run did, in words, from the plugin's counts; "" when it did nothing.
 * @param {(string | false | 0 | null | undefined)[]} parts the counts already worded, the absent ones falsy
 * @returns {string}
 */
export const outcome = (parts) => parts.filter(Boolean).join(", ");
