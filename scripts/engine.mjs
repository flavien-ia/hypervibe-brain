// engine.mjs - The five questions a brain answers, shared by the command line
// (query.mjs) and by the MCP server that Claude calls (mcp.mjs). One engine,
// so that Claude and the person at the keyboard always get the same answer.
//
// PRIVATE NOTES: they exist (title, type, links) but their content is never
// returned here unless `includePrivate` is asked for, which only the command
// line can do, for the person sitting at this computer.

import { buildIndex, openDb } from "./build.mjs";
import { config, loadEnv } from "./lib.mjs";
import { embed, embeddingsAvailable } from "./embeddings.mjs";

/** Always answer from an up-to-date index: rebuilt on the fly when a note moved. */
export async function freshDb() {
  const r = await buildIndex({ quiet: true, ifStale: true });
  const db = openDb({ readonly: true });
  if (!db) throw new Error("the index does not exist yet: run pnpm build");
  return { db, warning: r.ok ? null : `the index could not be refreshed (${r.errors.length} error(s) in the notes, first: ${r.errors[0].rel}: ${r.errors[0].msg}); answers come from the previous index` };
}

const row = (r) => ({ ...r, domains: JSON.parse(r.domains || "[]") });
const MASK = "(private note: its content is never shown to an AI)";

function snippet(body, words, len = 220) {
  if (!body) return "";
  const flat = body.replace(/\s+/g, " ");
  const low = flat.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  let at = -1;
  for (const w of words) {
    at = low.indexOf(w);
    if (at >= 0) break;
  }
  const start = Math.max(0, at - 60);
  return (start > 0 ? "..." : "") + flat.slice(start, start + len) + (start + len < flat.length ? "..." : "");
}

/** Every word must appear, anywhere, accents ignored. Several words are NOT an exact phrase. */
function ftsQuery(q) {
  const words = q.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return { words, match: words.map((w) => `"${w}"*`).join(" ") };
}

let vecCache = null;
function allVectors(db) {
  const built = db.prepare("SELECT v FROM meta WHERE k = 'built'").get()?.v;
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

function nearest(db, query, limit, exclude = new Set()) {
  let qn = 0;
  for (const x of query) qn += x * x;
  qn = Math.sqrt(qn) || 1;
  const scored = [];
  for (const r of allVectors(db)) {
    if (exclude.has(r.slug)) continue;
    let dot = 0;
    for (let i = 0; i < r.v.length; i++) dot += r.v[i] * query[i];
    scored.push({ slug: r.slug, score: dot / (qn * r.norm) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function search(db, q, { semantic = false, limit = 10, type, domain, includePrivate = false } = {}) {
  const filter = (r) => (!type || r.type === type) && (!domain || r.domains.includes(domain));
  if (semantic) {
    loadEnv();
    if (!embeddingsAvailable()) throw new Error("search by meaning needs an embeddings key in the brain's .env (see the brain's CLAUDE.md)");
    const [qv] = await embed([q], config());
    const get = db.prepare("SELECT * FROM fiche WHERE slug = ?");
    return nearest(db, qv, limit * 3)
      .map((n) => ({ ...row(get.get(n.slug)), score: Math.round(n.score * 1000) / 1000 }))
      .filter(filter)
      .slice(0, limit)
      .map((r) => ({ slug: r.slug, type: r.type, title: r.title, score: r.score, excerpt: snippet(r.body, []) }));
  }
  const { words, match } = ftsQuery(q);
  if (!words.length) return [];
  const rows = db
    .prepare("SELECT f.* FROM fts JOIN fiche f ON f.slug = fts.slug WHERE fts MATCH ? ORDER BY bm25(fts, 0, 8, 1) LIMIT ?")
    .all(match, limit * 3)
    .map(row)
    .filter(filter)
    .slice(0, limit);
  return rows.map((r) => ({
    slug: r.slug,
    type: r.type,
    title: r.title,
    excerpt: r.visibility === "private" && !includePrivate ? MASK : snippet(r.body, words),
  }));
}

export function get(db, slug, { includePrivate = false } = {}) {
  const r = db.prepare("SELECT * FROM fiche WHERE slug = ?").get(slug);
  if (!r) return null;
  const f = row(r);
  const exists = db.prepare("SELECT slug, title, type FROM fiche WHERE slug = ?");
  const out = db.prepare("SELECT dst FROM link WHERE src = ?").all(slug).map((l) => exists.get(l.dst) ?? { slug: l.dst, missing: true });
  const inn = db.prepare("SELECT f.slug, f.title, f.type FROM link l JOIN fiche f ON f.slug = l.src WHERE l.dst = ?").all(slug);
  return {
    slug: f.slug, file: f.rel, type: f.type, title: f.title, domains: f.domains, status: f.status, visibility: f.visibility,
    created: f.created, updated: f.updated, source: f.source,
    body: f.visibility === "private" && !includePrivate ? MASK : f.body,
    links: out, backlinks: inn,
  };
}

export function neighbors(db, slug, { limit = 8 } = {}) {
  const f = get(db, slug);
  if (!f) return null;
  const v = db.prepare("SELECT vec FROM vec WHERE slug = ?").get(slug);
  let similar = [];
  if (v) {
    const buf = Buffer.from(v.vec);
    const q = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    const title = db.prepare("SELECT title, type FROM fiche WHERE slug = ?");
    similar = nearest(db, q, limit, new Set([slug])).map((n) => ({ slug: n.slug, ...title.get(n.slug), score: Math.round(n.score * 1000) / 1000 }));
  }
  return { slug, title: f.title, links: f.links, backlinks: f.backlinks, similar };
}

export function timeline(db, { since, until, limit = 30, type } = {}) {
  const rows = db.prepare("SELECT slug, title, type, created, status FROM fiche WHERE created >= ? AND created <= ? ORDER BY created DESC LIMIT ?")
    // Dates compare as text: "2026-09" is before every day of September, "2026-09~" after them.
    .all(since ? String(since) : "0000", until ? `${until}~` : "9999", type ? 100000 : limit);
  return (type ? rows.filter((r) => r.type === type) : rows).slice(0, limit);
}

export function stats(db) {
  const count = (sql) => Object.fromEntries(db.prepare(sql).all().map((r) => [r.k, r.n]));
  const domains = Object.fromEntries(config().domains.map((d) => [d, 0]));
  for (const r of db.prepare("SELECT domains FROM fiche").all()) for (const d of JSON.parse(r.domains)) domains[d] = (domains[d] ?? 0) + 1;
  return {
    notes: db.prepare("SELECT COUNT(*) n FROM fiche").get().n,
    byType: count("SELECT type k, COUNT(*) n FROM fiche GROUP BY type"),
    byStatus: count("SELECT status k, COUNT(*) n FROM fiche GROUP BY status"),
    byVisibility: count("SELECT visibility k, COUNT(*) n FROM fiche GROUP BY visibility"),
    byDomain: domains,
    links: db.prepare("SELECT COUNT(*) n FROM link").get().n,
    vectors: db.prepare("SELECT COUNT(*) n FROM vec").get().n,
    searchByMeaning: (loadEnv(), embeddingsAvailable()),
    lastBuild: db.prepare("SELECT v FROM meta WHERE k = 'built'").get()?.v ?? null,
  };
}
