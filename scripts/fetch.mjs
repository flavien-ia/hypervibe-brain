// fetch.mjs - brain_fetch(address): reads the data a note routes to, where it
// lives. READ ONLY, by construction:
//
//   - a database is only ever asked the SELECT written in the brain's
//     registry for that collection (never a query from the AI);
//   - an API is only ever called with GET;
//   - a file is only read.
//
// THE REGISTRY lives in brain.json, section "data": one entry per scheme of
// address (crm://, neon://, qonto://...). An address is
// scheme://collection[/id][?filter=value], or for a scheme with several
// projects or entities, scheme://project/collection[/id]. Adapters:
//
//   "postgres"  a Neon database, SQL over HTTP (no driver): { url, collections:
//               { name: { one: "SELECT ... WHERE id = $1", list: "SELECT ... ",
//               filters: ["network"] } } }, or { projects: { name: { url, collections } } }
//   "http"      a JSON API, GET only: { entities: { name: { base, headers:
//               { "Authorization": "Bearer {secret}" }, secrets: { secret: ... } } },
//               routes: { name: "/path/{id}" } }
//               An entity may also say "vars" (values for the route, such as an
//               account id: "/portfolio/?investorId={investor}") and "auth":
//               { clientCredentials: { tokenUrl, id, secret, scope } }, an OAuth
//               token asked for each read (Spiko's investor API, for one).
//   "flex"      a broker's Flex Web Service (Interactive Brokers): { entities:
//               { name: { token: <secret>, queries: { name: <query id> } } } },
//               read in its two steps (a request, then the statement), XML.
//               A database (or a project) with "explore": true can be read
//               down to its rows, without a collection written for each table:
//               scheme://[project/]tables (every table and its row count),
//               scheme://[project/]<table> (its columns and its latest 50 rows,
//               ?<column>=<value> to filter), scheme://[project/]<table>/<id>
//               (one row, by its primary key). The table and the columns are
//               checked against the database's own schema, never taken as
//               they are; columns that hold secrets (passwords, hashes,
//               tokens, keys) are never returned.
//   "file"      a JSON file of the brain: { file, array, key }
//   "files"     a folder of this computer, for the documents a note points to
//               (a talk's materials, a signed contract, a code repository):
//               { root: { sourceRoot: "dropbox" } }, the root being read from
//               this computer's settings (~/.hypervibe-brain/config.json,
//               sourceRoots), so that the address stays the same on every
//               computer. A folder gives its listing, a text file its content
//               (up to 60 KB), any other document its size and date, to open
//               with the conversation's own tools. Spaces are written %20.
//   "catalogue" the catalogue entry itself (the default for any address in it)
//
// A secret is { env: { file, key } } (a project's .env) or { vault: [item, field] }
// (the Hypervibe vault). It is read when needed, never written, never returned.

import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { DATA_ADDRESS, HOME, ROOT, config, hypervibeVault, userConfig } from "./lib.mjs";
import { readCatalogue } from "./catalogue.mjs";

const LIMIT = 50;

// NO ANSWER WITHOUT AN END (2026-11-21). An API's whole response, or fifty
// rows with their long texts, came back as they were. What a tool gives is
// now shortened past MAX_DATA characters, and says what was left.
const MAX_DATA = 60_000;
const CELL_LIMIT = 500;
const cutCells = (row) => (row && typeof row === "object" && !Array.isArray(row) ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === "string" && v.length > CELL_LIMIT ? `${v.slice(0, CELL_LIMIT)}...` : v])) : row);
const sizeOf = (x) => JSON.stringify(x)?.length ?? 0;
/**
 * A value too long for one answer: its longest list is halved until it fits,
 * else only its beginning is given, as text. `cut` says what was left out.
 * @param {any} value @param {number} max characters of JSON @param {string} [hint] how to ask for the rest
 */
export function shorten(value, max, hint = "ask for less at a time, or narrow the question") {
  const total = sizeOf(value);
  if (total <= max) return value;
  const top = Array.isArray(value);
  const holder = top ? { result: value } : value && typeof value === "object" ? { ...value } : null;
  const key = holder ? Object.keys(holder).filter((k) => Array.isArray(holder[k]) && holder[k].length > 1).sort((a, b) => sizeOf(holder[b]) - sizeOf(holder[a]))[0] : undefined;
  if (key) {
    const all = holder[key].length;
    while (holder[key].length > 1 && sizeOf(holder) > max) holder[key] = holder[key].slice(0, Math.ceil(holder[key].length / 2));
    if (sizeOf(holder) <= max) return { ...holder, cut: { what: top ? "results" : key, shown: holder[key].length, total: all, more: `too long to be given whole: ${hint}` } };
  }
  return { cut: { shown: max, total, more: `too long to be given whole, only its beginning is here, as text: ${hint}` }, text: JSON.stringify(value).slice(0, max) };
}
/** The data of an address within bounds: long values of a list of rows first, then fewer rows. */
function bounded(data) {
  if (sizeOf(data) <= MAX_DATA) return data;
  const hint = "read one record by its own address, or filter";
  if (data && Array.isArray(data.rows)) return shorten({ ...data, rows: data.rows.map(cutCells), longValues: `cut at ${CELL_LIMIT} characters` }, MAX_DATA, hint);
  return shorten(data, MAX_DATA, hint);
}

export function parseAddress(address) {
  const m = /^([a-z][a-z0-9+.-]*):\/\/([^?#]*)(?:\?([^#]*))?$/.exec(String(address));
  if (!m || !DATA_ADDRESS.test(String(address))) return null;
  return { scheme: m[1], parts: m[2].split("/").filter(Boolean).map(decodeURIComponent), query: Object.fromEntries(new URLSearchParams(m[3] ?? "")) };
}

function readEnvFile(file, key) {
  const p = isAbsolute(file) ? file : join(ROOT, file);
  if (!existsSync(p)) return null;
  const m = new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m").exec(readFileSync(p, "utf8"));
  return m ? m[1] : null;
}

function secret(spec) {
  if (!spec) return null;
  if (typeof spec === "string") return spec.startsWith("$") ? process.env[spec.slice(1)] ?? null : null;
  if (spec.env) return readEnvFile(spec.env.file, spec.env.key);
  if (spec.vault) return hypervibeVault(spec.vault[0], spec.vault[1]);
  return null;
}

async function postgres(url, query, params) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("the database address is not valid");
  }
  // The connection string travels in the request: only ever to Neon.
  if (!/\.neon\.tech$/.test(host)) throw new Error(`the database is not a Neon database (${host}): brain_fetch only speaks Neon's SQL over HTTP`);
  if (!/^\s*(select|with)\b/i.test(query) || /;\s*\S/.test(query)) throw new Error("the registry's query must be one SELECT");
  const res = await fetch(`https://${host}/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Neon-Connection-String": url, "Neon-Array-Mode": "false" },
    body: JSON.stringify({ query, params }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`the database answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).rows;
}

async function fromPostgres(def, parts, query) {
  // Several projects under one scheme (neon://hypervibe/participant/12).
  let base = def;
  if (def.projects) {
    base = def.projects[parts[0]];
    if (!base) throw new Error(`no project "${parts[0]}" in the registry (known: ${Object.keys(def.projects).join(", ")})`);
    parts = parts.slice(1);
  }
  const [name, id] = parts;
  const col = base.collections?.[name];
  const url = secret(base.url);
  if (!url) throw new Error("the database address could not be read (its .env, or the vault)");
  if (!col && base.explore) return explore(url, name, id, query);
  if (!col) throw new Error(`no collection "${name ?? ""}" in the registry (known: ${Object.keys(base.collections ?? {}).join(", ")})`);
  if (id !== undefined) {
    if (!col.one) throw new Error(`the collection "${name}" is read as a list only`);
    const rows = await postgres(url, col.one, [id]);
    return rows[0] ?? { error: "nothing at this address" };
  }
  if (!col.list) throw new Error(`the collection "${name}" is read one by one (add the id)`);
  const params = (col.filters ?? []).map((f) => query[f] ?? null);
  const rows = await postgres(url, col.list, params);
  return { count: rows.length, rows: rows.slice(0, LIMIT) };
}

// READING A DATABASE DOWN TO ITS ROWS ("explore"). Every name comes from the
// database's own schema: an unknown table or column is refused, and the names
// that are used are quoted as identifiers. A column that holds a secret is
// never returned, whatever the table.
const SECRET_COLUMN = /pass(word)?|pwd|hash|salt|secret|token|otp|totp|api_?key|private|session|cookie|refresh|iban|card_?number|cvc/i;
const ident = (n) => `"${String(n).replace(/"/g, '""')}"`;
async function explore(url, table, id, query) {
  const tables = await postgres(url, "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name", []);
  const names = tables.map((t) => t.table_name);
  if (!table || table === "tables") {
    const counts = await postgres(url, "SELECT table_name AS table, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS rows FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name", []);
    return { tables: counts, how: "scheme://[project/]<table> for its columns and latest rows, scheme://[project/]<table>/<id> for one row, ?<column>=<value> to filter" };
  }
  if (!names.includes(table)) throw new Error(`no table "${table}" in this database (tables: ${names.join(", ")})`);
  const cols = await postgres(url, "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position", [table]);
  const shown = cols.filter((c) => !SECRET_COLUMN.test(c.column_name));
  const hidden = cols.length - shown.length;
  const pk = (await postgres(url, "SELECT a.attname AS column_name FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = $1::regclass AND i.indisprimary", [`public.${ident(table)}`]))[0]?.column_name;
  const select = shown.map((c) => ident(c.column_name)).join(", ") || "1";
  const cut = cutCells;
  if (id !== undefined) {
    if (!pk) throw new Error(`the table "${table}" has no primary key: read it as a list, filtered`);
    const rows = await postgres(url, `SELECT ${select} FROM public.${ident(table)} WHERE ${ident(pk)}::text = $1 LIMIT 1`, [String(id)]);
    return rows[0] ? cut(rows[0]) : { error: "nothing at this address" };
  }
  // Filters: only on columns this table has, by equality.
  const filters = Object.entries(query ?? {}).filter(([k]) => shown.some((c) => c.column_name === k));
  const where = filters.length ? `WHERE ${filters.map(([k], i) => `${ident(k)}::text = $${i + 1}`).join(" AND ")}` : "";
  const order = cols.find((c) => c.column_name === "created_at") ? `ORDER BY ${ident("created_at")} DESC` : pk ? `ORDER BY ${ident(pk)} DESC` : "";
  const rows = await postgres(url, `SELECT ${select} FROM public.${ident(table)} ${where} ${order} LIMIT ${LIMIT}`, filters.map(([, v]) => String(v)));
  return { table, columns: shown.map((c) => `${c.column_name} (${c.data_type})`), hiddenColumns: hidden || undefined, primaryKey: pk ?? null, count: rows.length, rows: rows.map(cut) };
}

async function fromHttp(def, parts, query) {
  const [entityName, route, ...rest] = parts;
  const entity = def.entities?.[entityName];
  if (!entity) throw new Error(`no entity "${entityName ?? ""}" in the registry (known: ${Object.keys(def.entities ?? {}).join(", ")})`);
  const tpl = def.routes?.[route ?? ""] ?? def.routes?.[""];
  if (!tpl) throw new Error(`no route "${route ?? ""}" in the registry (known: ${Object.keys(def.routes ?? {}).join(", ")})`);
  const values = { ...(entity.vars ?? {}), id: rest[0] ?? "" };
  const path = tpl.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(values[k] ?? query[k] ?? ""));
  const secrets = Object.fromEntries(Object.entries(entity.secrets ?? {}).map(([k, s]) => [k, secret(s)]));
  if (Object.values(secrets).some((v) => !v)) throw new Error("a key could not be read (the vault may be locked)");
  const headers = Object.fromEntries(Object.entries(entity.headers ?? {}).map(([k, v]) => [k, String(v).replace(/\{(\w+)\}/g, (_, s) => secrets[s] ?? "")]));
  // An OAuth token for this read (client credentials), asked with the entity's own keys.
  const cc = entity.auth?.clientCredentials;
  if (cc) {
    const id = secret(cc.id);
    const sec = secret(cc.secret);
    if (!id || !sec) throw new Error("a key could not be read (the vault may be locked)");
    const t = await fetch(cc.tokenUrl, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${id}:${sec}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=client_credentials${cc.scope ? `&scope=${encodeURIComponent(cc.scope)}` : ""}`,
      signal: AbortSignal.timeout(30_000),
    });
    const tj = await t.json().catch(() => ({}));
    if (!tj.access_token) throw new Error(`the service refused its token (${t.status})`);
    headers.Authorization = `Bearer ${tj.access_token}`;
  }
  const res = await fetch(`${entity.base}${path}`, { method: "GET", headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`the service answered ${res.status}`);
  return res.json();
}

// A BROKER'S FLEX WEB SERVICE (Interactive Brokers): the statement of a
// saved query, read in its two steps. GET only, like every API here.
async function fromFlex(def, parts) {
  const [entityName, queryName] = parts;
  const entity = def.entities?.[entityName];
  if (!entity) throw new Error(`no entity "${entityName ?? ""}" in the registry (known: ${Object.keys(def.entities ?? {}).join(", ")})`);
  const q = entity.queries?.[queryName ?? ""] ?? Object.values(entity.queries ?? {})[0];
  const queryId = secret(q);
  const token = secret(entity.token);
  if (!token || !queryId) throw new Error("a key could not be read (the vault or the .env)");
  const base = def.base ?? "https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService";
  const ask = await (await fetch(`${base}/SendRequest?t=${encodeURIComponent(token)}&q=${encodeURIComponent(queryId)}&v=3`, { signal: AbortSignal.timeout(30_000) })).text();
  const ref = /<ReferenceCode>([^<]+)</.exec(ask)?.[1];
  if (!ref) throw new Error(`the broker refused the request: ${(/<ErrorMessage>([^<]+)</.exec(ask)?.[1] ?? ask).slice(0, 200)}`);
  // The statement is prepared in a few seconds: asked again while it is not ready.
  for (let i = 0; i < 8; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const st = await (await fetch(`${base}/GetStatement?t=${encodeURIComponent(token)}&q=${encodeURIComponent(ref)}&v=3`, { signal: AbortSignal.timeout(60_000) })).text();
    if (/<ErrorCode>1019<|in progress/i.test(st)) continue;
    if (/<ErrorMessage>/.test(st) && !/<FlexStatement/.test(st)) throw new Error(`the broker answered: ${(/<ErrorMessage>([^<]+)</.exec(st)?.[1] ?? "").slice(0, 200)}`);
    return { format: "xml", statement: st.length > 60_000 ? `${st.slice(0, 60_000)}...` : st };
  }
  throw new Error("the statement was not ready in time: try again in a minute");
}

function fromFile(def, parts) {
  const p = isAbsolute(def.file) ? def.file : join(ROOT, def.file);
  const json = JSON.parse(readFileSync(p, "utf8"));
  const items = def.array ? json[def.array] ?? [] : json;
  const id = parts.join("/").toLowerCase();
  const hit = items.find((x) => String(x[def.key] ?? "").toLowerCase() === id);
  return hit ?? { error: "nothing at this address" };
}

// A FOLDER OR A DOCUMENT OF THIS COMPUTER, read only, never outside its root.
//
// WHAT IS NEVER READ THIS WAY (2026-11-21). A root is often wide (a whole
// folder of projects, a whole Dropbox) and may hold the brain itself: an AI
// given a note's file by brain_get could ask brain_fetch for that file, or
// for the brain's index, settings and .env, under the wide root, and receive
// them whole. Checked on a real brain; nothing else stood in the way. So,
// whatever the root an address goes through:
//   - nothing inside the brain's own folder (its notes, its index, its
//     settings and its .env), nor inside the plugin's settings on this
//     computer (~/.hypervibe-brain): a note is read with brain_get;
//   - nothing whose path, under the root, has a name that starts with a dot
//     (.env, .git, .ssh, .aws): where keys and histories live;
//   - nothing a link leads to outside the root.
// Both the path as it is written and the path as the disk knows it are
// checked (links followed, short names written out), without regard to case
// where the disk has none, so that no other spelling of a path goes through.
const TEXT = /\.(md|txt|json|csv|ya?ml|mjs|js|ts|tsx|py|html|css)$/i;
const CASELESS = process.platform === "win32" || process.platform === "darwin";
const spelled = (p) => (CASELESS ? resolve(p).toLowerCase() : resolve(p));
/** A path as the disk knows it; as it is written when nothing is there. */
const onDisk = (p) => {
  try {
    return spelled(realpathSync.native(resolve(p)));
  } catch {
    return spelled(p);
  }
};
/** The path from a folder down to what it holds: null when it is not inside ("" is the folder itself). */
const under = (dir, p) => {
  const rel = relative(dir, p);
  return /^\.\.([\\/]|$)/.test(rel) || isAbsolute(rel) ? null : rel;
};
const offLimits = () => [ROOT, join(HOME, ".hypervibe-brain")].flatMap((d) => [...new Set([spelled(d), onDisk(d)])]);
/** Why a path under a root is never read, or null. `base` and `p` spelled the same way (both written, or both on disk). */
function refusal(base, p) {
  const rel = under(base, p);
  if (rel === null) return "outside the root";
  if (rel.split(/[\\/]/).some((s) => s.startsWith("."))) return "a file or a folder whose name starts with a dot is never read this way";
  if (offLimits().some((d) => under(d, p) !== null)) return "the brain's own folder is never read this way: a note is read with brain_get";
  return null;
}
function fromFiles(def, parts) {
  const name = def.root?.sourceRoot;
  const base = name ? userConfig().sourceRoots?.[name] : def.root;
  if (!base) throw new Error(`no root for "${name}" on this computer (~/.hypervibe-brain/config.json, sourceRoots)`);
  const abs = resolve(base, ...parts);
  // As written first (nothing is touched on the disk for a path refused by
  // its words alone), then as the disk knows it.
  const written = refusal(spelled(base), spelled(abs));
  if (written) throw new Error(written);
  if (!existsSync(abs)) return { error: "nothing at this address anymore (moved or deleted)" };
  const real = refusal(onDisk(base), onDisk(abs));
  if (real) throw new Error(real);
  const st = statSync(abs);
  const when = (t) => new Date(t).toISOString().slice(0, 10);
  if (st.isDirectory()) {
    // What would be refused if asked for is not listed either.
    const realBase = onDisk(base);
    const items = readdirSync(abs, { withFileTypes: true }).filter((e) => !e.name.startsWith(".") && !((e.isDirectory() || e.isSymbolicLink()) && refusal(realBase, onDisk(join(abs, e.name)))));
    return {
      kind: "folder",
      modified: when(st.mtimeMs),
      count: items.length,
      items: items.slice(0, 100).map((e) => {
        let s2 = null;
        try {
          s2 = statSync(join(abs, e.name));
        } catch {
          s2 = null; // a link to nothing, a file in use: listed without its size
        }
        const folder = s2 ? s2.isDirectory() : e.isDirectory();
        return { name: e.name, kind: folder ? "folder" : "file", ...(folder || !s2 ? {} : { size: s2.size }), ...(s2 ? { modified: when(s2.mtimeMs) } : {}) };
      }),
      ...(items.length > 100 ? { more: items.length - 100 } : {}),
    };
  }
  const out = { kind: "file", size: st.size, modified: when(st.mtimeMs), path: abs.replace(/\\/g, "/") };
  if (TEXT.test(abs) && st.size <= 60_000) out.text = readFileSync(abs, "utf8");
  else out.note = "not read here: open it with the conversation's own tools (a PDF, a slide deck, an image...)";
  return out;
}

/** Reads the data at an address. Returns { address, tool, data } or { error }. */
export async function fetchAddress(address) {
  const a = parseAddress(address);
  if (!a) return { error: `"${address}" is not an address (scheme://path)` };
  const def = config().data?.[a.scheme];
  const entry = readCatalogue().find((e) => e.address === address);
  try {
    if (!def || def.adapter === "catalogue") {
      if (entry) return { address, tool: entry.tool, data: entry, note: "from the catalogue: only its excerpt is kept here" };
      return { error: def ? "nothing at this address in the catalogue" : `no tool registered for "${a.scheme}://" (brain.json, data)` };
    }
    let data;
    // (A statement and a document have their own limit, 60 KB of text.)
    if (def.adapter === "postgres") data = bounded(await fromPostgres(def, a.parts, a.query));
    else if (def.adapter === "http") data = bounded(await fromHttp(def, a.parts, a.query));
    else if (def.adapter === "flex") data = await fromFlex(def, a.parts);
    else if (def.adapter === "file") data = bounded(fromFile(def, a.parts));
    else if (def.adapter === "files") data = fromFiles(def, a.parts);
    else return { error: `unknown adapter "${def.adapter}"` };
    return { address, tool: def.tool ?? a.scheme, data };
  } catch (e) {
    // The tool could not answer: the catalogue's excerpt is better than nothing.
    if (entry) return { address, tool: entry.tool, data: entry, warning: `${e.message}; the catalogue's excerpt is given instead` };
    return { error: e.message };
  }
}
