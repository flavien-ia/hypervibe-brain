// suggest.mjs - What the brain may have to say about a request, said before
// the AI answers it, and only when it is relevant.
//
// Why: told to "query the brain when the answer depends on the person", an AI
// mostly does not (74 conversations connected, 18 queried it, 2026-11-05):
// it does not know what the brain holds. So at each message of the person, a
// hook (hook-suggest.mjs) asks this module for the few notes closest to it,
// and slips their titles into the context, a few hundred tokens.
//
// WHAT CHANGED ON 2026-11-22, AFTER AN AUDIT OF REAL CONVERSATIONS. Over two
// weeks, 3.8 % of the suggestions were opened, and barely one in three was
// relevant. Four causes, four answers:
//  - by meaning alone, a name was missed ("Paul Garnier" brought three other
//    people): a note NAMED in the message (all the words of its title are
//    there, and few notes share them) is now suggested first, the words half
//    of a mixed search;
//  - the gate (0.55 of closeness to the whole message) let in what was merely
//    about the same world: a note must now reach a higher closeness AND be
//    near the best closeness of the message (measured on the real index, see
//    DEFAULTS);
//  - "yes", "go on", "check that the price is the same" got notes too: a
//    message with fewer than `minWords` meaningful words, the words of
//    execution aside ("yes", "push", "continue", "check"...), gets nothing by
//    meaning;
//  - one type of note, very numerous, took every place (262 notes of talks
//    given came up as soon as a message spoke of AI): past `perType` notes of
//    one type, a further one passes only when it is clearly closer than what
//    the other types offer. Several of one type stay possible.
// Each suggestion now carries its closest sentence, so that the AI judges
// without opening the note. Every value is the brain's to change, in its
// brain.json, under `suggest` (docs/reglages.md).
//
// IT READS THE INDEX AS IT IS (2026-11-21): `db` is whatever index the caller
// opened (engine.mjs, currentDb), and nothing here builds one. The vector of
// the message is asked ONCE, for the notes and for the lessons, and kept
// nowhere. `timeout` is how long the embeddings API may take.

import { questionVector, search, weightsOf } from "./engine.mjs";
import { embeddingsAvailable } from "./embeddings.mjs";
import { config, loadEnv } from "./lib.mjs";
import { aboutOf, fold, ftsAny, natureOf, weighted } from "./pure.mjs";

// THE DEFAULTS, MEASURED ON A REAL BRAIN (2026-11-22, 1,640 notes searchable,
// 1,670 messages of the usage journal replayed; the measure is in the report
// of version 0.9.3). See docs/reglages.md for what each one does.
export const DEFAULTS = {
  // Meaningful words a message needs, the words of execution aside, to be looked up by meaning.
  minWords: 6,
  // The closeness by meaning a note must reach...
  gate: 0.6,
  // ...and how far below the best closeness of the message it may be.
  margin: 0.05,
  // How many notes and lessons at most.
  notes: 4,
  lessons: 2,
  // Notes of one type before the others get their turn, and how much closer a further one must be to pass anyway.
  perType: 2,
  typeMargin: 0.03,
  // A note named in the message (every word of its title) is suggested, if at most `nameSpread` notes hold those words.
  names: true,
  nameSpread: 12,
  // A word the message writes with a capital names the notes whose title holds it, when they are at most this many.
  titleSpread: 2,
  // The length of the sentence shown with each suggestion.
  excerpt: 160,
  // Words of execution added to the plugin's ("valide"), or taken out of them ("-lance").
  execution: [],
};
// Kept for the callers of before (the live view reads it).
export const GATE = DEFAULTS.gate;

// THE WORDS OF EXECUTION, in French and English, folded (no accent): a
// message made only of them is an agreement or an order to go on, and the
// brain has nothing to add to it. They are not counted among the meaningful
// words of a message; they are still read in it (a title may hold one).
const EXECUTION = (
  // French
  "oui ouais ok okay oki dac daccord accord parfait super top nickel genial excellent impeccable merci bien bon bravo cool " +
  "go vas va vasy allez allons continue continues continuer continuons poursuis poursuivre poursuit poursuivons enchaine enchainer enchaines " +
  "suite suivant suivante suivants suivantes ensuite apres puis etape etapes lance lancer lances relance relancer pousse pousser pousses push pushe " +
  "commit commite deploie deployer deploye mets mettre met remets ligne fais faire fait refais refaire verifie verifier verifies regarde regarder " +
  "corrige corriger applique appliquer appliques valide valider termine terminer finis finir fini attends attendre arrete stop non si " +
  "tout toute toutes tous ca cela ceci celui celle voila alors aussi encore juste simplement maintenant donc reprends reprendre essaie essaye " +
  "teste tester relis relire ouvre ouvrir ferme fermer garde supprime supprimer efface annule ajoute ajouter enleve retire mm meme " +
  // English
  "yes yeah yep yup sure fine great perfect nice good thanks thank please ahead proceed next keep going carry push pushed deploy ship " +
  "commit merge run rerun redo check verify fix apply done right alright lgtm let lets now then also again just try open close remove " +
  "delete add stop no not go okay"
).split(/\s+/);

/** The brain's settings for the suggestions: its brain.json `suggest`, over the defaults. */
export function settings(over = {}) {
  let own = {};
  try {
    own = config().suggest ?? {};
  } catch {
    own = {};
  }
  const s = { ...DEFAULTS, ...own, ...over };
  const words = new Set(EXECUTION);
  for (const w of [].concat(s.execution ?? [])) {
    const f = fold(w).trim();
    if (f.startsWith("-")) words.delete(f.slice(1).trim());
    else if (f) words.add(f);
  }
  s.executionWords = words;
  return s;
}

/**
 * The message as the brain reads it: what is not the person's own words
 * (blocks of code, addresses, paths) is left out, a pasted log would
 * otherwise look like a long and meaningful request.
 */
export function cleanMessage(text) {
  return String(text ?? "")
    .slice(0, 4000)
    .replace(/```[\s\S]*?(```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/<([a-z-]+)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, " ")
    .replace(/(?:[A-Za-z]:)?[\\/]?(?:[\w.-]+[\\/]){2,}[\w.-]*/g, " ")
    .slice(0, 2000);
}

/**
 * Whether a message is worth looking up: its meaningful words, the words of
 * execution aside. `ok` is false for a short message or one of pure
 * execution ("yes go", "check that the price is the same").
 */
export function prefilter(text, s = settings()) {
  const all = ftsAny(cleanMessage(text), { ligatures: true }).words.filter((w) => !/^\d+$/.test(w));
  const content = all.filter((w) => !s.executionWords.has(w));
  return { ok: content.length >= s.minWords, count: content.length, words: content, all };
}

/**
 * The words a message writes with a capital, folded: true when the word is
 * inside a sentence (a capital there marks a name), false when it opens one.
 */
export function capitalsOf(text) {
  const out = new Map();
  for (const sentence of cleanMessage(text).split(/(?<=[.!?:;])\s+|\n+/)) {
    const tokens = sentence.match(/[\p{L}\p{N}]+/gu) ?? [];
    tokens.forEach((t, i) => {
      if (!/^\p{Lu}/u.test(t)) return;
      const w = fold(t).replace(/œ/g, "oe").replace(/æ/g, "ae");
      out.set(w, Boolean(out.get(w)) || i > 0);
    });
  }
  return out;
}

/** Whether this index stores œ and æ written out (build.mjs, version 2). */
const ligaturesOf = (db) => {
  try {
    return Number(String(db.prepare("SELECT v FROM meta WHERE k = 'schema'").get()?.v ?? "").split("|")[0]) >= 2;
  } catch {
    return false;
  }
};

/**
 * THE NOTES NAMED IN THE MESSAGE: every meaningful word of the title is in
 * it, and those words together are rare in the brain (a title that is a
 * common word, "Tech", "Art", names nothing). The words half of the mixed
 * search: a name is what meaning alone misses.
 */
function namedNotes(db, words, s, skip, capitals = new Map()) {
  const present = new Set(words);
  const asked = [...present].filter((w) => w.length > 1);
  if (!asked.length) return [];
  const lig = { ligatures: ligaturesOf(db) };
  let rows = [];
  try {
    rows = db.prepare("SELECT f.slug, f.title, f.type, f.rel, f.body FROM fts JOIN fiche f ON f.slug = fts.slug WHERE fts MATCH ? LIMIT 400").all(`title : (${asked.map((w) => `"${w}"`).join(" OR ")})`);
  } catch {
    return [];
  }
  const spread = db.prepare("SELECT COUNT(*) n FROM fts WHERE fts MATCH ?");
  const out = [];
  for (const r of rows) {
    if (skip(r)) continue;
    const t = ftsAny(r.title, lig).words;
    if (!t.length || !t.every((w) => present.has(w))) continue;
    // One short word is not a name ("IA", "Art"), nor a title made only of
    // words of execution; and a title of one word is a name only when the
    // message writes it as one, with a capital ("Acme", not "an image parallax").
    if (t.length === 1 && (t[0].length < 4 || !capitals.has(t[0]))) continue;
    if (t.every((w) => s.executionWords.has(w))) continue;
    let n = Infinity;
    try {
      n = spread.get(t.map((w) => `"${w}"`).join(" ")).n;
    } catch {
      n = Infinity;
    }
    if (n <= s.nameSpread) out.push({ ...r, named: true, spread: n, words: t.length });
  }
  // A PART OF A NAME: a word the message writes with a capital, inside a
  // sentence (not its first word), rare in the whole brain (at most
  // `nameSpread` notes say it: a capitalised label of an interface, "Index",
  // is not a name), that the title of one or two notes only holds ("Garnier"
  // for Paul Garnier, "Lumen" for a talk at Lumen Days).
  const holders = db.prepare("SELECT COUNT(*) n FROM fts WHERE fts MATCH ?");
  for (const [w, inside] of capitals) {
    if (!inside || w.length < 4 || s.executionWords.has(w) || out.some((o) => ftsAny(o.title, lig).words.includes(w))) continue;
    let n = Infinity;
    try {
      n = holders.get(`title : "${w}"`).n;
    } catch {
      n = Infinity;
    }
    if (n > s.titleSpread) continue;
    try {
      if (spread.get(`"${w}"`).n > s.nameSpread) continue;
    } catch {
      continue;
    }
    for (const r of rows) if (!skip(r) && !out.some((o) => o.slug === r.slug) && ftsAny(r.title, lig).words.includes(w)) out.push({ ...r, named: true, spread: n, words: 0 });
  }
  // The most precise first: more words in the title, fewer notes sharing them.
  return out.sort((a, b) => b.words - a.words || a.spread - b.spread || (a.slug < b.slug ? -1 : 1));
}

/**
 * The sentence of a note closest to the message: the one that holds the most
 * of its meaningful words, else what the note is about. Short.
 */
export function closestSentence(body, words, max = DEFAULTS.excerpt) {
  const text = String(body ?? "")
    .replace(/^#.*$/gm, " ")
    .replace(/\[\[([^\]|#]+)(?:[|#]([^\]]*))?\]\]/g, (_, a, b) => b || a)
    .replace(/[*_`>]/g, "")
    .replace(/^\s*[-+]\s+/gm, "");
  const keys = [...new Set(words.filter((w) => w.length >= 4))];
  let best = "";
  let score = 0;
  for (const raw of text.split(/(?<=[.!?])\s+|\n+/)) {
    const sentence = raw.replace(/\s+/g, " ").trim();
    if (sentence.length < 25) continue;
    const low = fold(sentence);
    const n = keys.filter((w) => low.includes(w)).length;
    if (n > score) {
      best = sentence;
      score = n;
    }
  }
  const s = best || aboutOf(body);
  return s.length > max ? `${s.slice(0, max - 3).trimEnd()}...` : s;
}

/**
 * THE DIVERSITY OF TYPES. The candidates are taken best first; past
 * `perType` notes of one type, the next of that type is taken only when it is
 * closer by `typeMargin` than the best of another type still waiting, or when
 * no other type is waiting. A named note is never held back.
 */
export function diversify(candidates, { limit, perType, typeMargin }) {
  const left = [...candidates];
  const taken = [];
  const count = new Map();
  const full = (c) => !c.named && (count.get(c.type) ?? 0) >= perType;
  while (taken.length < limit && left.length) {
    let i = 0;
    if (full(left[0])) {
      const j = left.findIndex((c) => !full(c));
      if (j > 0 && left[0].rank < left[j].rank + typeMargin) i = j;
    }
    const [c] = left.splice(i, 1);
    taken.push(c);
    count.set(c.type, (count.get(c.type) ?? 0) + 1);
  }
  return taken;
}

/** @returns {Promise<{ notes: object[], lessons: object[] }>} */
// (The live view's server asks without saying how long: 800 milliseconds,
// within the second the hook waits for it.)
export async function suggest(db, prompt, { seen = new Set(), timeout = 800, ...over } = {}) {
  const none = { notes: [], lessons: [] };
  const s = settings(over);
  const pre = prefilter(prompt, s);
  if (!pre.count) return none;
  const archived = new Set(db.prepare("SELECT slug FROM fiche WHERE status = 'archived'").all().map((r) => r.slug));
  const hidden = (config().search?.hidden ?? []).map((p) => `vault/${String(p).replace(/\\/g, "/").replace(/^\/+/, "")}`);
  const skip = (r) => !r.slug || seen.has(r.slug) || archived.has(r.slug) || hidden.some((p) => String(r.rel ?? "").replace(/\\/g, "/").startsWith(p));
  const bodyOf = db.prepare("SELECT body, rel FROM fiche WHERE slug = ?");

  // The words half: the notes the message names, even in a short message.
  const named = s.names ? namedNotes(db, pre.all, s, skip, capitalsOf(prompt)) : [];

  // The meaning half, for a message long enough to say what it is about.
  let near = [];
  let best;
  let learned = [];
  loadEnv();
  if (pre.ok && embeddingsAvailable()) {
    let vector = null;
    try {
      vector = await questionVector(cleanMessage(prompt), { timeout });
    } catch {
      vector = null; // the API is slow or down: the names alone, and no waiting
    }
    if (vector) {
      const W = weightsOf(db);
      // Closeness gates, the weight of a note orders what passes.
      const gateOf = (rows) => {
        const best = rows.reduce((m, r) => Math.max(m, r.score ?? 0), 0);
        return rows
          .filter((r) => (r.score ?? 0) >= s.gate && (r.score ?? 0) >= best - s.margin)
          .map((r) => ({ ...r, ...bodyOf.get(r.slug), rank: weighted(r.score, W.get(r.slug)) }))
          .filter((r) => !skip(r));
      };
      const text = cleanMessage(prompt);
      const rows = await search(db, text, { by: "meaning", vector, limit: 30, entries: false });
      best = rows.reduce((m, r) => Math.max(m, r.score ?? 0), 0);
      near = gateOf(rows);
      // The lessons that may apply to the task, whatever their rank among the
      // notes: the natures of this brain that mean a lesson (lesson, lecon...).
      try {
        const natures = db.prepare("SELECT DISTINCT nature FROM facet WHERE nature IS NOT NULL").all().map((r) => r.nature).filter((n) => natureOf(n) === "lesson");
        const found = [];
        for (const nature of natures) found.push(...(await search(db, text, { by: "meaning", vector, limit: s.lessons + 4, nature })));
        learned = gateOf(found).sort((a, b) => b.rank - a.rank).slice(0, s.lessons);
      } catch {
        learned = [];
      }
    }
  }

  // Named first, then by meaning; a note found both ways counts once, named.
  const lessonSlugs = new Set(learned.map((l) => l.slug));
  const pool = new Map();
  for (const n of named) if (!lessonSlugs.has(n.slug)) pool.set(n.slug, { ...n, rank: 2 });
  for (const n of near.sort((a, b) => b.rank - a.rank)) if (!pool.has(n.slug) && !lessonSlugs.has(n.slug)) pool.set(n.slug, n);
  const picked = diversify([...pool.values()], { limit: s.notes, perType: s.perType, typeMargin: s.typeMargin });
  const out = (r) => ({ slug: r.slug, title: r.title, type: r.type, ...(r.score !== undefined ? { score: r.score } : {}), ...(r.named ? { named: true } : {}), excerpt: closestSentence(r.body, pre.all, s.excerpt) });
  return { notes: picked.map(out), lessons: learned.map(out), ...(best !== undefined ? { best } : {}) };
}

/** The text slipped into the AI's context: titles, slugs and one sentence each. */
export function render({ notes, lessons }, { fr = true } = {}) {
  if (!notes.length && !lessons.length) return "";
  const line = (r) => `- ${r.title} [${r.slug}]${r.type ? ` (${r.type})` : ""}${r.excerpt ? (fr ? ` : « ${r.excerpt} »` : `: "${r.excerpt}"`) : ""}`;
  const out = [fr ? "Le second brain a peut-être de quoi éclairer cette demande (à ouvrir avec brain_get si c'est utile, sinon à ignorer) :" : "The second brain may have something on this request (open with brain_get if useful, otherwise ignore):"];
  if (notes.length) out.push(...notes.map(line));
  if (lessons.length) out.push(fr ? "Leçons qui pourraient s'appliquer :" : "Lessons that may apply:", ...lessons.map(line));
  return out.join("\n");
}
