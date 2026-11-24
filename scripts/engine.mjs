// engine.mjs - The five questions a brain answers, shared by the command line
// (query.mjs) and by the MCP server that Claude calls (mcp.mjs). One engine,
// so that Claude and the person at the keyboard always get the same answer.
//
// EVERY NOTE IS READ, PRIVATE ONES TOO (2026-11-21, the person's decision).
// The brain is there to be read by their AI: a private note used to come back
// as a mask, its text out of search and of meaning. `visibility` now says only
// what may leave this computer (the cloud copy, cloud.mjs and its Worker, keep
// their own rule). `includePrivate` is still accepted, and changes nothing.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildIndex, openDb } from "./build.mjs";
import { BRAIN, ROOT, config, listFiches, loadEnv, parseFiche, readJsonFile, sha256, vocab, writeFileAtomic } from "./lib.mjs";

// The index keeps the canonical words (seed, private...); what the engine
// returns speaks the brain's own (graine, prive in a French brain).
const say = (kind, v) => {
  try {
    return vocab()[kind][v] ?? v;
  } catch {
    return v;
  }
};
const sayKeys = (kind, o) => Object.fromEntries(Object.entries(o).map(([k, n]) => [say(kind, k), n]));
import { embed, embeddingsAvailable } from "./embeddings.mjs";
import { cutBody, ftsAny, ftsQuery, fuse, nearest as nearestRows, pickKnown, pickLeads, snippet, weighted } from "./pure.mjs";
import { readWeights } from "./weights.mjs";
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { HOME } from "./lib.mjs";

/**
 * Always answer from an up-to-date index: brought up to date on the fly when a
 * note moved (only the notes that changed are written again, build.mjs).
 * `vectors: false` brings the text alone up to date, the vectors owed are
 * computed by refreshVectors right after the answer, in a program of its own.
 * `resident`: the caller stays up and answers bursts of questions; the look
 * at the vault it took less than a second ago is not taken again.
 *
 * A BUILD THAT FAILS NEVER FAILS THE ANSWER (2026-11-21). A note moved while
 * the vault was being walked, an index held by another program beyond
 * SQLite's patience, a vector's file in use: each of these was the answer the
 * AI received, while the index of a moment before was there to be read. Now
 * the answer comes from that index, with a `warning`, and `buildError` gives
 * the cause to the usage journal (tool.mjs, mcp.mjs).
 */
export async function freshDb({ vectors = true, resident = false } = {}) {
  let r = { ok: true, owed: false, errors: [] };
  let buildError = null;
  try {
    r = await buildIndex({ quiet: true, ifStale: true, vectors, maxAge: resident ? 1000 : 0 });
  } catch (e) {
    buildError = String(e?.message ?? e).slice(0, 300);
  }
  const db = openDb({ readonly: true });
  if (!db) throw new Error(buildError ? `the index could not be built (${buildError})` : "the index does not exist yet: run pnpm build");
  const n = r.errors?.length ?? 0;
  const warning = buildError
    ? `the index could not be refreshed (${buildError}); answers come from the previous index`
    : r.ok || !n
      ? null
      : `the index could not be refreshed for ${n} note${n > 1 ? "s that are" : " that is"} not valid (${n > 1 ? "first: " : ""}${r.errors[0].rel}: ${r.errors[0].msg}); the index keeps what it knew of ${n > 1 ? "them" : "it"}, the other notes are up to date`;
  return { db, owed: Boolean(r.owed), warning, buildError };
}

/**
 * THE INDEX AS IT IS, read only, nothing built (2026-11-21): for what must
 * answer at once and can live with an index a few minutes late (the hook that
 * suggests notes at each message, the live view's own route for it). Throws
 * when there is no index yet. The caller closes it.
 */
export function currentDb() {
  const db = openDb({ readonly: true });
  if (!db) throw new Error("the index does not exist yet: run pnpm build");
  return db;
}

/**
 * THE VECTORS, IN A PROGRAM OF THEIR OWN (2026-11-21). They used to be
 * computed "in the background" of the server that had just answered, but a
 * build runs without a pause until its first call to the API: the answer left
 * only after the notes were read and written again and 2,300 vector files
 * opened (about three seconds, measured), and the server answered nothing else
 * meanwhile. Now a build with vectors is started apart (build.mjs --if-stale),
 * one at a time and fifteen seconds apart at least; it holds the build's lock,
 * so questions asked meanwhile read the index as it is. Search by meaning
 * catches up on the new notes when it ends, usually within seconds.
 */
export const background = { running: false, last: null };
let refreshedAt = 0;
export function refreshVectors() {
  if (background.running || Date.now() - refreshedAt < 15_000) return;
  background.running = true;
  refreshedAt = Date.now();
  const done = (ok) => {
    background.running = false;
    background.last = { at: new Date().toISOString(), ok };
  };
  try {
    const script = join(dirname(fileURLToPath(import.meta.url)), "build.mjs");
    const child = spawn(process.execPath, [script, "--quiet", "--if-stale"], { env: { ...process.env, ...(BRAIN ? { HVBRAIN_DIR: BRAIN } : {}) }, stdio: "ignore", windowsHide: true, detached: true });
    child.on("error", () => done(false));
    child.on("exit", (code) => done(code === 0));
    // A program that answers one question and leaves does not wait for it.
    child.unref();
  } catch {
    done(false);
  }
}

// A vector whose note is not in the index (read between two writes of an
// index of before, 2026-11-21) gives no row: `rowOf` then says null, and the
// search goes on without it instead of breaking.
const row = (r) => ({ ...r, domains: JSON.parse(r.domains || "[]") });
const rowOf = (r) => (r ? row(r) : null);

/** A number of results asked for, kept within bounds (a negative one meant "all"). */
const bounded = (v, fallback, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : fallback;
};

// What a program that stays up keeps in memory is read again when its part
// of the index moved (build.mjs writes rev_vec, rev_cat, rev_weight); an
// index of before only has the date of its last build.
const rev = (db, k) => db.prepare("SELECT v FROM meta WHERE k = ?").get(k)?.v ?? db.prepare("SELECT v FROM meta WHERE k = 'built'").get()?.v;
/** Whether this index stores œ and æ written out (build.mjs, version 2): the question is then folded the same way. */
const ligatures = (db) => Number(String(db.prepare("SELECT v FROM meta WHERE k = 'schema'").get()?.v ?? "").split("|")[0]) >= 2;

let vecCache = null;
function allVectors(db) {
  const built = rev(db, "rev_vec");
  if (vecCache?.built === built) return vecCache.rows;
  const rows = db.prepare("SELECT slug, vec FROM vec").all().map((r) => {
    const buf = Buffer.from(r.vec);
    const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    let n = 0;
    for (const x of v) n += x * x;
    return { slug: r.slug, v, norm: Math.sqrt(n) || 1 };
  });
  vecCache = { built, rows };
  return rows;
}

// THE CATALOGUE'S VECTORS (catalogue.mjs), cached like the notes' ones.
let entryCache = null;
function entryVectors(db) {
  const built = rev(db, "rev_cat");
  if (entryCache?.built === built) return entryCache.rows;
  let rows = [];
  try {
    rows = db.prepare("SELECT address, vec FROM entry_vec").all().map((r) => {
      const buf = Buffer.from(r.vec);
      const v = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
      let n = 0;
      for (const x of v) n += x * x;
      return { slug: r.address, v, norm: Math.sqrt(n) || 1 };
    });
  } catch {
    rows = []; // an index built before the catalogue
  }
  entryCache = { built, rows };
  return rows;
}

/** A catalogue entry as search gives it back: an address, not a slug. */
const asEntry = (e, words, score) => ({
  address: e.address,
  catalogue: true,
  tool: e.tool,
  title: e.title,
  ...(e.date ? { date: e.date } : {}),
  ...(e.url ? { url: e.url } : {}),
  ...(score !== undefined ? { score } : {}),
  excerpt: words ? snippet(e.excerpt, words) : e.excerpt,
});

// How much each note counts (weights.mjs), cached like the vectors.
let weightCache = null;
export function weightsOf(db) {
  const built = rev(db, "rev_weight");
  if (weightCache?.built === built) return weightCache.map;
  weightCache = { built, map: readWeights(db) };
  return weightCache.map;
}

// (The closest vectors are ranked by pure.mjs, shared with the cloud Worker:
// same ranking here and there.)

// FOLDERS HIDDEN FROM SEARCH. A brain can keep folders out of search and
// neighbours unless asked (brain.json, search.hidden: ["people/directory/"]):
// hundreds of near-identical notes of contacts would drown the ideas. They
// stay readable by brain_get, and `everything` brings them back.
const hiddenPrefixes = () => (config().search?.hidden ?? []).map((p) => String(p).replace(/\\/g, "/").replace(/^\/+/, ""));
const isHidden = (rel) => {
  const r = String(rel ?? "").replace(/\\/g, "/").replace(/^vault\//, "");
  return hiddenPrefixes().some((p) => r.startsWith(p));
};

/** A note's facets: its nature, and the addresses of the data it routes to. */
function facets(db, slug) {
  let r;
  try {
    r = db.prepare("SELECT nature, data FROM facet WHERE slug = ?").get(slug);
  } catch {
    return { nature: null, data: [] }; // an index built before the facets
  }
  return { nature: r?.nature ?? null, data: r?.data ? JSON.parse(r.data) : [] };
}

// THE VECTOR OF A QUESTION DOES NOT WAIT FOR A SLOW API (2026-11-21). It was
// asked with the patience of a batch of 64 notes, ninety seconds: with the API
// slow or down, a search fell back on the words after a minute and a half,
// the server answered nothing else meanwhile, and the next search waited just
// as long. A question now waits three seconds; and after a failure nobody
// asks for a minute (a small file, so that every program of the brain knows,
// the hook included): searches go by words alone meanwhile.
const QUESTION_TIMEOUT = 3000;
const DOWN_MS = 60_000;
const DOWN = () => join(HOME, ".hypervibe-brain", "embeddings-down.json");
let downUntil = 0;
function apiDown() {
  if (Date.now() < downUntil) return true;
  try {
    const until = Number(JSON.parse(readFileSync(DOWN(), "utf8")).until);
    if (Date.now() < until) {
      downUntil = until;
      return true;
    }
  } catch {
    // no such file: the API answered the last time it was asked
  }
  return false;
}
/**
 * The vector of a question, straight from the API and kept nowhere: for a
 * text nobody asks twice (the messages the hook looks at, suggest.mjs).
 * @param {string} q
 * @param {{ timeout?: number }} [o] how long the API may take, in milliseconds
 */
export async function questionVector(q, { timeout = QUESTION_TIMEOUT } = {}) {
  if (apiDown()) throw new Error("the embeddings API did not answer a moment ago: search by meaning is left out for a minute (search by words meanwhile)");
  try {
    const [v] = await embed([String(q)], config(), { timeout });
    return v;
  } catch (e) {
    // Only a caller that gave the API its whole patience says the API is
    // down: the hook, which gives it what is left of its second and a half,
    // would otherwise turn every slow moment into a minute without meaning
    // for every program of the brain.
    if (timeout >= QUESTION_TIMEOUT) {
      downUntil = Date.now() + DOWN_MS;
      try {
        writeFileAtomic(DOWN(), JSON.stringify({ until: downUntil, why: String(e?.message ?? e).slice(0, 200) }));
      } catch {
        // this program remembers it, at least
      }
    }
    throw e;
  }
}

// THE QUESTION'S VECTOR, kept: the same question asked twice (it happens,
// from one conversation to the next) costs no second call to the API, and
// half a second less. A small file outside the brain, the last 500 questions.
// (2026-11-21) The file (2.2 MB) was read at every search and written in
// place: it is now read once by a program that stays up, read again only
// before adding a question to it (other servers add theirs), and written
// beside then renamed. A question is kept under its hash, not its words. A
// file that cannot be read is written over: it is a cache, an API call gives
// back anything it held.
const QCACHE = () => join(HOME, ".hypervibe-brain", "query-vectors.json");
const HASHED = /^[0-9a-f]{64}$/;
const readQCache = () => new Map(Object.entries(readJsonFile(QCACHE(), {}).value ?? {}).filter(([k, v]) => HASHED.test(k) && Array.isArray(v)));
let qCache = null;
async function queryVector(q, { timeout } = {}) {
  const cfg = config();
  const key = sha256(`${cfg.embeddings.model}|${cfg.embeddings.dims}|${q.trim().toLowerCase()}`);
  qCache ??= readQCache();
  if (qCache.has(key)) return { v: qCache.get(key), cached: true };
  const v = await questionVector(q, { timeout });
  try {
    const kept = v.map((x) => Math.round(x * 1e5) / 1e5);
    const all = readQCache();
    all.delete(key);
    all.set(key, kept);
    for (const k of [...all.keys()].slice(0, Math.max(0, all.size - 500))) all.delete(k);
    qCache = all;
    writeFileAtomic(QCACHE(), JSON.stringify(Object.fromEntries(all)));
  } catch {
    // a comfort, not a guarantee
  }
  return { v, cached: false };
}

/**
 * How the last search went, for the usage journal (tool.mjs): which way it
 * searched, whether the question's vector was cached, why meaning was left out.
 */
export const lastSearch = { by: null, cached: null, note: null, query: null, qv: null };

const BY = ["both", "words", "meaning"];

/**
 * A filter's value this brain does not have (2026-11-21): a search for
 * `nature: "lecon"` in a brain that says `lesson` gave back an empty list and
 * said nothing, which reads as "the brain has nothing on this". Returns null
 * when every filter is known, else { error, known } with the values that are.
 */
export function filterProblem(db, { type, domain, nature } = {}) {
  const asked = (v) => v !== undefined && v !== null && v !== "";
  const f = resolveFilters(db, { type, domain, nature });
  const check = (what, value, how) => {
    const known = knownValues(db, what);
    return known.includes(String(value)) ? null : { error: `this brain has no ${what} "${value}" (${known.length ? `its ${how}: ${known.join(", ")}` : `it has no ${how}`})`, known };
  };
  return (asked(type) ? check("type", f.type, "types") : null) ?? (asked(domain) ? check("domain", f.domain, "domains") : null) ?? (asked(nature) ? check("nature", f.nature, "natures") : null);
}

/** The values a filter can take in this brain: what brain.json declares and what the index holds. */
function knownValues(db, kind) {
  const cfg = config();
  const inIndex = (sql) => {
    try {
      return db.prepare(sql).all().map((r) => r.k).filter(Boolean);
    } catch {
      return [];
    }
  };
  if (kind === "type") return [...new Set([...Object.keys(cfg.types ?? {}), ...inIndex("SELECT DISTINCT type k FROM fiche")])];
  if (kind === "domain") return [...new Set([...(cfg.domains ?? []), ...inIndex("SELECT DISTINCT j.value k FROM fiche f, json_each(f.domains) j")])];
  return [...new Set([...Object.values(cfg.natures ?? {}).flat().map(String), ...inIndex("SELECT DISTINCT nature k FROM facet WHERE nature IS NOT NULL")])];
}

/**
 * The filters as this brain writes them (2026-11-22): `lecon`, `Leçon` or
 * `lesson` for the brain's own word for a lesson, a type by its folder
 * (`people` for `person`), a domain by its label (`Littéraire`). A value
 * that means nothing known is given back as it came (filterProblem says so).
 */
export function resolveFilters(db, { type, domain, nature } = {}) {
  const cfg = config();
  const out = {};
  const typeAliases = Object.fromEntries(Object.entries(cfg.types ?? {}).map(([t, folder]) => [t, [String(folder)]]));
  const domainAliases = Object.fromEntries(Object.entries(cfg.domainInfo ?? {}).map(([d, i]) => [d, [i?.label, i?.note].filter(Boolean).map(String)]));
  if (type) out.type = pickKnown(type, knownValues(db, "type"), { aliases: typeAliases });
  if (domain) out.domain = pickKnown(domain, knownValues(db, "domain"), { aliases: domainAliases });
  if (nature) out.nature = pickKnown(nature, knownValues(db, "nature"), { kind: "nature" });
  return out;
}

/**
 * `vector`: the question's vector when the caller already has it (suggest.mjs
 * asks it once for its two searches); `timeout`: how long the API may take
 * for it otherwise.
 */
// (`includePrivate`, of before, is accepted and changes nothing: see the top.)
export async function search(db, q, { semantic = false, by, limit = 10, type, domain, nature, everything = false, entries = true, vector = null, timeout } = {}) {
  limit = bounded(limit, 10, 50);
  // A filter in another word than the brain's (lecon for lesson): taken as the brain's.
  ({ type, domain, nature } = { type, domain, nature, ...resolveFilters(db, { type, domain, nature }) });
  // How to search: both by default when meaning is available; words only or
  // meaning only when asked. `semantic` is the former way of asking meaning.
  loadEnv();
  let mode = BY.includes(by) ? by : semantic ? "meaning" : "both";
  Object.assign(lastSearch, { by: mode, cached: null, note: null, query: q, qv: null });
  if (mode !== "words" && !vector && !embeddingsAvailable()) {
    if (mode === "meaning") throw new Error("search by meaning needs an embeddings key in the brain's .env (see the brain's CLAUDE.md)");
    mode = lastSearch.by = "words";
  }
  // The catalogue answers too, unless the question is about notes only.
  const withEntries = entries && !type && !nature;

  // THE FILTERS ARE PART OF THE QUESTION (2026-11-21). They used to be applied
  // to the first results, after the limit: "conference" with type person found
  // 631 notes holding the word, kept the first 30, and none of the 3 people
  // was among them, so the answer was empty. They are now in the query itself
  // for the words, and the vectors are narrowed to the notes that pass before
  // the closest are taken, for the meaning. The same for the folders a brain
  // keeps out of search (brain.json, search.hidden) and, for the catalogue,
  // for the tools it keeps out (search.hiddenTools: ["directory"]).
  const where = [];
  const params = [];
  if (type) where.push("f.type = ?"), params.push(String(type));
  if (domain) where.push("EXISTS (SELECT 1 FROM json_each(f.domains) j WHERE j.value = ?)"), params.push(String(domain));
  if (nature) where.push("EXISTS (SELECT 1 FROM facet x WHERE x.slug = f.slug AND x.nature = ?)"), params.push(String(nature));
  for (const p of everything ? [] : hiddenPrefixes()) where.push("substr(f.rel, 1, ?) != ?"), params.push(`vault/${p}`.length, `vault/${p}`);
  const cond = where.map((w) => ` AND ${w}`).join("");
  const eWhere = [];
  const eParams = [];
  if (domain) eWhere.push("EXISTS (SELECT 1 FROM json_each(e.domains) j WHERE j.value = ?)"), eParams.push(String(domain));
  for (const t of everything ? [] : (config().search?.hiddenTools ?? [])) eWhere.push("e.tool != ?"), eParams.push(String(t));
  const eCond = eWhere.map((w) => ` AND ${w}`).join("");
  const noteVectors = () => {
    const all = allVectors(db);
    if (!where.length) return all;
    const ok = new Set(db.prepare(`SELECT f.slug FROM fiche f WHERE 1${cond}`).all(...params).map((r) => r.slug));
    return all.filter((r) => ok.has(r.slug));
  };
  const entryVecs = () => {
    const all = entryVectors(db);
    if (!eWhere.length) return all;
    const ok = new Set(db.prepare(`SELECT e.address FROM entry e WHERE 1${eCond}`).all(...eParams).map((r) => r.address));
    return all.filter((r) => ok.has(r.slug));
  };
  const getN = db.prepare("SELECT * FROM fiche WHERE slug = ?");
  const getE = db.prepare("SELECT * FROM entry WHERE address = ?");

  // The question's vector, when meaning takes part. If the API fails, a
  // search of both goes on by words: an answer without meaning beats none.
  // (2026-11-21) It goes on as a search of both without its meaning half,
  // not as a search by words alone: that one wants every word, and a question
  // in plain language ("a question about the garden") then found nothing,
  // now that a slow API is left alone for a minute.
  let qv = vector;
  if (mode !== "words" && !qv) {
    try {
      const r = await queryVector(q, { timeout });
      qv = r.v;
      lastSearch.cached = r.cached;
    } catch (e) {
      if (mode === "meaning") throw e;
      lastSearch.by = "words";
      lastSearch.note = `meaning left out: ${String(e.message).slice(0, 120)}`;
    }
  }
  if (mode !== "words") lastSearch.qv = qv;

  // Every word must appear: in words-only mode, every word the question has;
  // in hybrid search, every MEANINGFUL word (the small ones would only narrow
  // it down to the notes that happen to say "de" and "la").
  const lig = { ligatures: ligatures(db) };
  const any = ftsAny(q, lig);
  const strict = mode === "words" || !any.words.length ? ftsQuery(q, lig) : { words: any.words, match: any.words.map((w) => `"${w}"*`).join(" ") };
  const shown = [...new Set([...any.words, ...strict.words])];
  // Each result says how far it can be trusted (a seed is handled with care)
  // and when it was last touched, in the brain's own words.
  const noteOut = (r, score) => ({
    slug: r.slug,
    type: r.type,
    title: r.title,
    status: say("status", r.status),
    updated: r.updated,
    ...(score !== undefined ? { score } : {}),
    excerpt: snippet(r.body, shown),
  });

  // MEANING ONLY: notes and entries ranked together, on the same measure.
  // (Three times the limit are taken, for the weights to reorder among them.)
  if (mode === "meaning") {
    const W = weightsOf(db);
    const notes = nearestRows(noteVectors(), qv, limit * 3)
      .map((n) => ({ r: rowOf(getN.get(n.slug)), score: Math.round(n.score * 1000) / 1000, rank: weighted(n.score, W.get(n.slug)) }))
      .filter((x) => x.r)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map((x) => noteOut(x.r, x.score));
    if (!withEntries) return notes;
    const found = nearestRows(entryVecs(), qv, limit)
      .map((n) => ({ e: getE.get(n.slug), score: Math.round(n.score * 1000) / 1000 }))
      .filter((x) => x.e)
      .map((x) => asEntry(x.e, null, x.score));
    return [...notes, ...found].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  const wordNotes = (match, n) => {
    if (!match) return [];
    try {
      return db.prepare(`SELECT f.* FROM fts JOIN fiche f ON f.slug = fts.slug WHERE fts MATCH ?${cond} ORDER BY bm25(fts, 0, 8, 1) LIMIT ?`).all(match, ...params, n).map(row);
    } catch {
      return [];
    }
  };
  const wordEntries = (match, n) => {
    if (!match || !withEntries) return [];
    try {
      return db.prepare(`SELECT e.* FROM entry_fts JOIN entry e ON e.address = entry_fts.address WHERE entry_fts MATCH ?${eCond} ORDER BY bm25(entry_fts, 0, 8, 1) LIMIT ?`).all(match, ...eParams, n);
    } catch {
      return [];
    }
  };

  // WORDS ONLY: every word must appear, as search always did.
  if (mode === "words") {
    if (!strict.words.length) return [];
    const notes = wordNotes(strict.match, limit).map((r) => noteOut(r));
    if (!withEntries) return notes;
    // By words, the two rankings do not compare: the notes first, then up to
    // half as many catalogue entries.
    return [...notes, ...wordEntries(strict.match, Math.ceil(limit / 2)).map((e) => asEntry(e, strict.words))];
  }

  // BOTH: up to six rankings fused (notes, then catalogue entries; each by
  // every word, by any meaningful word, by meaning). Every word present
  // weighs most; the catalogue a little less than the notes, the brain's own.
  const DEPTH = 30;
  const items = new Map();
  const lists = [];
  const weights = [];
  const ways = [];
  const add = (pairs, w, way) => {
    for (const [key, val] of pairs) if (!items.has(key)) items.set(key, val);
    lists.push(pairs.map(([key]) => key));
    weights.push(w);
    ways.push(way);
  };
  const asN = (r) => [`n:${r.slug}`, { r }];
  const asE = (e) => [`e:${e.address}`, { e }];
  // When notes hold every word, the looser "any word" ranking only breaks ties;
  // when none does (a question in plain language), it carries the words half.
  const allWords = wordNotes(strict.match, DEPTH);
  const loose = allWords.length >= 3 ? 0.4 : 1;
  add(allWords.map(asN), 2, "words");
  add(wordNotes(any.match, DEPTH).map(asN), loose, "words");
  // The best closeness by meaning, notes and entries alike: the yardstick of
  // what an entry found by meaning alone must reach to be shown.
  // (No vector: the API did not answer, the meaning rankings are empty.)
  const nearN = qv ? nearestRows(noteVectors(), qv, DEPTH) : [];
  const nearE = withEntries && qv ? nearestRows(entryVecs(), qv, DEPTH) : [];
  const best = Math.max(nearN[0]?.score ?? 0, nearE[0]?.score ?? 0);
  const close = new Map(nearE.map((n) => ["e:" + n.slug, n.score]));
  add(
    nearN
      .map((n) => rowOf(getN.get(n.slug)))
      .filter(Boolean)
      .map(asN),
    1,
    "meaning",
  );
  // The ranking of the entries that hold EVERY meaningful word of the question.
  const EVERY_WORD = lists.length;
  if (withEntries) {
    add(wordEntries(strict.match, DEPTH).map(asE), 1.4, "words");
    add(wordEntries(any.match, DEPTH).map(asE), 0.7 * loose, "words");
    add(
      nearE
        .map((n) => getE.get(n.slug))
        .filter(Boolean)
        .map(asE),
      1,
      "meaning",
    );
  }
  // Notes and entries fused apart, then put together: a note gathers points
  // from three rankings, an entry from its own, so a single fused list would
  // never show the catalogue.
  const pick = (from) => fuse(lists.filter((_, i) => from.includes(i)), { weights: weights.filter((_, i) => from.includes(i)) }).map((f) => ({ ...f, from: f.from.map((j) => from[j]) }));
  const notesIdx = ways.map((_, i) => i).filter((i) => i < 3);
  const entriesIdx = ways.map((_, i) => i).filter((i) => i >= 3);
  const W = weightsOf(db);
  const fusedN = pick(notesIdx)
    .map((f) => ({ ...f, score: weighted(f.score, W.get(f.key.slice(2))) }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  // WHICH ENTRIES ARE SHOWN, AND HOW MANY (2026-11-21). An entry used to pass
  // as soon as it held ONE meaningful word of the question (nearly always
  // true, with thousands of entries), and the catalogue took a third of the
  // places whatever it had found: a search of one result gave no note at all,
  // a search of five gave three notes and two entries. Now an entry is shown
  // when it holds every meaningful word, or when it is really close by
  // meaning (0.45 at least, and near the best closeness of the question:
  // otherwise a question about an invoice brings up posts about ants). The
  // entries take the places the notes leave empty; beyond that, an entry
  // takes a note's place only when its own score is higher, for a third of
  // the places at most, and never in a search of fewer than three results.
  const fusedE = (entriesIdx.length ? pick(entriesIdx) : []).filter((f) => f.from.includes(EVERY_WORD) || (close.get(f.key) ?? 0) >= Math.max(0.45, best - 0.12));
  let forNotes = Math.min(fusedN.length, limit);
  let forEntries = Math.min(fusedE.length, limit - forNotes);
  const third = limit < 3 ? 0 : Math.ceil(limit / 3);
  while (forEntries < third && forEntries < fusedE.length && forNotes > 0 && fusedE[forEntries].score > fusedN[forNotes - 1].score) {
    forNotes--;
    forEntries++;
  }
  const chosen = [...fusedN.slice(0, forNotes), ...fusedE.slice(0, forEntries)];
  return chosen.map((f) => {
    const x = items.get(f.key);
    const found = [...new Set(f.from.map((i) => ways[i]))];
    return x.r ? { ...noteOut(x.r), found } : { ...asEntry(x.e, shown), found };
  });
}

// A NOTE AS AN AI RECEIVES IT. Most notes are short (1,200 characters in the
// median), a few are huge (93,000 characters, 26,000 tokens, for the longest
// one), and a hub note is cited by 280 others: sent whole, one opening could
// cost more than a whole conversation. So by default (the MCP tools) the text
// stops at a paragraph break past BODY characters and the links at
// `maxLinks` each way, and the answer says what was left out; `full` gives
// everything. The command line asks for everything. The cut is shared with
// the cloud copy (pure.mjs, cutBody).

// Where to go next from an opened note: pure.mjs (pickLeads) says why and how.
const vecOf = (db, slug) => {
  const r = db.prepare("SELECT vec FROM vec WHERE slug = ?").get(slug);
  if (!r) return null;
  const b = Buffer.from(r.vec);
  return new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
};
export function nextSteps(db, slug, { query = null, limit = 3 } = {}) {
  const me = db.prepare("SELECT slug, body FROM fiche WHERE slug = ?").get(slug);
  if (!me) return [];
  const info = db.prepare("SELECT title, type, rel, body FROM fiche WHERE slug = ?");
  const seen = new Set([slug]);
  const candidates = [];
  const links = [...db.prepare("SELECT dst s FROM link WHERE src = ?").all(slug).map((r) => [r.s, "out"]), ...db.prepare("SELECT src s FROM link WHERE dst = ?").all(slug).map((r) => [r.s, "in"])];
  for (const [s2, dir] of links) {
    if (seen.has(s2)) continue;
    seen.add(s2);
    const f = info.get(s2);
    if (!f || isHidden(f.rel)) continue;
    candidates.push({ slug: s2, title: f.title, type: f.type, body: f.body, dir, vec: vecOf(db, s2) });
  }
  return pickLeads(me, candidates, query ?? vecOf(db, slug), limit);
}

// (2026-11-21) Even `full` has an end when an AI asks: a note of 93,000
// characters with its 286 backlinks came close to what a client accepts in
// one answer, and nothing let the AI read a long note in pieces. `bodyLimit`
// is how much text one call gives (FULL_BODY for the tools, no limit for the
// command line and the live view), `offset` where to start reading: what is
// left says where the next piece starts (`omitted.body.next`).
export const FULL_BODY = 30_000;
export const FULL_LINKS = 200;
export function get(db, slug, { full = true, maxLinks = Infinity, offset = 0, bodyLimit = Infinity, brief = 0 } = {}) {
  const r = db.prepare("SELECT * FROM fiche WHERE slug = ?").get(slug);
  if (!r) return null;
  const f = row(r);
  const exists = db.prepare("SELECT slug, title, type FROM fiche WHERE slug = ?");
  const outAll = db.prepare("SELECT dst FROM link WHERE src = ?").all(slug).map((l) => exists.get(l.dst) ?? { slug: l.dst, missing: true });
  const innAll = db.prepare("SELECT f.slug, f.title, f.type FROM link l JOIN fiche f ON f.slug = l.src WHERE l.dst = ? ORDER BY f.updated DESC").all(slug);
  const out = outAll.slice(0, maxLinks);
  const inn = innAll.slice(0, maxLinks);
  // Where the reading starts, within the text.
  const from = Math.min(f.body.length, Math.max(0, Math.floor(Number(offset) || 0)));
  const rest = from ? f.body.slice(from) : f.body;
  // `brief`: a shorter piece, for the brain's own background work (tool.mjs).
  const piece = full ? (Number.isFinite(bodyLimit) ? cutBody(rest, bodyLimit) : { body: rest, cut: null }) : brief ? cutBody(rest, brief) : cutBody(rest);
  const next = piece.cut ? from + piece.cut.shown : null;
  const text = {
    body: piece.body,
    cut: piece.cut ? { ...(from ? { from } : {}), shown: next, total: f.body.length, next, more: `brain_get with offset: ${next} gives what follows${full ? "" : ", full: true a longer piece"}` } : null,
  };
  const omitted = {
    ...(text.cut ? { body: text.cut } : {}),
    ...(outAll.length > out.length ? { links: outAll.length } : {}),
    ...(innAll.length > inn.length ? { backlinks: innAll.length, more: full ? `the ${inn.length} most recent are shown` : "the most recent are shown; brain_get with full: true lists them all" } : {}),
  };
  return {
    slug: f.slug, file: f.rel, type: f.type, title: f.title, domains: f.domains, status: say("status", f.status), visibility: say("visibility", f.visibility),
    created: f.created, updated: f.updated, source: f.source,
    ...(() => {
      const x = facets(db, slug);
      return { ...(x.nature ? { nature: x.nature } : {}), ...(x.data.length ? { data: x.data } : {}) };
    })(),
    ...(from ? { bodyFrom: from } : {}),
    body: text.body,
    links: out, backlinks: inn,
    ...(Object.keys(omitted).length ? { omitted } : {}),
  };
}

/**
 * A NOTE, AT ONCE (2026-11-21), for the card of the live view. `freshDb`
 * looks at the whole vault before every answer (the date of each note: a
 * tenth of a second on 2,300 notes) and rebuilds the index when one moved
 * (seconds, and a judge writes every minute while it reads): the card waited
 * each time, and the view froze with it. A card shows ONE note. It is read
 * from the index as it is, and the note's own file says whether it changed
 * since the index was built: if so, its text and its links are read from the
 * file. The notes that link to it are those of the index, a few minutes late
 * at worst. `stale` tells the caller that the index is behind this note, to
 * refresh it apart from the answer.
 * @param {string} slug
 * @returns {{ note: object | null, stale: boolean }}
 */
export function getNow(slug) {
  const db = openDb({ readonly: true });
  if (!db) throw new Error("the index does not exist yet: run pnpm build");
  try {
    const note = get(db, slug);
    const built = Date.parse(db.prepare("SELECT v FROM meta WHERE k = 'built'").get()?.v ?? "") || 0;
    // (A note the index does not know yet is looked for among the files: rare.)
    const abs = note ? join(ROOT, note.file) : (listFiches().find((f) => basename(f, ".md") === slug) ?? null);
    if (!abs) return { note: null, stale: false };
    let changed = 0;
    try {
      changed = statSync(abs).mtimeMs;
    } catch {
      return { note, stale: true }; // the file left: the index says what it was
    }
    if (note && changed <= built) return { note, stale: false };
    const f = parseFiche(abs);
    const known = db.prepare("SELECT slug, title, type FROM fiche WHERE slug = ?");
    const data = Array.isArray(f.fm.data) ? f.fm.data : f.fm.data ? [f.fm.data] : [];
    return {
      stale: true,
      note: {
        slug, file: f.rel, type: f.fm.type, title: f.fm.title ?? slug, domains: Array.isArray(f.fm.domains) ? f.fm.domains : f.fm.domains ? [f.fm.domains] : [],
        status: say("status", f.fm.status), visibility: say("visibility", f.fm.visibility),
        created: String(f.fm.created ?? ""), updated: String(f.fm.updated ?? ""), source: String(f.fm.source ?? ""),
        ...(f.fm.nature ? { nature: String(f.fm.nature) } : {}),
        ...(data.length ? { data: data.map(String) } : {}),
        body: f.body,
        links: f.links.map((l) => known.get(l) ?? { slug: l, missing: true }),
        backlinks: note?.backlinks ?? [],
      },
    };
  } finally {
    db.close();
  }
}

export function neighbors(db, slug, { limit = 8, everything = false, maxLinks = Infinity } = {}) {
  limit = bounded(limit, 8, 50);
  const f = get(db, slug, { full: false, maxLinks });
  if (!f) return null;
  const v = db.prepare("SELECT vec FROM vec WHERE slug = ?").get(slug);
  let similar = [];
  if (v) {
    const buf = Buffer.from(v.vec);
    const q = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const title = db.prepare("SELECT title, type, rel FROM fiche WHERE slug = ?");
    const keep = everything || isHidden(f.file);
    // The folders kept out of search are set aside BEFORE the closest are
    // taken (2026-11-21): taken after, a note close to hundreds of contacts'
    // notes had no neighbour left.
    const rows = keep || !hiddenPrefixes().length ? allVectors(db) : allVectors(db).filter((r) => !isHidden(title.get(r.slug)?.rel));
    similar = nearestRows(rows, q, limit, new Set([slug]))
      .map((n) => ({ slug: n.slug, known: title.get(n.slug), score: Math.round(n.score * 1000) / 1000 }))
      .filter((n) => n.known)
      .map(({ known, ...n }) => ({ slug: n.slug, title: known.title, type: known.type, score: n.score }));
  }
  const omitted = { ...(f.omitted?.links ? { links: f.omitted.links } : {}), ...(f.omitted?.backlinks ? { backlinks: f.omitted.backlinks, more: "brain_get with full: true lists them all" } : {}) };
  return { slug, title: f.title, links: f.links, backlinks: f.backlinks, similar, ...(Object.keys(omitted).length ? { omitted } : {}) };
}

// (2026-11-21) At most 200 notes a call: `limit: 5000` gave back the whole
// brain (250,000 characters), and a negative one too. Narrow with the dates.
export const TIMELINE_MAX = 200;
export function timeline(db, { since, until, limit = 30, type } = {}) {
  if (type) type = resolveFilters(db, { type }).type;
  const rows = db.prepare(`SELECT slug, title, type, created, status FROM fiche WHERE created >= ? AND created <= ?${type ? " AND type = ?" : ""} ORDER BY created DESC, slug LIMIT ?`)
    // Dates compare as text: "2026-09" is before every day of September, "2026-09~" after them.
    .all(...[since ? String(since) : "0000", until ? `${until}~` : "9999", ...(type ? [String(type)] : []), bounded(limit, 30, TIMELINE_MAX)]);
  return rows.map((r) => ({ ...r, status: say("status", r.status) }));
}

export function stats(db) {
  const count = (sql) => Object.fromEntries(db.prepare(sql).all().map((r) => [r.k, r.n]));
  const domains = Object.fromEntries(config().domains.map((d) => [d, 0]));
  for (const r of db.prepare("SELECT domains FROM fiche").all()) for (const d of JSON.parse(r.domains)) domains[d] = (domains[d] ?? 0) + 1;
  const cfg = config();
  return {
    notes: db.prepare("SELECT COUNT(*) n FROM fiche").get().n,
    // The brain's types and their folders, and its format: what a capture needs to know.
    types: cfg.types,
    format: cfg.format,
    byType: count("SELECT type k, COUNT(*) n FROM fiche GROUP BY type"),
    catalogue: (() => {
      try {
        return count("SELECT tool k, COUNT(*) n FROM entry GROUP BY tool");
      } catch {
        return {};
      }
    })(),
    byNature: (() => {
      try {
        return count("SELECT nature k, COUNT(*) n FROM facet WHERE nature IS NOT NULL GROUP BY nature");
      } catch {
        return {};
      }
    })(),
    byStatus: sayKeys("status", count("SELECT status k, COUNT(*) n FROM fiche GROUP BY status")),
    byVisibility: sayKeys("visibility", count("SELECT visibility k, COUNT(*) n FROM fiche GROUP BY visibility")),
    byDomain: domains,
    links: db.prepare("SELECT COUNT(*) n FROM link").get().n,
    vectors: db.prepare("SELECT COUNT(*) n FROM vec").get().n,
    searchByMeaning: (loadEnv(), embeddingsAvailable()),
    lastBuild: db.prepare("SELECT v FROM meta WHERE k = 'built'").get()?.v ?? null,
  };
}
