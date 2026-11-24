// pure.mjs - The calculations the local engine AND the cloud Worker share,
// written once. No import, no access to anything: pure functions only, so
// that the Worker (a Cloudflare runtime, without Node's modules) runs exactly
// the same code as this computer.
//
// Why one file rather than two engines kept in step: the brain this plugin
// grew from had two, and a bench to prove they agreed. "Two engines that
// diverge are the guarantee that one day one of them serves what the other
// hides." Sharing the code removes the divergence at its source.

export const flat = (s) => String(s ?? "").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

// THE TWO LIGATURES (2026-11-21). Neither `flat` nor the full-text index
// (unicode61, remove_diacritics) touches them: "oeuvre" found 50 notes of a
// real brain and "œuvre" 117, "coeur" 8 and "cœur" 76. They are written out
// on both sides: in the text the index stores (unligature) and in the words
// of a question (`fold`, asked for with `ligatures: true`). The option is
// off by default because both sides must change together: an index that
// still holds "œuvre" as it was written (the cloud copy, until it is filled
// with unligatured text) must go on being asked "œuvre".
/** `flat`, with œ and æ written out. */
export const fold = (s) => flat(s).replace(/œ/g, "oe").replace(/æ/g, "ae");
/** A text as the full-text index stores it: œ and æ written out, the rest untouched. */
export const unligature = (s) => String(s ?? "").replace(/œ/g, "oe").replace(/Œ/g, "Oe").replace(/æ/g, "ae").replace(/Æ/g, "Ae");

/** Every word must appear, anywhere, accents ignored. Several words are NOT an exact phrase. */
export function ftsQuery(q, { ligatures = false } = {}) {
  const words = (ligatures ? fold(q) : flat(q)).match(/[\p{L}\p{N}]+/gu) ?? [];
  return { words, match: words.map((w) => `"${w}"*`).join(" ") };
}

/** A short excerpt around the first word found. */
export function snippet(body, words, len = 220) {
  if (!body) return "";
  const text = String(body).replace(/\s+/g, " ");
  // Folded on both sides, so "oeuvre" lands on "œuvre" whichever way the
  // words came (a ligature before the word moves the start by one character).
  const low = fold(text);
  let at = -1;
  for (const w of words) {
    at = low.indexOf(fold(w));
    if (at >= 0) break;
  }
  const start = Math.max(0, at - 60);
  return (start > 0 ? "..." : "") + text.slice(start, start + len) + (start + len < text.length ? "..." : "");
}

/**
 * THE WEIGHT IN THE RANKING (weights.mjs): a nudge, never the main criterion.
 * A fused score moves by at most a sixth either way, so the meaning of the
 * question still decides; between close candidates, the note that counts
 * more comes first. Shared with the cloud Worker: same order on both sides.
 */
export const WEIGHT_PULL = 0.3;
export const weighted = (score, w) => score * (1 + WEIGHT_PULL * ((w ?? 0.5) - 0.5));

/**
 * A long note as an AI receives it by default: cut at a paragraph break past
 * `limit` characters (a note barely longer stays whole), with what was left.
 */
export const BODY_LIMIT = 6000;
export const LINKS_LIMIT = 20;
export function cutBody(body, limit = BODY_LIMIT) {
  const text = String(body ?? "");
  if (text.length <= limit * 1.2) return { body: text, cut: null };
  const at = text.lastIndexOf("\n\n", limit);
  const end = at > limit * 0.6 ? at : limit;
  return { body: `${text.slice(0, end).trimEnd()}\n\n[...]`, cut: { shown: end, total: text.length, more: "brain_get with full: true gives the whole text" } };
}

/** Rows of { slug, v: Float32Array, norm }: the closest to a query vector. */
export function nearest(rows, query, limit, exclude = new Set()) {
  let qn = 0;
  for (const x of query) qn += x * x;
  qn = Math.sqrt(qn) || 1;
  const scored = [];
  for (const r of rows) {
    if (exclude.has(r.slug)) continue;
    let dot = 0;
    for (let i = 0; i < r.v.length; i++) dot += r.v[i] * query[i];
    scored.push({ slug: r.slug, score: dot / (qn * r.norm) });
  }
  return scored.sort((a, b) => b.score - a.score || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).slice(0, limit);
}

export const normOf = (v) => {
  let n = 0;
  for (const x of v) n += x * x;
  return Math.sqrt(n) || 1;
};

/** Contacts: every word, anywhere in what is known of them, accents ignored; core first. */
export function matchContacts(contacts, terms, { limit = 20 } = {}) {
  const words = fold(terms).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return contacts
    .filter((c) => {
      const text = fold(Object.values(c).flat().filter((v) => typeof v === "string" || typeof v === "number").join(" "));
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || Number(b.sent ?? 0) - Number(a.sent ?? 0))
    .slice(0, limit);
}

// ONE CLOCK FOR THE WHOLE BRAIN (2026-11-19). A source counted its rhythm
// from its own last run: each drifted by the length of its runs, a judge's
// cycle pushed back those that had run with it, and after a day nine sources
// "every quarter of an hour" ran at four different moments, each followed by
// its own rebuild of the index. A rhythm is now a tick of the clock: "30m" is
// :00 and :30 for every source, whatever happened before. What a tick finds
// busy (a judge still reading) runs right after, late, and the next tick is
// on time again.
/**
 * Where the ticks are counted from, in milliseconds: the local clock (so that
 * "hour" is the top of the hour in every time zone). HVBRAIN_TICK_ORIGIN puts
 * it elsewhere: the test bench, which cannot wait for a real tick.
 */
export const clockOrigin = () => {
  const forced = process.env.HVBRAIN_TICK_ORIGIN;
  return forced !== undefined && forced !== "" && Number.isFinite(Number(forced)) ? Number(forced) : new Date().getTimezoneOffset() * 60_000;
};
/** Has a tick of `ms` fallen between `last` and `now`? */
export const tickPassed = (last, now, ms, origin = clockOrigin()) => Math.floor((now - origin) / ms) > Math.floor((last - origin) / ms);
/** The first tick of `ms` after a moment. */
export const nextTick = (after, ms, origin = clockOrigin()) => (Math.floor((after - origin) / ms) + 1) * ms + origin;

/**
 * A source's rhythm in milliseconds (hub.mjs): "5m", "30m", "hour". Null for
 * "day" and "week", which are the evening's.
 */
export function interval(every) {
  const m = /^(\d+)\s*m$/.exec(String(every ?? ""));
  if (m) return Math.max(1, Number(m[1])) * 60_000;
  const h = /^(\d+)\s*h$/.exec(String(every ?? ""));
  if (h) return Math.max(1, Number(h[1])) * 3600_000;
  if (every === "hour") return 3600_000;
  return null;
}

// The words of a note's format, by the brain's language (see lib.mjs).
export const VOCAB = {
  en: {
    keys: { type: "type", title: "title", domains: "domains", status: "status", visibility: "visibility", created: "created", updated: "updated", source: "source", nature: "nature", data: "data" },
    status: { seed: "seed", trusted: "trusted", archived: "archived" },
    visibility: { public: "public", internal: "internal", private: "private" },
    nature: { lesson: "lesson", decision: "decision", feedback: "feedback" },
  },
  fr: {
    keys: { type: "type", title: "titre", domains: "domaines", status: "statut", visibility: "visibilite", created: "cree", updated: "touche", source: "source", nature: "nature", data: "donnees" },
    status: { seed: "graine", trusted: "fiable", archived: "archive" },
    visibility: { public: "public", internal: "interne", private: "prive" },
    nature: { lesson: "lecon", decision: "decision", feedback: "retour" },
  },
};

// A FILTER'S VALUE, WHATEVER WORD THE AI USED FOR IT (2026-11-22). An audit of
// real conversations: the person's instructions said `nature: "lecon"`, their
// brain (English format) says `lesson`, and 7 searches of lessons in 8 came
// back empty or in error. A value is now taken in either language, with or
// without accents, capitals or a final s, and given back as the brain writes
// it. Nothing is guessed beyond that: an unknown value stays unknown, and the
// caller says which values the brain has.
const NATURE_WORDS = { lesson: ["lessons", "lecons", "learning", "learnings"], decision: ["decisions", "choix"], feedback: ["feedbacks", "retours", "avis"] };
/** The canonical nature a word stands for (lesson, decision, feedback), or null. */
export function natureOf(word) {
  const w = fold(word).trim();
  for (const [canon, more] of Object.entries(NATURE_WORDS)) {
    if (w === canon || more.includes(w) || Object.values(VOCAB).some((v) => v.nature[canon] === w)) return canon;
  }
  return null;
}
/**
 * The value among `known` that `value` means, else `value` itself.
 * `aliases`: other names of a known value ({ known: [names] }: a type's
 * folder, a domain's label). For a nature, the other language's word counts.
 */
export function pickKnown(value, known, { kind = "", aliases = {} } = {}) {
  const v = String(value ?? "");
  if (!v || known.includes(v)) return v;
  const key = (s) => fold(s).trim().replace(/[\s_-]+/g, "-");
  const bare = (s) => key(s).replace(/s$/, "");
  const names = (k) => [k, ...(aliases[k] ?? [])];
  const exact = known.find((k) => names(k).some((n) => key(n) === key(v)));
  if (exact) return exact;
  const plural = known.find((k) => names(k).some((n) => bare(n) === bare(v)));
  if (plural) return plural;
  if (kind === "nature") {
    const canon = natureOf(v);
    const same = canon && known.find((k) => natureOf(k) === canon);
    if (same) return same;
  }
  return v;
}

// HYBRID SEARCH. By words, every word must appear: precise on a name, a
// number, an exact term, but a question in plain language ("what do I think
// of fear") finds nothing. By meaning, the reverse. Hybrid search asks both
// and fuses the rankings, so neither has to be guessed by the AI beforehand.

// The small words a question in plain language carries: kept out of the
// relaxed word search (any word may appear), where they would match every note.
export const STOP = new Set(
  ("a au aux avec ce ces cette dans de des du elle en et eux il ils je la le les leur lui ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sur ta te tes toi ton tu un une vos votre vous c d j l m n s t y est sont ai as avez ont fait faire plus tout tous quel quelle quels quoi comment pourquoi quand " +
    "an and are as at be by for from has have he her his how i in is it its of on or she that the their them they this to was we what when where which who why will with you your about do does did can")
    .split(" "),
);

/** Any of the meaningful words may appear: the relaxed half of hybrid search. */
export function ftsAny(q, { ligatures = false } = {}) {
  const words = [...new Set(((ligatures ? fold(q) : flat(q)).match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => !STOP.has(w) && (w.length > 1 || /\d/.test(w))))];
  return { words, match: words.map((w) => `"${w}"*`).join(" OR ") };
}

/**
 * Reciprocal rank fusion: each ranking gives an item 1 / (k + rank), the
 * sums are the fused ranking. It needs no common scale between the rankings,
 * which a bm25 and a cosine never share. `lists` are arrays of keys, best
 * first; returns [{ key, score, from: [index of each list it came from] }].
 */
export function fuse(lists, { k = 60, weights = [] } = {}) {
  const acc = new Map();
  lists.forEach((list, li) => {
    const w = weights[li] ?? 1;
    list.forEach((key, rank) => {
      const a = acc.get(key) ?? { key, score: 0, from: [] };
      a.score += w / (k + rank + 1);
      if (!a.from.includes(li)) a.from.push(li);
      acc.set(key, a);
    });
  });
  // Ties broken by the key: the computer and the cloud must agree to the letter.
  return [...acc.values()].sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

// WHERE TO GO NEXT. An AI that opens a note rarely follows its links (one
// conversation in eighteen, measured on 2026-11-07): a link does not say why
// it is there, and a hub note lists hundreds. So an opened note proposes the
// two or three linked notes closest to the question being asked (the last
// search of the conversation, else the note itself), each with the sentence
// that links them, or, when there is none, what the note is about. A precise
// lead is followed; a list of 280 links is not. Shared with the cloud Worker.
const SENTENCE = /[^.!?\n]*\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\][^.!?\n]*[.!?]?/g;
export function linkReason(body, target) {
  for (const m of String(body ?? "").matchAll(SENTENCE)) {
    if (m[1].trim() !== target) continue;
    // A sentence that is only the link ("See [[x]].") says nothing of why.
    const rest = m[0].replace(/\[\[[^\]]*\]\]/g, " ").replace(/\b(voir|see|cf|aussi|also)\b/gi, " ").match(/[\p{L}\p{N}]{3,}/gu) ?? [];
    if (rest.length < 4) continue;
    const s = m[0].replace(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a).replace(/\s+/g, " ").trim();
    return s.length > 180 ? `${s.slice(0, 177)}...` : s;
  }
  return null;
}
export function aboutOf(body) {
  const text = String(body ?? "").replace(/^#.*$/gm, " ").replace(/\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g, (_, a, b) => b || a).replace(/[*_`>]/g, "").replace(/\s+/g, " ").trim();
  const first = /^.{20,}?[.!?](?=\s|$)/.exec(text)?.[0] ?? text;
  return first.length > 160 ? `${first.slice(0, 157)}...` : first;
}
export const cosine = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
};
/**
 * The leads of an opened note. `me`: { slug, body }; `candidates`: the linked
 * notes { slug, title, type, body, dir: "out"|"in", vec } (vec may be null);
 * `toward`: the vector to measure against (the question, else the note).
 */
export function pickLeads(me, candidates, toward, limit = 3) {
  return candidates
    .map((c) => ({ c, score: toward && c.vec ? cosine(toward, c.vec) : 0 }))
    .sort((a, b) => b.score - a.score || (a.c.slug < b.c.slug ? -1 : a.c.slug > b.c.slug ? 1 : 0))
    .slice(0, limit)
    .map(({ c }) => {
      const why = c.dir === "out" ? linkReason(me.body, c.slug) : linkReason(c.body, me.slug);
      return why ? { slug: c.slug, title: c.title, type: c.type, why } : { slug: c.slug, title: c.title, type: c.type, about: aboutOf(c.body) };
    });
}
