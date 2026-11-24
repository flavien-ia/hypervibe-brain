// weights.mjs - How much a note counts, apart from how much it can be trusted.
//
// The status (seed, trusted, archived) says whether a note can be quoted as
// it is. The weight says how much it counts when the AI thinks about a
// subject: two different questions, two different mechanisms (decided on
// 2026-11-07). The weight never replaces the status, and the
// status is only one of the weight's ingredients.
//
// THREE PARTS:
//  - reach: the links in and out, each weighted by how far, in meaning, it
//    goes (a link to a neighbour on the same subject counts little, a link
//    across subjects counts fully), times the diversity of the domains it
//    reaches; on a log scale and capped. A dense core of notes linked to one
//    another (a client and its own interventions) is not a hub of the brain;
//    a note linked from many distant places is. Decided on 2026-11-07,
//    after measuring it: the big hubs keep their place, the
//    concepts that bridge subjects rise, single-world clusters go down;
//  - criticality: what kind of thing the note is (a decision or a lesson
//    weighs more than a passing note), validated or not, archived or not;
//  - recent use: the notes the AI actually opened (brain_get, brain_fetch),
//    each reading fading with a half-life of a month.
//
// THE GUARD AGAINST SELF-REINFORCEMENT. A weight fed by use feeds itself:
// what is read rises, so it is read again. Hence: use is a minority share
// (a quarter), only real openings count (a note merely listed in results
// does not), every reading fades, the count is capped, and use starts flat
// for every note on the day the weight is switched on (no head start for
// the notes read during the brain's construction). The weight then only
// nudges the ranking (pure.mjs, weighted): the meaning of the question
// remains what decides. Measured a week later, by a scheduled review.

import { readAllReads } from "./lib.mjs";
// The reads of the brain journal are read through lib.mjs, bound by journal.mjs.
import "./journal.mjs";

const HALF_LIFE_DAYS = 30;
const USE_CAP = 6; // faded openings beyond which use no longer grows
const SHARE_USE = 0.25;

// Criticality by kind: natures and types in both languages of the format.
const BY_NATURE = { decision: 1, lecon: 0.9, lesson: 0.9, retour: 0.55, feedback: 0.55 };
const BY_TYPE = [
  [/^(domaine|domain|concept|projet|project|livre|book)$/, 0.65],
  [/^(idee|idea|personne|person|organisation|organization|conference)$/, 0.5],
  [/^(note)$/, 0.45],
  [/^(source|publication|oeuvre|intervention|evenement|event)$/, 0.35],
];

// FRESHNESS. A hub cited by talks given three years ago is history, not a
// working point (a book came first on 2026-11-07, while being an old
// project). The dated notes (an intervention, a publication, an event) date
// the activity around a note: its reach fades by a fifth per year since the
// most recent of them, down to a floor of 60 %. A note with no dated activity
// at all (a timeless concept) keeps its full reach. Creation dates say nothing
// (a whole brain imported in one day), so they are not used.
const FADE_PER_YEAR = 0.2;
const FLOOR = 0.6;

export function computeWeights(db, cfg, { dates = new Map() } = {}) {
  db.exec("CREATE TABLE IF NOT EXISTS weight (slug TEXT PRIMARY KEY, connections REAL, criticality REAL, use REAL, w REAL)");
  const meta = (k) => db.prepare("SELECT v FROM meta WHERE k = ?").get(k)?.v;
  const setMeta = (k, v) => db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, String(v));
  // Use starts flat the day the weight is switched on.
  let since = meta("weight_since");
  if (!since) {
    since = new Date().toISOString();
    setMeta("weight_since", since);
  }
  // The index keeps the canonical words (seed, trusted, archived), whatever
  // the brain's own language.
  const archived = "archived";
  const trusted = "trusted";

  const notes = db.prepare("SELECT slug, rel, type, status FROM fiche").all();
  const nature = new Map();
  try {
    for (const r of db.prepare("SELECT slug, nature FROM facet WHERE nature IS NOT NULL").all()) nature.set(r.slug, r.nature);
  } catch {
    // an index built before the facets
  }
  const inn = new Map(db.prepare("SELECT dst s, COUNT(*) n FROM link GROUP BY dst").all().map((r) => [r.s, r.n]));
  const out = new Map(db.prepare("SELECT src s, COUNT(*) n FROM link GROUP BY src").all().map((r) => [r.s, r.n]));

  // REACH: each link weighted by its distance in meaning, times the diversity
  // (entropy) of the domains of the notes it reaches.
  const domainsOf = new Map(db.prepare("SELECT slug, domains FROM fiche").all().map((r) => [r.slug, JSON.parse(r.domains || "[]")]));
  const vec = new Map();
  try {
    for (const r of db.prepare("SELECT slug, vec FROM vec").all()) {
      const b = Buffer.from(r.vec);
      vec.set(r.slug, new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4));
    }
  } catch {
    // no vectors: every link counts half
  }
  const cosine = (a, b) => {
    let d = 0, x = 0, y = 0;
    for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
    return d / (Math.sqrt(x * y) || 1);
  };
  const around = new Map();
  // A FAMILY LINK (a chapter to its book, filed in the book's folder) is the
  // book's structure, not its influence: 57 of a book's 89 links, measured.
  const relOf = new Map(db.prepare("SELECT slug, rel FROM fiche").all().map((r) => [r.slug, String(r.rel ?? "").replace(/\\/g, "/")]));
  const folderOf = (slug) => {
    const parts = (relOf.get(slug) ?? "").split("/");
    return parts.length > 2 ? parts[parts.length - 2] : null;
  };
  const family = (a, b) => folderOf(a) === b || folderOf(b) === a;
  for (const l of db.prepare("SELECT src, dst FROM link").all()) {
    if (l.src === l.dst || !domainsOf.has(l.src) || !domainsOf.has(l.dst) || family(l.src, l.dst)) continue;
    (around.get(l.src) ?? around.set(l.src, new Set()).get(l.src)).add(l.dst);
    (around.get(l.dst) ?? around.set(l.dst, new Set()).get(l.dst)).add(l.src);
  }
  const reachOf = (slug) => {
    const ns = around.get(slug);
    if (!ns?.size) return 0;
    const v = vec.get(slug);
    let far = 0;
    const doms = new Map();
    for (const n of ns) {
      const w = vec.get(n);
      far += v && w ? Math.max(0, 1 - cosine(v, w)) : 0.5;
      for (const d of domainsOf.get(n) ?? []) doms.set(d, (doms.get(d) ?? 0) + 1);
    }
    const total = [...doms.values()].reduce((a, b) => a + b, 0) || 1;
    const entropy = -[...doms.values()].reduce((a, c) => a + (c / total) * Math.log2(c / total), 0);
    return far * (0.5 + entropy / 3) * freshness(slug, ns);
  };
  function freshness(slug, ns) {
    let last = dates.get(slug) ?? "";
    for (const n of ns) if ((dates.get(n) ?? "") > last) last = dates.get(n);
    if (!last) return 1;
    const years = (Date.now() - Date.parse(last.length === 4 ? `${last}-07-01` : last.length === 7 ? `${last}-15` : last)) / (365.25 * 86_400_000);
    return Number.isFinite(years) ? Math.max(FLOOR, Math.min(1, 1 - FADE_PER_YEAR * Math.max(0, years))) : 1;
  }

  // Recent use: real openings since the weight was switched on, fading.
  const now = Date.now();
  const use = new Map();
  for (const r of readAllReads(cfg)) {
    if (r.tool !== "brain_get" && r.tool !== "brain_fetch") continue;
    if (!r.at || r.at < since) continue;
    const age = (now - Date.parse(r.at)) / 86_400_000;
    use.set(r.slug, (use.get(r.slug) ?? 0) + 0.5 ** (age / HALF_LIFE_DAYS));
  }

  // THE PARENT'S SHARE. Corpus notes (a book's chapters, posts) are exempt
  // from links by the writing rules, so their own links say nothing of their
  // worth: a chapter of a book with no link weighed as little as a passing
  // contact (seen on 2026-11-07). A note with almost no link of its own
  // inherits part of the connections of the note named like its folder
  // (sources/books/my-novel/... takes from the note my-novel).
  const ownLinks = (slug) => (inn.get(slug) ?? 0) + 0.5 * (out.get(slug) ?? 0);
  const reach = new Map([...domainsOf.keys()].map((slug) => [slug, reachOf(slug)]));
  const exists = new Set(notes.map((n) => n.slug));
  const parentOf = (rel) => {
    const parts = String(rel ?? "").replace(/\\/g, "/").split("/");
    const folder = parts.length > 2 ? parts[parts.length - 2] : null;
    return folder && exists.has(folder) ? folder : null;
  };
  // On the log scale, a reach of 25 (about forty links across subjects) is full.
  const conn = (r) => Math.min(1, Math.log1p(r) / Math.log1p(25));

  const put = db.prepare("INSERT OR REPLACE INTO weight VALUES (?, ?, ?, ?, ?)");
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM weight");
    for (const n of notes) {
      let connections = conn(reach.get(n.slug) ?? 0);
      const parent = ownLinks(n.slug) < 2 ? parentOf(n.rel) : null;
      if (parent && parent !== n.slug) connections = Math.max(connections, 0.6 * conn(reach.get(parent) ?? 0));
      let criticality = BY_NATURE[nature.get(n.slug)] ?? BY_TYPE.find(([re]) => re.test(n.type))?.[1] ?? 0.45;
      if (n.status === trusted) criticality = Math.min(1, criticality + 0.1);
      const used = Math.min(1, (use.get(n.slug) ?? 0) / USE_CAP);
      let w = (1 - SHARE_USE) * (0.5 * connections + 0.5 * criticality) + SHARE_USE * used;
      // An archived note stays findable, it just stops pushing forward.
      if (n.status === archived) w *= 0.3;
      put.run(n.slug, round(connections), round(criticality), round(used), round(w));
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { notes: notes.length, used: use.size, since };
}

const round = (x) => Math.round(x * 1000) / 1000;

/** The weights, by slug, for the engine (empty for an index built before them). */
export function readWeights(db) {
  try {
    return new Map(db.prepare("SELECT slug, w FROM weight").all().map((r) => [r.slug, r.w]));
  } catch {
    return new Map();
  }
}
