#!/usr/bin/env node
// cloud.mjs - The brain's copy on Cloudflare, for online agents: a D1 database
// and an R2 bucket in the EU jurisdiction, and a Worker that serves the six
// tools behind a token door (templates/cloud/worker.js). Everything goes
// through `wrangler`, with the person's own login (`wrangler login`): the
// plugin keeps no Cloudflare key.
//
//   node scripts/cloud.mjs setup [--name <name>] [--include-private]
//        creates the database and the bucket, IN THE EU JURISDICTION (it can
//        only be set at creation), and records them in brain.json
//   node scripts/cloud.mjs sync [--all]
//        sends what changed since the last time (by difference: a missed
//        evening is caught up at the next one); --all rewrites everything
//   node scripts/cloud.mjs deploy
//        deploys the Worker; prints its address
//   node scripts/cloud.mjs token create <name> [--private] [--addresses]
//   node scripts/cloud.mjs token revoke <name> | list
//        a token per consumer, both rights CLOSED unless given; its value goes
//        to the clipboard (never to this output, which Claude reads)
//   node scripts/cloud.mjs verify
//        the whole door and the six tools through the real protocol, with a
//        throwaway token that lives only in this process, closed afterwards
//
// WHAT GOES TO THE CLOUD: the notes (their text), the links, the directory,
// the vectors. The TEXT of private notes only if the person chose it
// (--include-private at setup): otherwise a private note exists there by its
// title only, as on the computer for an AI. vault/danger-zone never.
// Long texts are cut in parts of 20,000 characters (D1 refuses a statement
// over 100 KB); the full-text search covers the first part.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, config, hypervibeVault, loadEnv, requireBrain, requireRunner, slugify } from "./lib.mjs";
import { buildIndex, openDb } from "./build.mjs";
import { readDirectory } from "./directory.mjs";

requireBrain();
const args = process.argv.slice(2);
const [command, sub, subArg] = args;
const out = (o) => console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const CFG_FILE = join(ROOT, "brain.json");
const cfg = config();
const cloud = cfg.cloud ?? {};
const TMP = join(HOME, ".hypervibe-brain", "cloud-work");
mkdirSync(TMP, { recursive: true });
const PART = 20_000;

// THE PERSON'S CLOUDFLARE ACCESS. Their `wrangler login` by default. A
// person who keeps a Cloudflare token in the Hypervibe vault (item CLOUDFLARE,
// field api_token) and has no login: wrangler gets the token in its
// environment, never on its command line, with the account it opens (a token
// may see several accounts, and wrangler then asks which one).
if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.HVBRAIN_WRANGLER) {
  const token = hypervibeVault("CLOUDFLARE", "api_token");
  if (token) {
    process.env.CLOUDFLARE_API_TOKEN = token;
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
      try {
        const res = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
        const id = (await res.json()).result?.[0]?.id;
        if (id) process.env.CLOUDFLARE_ACCOUNT_ID = id;
      } catch {
        // wrangler will say what it lacks
      }
    }
  }
}

// ---------------------------------------------------------------- wrangler
/**
 * Runs wrangler without a shell (paths with spaces stay whole): the script of
 * HVBRAIN_WRANGLER (the test bench's fake), else the wrangler installed
 * globally, else npx.
 */
function wranglerCmd() {
  if (process.env.HVBRAIN_WRANGLER) return [process.execPath, [process.env.HVBRAIN_WRANGLER]];
  for (const root of ["pnpm", "npm"].map((pm) => spawnSync(pm, ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32", windowsHide: true }).stdout?.trim()).filter(Boolean)) {
    const js = join(root, "wrangler", "bin", "wrangler.js");
    if (existsSync(js)) return [process.execPath, [js]];
  }
  return [process.platform === "win32" ? "npx.cmd" : "npx", ["--yes", "wrangler"]];
}
const WR = wranglerCmd();
function wrangler(a, { input, cwd, timeout = 300_000 } = {}) {
  // Through npx.cmd a shell is unavoidable: an argument with spaces (a query) is quoted whole.
  const shell = WR[0].endsWith(".cmd");
  const argv = shell ? a.map((x) => (/[\s"&|<>^()]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)) : a;
  const r = spawnSync(WR[0], [...WR[1], ...argv], { cwd: cwd ?? TMP, input, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 256 * 1024 * 1024, shell });
  return { ok: r.status === 0, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") + (r.error ? ` ${r.error.message}` : "") };
}
// The line that says what went wrong: an error first, never a warning (a file
// import always warns that the database pauses meanwhile), colours removed.
const firstLine = (s) => {
  const lines = String(s).replace(/\u001b\[[0-9;]*m/g, "").split("\n").map((l) => l.trim()).filter((l) => l && !/^[⛅▲✘─ ]*$/.test(l));
  return (lines.find((l) => /error/i.test(l)) ?? lines.find((l) => !/warning/i.test(l)) ?? lines[0] ?? "").slice(0, 300);
};

/**
 * Runs SQL on the remote database. Writes go from a file (no quoting, no size
 * trap); a read goes as a command, because an import from a file only ever
 * answers with statistics, never with the rows (checked on real D1).
 */
function d1(sql, { read = false } = {}) {
  let r;
  if (read) r = wrangler(["d1", "execute", cloud.database, "--remote", "--command", sql.trim(), "--json"]);
  else {
    const f = join(TMP, `q-${process.pid}-${Date.now()}.sql`);
    writeFileSync(f, sql, "utf8");
    r = wrangler(["d1", "execute", cloud.database, "--remote", "--file", f, "--yes"]);
  }
  if (!r.ok) throw new Error(`D1 refused: ${firstLine(`${r.err}\n${r.out}`)}`);
  if (!read) return null;
  const parsed = JSON.parse(r.out.slice(r.out.indexOf("[")));
  return parsed.flatMap((x) => x.results ?? []);
}

const writeCloud = (patch) => {
  const raw = JSON.parse(readFileSync(CFG_FILE, "utf8"));
  raw.cloud = { ...(raw.cloud ?? {}), ...patch };
  writeFileSync(CFG_FILE, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return raw.cloud;
};

const SCHEMA = [
  ...["note", "private_note"].flatMap((t) => [
    `CREATE TABLE IF NOT EXISTS ${t} (slug TEXT PRIMARY KEY, hash TEXT NOT NULL, type TEXT, title TEXT, domains TEXT, status TEXT, visibility TEXT, created TEXT, updated TEXT, source TEXT, body TEXT)`,
    `CREATE TABLE IF NOT EXISTS ${t}_more (slug TEXT NOT NULL, n INTEGER NOT NULL, part TEXT, PRIMARY KEY (slug, n))`,
  ]),
  "CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(slug UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2')",
  "CREATE VIRTUAL TABLE IF NOT EXISTS private_fts USING fts5(slug UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2')",
  "CREATE TABLE IF NOT EXISTS link (src TEXT NOT NULL, dst TEXT NOT NULL, PRIMARY KEY (src, dst))",
  "CREATE INDEX IF NOT EXISTS link_dst ON link(dst)",
  "CREATE TABLE IF NOT EXISTS contact (address TEXT PRIMARY KEY, hash TEXT NOT NULL, data TEXT)",
  "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)",
].map((s) => `${s};`).join("\n");

// SQL literals: a quote doubled, and nothing that could end the statement.
const lit = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/\u0000/g, "").replace(/'/g, "''")}'`);
const hashOf = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 32);

// -------------------------------------------------------------------- setup
if (command === "setup") {
  requireRunner(cfg);
  const name = args.includes("--name") ? slugify(args[args.indexOf("--name") + 1]) : `brain-${slugify(cfg.name ?? "brain")}`;
  const created = {};
  if (!cloud.database) {
    const r = wrangler(["d1", "create", name, "--jurisdiction", "eu"]);
    const id = /"?database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/.exec(r.out)?.[1];
    if (!r.ok || !id) fail(`the database could not be created: ${firstLine(r.err || r.out)} (is wrangler logged in? npx wrangler login)`);
    created.database = name;
    created.databaseId = id;
  }
  if (!cloud.bucket) {
    const r = wrangler(["r2", "bucket", "create", name, "--jurisdiction", "eu"]);
    if (!r.ok && !/already exists/i.test(r.err + r.out)) fail(`the bucket could not be created: ${firstLine(r.err || r.out)}`);
    created.bucket = name;
  }
  const c = writeCloud({ ...created, worker: cloud.worker ?? name, includePrivate: args.includes("--include-private") || cloud.includePrivate === true, jurisdiction: "eu" });
  Object.assign(cloud, c);
  d1(SCHEMA);
  out({ ok: true, cloud: c });
} else if (command === "sync") {
  requireRunner(cfg);
  if (!cloud.database) fail("no cloud copy yet: cloud.mjs setup first");
  const r = await buildIndex({ quiet: true, ifStale: true });
  if (!r.ok) fail(`the index could not be rebuilt: ${r.errors[0]?.rel}: ${r.errors[0]?.msg}`);
  const db = openDb({ readonly: true });
  const ALL = args.includes("--all");
  const stmts = [];
  const res = { notes: 0, removed: 0, links: 0, contacts: 0, matrix: false };

  // The notes, by difference on their print.
  const local = new Map();
  for (const f of db.prepare("SELECT * FROM fiche").all()) {
    const priv = f.visibility === "private";
    const body = priv && !cloud.includePrivate ? "" : f.body;
    const rowData = { type: f.type, title: f.title, domains: f.domains, status: f.status, visibility: f.visibility, created: f.created, updated: f.updated, source: f.source, body };
    local.set(f.slug, { table: priv ? "private_note" : "note", priv, hash: hashOf(rowData), ...rowData });
  }
  const remote = new Map((ALL ? [] : d1("SELECT slug, hash, 'note' t FROM note UNION ALL SELECT slug, hash, 'private_note' t FROM private_note;", { read: true })).map((x) => [x.slug, x]));
  for (const [slug, x] of remote) {
    const l = local.get(slug);
    if (!l || l.table !== x.t) {
      stmts.push(`DELETE FROM ${x.t} WHERE slug = ${lit(slug)};`, `DELETE FROM ${x.t}_more WHERE slug = ${lit(slug)};`, `DELETE FROM fts WHERE slug = ${lit(slug)};`, `DELETE FROM private_fts WHERE slug = ${lit(slug)};`);
      if (!l) res.removed++;
    }
  }
  for (const [slug, l] of local) {
    const x = remote.get(slug);
    if (x && x.t === l.table && x.hash === l.hash) continue;
    const parts = [];
    for (let i = 0; i < Math.max(1, l.body.length); i += PART) parts.push(l.body.slice(i, i + PART));
    stmts.push(
      `DELETE FROM ${l.table}_more WHERE slug = ${lit(slug)};`,
      `INSERT OR REPLACE INTO ${l.table} (slug, hash, type, title, domains, status, visibility, created, updated, source, body) VALUES (${[slug, l.hash, l.type, l.title, l.domains, l.status, l.visibility, l.created, l.updated, l.source, parts[0] ?? ""].map(lit).join(", ")});`,
      ...parts.slice(1).map((p, i) => `INSERT INTO ${l.table}_more (slug, n, part) VALUES (${lit(slug)}, ${i + 1}, ${lit(p)});`),
      `DELETE FROM fts WHERE slug = ${lit(slug)};`,
      `DELETE FROM private_fts WHERE slug = ${lit(slug)};`,
      // As on the computer: a private note is found by its title, never by its text.
      `INSERT INTO fts (slug, title, body) VALUES (${lit(slug)}, ${lit(l.title)}, ${lit(l.priv ? "" : parts[0] ?? "")});`,
      ...(l.priv && cloud.includePrivate ? [`INSERT INTO private_fts (slug, title, body) VALUES (${lit(slug)}, ${lit(l.title)}, ${lit(parts[0] ?? "")});`] : []),
    );
    res.notes++;
  }

  // The links: the whole set is small, compared as a set.
  const localLinks = new Set(db.prepare("SELECT src, dst FROM link").all().map((x) => `${x.src}\u0001${x.dst}`));
  const remoteLinks = new Set((ALL ? [] : d1("SELECT src, dst FROM link;", { read: true })).map((x) => `${x.src}\u0001${x.dst}`));
  for (const k of remoteLinks) if (!localLinks.has(k)) {
    const [s, d] = k.split("\u0001");
    stmts.push(`DELETE FROM link WHERE src = ${lit(s)} AND dst = ${lit(d)};`);
    res.links++;
  }
  for (const k of localLinks) if (!remoteLinks.has(k)) {
    const [s, d] = k.split("\u0001");
    stmts.push(`INSERT OR IGNORE INTO link (src, dst) VALUES (${lit(s)}, ${lit(d)});`);
    res.links++;
  }

  // The directory: every contact whole (its address is only served with the right).
  const dir = readDirectory(cfg);
  const remoteContacts = new Map((ALL ? [] : d1("SELECT address, hash FROM contact;", { read: true })).map((x) => [x.address, x.hash]));
  const localContacts = new Map(dir.contacts.map((c) => [String(c.address).toLowerCase(), c]));
  for (const a of remoteContacts.keys()) if (!localContacts.has(a)) stmts.push(`DELETE FROM contact WHERE address = ${lit(a)};`);
  for (const [a, c] of localContacts) {
    const h = hashOf(c);
    if (remoteContacts.get(a) === h) continue;
    stmts.push(`INSERT OR REPLACE INTO contact (address, hash, data) VALUES (${lit(a)}, ${lit(h)}, ${lit(JSON.stringify(c))});`);
    res.contacts++;
  }

  // What the Worker needs to speak like the computer.
  const metaRows = { name: cfg.name ?? "", format: cfg.format, types: JSON.stringify(cfg.types), domains: JSON.stringify(cfg.domains), generated: new Date().toISOString() };
  stmts.push(...Object.entries(metaRows).map(([k, v]) => `INSERT OR REPLACE INTO meta (k, v) VALUES (${lit(k)}, ${lit(v)});`));

  // The vectors: one binary matrix and its list, sent only when they changed.
  const vec = db.prepare("SELECT slug, vec FROM vec ORDER BY slug").all();
  if (vec.length) {
    const dims = Buffer.from(vec[0].vec).byteLength / 4;
    const bin = Buffer.concat(vec.map((v) => Buffer.from(v.vec)));
    const md5 = createHash("md5").update(bin).digest("hex");
    const known = ALL ? null : d1("SELECT v FROM meta WHERE k = 'matrix_md5';", { read: true })[0]?.v;
    if (known !== md5) {
      const norms = vec.map((v) => {
        const b = Buffer.from(v.vec);
        const f = new Float32Array(b.buffer, b.byteOffset, b.byteLength / 4);
        let n = 0;
        for (const x of f) n += x * x;
        return Math.sqrt(n) || 1;
      });
      writeFileSync(join(TMP, "matrix.f32"), bin);
      writeFileSync(join(TMP, "matrix.json"), JSON.stringify({ model: cfg.embeddings.model, dims, slugs: vec.map((v) => v.slug), norms, md5 }));
      // The binary first, its list after: a Worker never reads a list whose matrix is not there yet.
      for (const f of ["matrix.f32", "matrix.json"]) {
        const u = wrangler(["r2", "object", "put", `${cloud.bucket}/${f}`, "--file", join(TMP, f), "--remote", "--jurisdiction", "eu"]);
        if (!u.ok) fail(`the vectors could not be sent: ${firstLine(u.err || u.out)}`);
      }
      stmts.push(`INSERT OR REPLACE INTO meta (k, v) VALUES ('matrix_md5', ${lit(md5)});`);
      res.matrix = true;
    }
  }
  db.close();
  if (ALL) d1(`${SCHEMA}\nDELETE FROM note; DELETE FROM note_more; DELETE FROM private_note; DELETE FROM private_note_more; DELETE FROM fts; DELETE FROM private_fts; DELETE FROM link; DELETE FROM contact;`);
  // Written in files of a few thousand statements: a large first copy goes in pieces.
  for (let i = 0; i < stmts.length; i += 2000) d1(stmts.slice(i, i + 2000).join("\n"));
  writeCloud({ lastSync: new Date().toISOString() });
  out({ ok: true, ...res, statements: stmts.length });
} else if (command === "deploy") {
  requireRunner(cfg);
  if (!cloud.databaseId || !cloud.bucket) fail("no cloud copy yet: cloud.mjs setup first");
  // The Worker and the very files the computer runs, side by side.
  const build = join(HOME, ".hypervibe-brain", "cloud", cloud.worker);
  mkdirSync(build, { recursive: true });
  cpSync(join(PLUGIN_ROOT, "templates", "cloud", "worker.js"), join(build, "worker.js"));
  cpSync(join(PLUGIN_ROOT, "scripts", "pure.mjs"), join(build, "pure.mjs"));
  cpSync(join(PLUGIN_ROOT, "scripts", "tools.mjs"), join(build, "tools.mjs"));
  writeFileSync(join(build, "package.json"), `${JSON.stringify({ type: "module", private: true })}\n`, "utf8");
  writeFileSync(join(build, "wrangler.toml"), [
    `name = "${cloud.worker}"`,
    'main = "worker.js"',
    'compatibility_date = "2026-09-01"',
    ...(cloud.accountId ? [`account_id = "${cloud.accountId}"`] : []),
    "",
    "[[d1_databases]]",
    'binding = "DB"',
    `database_name = "${cloud.database}"`,
    `database_id = "${cloud.databaseId}"`,
    "",
    "# The EU jurisdiction is a separate namespace: without this line the Worker",
    "# would read a bucket of the same name elsewhere, empty, without an error.",
    "[[r2_buckets]]",
    'binding = "BRAIN"',
    `bucket_name = "${cloud.bucket}"`,
    'jurisdiction = "eu"',
    "",
  ].join("\n"), "utf8");
  const d = wrangler(["deploy"], { cwd: build });
  const url = /https:\/\/[^\s]+\.workers\.dev/.exec(d.out + d.err)?.[0];
  if (!d.ok || !url) fail(`the Worker could not be deployed: ${firstLine(d.err || d.out)}`);
  // Its key for search by meaning: the brain's own, from its .env, never displayed.
  loadEnv();
  const key = process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY;
  if (key) wrangler(["secret", "put", "OPENAI_API_KEY"], { cwd: build, input: key });
  pushTokens(build);
  writeCloud({ url: `${url}/mcp` });
  out({ ok: true, url: `${url}/mcp`, meaning: Boolean(key), tokens: readTokens().length });
} else if (command === "token") {
  if (sub === "list") out({ ok: true, tokens: readTokens().map(({ hash, ...t }) => t) });
  else if (sub === "create") {
    if (!subArg || !/^[a-z0-9][a-z0-9-]*$/i.test(subArg)) fail("token create <name>: a name for the consumer (letters, digits, dashes)");
    const tokens = readTokens();
    if (tokens.some((t) => t.name === subArg)) fail(`a token named ${subArg} exists: revoke it first`);
    const value = `hb_${randomBytes(32).toString("base64url")}`;
    tokens.push({ name: subArg, hash: createHash("sha256").update(value).digest("hex"), private: args.includes("--private"), addresses: args.includes("--addresses"), created: new Date().toISOString().slice(0, 10) });
    writeTokens(tokens);
    const where = handOver(value, subArg);
    const pushed = cloud.url ? pushTokens(join(HOME, ".hypervibe-brain", "cloud", cloud.worker)) : false;
    // The value never appears here: this output is read by Claude.
    out({ ok: true, name: subArg, private: args.includes("--private"), addresses: args.includes("--addresses"), value: where, active: pushed });
  } else if (sub === "revoke") {
    const tokens = readTokens().filter((t) => t.name !== subArg);
    writeTokens(tokens);
    const pushed = cloud.url ? pushTokens(join(HOME, ".hypervibe-brain", "cloud", cloud.worker)) : false;
    out({ ok: true, revoked: subArg, active: pushed });
  } else fail("token create <name> [--private] [--addresses] | revoke <name> | list");
} else if (command === "verify") {
  await verify();
} else {
  console.log("usage: cloud.mjs setup | sync | deploy | token | verify (see the top of scripts/cloud.mjs)");
  process.exitCode = 2;
}

// ------------------------------------------------------------------ tokens
// The prints only, in the brain (cloud/tokens.json: who was given access to
// what, versioned); the values, never.
function readTokens() {
  try {
    return JSON.parse(readFileSync(join(ROOT, "cloud", "tokens.json"), "utf8"));
  } catch {
    return [];
  }
}
function writeTokens(t) {
  mkdirSync(join(ROOT, "cloud"), { recursive: true });
  writeFileSync(join(ROOT, "cloud", "tokens.json"), `${JSON.stringify(t, null, 2)}\n`, "utf8");
}
function pushTokens(build, extra = []) {
  const list = [...readTokens(), ...extra].map(({ name, hash, private: p, addresses }) => ({ name, hash, private: p, addresses }));
  return wrangler(["secret", "put", "TOKENS"], { cwd: build, input: JSON.stringify(list) }).ok;
}
/** The value goes to the clipboard, or to a file the person opens and deletes. */
function handOver(value, name) {
  const clip = process.platform === "win32" ? ["clip", []] : process.platform === "darwin" ? ["pbcopy", []] : ["xclip", ["-selection", "clipboard"]];
  if (!process.env.HVBRAIN_NO_CLIPBOARD) {
    const r = spawnSync(clip[0], clip[1], { input: value, windowsHide: true });
    if (r.status === 0) return "in the clipboard: paste it now into the agent's settings, then copy something else";
  }
  const f = join(HOME, ".hypervibe-brain", `token-${name}.txt`);
  writeFileSync(f, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return `in ${f.replace(/\\/g, "/")}: open it, paste the value into the agent's settings, then delete the file`;
}

// ------------------------------------------------------------------ verify
async function verify() {
  if (!cloud.url) fail("not deployed yet: cloud.mjs deploy first");
  const build = join(HOME, ".hypervibe-brain", "cloud", cloud.worker);
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: Boolean(ok), ...(ok ? {} : { detail: String(detail).slice(0, 300) }) });
  const ask = async (token, method, params = {}) => {
    const r = await fetch(cloud.url, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  };
  // Right after a deployment, or a change of tokens, the new version takes a
  // few seconds to reach every Cloudflare server: until then an answer can be
  // a 500 or come from the version before (seen on the real account). Each
  // check waits for the server to settle, up to a minute and a half.
  const settle = async (get, ok) => {
    let last;
    for (const end = Date.now() + 90_000; Date.now() < end; await new Promise((r) => setTimeout(r, 3000))) {
      last = await get().catch((e) => ({ status: 0, body: null, error: e.message }));
      if (ok(last)) break;
    }
    return last;
  };
  const door = await settle(() => ask(null, "tools/list"), (r) => r.status === 401);
  check("without a token, the door is closed", door.status === 401, JSON.stringify(door));
  check("with a false token too", (await ask("hb_false", "tools/list")).status === 401);
  // A throwaway token that lives only in this process.
  const value = `hb_${randomBytes(32).toString("base64url")}`;
  const temp = { name: "verify-throwaway", hash: createHash("sha256").update(value).digest("hex"), private: false, addresses: false };
  pushTokens(build, [temp]);
  try {
    const init = await settle(() => ask(value, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "1" } }), (r) => r.status === 200);
    check("with a token, the handshake answers", init.status === 200 && init.body?.result?.serverInfo?.name === "hypervibe-brain-cloud", JSON.stringify(init));
    const list = await ask(value, "tools/list");
    check("six tools", list.body?.result?.tools?.length === 6, JSON.stringify(list.body).slice(0, 200));
    const stats = JSON.parse((await ask(value, "tools/call", { name: "brain_stats", arguments: {} })).body?.result?.content?.[0]?.text ?? "{}");
    const db = openDb({ readonly: true });
    const localCount = db.prepare("SELECT COUNT(*) n FROM fiche").get().n;
    const privateOne = db.prepare("SELECT slug FROM fiche WHERE visibility = 'private' LIMIT 1").get()?.slug;
    const aWord = db.prepare("SELECT title FROM fiche WHERE visibility != 'private' ORDER BY length(body) DESC LIMIT 1").get()?.title?.split(/\s+/).find((w) => w.length > 4);
    db.close();
    check("the cloud copy has as many notes as the computer", stats.notes === localCount, `${stats.notes} vs ${localCount}`);
    if (aWord) {
      const s = JSON.parse((await ask(value, "tools/call", { name: "brain_search", arguments: { query: aWord } })).body?.result?.content?.[0]?.text ?? "[]");
      check(`a search answers ("${aWord}")`, Array.isArray(s) && s.length > 0, JSON.stringify(s).slice(0, 200));
    }
    if (privateOne) {
      const g = JSON.parse((await ask(value, "tools/call", { name: "brain_get", arguments: { slug: privateOne } })).body?.result?.content?.[0]?.text ?? "{}");
      check("a private note's content does not leave without the right", String(g.body).includes("never shown"), g.body);
    }
    const c = JSON.parse((await ask(value, "tools/call", { name: "brain_contact", arguments: { query: "a" } })).body?.result?.content?.[0]?.text ?? "{}");
    check("addresses do not leave without the right", !c.found || c.found.every((x) => !("address" in x)), JSON.stringify(c).slice(0, 200));
  } finally {
    pushTokens(build);
  }
  const gone = await settle(() => ask(value, "tools/list"), (r) => r.status === 401);
  check("the throwaway token no longer enters", gone.status === 401, JSON.stringify(gone));
  const failed = checks.filter((x) => !x.ok);
  out({ ok: !failed.length, url: cloud.url, checks: checks.length, failed });
  process.exitCode = failed.length ? 1 : 0;
}
