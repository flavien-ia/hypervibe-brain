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
  const page = await ask("/", { noToken: true });
  const cookie = String(page.headers.get("set-cookie") ?? "");
  check("audit 3: the page comes with its token in a cookie no script reads and no other site sends", page.status === 200 && cookie.includes(token) && /HttpOnly/i.test(cookie) && /SameSite=Strict/i.test(cookie), cookie);
  check("audit 2: no answer may be framed, nor taken for another type", page.headers.get("x-frame-options") === "DENY" && /frame-ancestors 'none'/.test(page.headers.get("content-security-policy") ?? "") && page.headers.get("x-content-type-options") === "nosniff");
  const ping = await ask("/api/ping", { noToken: true });
  check("audit 3: the ping answers without the token (it says nothing of the brain)", ping.status === 200);
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
  /** @type {[key: string, value: string][]} what the page asked this browser to remember */
  const remembered = [];
  globalThis.localStorage = { getItem: () => null, setItem(key, value) { remembered.push([key, value]); }, removeItem() {} };
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

  // ONE DESIGN, THREE GROUNDS (2026-11-27). The page had two designs chosen
  // by a switch (2026-11-23); it has one now, the design system of Hypervibe,
  // and what is chosen (in the settings) is the ground it stands on: a pure
  // black, the night blue the view was born in, the night of the design
  // system (`#1A1410`, the default). A surface is never a colour of its own:
  // it is the chosen ground under the veil of cream. The contrasts are worked
  // out here for the three grounds.
  const theme = await load("theme.js");
  const st = await load("state.js");
  const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const hexOf = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  const lum = (hex) => {
    const [r, g, b] = channels(hex).map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const HV_INK = "#1A1410";
  const HV_CREAM = "#FAF8F5";
  const HV_GREY = "#A39A90";
  /** The three grounds, as the request named them; theme.js and the stylesheet must both say the same. */
  const GROUNDS = { black: "#000000", blue: "#0b0c18", hypervibe: "#1A1410" };
  const BLUE_HEART = "#1c1d36";
  /** A ground under one veil of cream after another (0.06 a surface, 0.2 a border), as a colour. @param {string} ground @param {...number} veils */
  const under = (ground, ...veils) => hexOf(veils.reduce((from, veil) => from.map((v, i) => v + (channels(HV_CREAM)[i] - v) * veil), channels(ground)));
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
  const sameGrounds = JSON.stringify(Object.keys(theme.GROUNDS)) === JSON.stringify(Object.keys(GROUNDS)) && Object.entries(GROUNDS).every(([name, color]) => same(theme.GROUNDS[name].color, color)) && same(theme.GROUNDS.blue.heart, BLUE_HEART) && theme.GROUNDS.black.heart === null && theme.GROUNDS.hypervibe.heart === null;
  check("design: one design, on the night of its design system unless another ground is chosen; the modules read its colours under their usual names", theme.groundName() === "hypervibe" && theme.DEFAULT_GROUND === "hypervibe" && sameGrounds && same(theme.colors.metaColor, GROUNDS.hypervibe) && st.SELECTION === "#FFE500" && st.VIVID[0] === "#FF6040" && st.SECTORS.source?.color === "#00C896" && st.SECTORS.base?.color === "#A783F6" && !("setTheme" in theme) && !("THEMES" in theme) && !("recolor" in theme), JSON.stringify({ ground: theme.groundName(), sameGrounds, grounds: theme.GROUNDS, selection: st.SELECTION }));
  theme.seedColors("domain", ["#4aa3ff", "#e0559b", "#ffc53d", "#3ee0c5", "#9b8cff", "#ff9f43", "#7ee36b", "#ff5a5f"]);
  const swatchesOf = () => ["#4aa3ff", "#e0559b", "#ffc53d", "#3ee0c5", "#9b8cff", "#ff9f43", "#7ee36b", "#ff5a5f"].map((c) => theme.dataColor(c, "domain"));
  const swatches = swatchesOf();
  const hvTokens = new Set(["#FF6040", "#FFE500", "#00C896", "#4B7BFF", "#8B5CF6", "#FF4D6D", "#FE866D", "#FEEA3D", "#3FD4AE", "#779AFD", "#A783F6", "#FE788F"]);
  // On each ground: the texts on the ground and on a surface (4.5:1), the grey of the night under one veil more too;
  // the colours of the domains on the ground and on a surface (3:1); a panel apart from the ground it lies on, by its
  // surface and by its border of cream at 20 % (the pure black is where it matters); the map painted in that ground.
  /** @type {string[]} */
  const weak = [];
  /** @type {string[]} */
  const dim = [];
  /** @type {string[]} */
  const lost = [];
  /** @type {string[]} */
  const mispainted = [];
  /** @type {Record<string, any>} */
  const measured = {};
  let heard = 0;
  theme.onGroundChange(() => heard++);
  for (const [name, ground] of Object.entries(GROUNDS)) {
    theme.setGround(name, { keep: false });
    const surface = under(ground, 0.06);
    const texts = { cream: theme.colors.bubbleName, grey: theme.colors.bubbleCount, toolName: theme.colors.toolName, toolNameOff: theme.colors.toolNameOff, harnessName: theme.colors.harnessName, selectionText: theme.colors.selectionText, ...Object.fromEntries(["#FF6040", "#FFE500", "#00C896", "#4B7BFF", "#8B5CF6", "#FF4D6D"].map((v) => [`ink of ${v}`, theme.inkOf(v)])) };
    for (const [k, c] of Object.entries(texts)) for (const [where, laid] of [["ground", ground], ["surface", surface]]) if (ratio(c, laid) < 4.5) weak.push(`${name}: ${k} ${c} on its ${where} ${laid}: ${ratio(c, laid).toFixed(2)}`);
    if (ratio(HV_GREY, under(ground, 0.06, 0.06)) < 4.5) weak.push(`${name}: the grey under one veil over a surface: ${ratio(HV_GREY, under(ground, 0.06, 0.06)).toFixed(2)}`);
    for (const c of hvTokens) for (const [where, laid] of [["ground", ground], ["surface", surface]]) if (ratio(c, laid) < 3) dim.push(`${name}: ${c} on its ${where}: ${ratio(c, laid).toFixed(2)}`);
    const apart = { surface: ratio(surface, ground), border: ratio(under(ground, 0.2), ground), borderOfPanel: ratio(under(ground, 0.06, 0.2), surface) };
    if (apart.surface < 1.08 || apart.border < 1.5 || apart.borderOfPanel < 1.5) lost.push(`${name}: ${JSON.stringify(apart)}`);
    const [r, g, b] = channels(ground);
    const surfaceAt = (alpha) => `rgba(${channels(ground).map((v, i) => Math.round(v + (channels(HV_CREAM)[i] - v) * 0.06)).join(",")},${alpha})`;
    const painted = theme.groundName() === name && same(theme.colors.disc, ground) && same(theme.colors.guardEdge, ground) && same(theme.colors.metaColor, ground) && theme.colors.textEdge === `rgba(${r},${g},${b},0.8)` && theme.colors.veil === `rgba(${r},${g},${b},0.9)` && theme.colors.pill === surfaceAt(0.88) && theme.colors.plate === surfaceAt(0.84) && theme.colors.pillText === HV_INK && theme.colors.guardInk === HV_INK && st.SELECTION === "#FFE500" && swatchesOf().join() === swatches.join();
    // No blue of the first design is painted on another ground than the night blue.
    const blueLeft = name === "blue" ? [] : JSON.stringify(theme.colors).match(/0b0c18|15162a|10111f|1c1d36|11,\s*12,\s*24|17,\s*15,\s*36/gi) ?? [];
    if (!painted || blueLeft.length) mispainted.push(`${name}: ${JSON.stringify({ disc: theme.colors.disc, edge: theme.colors.textEdge, veil: theme.colors.veil, pill: theme.colors.pill, plate: theme.colors.plate, blueLeft })}`);
    measured[name] = { surface, cream: [ratio(HV_CREAM, ground), ratio(HV_CREAM, surface)].map((v) => v.toFixed(2)), grey: [ratio(HV_GREY, ground), ratio(HV_GREY, surface)].map((v) => v.toFixed(2)), apart: Object.fromEntries(Object.entries(apart).map(([k, v]) => [k, v.toFixed(2)])) };
  }
  check("grounds: the three surfaces are each ground under the veil of cream at 6 %, worked out, never written", measured.black.surface === "#0f0f0f" && measured.blue.surface === "#191a25" && measured.hypervibe.surface === "#27221e", JSON.stringify(measured));
  check("grounds: on the black, the night blue and the night of Hypervibe, every text reads on the ground and on a surface (4.5:1), the grey under one veil more too", !weak.length, JSON.stringify({ weak, measured }));
  check("grounds: eight domains stay eight colours of the design system whatever the ground, and each of its colours is seen on the three grounds and on their surfaces (3:1)", new Set(swatches).size === 8 && swatches.every((c) => hvTokens.has(c)) && !dim.length && theme.dataColor("#9aa0b8", "domain") === HV_GREY, `${swatches.join(" ")} ${JSON.stringify(dim)}`);
  check("grounds: a panel stays apart from each ground, the pure black too, by its surface (1.08:1 at least) and by its border of cream (1.5:1 at least)", !lost.length, JSON.stringify({ lost, measured }));
  check("grounds: the map is painted in the chosen ground (the disc of a tool, the edge of a text, the veil, the edge of a guard, the window's bar; a pill and a plate as its surfaces), and each listener is told", !mispainted.length && heard === 3, JSON.stringify({ mispainted, heard }));
  // Showing a ground remembers nothing unless asked; choosing one is kept under the page's own key; a name that is no ground (the design of before) changes nothing.
  const keptBefore = remembered.length;
  theme.setGround("night");
  theme.setGround("hypervibe", { keep: false });
  const quiet = remembered.length === keptBefore && theme.groundName() === "hypervibe";
  theme.setGround("black");
  const kept = remembered.at(-1)?.join("=") === "brain-live:ground=black" && theme.groundName() === "black";
  theme.setGround("hypervibe", { keep: false });
  check("grounds: a chosen ground is remembered under brain-live:ground, a ground only shown is not, and a name that is no ground changes nothing", quiet && kept && theme.groundName() === "hypervibe" && same(theme.colors.disc, GROUNDS.hypervibe), JSON.stringify({ quiet, kept, last: remembered.at(-1) }));
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
  // The stylesheet stays a layer over base.css and style.css: each of its rules is written under the root's attribute, which gives it its weight; the markup of the three pages carries that attribute, and no script of the page sets it or takes it away any more.
  const pageSources = ["index.html", "history.html", "legend.html"].map((f) => read(join(PAGE, f)));
  const scripts = ["theme.js", "theme-early.js", "icones-hypervibe.js", "main.js", "storage.js"].map((f) => read(join(PAGE, f))).join("\n");
  const alwaysOn = pageSources.every((html) => /<html lang="en" data-theme="hypervibe">/.test(html)) && !/dataset\.theme|data-theme/.test(scripts);
  check("design: every rule of the design's stylesheet is written under the root's attribute, which the markup of the three pages carries and no script changes", hvCss.length > 2000 && !loose.length && alwaysOn, JSON.stringify({ loose: loose.slice(0, 5), alwaysOn }));
  // (2026-11-27) The grounds: the stylesheet names the three once each (and the heart of the night blue), as theme.js does; --bg is the one in use, the night of the design system unless the root says another; it is under the page and the full pages, the map (a little lighter at its heart), a field and the disc of a tool. A surface is --bg under the veil of cream at 6 %, mixed by the browser, and the panels of the map are that surface (--panel): no surface is written for a ground.
  const cssVar = (css, name) => new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  const groundRules = [...hvCss.matchAll(/([^{}]*\[data-ground="[a-z]+"\][^{}]*)\{([^{}]*)\}/g)].map((m) => `${m[1].trim()} { ${m[2].trim()} }`);
  const grounds = {
    named: same(cssVar(hvCss, "--ground-black"), theme.GROUNDS.black.color) && same(cssVar(hvCss, "--ground-blue"), theme.GROUNDS.blue.color) && same(cssVar(hvCss, "--ground-blue-heart"), theme.GROUNDS.blue.heart) && same(cssVar(hvCss, "--ground-hypervibe"), theme.GROUNDS.hypervibe.color),
    byDefault: cssVar(hvCss, "--bg") === "var(--ground-hypervibe)" && cssVar(hvCss, "--hv-heart") === "var(--hv-surface)",
    chosen: groundRules.length === 2 && groundRules[0] === ':root[data-theme="hypervibe"][data-ground="black"] { --bg: var(--ground-black); }' && groundRules[1] === ':root[data-theme="hypervibe"][data-ground="blue"] { --bg: var(--ground-blue); --hv-heart: var(--ground-blue-heart); }',
    veil: cssVar(hvCss, "--hv-veil") === "rgba(250, 248, 245, 0.06)" && cssVar(hvCss, "--hv-cream") === HV_CREAM,
    surface: cssVar(hvCss, "--hv-surface") === "color-mix(in srgb, var(--hv-cream) 6%, var(--bg))" && cssVar(hvCss, "--hv-raised") === "color-mix(in srgb, var(--hv-cream) 12%, var(--bg))",
    panel: /^color-mix\(in srgb, var\(--hv-surface\) \d+%, transparent\)$/.test(cssVar(hvCss, "--hv-panel") ?? "") && /^color-mix\(in srgb, var\(--hv-surface\) \d+%, transparent\)$/.test(cssVar(hvCss, "--hv-card") ?? "") && cssVar(hvCss, "--panel") === "var(--hv-panel)" && cssVar(hvCss, "--hv-modal") === "var(--hv-surface)",
    fieldAndDisc: cssVar(hvCss, "--hv-field") === "var(--bg)" && cssVar(hvCss, "--hv-disc") === "var(--bg)",
    map: /:root\[data-theme="hypervibe"\] #scene \{ background: radial-gradient\(ellipse at 50% 45%, var\(--hv-heart\) 0%, var\(--bg\) 70%\); \}/.test(hvCss),
    card: /:root\[data-theme="hypervibe"\] #panel \{[^}]*background: var\(--hv-card\)/.test(hvCss),
    behind: /\.modal-backdrop \{ background: color-mix\(in srgb, var\(--bg\) 60%, transparent\); \}/.test(hvCss) && /#piece-ring \{ --ring-edge: color-mix\(in srgb, var\(--bg\) 90%, transparent\); \}/.test(hvCss) && /\.history-page \{ background: var\(--bg\);/.test(hvCss),
    // The sheets under it give the page no colour of their own any more: base.css names none of the variables the design gives.
    base: !/--bg:|--panel:|--text:/.test(read(join(PAGE, "base.css"))),
  };
  // Nothing written for a ground but its own colour: outside the icons drawn in the fields (data:), every colour written in full is a token of the design system, one of the grounds (each written once) or the black of a mask, and no dark colour is written as rgb().
  const written = hvCss.replace(/url\("data:[^"]*"\)/g, "");
  const GROUND_COLORS = [...Object.values(GROUNDS), BLUE_HEART].map((c) => c.toLowerCase());
  const HV_TOKENS = new Set([...GROUND_COLORS, HV_CREAM, HV_GREY, "#FF6040", "#FE866D", "#FFE500", "#FEEA3D", "#00C896", "#3FD4AE", "#4B7BFF", "#779AFD", "#8B5CF6", "#A783F6", "#FF4D6D", "#000"].map((c) => c.toLowerCase()));
  const strangers = [...new Set([...written.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0].toLowerCase()))].filter((c) => !HV_TOKENS.has(c));
  const darks = [...new Set([...written.matchAll(/rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)/g)].filter((m) => Math.max(Number(m[1]), Number(m[2]), Number(m[3])) < 120).map((m) => `${m[1]},${m[2]},${m[3]}`))].filter((c) => c !== "0,0,0");
  const twice = GROUND_COLORS.filter((c) => written.toLowerCase().split(c).length !== 2);
  check("grounds: the stylesheet names the three grounds as theme.js does, --bg carries the chosen one (the page, the map, the full pages, a field, the disc of a tool), every surface is mixed from --bg and the cream, and no colour is written for a ground but its own, once", Object.values(grounds).every(Boolean) && !strangers.length && !darks.length && !twice.length, JSON.stringify({ grounds, groundRules, strangers, darks, twice }));
  // The grey of the night, on what the stylesheet lays over a surface: one veil more (a control in a panel, a pill in the card) leaves it above 4.5:1 on the three grounds; on the night of Hypervibe the hollow would not, so a group of the filters has no veil of its own, and a pill of the card takes the veil.
  const greyOn = Object.fromEntries(Object.entries(GROUNDS).map(([name, ground]) => [name, { surface: ratio(HV_GREY, under(ground, 0.06)), veilOnSurface: ratio(HV_GREY, under(ground, 0.06, 0.06)), hollowOnSurface: ratio(HV_GREY, under(ground, 0.06, 0.12)) }]));
  const flat = /:root\[data-theme="hypervibe"\] \.filter-group \{[^}]*background: none; \}/.test(hvCss) && /:root\[data-theme="hypervibe"\] #panel \.tag \{[^}]*background: var\(--hv-veil\);/.test(hvCss) && /:root\[data-theme="hypervibe"\] \.notice\.warn \.say,\s*:root\[data-theme="hypervibe"\] \.held-box small \{ color: var\(--hv-cream\); \}/.test(hvCss);
  check("grounds: the grey of the night stays above 4.5:1 on a surface and under one veil more on the three grounds, and nothing lays a second veil or the hollow under it", Object.values(greyOn).every((g) => g.surface >= 4.5 && g.veilOnSurface >= 4.5) && greyOn.hypervibe.hollowOnSurface < 4.5 && flat, JSON.stringify({ greyOn, flat }));
  // The ground is set before the first paint, on the three pages: theme-early.js, run here as the browser runs it, against what a browser may remember (a ground, the design of before, nothing, no local storage at all), then told of a ground chosen in another window.
  const early = read(join(PAGE, "theme-early.js"));
  /** @param {string | null | Error} kept what the browser remembers under the page's key @returns {{ ground: string | undefined, hear: (value: string | null) => string | undefined }} */
  const earlyOn = (kept) => {
    /** @type {{ dataset: Record<string, string> }} */
    const root = { dataset: {} };
    /** @type {((ev: { key: string, newValue: string | null }) => void)[]} */
    const heard = [];
    const storage = { getItem: (/** @type {string} */ key) => { if (kept instanceof Error) throw kept; return key === "brain-live:ground" ? kept : "night"; } };
    new Function("document", "localStorage", "addEventListener", early)({ documentElement: root }, storage, (/** @type {string} */ type, /** @type {any} */ fn) => { if (type === "storage") heard.push(fn); });
    return { ground: root.dataset.ground, hear: (value) => { for (const fn of heard) fn({ key: "brain-live:ground", newValue: value }); return root.dataset.ground; } };
  };
  const earlyGrounds = [["black", "black"], ["blue", "blue"], ["hypervibe", "hypervibe"], ["night", "hypervibe"], [null, "hypervibe"], [new Error("no local storage"), "hypervibe"]].filter(([kept, want]) => earlyOn(kept).ground !== want).map(([kept]) => String(kept));
  const elsewhere = earlyOn(null).hear("blue") === "blue" && earlyOn("black").hear(null) === "hypervibe";
  check("grounds: the ground a browser remembers is on the root before the first paint (the default for the design of before, for nothing, without local storage), and a ground chosen in another window is followed", !earlyGrounds.length && elsewhere && /"brain-live:ground"/.test(early) && !/brain-live:theme/.test(early), JSON.stringify({ earlyGrounds, elsewhere }));
  // The rainbow band: at the very top of every page, thick enough to be seen, above a dialog; the pages without the map carry the stylesheet and its early script.
  const band = /:root\[data-theme="hypervibe"\] body::before \{([^}]*)\}/.exec(hvCss)?.[1] ?? "";
  const pagesDressed = pageSources.every((html) => html.includes("theme-hypervibe.css") && html.indexOf("theme-early.js") < html.indexOf("</head>") && html.indexOf("theme-hypervibe.css") > html.indexOf("base.css"));
  check("design: the rainbow band is at the top of every page of the view, 5 px high, above everything", /position: fixed/.test(band) && /top: 0/.test(band) && /height: 5px/.test(band) && Number(/z-index: (\d+)/.exec(band)?.[1]) > 50 && /--hv-rainbow/.test(band) && pagesDressed, band);
  // The icons of the design system: Phosphor duotone on 256, filled; every icon the module puts in has its paths.
  const icons = await load("icones-hypervibe.js");
  const iconSrc = read(join(PAGE, "icones-hypervibe.js"));
  const named = [...iconSrc.matchAll(/\["[^"]*[^a-z"][^"]*", "([a-z]+)"\]/g), ...iconSrc.matchAll(/"[^"]": "([a-z]+)"/g), ...iconSrc.matchAll(/\["([a-z]+)", "[^"]+"\]/g)].map((m) => m[1]);
  const legendIcons = [...read(join(PAGE, "legend.js")).matchAll(/AS_ICONS = \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/: "([a-z]+)"/g)].map((x) => x[1]));
  const absent = [...new Set([...named, ...legendIcons])].filter((n) => !icons.PICTOS[n]);
  const svg = icons.iconSvg("reglages", { size: 20 });
  const wellFormed = Object.values(icons.PICTOS).every((p) => /^M[\d.,\-\sA-Za-z]+Z$/.test(p.trait) && (p.fond === null || /^M[\d.,\-\sA-Za-z]+Z$/.test(p.fond)));
  check("design: the icons of Hypervibe are those of its design system (Phosphor duotone, filled on 256), each one the page asks for is there", named.length >= 15 && legendIcons.length >= 5 && !absent.length && wellFormed && /viewBox="0 0 256 256"/.test(svg) && /fill="currentColor"/.test(svg) && /opacity="0.2"/.test(svg) && !/stroke=/.test(svg), JSON.stringify({ absent, named: named.length, legendIcons }));
  // (2026-11-27) One design: the module dresses every page it is started on, and has nothing left that took its icons away; the icon the markup draws is hidden beside the one of the design system.
  check("design: the icons module no longer waits for a design nor undoes its work, and the drawn icon it replaces is hidden", !/undress|hv-night-icon|const on = /.test(iconSrc) && /drawn\.classList\.add\("hv-replaced"\)/.test(iconSrc) && /\.hv-replaced,\s*:root\[data-theme="hypervibe"\] \.hv-glyph-text \{ display: none !important; \}/.test(hvCss), "");
  // (2026-11-24) The fonts are carried by the view: each url() of the stylesheet is a woff2 of page/fonts/, with its licence; the server gives them their type; the sheets under it load none.
  // (2026-11-24) The other url() are icons of the design system drawn inside a field, written in the stylesheet itself (data:, an SVG): nothing from the network either.
  const allUrls = [...hvCss.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1]);
  const urls = allUrls.filter((u) => !u.startsWith("data:"));
  const inline = allUrls.filter((u) => u.startsWith("data:"));
  const fontsHere = urls.length === 4 && urls.every((u) => /^fonts\/[a-z0-9-]+\.woff2$/.test(u) && existsSync(join(PAGE, u))) && existsSync(join(PAGE, "fonts", "LICENSE.md")) && existsSync(join(PAGE, "fonts", "LICENSE-Geist.txt")) && inline.every((u) => u.startsWith("data:image/svg+xml,") && !/https?:%2F%2F|https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(u));
  const typed = /"\.woff2": "font\/woff2"/.test(read(join(REPO, "live", "server.mjs")));
  const otherFonts = /@font-face|url\(/.test(read(join(PAGE, "style.css")) + read(join(PAGE, "base.css")));
  check("design: the fonts of the design are in the view, with their licences and their type, and no other sheet loads any", fontsHere && typed && !otherFonts, JSON.stringify({ urls, typed, otherFonts }));
  // (2026-11-24) A hover never moves anything: in the design of the page, a rule under :hover changes colours, a
  // background, a shadow, an outline, an opacity, never a border's width, a padding, a margin, a size, a place or a
  // font (cards were seen to grow and scroll bars to come under the pointer). And a card that scrolls (a card that holds
  // a table) draws no edge 1 px outside its box, which made it scroll both ways. (A transform of a pseudo-element
  // is let through: the rainbow that passes under the yellow button, clipped by it, moves nothing.)
  const MOVES = /^(border(-(top|right|bottom|left))?(-(width|style))?|border-(block|inline).*|padding.*|margin.*|width|height|(min|max)-(width|height)|inline-size|block-size|transform|translate|scale|rotate|top|right|bottom|left|inset.*|position|display|float|font|font-(size|weight|family|stretch|variation-settings)|letter-spacing|word-spacing|line-height|gap|row-gap|column-gap|flex.*|grid.*|zoom|content|outline-offset)$/;
  const hoverMoves = [...hvCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(":hover")).flatMap((m) => m[2].split(";").map((d) => d.split(":")[0].trim().toLowerCase()).filter((p) => p && MOVES.test(p) && !(p === "transform" && m[1].includes("::"))).map((p) => `${m[1].trim().slice(-70)} -> ${p}`));
  const hoverRules = [...hvCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter((m) => m[1].includes(":hover")).length;
  const ringOutside = /:is\(\.card,[^)]*\)::before \{[^}]*inset: -1px/.test(hvCss);
  const scrollingCardsBare = /#usage \.card:has\(> \.table\)::before \{ content: none; \}/.test(hvCss) && /\.card:has\(> \.table\) \{ overflow-x: auto; \}/.test(read(join(PAGE, "style.css")));
  check("design: a hover changes no border, padding, margin, size, place or font, and a card that scrolls has no edge outside its box", hoverRules >= 20 && !hoverMoves.length && (!ringOutside || scrollingCardsBare), JSON.stringify({ hoverRules, hoverMoves: hoverMoves.slice(0, 8), ringOutside, scrollingCardsBare }));
  const index = read(join(PAGE, "index.html"));
  await layoutChecks(PAGE, load);
  // (2026-11-27) The switch of the design is gone from the filters box, with its rules and its storage key; the ground is chosen in the settings, under Appearance: three options of one radio group, each with its dot, its name and its tooltip, a help beside the name of the setting.
  const settingsSection = index.slice(index.indexOf('<section id="settings"'), index.indexOf("</section>", index.indexOf('<section id="settings"')));
  const filtersSection = index.slice(index.indexOf('<section id="filters"'), index.indexOf("</section>", index.indexOf('<section id="filters"')));
  const options = [...settingsSection.matchAll(/<button type="button" role="radio" data-ground-choice="([a-z]+)"[^>]*data-i18n-tip="([A-Za-z]+)"[^>]*><span class="ground-dot" aria-hidden="true"><\/span><span data-i18n="([A-Za-z]+)">/g)].map((m) => m.slice(1, 4).join(":"));
  const choice = {
    options: options.join() === "black:groundBlackTip:groundBlack,blue:groundBlueTip:groundBlue,hypervibe:groundHypervibeTip:groundHypervibe",
    group: /<div class="setting-card" id="settings-appearance">\s*<h3 data-i18n="appearance">/.test(settingsSection) && /class="ground-choice" role="radiogroup" data-i18n-label="groundLabel"/.test(settingsSection) && /data-i18n="groundTitle"[^\n]*class="help-mark" tabindex="0" data-i18n-tip="groundTip"/.test(settingsSection),
    styled: /:is\(\.group, \.period-choices, \.model-choice, \.ground-choice,/.test(hvCss) && ["black", "blue", "hypervibe"].every((g) => hvCss.includes(`[data-ground-choice="${g}"] .ground-dot { background: var(--ground-${g}); }`)),
    noSwitch: !/data-theme-choice|design-row|design-choices|designTitle/.test(index + hvCss + read(join(PAGE, "style.css"))) && !/data-ground/.test(filtersSection),
    storage: /"ground"\} StorageKey/.test(read(join(PAGE, "storage.js"))) && !/"theme"\} StorageKey|\| "theme"/.test(read(join(PAGE, "storage.js"))),
  };
  check("grounds: the choice of the ground is in the settings (three options, each with its dot, its name and its tooltip), and no switch of the design is left in the page", Object.values(choice).every(Boolean), JSON.stringify({ choice, options }));

  // The dictionaries: the same keys in the two languages, and no plural between brackets.
  const en = (await load("i18n/en.js")).default;
  const fr = (await load("i18n/fr.js")).default;
  const missing = Object.keys(en).filter((k) => !(k in fr));
  check("the page's dictionaries have the same keys in both languages", !missing.length && Object.keys(fr).every((k) => k in en), missing.join(", "));
  // (2026-11-27) The words of the ground, in both languages: the name of the setting, its three choices as they were asked, a tooltip for the setting and for each choice; the legend says where it is chosen, and no longer tells of two designs (its item, its drawing and the words of the switch are gone).
  const groundKeys = ["appearance", "groundTitle", "groundLabel", "groundTip", "groundBlack", "groundBlackTip", "groundBlue", "groundBlueTip", "groundHypervibe", "groundHypervibeTip"];
  const worded = groundKeys.every((k) => typeof en[k] === "string" && en[k].trim() && typeof fr[k] === "string" && fr[k].trim());
  const namedAsAsked = fr.appearance === "Apparence" && fr.groundBlack === "Noir" && fr.groundBlue === "Bleu nuit" && fr.groundHypervibe === "Nuit Hypervibe" && en.groundBlack === "Black" && en.groundBlue === "Night blue" && en.groundHypervibe === "Hypervibe night";
  const formerWords = ["designTitle", "designLabel", "designNight", "designNightTip", "designHypervibe", "designHypervibeTip", "legendDesignTitle", "legendDesignText"].filter((k) => k in en || k in fr);
  const legendSrc = read(join(PAGE, "legend.js"));
  const legendFollows = /<b>Appearance<\/b>/.test(en.legendSettingsText) && /<b>Apparence<\/b>/.test(fr.legendSettingsText) && !/legendDesign|recolor|#15162a|#0b0c18|rgb\(11,12,24\)/i.test(legendSrc) && /fill="var\(--bg\)"/.test(legendSrc);
  check("grounds: the setting, its three choices and their tooltips are worded in both languages, the legend says where the ground is chosen and draws the disc of a tool in it, and the words of the two designs are gone", worded && namedAsAsked && !formerWords.length && legendFollows, JSON.stringify({ worded, namedAsAsked, formerWords, legendFollows }));
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
