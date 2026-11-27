#!/usr/bin/env node
// cloud.mjs - The brain's copy on Cloudflare, for online agents: a D1 database
// and an R2 bucket in the EU jurisdiction, and a Worker that serves the six
// tools (every tool of the brain but brain_fetch, which reads data where it
// lives) behind a token door (templates/cloud/worker.js). Everything goes
// through `wrangler`, with the person's own login (`wrangler login`): the
// plugin keeps no Cloudflare key.
//
//   node scripts/cloud.mjs setup [--name <name>] [--include-private] [--include-skills]
//        creates the database and the bucket, IN THE EU JURISDICTION (it can
//        only be set at creation), and records them in brain.json
//   node scripts/cloud.mjs skills [on | off]
//        whether the skills of the executive floor go to the cloud (off by
//        default); written in brain.json, applied by the next sync. Without
//        on or off: what is chosen, and what would go
//   node scripts/cloud.mjs sync [--all]
//        sends what changed since the last time (by difference: a missed
//        evening is caught up at the next one); --all rewrites everything
//   node scripts/cloud.mjs empty | resume
//        empties the copy (every table, the vectors) and stops the evening
//        sync; resume lets it start again
//   node scripts/cloud.mjs deploy
//        deploys the Worker; prints its address. To run again after each
//        update of the plugin: the server is a copy of the plugin's code,
//        and a correction only reaches it there (sync says when it is behind)
//   node scripts/cloud.mjs state
//        what is set up, chosen and deployed; reads only this computer
//   node scripts/cloud.mjs token create <name> [--private] [--addresses] [--skills]
//   node scripts/cloud.mjs token revoke <name> | list
//        a token per consumer, its three rights CLOSED unless given; its value
//        goes to the clipboard (never to this output, which Claude reads)
//   node scripts/cloud.mjs verify
//        the whole door, the six tools and the skills through the real protocol, with
//        throwaway tokens that live only in this process, closed afterwards
//
// WHAT GOES TO THE CLOUD: the notes (their text), the links, the directory
// and the vectors. That is the rule of what leaves this computer: on the
// computer itself, the AI reads a private note whole (engine.mjs, 2026-11-21).
// vault/danger-zone never.
//
// A PRIVATE NOTE, unless the person chose to copy private notes
// (--include-private at setup), exists there by its title, its type, its
// domains and its dates, and by nothing drawn from its text (2026-11-27):
// not its text, not its source, not the links it makes, not its vector (a
// vector is the text in another form: its neighbours would say what the note
// is about).
//
// THE SKILLS of the executive floor (their text, what their folder holds by
// name only, the rules of the guards; 2026-11-23) go ONLY IF THE PERSON CHOSE
// IT (2026-11-27: --include-skills at setup, or `skills on`), and each one is
// read for secrets first (secret-scan.mjs): a skill that seems to hold a key,
// a password or a server's account is NOT sent, the sync goes on and says
// which skill and which line. A skill whose head says `cloud: false` never
// goes. A token reads them only with its own right (--skills).
//
// WHAT STAYS ON THE DISK: nothing. The files written to be sent (SQL, the
// matrix of vectors) are removed once sent, and the working folder is emptied
// at the start of each sync (2026-11-27).
//
// Long texts are cut in parts of 20,000 characters (D1 refuses a statement
// over 100 KB); the full-text search covers the first part.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, config, hypervibeVault, loadEnv, requireBrain, requireRunner, slugify } from "./lib.mjs";
import { buildIndex, openDb } from "./build.mjs";
import { readWeights } from "./weights.mjs";
import { readDirectory } from "./directory.mjs";
import { guardRules, listSkills, skillBody, skillFiles } from "./skills-mcp.mjs";
import { sayFindings, scanSecrets } from "./secret-scan.mjs";
import { NPX_PACKAGE, fetchWrangler, wranglerPlan } from "./cloud-wrangler.mjs";

requireBrain();
const args = process.argv.slice(2);
const [command, sub, subArg] = args;
const out = (o) => console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
const fail = (error, more = {}) => {
  out({ ok: false, error, ...more });
  process.exit(1);
};
const CFG_FILE = join(ROOT, "brain.json");
const cfg = config();
const cloud = cfg.cloud ?? {};
const TMP = join(HOME, ".hypervibe-brain", "cloud-work");
mkdirSync(TMP, { recursive: true });
const PART = 20_000;
/** Empties the working folder: what an interrupted run left there is notes in clear. */
function emptyWork() {
  for (const e of readdirSync(TMP)) rmSync(join(TMP, e), { recursive: true, force: true });
}

// THE PERSON'S CLOUDFLARE ACCESS. Their `wrangler login` by default. A
// person who keeps a Cloudflare token in the Hypervibe vault (item CLOUDFLARE,
// field api_token) and has no login: wrangler gets the token in its
// environment, never on its command line, with the account it opens (a token
// may see several accounts, and wrangler then asks which one).
// It is kept in CF_ENV, given to wrangler alone (2026-11-27): never in this
// process's own environment, which every other program it starts inherits.
const CF_ENV = {};
if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.HVBRAIN_WRANGLER) {
  const token = hypervibeVault("CLOUDFLARE", "api_token");
  if (token) {
    CF_ENV.CLOUDFLARE_API_TOKEN = token;
    if (!process.env.CLOUDFLARE_ACCOUNT_ID) {
      try {
        const res = await fetch("https://api.cloudflare.com/client/v4/accounts", { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
        const id = (await res.json()).result?.[0]?.id;
        if (id) CF_ENV.CLOUDFLARE_ACCOUNT_ID = id;
      } catch {
        // wrangler will say what it lacks
      }
    }
  }
}

// ---------------------------------------------------------------- wrangler
// Runs wrangler without a shell (paths with spaces stay whole): the script of
// HVBRAIN_WRANGLER (the test bench's fake), else the wrangler installed
// globally, else npx, with a precise major version and a download that never
// sees the Cloudflare token (cloud-wrangler.mjs).
const PLAN = wranglerPlan();
const WR = [PLAN.cmd, PLAN.pre];
let fetched = false;
// A passing fault on Cloudflare's side (a 502 one evening, after eight good
// ones): worth trying again a little later rather than failing the night.
const PASSING = /\b50[234]\b|Bad Gateway|Service Unavailable|Gateway Time-?out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|fetch failed/i;
// Only what can be played twice without harm is tried again: an upload
// replaces the same object, and every batch of SQL deletes before it inserts.
// A creation or a deployment is never repeated in the dark.
const REPEATABLE = (a) => (a[0] === "r2" && a[1] === "object") || (a[0] === "d1" && a[1] === "execute");
const WAITS = String(process.env.HVBRAIN_RETRY_WAITS ?? "5000,20000").split(",").map(Number).filter((n) => n >= 0);
function wrangler(a, { input, cwd, timeout = 300_000 } = {}) {
  // Through npx, the download first, on its own, without the token: the
  // commands below run with `npx --no`, which never downloads.
  if (!fetched) {
    fetched = true;
    if (PLAN.npx && !fetchWrangler(PLAN)) return { ok: false, out: "", err: `error: wrangler could not be downloaded (npx ${PLAN.fetch.join(" ")}): install it once with "npm install -g wrangler", or check the connection` };
  }
  // Through npx.cmd a shell is unavoidable: an argument with spaces (a query) is quoted whole.
  const shell = WR[0].endsWith(".cmd");
  const argv = shell ? a.map((x) => (/[\s"&|<>^()]/.test(x) ? `"${x.replace(/"/g, '\\"')}"` : x)) : a;
  // The token of the vault goes to wrangler alone. Through npx, the person's
  // own CLOUDFLARE_* variables are passed again here, to this run that does
  // not download; the download above never had them.
  const env = { ...process.env, ...CF_ENV };
  const once = () => {
    const r = spawnSync(WR[0], [...WR[1], ...argv], { cwd: cwd ?? TMP, input, env, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 256 * 1024 * 1024, shell });
    return { ok: r.status === 0, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") + (r.error ? ` ${r.error.message}` : "") };
  };
  let r = once();
  for (const wait of REPEATABLE(a) ? WAITS : []) {
    if (r.ok || !PASSING.test(`${r.err}\n${r.out}`)) break;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, wait);
    r = once();
  }
  return r;
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
    // The file holds notes in clear: it does not outlive its sending (2026-11-27).
    const f = join(TMP, `q-${process.pid}-${Date.now()}-${randomBytes(4).toString("hex")}.sql`);
    try {
      writeFileSync(f, sql, { encoding: "utf8", mode: 0o600 });
      r = wrangler(["d1", "execute", cloud.database, "--remote", "--file", f, "--yes"]);
    } finally {
      rmSync(f, { force: true });
    }
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

/**
 * The folder wrangler works from for this Worker: the Worker and the very
 * files the computer runs, side by side, and its settings. Written again at
 * each use, so that a secret (the tokens) can be sent from a computer that
 * never deployed. Null before `setup`.
 */
function buildDir() {
  if (!cloud.databaseId || !cloud.bucket || !cloud.worker) return null;
  const build = join(HOME, ".hypervibe-brain", "cloud", cloud.worker);
  mkdirSync(build, { recursive: true });
  cpSync(join(PLUGIN_ROOT, "templates", "cloud", "worker.js"), join(build, "worker.js"));
  cpSync(join(PLUGIN_ROOT, "scripts", "pure.mjs"), join(build, "pure.mjs"));
  cpSync(join(PLUGIN_ROOT, "scripts", "tools.mjs"), join(build, "tools.mjs"));
  cpSync(join(PLUGIN_ROOT, "scripts", "skills-text.mjs"), join(build, "skills-text.mjs"));
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
  return build;
}

const WORKER_FILES = [["templates", "cloud", "worker.js"], ["scripts", "pure.mjs"], ["scripts", "tools.mjs"], ["scripts", "skills-text.mjs"]];
/**
 * The print of the code the Worker is made of, as this version of the plugin
 * has it. Kept at each deployment (2026-11-27): the server is a COPY of that
 * code, and an update of the plugin does not reach it by itself. A sync that
 * finds another print says the server is behind, and how to bring it up.
 */
const workerPrint = () => {
  const h = createHash("sha256");
  for (const f of WORKER_FILES) h.update(readFileSync(join(PLUGIN_ROOT, ...f), "utf8").replace(/\r\n/g, "\n"));
  return h.digest("hex").slice(0, 16);
};
const BEHIND = "the server still runs the code of an earlier version of this plugin: its corrections are not live there. Run cloud.mjs deploy (it changes no key and no data)";

// The skills of the executive floor (2026-11-23), served by the Worker to an
// online AI as on the computer (skills-text.mjs). A table of its own, created
// at the first sync that meets a copy made before it.
const SKILL_TABLE = "CREATE TABLE IF NOT EXISTS skill (name TEXT PRIMARY KEY, hash TEXT NOT NULL, description TEXT, folder TEXT, body TEXT, files TEXT)";
// D1 refuses a statement over 100 KB: a skill longer than this is cut, and says so.
const SKILL_MAX = 90_000;

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
  SKILL_TABLE,
].map((s) => `${s};`).join("\n");

// SQL literals: a quote doubled, and nothing that could end the statement.
const lit = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/\u0000/g, "").replace(/'/g, "''")}'`);
const hashOf = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 32);

// ------------------------------------------------------------- the skills
/**
 * WHICH SKILLS GO TO THE CLOUD (2026-11-27). None unless the person chose it
 * (`cloud.skills` in brain.json). Then each skill but those whose head says
 * `cloud: false`, and but those in which secret-scan.mjs finds what looks
 * like a secret: those are held back, named with the lines, never sent. The
 * rules of the guards go the same way: a rule that seems to hold a secret
 * stays here. A skill the person switched off (executive.mjs switch) is not
 * among the skills at all (skills-mcp.mjs, listSkills): it is not sent, and
 * the sync that follows removes it from the copy.
 * @returns {{ on: boolean, send: Map<string, { description: string, folder: string, body: string, files: string, hash: string }>, held: { skill: string, file: string, found: { line: number, kind: string }[] }[], kept: string[], rules: string[], rulesHeld: string[] }}
 */
function cloudSkills({ preview = false } = {}) {
  const send = new Map();
  const held = [];
  const kept = [];
  const rules = [];
  const rulesHeld = [];
  const on = cloud.skills === true;
  if (!on && !preview) return { on, send, held, kept, rules, rulesHeld };
  for (const sk of listSkills(ROOT)) {
    if (sk.cloud === false) {
      kept.push(sk.name);
      continue;
    }
    const files = skillFiles(sk.dir);
    // The whole file is read (its head too), so that a line said here is the line of the file.
    const found = [...scanSecrets(readFileSync(join(sk.dir, "SKILL.md"), "utf8")), ...scanSecrets(files.join("\n")).map((f) => ({ line: 0, kind: `${f.kind}, in the name of a file of its folder` }))];
    if (found.length) {
      held.push({ skill: sk.name, file: `executive/skills/${sk.folder}/SKILL.md`, found });
      continue;
    }
    let body = skillBody(sk.dir);
    if (body.length > SKILL_MAX) body = `${body.slice(0, SKILL_MAX)}

(The rest of this skill is only on the person's computer: it was too long for the cloud copy.)`;
    const row = { description: sk.description, folder: sk.folder, body, files: JSON.stringify(files) };
    send.set(sk.name, { ...row, hash: hashOf(row) });
  }
  for (const r of guardRules(ROOT)) {
    if (scanSecrets(r.rule).length) rulesHeld.push(r.file);
    else rules.push(r.rule);
  }
  return { on, send, held, kept, rules, rulesHeld };
}
/** What was held back, in one sentence for the person (lines and kinds, never a value). */
const sayHeld = (s) =>
  [
    ...s.held.map((h) => `the skill "${h.skill}" was NOT sent, it seems to hold a secret (${h.file}, ${sayFindings(h.found.filter((f) => f.line))}${h.found.some((f) => !f.line) ? "; and in the name of a file of its folder" : ""}): remove it from the skill (a key belongs in a vault or a settings file), or keep the skill here with "cloud: false" in its head`),
    ...s.rulesHeld.map((g) => `the rule of the guard ${g} was NOT sent, its first comment seems to hold a secret`),
  ].join(" ; ");

// -------------------------------------------------------------------- setup
if (command === "setup") {
  requireRunner(cfg);
  const name = args.includes("--name") ? slugify(args[args.indexOf("--name") + 1]) : `brain-${slugify(cfg.name ?? "brain")}`;
  const created = {};
  if (!cloud.database) {
    const r = wrangler(["d1", "create", name, "--jurisdiction", "eu"]);
    const id = /"?database_id"?\s*[=:]\s*"([0-9a-f-]{36})"/.exec(r.out)?.[1];
    if (!r.ok || !id) fail(`the database could not be created: ${firstLine(r.err || r.out)} (is wrangler logged in? npx ${NPX_PACKAGE} login)`);
    created.database = name;
    created.databaseId = id;
  }
  if (!cloud.bucket) {
    const r = wrangler(["r2", "bucket", "create", name, "--jurisdiction", "eu"]);
    if (!r.ok && !/already exists/i.test(r.err + r.out)) fail(`the bucket could not be created: ${firstLine(r.err || r.out)}`);
    created.bucket = name;
  }
  // Both choices are closed unless asked: the text of private notes, and the skills.
  const c = writeCloud({ ...created, worker: cloud.worker ?? name, includePrivate: args.includes("--include-private") || cloud.includePrivate === true, skills: args.includes("--include-skills") || cloud.skills === true, jurisdiction: "eu" });
  Object.assign(cloud, c);
  d1(SCHEMA);
  out({ ok: true, cloud: c });
} else if (command === "state") {
  // What is set up, chosen and deployed, from this computer alone (no call
  // to Cloudflare): for the update, which brings the server in step.
  out({
    ok: true,
    set: Boolean(cloud.database),
    deployed: Boolean(cloud.url),
    ...(cloud.url ? { serverBehind: cloud.workerPrint !== workerPrint() } : {}),
    paused: cloud.paused === true,
    includePrivate: cloud.includePrivate === true,
    skills: cloud.skills === true,
    tokens: readTokens().map(({ hash, ...x }) => x),
    lastSync: cloud.lastSync ?? null,
  });
} else if (command === "skills") {
  // THE PERSON'S CHOICE (2026-11-27), closed by default. Without on or off:
  // what is chosen, and what a sync would send, hold back or keep here.
  if (!cloud.database) fail("no cloud copy yet: cloud.mjs setup first");
  if (sub === "on" || sub === "off") Object.assign(cloud, writeCloud({ skills: sub === "on" }));
  else if (sub) fail("skills on | off (or nothing, to see what is chosen)");
  const s = cloudSkills({ preview: true });
  out({
    ok: true,
    skills: cloud.skills === true,
    [cloud.skills === true ? "sends" : "wouldSend"]: [...s.send.keys()],
    heldBack: s.held.map((h) => ({ skill: h.skill, file: h.file, why: sayFindings(h.found) })),
    keptHere: s.kept,
    guardRules: s.rules.length,
    next: cloud.skills === true ? "cloud.mjs sync sends them; an agent reads them only if its token was created with --skills" : sub === "off" ? "cloud.mjs sync removes them from the cloud copy" : "cloud.mjs skills on, then sync, to send them",
  });
} else if (command === "empty" || command === "resume") {
  // EMPTY (2026-11-27): the cloud copy keeps its door and its place, and holds
  // nothing: every table emptied, the vectors removed, and no evening sync
  // until `resume`. For a copy nobody reads yet: what is not there cannot leak.
  requireRunner(cfg);
  if (!cloud.database) fail("no cloud copy yet: cloud.mjs setup first");
  if (command === "resume") {
    writeCloud({ paused: false });
    out({ ok: true, paused: false, next: "cloud.mjs sync --all sends everything again" });
  } else {
    writeCloud({ paused: true });
    emptyWork();
    d1(`${SCHEMA}
DELETE FROM note; DELETE FROM note_more; DELETE FROM private_note; DELETE FROM private_note_more; DELETE FROM fts; DELETE FROM private_fts; DELETE FROM link; DELETE FROM contact; DELETE FROM skill; DELETE FROM meta;`);
    const gone = [];
    for (const f of ["matrix.json", "matrix.f32"]) {
      const u = wrangler(["r2", "object", "delete", `${cloud.bucket}/${f}`, "--remote", "--jurisdiction", "eu"]);
      if (u.ok) gone.push(f);
    }
    const left = d1("SELECT (SELECT COUNT(*) FROM note) + (SELECT COUNT(*) FROM private_note) + (SELECT COUNT(*) FROM contact) + (SELECT COUNT(*) FROM skill) + (SELECT COUNT(*) FROM link) n;", { read: true })[0]?.n;
    out({ ok: left === 0, paused: true, rowsLeft: left, vectorsRemoved: gone });
  }
} else if (command === "sync") {
  requireRunner(cfg);
  if (!cloud.database) fail("no cloud copy yet: cloud.mjs setup first");
  if (cloud.paused === true) fail("the cloud copy is emptied and paused: cloud.mjs resume, then sync --all");
  // What a run interrupted (a crash, a computer closed) left in the working folder.
  emptyWork();
  const r = await buildIndex({ quiet: true, ifStale: true });
  if (!r.ok) fail(`the index could not be rebuilt: ${r.errors[0]?.rel}: ${r.errors[0]?.msg}`);
  const db = openDb({ readonly: true });
  const ALL = args.includes("--all");
  const stmts = [];
  const res = { notes: 0, removed: 0, links: 0, contacts: 0, matrix: false };
  // THE FULL-TEXT ROWS ARE DELETED IN BATCHES. Their slug is an unindexed
  // column (fts5), so `DELETE FROM fts WHERE slug = x` reads the whole table:
  // once per note, a large day (1,700 notes moved to the catalogue, 2026-11-05)
  // read 4.3 million rows, 85% of D1's free daily allowance. One read per
  // batch of a few hundred slugs does the same for a few thousand.
  const ftsDrop = new Set();

  // The notes, by difference on their print.
  // CLOSED: the private notes whose text stays here (the person did not choose
  // to copy them). Nothing drawn from their text leaves: no text, no source,
  // and further down none of the links they make, nor their vector.
  const closed = new Set();
  const local = new Map();
  for (const f of db.prepare("SELECT * FROM fiche").all()) {
    const priv = f.visibility === "private";
    const shut = priv && !cloud.includePrivate;
    if (shut) closed.add(f.slug);
    const rowData = { type: f.type, title: f.title, domains: f.domains, status: f.status, visibility: f.visibility, created: f.created, updated: f.updated, source: shut ? null : f.source, body: shut ? "" : f.body };
    local.set(f.slug, { table: priv ? "private_note" : "note", priv, hash: hashOf(rowData), ...rowData });
  }
  const remote = new Map((ALL ? [] : d1("SELECT slug, hash, 'note' t FROM note UNION ALL SELECT slug, hash, 'private_note' t FROM private_note;", { read: true })).map((x) => [x.slug, x]));
  for (const [slug, x] of remote) {
    const l = local.get(slug);
    if (!l || l.table !== x.t) {
      stmts.push(`DELETE FROM ${x.t} WHERE slug = ${lit(slug)};`, `DELETE FROM ${x.t}_more WHERE slug = ${lit(slug)};`);
      ftsDrop.add(slug);
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
      // As on the computer: a private note is found by its title, never by its text.
      `INSERT INTO fts (slug, title, body) VALUES (${lit(slug)}, ${lit(l.title)}, ${lit(l.priv ? "" : parts[0] ?? "")});`,
      ...(l.priv && cloud.includePrivate ? [`INSERT INTO private_fts (slug, title, body) VALUES (${lit(slug)}, ${lit(l.title)}, ${lit(parts[0] ?? "")});`] : []),
    );
    ftsDrop.add(slug);
    res.notes++;
  }

  // The links: the whole set is small, compared as a set. The links a closed
  // private note makes are read from its text: they stay here with it.
  const localLinks = new Set(db.prepare("SELECT src, dst FROM link").all().filter((x) => !closed.has(x.src)).map((x) => `${x.src}\u0001${x.dst}`));
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

  // The directory: every contact whole. Without the right to addresses, the
  // Worker neither searches nor shows an address (pure.mjs, withoutAddress).
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

  // THE SKILLS (2026-11-23): by difference on their print, as the notes.
  // Their text whole, what their folder holds by name only: the scripts stay
  // on the computer. The rules of the guards go with them, in meta. Only if
  // the person chose it, and never a skill that seems to hold a secret
  // (2026-11-27, cloudSkills above): with the choice closed, the skills a
  // copy made before still holds are removed by this very sync.
  let remoteSkills = new Map();
  if (!ALL) {
    try {
      remoteSkills = new Map(d1("SELECT name, hash FROM skill;", { read: true }).map((x) => [x.name, x.hash]));
    } catch {
      // a copy made before the skills: its table is created with this sync
      stmts.push(`${SKILL_TABLE};`);
    }
  }
  res.skills = 0;
  const chosen = cloudSkills();
  const localSkills = chosen.send;
  for (const name of remoteSkills.keys()) if (!localSkills.has(name)) {
    stmts.push(`DELETE FROM skill WHERE name = ${lit(name)};`);
    res.skills++;
  }
  for (const [name, sk] of localSkills) {
    if (remoteSkills.get(name) === sk.hash) continue;
    stmts.push(`INSERT OR REPLACE INTO skill (name, hash, description, folder, body, files) VALUES (${[name, sk.hash, sk.description, sk.folder, sk.body, sk.files].map(lit).join(", ")});`);
    res.skills++;
  }
  if (chosen.held.length || chosen.rulesHeld.length) {
    res.skillsHeld = chosen.held.map((h) => ({ skill: h.skill, file: h.file, lines: h.found.map((f) => ({ line: f.line, kind: f.kind })) }));
    res.warning = sayHeld(chosen);
  }
  if (chosen.kept.length) res.skillsKeptHere = chosen.kept;

  // What the Worker needs to speak like the computer.
  // The notes hidden from search (search.hidden in brain.json), by slug: the
  // cloud tables do not keep a note's folder, the Worker filters by this list.
  const hiddenPrefixes = (cfg.search?.hidden ?? []).map((p) => String(p).replace(/\\/g, "/").replace(/^\/+/, ""));
  const hidden = hiddenPrefixes.length
    ? db.prepare("SELECT slug, rel FROM fiche").all().filter((x) => hiddenPrefixes.some((p) => String(x.rel ?? "").replace(/\\/g, "/").replace(/^vault\//, "").startsWith(p))).map((x) => x.slug).sort()
    : [];
  // The weights (weights.mjs) go with the rest: the cloud ranks as the computer does.
  const weights = Object.fromEntries([...readWeights(db)].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  const metaRows = { weights: JSON.stringify(weights), name: cfg.name ?? "", format: cfg.format, types: JSON.stringify(cfg.types), domains: JSON.stringify(cfg.domains), hidden: JSON.stringify(hidden), guard_rules: JSON.stringify(chosen.rules), generated: new Date().toISOString() };
  stmts.push(...Object.entries(metaRows).map(([k, v]) => `INSERT OR REPLACE INTO meta (k, v) VALUES (${lit(k)}, ${lit(v)});`));

  // The vectors: one binary matrix and its list, sent only when they changed.
  // Never the vector of a closed private note: it is its text in another form.
  const vec = db.prepare("SELECT slug, vec FROM vec ORDER BY slug").all().filter((v) => !closed.has(v.slug));
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
      // The two files are removed once sent, sent or not (2026-11-27).
      const files = ["matrix.f32", "matrix.json"];
      let refused = null;
      try {
        writeFileSync(join(TMP, "matrix.f32"), bin, { mode: 0o600 });
        writeFileSync(join(TMP, "matrix.json"), JSON.stringify({ model: cfg.embeddings.model, dims, slugs: vec.map((v) => v.slug), norms, md5 }), { mode: 0o600 });
        // The binary first, its list after: a Worker never reads a list whose matrix is not there yet.
        for (const f of files) {
          const u = wrangler(["r2", "object", "put", `${cloud.bucket}/${f}`, "--file", join(TMP, f), "--remote", "--jurisdiction", "eu"]);
          if (!u.ok) {
            refused = firstLine(u.err || u.out);
            break;
          }
        }
      } finally {
        for (const f of files) rmSync(join(TMP, f), { force: true });
      }
      if (refused) fail(`the vectors could not be sent: ${refused}`);
      stmts.push(`INSERT OR REPLACE INTO meta (k, v) VALUES ('matrix_md5', ${lit(md5)});`);
      res.matrix = true;
    }
  }
  db.close();
  // The full-text deletions first, in batches, before every insertion.
  const drops = [...ftsDrop];
  const batches = [];
  for (let i = 0; i < drops.length; i += 300) {
    const list = drops.slice(i, i + 300).map(lit).join(", ");
    batches.push(`DELETE FROM fts WHERE slug IN (${list});`, `DELETE FROM private_fts WHERE slug IN (${list});`);
  }
  if (!ALL) stmts.unshift(...batches);
  if (ALL) d1(`${SCHEMA}\nDELETE FROM note; DELETE FROM note_more; DELETE FROM private_note; DELETE FROM private_note_more; DELETE FROM fts; DELETE FROM private_fts; DELETE FROM link; DELETE FROM contact; DELETE FROM skill;`);
  // Written in files of a few thousand statements: a large first copy goes in pieces.
  for (let i = 0; i < stmts.length; i += 2000) d1(stmts.slice(i, i + 2000).join("\n"));
  // THE DOOR FOLLOWS THE BRAIN (2026-11-27): the list of tokens is sent again
  // at each sync, so that the Worker never keeps for long a list the brain no
  // longer has (a push that failed one day, a list changed on another computer).
  if (cloud.url) {
    res.tokens = pushTokens();
    if (!res.tokens) res.warning = [res.warning, "the list of tokens could not be sent to the server this time: it keeps the one it had"].filter(Boolean).join(" ; ");
    // The server is a copy of the plugin's code, made at deployment.
    if (cloud.workerPrint !== workerPrint()) {
      res.serverBehind = true;
      res.warning = [res.warning, BEHIND].filter(Boolean).join(" ; ");
    }
  }
  writeCloud({ lastSync: new Date().toISOString() });
  out({ ok: true, ...res, statements: stmts.length });
} else if (command === "deploy") {
  requireRunner(cfg);
  const build = buildDir();
  if (!build) fail("no cloud copy yet: cloud.mjs setup first");
  const d = wrangler(["deploy"], { cwd: build });
  const url = /https:\/\/[^\s]+\.workers\.dev/.exec(d.out + d.err)?.[0];
  if (!d.ok || !url) fail(`the Worker could not be deployed: ${firstLine(d.err || d.out)}`);
  // Its key for search by meaning: the brain's own, from its .env, never
  // displayed, AND THE ADDRESS IT IS FOR, in one secret (2026-11-27). The key
  // used to go alone, and the Worker sent it to OpenAI whatever service it
  // was the key of. An empty secret when there is none: a key deployed before
  // is no longer used.
  const emb = embeddingsForCloud();
  const sent = wrangler(["secret", "put", "EMBEDDINGS"], { cwd: build, input: JSON.stringify(emb.key ? { key: emb.key, base: emb.base } : {}) }).ok;
  const tokens = pushTokens();
  writeCloud({ url: `${url}/mcp`, workerPrint: workerPrint() });
  out({ ok: true, url: `${url}/mcp`, meaning: Boolean(emb.key) && sent, ...(emb.refused ? { meaningRefused: emb.refused } : {}), tokens: readTokens().length, ...(tokens ? {} : { warning: "the list of tokens could not be sent: the door stays as it was (closed, after a first deployment). Run deploy again." }) });
} else if (command === "token") {
  if (sub === "list") out({ ok: true, tokens: readTokens().map(({ hash, ...t }) => t) });
  else if (sub === "create") {
    if (!subArg || !/^[a-z0-9][a-z0-9-]*$/i.test(subArg)) fail("token create <name>: a name for the consumer (letters, digits, dashes)");
    const tokens = readTokens();
    if (tokens.some((t) => t.name === subArg)) fail(`a token named ${subArg} exists: revoke it first`);
    const value = `hb_${randomBytes(32).toString("base64url")}`;
    const rights = { private: args.includes("--private"), addresses: args.includes("--addresses"), skills: args.includes("--skills") };
    tokens.push({ name: subArg, hash: createHash("sha256").update(value).digest("hex"), ...rights, created: new Date().toISOString().slice(0, 10) });
    writeTokens(tokens);
    const where = handOver(value, subArg);
    const pushed = cloud.url ? pushTokens() : false;
    // The value never appears here: this output is read by Claude.
    out({ ok: true, name: subArg, ...rights, value: where, active: pushed, ...(rights.skills && cloud.skills !== true ? { note: "the skills are not sent to the cloud copy: this right opens nothing until cloud.mjs skills on, then sync" } : {}) });
  } else if (sub === "revoke") {
    // A REVOCATION THAT DID NOT REACH THE SERVER IS NOT ONE (2026-11-27). The
    // brain's list used to be rewritten first and the answer was "ok" even
    // when Cloudflare refused: the key went on opening the door, and nothing
    // said so. The server first; the brain's list only once it has answered.
    const all = readTokens();
    if (!all.some((t) => t.name === subArg)) fail(`no token named ${subArg ?? ""}: cloud.mjs token list names them`);
    const rest = all.filter((t) => t.name !== subArg);
    if (cloud.url && !pushTokens(rest)) {
      fail(`the token ${subArg} is NOT revoked: the server could not be told, and its key still opens the door`, {
        revoked: null,
        next: [`check the Cloudflare access (npx ${NPX_PACKAGE} whoami), then run this command again`, "to close the door at once whatever happens: delete the secret TOKENS of the Worker in the Cloudflare dashboard (nobody enters any more), then cloud.mjs deploy once the access is back"],
      });
    }
    writeTokens(rest);
    // Its value, if it was handed over in a file and the file is still there.
    const f = tokenFile(subArg);
    const fileRemoved = existsSync(f);
    rmSync(f, { force: true });
    out({ ok: true, revoked: subArg, active: Boolean(cloud.url), fileRemoved });
  } else fail("token create <name> [--private] [--addresses] [--skills] | revoke <name> | list");
} else if (command === "verify") {
  await verify();
} else {
  console.log("usage: cloud.mjs setup | skills | sync | empty | resume | deploy | state | token | verify (see the top of scripts/cloud.mjs)");
  process.exitCode = 2;
}

// -------------------------------------------------------------- embeddings
/**
 * The key of search by meaning and the address it is for, as the computer
 * pairs them (embeddings.mjs): EMBEDDINGS_BASE_URL, else OpenAI.
 * A KEY ONLY GOES TO ITS OWN HOST (2026-11-27): with another service named
 * (EMBEDDINGS_BASE_URL), only the key written for it goes (EMBEDDINGS_API_KEY),
 * never an OpenAI key; and never to an address that is not https (but this
 * computer itself, for the test bench).
 * @returns {{ key: string | null, base?: string, refused?: string }}
 */
function embeddingsForCloud() {
  loadEnv();
  const own = process.env.EMBEDDINGS_API_KEY || "";
  const openai = process.env.OPENAI_API_KEY || "";
  const base = String(process.env.EMBEDDINGS_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!own && !openai) return { key: null };
  if (!base) return { key: own || openai, base: "https://api.openai.com/v1" };
  let u;
  try {
    u = new URL(base);
  } catch {
    return { key: null, refused: "EMBEDDINGS_BASE_URL in the brain's .env is not an address: no key was deployed, the cloud searches by words" };
  }
  const here = ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname);
  if (u.protocol !== "https:" && !(here && u.protocol === "http:")) return { key: null, refused: "EMBEDDINGS_BASE_URL is not an https address: no key was deployed, the cloud searches by words" };
  if (u.hostname === "api.openai.com") return { key: own || openai, base };
  if (!own) return { key: null, refused: `the brain's .env names another service for search by meaning (${u.hostname}) and only holds an OpenAI key: an OpenAI key is never sent to another host. Add EMBEDDINGS_API_KEY=<the key of that service>, then deploy again; until then the cloud searches by words` };
  return { key: own, base };
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
/** Sends a list of tokens to the Worker (the brain's own by default). True when the server took it. */
function pushTokens(tokens = readTokens(), extra = []) {
  const build = buildDir();
  if (!build) return false;
  const list = [...tokens, ...extra].map(({ name, hash, private: p, addresses, skills }) => ({ name, hash, private: p === true, addresses: addresses === true, skills: skills === true }));
  return wrangler(["secret", "put", "TOKENS"], { cwd: build, input: JSON.stringify(list) }).ok;
}
function tokenFile(name) {
  return join(HOME, ".hypervibe-brain", `token-${name}.txt`);
}
/** The value goes to the clipboard, or to a file the person opens and deletes. */
function handOver(value, name) {
  const clip = process.platform === "win32" ? ["clip", []] : process.platform === "darwin" ? ["pbcopy", []] : ["xclip", ["-selection", "clipboard"]];
  if (!process.env.HVBRAIN_NO_CLIPBOARD) {
    const r = spawnSync(clip[0], clip[1], { input: value, windowsHide: true });
    if (r.status === 0) return "in the clipboard: paste it now into the agent's settings, then copy something else";
  }
  const f = tokenFile(name);
  writeFileSync(f, `${value}\n`, { encoding: "utf8", mode: 0o600 });
  return `in ${f.replace(/\\/g, "/")}: open it, paste the value into the agent's settings, then delete the file (it holds the key in clear; revoking the token removes it too)`;
}

// ------------------------------------------------------------------ verify
async function verify() {
  if (!cloud.url) fail("not deployed yet: cloud.mjs deploy first");
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
  // Throwaway tokens that live only in this process: one with no right at
  // all, and one that may read the skills when the copy holds some.
  const throwaway = (name, skills) => {
    const value = `hb_${randomBytes(32).toString("base64url")}`;
    return { value, entry: { name, hash: createHash("sha256").update(value).digest("hex"), private: false, addresses: false, skills } };
  };
  const plain = throwaway("verify-throwaway", false);
  const skillsSent = [...cloudSkills().send.keys()];
  const reader = skillsSent.length ? throwaway("verify-throwaway-skills", true) : null;
  const value = plain.value;
  pushTokens(readTokens(), [plain.entry, ...(reader ? [reader.entry] : [])]);
  try {
    const init = await settle(() => ask(value, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "verify", version: "1" } }), (r) => r.status === 200);
    check("with a token, the handshake answers", init.status === 200 && init.body?.result?.serverInfo?.name === "hypervibe-brain-cloud", JSON.stringify(init));
    const list = await ask(value, "tools/list");
    const names = (list.body?.result?.tools ?? []).map((t) => t.name);
    check("six tools, and no skill for a token without that right", names.length === 6 && !names.includes("brain_skill") && !init.body?.result?.capabilities?.prompts && !((await ask(value, "prompts/list")).body?.result?.prompts ?? []).length, JSON.stringify(names));
    if (reader) {
      // Six tools, and brain_skill for the token that may read them (2026-11-23).
      const withSkills = ((await ask(reader.value, "tools/list")).body?.result?.tools ?? []).map((t) => t.name);
      check("six tools and brain_skill, with the right to the skills", withSkills.length === 7 && withSkills.includes("brain_skill"), JSON.stringify(withSkills));
      const prompts = (await ask(reader.value, "prompts/list")).body?.result?.prompts ?? [];
      check("one prompt per skill sent to the cloud", prompts.length === skillsSent.length, `${prompts.length} vs ${skillsSent.length}`);
      const one = (await ask(reader.value, "tools/call", { name: "brain_skill", arguments: { name: skillsSent[0] } })).body?.result?.content?.[0]?.text ?? "";
      check(`a skill is read and translated ("${skillsSent[0]}")`, one.startsWith(`# The skill ${skillsSent[0]}, from the brain`) && one.includes("Its folder is on the person's computer"), one.slice(0, 200));
    }
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
      check("a private note's content does not leave without the right", String(g.body).includes("never shown") && !g.source && !(g.links ?? []).length, JSON.stringify(g).slice(0, 200));
      const n = JSON.parse((await ask(value, "tools/call", { name: "brain_neighbors", arguments: { slug: privateOne } })).body?.result?.content?.[0]?.text ?? "{}");
      check("nor its neighbours by meaning", !(n.similar ?? []).length, JSON.stringify(n).slice(0, 200));
    }
    const c = JSON.parse((await ask(value, "tools/call", { name: "brain_contact", arguments: { query: "a" } })).body?.result?.content?.[0]?.text ?? "{}");
    check("addresses do not leave without the right", !c.found || c.found.every((x) => !("address" in x) && !("domain" in x) && !/[^\s@]@[^\s@]+\.[a-z]{2,}/i.test(JSON.stringify(x))), JSON.stringify(c).slice(0, 200));
  } finally {
    pushTokens();
  }
  const gone = await settle(() => ask(value, "tools/list"), (r) => r.status === 401);
  check("the throwaway token no longer enters", gone.status === 401 && (!reader || (await ask(reader.value, "tools/list")).status === 401), JSON.stringify(gone));
  const failed = checks.filter((x) => !x.ok);
  out({ ok: !failed.length, url: cloud.url, checks: checks.length, failed });
  process.exitCode = failed.length ? 1 : 0;
}
