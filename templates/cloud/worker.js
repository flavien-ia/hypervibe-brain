// worker.js - The brain's copy in the cloud: the same six tools as on the
// computer, for an online agent or a device without the brain, READ ONLY.
// And the skills of the executive floor, as prompts and through a seventh
// tool, brain_skill, when the copy holds them (2026-11-23).
//
// THE DOOR. A token per consumer, given to one agent. The Worker only knows
// their SHA-256 prints (secret TOKENS); with no token at all, or an unreadable
// list, EVERYONE gets 401: deploying opens nothing, creating a token does.
// Three rights, closed at creation and opened agent by agent: `private` (the
// content of private notes, if the person chose to copy them to the cloud),
// `addresses` (the email addresses of the directory) and `skills` (the
// person's skills, if they chose to copy them: 2026-11-27).
//
// WHAT A TOKEN WITHOUT A RIGHT STILL SEES (2026-11-27), said to the person in
// the skill that sets this up:
//   - without `private`: a private note by its title, its type, its domains
//     and its dates; never its text, its source, the links it makes, nor its
//     neighbours by meaning;
//   - without `addresses`: a contact by its name, the counts and dates of the
//     exchanges, their subjects and what is known of the contact, every email
//     address in them masked; never the address nor the domain, and the
//     search does not look into them either;
//   - without `skills`: no skill, no prompt, not even their names.
//
// LIMITS (2026-11-27), so that one request cannot make the Worker work or pay
// without end: a body of 256 KB, 20 messages in a batch, 5 calls to the
// embeddings service per request, a question of 2,000 characters, and a
// ceiling on every `limit` (search 50, neighbours 30, timeline 200, contacts 100).
//
// THE SAME ANSWERS AS THE COMPUTER. The calculations (the full-text query,
// the excerpts, the proximity by meaning, the directory search) and the tools'
// descriptions are the very files the computer runs (pure.mjs, tools.mjs),
// copied next to this one at deployment. No dependency: the MCP protocol is
// spoken by hand, as on the computer.
//
// Bindings: DB (D1, in the EU jurisdiction), BRAIN (R2, same), secrets TOKENS
// and, for search by meaning, EMBEDDINGS: the key AND the address it is for,
// in one secret ({ key, base }), so that a key never meets another host
// (2026-11-27; a copy deployed before has OPENAI_API_KEY, which was OpenAI's).

import { LINKS_LIMIT, VOCAB, cutBody, ftsAny, ftsQuery, fuse, matchContacts, nearest, normOf, pickLeads, snippet, weighted } from "./pure.mjs";
import { TOOLS as ALL_TOOLS, instructionsFor } from "./tools.mjs";
import { SKILL_TOOL, findSkill, promptItem, renderSkill, skillList, skillsSentence } from "./skills-text.mjs";

// brain_fetch reads the data a note routes to WHERE IT LIVES (a database, an
// accounting app): the computer's registry and keys, which the cloud copy
// never holds. It is not offered here rather than offered and failing.
const TOOLS = ALL_TOOLS.filter((t) => t.name !== "brain_fetch");

const MASK = "(private note: its content is never shown to an AI)";

// The limits (see the head).
const BODY_MAX = 256 * 1024;
const BATCH_MAX = 20;
const EMBED_MAX = 5;
const QUERY_MAX = 2000;
const LIMITS = { search: 50, neighbors: 30, timeline: 200, contact: 100 };
/** A `limit` asked by the AI: a whole number from 1 to `max`, else the default. */
const clamp = (v, def, max) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, max) : def;
};

const hex = async (s) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

/** The rights of the bearer, or null: the door. */
async function door(request, env) {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  let tokens = [];
  try {
    tokens = JSON.parse(env.TOKENS ?? "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(tokens) || !tokens.length) return null;
  const h = await hex(m[1]);
  const t = tokens.find((x) => x.hash === h);
  return t ? { name: t.name, private: t.private === true, addresses: t.addresses === true, skills: t.skills === true } : null;
}

async function meta(env) {
  const rows = (await env.DB.prepare("SELECT k, v FROM meta").all()).results ?? [];
  const m = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const voc = VOCAB[m.format] ?? VOCAB.en;
  return { name: m.name ?? null, format: m.format ?? "en", voc, types: JSON.parse(m.types ?? "{}"), domains: JSON.parse(m.domains ?? "[]"), hidden: new Set(JSON.parse(m.hidden ?? "[]")), weights: new Map(Object.entries(JSON.parse(m.weights ?? "{}"))), generated: m.generated ?? null, guardRules: m.guard_rules ?? "[]" };
}

const say = (voc, kind, v) => voc[kind]?.[v] ?? v;

// ------------------------------------------------------------- the matrix
let matrix = null;
async function vectors(env) {
  if (matrix && Date.now() - matrix.checked < 60_000) return matrix;
  const head = await env.BRAIN.get("matrix.json");
  if (!head) return (matrix = { checked: Date.now(), rows: [], model: null, dims: 0, md5: null });
  const info = await head.json();
  if (matrix?.md5 === info.md5) {
    matrix.checked = Date.now();
    return matrix;
  }
  const bin = await env.BRAIN.get("matrix.f32");
  const all = new Float32Array(await bin.arrayBuffer());
  const rows = info.slugs.map((slug, i) => ({ slug, v: all.subarray(i * info.dims, (i + 1) * info.dims), norm: info.norms[i] ?? normOf(all.subarray(i * info.dims, (i + 1) * info.dims)) }));
  return (matrix = { checked: Date.now(), rows, model: info.model, dims: info.dims, md5: info.md5 });
}

/**
 * The key of search by meaning and the address it is for, or null. Both come
 * in ONE secret, EMBEDDINGS (2026-11-27): a key is never read without its
 * host, and never sent to an address that is not https. A copy deployed
 * before has the key alone (OPENAI_API_KEY): it was OpenAI's, it goes to
 * OpenAI and nowhere else. Once EMBEDDINGS exists, even empty, the old key is
 * no longer read.
 */
function embeddingsOf(env) {
  if (env.EMBEDDINGS !== undefined && env.EMBEDDINGS !== null) {
    try {
      const e = JSON.parse(env.EMBEDDINGS);
      const base = String(e?.base ?? "").replace(/\/+$/, "");
      const u = new URL(base);
      const here = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
      if (e?.key && (u.protocol === "https:" || (here && u.protocol === "http:"))) return { key: String(e.key), base };
    } catch {
      // unreadable: no search by meaning, rather than a key sent somewhere
    }
    return null;
  }
  return env.OPENAI_API_KEY ? { key: env.OPENAI_API_KEY, base: "https://api.openai.com/v1" } : null;
}

async function embedQuery(env, text, m) {
  const service = embeddingsOf(env);
  if (!service) throw new Error("search by meaning is not available in this cloud copy");
  const res = await fetch(`${service.base}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${service.key}` },
    body: JSON.stringify({ model: m.model, input: [text], dimensions: m.dims }),
  });
  if (!res.ok) throw new Error(`embeddings API answered ${res.status}`);
  return (await res.json()).data[0].embedding;
}

// -------------------------------------------------------------- the tools
const row = (r) => ({ ...r, domains: JSON.parse(r.domains || "[]") });
const ALL = "SELECT slug, type, title, domains, status, visibility, created, updated, source, body FROM note UNION ALL SELECT slug, type, title, domains, status, visibility, created, updated, source, body FROM private_note";

async function fullBody(env, table, slug, first) {
  const more = (await env.DB.prepare(`SELECT part FROM ${table}_more WHERE slug = ? ORDER BY n`).bind(slug).all()).results ?? [];
  return first + more.map((m) => m.part).join("");
}

async function search(env, rights, a0, m0, budget = { embeddings: EMBED_MAX }) {
  // A question, not a document: cut before it is searched or sent anywhere.
  const a = { ...a0, query: String(a0.query ?? "").slice(0, QUERY_MAX) };
  const limit = clamp(a.limit, 10, LIMITS.search);
  const meaningHere = Boolean(embeddingsOf(env));
  // The notes the brain keeps out of search unless asked (search.hidden), as on the computer.
  const hidden = a.everything ? new Set() : m0.hidden;
  const wide = hidden.size ? 10 : 3;
  const filter = (r) => (!a.type || r.type === a.type) && (!a.domain || r.domains.includes(a.domain)) && !hidden.has(r.slug);
  // As on the computer (engine.mjs): both by default, words or meaning when asked.
  let mode = a.words ? "words" : a.meaning ? "meaning" : meaningHere ? "both" : "words";
  if (mode === "meaning" && !meaningHere) throw new Error("search by meaning is not available in this cloud copy");
  let m = null;
  let qv = null;
  if (mode !== "words") {
    try {
      // Each call to the embeddings service is paid by the person: a request
      // (a batch of them) gets a few, the rest is searched by words.
      if (budget.embeddings <= 0) throw new Error(`no more than ${EMBED_MAX} searches by meaning in one request: ask the others apart, or by words`);
      budget.embeddings--;
      m = await vectors(env);
      qv = await embedQuery(env, a.query, m);
    } catch (e) {
      if (mode === "meaning") throw e;
      mode = "words";
    }
  }
  // (2026-11-23) Each result says how far it can be trusted and when it was
  // last touched, in the brain's own words, as on the computer (engine.mjs,
  // noteOut). A private note's text stays masked without the right.
  const out = (r, words, score) => ({
    slug: r.slug,
    type: r.type,
    title: r.title,
    status: say(m0.voc, "status", r.status),
    updated: r.updated,
    ...(score !== undefined ? { score } : {}),
    excerpt: r.visibility === "private" && !rights.private ? MASK : snippet(r.body, words),
  });
  const byMeaning = async (n) => {
    const out = [];
    for (const x of nearest(m.rows, qv, n * wide)) {
      // A private note is found by meaning only with the right (2026-11-23):
      // its vector is its text, and being found for "blood" would say what a
      // masked note is about. Without the right, it is found by its title.
      const r = await env.DB.prepare(rights.private ? `SELECT * FROM (${ALL}) WHERE slug = ?` : "SELECT * FROM note WHERE slug = ?").bind(x.slug).first();
      if (!r || !filter(row(r))) continue;
      out.push({ r: row(r), score: Math.round(x.score * 1000) / 1000, raw: x.score });
      if (out.length === n) break;
    }
    return out;
  };
  if (mode === "meaning") {
    const W = m0.weights ?? new Map();
    return (await byMeaning(limit * wide))
      .map((x) => ({ ...x, rank: weighted(x.raw, W.get(x.r.slug)) }))
      .sort((a, b) => b.rank - a.rank)
      .slice(0, limit)
      .map(({ r, score }) => out(r, [], score));
  }

  // Private notes are found by their title (their text is not in this index);
  // with the right, their text is searched too.
  const byWords = async (match, n) => {
    if (!match) return [];
    const rows = (await env.DB.prepare(`SELECT n.* FROM fts JOIN (${ALL}) n ON n.slug = fts.slug WHERE fts MATCH ? ORDER BY bm25(fts, 0, 8, 1) LIMIT ?`).bind(match, n * wide).all()).results ?? [];
    const found = rows.map(row);
    if (rights.private) {
      const extra = (await env.DB.prepare("SELECT n.* FROM private_fts JOIN private_note n ON n.slug = private_fts.slug WHERE private_fts MATCH ? ORDER BY bm25(private_fts, 0, 8, 1) LIMIT ?").bind(match, n * 3).all()).results ?? [];
      for (const e of extra.map(row)) if (!found.some((f) => f.slug === e.slug)) found.push(e);
    }
    return found.filter(filter).slice(0, n);
  };

  if (mode === "words") {
    const { words, match } = ftsQuery(a.query ?? "");
    if (!words.length) return [];
    return (await byWords(match, limit)).map((r) => out(r, words));
  }

  // BOTH: every meaningful word, any of them, and meaning, fused.
  const any = ftsAny(a.query ?? "");
  const strict = any.words.length ? { words: any.words, match: any.words.map((w) => `"${w}"*`).join(" ") } : ftsQuery(a.query ?? "");
  const shown = [...new Set([...any.words, ...strict.words])];
  const all = await byWords(strict.match, 30);
  const loose = await byWords(any.match, 30);
  const near = await byMeaning(30);
  const rows = new Map([...all, ...loose, ...near.map((x) => x.r)].map((r) => [r.slug, r]));
  const ways = ["words", "words", "meaning"];
  const W = m0.weights ?? new Map();
  return fuse([all.map((r) => r.slug), loose.map((r) => r.slug), near.map((x) => x.r.slug)], { weights: [2, all.length >= 3 ? 0.4 : 1, 1] })
    .map((f) => ({ ...f, score: weighted(f.score, W.get(f.key)) }))
    .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, limit)
    .map((f) => ({ ...out(rows.get(f.key), shown), found: [...new Set(f.from.map((i) => ways[i]))] }));
}

// Where to go next from an opened note, as on the computer (pure.mjs,
// pickLeads), measured against the note itself: a request here has no memory
// of the conversation's last question.
// The same rule as the search by meaning (2026-11-27): the note opened and
// the notes proposed are read from the table `note` alone, so a private note
// neither gets leads (they would come from its text and its vector) nor is
// one, whatever the token's rights.
async function nextSteps(env, rights, slug, hiddenAll = new Set()) {
  const me = await env.DB.prepare("SELECT slug, body FROM note WHERE slug = ?").bind(slug).first();
  if (!me) return [];
  const m = await vectors(env).catch(() => null);
  const vecs = new Map((m?.rows ?? []).map((r) => [r.slug, r.v]));
  const out = ((await env.DB.prepare("SELECT dst s FROM link WHERE src = ?").bind(slug).all()).results ?? []).map((r) => [r.s, "out"]);
  const inn = ((await env.DB.prepare("SELECT src s FROM link WHERE dst = ?").bind(slug).all()).results ?? []).map((r) => [r.s, "in"]);
  const seen = new Set([slug]);
  const candidates = [];
  for (const [s2, dir] of [...out, ...inn]) {
    if (seen.has(s2) || hiddenAll.has(s2)) continue;
    seen.add(s2);
    const f = await env.DB.prepare("SELECT slug, title, type, body FROM note WHERE slug = ?").bind(s2).first();
    if (!f) continue;
    candidates.push({ slug: s2, title: f.title, type: f.type, body: f.body, dir, vec: vecs.get(s2) ?? null });
  }
  return pickLeads(me, candidates, vecs.get(slug) ?? null);
}

async function get(env, rights, slug, voc, { full = true } = {}) {
  let r = await env.DB.prepare("SELECT * FROM note WHERE slug = ?").bind(slug).first();
  let table = "note";
  if (!r) {
    r = await env.DB.prepare("SELECT * FROM private_note WHERE slug = ?").bind(slug).first();
    table = "private_note";
  }
  if (!r) return null;
  const f = row(r);
  const titles = async (list) => {
    const out = [];
    for (const s of list) {
      const t = await env.DB.prepare(`SELECT slug, title, type FROM (${ALL}) WHERE slug = ?`).bind(s).first();
      out.push(t ?? { slug: s, missing: true });
    }
    return out;
  };
  const priv = f.visibility === "private";
  // WITHOUT THE RIGHT TO PRIVATE NOTES (2026-11-27), a private note is its
  // title: not its text, and nothing drawn from its text either. Its source
  // and the links it makes are not given; and among the notes that link to
  // any note, a private one is not named (that link is read from its text).
  const shut = priv && !rights.private;
  const outLinks = shut ? [] : (await env.DB.prepare("SELECT dst FROM link WHERE src = ?").bind(slug).all()).results.map((l) => l.dst);
  const inn = (await env.DB.prepare(`SELECT n.slug, n.title, n.type FROM link l JOIN (${rights.private ? ALL : "SELECT slug, title, type, updated FROM note"}) n ON n.slug = l.src WHERE l.dst = ? ORDER BY n.updated DESC`).bind(slug).all()).results ?? [];
  return {
    slug: f.slug, type: f.type, title: f.title, domains: f.domains, status: say(voc, "status", f.status), visibility: say(voc, "visibility", f.visibility),
    created: f.created, updated: f.updated, source: shut ? undefined : f.source,
    // As on the computer (engine.mjs): cut by default, everything with full.
    ...(await (async () => {
      const max = full ? Infinity : LINKS_LIMIT;
      const text = shut ? { body: MASK, cut: null } : full ? { body: await fullBody(env, table, f.slug, f.body), cut: null } : cutBody(await fullBody(env, table, f.slug, f.body));
      const omitted = {
        ...(text.cut ? { body: text.cut } : {}),
        ...(outLinks.length > max ? { links: outLinks.length } : {}),
        ...(inn.length > max ? { backlinks: inn.length, more: "the most recent are shown; brain_get with full: true lists them all" } : {}),
      };
      return { body: text.body, links: await titles(outLinks.slice(0, max)), backlinks: inn.slice(0, max), ...(Object.keys(omitted).length ? { omitted } : {}) };
    })()),
  };
}

async function neighbors(env, rights, a, voc, hiddenAll = new Set()) {
  const f = await get(env, rights, a.slug, voc, { full: false });
  if (!f) return null;
  const limit = clamp(a.limit, 8, LIMITS.neighbors);
  // THE SAME RULE AS THE SEARCH BY MEANING (2026-11-27). A vector is a note's
  // text in another form. Without the right to private notes: the neighbours
  // of a private note are not given (they would say what it is about), and a
  // private note is never the neighbour of another (being close to "blood
  // results" says as much). With the right, both are, as on the computer.
  const mine = await env.DB.prepare(rights.private ? `SELECT slug FROM (${ALL}) WHERE slug = ?` : "SELECT slug FROM note WHERE slug = ?").bind(a.slug).first();
  const m = await vectors(env);
  const self = mine ? m.rows.find((r) => r.slug === a.slug) : null;
  let similar = [];
  if (self) {
    // Hidden notes stay out of the neighbours, unless asked or the note is one of them.
    const hidden = a.everything || hiddenAll.has(a.slug) ? new Set() : hiddenAll;
    // (Taken wide: the notes left out below must not shorten the list.)
    for (const n of nearest(m.rows, self.v, limit * (hidden.size ? 10 : 1) + (rights.private ? 0 : 50), new Set([a.slug]))) {
      if (hidden.has(n.slug)) continue;
      const t = await env.DB.prepare(rights.private ? `SELECT title, type FROM (${ALL}) WHERE slug = ?` : "SELECT title, type FROM note WHERE slug = ?").bind(n.slug).first();
      if (!t) continue;
      similar.push({ slug: n.slug, ...t, score: Math.round(n.score * 1000) / 1000 });
      if (similar.length === limit) break;
    }
  }
  const omitted = { ...(f.omitted?.links ? { links: f.omitted.links } : {}), ...(f.omitted?.backlinks ? { backlinks: f.omitted.backlinks, more: "brain_get with full: true lists them all" } : {}) };
  return { slug: a.slug, title: f.title, links: f.links, backlinks: f.backlinks, similar, ...(Object.keys(omitted).length ? { omitted } : {}) };
}

async function timeline(env, a, voc) {
  const limit = clamp(a.limit, 30, LIMITS.timeline);
  const type = a.type ? String(a.type) : "";
  // The type is asked of the database (2026-11-27): it used to read up to
  // 100,000 rows to keep a few.
  const rows = (await env.DB.prepare(`SELECT slug, title, type, created, status FROM (${ALL}) WHERE created >= ? AND created <= ? AND (? = '' OR type = ?) ORDER BY created DESC, slug LIMIT ?`)
    .bind(a.since ? String(a.since) : "0000", a.until ? `${a.until}~` : "9999", type, type, limit).all()).results ?? [];
  return rows.map((r) => ({ ...r, status: say(voc, "status", r.status) }));
}

async function stats(env, m) {
  const count = async (col) => {
    const rows = (await env.DB.prepare(`SELECT ${col} k, COUNT(*) n FROM (${ALL}) GROUP BY ${col}`).all()).results ?? [];
    return Object.fromEntries(rows.map((r) => [r.k, r.n]));
  };
  const domains = Object.fromEntries(m.domains.map((d) => [d, 0]));
  for (const r of (await env.DB.prepare(`SELECT domains FROM (${ALL})`).all()).results ?? []) for (const d of JSON.parse(r.domains)) domains[d] = (domains[d] ?? 0) + 1;
  const byStatus = Object.fromEntries(Object.entries(await count("status")).map(([k, n]) => [say(m.voc, "status", k), n]));
  const byVisibility = Object.fromEntries(Object.entries(await count("visibility")).map(([k, n]) => [say(m.voc, "visibility", k), n]));
  return {
    notes: (await env.DB.prepare(`SELECT COUNT(*) n FROM (${ALL})`).first()).n,
    types: m.types,
    format: m.format,
    byType: await count("type"),
    byStatus,
    byVisibility,
    byDomain: domains,
    links: (await env.DB.prepare("SELECT COUNT(*) n FROM link").first()).n,
    vectors: (await vectors(env)).rows.length,
    searchByMeaning: Boolean(embeddingsOf(env)),
    lastBuild: m.generated,
    cloud: true,
  };
}

async function contact(env, rights, a) {
  const rows = (await env.DB.prepare("SELECT data FROM contact").all()).results ?? [];
  if (!rows.length) return { error: "this brain has no contacts directory in its cloud copy" };
  // WITHOUT THE RIGHT TO ADDRESSES (2026-11-27), the search itself is made on
  // the contacts without theirs (pure.mjs, withoutAddress): no address, no
  // domain, every address written in a text masked, and nothing of all that
  // looked into. Removing the field from the answer was not enough: a search
  // that still matched on the address gave it away letter by letter.
  return { found: matchContacts(rows.map((r) => JSON.parse(r.data)), String(a.query ?? "").slice(0, QUERY_MAX), { limit: clamp(a.limit, 15, LIMITS.contact), addresses: rights.addresses === true }) };
}

// ------------------------------------------------------------- the skills
// (2026-11-23) The skills of the executive floor, sent by cloud.mjs sync: an
// online AI is never Claude Code, so it gets them as prompts and through
// brain_skill, translated as on the computer (skills-text.mjs). Their folder
// stays on the person's computer: it is named, out of reach. A copy synced
// before the skills has no table: it serves none, and says nothing of them.
// A TOKEN READS THEM ONLY WITH ITS OWN RIGHT (2026-11-27): without `skills`,
// there is none for it, in the tools, the prompts and the instructions alike.
const NO_SKILLS = "this token was not given the right to read the brain's skills";
async function skills(env, rights) {
  if (!rights?.skills) return [];
  try {
    return (await env.DB.prepare("SELECT name, description, folder FROM skill ORDER BY name").all()).results ?? [];
  } catch {
    return [];
  }
}
async function skillText(env, rights, name, request) {
  if (!rights?.skills) return { error: NO_SKILLS };
  const all = await skills(env, rights);
  const found = findSkill(all, name);
  if (!found) return { error: `no skill named "${name}" in this brain; the skills are: ${all.map((x) => x.name).join(", ") || "none"}` };
  const row = await env.DB.prepare("SELECT name, description, body, files FROM skill WHERE name = ?").bind(found.name).first();
  const m = await meta(env);
  let files = [];
  let rules = [];
  try {
    files = JSON.parse(row.files ?? "[]");
  } catch {
    files = [];
  }
  try {
    rules = JSON.parse(m.guardRules ?? "[]");
  } catch {
    rules = [];
  }
  return { name: row.name, description: row.description ?? "", text: renderSkill({ name: row.name, body: row.body ?? "", dir: null, files, rules, request }) };
}

async function call(env, rights, name, a, budget) {
  const m = await meta(env);
  if (name === "brain_search") return search(env, rights, a, m, budget);
  if (name === "brain_get") {
    const f = await get(env, rights, a.slug, m.voc, { full: Boolean(a.full) });
    if (f && f.visibility !== say(m.voc, "visibility", "private")) {
      const next = await nextSteps(env, rights, a.slug, m.hidden);
      if (next.length) f.next = next;
    }
    if (f) return f;
  }
  if (name === "brain_get") return (await get(env, rights, a.slug, m.voc, { full: Boolean(a.full) })) ?? { error: `no note named "${a.slug}": search for it with brain_search` };
  if (name === "brain_neighbors") return (await neighbors(env, rights, a, m.voc, m.hidden)) ?? { error: `no note named "${a.slug}"` };
  if (name === "brain_timeline") return timeline(env, a, m.voc);
  if (name === "brain_stats") return stats(env, m);
  if (name === "brain_contact") return contact(env, rights, a);
  if (name === SKILL_TOOL.name) {
    if (!rights.skills) throw new Error(NO_SKILLS);
    if (!a.name) return skillList(await skills(env, rights));
    const r = await skillText(env, rights, a.name, a.request ?? "");
    if (r.error) throw new Error(r.error);
    return { raw: r.text };
  }
  throw new Error(`unknown tool ${name}`);
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** The body of a request as text, or null past `max` bytes: read piece by piece, never whole first. */
async function readBody(request, max) {
  if (Number(request.headers.get("content-length")) > max) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") return json({ error: "not found" }, 404);
    const rights = await door(request, env);
    if (!rights) return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    const text = await readBody(request, BODY_MAX).catch(() => null);
    if (text === null) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `request too large (${BODY_MAX / 1024} KB at most)` } }, 413);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400);
    }
    if (Array.isArray(msg) && msg.length > BATCH_MAX) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: `batch too large (${BATCH_MAX} messages at most)` } }, 400);
    // What the whole request may spend, shared by the messages of a batch.
    const budget = { embeddings: EMBED_MAX };
    const one = async (message) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } };
      const { id, method, params } = message;
      if (id === undefined || id === null) return null; // a notification
      try {
        if (method === "initialize") {
          const m = await meta(env);
          const names = (await skills(env, rights)).map((x) => x.name);
          const instructions = [instructionsFor(m.name), skillsSentence(names)].filter(Boolean).join(" ");
          return { jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: names.length ? { tools: {}, prompts: {} } : { tools: {} }, serverInfo: { name: "hypervibe-brain-cloud", version: "1.0.0" }, instructions } };
        }
        if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
        if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: (await skills(env, rights)).length ? [...TOOLS, SKILL_TOOL] : TOOLS } };
        if (method === "prompts/list") return { jsonrpc: "2.0", id, result: { prompts: (await skills(env, rights)).map(promptItem) } };
        if (method === "prompts/get") {
          const r = await skillText(env, rights, params?.name, params?.arguments?.request ?? "");
          if (r.error) return { jsonrpc: "2.0", id, error: { code: -32602, message: r.error } };
          return { jsonrpc: "2.0", id, result: { description: r.description, messages: [{ role: "user", content: { type: "text", text: r.text } }] } };
        }
        if (method === "tools/call") {
          try {
            const result = await call(env, rights, params?.name, params?.arguments ?? {}, budget);
            // A skill is a text to follow, not data: given as it is.
            const text = result && typeof result.raw === "string" ? result.raw : JSON.stringify(result);
            return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } };
          } catch (e) {
            return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: e.message }], isError: true } };
          }
        }
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
      } catch (e) {
        return { jsonrpc: "2.0", id, error: { code: -32603, message: e.message } };
      }
    };
    if (Array.isArray(msg)) {
      const answers = (await Promise.all(msg.map(one))).filter(Boolean);
      return answers.length ? json(answers) : new Response(null, { status: 202 });
    }
    const answer = await one(msg);
    return answer ? json(answer) : new Response(null, { status: 202 });
  },
};
