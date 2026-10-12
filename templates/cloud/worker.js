// worker.js - The brain's copy in the cloud: the same six tools as on the
// computer, for an online agent or a device without the brain, READ ONLY.
//
// THE DOOR. A token per consumer, given to one agent. The Worker only knows
// their SHA-256 prints (secret TOKENS); with no token at all, or an unreadable
// list, EVERYONE gets 401: deploying opens nothing, creating a token does.
// Two rights, closed at creation and opened agent by agent: `private` (the
// content of private notes, if the person chose to copy them to the cloud)
// and `addresses` (the email addresses of the directory).
//
// THE SAME ANSWERS AS THE COMPUTER. The calculations (the full-text query,
// the excerpts, the proximity by meaning, the directory search) and the tools'
// descriptions are the very files the computer runs (pure.mjs, tools.mjs),
// copied next to this one at deployment. No dependency: the MCP protocol is
// spoken by hand, as on the computer.
//
// Bindings: DB (D1, in the EU jurisdiction), BRAIN (R2, same), secrets TOKENS
// and, for search by meaning, OPENAI_API_KEY (EMBEDDINGS_BASE_URL optional).

import { VOCAB, ftsQuery, matchContacts, nearest, normOf, snippet } from "./pure.mjs";
import { TOOLS, instructionsFor } from "./tools.mjs";

const MASK = "(private note: its content is never shown to an AI)";

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
  return t ? { name: t.name, private: t.private === true, addresses: t.addresses === true } : null;
}

async function meta(env) {
  const rows = (await env.DB.prepare("SELECT k, v FROM meta").all()).results ?? [];
  const m = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const voc = VOCAB[m.format] ?? VOCAB.en;
  return { name: m.name ?? null, format: m.format ?? "en", voc, types: JSON.parse(m.types ?? "{}"), domains: JSON.parse(m.domains ?? "[]"), hidden: new Set(JSON.parse(m.hidden ?? "[]")), generated: m.generated ?? null };
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

async function embedQuery(env, text, m) {
  const base = String(env.EMBEDDINGS_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const res = await fetch(`${base}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENAI_API_KEY}` },
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

async function search(env, rights, a, m0) {
  const limit = a.limit ?? 10;
  // The notes the brain keeps out of search unless asked (search.hidden), as on the computer.
  const hidden = a.everything ? new Set() : m0.hidden;
  const wide = hidden.size ? 10 : 3;
  const filter = (r) => (!a.type || r.type === a.type) && (!a.domain || r.domains.includes(a.domain)) && !hidden.has(r.slug);
  if (a.meaning) {
    if (!env.OPENAI_API_KEY) throw new Error("search by meaning is not available in this cloud copy");
    const m = await vectors(env);
    const qv = await embedQuery(env, a.query, m);
    const out = [];
    for (const n of nearest(m.rows, qv, limit * wide)) {
      const r = await env.DB.prepare("SELECT * FROM note WHERE slug = ?").bind(n.slug).first();
      if (!r || !filter(row(r))) continue;
      out.push({ slug: r.slug, type: r.type, title: r.title, score: Math.round(n.score * 1000) / 1000, excerpt: snippet(r.body, []) });
      if (out.length === limit) break;
    }
    return out;
  }
  const { words, match } = ftsQuery(a.query ?? "");
  if (!words.length) return [];
  // Private notes are found by their title (their text is not in this index);
  // with the right, their text is searched too.
  const rows = (await env.DB.prepare(`SELECT n.* FROM fts JOIN (${ALL}) n ON n.slug = fts.slug WHERE fts MATCH ? ORDER BY bm25(fts, 0, 8, 1) LIMIT ?`).bind(match, limit * wide).all()).results ?? [];
  let found = rows.map(row);
  if (rights.private) {
    const extra = (await env.DB.prepare("SELECT n.* FROM private_fts JOIN private_note n ON n.slug = private_fts.slug WHERE private_fts MATCH ? ORDER BY bm25(private_fts, 0, 8, 1) LIMIT ?").bind(match, limit * 3).all()).results ?? [];
    for (const e of extra.map(row)) if (!found.some((f) => f.slug === e.slug)) found.push(e);
  }
  return found.filter(filter).slice(0, limit).map((r) => ({
    slug: r.slug,
    type: r.type,
    title: r.title,
    excerpt: r.visibility === "private" && !rights.private ? MASK : snippet(r.body, words),
  }));
}

async function get(env, rights, slug, voc) {
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
  const outLinks = (await env.DB.prepare("SELECT dst FROM link WHERE src = ?").bind(slug).all()).results.map((l) => l.dst);
  const inn = (await env.DB.prepare(`SELECT n.slug, n.title, n.type FROM link l JOIN (${ALL}) n ON n.slug = l.src WHERE l.dst = ?`).bind(slug).all()).results ?? [];
  const priv = f.visibility === "private";
  return {
    slug: f.slug, type: f.type, title: f.title, domains: f.domains, status: say(voc, "status", f.status), visibility: say(voc, "visibility", f.visibility),
    created: f.created, updated: f.updated, source: f.source,
    body: priv && !rights.private ? MASK : await fullBody(env, table, f.slug, f.body),
    links: await titles(outLinks), backlinks: inn,
  };
}

async function neighbors(env, rights, a, voc, hiddenAll = new Set()) {
  const f = await get(env, rights, a.slug, voc);
  if (!f) return null;
  const m = await vectors(env);
  const self = m.rows.find((r) => r.slug === a.slug);
  let similar = [];
  if (self) {
    // Hidden notes stay out of the neighbours, unless asked or the note is one of them.
    const hidden = a.everything || hiddenAll.has(a.slug) ? new Set() : hiddenAll;
    for (const n of nearest(m.rows, self.v, (a.limit ?? 8) * (hidden.size ? 10 : 1), new Set([a.slug]))) {
      if (hidden.has(n.slug)) continue;
      const t = await env.DB.prepare("SELECT title, type FROM note WHERE slug = ?").bind(n.slug).first();
      similar.push({ slug: n.slug, ...t, score: Math.round(n.score * 1000) / 1000 });
      if (similar.length === (a.limit ?? 8)) break;
    }
  }
  return { slug: a.slug, title: f.title, links: f.links, backlinks: f.backlinks, similar };
}

async function timeline(env, a, voc) {
  const limit = a.limit ?? 30;
  const rows = (await env.DB.prepare(`SELECT slug, title, type, created, status FROM (${ALL}) WHERE created >= ? AND created <= ? ORDER BY created DESC, slug LIMIT ?`)
    .bind(a.since ? String(a.since) : "0000", a.until ? `${a.until}~` : "9999", a.type ? 100000 : limit).all()).results ?? [];
  return (a.type ? rows.filter((r) => r.type === a.type) : rows).slice(0, limit).map((r) => ({ ...r, status: say(voc, "status", r.status) }));
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
    searchByMeaning: Boolean(env.OPENAI_API_KEY),
    lastBuild: m.generated,
    cloud: true,
  };
}

async function contact(env, rights, a) {
  const rows = (await env.DB.prepare("SELECT data FROM contact").all()).results ?? [];
  if (!rows.length) return { error: "this brain has no contacts directory in its cloud copy" };
  const found = matchContacts(rows.map((r) => JSON.parse(r.data)), a.query ?? "", { limit: a.limit ?? 15 });
  // Without the right, a contact comes without its address.
  return { found: rights.addresses ? found : found.map(({ address, ...rest }) => rest) };
}

async function call(env, rights, name, a) {
  const m = await meta(env);
  if (name === "brain_search") return search(env, rights, a, m);
  if (name === "brain_get") return (await get(env, rights, a.slug, m.voc)) ?? { error: `no note named "${a.slug}": search for it with brain_search` };
  if (name === "brain_neighbors") return (await neighbors(env, rights, a, m.voc, m.hidden)) ?? { error: `no note named "${a.slug}"` };
  if (name === "brain_timeline") return timeline(env, a, m.voc);
  if (name === "brain_stats") return stats(env, m);
  if (name === "brain_contact") return contact(env, rights, a);
  throw new Error(`unknown tool ${name}`);
}

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/mcp") return json({ error: "not found" }, 404);
    const rights = await door(request, env);
    if (!rights) return json({ error: "unauthorized" }, 401, { "WWW-Authenticate": "Bearer" });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405, { Allow: "POST" });
    let msg;
    try {
      msg = await request.json();
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }, 400);
    }
    const one = async ({ id, method, params }) => {
      if (id === undefined || id === null) return null; // a notification
      try {
        if (method === "initialize") {
          const m = await meta(env);
          return { jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hypervibe-brain-cloud", version: "1.0.0" }, instructions: instructionsFor(m.name) } };
        }
        if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
        if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
        if (method === "tools/call") {
          try {
            const result = await call(env, rights, params?.name, params?.arguments ?? {});
            return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 1) }] } };
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
