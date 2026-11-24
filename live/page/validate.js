// validate.js: the person says a note the machine wrote is right (2026-11-21).
//
// The brain has two states of trust: a seed ("graine" in a French brain),
// written by the machine and not validated yet, and a trusted note ("fiable"),
// validated by the person. The card of a seed has a button that validates it,
// the Seeds filter brings the seeds forward on the map, and its button
// validates at once the seeds the other filters leave. Everything here is
// optimistic: the map and the card change at once, the server follows (the
// plugin's promote.mjs), and what it refuses goes back as it was, with a word.

import { validateNote, validateNotes } from "./api.js";
import { t } from "./i18n.js";
import { state } from "./state.js";
import { natureOf } from "./filtering.js";

/** @typedef {import("./map.js").Note} Note */

/** @param {string | undefined} status @returns {boolean} a note written by the machine, not validated yet */
export const isSeed = (status) => status === "seed" || status === "graine";
/** @param {string | undefined} status @returns {boolean} a note the person validated */
export const isTrusted = (status) => status === "trusted" || status === "fiable";

/**
 * The status to show, in the words the note already uses: a French brain
 * writes "graine" and "fiable", an English one "seed" and "trusted".
 * @param {string} before the status of now
 * @param {"trusted" | "seed"} to
 * @returns {string}
 */
const wordFor = (before, to) => {
  const french = before === "graine" || before === "fiable";
  return to === "trusted" ? (french ? "fiable" : "trusted") : french ? "graine" : "seed";
};

/** @type {Set<(slugs: string[]) => void>} who redraws when statuses change (the card, the filters, the map) */
const followers = new Set();
/** @param {(slugs: string[]) => void} fn */
export const onStatusChange = (fn) => void followers.add(fn);
/** @param {string[]} slugs */
const told = (slugs) => { for (const fn of followers) fn(slugs); };

/**
 * Gives notes a status on the page, at once.
 * @param {Map<string, string>} statuses slug -> the status to show
 */
function show(statuses) {
  for (const [slug, status] of statuses) {
    const n = state.noteById.get(slug);
    if (!n) continue;
    n.status = status;
    state.pendingStatus.set(slug, status);
  }
  told([...statuses.keys()]);
}

/**
 * Validates one note, or puts it back as a seed. The page changes at once; a
 * refusal brings the status of before back.
 * @param {string} slug
 * @param {"trusted" | "seed"} to
 * @returns {Promise<{ ok: true } | { ok: false, why: string }>}
 */
export async function setStatus(slug, to) {
  const n = state.noteById.get(slug);
  if (!n) return { ok: false, why: t("validateRefused") };
  const before = n.status;
  show(new Map([[slug, wordFor(before, to)]]));
  /** @type {import("../contract.d.ts").ValidateResponse | null} */
  let answer = null;
  try {
    answer = await validateNote(slug, to);
  } catch {
    answer = null;
  }
  if (answer?.ok) return { ok: true };
  state.pendingStatus.delete(slug);
  n.status = before;
  told([slug]);
  return { ok: false, why: refusalWords(answer) };
}

/**
 * Why the brain did not change a note, in the person's words.
 * @param {{ ok: false, code: string } | { ok: true } | null} answer
 * @returns {string}
 */
const refusalWords = (answer) => (!answer ? t("validateNoServer") : !answer.ok && answer.code === "not-available" ? t("validateNotAvailable") : t("validateRefused"));

/**
 * The seed to validate next: the one the other notes link to the most, among
 * those left on the map (the one open aside).
 * @param {string | null} [besides]
 * @returns {string | null}
 */
export function nextSeed(besides = null) {
  let best = null;
  let most = -1;
  for (const n of state.notes) {
    if (n.id === besides || !isSeed(n.status) || !state.layout?.at.has(n.id)) continue;
    const links = state.inbound.get(n.id) ?? 0;
    if (links > most) { most = links; best = n.id; }
  }
  return best;
}

/**
 * The seeds the filters leave on the map: with the Seeds filter, those that
 * the other filters ticked leave lit too (written since the chosen moment,
 * AI memory, decisions). What the button "Validate these seeds" validates,
 * and what lights up.
 * @returns {string[]}
 */
export function visibleSeeds() {
  return state.notes
    .filter((n) => isSeed(n.status) && state.layout?.at.has(n.id))
    .filter((n) => !state.writtenSince || state.writtenSince.slugs.has(n.id))
    .filter((n) => !state.natureFilters.size || state.natureFilters.has(natureOf(n)))
    .map((n) => n.id);
}

/** The colour of the seeds on the map, when their filter is ticked (not one of the natures': a seed may be a lesson or a decision too). */
// (Its value depends on the design: theme.js, 2026-11-23.)
export { SEED_COLOR } from "./theme.js";

/** How many notes one request validates (the server takes 300 at most). */
const CHUNK = 200;

/**
 * Validates several seeds at once, in requests of two hundred. The map changes
 * at once; what the server refuses, or did not hear, goes back to seed.
 * @param {string[]} slugs
 * @returns {Promise<{ done: number, refused: number, why: string }>} how many were validated, how many came back, and the words of the last refusal
 */
export async function validateMany(slugs) {
  /** @type {Map<string, string>} */
  const before = new Map();
  for (const slug of slugs) {
    const n = state.noteById.get(slug);
    if (n && isSeed(n.status)) before.set(slug, n.status);
  }
  show(new Map([...before].map(([slug, status]) => [slug, wordFor(status, "trusted")])));
  let done = 0;
  let refused = 0;
  let why = "";
  const list = [...before.keys()];
  for (let i = 0; i < list.length; i += CHUNK) {
    const part = list.slice(i, i + CHUNK);
    /** @type {import("../contract.d.ts").ValidateBatchResponse | null} */
    let answer = null;
    try {
      answer = await validateNotes(part);
    } catch {
      answer = null;
    }
    /** @type {string[]} what goes back to seed */
    let back = [];
    if (answer?.ok) {
      done += answer.done.length + answer.unchanged.length;
      back = answer.refused.map((r) => r.note).filter((slug) => before.has(slug));
      if (back.length) why = t("validateRefused");
    } else {
      back = part;
      why = refusalWords(answer);
    }
    for (const slug of back) {
      const n = state.noteById.get(slug);
      state.pendingStatus.delete(slug);
      if (n) n.status = before.get(slug) ?? n.status;
    }
    refused += back.length;
    if (back.length) told(back);
    // (The whole request refused: the plugin cannot do it now, the rest is not asked.)
    if (!answer?.ok) {
      const rest = list.slice(i + CHUNK);
      for (const slug of rest) {
        const n = state.noteById.get(slug);
        state.pendingStatus.delete(slug);
        if (n) n.status = before.get(slug) ?? n.status;
      }
      refused += rest.length;
      if (rest.length) told(rest);
      break;
    }
  }
  return { done, refused, why };
}
