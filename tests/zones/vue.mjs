#!/usr/bin/env node
// vue.mjs - The checks of the zone "live view" (the audit of 0.8.2, corrected
// on 2026-11-21): the server and the page of live/. A copy of the plugin and a
// throwaway brain in the system's temporary folder, a fake home
// (HVBRAIN_HOME), a server of its own on another port: nothing of the
// person's is touched, the view that runs on 47615 is never asked anything,
// no AI is called. The plugin's promote.mjs is replaced, in the copy only, by
// a fake one that says what it was asked.
//
//   node tests/zones/vue.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const BASE = join(tmpdir(), `hvb-zone-vue-${process.pid}`);
const PLUGIN = join(BASE, "plugin");
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
const HB = join(HOME, ".hypervibe-brain");
const PORT = 47700 + (process.pid % 200);
const KEEP = process.argv.includes("--keep");
mkdirSync(HOME, { recursive: true });

const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", HVBRAIN_VAULT: "off", HVBRAIN_NO_WINDOW: "1", HVBRAIN_NO_OPEN: "1", HVBRAIN_OPEN: "off", HVBRAIN_CLAUDE: "no-claude-for-the-zone", HVBRAIN_WHO: "",
  CLAUDE_CODE_OAUTH_TOKEN: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", BRAIN_LIVE_PORT: String(PORT), HVBRAIN_SUGGEST: "off",
};
// Never the real home, never the real brain, never the person's view.
if (!env.HVBRAIN_HOME.startsWith(tmpdir()) || env.HVBRAIN_DIR !== "" || PORT === 47615) {
  console.error("the zone's checks only run on a throwaway home, on a port of their own");
  process.exit(2);
}

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 900)}` : ""}`);
  }
};
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { cwd: o.cwd ?? BASE, env: { ...env, ...o.env }, encoding: "utf8", windowsHide: true });
  return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
};
const read = (f) => readFileSync(f, "utf8");
const readJ = (f, d = null) => {
  try {
    return JSON.parse(read(f));
  } catch {
    return d;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const note = (folder, slug, title, status, body = `${title}.`) => {
  mkdirSync(join(BRAIN, "vault", folder), { recursive: true });
  writeFileSync(join(BRAIN, "vault", folder, `${slug}.md`), `---\ntype: note\ntitle: "${title}"\ndomains: [a]\nstatus: ${status}\nvisibility: internal\ncreated: 2026-11-01\nupdated: 2026-11-01\nsource: "zone"\n---\n\n${body}\n`, "utf8");
};
const source = (name, def) => {
  mkdirSync(join(BRAIN, "sources", name), { recursive: true });
  writeFileSync(join(BRAIN, "sources", name, "source.json"), `${JSON.stringify(def, null, 2)}\n`, "utf8");
};

/** @type {import("node:child_process").ChildProcess | null} */
let server = null;
let log = "";
const ADDRESS = `http://127.0.0.1:${PORT}`;
let token = "";
/** @param {string} path @param {RequestInit & { noToken?: boolean }} [o] */
const ask = async (path, o = {}) => {
  const headers = { ...(o.headers ?? {}), ...(o.noToken ? {} : { "x-brain-token": token }) };
  const r = await fetch(`${ADDRESS}${path}`, { ...o, headers, signal: AbortSignal.timeout(20_000) });
  const text = await r.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { status: r.status, headers: r.headers, text, body };
};
const alive = async () => {
  try {
    return (await fetch(`${ADDRESS}/api/ping`, { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
};
/** A request written by hand: an address that cannot be parsed (as a browser sends it for <img src="http://host//">), or another Host. */
const raw = (line, host = `127.0.0.1:${PORT}`) =>
  new Promise((done) => {
    const socket = connect(PORT, "127.0.0.1", () => socket.write(`${line}\r\nHost: ${host}\r\nx-brain-token: ${token}\r\nConnection: close\r\n\r\n`));
    let out = "";
    socket.on("data", (d) => (out += d));
    socket.on("close", () => done(out));
    socket.on("error", () => done(out));
  });

async function main() {
  // ---------------------------------------------------------------- the copy of the plugin, the brain
  for (const part of ["live", "scripts", "templates", ".claude-plugin"]) if (existsSync(join(REPO, part))) cpSync(join(REPO, part), join(PLUGIN, part), { recursive: true });
  // The fake promote.mjs: it writes what it was asked, and answers as the
  // contract says. In "single" mode it only knows one note at a time (a
  // plugin of before the batches).
  writeFileSync(join(PLUGIN, "scripts", "promote.mjs"), [
    'import { appendFileSync, readFileSync } from "node:fs";',
    'import { join } from "node:path";',
    'const base = process.env.ZONE_BASE;',
    'const args = process.argv.slice(2);',
    'appendFileSync(join(base, "promote.log"), JSON.stringify({ args, who: process.env.HVBRAIN_WHO ?? "" }) + "\\n");',
    'const mode = (() => { try { return readFileSync(join(base, "promote-mode"), "utf8").trim(); } catch { return "batch"; } })();',
    'const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);',
    'const say = (o, code = 0) => { console.log(JSON.stringify(o)); process.exit(code); };',
    'if (opt("--notes") !== undefined && mode === "batch") {',
    '  const notes = opt("--notes").split(",");',
    '  say({ ok: true, done: notes.filter((n) => !n.startsWith("refuse-") && n !== "already"), unchanged: notes.filter((n) => n === "already"), refused: notes.filter((n) => n.startsWith("refuse-")).map((n) => ({ note: n, error: "refused by the zone" })) });',
    '}',
    'const one = opt("--note");',
    'if (!one) say({ ok: false, error: "usage: promote.mjs --note <slug> [--to trusted|seed] [--who person|ai]" }, 1);',
    'if (one.startsWith("refuse-")) say({ ok: false, error: "refused by the zone" }, 1);',
    'say({ ok: true, note: one, status: opt("--to") ?? "trusted", event: "zone1234" });',
  ].join("\n"), "utf8");
  env.ZONE_BASE = BASE;

  const init = run("node", [join(PLUGIN, "scripts", "init.mjs"), "--dir", BRAIN, "--name", "T", "--domains", "a,b", "--lang", "en", "--switch", "--no-git"]);
  check("a throwaway brain is made", init.ok, init.out);
  note("notes", "n1", "First note", "seed", "- one\n- two\n\nSee https://example.org/page.");
  note("notes", "n2", "Second note", "seed", "Links to [[n1]].");
  note("notes", "n3", "Third note", "trusted", "Links to [[n1]] and [[n2]].");
  // A judge (an AI that reads in the background), a source that needs a key, a source of another shape.
  source("j1", { kind: "claude", live: true, tools: [{ id: "zone-judge-tool", name: "Zone judge", family: "files" }], description: "a judge" });
  source("s2", { kind: "script", every: "day", tools: [{ id: "zone-vault-tool", name: "Zone vault", family: "files" }], needs: ["ZONE_KEY"], description: "needs a key" });
  const build = run("node", [join(PLUGIN, "scripts", "build.mjs"), "--quiet"]);
  check("its index is built", build.ok, build.out);

  // ---------------------------------------------------------------- the server
  server = spawn(process.execPath, [join(PLUGIN, "live", "server.mjs")], { cwd: BASE, env, windowsHide: true });
  server.stdout?.on("data", (d) => (log += d));
  server.stderr?.on("data", (d) => (log += d));
  for (let i = 0; i < 60 && !(await alive()); i++) await sleep(250);
  check("the server starts on a port of its own", await alive(), log);
  token = String(readJ(join(HB, "live-token.json"), {})?.token ?? "");

  // ---------------------------------------------------------------- A. security
  check("audit 3: the token is kept in the hub's folder, 64 hex characters", /^[0-9a-f]{64}$/.test(token), read(join(HB, "live-token.json")));
  // THE PAGE NO LONGER GETS ITS COOKIE FOR THE ASKING (2026-11-27): a page
  // asked for with neither a cookie nor a code is a screen that says how to
  // open the view; the cookie is given against a code that serves once.
  const bare = await ask("/", { noToken: true });
  check("2026-11-27: a page asked for without a cookie nor a code gets no token, and a screen that says how to open the view", bare.status === 200 && !bare.headers.get("set-cookie") && !bare.text.includes(token) && /\/brain:live/.test(bare.text) && !/<script/i.test(bare.text), `${bare.headers.get("set-cookie")} ${bare.text.slice(0, 200)}`);
  for (const doc of ["/index.html", "/history.html", "/legend.html"]) {
    const other = await ask(doc, { noToken: true });
    check(`2026-11-27: nor does ${doc}`, other.status === 200 && !other.headers.get("set-cookie") && /\/brain:live/.test(other.text));
  }
  const noCode = await ask("/api/code", { method: "POST", noToken: true });
  check("2026-11-27: a code is only made for who shows the token", noCode.status === 401, String(noCode.status));
  const made = await ask("/api/code", { method: "POST" });
  const code = String(made.body?.code ?? "");
  check("2026-11-27: with the token, a code is made", made.status === 200 && /^[0-9a-f]{32,}$/.test(code), made.text);
  const badCode = await ask("/?code=0000", { noToken: true, redirect: "manual" });
  check("2026-11-27: a code that was never made gives nothing", badCode.status === 200 && !badCode.headers.get("set-cookie") && /\/brain:live/.test(badCode.text));
  const page = await ask(`/?code=${code}`, { noToken: true, redirect: "manual" });
  const cookie = String(page.headers.get("set-cookie") ?? "");
  check("audit 3: against its code, the page gets its token in a cookie no script reads and no other site sends, and the code leaves the address", page.status === 302 && page.headers.get("location") === "/" && cookie.includes(token) && /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie), `${page.status} ${page.headers.get("location")} ${cookie}`);
  const again = await ask(`/?code=${code}`, { noToken: true, redirect: "manual" });
  check("2026-11-27: a code serves once", again.status === 200 && !again.headers.get("set-cookie"), `${again.status} ${again.headers.get("set-cookie")}`);
  const known = await ask("/", { noToken: true, headers: { cookie: cookie.split(";")[0] } });
  check("2026-11-27: a page that has its cookie is served, and keeps it for another year", known.status === 200 && /<script/i.test(known.text) && String(known.headers.get("set-cookie") ?? "").includes(token));
  check("audit 2: no answer may be framed, nor taken for another type", bare.headers.get("x-frame-options") === "DENY" && /frame-ancestors 'none'/.test(bare.headers.get("content-security-policy") ?? "") && bare.headers.get("x-content-type-options") === "nosniff");
  const ping = await ask("/api/ping", { noToken: true });
  check("audit 3: the ping answers without the token (it says nothing of the brain)", ping.status === 200);
  check("2026-11-27: without the token, the ping gives neither a folder nor a process number", ping.text.startsWith("brain-live") && !ping.text.includes(BRAIN.replaceAll("\\", "/")) && !ping.text.toLowerCase().includes(PLUGIN.replaceAll("\\", "/").toLowerCase()) && !/"pid"/.test(ping.text) && !/"root"/.test(ping.text), ping.text);
  const fullPing = await ask("/api/ping");
  const said = JSON.parse(fullPing.text.split("\n")[2] ?? "{}");
  check("2026-11-27: with the token, it says which brain it serves, from where, and under which process", fullPing.text.split("\n")[1] === BRAIN.replaceAll("\\", "/") && Number.isInteger(said.pid) && typeof said.root === "string", fullPing.text);
  check("2026-11-27: the token's file is kept for the person alone (an access list of their own on Windows, its mode elsewhere)", process.platform === "win32" ? said.tokenKept === "access list: this account only" : said.tokenKept === "mode 600", String(said.tokenKept));
  if (process.platform === "win32") {
    const acl = spawnSync("icacls", [join(HB, "live-token.json")], { encoding: "utf8", windowsHide: true }).stdout;
    const entries = String(acl).split(/\r?\n/).filter((l) => /:\(/.test(l));
    check("2026-11-27: on Windows, the token's file names one account, and inherits no other", entries.length === 1 && !/\(I\)/.test(entries[0]), acl);
  }
  check("audit 2: the headers are on the answers of the API too", ping.headers.get("x-frame-options") === "DENY");
  const without = await ask("/api/map", { noToken: true });
  check("audit 3: a route of the API without the token is refused", without.status === 401, `${without.status} ${without.text.slice(0, 120)}`);
  const logos = await ask("/logos.json", { noToken: true });
  check("audit 3: the logos ask for the token too", logos.status === 401);
  const byCookie = await ask("/api/map", { noToken: true, headers: { cookie: cookie.split(";")[0] } });
  check("audit 3: the page's cookie opens the API", byCookie.status === 200 && Array.isArray(byCookie.body?.nodes), byCookie.text.slice(0, 200));
  const wrong = await ask("/api/map", { noToken: true, headers: { "x-brain-token": "0".repeat(64) } });
  check("audit 3: a wrong token is refused", wrong.status === 401);
  const map = await ask("/api/map");
  check("audit 3: a program sends the token in its header (x-brain-token)", map.status === 200 && map.body?.nodes?.length >= 3, map.text.slice(0, 200));
  // The building of the brain (2026-11-23): no start begun, it is said from
  // the settings alone; begun, the plugin's state comes trimmed for the panel.
  {
    const cfgFile = join(HB, "config.json");
    const cfg = readJ(cfgFile, {});
    const none = await ask("/api/start");
    check("no start begun on this computer: the building is not shown, and the plugin is not asked", none.body?.ok === true && none.body.underway === false && none.body.parts.length === 0, none.text);
    writeFileSync(cfgFile, `${JSON.stringify({ ...cfg, startNow: { doing: { text: "Counting the <b>writings</b>", at: new Date().toISOString() } } }, null, 2)}\n`, "utf8");
    const begun = await ask("/api/start");
    const b = begun.body;
    check(
      "a start under way: the parts in their order, the part in progress, the blocks of the knowledge with their progress, and what is being done",
      b?.underway === true && b.parts.map((/** @type {any} */ x) => x.id).join() === "preflight,computer,container,tools,knowledge,executive,life" && b.part === "container" && b.next === "brain" && b.doing === "Counting the <b>writings</b>" && b.blocks.find((/** @type {any} */ x) => x.id === "writings")?.progress?.unit === "files" && b.blocks.find((/** @type {any} */ x) => x.id === "memory")?.state === "na" && "began" in b && (await ask("/api/start", { noToken: true })).status === 401,
      begun.text.slice(0, 700),
    );
    writeFileSync(cfgFile, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  }
  const stream = await fetch(`${ADDRESS}/api/stream`, { signal: AbortSignal.timeout(5000) }).then((r) => r.text()).catch((e) => String(e));
  check("audit 3: a page whose stream comes without its token is told to reload", stream.includes("event: reload"), stream.slice(0, 200));
  const slash = await raw("GET // HTTP/1.1");
  await sleep(300);
  check("audit 1: GET // is a bad request, not the end of the server", /^HTTP\/1\.1 400/.test(slash) && (await alive()), slash.slice(0, 120));
  const hosted = await raw("GET /api/map HTTP/1.1", "evil.example");
  check("the Host check still refuses another site (DNS rebinding)", /^HTTP\/1\.1 403/.test(hosted), hosted.slice(0, 120));
  check("audit 4: reading the note is a GET, validating it is not", (await ask("/api/validate?note=n1")).status === 405 && (await ask("/api/index/refresh")).status === 405 && (await ask("/api/open-note?slug=n1")).status === 405);

  // ---------------------------------------------------------------- C. no private notes any more
  check("decision C: the map no longer carries a \"private\" column", Array.isArray(map.body?.fields) && !map.body.fields.includes("private") && map.body.nodes.every((n) => n.length === map.body.fields.length), JSON.stringify(map.body?.fields));
  const seedRow = map.body?.nodes?.find((n) => n[0] === "n1");
  check("the map says the status of each note (the Seeds filter)", seedRow && seedRow[map.body.fields.indexOf("status")] === "seed", JSON.stringify(seedRow));

  // ---------------------------------------------------------------- B. validating
  const one = await ask("/api/validate?note=n1&to=trusted", { method: "POST" });
  const asked = read(join(BASE, "promote.log")).trim().split("\n").map((l) => JSON.parse(l));
  check("decision B: POST /api/validate asks the plugin's promote.mjs, for the person", one.body?.ok === true && one.body.status === "trusted" && asked.at(-1)?.args.join(" ") === "--note n1 --to trusted --who person" && asked.at(-1)?.who === "person", `${one.text} ${JSON.stringify(asked.at(-1))}`);
  const bad = await ask("/api/validate?note=--notes&to=trusted", { method: "POST" });
  check("decision B: a name that reads as an option never reaches the script", bad.body?.ok === false && bad.body.code === "invalid");
  const refusedOne = await ask("/api/validate?note=refuse-x&to=trusted", { method: "POST" });
  check("decision B: a refusal of the plugin is said with its code", refusedOne.body?.ok === false && refusedOne.body.code === "refused", refusedOne.text);
  const batch = await ask("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: ["n1", "n2", "already", "refuse-n9"] }) });
  check("decision B: several seeds at once (promote.mjs --notes), each said apart", batch.body?.ok === true && batch.body.done.join() === "n1,n2" && batch.body.unchanged.join() === "already" && batch.body.refused[0]?.note === "refuse-n9", batch.text);
  writeFileSync(join(BASE, "promote-mode"), "single", "utf8");
  const before = read(join(BASE, "promote.log")).trim().split("\n").length;
  const fallback = await ask("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: ["n1", "n2", "refuse-n9"] }) });
  const calls = read(join(BASE, "promote.log")).trim().split("\n").slice(before).map((l) => JSON.parse(l));
  check("decision B: a promote.mjs of one note at a time is asked note by note, same answer", fallback.body?.ok === true && fallback.body.done.join() === "n1,n2" && fallback.body.refused.length === 1 && calls.filter((c) => c.args[0] === "--note").length === 3, `${fallback.text} ${JSON.stringify(calls)}`);
  const tooMany = await ask("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notes: Array.from({ length: 301 }, (_, i) => `n${i}`) }) });
  check("decision B: three hundred notes at most in one request", tooMany.body?.ok === false && tooMany.body.code === "invalid");
  const opened = await ask("/api/open-note?slug=n1", { method: "POST" });
  const outside = await ask("/api/open-note?slug=..%2F..%2Fbrain", { method: "POST" });
  check("E11: a note's file is shown by the path the index holds, never one of the request", opened.body?.ok === true && outside.status === 404, `${opened.text} ${outside.status}`);

  // ---------------------------------------------------------------- the key of the vault, the catch-up, the judge's settings
  writeFileSync(join(HB, "queue.json"), JSON.stringify({ s2: { at: new Date().toISOString() }, j1: { at: new Date().toISOString() } }), "utf8");
  mkdirSync(join(HB, "judge"), { recursive: true });
  const now = Date.now();
  writeFileSync(join(HB, "judge", "j1.json"), JSON.stringify({ items: Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, at: new Date(now - i * 1000).toISOString() })) }), "utf8");
  writeFileSync(join(BRAIN, "sources", "j1", "seen.json"), JSON.stringify(Object.fromEntries(Array.from({ length: 385 }, (_, i) => [`seen${i}`, 1]))), "utf8");
  const next = await ask("/api/next");
  check("decision A: a source that waits for the vault puts a key on its tool", next.body?.["zone-vault-tool"]?.vault === true && next.body["zone-vault-tool"].vaultSources?.includes("s2"), next.text.slice(0, 400));
  check("decision A: a judge is never said to wait for the vault", !next.body?.["zone-judge-tool"]?.vault, JSON.stringify(next.body?.["zone-judge-tool"]));
  const catchUp = next.body?.["zone-judge-tool"]?.catchUp;
  check("E1: a catch-up counts its own pile, not all the judge ever read (40, not 425)", catchUp && catchUp.total === 40 && catchUp.done === 0, JSON.stringify(next.body?.["zone-judge-tool"]));
  check("E1, audit 10: its words say neither \"catching up\" twice nor a batch of 20", /^40 items left out of 40, 15 per run$/.test(next.body?.["zone-judge-tool"]?.reason ?? ""), next.body?.["zone-judge-tool"]?.reason);
  const tool = await ask("/api/tool?id=zone-vault-tool");
  check("decision A: the card of the tool says which source waits for the vault", tool.body?.sources?.find((s) => s.name === "s2")?.waitsForVault === true, tool.text.slice(0, 300));
  const judgeTool = await ask("/api/tool?id=zone-judge-tool");
  check("E15: a judge without gathering reads in the same tick (no \"15m after\")", (judgeTool.body?.sources?.[0]?.when ?? []).includes("live, as soon as an item arrives"), JSON.stringify(judgeTool.body?.sources?.[0]?.when));
  check("E4: a run that ended is told apart from one going on", judgeTool.body?.sources?.[0] && "runningSince" in judgeTool.body.sources[0] && "lastEnd" in judgeTool.body.sources[0]);
  const half = await ask("/api/settings?source=j1&from=7.5&to=20", { method: "POST" });
  check("audit 9: an hour that is not whole is refused, in words", half.body?.ok === false && /whole numbers/.test(half.body.error), half.text);
  const big = await ask("/api/settings?source=j1&batch=40", { method: "POST" });
  check("audit 9: a batch out of bounds is kept inside them, and the answer says so", big.body?.ok === true && big.body.batch === 30 && readJ(join(BRAIN, "sources", "j1", "source.json"))?.batch === 30, big.text);
  const quarter = await ask("/api/settings?source=s2&every=15m", { method: "POST" });
  const settings = await ask("/api/settings");
  check("E8: a quarter of an hour is no longer offered", quarter.body?.ok === false && !settings.body?.sources?.find((s) => s.name === "s2")?.choices.includes("15m"), `${quarter.text} ${JSON.stringify(settings.body?.sources)}`);
  writeFileSync(join(BRAIN, "sources", "j1", "source.json"), "{ not json", "utf8");
  const unreadable = await ask("/api/settings?source=s2&every=hour", { method: "POST" });
  check("audit 8: a declaration written again is whole (written beside, renamed)", unreadable.body?.ok === true && readJ(join(BRAIN, "sources", "s2", "source.json"))?.every === "hour");
  source("j1", { kind: "claude", live: true, tools: [{ id: "zone-judge-tool", name: "Zone judge", family: "files" }], batch: 30 });

  // ---------------------------------------------------------------- audit 5: data of another shape
  source("odd", { kind: "script", every: "day", tools: { not: "a list" }, folders: "nor this", after: 3 });
  appendFileSync(join(HB, "events.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), act: "read", notes: "x", tool: "brain_get" })}\n${JSON.stringify({ at: new Date().toISOString(), act: "read", notes: [1, null, "n1"], tool: "brain_get" })}\n"a string"\n`, "utf8");
  await sleep(1500);
  const afterOdd = await ask("/api/tools");
  check("audit 5: a declaration and journal lines of another shape stop nothing", (await alive()) && afterOdd.status === 200, `${afterOdd.status} ${log.slice(-600)}`);

  // ---------------------------------------------------------------- the territories, a reading that starts nothing
  const renamed = await ask("/api/territories/rename?id=nope&name=X", { method: "POST" });
  check("audit 7: renaming a territory that is gone is refused with a code the page words", renamed.body?.ok === false && renamed.body.code === "unknown", renamed.text);
  await ask("/api/territories");
  check("audit 4: reading the territories writes nothing", !existsSync(join(BRAIN, "index", "territories.json")));
  const noteBody = await ask("/api/note?slug=n1");
  check("decision C, audit 4: a note is read whole, with nothing hidden and nothing started", typeof noteBody.body?.body === "string" && noteBody.body.body.includes("one"), noteBody.text.slice(0, 300));
  const unknownNote = await ask("/api/note?slug=nothing-here");
  check("audit 16: a note that cannot be read says so without a path of the machine", typeof unknownNote.body?.error === "string" && !/[A-Z]:\\|\/Users\//.test(unknownNote.body.error), unknownNote.text);

  // ---------------------------------------------------------------- the page, without a browser
  await pageChecks();
}

/** The modules of the page, loaded by Node against a few fakes of the browser. */
async function pageChecks() {
  const PAGE = join(BASE, "page");
  cpSync(join(REPO, "live", "page"), PAGE, { recursive: true });
  cpSync(join(REPO, "live", "contract.d.ts"), join(BASE, "contract.d.ts"));
  writeFileSync(join(PAGE, "package.json"), '{ "type": "module" }\n', "utf8");
  /** @type {{ url: string, init: any }[]} */
  const fetched = [];
  /** @type {any} what the fake server answers next */
  let answer = { ok: true };
  globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  globalThis.fetch = async (url, init) => {
    fetched.push({ url: String(url), init });
    return { status: 200, ok: true, json: async () => (typeof answer === "function" ? answer(String(url), init) : answer) };
  };
  const load = (f) => import(pathToFileURL(join(PAGE, f)).href);

  const { renderBody } = await load("markdown.js");
  const { state } = await load("state.js");
  state.noteById = new Map([["n2", { id: "n2", title: "Second <b>note</b>" }]]);
  const html = renderBody("Intro line\n- one\n- two with https://example.org/a.\n\n1. first\n2. second\n\n[[n2]] and [click](javascript:alert(1)) and <script>x</script>");
  check("E12: a list of a note is a list", html.includes("<ul><li>one</li><li>two with") && html.includes("<ol><li>first</li><li>second</li></ol>"), html);
  check("E12: a web address can be clicked, in a new tab, without telling where from", html.includes('<a href="https://example.org/a" target="_blank" rel="noopener noreferrer">https://example.org/a</a>.'), html);
  check("E12: an address of another scheme stays text, markup stays escaped", !/href="javascript/i.test(html) && html.includes("&lt;script&gt;"), html);
  check("audit 17: a link between notes is reached with the keyboard (a link, not a span)", html.includes('<a href="#" class="link" data-slug="n2">Second &lt;b&gt;note&lt;/b&gt;</a>'), html);

  const v = await load("validate.js");
  state.notes = [
    { id: "a", title: "A", status: "seed", nature: "", domains: [] },
    { id: "b", title: "B", status: "graine", nature: "decision", domains: [] },
    { id: "c", title: "C", status: "trusted", nature: "", domains: [] },
    { id: "d", title: "D", status: "seed", nature: "", domains: [] },
  ];
  state.noteById = new Map(state.notes.map((n) => [n.id, n]));
  state.layout = { at: new Map(state.notes.map((n) => [n.id, { x: 0, y: 0 }])) };
  state.inbound = new Map([["a", 1], ["b", 5], ["d", 2]]);
  check("decision B: the next seed is the most linked to of those left", v.nextSeed(null) === "b" && v.nextSeed("b") === "d");
  state.writtenSince = { since: "", slugs: new Set(["a", "b"]) };
  check("decision B: the seeds a button validates are those the other filters leave", v.visibleSeeds().join() === "a,b");
  state.writtenSince = null;
  answer = { ok: false, code: "refused", error: "no" };
  const refused = await v.setStatus("a", "trusted");
  check("decision B: a validation refused brings the seed back, with a word", refused.ok === false && state.noteById.get("a").status === "seed" && !state.pendingStatus.has("a"));
  answer = { ok: true, note: "b", status: "trusted", event: "x" };
  const validated = await v.setStatus("b", "trusted");
  check("decision B: a validated note takes the brain's own word at once (graine -> fiable)", validated.ok && state.noteById.get("b").status === "fiable");
  answer = (url, init) => {
    const notes = JSON.parse(init.body).notes;
    return { ok: true, done: notes.filter((n) => n !== "d"), unchanged: [], refused: [{ note: "d", error: "no" }] };
  };
  const many = await v.validateMany(["a", "d", "c"]);
  check("decision B: several at once, what is refused goes back to seed", many.done === 1 && many.refused === 1 && state.noteById.get("a").status === "trusted" && state.noteById.get("d").status === "seed" && fetched.at(-1)?.init?.headers?.["content-type"] === "application/json", JSON.stringify({ many, a: state.noteById.get("a").status, d: state.noteById.get("d").status }));
  answer = () => { throw new Error("silent"); };
  state.noteById.get("d").status = "seed";
  const silent = await v.validateMany(["d"]);
  check("decision B: a server that does not answer leaves every seed as it was", silent.refused === 1 && state.noteById.get("d").status === "seed");

  // THE TWO DESIGNS (2026-11-23): the night stays as it was painted, the
  // Hypervibe design changes the colours the modules import (live bindings),
  // reads on the night of its own design system, `#1A1410` (2026-11-27; it
  // stood on the night design's grounds from 2026-11-24), and its stylesheet
  // touches nothing without its attribute.
  const theme = await load("theme.js");
  const st = await load("state.js");
  const nightKept = st.SELECTION === "#ffe500" && st.VIVID[0] === "#ff5a5f" && st.SECTORS.source?.color === "#3ee0c5" && theme.dataColor("#7ee36b", "domain") === "#7ee36b" && theme.fadeOf("#ffffff") === "rgba(0,0,0,0)" && theme.colors.textEdge === "rgba(11,12,24,0.8)";
  check("design: the night is the default, with the colours the map always had", theme.themeName() === "night" && nightKept, JSON.stringify({ name: theme.themeName(), selection: st.SELECTION }));
  theme.setTheme("hypervibe", { keep: false });
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  // (2026-11-27) Hypervibe on the night of its design system: its texts on the page (#1A1410, NUIT.fond) and on a surface, that night under the design system's veil of cream at 6 % (NUIT.voile: a panel, a card, the heart of the map), the darker and the lighter.
  const HV_NIGHT = "#1A1410";
  const HV_CREAM = "#FAF8F5";
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  /** The night under a veil of cream, as the three numbers of its colour. @param {number} veil */
  const veiled = (veil) => channels(HV_NIGHT).map((v, i) => Math.round(v + (channels(HV_CREAM)[i] - v) * veil));
  const HV_SURFACE = `#${veiled(0.06).map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  const HV_GROUNDS = [HV_NIGHT, HV_SURFACE];
  const hvTexts = { bubbleName: theme.colors.bubbleName, bubbleCount: theme.colors.bubbleCount, toolName: theme.colors.toolName, toolNameOff: theme.colors.toolNameOff, harnessName: theme.colors.harnessName, selectionText: theme.colors.selectionText, ...Object.fromEntries(["#FF6040", "#FFE500", "#00C896", "#4B7BFF", "#8B5CF6", "#FF4D6D"].map((v) => [v, theme.inkOf(v)])) };
  const weak = Object.entries(hvTexts).flatMap(([k, c]) => HV_GROUNDS.filter((ground) => ratio(c, ground) < 4.5).map((ground) => `${k} ${c} on ${ground}: ${ratio(c, ground).toFixed(2)}`));
  check("design: Hypervibe reaches the modules through their usual names, and its texts read on the night of its design system and on a surface (4.5:1)", st.SELECTION === "#FFE500" && st.SECTORS.base?.color === "#A783F6" && theme.colors.metaColor === HV_NIGHT && HV_SURFACE === "#27221e" && !weak.length, JSON.stringify({ weak, meta: theme.colors.metaColor, surface: HV_SURFACE }));
  // The map: the disc of a tool, the edge of a text and the veil over a floor set back are that night; a pill and a plate are surfaces (the night under the veil of cream, worked out, almost opaque); nothing of the night blue is left in the palette.
  const surfaceAt = (alpha) => `rgba(${veiled(0.06).join(",")},${alpha})`;
  const blueLeft = JSON.stringify(theme.colors).match(/0b0c18|15162a|10111f|1c1d36|11,\s*12,\s*24|17,\s*15,\s*36/gi) ?? [];
  check("design: the map of Hypervibe is painted on the night of its design system (the disc of a tool, the edge of a text, the veil, a pill and a plate as surfaces), no night blue left", theme.colors.disc === HV_NIGHT && theme.colors.textEdge === "rgba(26,20,16,0.8)" && theme.colors.veil === "rgba(26,20,16,0.9)" && theme.colors.pill === surfaceAt(0.88) && theme.colors.plate === surfaceAt(0.84) && theme.colors.pillText === HV_NIGHT && !blueLeft.length, JSON.stringify({ disc: theme.colors.disc, edge: theme.colors.textEdge, veil: theme.colors.veil, pill: theme.colors.pill, plate: theme.colors.plate, blueLeft }));
  theme.seedColors("domain", ["#4aa3ff", "#e0559b", "#ffc53d", "#3ee0c5", "#9b8cff", "#ff9f43", "#7ee36b", "#ff5a5f"]);
  const swatches = ["#4aa3ff", "#e0559b", "#ffc53d", "#3ee0c5", "#9b8cff", "#ff9f43", "#7ee36b", "#ff5a5f"].map((c) => theme.dataColor(c, "domain"));
  const hvTokens = new Set(["#FF6040", "#FFE500", "#00C896", "#4B7BFF", "#8B5CF6", "#FF4D6D", "#FE866D", "#FEEA3D", "#3FD4AE", "#779AFD", "#A783F6", "#FE788F"]);
  const dim = [...hvTokens].flatMap((c) => HV_GROUNDS.filter((ground) => ratio(c, ground) < 3).map((ground) => `${c} on ${ground}: ${ratio(c, ground).toFixed(2)}`));
  check("design: eight domains stay eight colours of the design system, and each of its colours is seen on its night and on a surface (3:1)", new Set(swatches).size === 8 && swatches.every((c) => hvTokens.has(c)) && !dim.length && theme.dataColor("#9aa0b8", "domain") === "#A39A90", `${swatches.join(" ")} ${JSON.stringify(dim)}`);
  theme.setTheme("night", { keep: false });
  check("design: back to the night, the colours of before", st.SELECTION === "#ffe500" && theme.dataColor("#4aa3ff", "domain") === "#4aa3ff");
  /** The selectors of a rule's head, split on the commas outside brackets ("a, :where(b, c)" is two). @param {string} head */
  const topLevel = (head) => {
    const out = [""];
    let depth = 0;
    for (const ch of head) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && !depth) out.push(""); else out[out.length - 1] += ch;
    }
    return out;
  };
  const hvCss = read(join(PAGE, "theme-hypervibe.css")).replace(/\/\*[\s\S]*?\*\//g, "");
  const loose = hvCss.split("}").map((rule) => rule.split("{")[0].trim()).filter((head) => head && !head.startsWith("@media") && head !== "@font-face").flatMap((head) => topLevel(head.replace(/^@media[^{]*\{/, ""))).map((s) => s.trim()).filter((s) => s && !s.startsWith(':root[data-theme="hypervibe"]'));
  check("design: every rule of the Hypervibe stylesheet waits for its attribute (the night is untouched)", hvCss.length > 2000 && !loose.length, loose.slice(0, 5).join(" | "));
  // (2026-11-27) The grounds are the night of the design system: the stylesheet names it once (#1A1410), gives it to the page and to the full pages (--bg), to the map (its own rule, a little lighter at its heart, where the veil of cream fades out) and to the disc of a tool; a surface is that night under the veil of cream at 6 %, mixed by the browser from the two tokens, and the panels of the map are that surface (--panel). Before, it stood on the night design's grounds, value for value.
  const cssVar = (css, name) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  const grounds = {
    night: cssVar(hvCss, "--hv-night") === HV_NIGHT,
    veil: cssVar(hvCss, "--hv-veil") === "rgba(250, 248, 245, 0.06)" && cssVar(hvCss, "--hv-cream") === HV_CREAM,
    surface: cssVar(hvCss, "--hv-surface") === "color-mix(in srgb, var(--hv-cream) 6%, var(--hv-night))",
    panel: /^color-mix\(in srgb, var\(--hv-surface\) \d+%, transparent\)$/.test(cssVar(hvCss, "--hv-panel") ?? "") && /^color-mix\(in srgb, var\(--hv-surface\) \d+%, transparent\)$/.test(cssVar(hvCss, "--hv-card") ?? ""),
    page: cssVar(hvCss, "--bg") === "var(--hv-night)" && cssVar(hvCss, "--panel") === "var(--hv-panel)",
    fieldAndDisc: cssVar(hvCss, "--hv-field") === "var(--hv-night)" && cssVar(hvCss, "--hv-disc") === "var(--hv-night)",
    map: /:root\[data-theme="hypervibe"\] #scene \{ background: radial-gradient\(ellipse at 50% 45%, var\(--hv-veil\) 0%, rgba\(250, 248, 245, 0\) 70%\), var\(--hv-night\); \}/.test(hvCss),
    card: /:root\[data-theme="hypervibe"\] #panel \{[^}]*background: var\(--hv-card\)/.test(hvCss),
  };
  // No night blue left, and no ground of its own: outside the icons drawn in the fields (data:), every colour written in full is a token of the design system or the black of a mask, and a dark ground is the night, written once.
  const written = hvCss.replace(/url\("data:[^"]*"\)/g, "");
  const HV_TOKENS = new Set([HV_NIGHT, HV_CREAM, "#A39A90", "#FF6040", "#FE866D", "#FFE500", "#FEEA3D", "#00C896", "#3FD4AE", "#4B7BFF", "#779AFD", "#8B5CF6", "#A783F6", "#FF4D6D", "#000"].map((c) => c.toLowerCase()));
  const strangers = [...new Set([...written.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()))].filter((c) => !HV_TOKENS.has(c));
  const darks = [...new Set([...written.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)].filter((m) => Math.max(Number(m[1]), Number(m[2]), Number(m[3])) < 120).map((m) => `${m[1]},${m[2]},${m[3]}`))].filter((c) => c !== "26,20,16" && c !== "0,0,0");
  check("design: Hypervibe stands on the night of its design system, #1A1410 (the page, the map, the full pages, a field, the disc of a tool), its surfaces are that night under the veil of cream, and no night blue nor ground of its own is written", Object.values(grounds).every(Boolean) && written.split("--hv-night:").length === 2 && !strangers.length && !darks.length, JSON.stringify({ grounds, strangers, darks }));
  // The grey of the night, on what the stylesheet lays over a surface: one veil more (a control in a panel, a pill in the card) leaves it above 4.5:1, the hollow would not; so a group of the filters has no veil of its own, and a pill of the card takes the veil.
  const stack = (...veils) => `#${veils.reduce((ground, veil) => ground.map((v, i) => v + (channels(HV_CREAM)[i] - v) * veil), channels(HV_NIGHT)).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const greyOn = { surface: ratio("#A39A90", stack(0.06)), veilOnSurface: ratio("#A39A90", stack(0.06, 0.06)), hollowOnSurface: ratio("#A39A90", stack(0.06, 0.12)) };
  const flat = /:root\[data-theme="hypervibe"\] \.filter-group \{[^}]*background: none; \}/.test(hvCss) && /:root\[data-theme="hypervibe"\] #panel \.tag \{[^}]*background: var\(--hv-veil\);/.test(hvCss) && /:root\[data-theme="hypervibe"\] \.notice\.warn \.say,\s*:root\[data-theme="hypervibe"\] \.held-box small \{ color: var\(--hv-cream\); \}/.test(hvCss);
  check("design: in Hypervibe the grey of the night stays above 4.5:1 on a surface and under one veil more, and nothing lays a second veil or the hollow under it", greyOn.surface >= 4.5 && greyOn.veilOnSurface >= 4.5 && greyOn.hollowOnSurface < 4.5 && flat, JSON.stringify({ greyOn, flat }));
  // The rainbow band: at the very top of every page, thick enough to be seen, above a dialog; the pages without the map carry the stylesheet and its early script.
  const band = /:root\[data-theme="hypervibe"\] body::before \{([^}]*)\}/.exec(hvCss)?.[1] ?? "";
  const pagesDressed = ["index.html", "history.html", "legend.html"].every((f) => { const html = read(join(PAGE, f)); return html.includes("theme-hypervibe.css") && html.indexOf("theme-early.js") < html.indexOf("</head>"); });
  check("design: the rainbow band is at the top of every page of Hypervibe, 5 px high, above everything", /position: fixed/.test(band) && /top: 0/.test(band) && /height: 5px/.test(band) && Number(/z-index: (\d+)/.exec(band)?.[1]) > 50 && /--hv-rainbow/.test(band) && pagesDressed, band);
  // The icons of the design system: Phosphor duotone on 256, filled; every icon the module puts in has its paths; nothing on the night.
  const icons = await load("icones-hypervibe.js");
  const iconSrc = read(join(PAGE, "icones-hypervibe.js"));
  const named = [...iconSrc.matchAll(/\["[^"]*[^a-z"][^"]*", "([a-z]+)"\]/g), ...iconSrc.matchAll(/"[^"]": "([a-z]+)"/g), ...iconSrc.matchAll(/\["([a-z]+)", "[^"]+"\]/g)].map((m) => m[1]);
  const legendIcons = [...read(join(PAGE, "legend.js")).matchAll(/AS_ICONS = \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/: "([a-z]+)"/g)].map((x) => x[1]));
  const absent = [...new Set([...named, ...legendIcons])].filter((n) => !icons.PICTOS[n]);
  const svg = icons.iconSvg("reglages", { size: 20 });
  const wellFormed = Object.values(icons.PICTOS).every((p) => /^M[\d.,\-\sA-Za-z]+Z$/.test(p.trait) && (p.fond === null || /^M[\d.,\-\sA-Za-z]+Z$/.test(p.fond)));
  check("design: the icons of Hypervibe are those of its design system (Phosphor duotone, filled on 256), each one the page asks for is there", named.length >= 15 && legendIcons.length >= 5 && !absent.length && wellFormed && /viewBox="0 0 256 256"/.test(svg) && /fill="currentColor"/.test(svg) && /opacity="0.2"/.test(svg) && !/stroke=/.test(svg), JSON.stringify({ absent, named: named.length, legendIcons }));
  check("design: on the night, the icons module adds nothing (it only acts under the attribute)", /const on = \(\) => [^;]*dataset\.theme === "hypervibe"/.test(iconSrc) && /if \(!on\(\)\) return;/.test(iconSrc) && /\.hv-night-icon,\s*:root\[data-theme="hypervibe"\] \.hv-glyph-text \{ display: none !important; \}/.test(hvCss), "");
  // (2026-11-24) The fonts are carried by the view: each url() of the stylesheet is a woff2 of page/fonts/, with its licence; the server gives them their type; the night loads none.
  // (2026-11-24) The other url() are icons of the design system drawn inside a field, written in the stylesheet itself (data:, an SVG): nothing from the network either.
  const allUrls = [...hvCss.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  const urls = allUrls.filter((u) => !u.startsWith("data:"));
  const inline = allUrls.filter((u) => u.startsWith("data:"));
  const fontsHere = urls.length === 4 && urls.every((u) => /^fonts\/[a-z0-9-]+\.woff2$/.test(u) && existsSync(join(PAGE, u))) && existsSync(join(PAGE, "fonts", "LICENSE.md")) && existsSync(join(PAGE, "fonts", "LICENSE-Geist.txt")) && inline.every((u) => u.startsWith("data:image/svg+xml,") && !/https?:%2F%2F|https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(u));
  const typed = /"\.woff2": "font\/woff2"/.test(read(join(REPO, "live", "server.mjs")));
  const nightFonts = /@font-face|url\(/.test(read(join(PAGE, "style.css")) + read(join(PAGE, "base.css")));
  check("design: the fonts of Hypervibe are in the view, with their licences and their type, and the night loads none", fontsHere && typed && !nightFonts, JSON.stringify({ urls, typed, nightFonts }));
  // (2026-11-24) A hover never moves anything: in the Hypervibe design, a rule under :hover changes colours, a
  // background, a shadow, an outline, an opacity, never a border's width, a padding, a margin, a size, a place or a
  // font (cards were seen to grow and scroll bars to come under the pointer). And a card that scrolls (a card that holds
  // a table) draws no edge 1 px outside its box, which made it scroll both ways. (A transform of a pseudo-element
  // is let through: the rainbow that passes under the yellow button, clipped by it, moves nothing.)
  const MOVES = /^(border(-(top|right|bottom|left))?(-(width|style))?|border-(block|inline).*|padding.*|margin.*|width|height|(min|max)-(width|height)|inline-size|block-size|transform|translate|scale|rotate|top|right|bottom|left|inset.*|position|display|float|font|font-(size|weight|family|stretch|variation-settings)|letter-spacing|word-spacing|line-height|gap|row-gap|column-gap|flex.*|grid.*|zoom|content|outline-offset)$/;
  const hoverMoves = [...hvCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(":hover")).flatMap((m) => m[2].split(";").map((d) => d.split(":")[0].trim().toLowerCase()).filter((p) => p && MOVES.test(p) && !(p === "transform" && m[1].includes("::"))).map((p) => `${m[1].trim().slice(-70)} -> ${p}`));
  const hoverRules = [...hvCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(":hover")).length;
  const ringOutside = /:is\(\.card,[^)]*\)::before \{[^}]*inset: -1px/.test(hvCss);
  const scrollingCardsBare = /#usage \.card:has\(> \.table\)::before \{ content: none; \}/.test(hvCss) && /\.card:has\(> \.table\) \{ overflow-x: auto; \}/.test(read(join(PAGE, "style.css")));
  check("design: in Hypervibe, a hover changes no border, padding, margin, size, place or font, and a card that scrolls has no edge outside its box", hoverRules >= 20 && !hoverMoves.length && (!ringOutside || scrollingCardsBare), JSON.stringify({ hoverRules, hoverMoves: hoverMoves.slice(0, 8), ringOutside, scrollingCardsBare }));
  const index = read(join(PAGE, "index.html"));
  await layoutChecks(PAGE, load);
  check("design: the switch is in the filters box, with both designs, and the design is set before the first paint", /data-theme-choice="night"/.test(index) && /data-theme-choice="hypervibe"/.test(index) && index.indexOf("theme-early.js") < index.indexOf("</head>"), "");

  // The dictionaries: the same keys in the two languages, and no plural between brackets.
  const en = (await load("i18n/en.js")).default;
  const fr = (await load("i18n/fr.js")).default;
  const missing = Object.keys(en).filter((k) => !(k in fr));
  check("the page's dictionaries have the same keys in both languages", !missing.length && Object.keys(fr).every((k) => k in en), missing.join(", "));
  // (2026-11-27) The switch and the legend say the ground of each design: the night blue for the night, its own warm black for Hypervibe.
  const saysBlue = /night blue|bleu nuit/i;
  const ofHypervibe = (/** @type {string} */ text) => text.slice(text.search(/Hypervibe (lays|pose)/));
  check("design: the switch and the legend no longer say that Hypervibe stands on the night blue", !saysBlue.test(en.designHypervibeTip + fr.designHypervibeTip) && /warm black/.test(en.designHypervibeTip) && /noir chaud/.test(fr.designHypervibeTip) && saysBlue.test(en.designNightTip) && saysBlue.test(fr.designNightTip) && !saysBlue.test(ofHypervibe(en.legendDesignText)) && !saysBlue.test(ofHypervibe(fr.legendDesignText)) && /rgb\(26,20,16\)/.test(read(join(PAGE, "legend.js"))), "");
  /** @param {Record<string, any>} dict */
  const outputs = (dict) => Object.entries(dict).flatMap(([k, f]) => {
    if (typeof f !== "function") return [[k, String(f)]];
    return [1, 2, 3].flatMap((n) => { try { return [[k, String(JSON.stringify(f(n, n, n, n, n, n)) ?? "")]]; } catch { return []; } });
  });
  const brackets = [...outputs(en), ...outputs(fr)].filter(([, s]) => /\w\(s\)/.test(s));
  check("E2: no plural between brackets, in either language", !brackets.length, brackets.slice(0, 5).map(([k, s]) => `${k}: ${s}`).join(" | "));
  const tokens = outputs(fr).filter(([k, s]) => /\btokens?\b/i.test(s.replace(/<[^>]+>/g, "")) && k !== "tokensWords");
  check("E10: \"jetons\" everywhere in French", !tokens.length, tokens.slice(0, 5).map(([k, s]) => `${k}: ${s}`).join(" | "));
  (await load("lang.js")).setLanguage("fr");
  check("E10: an amount of tokens is rounded (about 158 000)", /158\s000 jetons/.test(fr.todayCalls(3, 1, 157957)), fr.todayCalls(3, 1, 157957));
  check("E2: French agrees with the number", fr.countCreated(1) === "1 fiche créée" && fr.countCreated(2) === "2 fiches créées" && fr.runsThisWeek(1) === "1 passage cette semaine");
  check("E15: the app is called Second Brain, the clock beats at the half hour", !/Brain en direct|Brain live/.test(fr.installTip + en.installTip) && !/15 minutes/.test(fr.legendNextRunText + en.legendNextRunText));
  const dashes = [...outputs(en), ...outputs(fr)].filter(([, s]) => /[–—]/.test(s));
  check("no long dash in any text of the page", !dashes.length, dashes.slice(0, 3).map(([k]) => k).join(", "));
  // The server's dictionaries.
  const sen = (await import(pathToFileURL(join(REPO, "live", "i18n", "en.mjs")).href)).default;
  const sfr = (await import(pathToFileURL(join(REPO, "live", "i18n", "fr.mjs")).href)).default;
  check("E1: the reason of a catch-up does not say \"rattrapage\" again", !/rattrapage/i.test(sfr.catchingUp(149, 199, 5)) && sfr.catchingUp(149, 199, 5) === "149 éléments restants sur 199, 5 par passage", sfr.catchingUp(149, 199, 5));
  check("the server's dictionaries no longer word a private note", !("notePrivate" in sen) && !("notePrivate" in sfr) && !("privateBody" in en) && !("privateBody" in fr));
  const sBrackets = [...outputs(sen), ...outputs(sfr)].filter(([, s]) => /\w\(s\)/.test(s));
  check("E2: no plural between brackets in the server's words", !sBrackets.length, sBrackets.slice(0, 5).map(([k, s]) => `${k}: ${s}`).join(" | "));
}

/**
 * (2026-11-24) Two faults seen in both designs. A judge's card with nothing in
 * the period said so one word per line (its paragraph sat in the 38 pixels of
 * the chart's axis). And on a window 800 pixels high, the open activity panel
 * pushed the settings button onto the filters box: layout.js now places the
 * fixed panels together. Its numbers are checked here against fake panels,
 * the sizes the browser measured on the throwaway brain.
 * @param {string} PAGE the copy of the page
 * @param {(f: string) => Promise<any>} load
 */
async function layoutChecks(PAGE, load) {
  const css = read(join(PAGE, "style.css"));
  const usageJs = read(join(PAGE, "usage.js"));
  check("a chart with nothing to draw says so across its width, not in its axis's column", /\.chart \{ display: grid; grid-template-columns: 38px 1fr;/.test(css) && /\.chart > \.usage-empty \{ grid-column: 1 \/ -1; \}/.test(css) && /el\.innerHTML = `<p class="usage-empty">/.test(usageJs) && !/usage-empty[^{]*\{[^}]*grid-column/.test(read(join(PAGE, "theme-hypervibe.css"))));

  // The fakes: a panel is a box (top, left, height, width), its content height, and its classes.
  /** @param {string} id @param {{ top?: number, left?: number, height?: number, width?: number, content?: number, frame?: number, hidden?: boolean, classes?: string[] }} o */
  const panel = (id, o = {}) => {
    const classes = new Set(o.classes ?? []);
    const el = {
      id, hidden: !!o.hidden, o,
      classList: { contains: (c) => classes.has(c), toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); return on; } },
      get offsetHeight() { return o.height ?? 0; },
      get clientHeight() { return (o.height ?? 0) - (o.frame ?? 0); },
      get scrollHeight() { return o.content ?? (o.height ?? 0) - (o.frame ?? 0); },
      getBoundingClientRect: () => { const top = o.top ?? 0, left = o.left ?? 0, height = o.height ?? 0, width = o.width ?? 0; return { top, left, height, width, bottom: top + height, right: left + width }; },
    };
    return el;
  };
  const props = new Map();
  /** @type {Record<string, any>} */
  let panels = {};
  let narrow = false;
  globalThis.matchMedia = () => ({ get matches() { return narrow; }, addEventListener() {} });
  globalThis.getComputedStyle = (el) => ({ display: el.hidden ? "none" : "block" });
  globalThis.document = /** @type {any} */ ({
    body: { classList: { contains: () => false } },
    documentElement: { style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) } },
    querySelector: (s) => panels[s],
  });
  const px = (k) => (props.has(k) ? Number.parseFloat(props.get(k)) : null);
  try {
    const { arrangePanels } = await load("layout.js");
    const wide = (H, activityTop) => {
      narrow = false;
      globalThis.innerWidth = 1280;
      globalThis.innerHeight = H;
      props.clear();
      panels = {
        "#activity": panel("activity", { top: activityTop, left: 10, width: 320, height: H - 10 - activityTop }),
        "#open-settings": panel("open-settings", { height: 40, width: 40, left: 11 }),
        "#filters": panel("filters", { top: 53, left: 10, width: 228, height: 420, frame: 2 }),
        "#filters-head": panel("filters-head", { height: 28 }),
        "#filters-body": panel("filters-body", { height: 390, content: 390 }),
        "#alerts": panel("alerts", { hidden: true }), "#build": panel("build", { hidden: true }), "#welcome": panel("welcome", { hidden: true }), "#floors": panel("floors", { hidden: true }),
        "#views-row": panel("views-row", { top: 10, height: 37 }), ".search": panel("search", { top: 10, height: 32 }), "#open-index": panel("open-index", { top: 10, height: 34 }), "#install": panel("install", { hidden: true }),
      };
      arrangePanels();
    };
    // 1280 x 800, the activity panel open (46vh, from 422 to 790): the settings
    // button stands from 372 to 412, and the filters box ends 10 px above it,
    // its body scrolling. On 1920 x 1200 nothing is asked of the filters.
    wide(800, 422);
    const wheelTop = 800 - (px("--settings-bottom") ?? 0) - 40;
    const filtersBottom = 53 + (px("--filters-max") ?? 420);
    check("an 800 px high window, the activity panel open: the settings button no longer covers the filters box, which scrolls", wheelTop === 372 && filtersBottom <= wheelTop - 10 && panels["#filters"].classList.contains("squeezed"), JSON.stringify(Object.fromEntries(props)));
    wide(1200, 638);
    check("a window high enough leaves the filters box as the stylesheet draws it", !props.has("--filters-max") && !panels["#filters"].classList.contains("squeezed") && px("--settings-bottom") === 1200 - 638 + 10, JSON.stringify(Object.fromEntries(props)));

    // 375 x 600, the activity panel open (30vh): the two notices and the
    // welcome stack up from the settings button, under the filters, none over another.
    narrow = true;
    globalThis.innerWidth = 375;
    globalThis.innerHeight = 600;
    props.clear();
    panels = {
      "#activity": panel("activity", { top: 410, left: 10, width: 301, height: 180 }),
      "#open-settings": panel("open-settings", { height: 40, width: 40, left: 11 }),
      "#filters": panel("filters", { top: 94, left: 10, width: 355, height: 420, frame: 2 }),
      "#filters-head": panel("filters-head", { height: 28 }),
      "#filters-body": panel("filters-body", { height: 390, content: 390 }),
      "#alerts": panel("alerts", { height: 220, content: 220 }), "#build": panel("build", { height: 300, content: 298, frame: 2 }), "#welcome": panel("welcome", { height: 110, content: 110 }), "#floors": panel("floors", { hidden: true }),
    };
    arrangePanels();
    const box = (id) => {
      const bottom = 600 - (px(`--${id}-bottom`) ?? 0);
      const height = Math.min(panels[`#${id}`].o.height, px(`--${id}-max`) ?? Infinity);
      return [bottom - height, bottom];
    };
    const column = [[94, 94 + (px("--filters-max") ?? 420)], box("welcome"), box("build"), box("alerts"), [600 - (px("--settings-bottom") ?? 0) - 40, 600 - (px("--settings-bottom") ?? 0)], [410, 590]];
    const apart = column.every(([t, b], i) => b > t && (i === 0 || column[i - 1][1] <= t));
    check("a 375 x 600 window: filters, welcome, building, notices, settings button and activity panel one under the other, none over another", apart, JSON.stringify(column));
  } finally {
    for (const k of ["document", "matchMedia", "getComputedStyle", "innerWidth", "innerHeight"]) delete globalThis[k];
  }
}

try {
  await main();
} catch (e) {
  check("the checks ran to their end", false, e?.stack ?? e);
} finally {
  server?.kill();
  await sleep(300);
  if (!KEEP) rmSync(BASE, { recursive: true, force: true, maxRetries: 5 });
  else console.log(`  (kept: ${BASE})`);
}
console.log(`\n${total - failures} ok, ${failures} FAIL`);
process.exit(failures ? 1 : 0);
