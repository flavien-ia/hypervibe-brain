#!/usr/bin/env node
// banc.mjs - The whole journey of a brain through the plugin's scripts, in a
// throwaway folder, with a fake home (HVBRAIN_HOME), a fake embeddings API
// in its own process, and the evening routine only ever armed in --dry-run
// (the live view is turned on for real: its start is one file under the fake home).
// Nothing here touches the real ~/.claude, ~/.hypervibe-brain, a git remote, a
// scheduler or a paid API. To run after any change to the plugin.
//
//   node tests/banc.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");
const SCRIPTS = join(PLUGIN, "scripts");
// ---------------------------------------------------------------- the scenes
// The bench is one story: each scene starts from what the ones before left on
// the disk. A full run takes a quarter of an hour, which is long to check ten
// lines. So (2026-11-17) the run is cut into named scenes, and at the start of
// each one the state is kept (the bench's folder, about 5 MB, and the few
// values a later scene reads), in STORE:
//
//   node tests/banc.mjs                   everything
//   node tests/banc.mjs --list            the scenes, with how the last run went
//   node tests/banc.mjs --only <scene>    that scene alone, from the state kept at its start
//   node tests/banc.mjs --from <scene>    from that scene to the end
//   node tests/banc.mjs --failed          from the first scene that failed in the last run
//   (--keep leaves the bench's folder in place at the end, as before)
//
// A kept state is the one of the last run that went through that scene: after
// changing what an EARLIER scene does, run everything again. A state replayed
// an hour later is an hour older: a scene that reasons on elapsed time may
// answer differently. One bench at a time shares the store.
//
// The body of a scene is not indented under its "if": 2 300 lines would move,
// and the texts written over several lines with them.
const STORE = join(tmpdir(), "brain-banc-store");
const argOf = (flag) => (process.argv.includes(flag) ? process.argv[process.argv.indexOf(flag) + 1] : undefined);
const readStore = (f, d) => {
  try {
    return JSON.parse(readFileSync(join(STORE, f), "utf8"));
  } catch {
    return d;
  }
};
const LAST = readStore("last.json", { scenes: [] });
const SCENES = [...readFileSync(fileURLToPath(import.meta.url), "utf8").matchAll(/^ +if \(await scene\("([a-z-]+)"\)\) \{/gm)].map((x) => x[1]);
if (process.argv.includes("--list")) {
  for (const n of SCENES) {
    const s = LAST.scenes.find((x) => x.name === n);
    const how = s ? `${String(s.checks).padStart(3)} checks, ${String(s.seconds).padStart(4)} s${s.failed ? `, ${s.failed} FAILED` : ""}` : "not run yet";
    console.log(`  ${n.padEnd(18)} ${how}${existsSync(join(STORE, n, "vars.json")) ? "" : "  (no state kept)"}`);
  }
  process.exit(0);
}
const ONLY = argOf("--only");
const START = process.argv.includes("--failed") ? LAST.scenes.find((s) => s.failed)?.name : (ONLY ?? argOf("--from"));
if (process.argv.includes("--failed") && !START) {
  console.log("\nNo scene failed in the last run.\n");
  process.exit(0);
}
if (START && !SCENES.includes(START)) {
  console.error(`\nNo scene named ${START}. The scenes: ${SCENES.join(", ")}\n`);
  process.exit(2);
}
const KEPT_AT_START = START ? readStore(join(START, "vars.json"), null) : null;
if (START && !KEPT_AT_START) {
  console.error(`\nNo state kept for the scene ${START}: run the whole bench once (node tests/banc.mjs).\n`);
  process.exit(2);
}
// The folder the kept state was made in, when the run starts from one: the
// brain's path is written all over that state.
const BASE = KEPT_AT_START?.base ?? join(tmpdir(), `brain-banc-${process.pid}`);
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
mkdirSync(HOME, { recursive: true });
// A git configuration of its own: the bench neither reads nor needs the
// person's (a fresh machine, like the CI's, has no git identity at all).
const GITCONFIG = join(BASE, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n\tname = banc\n\temail = banc@example.invalid\n[init]\n\tdefaultBranch = main\n", "utf8");

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 600)}` : ""}`);
  }
};
const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", HVBRAIN_TASK_SUFFIX: " banc", GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_NOSYSTEM: "1",
  // Never a terminal window on the screen of whoever runs the bench, never a token of their own.
  HVBRAIN_NO_WINDOW: "1", CLAUDE_CODE_OAUTH_TOKEN: "",
  GIT_AUTHOR_NAME: "banc", GIT_AUTHOR_EMAIL: "banc@example.invalid", GIT_COMMITTER_NAME: "banc", GIT_COMMITTER_EMAIL: "banc@example.invalid",
};
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { cwd: o.cwd ?? BASE, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, err };
};
const node = (script, a = [], o = {}) => run("node", [join(SCRIPTS, script), ...a], o);
// The JSON a script printed: from its first line that opens an object or an array.
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const git = (...a) => run("git", a, { cwd: BRAIN }).out.trim();
// The local date, as the scripts write it (not UTC: between midnight and 2 am in Paris they differ).
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fake = spawn("node", [join(HERE, "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const EMB = { EMBEDDINGS_API_KEY: "test-key", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1` };
const embedCalls = async () => Number(await (await fetch(`http://127.0.0.1:${port}/count`)).text());
// The fake mail service closes an idle connection: one reset is not a failure
// of the plugin (seen 2026-11-16, a whole run lost on ECONNRESET). Asked on a
// fresh connection, three times at most.
const mailNow = async () => {
  for (let t = 0; ; t++) {
    try {
      return await (await fetch(`http://127.0.0.1:${port}/mail`, { headers: { connection: "close" } })).json();
    } catch (e) {
      if (t >= 2) throw e;
    }
  }
};

/** Talks to the MCP server through its real protocol. */
async function mcpSession(extraEnv = {}) {
  const child = spawn("node", [join(SCRIPTS, "mcp.mjs")], { cwd: BASE, env: { ...env, ...extraEnv }, windowsHide: true });
  const lines = [];
  let buffer = "";
  child.stdout.on("data", (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
  });
  let n = 0;
  const ask = async (method, params) => {
    const id = ++n;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (let t = 0; t < 300; t++) {
      const hit = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
      if (hit) return hit;
      await new Promise((res) => setTimeout(res, 50));
    }
    return null;
  };
  const text = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r);
  return { ask, text, lines, close: () => child.kill() };
}

// What a scene left for the later ones, beyond the disk: declared here, kept
// and given back with the state (dump, load). `m` is a live MCP session: it
// never crosses a scene.
let r, m, init, call, created, idea, stats, st, cold, tested, listed, dry, now, report, page, list, before;
// A group of scenes that share helpers (the judges) keeps a few values of its
// own beside the disk: it says how to take them and how to give them back,
// before its first scene.
/** @type {Map<string, { dump: () => object, load: (v: any) => void }>} */
const groups = new Map();
const keeps = (name, dump, load) => groups.set(name, { dump, load });
const dump = () => ({ r, init, call, created, idea, stats, st, cold, tested, listed, dry, now, report, page, list, before });
const load = (v) => {
  ({ r, init, call, created, idea, stats, st, cold, tested, listed, dry, now, report, page, list, before } = v);
};
/** @type {{ name: string, checks: number, failed: number, seconds: number }[]} */
const played = [];
/** @type {{ name: string, at: number, total: number, failures: number } | null} */
let current = null;
let reached = !START;
let over = false;
const closeScene = () => {
  if (!current) return;
  played.push({ name: current.name, checks: total - current.total, failed: failures - current.failures, seconds: Math.round((Date.now() - current.at) / 1000) });
  current = null;
};
/**
 * The start of a scene. False when this run does not play it (before the scene
 * asked for, or after the only one asked for). Otherwise the state is kept
 * (or, for the scene a run starts at, given back), and the scene plays.
 * @param {string} name
 */
async function scene(name) {
  closeScene();
  if (over) return false;
  if (!reached) {
    if (name !== START) return false;
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    cpSync(join(STORE, name, "base"), BASE, { recursive: true, preserveTimestamps: true });
    load(KEPT_AT_START.vars);
    for (const [n, g] of groups) if (KEPT_AT_START.groups?.[n]) g.load(KEPT_AT_START.groups[n]);
    reached = true;
    console.log(`  (from the state kept at the start of "${name}", ${KEPT_AT_START.at.slice(0, 16).replace("T", " ")} UTC)`);
  } else if (ONLY) {
    over = true;
    return false;
  } else {
    // Kept for a later --only or --from. A state that cannot be copied (a file
    // held by a program) only means this scene cannot be replayed alone.
    try {
      rmSync(join(STORE, name), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      cpSync(BASE, join(STORE, name, "base"), { recursive: true, preserveTimestamps: true });
      writeFileSync(join(STORE, name, "vars.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), vars: dump(), groups: Object.fromEntries([...groups].map(([n, g]) => [n, g.dump()])) }), "utf8");
    } catch (e) {
      rmSync(join(STORE, name), { recursive: true, force: true });
      console.log(`  (the state at the start of "${name}" could not be kept: ${e.code ?? e.message})`);
    }
  }
  // THE CLOCK OF A SCENE. The sources run at the ticks of the clock (pure.mjs):
  // a real tick falling in the middle of a scene would make due what the scene
  // says is not. Each scene counts its ticks from seven and a half minutes
  // before its start: for a rhythm of fifteen minutes, the nearest ticks are
  // that long before and after, further than any scene lasts.
  env.HVBRAIN_TICK_ORIGIN = String(Date.now() - 450_000);
  current = { name, at: Date.now(), total, failures };
  console.log(`\n  -- ${name}`);
  return true;
}


try {
  console.log(`\nBanc du plugin Hypervibe Brain, dans ${BASE}\n`);

  // ---- what several scenes use, defined before the first one: a run that
  // starts in the middle (--only, --from, --failed) has it too. Nothing here
  // runs a program nor writes a file.
  const cap = (body, a) => node("capture.mjs", a, { input: body });
  const search = (q, extra = []) => json(node("query.mjs", ["search", q, "--json", ...extra]).out);
  const hook = (payload, extra = {}) => run("node", [join(SCRIPTS, "hook-journal.mjs")], { input: JSON.stringify(payload), env: extra });
  const notesCount = () => json(node("query.mjs", ["stats"]).out).notes;
  const CLONE = join(BASE, "clone");
  const WATCHED = join(BASE, "ecrits");
  const lectures = join(BRAIN, "sources", "lectures");
  const posts = join(BRAIN, "sources", "posts");
  const p = join(BRAIN, "vault", "projects", "projet-de-roman.md");
  const transcript = join(BASE, "s2.jsonl");
  const SOURCE_PROGRAM = [
    'import { existsSync, readFileSync } from "node:fs";',
    'if (existsSync("fail")) { console.log(JSON.stringify({ id: "x", title: "partial" })); console.error("the feed is down"); process.exit(1); }',
    'for (const x of JSON.parse(readFileSync("data.json", "utf8"))) console.log(JSON.stringify(x));',
    "",
  ].join("\n");
  const LETTER = [
    "# The review of September 30",
    "A calm week. Three notes came in.",
    "---",
    "## The new seeds",
    "1. `les-villes-invisibles`: Calvino, each city a state of mind.",
    "2. `especes-d-espaces`: Perec, living and naming.",
    "> These notes are already in your brain, as seeds.",
    "## The proposals",
    "1. Link **Perec** to [[projet-de-roman]].",
    ">> **Oh, by the way...!**",
    ">> A year ago, the idea of the dreaming city.",
    "^ 🟢 All is well.",
  ].join("\n");
  const letter = (a, extraEnv = {}) => node("letter.mjs", ["send", ...a], { input: LETTER, env: extraEnv });
  const mailEnv = { RESEND_API_KEY: "test-resend", HVBRAIN_RESEND_URL: `http://127.0.0.1:${port}` };

  if (await scene("creation")) {
  // ---- before any brain
  r = node("prereqs.mjs", ["--json"]);
  const pre = json(r.out);
  check("the audit runs and sees Node and git", r.ok && pre.node.ok && pre.git.installed && pre.brain === null, r.out);
  {
    // The "Upload a plugin" dialog of the Claude app refuses a zip if any
    // skill's description holds a chevron, and nothing else says so.
    const chevrons = readdirSync(join(PLUGIN, "skills")).filter((s) => /^description:.*[<>]/m.test(readFileSync(join(PLUGIN, "skills", s, "SKILL.md"), "utf8")));
    check("no skill description holds a chevron (the app's upload would refuse the zip)", chevrons.length === 0, chevrons.join(", "));
    // Each skill carries its documentation for people, in French and in
    // English, with the same sections (what a site shows about the plugin).
    const SECTIONS = { "DOC.fr.md": ["## Quand l'utiliser", "## Comment ça se passe", "## Ce que ça crée pour vous", "## Prérequis", "## Astuces"], "DOC.md": ["## When to use it", "## How it goes", "## What it creates for you", "## Prerequisites", "## Tips"] };
    const docFaults = [];
    // An internal skill (its folder starts with an underscore: called by
    // another skill, never by a person) has no page for people.
    for (const s of readdirSync(join(PLUGIN, "skills")).filter((x) => !x.startsWith("_"))) {
      for (const [file, sections] of Object.entries(SECTIONS)) {
        const p = join(PLUGIN, "skills", s, file);
        if (!existsSync(p)) {
          docFaults.push(`${s}/${file}: missing`);
          continue;
        }
        const text = readFileSync(p, "utf8");
        if (!text.startsWith(`# /brain:${s}`)) docFaults.push(`${s}/${file}: must start with "# /brain:${s}"`);
        for (const sec of sections) if (!text.includes(sec)) docFaults.push(`${s}/${file}: no "${sec}"`);
        if (/[—–]/.test(text)) docFaults.push(`${s}/${file}: a long dash`);
        if ((text.match(/\{\{callout:/g) ?? []).length !== (text.match(/\{\{\/callout\}\}/g) ?? []).length) docFaults.push(`${s}/${file}: a callout is not closed`);
      }
    }
    check("every skill has its documentation in French and English, with all its sections", docFaults.length === 0, docFaults.join(" | "));
  }
  {
    // ORCHESTRATORS AND INTERNAL SKILLS (2026-11-17). An internal skill (its
    // folder starts with an underscore) is a procedure another skill hands
    // over to: hidden from the person's menu, said as such in its
    // description, and never an orphan nor a dead end.
    const skillsDir = join(PLUGIN, "skills");
    const all = readdirSync(skillsDir);
    const internal = all.filter((s) => s.startsWith("_"));
    const text = (s) => readFileSync(join(skillsDir, s, "SKILL.md"), "utf8").replace(/\r\n/g, "\n");
    const field = (s, k) => new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(/^---\n([\s\S]*?)\n---\n/.exec(text(s))?.[1] ?? "")?.[1].trim();
    const faults = [];
    for (const s of all) {
      if (field(s, "name") !== s) faults.push(`${s}: its name is not its folder's`);
      // A colon followed by a space would end the description for the app that reads the front matter.
      if (/: /.test(field(s, "description") ?? "")) faults.push(`${s}: a colon and a space in its description`);
      if (/[—–]/.test(text(s))) faults.push(`${s}: a long dash`);
      if (!s.startsWith("_") && field(s, "user-invocable") === "false") faults.push(`${s}: hidden from the person, without the underscore that says so`);
    }
    for (const s of internal) {
      const d = field(s, "description") ?? "";
      if (field(s, "user-invocable") !== "false") faults.push(`${s}: no "user-invocable: false"`);
      if (!d.startsWith("Internal - ")) faults.push(`${s}: its description does not start with "Internal - "`);
      if (!d.endsWith("Not meant to be invoked directly by users.")) faults.push(`${s}: its description does not end with "Not meant to be invoked directly by users."`);
    }
    // Who hands over to whom: every /brain:_name written in a skill or in its pages for people.
    const names = (s) => new Set(readdirSync(join(skillsDir, s)).filter((f) => f.endsWith(".md")).flatMap((f) => [...readFileSync(join(skillsDir, s, f), "utf8").matchAll(/\/brain:(_[a-z0-9-]+)/g)].map((m) => m[1])));
    const refs = new Map(all.map((s) => [s, names(s)]));
    for (const s of internal) if (!all.some((o) => o !== s && refs.get(o).has(s))) faults.push(`${s}: no other skill hands over to it`);
    for (const [s, set] of refs) for (const n of set) if (!internal.includes(n)) faults.push(`${s}: hands over to /brain:${n}, which does not exist`);
    check("an internal skill is hidden from the person, says so in its description, and another skill hands over to it", internal.length >= 2 && faults.filter((f) => !/hands over to \/brain:/.test(f)).length === 0, faults.join(" | "));
    check("no skill hands over to an internal skill that does not exist", faults.filter((f) => /hands over to \/brain:/.test(f)).length === 0, faults.join(" | "));
    // The start is an orchestrator: each of its steps names the skill that does it.
    const start = text("start");
    const handed = ["_computer", "create", "add-second-computer", "sources", "_live-sources", "_judge-token", "_limits", "_alert-channel", "add-routines", "live", "_catch-up", "executive"].filter((n) => !start.includes(`/brain:${n}`));
    check("the start hands each of its steps to a skill, the knowledge to another, and a brain found elsewhere to the second computer", handed.length === 0, handed.join(", "));
  }
  {
    // Before any brain: the start says so, and the place it proposes is said in full.
    r = node("start.mjs", ["state"]);
    const s0 = json(r.out);
    check("before any brain, the start begins with the check for a brain that exists already, then the computer, and proposes a place in full, without assuming it", r.ok && s0.brain === null && s0.phase === 1 && s0.next === "preflight" && s0.part === "preflight" && s0.parts.map((p) => p.id).join() === "preflight,computer,container,tools,knowledge,executive,life" && s0.steps.find((x) => x.id === "computer")?.state === "todo" && s0.proposedPlace === `${HOME.replace(/\\/g, "/")}/brain`, r.out);
    // THE PREFLIGHT (2026-11-23): a brain of the person's, in a folder of this
    // home or on their GitHub, is found before a second one is created; it
    // reads only. GitHub is a stand-in here (HVBRAIN_GH), never the real one.
    {
      const fakeGh = join(BASE, "faux-gh.mjs");
      writeFileSync(fakeGh, [
        'const a = process.argv.slice(2);',
        'if (a[0] === "--version") { console.log("gh version 2.0.0 (banc)"); process.exit(0); }',
        'let input = ""; process.stdin.on("data", (d) => (input += d)); process.stdin.on("end", () => {',
        '  if (!JSON.parse(input).query.includes("HEAD:brain.json")) process.exit(1);',
        '  const brain = JSON.stringify({ name: "Camille", lang: "fr", domains: {}, created: "2026-01-01" });',
        '  console.log(JSON.stringify({ data: { viewer: { login: "camille", repositories: { nodes: [',
        '    { nameWithOwner: "camille/mon-brain", isPrivate: true, url: "https://github.invalid/camille/mon-brain", pushedAt: "2026-11-20T10:00:00Z", brain: { text: brain }, legacy: null },',
        '    { nameWithOwner: "camille/un-site", isPrivate: false, url: "https://github.invalid/camille/un-site", brain: { text: "{\\"name\\": 3}" }, legacy: null },',
        '    { nameWithOwner: "camille/autre", isPrivate: false, url: "https://github.invalid/camille/autre", brain: null, legacy: null } ] } } } }));',
        '});',
      ].join("\n"), "utf8");
      const settingsFile = join(HOME, ".hypervibe-brain", "config.json");
      const settingsBefore = existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : null;
      const looked = node("start.mjs", ["preflight"], { env: { HVBRAIN_GH: fakeGh } });
      const p0 = json(looked.out);
      const off = json(node("start.mjs", ["preflight", "--no-github"]).out);
      const asidePlace = join(HOME, "ancien-brain");
      mkdirSync(asidePlace, { recursive: true });
      writeFileSync(join(asidePlace, "brain.json"), JSON.stringify({ name: "Camille", lang: "fr", domains: {}, created: "2025-06-01" }), "utf8");
      writeFileSync(join(HOME, "pas-un-brain.json"), "{}", "utf8");
      const found = json(node("start.mjs", ["preflight", "--no-github"]).out);
      rmSync(asidePlace, { recursive: true, force: true });
      rmSync(join(HOME, "pas-un-brain.json"), { force: true });
      check(
        "before a brain is created, the preflight looks for one: on the person's GitHub (one question, nothing cloned), then in the folders of this home, and says to whom to hand over",
        looked.ok && p0.verdict === "github" && p0.hand === "add-second-computer" && p0.github.looked === true && p0.github.brains.length === 1 && p0.github.brains[0].repo === "camille/mon-brain" && p0.github.brains[0].private === true && off.github.looked === false && off.verdict === "none" && off.hand === "create" && found.verdict === "local" && found.hand === "adopt" && found.local.length === 1 && found.local[0].dir === asidePlace.replace(/\\/g, "/") && (existsSync(settingsFile) ? readFileSync(settingsFile, "utf8") : null) === settingsBefore,
        `${looked.out} |${JSON.stringify(off)} | ${JSON.stringify(found)}`,
      );
    }
    r = node("init.mjs", ["--dir", join(BASE, "ailleurs", "mon-brain"), "--check"]);
    const synced = node("init.mjs", ["--dir", join(BASE, "Dropbox", "brain"), "--check"]);
    check("the place of a brain can be checked while it is still a question: any folder but a synchronised one, and nothing is created", r.ok && json(r.out).check === true && !existsSync(join(BASE, "ailleurs")) && !synced.ok && /synchronised/.test(synced.out) && !existsSync(join(BASE, "Dropbox")) && json(node("prereqs.mjs", ["--json"]).out).brain === null, `${r.out} ${synced.out}`);
    r = node("judge-token.mjs", ["window", "--dry"]);
    const win = json(r.out);
    check("the token's window is never opened by the bench, and the two lines to paste by hand are always given", r.ok && win.opened === false && win.byHand[0] === "claude setup-token" && /judge-token\.mjs" set$/.test(win.byHand[1]), r.out);
  }
  {
    // A computer and a brain set up under the plugin's name of before (until
    // 0.4) are carried over by a rename, the first time any script runs.
    const before = "hyper" + "brain";
    const oldHome = join(BASE, "home-before");
    const oldBrain = join(BASE, "brain-before");
    mkdirSync(join(oldHome, `.${before}`), { recursive: true });
    mkdirSync(join(oldBrain, "vault"), { recursive: true });
    writeFileSync(join(oldBrain, `${before}.json`), JSON.stringify({ name: "Avant", lang: "en", domains: ["a"] }), "utf8");
    writeFileSync(join(oldHome, `.${before}`, "config.json"), JSON.stringify({ brain: oldBrain.replace(/\\/g, "/"), routines: { save: { time: "21:00", task: "Hyper" + "brain evening save" } } }), "utf8");
    const carried = node("routines.mjs", ["state", "--json"], { env: { HVBRAIN_HOME: oldHome } });
    check("a setup made under the name of before is carried over: settings folder, brain file, and the save to arm again",
      existsSync(join(oldHome, ".hypervibe-brain", "config.json")) && !existsSync(join(oldHome, `.${before}`)) && existsSync(join(oldBrain, "brain.json")) && !existsSync(join(oldBrain, `${before}.json`)) && json(carried.out).rearm === true, carried.out);
  }
  check("the audit records where the plugin lives",JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8")).pluginRoot === PLUGIN.replace(/\\/g, "/"));
  r = node("status.mjs");
  check("a script without a brain says so and stops", r.status === 3 && r.err.includes("create"), r.out);
  m = await mcpSession();
  init = await m.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  check("without a brain, the MCP instructions point to start", init?.result?.instructions?.includes("start"), JSON.stringify(init));
  call = await m.ask("tools/call", { name: "brain_stats", arguments: {} });
  check("without a brain, a tool answers with the way to create one", m.text(call).includes("create"), m.text(call));

  // ---- creation
  r = node("init.mjs", ["--dir", join(HOME, "Dropbox", "brain"), "--name", "X", "--domains", "a,b"]);
  check("init refuses a synchronised folder", !r.ok && r.out.includes("synchronised"), r.out);
  // As they are really named: OneDrive for business on Windows, CloudStorage and iCloud on macOS.
  for (const synced of [["OneDrive - Acme", "Documents"], ["Library", "CloudStorage", "GoogleDrive-x@y.z", "My Drive"], ["Library", "Mobile Documents", "com~apple~CloudDocs"]]) {
    r = node("init.mjs", ["--dir", join(HOME, ...synced, "brain"), "--name", "X", "--domains", "a,b"]);
    check(`init refuses ${synced.join("/")}`, !r.ok && r.out.includes("synchronised"), r.out);
  }
  r = node("init.mjs", ["--dir", BRAIN, "--name", "Camille", "--domains", "Travail,Écriture,famille", "--lang", "en"]);
  created = json(r.out);
  check("init creates the brain", r.ok && created.ok, r.out);
  check("domains are normalised (accents, case)", JSON.stringify(created.domains) === JSON.stringify(["travail", "ecriture", "famille"]), created.domains);
  check("init commits the template, and nothing else", created.commit === true && git("log", "--oneline").split("\n").length === 1 && git("status", "--porcelain") === "", git("status", "--porcelain"));
  check("the brain holds data only, no script", !existsSync(join(BRAIN, "scripts")) && !existsSync(join(BRAIN, "package.json")));
  check("init registers the brain for this computer", JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8")).brain === BRAIN.replace(/\\/g, "/"));
  check("placeholders are filled", readFileSync(join(BRAIN, "CLAUDE.md"), "utf8").includes("Camille's second brain"));
  r = node("init.mjs", ["--dir", join(BASE, "autre"), "--name", "X", "--domains", "a,b"]);
  check("a second brain is refused without --switch", !r.ok && r.out.includes("--switch"), r.out);
  call = await m.ask("tools/call", { name: "brain_stats", arguments: {} });
  check("the MCP server started before the brain sees it at once", m.text(call).includes('"notes":0'), m.text(call));
  m.close();

  }
  if (await scene("captures")) {
  // ---- captures
  r = cap("Le travail ne disparaît pas, il se déplace vers ce qui ne s'automatise pas.", ["--title", "Le travail se déplace", "--type", "idea", "--domains", "travail"]);
  check("capture an idea", r.ok && r.out.includes("created: vault/ideas/le-travail-se-deplace.md"), r.out);
  r = cap("Un roman sur une ville qui rêve. Voir [[le-travail-se-deplace]].", ["--title", "Projet de roman", "--type", "project", "--domains", "ecriture", "--status", "trusted"]);
  check("capture a project with a link in the body", r.ok, r.out);
  r = cap("Mes notes de santé.", ["--title", "Dossier santé", "--type", "note", "--domains", "famille", "--visibility", "private"]);
  check("capture a private note", r.ok, r.out);
  r = cap("x", ["--title", "Le travail se déplace", "--type", "idea", "--domains", "travail"]);
  check("capture refuses a name already taken", !r.ok && r.out.includes("already exists"), r.out);
  r = cap("x", ["--title", "Autre", "--type", "idea", "--domains", "sport"]);
  check("capture refuses an unknown domain", !r.ok && r.out.includes("not a domain"), r.out);
  r = cap("x", ["--title", "Autre", "--type", "idea", "--domains", "travail", "--links", "n-existe-pas"]);
  check("capture refuses a link to nothing", !r.ok && r.out.includes("point to no note"), r.out);
  r = cap("x", ["--title", "Autre", "--type", "pensee", "--domains", "travail"]);
  check("capture refuses an invented type", !r.ok, r.out);
  check("each capture is its own commit", git("log", "--oneline").split("\n").length === 4, git("log", "--oneline"));
  check("refused captures leave nothing behind", git("status", "--porcelain") === "", git("status", "--porcelain"));

  }
  if (await scene("search")) {
  // ---- index and search (no key: text only)
  r = node("build.mjs");
  check("build without a key", r.ok && r.out.includes("3 note(s) indexed") && r.out.includes("search by meaning is off"), r.out);
  check("the index lives in the brain, out of git", existsSync(join(BRAIN, "index", "brain.sqlite")) && git("status", "--porcelain") === "", git("status", "--porcelain"));
  check("several words, anywhere, accents ignored", search("deplace automatise").some((x) => x.slug === "le-travail-se-deplace"));
  check("a private note is found by its title", search("sante").some((x) => x.slug === "dossier-sante"));
  // A PRIVATE NOTE IS READ LIKE ANY OTHER (2026-11-21): a brain is there to be
  // read by its AI; "private" only says what never leaves the computer.
  check("a private note's content is searched like any other", search("notes").some((x) => x.slug === "dossier-sante"));
  const got = json(node("query.mjs", ["get", "dossier-sante", "--json"]).out);
  check("a private note's content is given to the AI", got.body === "Mes notes de santé.", got.body);
  check("--local shows it on this computer", json(node("query.mjs", ["get", "dossier-sante", "--json", "--local"]).out).body === "Mes notes de santé.");
  idea = json(node("query.mjs", ["get", "le-travail-se-deplace", "--json"]).out);
  check("backlinks", idea.backlinks.some((b) => b.slug === "projet-de-roman"), JSON.stringify(idea.backlinks));
  stats = json(node("query.mjs", ["stats"]).out);
  check("stats list every domain, even empty ones", Object.keys(stats.byDomain).join() === "travail,ecriture,famille", JSON.stringify(stats.byDomain));

  }
  if (await scene("hand-edit")) {
  // ---- a hand edit is picked up without asking for a build
  writeFileSync(p, readFileSync(p, "utf8").replace("une ville qui rêve", "une ville qui rêve de baleines"), "utf8");
  check("queries rebuild a stale index by themselves", search("baleines").length === 1);

  }
  if (await scene("broken-note")) {
  // ---- a broken note: build refuses, queries keep answering, save keeps it out
  const broken = join(BRAIN, "vault", "notes", "cassee.md");
  writeFileSync(broken, "---\ntype: note\ntitle: \"Cassée\"\ndomains: []\nstatus: seed\nvisibility: internal\ncreated: 2026-09-30\nupdated: 2026-09-30\n---\n\nx\n", "utf8");
  r = node("build.mjs");
  check("the build refuses a note without a domain", !r.ok && r.out.includes("no domain"), r.out);
  r = node("query.mjs", ["search", "baleines", "--json"]);
  check("queries still answer from the previous index, with a warning", r.ok && r.err.includes("could not be refreshed") && r.out.includes("baleines"), r.err);
  r = node("save.mjs", ["--now"]);
  check("save refuses to commit the broken note", r.out.includes("NOT saved, invalid: vault/notes/cassee.md"), r.out);
  check("but it saves the valid edit next to it", git("status", "--porcelain").trim() === "?? vault/notes/cassee.md", `${git("status", "--porcelain")} | ${r.out}`);
  unlinkSync(broken);

  }
  if (await scene("save")) {
  // ---- save waits for a note at rest
  writeFileSync(p, readFileSync(p, "utf8").replace("baleines", "baleines bleues"), "utf8");
  r = node("save.mjs");
  check("a note edited a minute ago waits", r.out.includes("still being edited"), r.out);
  const old = new Date(Date.now() - 3600_000);
  utimesSync(p, old, old);
  r = node("save.mjs");
  // The note, and the brain's journal that says it was edited by hand.
  check("the same note, at rest, is saved", /^saved: [12] file/.test(r.out) && !git("status", "--porcelain").includes("baleines"), r.out);

  }
  if (await scene("vectors")) {
  // ---- semantic search, and vectors in git
  r = node("build.mjs", [], { env: EMB });
  check("build computes the vectors with a key", r.ok && r.out.includes("3 computed"), r.out);
  check("the private note has its vector, like any other", existsSync(join(BRAIN, "index", "embeddings", "dossier-sante.json")));
  r = node("query.mjs", ["search", "--meaning", "travail automatise", "--json"], { env: EMB });
  check("search by meaning", r.ok && json(r.out)[0]?.slug === "le-travail-se-deplace", r.out);
  const nb = json(node("query.mjs", ["neighbors", "projet-de-roman"], { env: EMB }).out);
  check("neighbors by meaning", nb.similar.some((s) => s.slug === "le-travail-se-deplace"), JSON.stringify(nb));
  node("save.mjs", ["--now"]);
  check("the vectors are committed", git("ls-files", "index/embeddings").split("\n").filter(Boolean).length === 3, git("ls-files"));
  run("git", ["clone", "-q", BRAIN, CLONE]);
  before = await embedCalls();
  r = node("build.mjs", [], { env: { ...EMB, HVBRAIN_DIR: CLONE } });
  check("a clone gets its vectors from git, with no API call", r.ok && r.out.includes("3 taken from git") && (await embedCalls()) === before, `${r.out} calls ${(await embedCalls()) - before}`);
  check("and its tree stays clean", run("git", ["status", "--porcelain"], { cwd: CLONE }).out.trim() === "");

  }
  if (await scene("mcp")) {
  // ---- the MCP server with a brain
  m = await mcpSession(EMB);
  init = await m.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  check("the MCP instructions name the person and the capture skill", init?.result?.instructions?.includes("Camille has a second brain") && init.result.instructions.includes("/brain:capture"), init?.result?.instructions);
  list = await m.ask("tools/list", {});
  check("MCP lists seven tools (brain_fetch included)", list?.result?.tools?.length === 7 && list.result.tools.some((t) => t.name === "brain_fetch"), JSON.stringify(list));
  call = await m.ask("tools/call", { name: "brain_search", arguments: { query: "roman" } });
  check("MCP search", m.text(call).includes("projet-de-roman"), m.text(call));
  call = await m.ask("tools/call", { name: "brain_search", arguments: { query: "automatise travail", meaning: true } });
  check("MCP search by meaning", m.text(call).includes("le-travail-se-deplace"), m.text(call));
  call = await m.ask("tools/call", { name: "brain_get", arguments: { slug: "dossier-sante" } });
  check("MCP returns a private note's content like any other", m.text(call).includes("Mes notes"), m.text(call));
  call = await m.ask("nope", {});
  check("MCP answers an unknown method with an error", call?.error?.code === -32601);
  check("MCP prints nothing but protocol on stdout", m.lines.every((l) => l.startsWith("{")), m.lines.find((l) => !l.startsWith("{")));
  m.close();

  }
  if (await scene("components")) {
  // ---- the components
  mkdirSync(WATCHED, { recursive: true });
  writeFileSync(join(WATCHED, "chapitre-1.md"), "Il était une fois.\n", "utf8");
  const COLD = join(BASE, "disque-externe");
  mkdirSync(COLD, { recursive: true });
  r = node("components.mjs", ["source", "journal", "on"]);
  check("a living source is switched on", r.ok && json(r.out).sources.journal === true, r.out);
  r = node("components.mjs", ["source", "telepathy", "on"]);
  check("an unknown source is refused", !r.ok, r.out);
  r = node("components.mjs", ["set", "journal", "on"]);
  check("a source is not a module", !r.ok, r.out);
  r = node("components.mjs", ["watch", "add", WATCHED]);
  check("a folder is watched", r.ok && json(r.out).sources.watch.length === 1, r.out);
  check("and gets a name on this computer, so that what is found in it has an address that holds on every computer", json(r.out).root?.created === true && JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8")).sourceRoots?.[json(r.out).root.scheme] === WATCHED.replace(/\\/g, "/"), r.out);
  // Only the widest folders: a watched folder is read with all that is under it.
  {
    const inner = join(WATCHED, "inner");
    const wide = join(BASE, "wide");
    mkdirSync(inner, { recursive: true });
    mkdirSync(join(wide, "one"), { recursive: true });
    mkdirSync(join(wide, "two"), { recursive: true });
    const f = (p) => p.replace(/\\/g, "/");
    r = node("components.mjs", ["watch", "add", inner]);
    check("a folder inside a watched folder is already read: said, and not added", r.ok && json(r.out).included === f(WATCHED) && json(r.out).sources.watch.join() === f(WATCHED), r.out);
    node("components.mjs", ["watch", "add", join(wide, "one")]);
    node("components.mjs", ["watch", "add", join(wide, "two")]);
    r = node("components.mjs", ["watch", "add", wide]);
    check("a folder that holds watched folders takes their place", r.ok && json(r.out).replaces?.length === 2 && json(r.out).sources.watch.join() === [f(WATCHED), f(wide)].join(), r.out);
    r = node("components.mjs", ["watch", "remove", wide]);
    check("and is removed like any other", r.ok && json(r.out).sources.watch.join() === f(WATCHED), r.out);
    // The view: one circle per folder of the computer, whatever its notation.
    const tb = join(BASE, "folders-brain");
    const th = join(BASE, "folders-home");
    const held = join(BASE, "held");
    mkdirSync(join(held, "Finance", "LMNP", "2026"), { recursive: true });
    mkdirSync(join(held, "Talks", "Slides"), { recursive: true });
    mkdirSync(join(tb, "sources", "moved"), { recursive: true });
    mkdirSync(join(tb, "sources", "docs"), { recursive: true });
    mkdirSync(join(th, ".hypervibe-brain"), { recursive: true });
    writeFileSync(join(th, ".hypervibe-brain", "config.json"), JSON.stringify({ sourceRoots: { held: f(held) } }), "utf8");
    writeFileSync(join(tb, "brain.json"), JSON.stringify({ name: "folders", lang: "en", sources: { watch: [f(join(held, "Finance", "LMNP")), f(join(held, "Talks"))] } }), "utf8");
    writeFileSync(join(tb, "sources", "moved", "source.json"), JSON.stringify({ every: "30m", tools: ["held"], folders: ["held://Finance/LMNP/", "held://Finance/LMNP/2026/", "held://Talks/Slides/"] }), "utf8");
    writeFileSync(join(tb, "sources", "docs", "source.json"), JSON.stringify({ every: "30m", tools: ["folders"] }), "utf8");
    const code = `import { connectedTools } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "..", "live", "tools.mjs")).href)}; const t = connectedTools(process.argv[1], { fresh: true }); console.log(JSON.stringify({ folders: t.tools.filter((x) => x.parent === "folders").map((x) => ({ id: x.id, name: x.name, addresses: x.addresses, paths: x.paths, access: x.access })), moved: [...(t.bySource instanceof Map ? t.bySource : new Map(Object.entries(t.bySource)))].find(([n]) => n === "moved")?.[1] }));`;
    r = run("node", ["--input-type=module", "-e", code, tb], { env: { HVBRAIN_HOME: th } });
    const seen = r.ok ? json(r.out) : null;
    const lmnp = seen?.folders.find((x) => x.name === "LMNP");
    const talks = seen?.folders.find((x) => x.name === "Talks");
    check(
      "the view shows a watched folder once, whether a source names it by its address or the brain by its path, with the folders inside it",
      seen?.folders.length === 2 && lmnp?.addresses.join() === "held://Finance/LMNP/" && lmnp.paths.length === 1 && /moved/.test(lmnp.access) && /docs/.test(lmnp.access) && talks && /moved/.test(talks.access) && talks.addresses.includes("held://Talks/Slides/") && [...new Set(seen.moved)].length === 2,
      r.out.slice(0, 900),
    );
  }
  r = node("components.mjs", ["cold-copy", join(BRAIN, "vault")]);
  check("the cold copy cannot live inside the brain", !r.ok, r.out);
  r = node("components.mjs", ["cold-copy", COLD]);
  check("the cold copy folder is recorded", r.ok && json(r.out).modules.coldCopy === COLD.replace(/\\/g, "/"), r.out);

  }
  if (await scene("work-journal")) {
  // ---- the work journal, the hook of the plugin
  const JOURNAL = join(HOME, ".hypervibe-brain", "journal.jsonl");
  r = hook({ session_id: "s1", cwd: join(BASE, "projet-roman") });
  check("the hook is silent", r.ok && r.out.trim() === "", r.out);
  hook({ session_id: "s1", cwd: join(BASE, "projet-roman") });
  // A session whose transcript carries the title Claude gave it.
  writeFileSync(transcript, `${JSON.stringify({ type: "summary" })}\n${JSON.stringify({ aiTitle: "Refaire la page d'accueil" })}\n${JSON.stringify({ message: "never read" })}\n`, "utf8");
  hook({ session_id: "s2", cwd: join(BASE, "site-web"), transcript_path: transcript });
  // The other computer's journal, arrived by the synchronisation.
  mkdirSync(join(BRAIN, "journal"), { recursive: true });
  writeFileSync(join(BRAIN, "journal", "portable.jsonl"), `${JSON.stringify({ t: new Date().toISOString(), type: "session", project: "atelier-photo", cwd: "/elsewhere/atelier-photo", session: "p1", title: "Trier les photos de Lisbonne" })}\n`, "utf8");
  // A session in a real repository: its commits of the week come with it.
  hook({ session_id: "s3", cwd: BRAIN });
  const jl = readFileSync(JOURNAL, "utf8").trim().split("\n");
  check("one line per session, no duplicate, in the same format as the brain's own sensors", jl.length === 3 && jl[0].includes("projet-roman") && JSON.parse(jl[0]).type === "session", jl.join(" | "));
  r = hook("not json at all");
  check("the hook never fails, even on nonsense", r.ok);

  // A source that points to a file that is gone.
  // A scheme of this computer: "atelier://" is a folder here (sourceRoots, in
  // the computer's own settings). One source modified since its note, one gone.
  {
    const ATELIER = join(BASE, "atelier");
    mkdirSync(ATELIER, { recursive: true });
    const settings = join(HOME, ".hypervibe-brain", "config.json");
    writeFileSync(settings, JSON.stringify({ ...JSON.parse(readFileSync(settings, "utf8")), sourceRoots: { atelier: ATELIER } }), "utf8");
    writeFileSync(join(ATELIER, "plan.md"), "Le plan, revu depuis.\n", "utf8");
    cap("Le plan du roman.", ["--title", "Plan du roman", "--type", "note", "--domains", "ecriture", "--source", "atelier://plan.md"]);
    cap("Une esquisse.", ["--title", "Esquisse perdue", "--type", "note", "--domains", "ecriture", "--source", "atelier://esquisse.md"]);
    const tomorrow = new Date(Date.now() + 86400_000);
    utimesSync(join(ATELIER, "plan.md"), tomorrow, tomorrow);
  }
  r = cap("Tiré d'un brouillon disparu.", ["--title", "Brouillon perdu", "--type", "note", "--domains", "ecriture", "--source", join(BASE, "n-existe-plus.docx")]);
  check("capture with a local source", r.ok, r.out);

  }
  if (await scene("review")) {
  // ---- the weekly review
  const idPath = join(BRAIN, "vault", "ideas", "le-travail-se-deplace.md");
  const notePath = join(BRAIN, "vault", "notes", "vieille-note.md");
  writeFileSync(notePath, "---\ntype: note\ntitle: \"Vieille note\"\ndomains: [travail]\nstatus: seed\nvisibility: internal\ncreated: 2026-01-01\nupdated: 2026-01-01\nsource: \"banc\"\n---\n\nUne note ancienne.\n", "utf8");
  writeFileSync(idPath, `${readFileSync(idPath, "utf8")}\n[[vieille-note]]\n`, "utf8");
  // Read by Claude, never linked: it serves, it rises. Linked only by a
  // program's line: plumbing, it stays a seed.
  const oldSeed = (slug, title) => writeFileSync(join(BRAIN, "vault", "notes", `${slug}.md`), `---\ntype: note\ntitle: "${title}"\ndomains: [travail]\nstatus: seed\nvisibility: internal\ncreated: 2026-01-02\nupdated: 2026-01-02\nsource: "banc"\n---\n\n${title}.\n`, "utf8");
  oldSeed("note-lue", "Note lue par Claude");
  oldSeed("note-plomberie", "Note citee par un programme");
  writeFileSync(idPath, `${readFileSync(idPath, "utf8")}\nClient : [[note-plomberie]] <!-- client:auto -->\n`, "utf8");
  {
    const mc = await mcpSession();
    await mc.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
    await mc.ask("tools/call", { name: "brain_get", arguments: { slug: "note-lue" } });
    mc.close();
  }
  {
    // The brain's journal (journal.mjs): the read is an event, live on this
    // computer, with the notes and never the text of a question.
    const events = join(HOME, ".hypervibe-brain", "events.jsonl");
    const live = existsSync(events) ? readFileSync(events, "utf8") : "";
    check("what Claude reads is journaled, as an event of the brain's journal", /"act":"read"/.test(live) && live.includes('"notes":["note-lue"]'), live.slice(0, 300));
    check("and the journal never keeps what a question was about", !/"(query|q|question)":/.test(live), live.slice(0, 300));
    // Another computer's reads, arrived by the synchronisation in its journal file, count too.
    mkdirSync(join(BRAIN, "journal"), { recursive: true });
    appendFileSync(join(BRAIN, "journal", "portable.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), id: "portable01", act: "read", who: "ai:x", tool: "brain_get", notes: ["note-lue"] })}\n`, "utf8");
  }
  r = node("review.mjs", ["--apply"]);
  check("a seed Claude read is promoted; one linked only by a program's line is not", readFileSync(join(BRAIN, "vault", "notes", "note-lue.md"), "utf8").includes("status: trusted") && readFileSync(join(BRAIN, "vault", "notes", "note-plomberie.md"), "utf8").includes("status: seed"));
  const promoLog = readFileSync(join(BRAIN, "index", "promotions.jsonl"), "utf8");
  check("every promotion is kept with its reason", promoLog.includes('"slug":"vieille-note"') && promoLog.includes('"links":["le-travail-se-deplace"]') && /"slug":"note-lue".*"reads":2/.test(promoLog), promoLog);
  check("the review writes its report", r.ok && existsSync(join(BRAIN, "reviews", `${localDay()}.md`)), r.out);
  check("an old seed linked from another day is promoted", readFileSync(notePath, "utf8").includes("status: trusted"), readFileSync(notePath, "utf8"));
  check("an idea is never promoted by the machine", readFileSync(idPath, "utf8").includes("status: seed"));
  report = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
  check("the report is in the brain's language", report.startsWith("# Review of Camille's brain"), report.slice(0, 80));
  check("the report lists the dead source", report.includes("[[brouillon-perdu]]") && report.includes("2 source(s) pointing to a file"), report);
  check("a source under a scheme of this computer is followed: gone, or modified since its note, marked new the first time", report.includes("[[esquisse-perdue]]: atelier://esquisse.md **(new)**") && /\[\[plan-du-roman\]\] \(seed\): source modified on [0-9-]+, note touched on [0-9-]+ \*\*\(new\)\*\*/.test(report), report);
  check("what the review showed is stamped with the day it first appeared", JSON.parse(readFileSync(join(BRAIN, "index", "signals.json"), "utf8"))["dead:esquisse-perdue"] === localDay());
  check("the report tells what was worked on", report.includes("projet-roman: 1 session(s)") && report.includes("site-web"), report);
  check("with the titles of the sessions, and the work of the other computer", report.includes(`session "Refaire la page d'accueil"`) && report.includes("atelier-photo (portable)") && report.includes(`session "Trier les photos de Lisbonne"`) && !report.includes("never read"), report);
  check("with the commits of the week, read from the project's own history", /- brain: 1 session\(s\), last on [0-9-]+, [0-9]+ commit\(s\)/.test(report) && report.includes("  - capture: "), report);
  check("the report lists what moved in the watched folders", report.includes("chapitre-1.md"), report);
  r = node("status.mjs", ["--json"]);
  st = json(r.out);
  check("status reads the brain and its components", r.ok && st.notes === 9 && st.git === true && st.remote === false && st.dir === BRAIN.replace(/\\/g, "/") && st.sources.journal === true, r.out);

  }
  if (await scene("cold-copy")) {
  // ---- the cold copy
  node("save.mjs", ["--now"]);
  {
    const mine = readdirSync(join(BRAIN, "journal")).filter((n) => n !== "portable.jsonl");
    const folded = mine.length === 1 ? readFileSync(join(BRAIN, "journal", mine[0]), "utf8") : "";
    check("the save folds this computer's journal into the brain, titles resolved, and commits it", mine.length === 1 && folded.includes("Refaire la page d'accueil") && !folded.includes("transcript") && git("status", "--porcelain", "journal").trim() === "", `${mine} ${folded.slice(0, 300)}`);
    node("save.mjs", ["--now"]);
    const twice = readFileSync(join(BRAIN, "journal", mine[0]), "utf8");
    check("folded once, never twice", twice.split("Refaire la page d'accueil").length === 2 && twice.startsWith(folded), twice.slice(0, 300));
    check("the brain's journal of each computer, reads included, is kept in git too", git("status", "--porcelain", "journal").trim() === "" && git("ls-files", "journal").includes(".jsonl") && /"act":"read"/.test(twice), git("status", "--porcelain"));
    // ONE FILE A MONTH, AND NOTHING THAT SAYS NOTHING (2026-11-18, journal.mjs).
    {
      const month = new Date().toISOString().slice(0, 7);
      const me = mine[0]?.replace(/-\d{4}-\d{2}\.jsonl$/, "") ?? "";
      check("the brain's journal is one file a computer and a month", mine[0] === `${me}-${month}.jsonl` && me.length > 0, mine.join());
      const journalUrl = JSON.stringify(pathToFileURL(join(SCRIPTS, "journal.mjs")).href);
      const log = (e) => run("node", ["--input-type=module", "-e", `import { logEvent } from ${journalUrl}; logEvent(${JSON.stringify({ ...e, mark: "banc-quiet" })});`]);
      const since = new Date(Date.now() - 60_000).toISOString();
      log({ act: "signal", who: "source:essai-du-banc", what: "running" });
      log({ act: "run", who: "source:essai-du-banc", step: true, ok: true });
      log({ act: "run", who: "source:essai-du-banc", created: 0, updated: 0, zones: 0 });
      log({ act: "run", who: "hub", sources: ["essai-du-banc"], wrote: [], waiting: [] });
      log({ act: "run", who: "source:essai-du-banc", created: 1, updated: 0, zones: 0 });
      log({ act: "run", who: "source:essai-du-banc", step: true, ok: false });
      node("save.mjs", ["--now"]);
      const joined = readFileSync(join(BRAIN, "journal", mine[0]), "utf8").split("\n").filter((l) => l.includes('"mark":"banc-quiet"')).map((l) => JSON.parse(l));
      check(
        "a line that says nothing happened never joins the brain: of six, the run that wrote and the one that failed do",
        joined.length === 2 && joined.some((e) => e.created === 1) && joined.some((e) => e.ok === false) && git("status", "--porcelain", "journal").trim() === "",
        JSON.stringify(joined),
      );
      r = run("node", ["--input-type=module", "-e", `import { readEvents } from ${journalUrl}; console.log(JSON.stringify(readEvents({ since: process.argv[1] }).filter((e) => e.mark === "banc-quiet").length));`, since]);
      check("the quiet lines are still read on this computer, from its live file, and none is counted twice", r.ok && json(r.out) === 6, r.out + r.err);
      // The file of before the months is cut into months by its computer, at its next save.
      const before = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
      const old = join(BRAIN, "journal", `${me}.jsonl`);
      writeFileSync(old, `${JSON.stringify({ at: `${before}-15T10:00:00.000Z`, id: "avant01", act: "signal", who: "banc", what: "a-line-of-before" })}\n${JSON.stringify({ at: `${before}-15T10:01:00.000Z`, id: "avant02", act: "signal", who: "source:essai-du-banc", what: "running" })}\n`, "utf8");
      // As on a real brain, git knows that file: its removal is part of the save.
      git("add", `journal/${me}.jsonl`);
      git("commit", "-q", "-m", "a journal of before the months");
      node("save.mjs", ["--now"]);
      const cut = existsSync(join(BRAIN, "journal", `${me}-${before}.jsonl`)) ? readFileSync(join(BRAIN, "journal", `${me}-${before}.jsonl`), "utf8") : "";
      check(
        "a journal of before the months is cut into months at the next save, its quiet lines left out, and the save commits it",
        !existsSync(old) && cut.includes("avant01") && !cut.includes("avant02") && git("status", "--porcelain", "journal").trim() === "" && !git("ls-files", "journal").includes(`${me}.jsonl`),
        `${cut} ${git("status", "--porcelain", "journal")} ${git("ls-files", "journal")}`,
      );
      r = run("node", ["--input-type=module", "-e", `import { readEvents } from ${journalUrl}; const all = readEvents({}).some((e) => e.id === "avant01"); const recent = readEvents({ since: process.argv[1] }).some((e) => e.id === "avant01"); console.log(JSON.stringify({ all, recent }));`, since]);
      check("a question about the last days does not open last month's file, a question without a date reads it", r.ok && json(r.out).all === true && json(r.out).recent === false, r.out + r.err);
    }
  }
  r = node("cold-copy.mjs");
  cold = json(r.out);
  check("the cold copy writes a verified archive", r.ok && cold.ok && existsSync(cold.archive ?? "") && cold.commits > 3, r.out);
  r = node("cold-copy.mjs");
  check("a second one the same week is skipped", r.ok && json(r.out).skipped?.includes("recent"), r.out);
  const RESTORED = join(BASE, "restaure");
  r = run("git", ["clone", "-q", cold.archive, RESTORED]);
  check("the archive restores the whole brain", r.ok && existsSync(join(RESTORED, "vault", "ideas", "le-travail-se-deplace.md")), r.out);

  }
  if (await scene("viz")) {
  // ---- seeing the brain
  r = node("viz.mjs", ["detect"]);
  check("no Hypervibe in the fake home", r.ok && json(r.out).hypervibe === false, r.out);
  const HV = join(HOME, ".claude", "plugins", "marketplaces", "x", "hypervibe", ".claude-plugin");
  mkdirSync(HV, { recursive: true });
  writeFileSync(join(HV, "plugin.json"), JSON.stringify({ name: "hypervibe", version: "9.9.9" }), "utf8");
  r = node("viz.mjs", ["detect"]);
  check("Hypervibe is detected where Claude installs plugins", r.ok && json(r.out).hypervibe === true, r.out);
  r = node("viz.mjs", ["build"]);
  page = existsSync(join(BRAIN, "viz", "brain.html")) ? readFileSync(join(BRAIN, "viz", "brain.html"), "utf8") : "";
  check("the simple viewer is written", r.ok && page.includes("Projet de roman") && !page.includes("HVBRAIN_DATA*/null"), r.out);
  check("the viewer never holds a private note's content", page.includes("Dossier santé") && !page.includes("Mes notes de santé"));
  check("the viewer stays out of git", git("check-ignore", "viz/brain.html") === "viz/brain.html");
  const exported = json(node("viz.mjs", ["export"]).out);
  const privNode = exported.nodes.find((n) => n.id === "dossier-sante");
  check("the app's data: private notes without content, no local path", privNode?.excerpt === "" && privNode.private === true && exported.nodes.every((n) => !("file" in n)) && exported.nodes.find((n) => n.id === "brouillon-perdu")?.source === "", JSON.stringify(privNode));
  const APP = join(BASE, "app");
  mkdirSync(APP, { recursive: true });
  run("git", ["init", "-q", "-b", "main"], { cwd: APP });
  writeFileSync(join(APP, "README.md"), "app\n", "utf8");
  run("git", ["add", "README.md"], { cwd: APP });
  run("git", ["commit", "-q", "-m", "app"], { cwd: APP });
  r = node("components.mjs", ["viz-app", APP]);
  check("the app is recorded, without automatic push unless asked", r.ok && json(r.out).modules.vizApp.autoPush === false, r.out);
  r = node("viz.mjs", ["publish-app"]);
  check("the app's data is committed in the app, not pushed", r.ok && json(r.out).committed === true && json(r.out).pushed === false && existsSync(join(APP, "data", "brain-graph.json")), r.out);
  r = node("viz.mjs", ["publish-app"]);
  check("unchanged data is not committed again", r.ok && json(r.out).unchanged === true, r.out);

  }
  if (await scene("routines")) {
  // ---- the routines, never armed for real here
  r = node("routines.mjs", ["arm", "--time", "21:30", "--dry-run"]);
  const armed = json(r.out);
  check("arming the evening save (dry run) names its own test task", r.ok && armed.ok && armed.armed.endsWith(" banc") && armed.time === "21:30", r.out);
  r = node("routines.mjs", ["arm", "--time", "25:00", "--dry-run"]);
  check("a wrong time is refused", !r.ok, r.out);
  r = node("routines.mjs", ["note-review", "--when", "dimanche 18:00", "--id", "brain-weekly-review"]);
  check("the weekly review is recorded", r.ok && json(r.out).review.when === "dimanche 18:00", r.out);
  r = node("routines.mjs", ["run-now"]);
  now = json(r.out);
  check("the evening save runs through its launcher, all its steps", r.ok && ["save.mjs exit 0", "cold-copy.mjs exit 0", "viz.mjs exit 0"].every((s) => now.lastRun.some((l) => l.includes(s))), r.out);
  // Everything was saved just before the cold copy: nothing is left behind.
  check("and nothing is left unsaved in the brain", git("status", "--porcelain") === "", git("status", "--porcelain"));
  const logToday = join(HOME, ".hypervibe-brain", "logs", `nightly-${localDay()}.log`);
  const linesBefore = readFileSync(logToday, "utf8").trim().split("\n").length;
  r = run("node", [join(HOME, ".hypervibe-brain", "nightly.mjs")]);
  check("started again by the scheduler the same evening, the save does nothing", r.ok && readFileSync(logToday, "utf8").trim().split("\n").length === linesBefore, readFileSync(logToday, "utf8"));
  writeFileSync(join(HOME, ".hypervibe-brain", "nightly.lock"), String(process.pid), "utf8");
  r = run("node", [join(HOME, ".hypervibe-brain", "nightly.mjs"), "--force"]);
  check("two saves never run at once", r.ok && readFileSync(logToday, "utf8").includes("another save is running"), readFileSync(logToday, "utf8"));
  unlinkSync(join(HOME, ".hypervibe-brain", "nightly.lock"));
  r = node("routines.mjs", ["state", "--json"]);
  check("state reports the review and the last run", r.ok && json(r.out).review?.when === "dimanche 18:00" && json(r.out).lastLog, r.out);

  }
  if (await scene("live-view")) {
  // ---- the live view (live/, scripts/live.mjs): on a brain just created, in a
  // home of its own (nothing of the bench's main brain moves), on a free port.
  // Its start with the session is one file under that home: turned on for
  // real here, it touches no scheduler and nothing of the person's.
  {
    const LIVE_HOME = join(BASE, "home-live");
    const FRESH = join(BASE, "brain-live");
    mkdirSync(LIVE_HOME, { recursive: true });
    const port = await new Promise((res) => {
      const s = createServer().listen(0, "127.0.0.1", () => {
        const p = s.address().port;
        s.close(() => res(p));
      });
    });
    const liveEnv = { HVBRAIN_HOME: LIVE_HOME, BRAIN_LIVE_PORT: String(port), HVBRAIN_VAULT: "off", HVBRAIN_CLAUDE: "no-claude-for-the-bench" };
    const live = (...a) => node("live.mjs", a, { env: liveEnv });
    const at = `http://127.0.0.1:${port}`;
    // The view answers only who shows its token (2026-11-21): the file it
    // writes at its start, in the home of this scene.
    const liveToken = () => {
      try {
        return String(JSON.parse(readFileSync(join(LIVE_HOME, ".hypervibe-brain", "live-token.json"), "utf8")).token ?? "");
      } catch {
        return "";
      }
    };
    const get = async (route, headers = {}) => {
      try {
        const res = await fetch(`${at}${route}`, { headers: { connection: "close", "x-brain-token": liveToken(), ...headers }, signal: AbortSignal.timeout(20_000) });
        return { status: res.status, text: await res.text() };
      } catch (e) {
        return { status: 0, text: String(e?.cause?.code ?? e?.message ?? e) };
      }
    };
    const body = (x) => {
      try {
        return JSON.parse(x.text);
      } catch {
        return null;
      }
    };
    try {
      // Nothing but Node and its own files: what makes it start with no install step.
      const foreign = [];
      const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          if (e.name === "node_modules") continue;
          const p = join(dir, e.name);
          if (e.isDirectory()) walk(p);
          else if (/\.m?js$/.test(e.name)) for (const m of readFileSync(p, "utf8").matchAll(/^\s*(?:import|export)\b[^"'\n]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm)) if (!/^(node:|\.{1,2}\/)/.test(m[1] ?? m[2])) foreign.push(`${e.name}: ${m[1] ?? m[2]}`);
        }
      };
      walk(join(PLUGIN, "live"));
      check("the live view imports nothing but Node and its own files", foreign.length === 0, foreign.join(" | "));
      const ignored = readFileSync(join(PLUGIN, ".gitattributes"), "utf8");
      check("what only serves its type check is left out of the published plugin", ["/live/package.json", "/live/pnpm-lock.yaml", "/live/tsconfig.json", "/live/page/tsconfig.json", "/live/contract.d.ts"].every((f) => ignored.includes(`${f} export-ignore`)), ignored);

      r = node("init.mjs", ["--dir", FRESH, "--name", "Neuf", "--domains", "work,family", "--lang", "en", "--no-git"], { env: liveEnv });
      check("a brain just created, in a home of its own", r.ok && json(r.out).ok, r.out);
      const version = JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version;
      let st = json(live("state").out);
      check("live state before anything: not installed, not running, this brain, the plugin's version", st.installed === false && st.running === false && st.port === port && st.brain === FRESH.replace(/\\/g, "/") && st.version === version, JSON.stringify(st));
      r = live("on", "--dry-run");
      const dry = json(r.out);
      const startupFile = dry.startup ?? "";
      check("live on (dry run) says the file it would write under this home, and writes nothing", r.ok && dry.ok && dry.dryRun === true && startupFile.startsWith(LIVE_HOME.replace(/\\/g, "/")) && /banc/.test(startupFile) && !existsSync(startupFile) && !existsSync(join(LIVE_HOME, ".hypervibe-brain", "live-launch.mjs")) && json(live("state").out).running === false, r.out);
      r = live("off", "--dry-run");
      check("live off (dry run) stops nothing", r.ok && json(r.out).dryRun === true && json(r.out).wouldStop === null, r.out);
      r = live("open", "--dry-run");
      check("live open (dry run) says how the window would open, and opens nothing", r.ok && json(r.out).dryRun === true && json(r.out).wouldStart === true && ["installed-app", "app-window", "browser"].includes(json(r.out).wouldOpen) && json(live("state").out).running === false, r.out);

      // The server alone, on the brand new brain.
      r = live("start");
      const started = json(r.out);
      check("the view's server starts on a brain just created", r.ok && started.ok && started.running && started.started === true && Number.isInteger(started.pid), `${r.out} ${existsSync(join(LIVE_HOME, ".hypervibe-brain", "logs", "live-server.log")) ? readFileSync(join(LIVE_HOME, ".hypervibe-brain", "logs", "live-server.log"), "utf8").slice(-600) : ""}`);
      const ping = await get("/api/ping");
      const [who, servedBrain, more] = ping.text.split("\n");
      check("it says who it is, for which brain, and from which copy of the plugin", ping.status === 200 && who === "brain-live" && servedBrain === FRESH.replace(/\\/g, "/") && JSON.parse(more).pid === started.pid && JSON.parse(more).version === version, ping.text);
      const routes = {};
      for (const route of ["vocabulary", "map", "tools", "settings", "judges", "usage", "setup", "next", "catalogue", "contacts", "territories"]) routes[route] = await get(`/api/${route}`);
      check("every reading route answers on a brain with nothing in it", Object.values(routes).every((x) => x.status === 200 && body(x) !== null), Object.entries(routes).map(([k, x]) => `${k}: ${x.status} ${x.text.slice(0, 80)}`).join(" | "));
      const setup = body(routes.setup);
      check("the map is empty, the only tool is Claude Code, and nothing is to set",
        body(routes.vocabulary)?.lang === "en" && body(routes.map)?.nodes.length === 0 && body(routes.tools)?.tools.map((x) => x.id).join() === "claude-code" && body(routes.settings)?.sources.length === 0 && body(routes.settings)?.judges.length === 0 && body(routes.judges)?.judges.length === 0 && body(routes.usage)?.length === 0,
        JSON.stringify([body(routes.map), body(routes.tools), body(routes.settings)]).slice(0, 600));
      check("it says what this brain lacks: no source, no judge, the hub off", setup?.sources === 0 && setup.judges === 0 && setup.hub.on === false && setup.hub.running === false && setup.hub.needed === false && setup.hub.here === true && setup.noToken.length === 0, routes.setup.text);
      const page = await get("/");
      check("it serves its page", page.status === 200 && page.text.includes('id="welcome"') && (await get("/setup.js")).status === 200 && (await get("/server.mjs")).status === 404, page.text.slice(0, 200));
      // Every module the page reaches is asked for at once (index.html, modulepreload): one added and not listed would be discovered late again.
      {
        const pageDir = join(PLUGIN, "live", "page");
        const reached = new Set(["main.js"]);
        for (const queue = ["main.js"]; queue.length; ) {
          const at = queue.shift();
          const dir = at.includes("/") ? at.slice(0, at.lastIndexOf("/") + 1) : "";
          for (const m of readFileSync(join(pageDir, at), "utf8").matchAll(/(?:from|import)\s+["']\.\/([^"']+\.js)["']/g)) {
            if (reached.has(dir + m[1])) continue;
            reached.add(dir + m[1]);
            queue.push(dir + m[1]);
          }
        }
        reached.delete("main.js");
        const listed = new Set([...readFileSync(join(pageDir, "index.html"), "utf8").matchAll(/<link rel="modulepreload" href="([^"]+)"/g)].map((m) => m[1]));
        const missing = [...reached].filter((m) => !listed.has(m));
        const extra = [...listed].filter((m) => !reached.has(m));
        check("the page asks for every one of its modules at once, and for no other", reached.size > 20 && missing.length === 0 && extra.length === 0, `missing: ${missing.join(", ")} / not used: ${extra.join(", ")}`);
      }
      const door = [await get("/api/map", { origin: "http://example.com" }), await get("/api/map", { "sec-fetch-site": "cross-site" }), await get("/", { origin: "http://example.com" }), await get("/api/now?id=claude-code"), await get("/api/undo?id=x")];
      check("the door still refuses a foreign origin, and an effect is never a GET", door.map((x) => x.status).join() === "403,403,403,405,405", door.map((x) => `${x.status} ${x.text.slice(0, 40)}`).join(" | "));

      // The first note of a brain that had no index, its first sources: the view
      // tells its open pages (the watching of index/ and of sources/ used to fail
      // at start on a new brain, and was never set up again).
      const events = [];
      const stream = new AbortController();
      fetch(`${at}/api/stream`, { headers: { "x-brain-token": liveToken() }, signal: stream.signal }).then(async (res) => {
        for await (const chunk of res.body) events.push(String(Buffer.from(chunk)));
      }).catch(() => {});
      await new Promise((res) => setTimeout(res, 300));
      r = node("capture.mjs", ["--title", "First thought", "--type", "idea", "--domains", "work", "--source", "the bench", "--no-commit"], { env: liveEnv, input: "A first note, to see the map light up." });
      node("build.mjs", ["--quiet"], { env: liveEnv });
      for (let t = 0; t < 100 && !events.join("").includes("event: map"); t++) await new Promise((res) => setTimeout(res, 150));
      check("the first note of a new brain reaches the open pages without a restart", r.ok && events.join("").includes("event: map") && body(await get("/api/map"))?.nodes.length === 1, `${r.out} ${events.join("").slice(-500)}`);

      // A note opens at once: from the index as it is, and from its own file when it changed since.
      {
        const one = body(await get("/api/note?slug=first-thought"));
        const noteFile = join(FRESH, one?.file ?? "nowhere");
        check("a note opens from the index", one?.title === "First thought" && /A first note/.test(one.body ?? "") && existsSync(noteFile), JSON.stringify(one).slice(0, 300));
        writeFileSync(noteFile, `${readFileSync(noteFile, "utf8").trimEnd()}\n\nA second thought, written by hand a moment ago.\n`, "utf8");
        const t0 = Date.now();
        const again = body(await get("/api/note?slug=first-thought"));
        check("a note changed since the index was built shows its new text at once, without waiting for the index", /A second thought, written by hand/.test(again?.body ?? "") && again.title === "First thought" && Date.now() - t0 < 2000, JSON.stringify(again).slice(0, 300));
        check("a note that does not exist says so", typeof body(await get("/api/note?slug=nothing-of-that-name"))?.error === "string");
      }

      // The standard sources: each judge has a tool of the view to carry its card in the settings.
      mkdirSync(join(BASE, "watched-live"), { recursive: true });
      node("components.mjs", ["watch", "add", join(BASE, "watched-live")], { env: liveEnv });
      const i1 = node("sources.mjs", ["install", "conversations", "--days", "0"], { env: liveEnv });
      const i2 = node("sources.mjs", ["install", "documents"], { env: liveEnv });
      for (let t = 0; t < 100 && !events.join("").includes("event: tools"); t++) await new Promise((res) => setTimeout(res, 150));
      stream.abort();
      check("and so do its first sources", events.join("").includes("event: tools"), events.join("").slice(-500));
      // (What the view knows of the tools is kept two seconds: asked once both pairs are surely seen.)
      await new Promise((res) => setTimeout(res, 2200));
      const tools = body(await get("/api/tools"))?.tools ?? [];
      const set = body(await get("/api/settings"));
      const judgeTools = Object.fromEntries((set?.judges ?? []).map((j) => [j.name, j.tools]));
      check(
        "the standard judges have their card: conversations on Claude Code, documents on the folders the brain watches",
        i1.ok && i2.ok && judgeTools.conversations?.join() === "claude-code" && judgeTools.documents?.join() === "folders" && tools.some((x) => x.id === "folders" && x.children?.length === 1) && tools.some((x) => x.parent === "folders" && x.name === "watched-live" && x.paths?.length === 1) && set.sources.map((x) => x.name).sort().join() === "conversations-watch,documents-watch",
        JSON.stringify([judgeTools, tools.map((x) => [x.id, x.parent, x.name]), i1.out, i2.out]).slice(0, 900),
      );
      // The ring of a rhythm is the clock's: from one tick to the next, the same arc for every source of that rhythm.
      {
        const ring = body(await get("/api/tool?id=claude-code"))?.next;
        const other = body(await get("/api/tool?id=folders"))?.next;
        check("the ring of a tool runs from one tick of the clock to the next, the same for every source of that rhythm", ring?.due - ring?.start === 30 * 60_000 && other?.start === ring.start && other.due === ring.due, JSON.stringify([ring, other]));
      }
      const after = body(await get("/api/setup"));
      check("with sources that only the hub runs, the view knows the hub is needed and off", after?.sources === 2 && after.judges === 2 && after.hub.needed === true && after.hub.running === false, JSON.stringify(after));
      writeFileSync(join(FRESH, "sources", "conversations", "state.json"), JSON.stringify({ lastRun: new Date().toISOString(), lastError: "no lasting token for Claude in the vault (item CLAUDE_CODE, field oauth_token): run `claude setup-token`, then store it", failures: 1 }), "utf8");
      check("a judge that found no token for Claude is named", body(await get("/api/setup"))?.noToken.join() === "conversations");

      // Turned on for real: the file the session reads, the launcher, and a
      // server that stays (the one above would stop with its last window).
      r = live("on");
      const turnedOn = json(r.out);
      check("live on installs the start with the session and replaces the server by one that stays", r.ok && turnedOn.ok && turnedOn.installed && turnedOn.running && turnedOn.replaced === started.pid && turnedOn.pid !== started.pid && existsSync(startupFile) && existsSync(join(LIVE_HOME, ".hypervibe-brain", "live-launch.mjs")), r.out);
      st = json(live("state").out);
      const kept = JSON.parse(readFileSync(join(LIVE_HOME, ".hypervibe-brain", "config.json"), "utf8"));
      check("state says it is installed and runs this copy of the plugin, and the port is kept for the launcher and the hook", st.installed && st.running && st.current === true && st.serving?.permanent === true && kept.routines?.live?.port === port && kept.pluginRoot === PLUGIN.replace(/\\/g, "/"), JSON.stringify([st, kept.routines]));
      r = live("on");
      check("turned on twice, nothing is started again", r.ok && json(r.out).pid === turnedOn.pid && json(r.out).replaced === undefined, r.out);
      // A view of another brain on the port is never ours to open or to stop.
      r = node("live.mjs", ["start"], { env: { ...liveEnv, HVBRAIN_DIR: BRAIN } });
      check("a port that serves another brain is refused, not taken", r.ok && json(r.out).ok === false && /another brain/.test(json(r.out).error), r.out);
      r = node("live.mjs", ["stop"], { env: { ...liveEnv, HVBRAIN_DIR: BRAIN } });
      check("and its server is not stopped by someone else's brain", r.ok && json(r.out).stopped === null && (await get("/api/ping")).status === 200, r.out);
      r = live("off");
      const turnedOff = json(r.out);
      check("live off removes the start with the session and stops the server it started, cleanly", r.ok && turnedOff.ok && turnedOff.stopped === turnedOn.pid && !existsSync(startupFile) && !existsSync(join(LIVE_HOME, ".hypervibe-brain", "live-launch.mjs")) && (await get("/api/ping")).status === 0 && json(live("state").out).installed === false, `${r.out} ${JSON.stringify(await get("/api/ping"))}`);
    } finally {
      // Whatever happened above, no server of the bench is left behind.
      live("stop");
    }
  }

  }
  if (await scene("own-sources")) {
  // ---- the person's own sources
  // A source program for the bench: it prints the items of data.json, and
  // fails when a file named "fail" is next to it.
  r = node("sources.mjs", ["add", "lectures", "--kind", "script", "--every", "day", "--type", "source", "--domains", "ecriture", "--description", "My reading list"]);
  check("a source of one's own is created, with its program and its contract", r.ok && existsSync(join(lectures, "run.mjs")) && readFileSync(join(lectures, "run.mjs"), "utf8").includes("ONE JSON OBJECT PER LINE"), r.out);
  r = node("sources.mjs", ["add", "lectures", "--kind", "script", "--type", "source", "--domains", "ecriture"]);
  check("never twice the same source", !r.ok, r.out);
  r = node("sources.mjs", ["add", "autre", "--kind", "script", "--type", "pensee", "--domains", "ecriture"]);
  check("a source must produce one of the brain's types", !r.ok, r.out);
  writeFileSync(join(lectures, "run.mjs"), SOURCE_PROGRAM, "utf8");
  writeFileSync(join(lectures, "data.json"), JSON.stringify([
    { id: "calvino", title: "Les Villes invisibles", body: "Calvino : chaque ville comme un état d'âme.", fields: { url: "https://example.org/calvino", auteur: "Italo Calvino" }, created: "2025-03-02" },
    { id: "perec", title: "Espèces d'espaces", body: "Perec : habiter, nommer, décrire." },
    { id: "bad", title: "Mal rangé", body: "x", type: "pensee" },
  ]), "utf8");
  const beforeSources = notesCount();
  r = node("sources.mjs", ["test", "lectures"]);
  tested = json(r.out);
  check("its test runs it, checks every note, and says what it would do", r.ok && tested.items === 3 && tested.new === 2 && tested.refused.length === 1 && tested.sample[0].title === "Les Villes invisibles", r.out);
  check("and writes nothing", notesCount() === beforeSources);
  r = node("sources.mjs", ["run", "lectures"]);
  check("a program never approved on this computer does not run", r.ok && json(r.out).runs[0].skipped?.includes("not approved"), r.out);
  check("and nothing is written", notesCount() === beforeSources);
  node("sources.mjs", ["trust", "lectures"]);
  r = node("sources.mjs", ["run", "lectures"]);
  const run1 = json(r.out).runs[0];
  check("approved, it runs: two notes created, the wrong one refused and named", r.ok && run1.created === 2 && run1.refused.length === 1 && run1.refused[0].startsWith("bad:"), r.out);
  const calvino = readFileSync(join(BRAIN, "vault", "sources", "les-villes-invisibles.md"), "utf8");
  check("its notes carry their origin, their own date and their extra fields", calvino.includes('source: "source:lectures:calvino"') && calvino.includes("created: 2025-03-02") && calvino.includes('url: "https://example.org/calvino"') && calvino.includes("status: seed"), calvino);
  r = node("sources.mjs", ["run", "lectures"]);
  check("run again, nothing is created twice", r.ok && json(r.out).runs[0].created === 0 && json(r.out).runs[0].unchanged === 2, r.out);
  r = node("sources.mjs", ["run", "--due"]);
  check("a daily source that succeeded today is not due again", r.ok && !json(r.out).runs.some((x) => x.name === "lectures"), r.out);
  writeFileSync(join(lectures, "run.mjs"), `${SOURCE_PROGRAM}// changed\n`, "utf8");
  r = node("sources.mjs", ["run", "lectures"]);
  check("a program that changed must be approved again", r.ok && json(r.out).runs[0].skipped?.includes("not approved"), r.out);
  node("sources.mjs", ["trust", "lectures"]);
  writeFileSync(join(lectures, "fail"), "", "utf8");
  const beforeFail = notesCount();
  r = node("sources.mjs", ["run", "lectures"]);
  check("a source that fails writes nothing, even what it printed before failing", r.ok && json(r.out).runs[0].ok === false && json(r.out).runs[0].error.includes("the feed is down") && notesCount() === beforeFail, r.out);
  check("and keeps the date of its last success", JSON.parse(readFileSync(join(lectures, "state.json"), "utf8")).lastSuccess && JSON.parse(readFileSync(join(lectures, "state.json"), "utf8")).lastError.includes("the feed is down"));
  unlinkSync(join(lectures, "fail"));

  // A source allowed to refresh its own seeds, never a validated note.
  node("sources.mjs", ["add", "posts", "--kind", "script", "--every", "week", "--type", "publication", "--domains", "travail", "--updates"]);
  writeFileSync(join(posts, "run.mjs"), SOURCE_PROGRAM, "utf8");
  const postData = (likes) => writeFileSync(join(posts, "data.json"), JSON.stringify([{ id: "p1", title: "Mon post sur le travail", body: `Le post. ${likes} likes.`, fields: { likes } }]), "utf8");
  postData(10);
  node("sources.mjs", ["trust", "posts"]);
  node("sources.mjs", ["run", "posts"]);
  const postPath = join(BRAIN, "vault", "publications", "mon-post-sur-le-travail.md");
  postData(25);
  r = node("sources.mjs", ["run", "posts"]);
  check("a source refreshes its own seed", r.ok && json(r.out).runs[0].updated === 1 && readFileSync(postPath, "utf8").includes("25 likes") && readFileSync(postPath, "utf8").includes("likes: 25"), r.out);
  writeFileSync(postPath, readFileSync(postPath, "utf8").replace("status: seed", "status: trusted"), "utf8");
  postData(99);
  r = node("sources.mjs", ["run", "posts"]);
  check("but never a note the person validated", r.ok && json(r.out).runs[0].updated === 0 && readFileSync(postPath, "utf8").includes("25 likes"), r.out);

  // A source done by Claude.
  r = node("sources.mjs", ["add", "linkedin", "--kind", "claude", "--every", "week", "--type", "publication", "--domains", "travail"]);
  check("a source done by Claude gets its instructions", r.ok && existsSync(join(BRAIN, "sources", "linkedin", "instructions.md")), r.out);
  r = node("sources.mjs", ["run", "linkedin"]);
  check("it is never run as a program", r.ok && json(r.out).runs[0].skipped?.includes("Claude"), r.out);
  node("sources.mjs", ["mark", "linkedin", "--ok", "--created", "3"]);
  listed = json(node("sources.mjs", ["list", "--json"]).out).sources;
  check("the list tells each source's kind, approval and state", listed.find((x) => x.name === "linkedin")?.lastSuccess && listed.find((x) => x.name === "lectures")?.trusted === true && listed.find((x) => x.name === "lectures")?.notes === 2, JSON.stringify(listed));

  }
  if (await scene("hub")) {
  // ---- the live hub (hub.mjs, P7): a rhythm, a flag, a source that follows
  // another, and the vault as a queue.
  {
    const hub = (env = {}) => json(node("hub.mjs", ["--once"], { env }).out);
    const sourceDir = (n) => join(BRAIN, "sources", n);
    const define = (n, extra) => writeFileSync(join(sourceDir(n), "source.json"), JSON.stringify({ ...JSON.parse(readFileSync(join(sourceDir(n), "source.json"), "utf8")), ...extra }, null, 2), "utf8");
    node("sources.mjs", ["add", "veille", "--kind", "script", "--every", "15m", "--type", "source", "--domains", "ecriture"]);
    writeFileSync(join(sourceDir("veille"), "run.mjs"), SOURCE_PROGRAM, "utf8");
    writeFileSync(join(sourceDir("veille"), "data.json"), JSON.stringify([{ id: "v1", title: "Une veille du matin", body: "Ce que la veille a vu ce matin." }]), "utf8");
    node("sources.mjs", ["trust", "veille"]);
    node("sources.mjs", ["add", "suite", "--kind", "script", "--every", "day", "--type", "source", "--domains", "ecriture"]);
    writeFileSync(join(sourceDir("suite"), "run.mjs"), SOURCE_PROGRAM, "utf8");
    writeFileSync(join(sourceDir("suite"), "data.json"), "[]", "utf8");
    define("suite", { after: ["source:veille"] });
    node("sources.mjs", ["trust", "suite"]);
    let h = hub();
    const veillePath = join(BRAIN, "vault", "sources", "une-veille-du-matin.md");
    check("the hub runs a source whose rhythm is due, and the one that follows it", h.runs?.some((x) => x.name === "veille" && x.wrote) && h.runs?.some((x) => x.name === "suite") && existsSync(veillePath), JSON.stringify(h));
    check("what the source wrote is committed on this computer, without a push", git("status", "--porcelain", "vault/sources/une-veille-du-matin.md").trim() === "" && git("log", "-1", "--format=%s").length > 0, git("status", "--porcelain"));
    check("a source of the evening's rhythm is left to the evening", !h.runs?.some((x) => x.name === "lectures"), JSON.stringify(h));
    h = hub();
    check("run again at once, nothing is due", (h.runs ?? []).length === 0, JSON.stringify(h));
    const dueDir = join(HOME, ".hypervibe-brain", "due");
    mkdirSync(dueDir, { recursive: true });
    writeFileSync(join(dueDir, "veille"), "{}", "utf8");
    h = hub();
    check("a flag (a file moved, a skill ran) makes the source due at the next beat", h.runs?.some((x) => x.name === "veille") && !existsSync(join(dueDir, "veille")), JSON.stringify(h));
    define("veille", { needs: ["SOME_KEY"] });
    writeFileSync(join(dueDir, "veille"), "{}", "utf8");
    h = hub({ HVBRAIN_HUB_VAULT: "locked" });
    const queued = JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "queue.json"), "utf8"));
    check("vault locked: a source that needs a key waits in the queue, nothing runs", h.waiting?.includes("veille") && !(h.runs ?? []).some((x) => x.name === "veille") && queued.veille && !JSON.stringify(queued).includes("SOME_KEY_VALUE"), JSON.stringify(h));
    h = hub({ HVBRAIN_HUB_VAULT: "unlocked" });
    check("vault open: the queue empties", h.runs?.some((x) => x.name === "veille") && Object.keys(JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "queue.json"), "utf8"))).length === 0, JSON.stringify(h));
    const ev = readFileSync(join(HOME, ".hypervibe-brain", "events.jsonl"), "utf8");
    check("the hub's runs are in the brain's journal", /"act":"run","who":"hub"/.test(ev) && /"who":"source:veille"/.test(ev), ev.slice(-400));
    // Out of the way of the scenes that follow, which count the sources.
    rmSync(sourceDir("veille"), { recursive: true, force: true });
    rmSync(sourceDir("suite"), { recursive: true, force: true });
  }

  }
  if (await scene("facts")) {
  // ---- the machine keeps the brain live (writing rule 7): a fact added with
  // where it comes from, refused where the person's thinking is, undone in a word.
  {
    const veillePath = join(BRAIN, "vault", "sources", "une-veille-du-matin.md");
    r = node("fact.mjs", ["--note", "une-veille-du-matin", "--text", "La veille du matin passe désormais à 7 h, d'après le mail du 7 novembre.", "--from", "gmail:abc123"]);
    const factId = json(r.out).event;
    check("the machine adds a fact to a note, with where it comes from", r.ok && readFileSync(veillePath, "utf8").includes("passe désormais à 7 h") && readFileSync(veillePath, "utf8").includes("Ce que la veille a vu ce matin."), r.out);
    node("capture.mjs", ["--title", "On garde le format court", "--type", "note", "--domains", "ecriture", "--nature", "decision", "--no-commit"], { input: "Les billets restent courts." });
    const decisionPath = join(BRAIN, "vault", "notes", "on-garde-le-format-court.md");
    writeFileSync(decisionPath, readFileSync(decisionPath, "utf8").replace("status: seed", "status: trusted"), "utf8");
    r = node("fact.mjs", ["--note", "on-garde-le-format-court", "--text", "Les billets passent à trois pages, d'après une conversation.", "--from", "claude://chat/x"]);
    check("but not to a validated decision: the person's thinking, it only proposes", !r.ok && /thinking/.test(r.out) && !readFileSync(decisionPath, "utf8").includes("trois pages"), r.out);
    node("review.mjs");
    const letter = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
    const numbers = JSON.parse(readFileSync(join(BRAIN, "reviews", `${localDay()}-writes.json`), "utf8"));
    const n = Object.entries(numbers).find(([, v]) => v === factId)?.[0];
    check("the weekly letter lists what the machine wrote, numbered, and how to undo it", letter.includes("## What the machine wrote this week") && letter.includes("fact added") && letter.includes("undo 3") && Boolean(n), letter.slice(letter.indexOf("## What the machine"), letter.indexOf("## What the machine") + 600));
    r = node("undo.mjs", [n, "--letter", localDay()]);
    check("one sentence takes it back: the fact leaves the note, the rest stays", r.ok && !readFileSync(veillePath, "utf8").includes("passe désormais à 7 h") && readFileSync(veillePath, "utf8").includes("Ce que la veille a vu ce matin."), r.out);
    r = node("undo.mjs", [factId]);
    check("never twice", !r.ok && r.out.includes("already undone"), r.out);

    // AN UNDO TAKES BACK ONE WRITE, EXACTLY (2026-11-17): from what the note
    // said before and after that write, not from the save that carried it
    // (one save an hour can carry several writes of the same note).
    {
      const lastWrite = (what, note) => readFileSync(join(HOME, ".hypervibe-brain", "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.act === "write" && e.what === what && e.note === note).at(-1)?.id;
      node("capture.mjs", ["--title", "Trois paragraphes pour un essai", "--type", "note", "--domains", "ecriture", "--no-commit"], { input: "Le premier paragraphe, tel qu'il était.\n\nLe deuxième paragraphe, qui ne bouge pas.\n\nLe troisième paragraphe, qui ne bouge pas non plus." });
      const slug = "trois-paragraphes-pour-un-essai";
      const createdId = lastWrite("created", slug);
      const path = join(BRAIN, "vault", "notes", slug + ".md");
      const bodyFile = join(BASE, "new-body.md");
      writeFileSync(bodyFile, "Le premier paragraphe, réécrit par la relecture.\n\nLe deuxième paragraphe, qui ne bouge pas.\n\nLe troisième paragraphe, qui ne bouge pas non plus.\n", "utf8");
      r = node("rewrite.mjs", ["--note", slug, "--file", bodyFile, "--why", "agreed in the bench"]);
      const rewriteId = json(r.out)?.event;
      const fact = node("fact.mjs", ["--note", slug, "--text", "Un fait arrivé après la réécriture, d'après le mail du 8 novembre.", "--from", "gmail:def456"]);
      const factAfter = json(fact.out)?.event;
      r = node("undo.mjs", [rewriteId]);
      let now = readFileSync(path, "utf8");
      check(
        "a change is undone alone, before any save: the first paragraph is back, and the fact written after it in the same note stays",
        r.ok && now.includes("Le premier paragraphe, tel qu'il était.") && !now.includes("réécrit par la relecture") && now.includes("Un fait arrivé après la réécriture") && now.includes("Le troisième paragraphe"),
        r.out + r.err + now,
      );
      writeFileSync(bodyFile, "Le premier paragraphe, réécrit une seconde fois.\n\nLe deuxième paragraphe, qui ne bouge pas.\n\nLe troisième paragraphe, qui ne bouge pas non plus.\n\nUn fait arrivé après la réécriture, d'après le mail du 8 novembre.\n", "utf8");
      r = node("rewrite.mjs", ["--note", slug, "--file", bodyFile, "--why", "agreed again"]);
      const second = json(r.out)?.event;
      writeFileSync(path, readFileSync(path, "utf8").replace("réécrit une seconde fois", "repris à la main par la personne"), "utf8");
      const held = readFileSync(path, "utf8");
      r = node("undo.mjs", [second]);
      check("the same lines changed since: the undo refuses, and the note is left as it is", !r.ok && /later change touched the same lines/.test(r.out) && readFileSync(path, "utf8") === held, r.out + r.err);
      // A title is rewritten by the same tool: the file keeps its name, the body its text.
      {
        const lf = (x) => x.replace(/\r\n/g, "\n");
        const bodyOf = (x) => lf(x).split("\n---\n").slice(1).join("\n---\n").trim();
        const beforeTitle = readFileSync(path, "utf8");
        r = node("rewrite.mjs", ["--note", slug, "--title", "Un essai en trois paragraphes", "--why", "a title in one movement"]);
        const titled = readFileSync(path, "utf8");
        check("a title is rewritten by the brain's own tool: the file keeps its name and the body its text", r.ok && json(r.out).title === "Un essai en trois paragraphes" && /^(title|titre): "Un essai en trois paragraphes"$/m.test(lf(titled)) && bodyOf(titled) === bodyOf(beforeTitle) && lastWrite("rewritten", slug) === json(r.out).event, r.out + titled.slice(0, 300));
        r = node("undo.mjs", [json(r.out).event]);
        check("and taken back like any other write", r.ok && readFileSync(path, "utf8").includes("Trois paragraphes pour un essai") && !readFileSync(path, "utf8").includes("Un essai en trois paragraphes"), r.out + r.err);
        r = node("rewrite.mjs", ["--note", slug, "--why", "nothing to change"]);
        check("a rewrite with neither a body nor a title is refused", !r.ok, r.out);
      }
      r = node("undo.mjs", [createdId]);
      check("a note that was written to since its creation is not removed in one word", !r.ok && /written to/.test(r.out) && existsSync(path), r.out + r.err);
      r = node("undo.mjs", [factAfter]);
      now = readFileSync(path, "utf8");
      check("a fact taken back leaves no empty line behind it", r.ok && !now.includes("Un fait arrivé après") && now.endsWith("non plus.\n") && !/\n\n\n/.test(now.replace(/\r\n/g, "\n")), JSON.stringify(now.slice(-120)) + r.out);
      r = node("undo.mjs", [createdId, "--force"]);
      check("asked plainly, it is removed all the same", r.ok && !existsSync(path), r.out + r.err);
    }

    // A WRITING IS IN WHEN ITS LEDGER IS EMPTY (2026-11-17): every item of the
    // source is listed when it is opened, and leaves the list by a fact (a
    // note that names it, a reason the person has seen), never by a word.
    {
      const folder = join(BASE, "ecrits-du-registre");
      mkdirSync(join(folder, "sous"), { recursive: true });
      writeFileSync(join(folder, "a.md"), "Un premier texte.", "utf8");
      writeFileSync(join(folder, "b.txt"), "Un deuxième texte.", "utf8");
      writeFileSync(join(folder, "sous", "c.md"), "Une liste de courses.", "utf8");
      writeFileSync(join(folder, "image.png"), "x", "utf8");
      r = node("ledger.mjs", ["open", "Mes essais", "--from", folder]);
      let l = json(r.out);
      check("a ledger lists every writing of a folder, its sub-folders with it, and nothing that is not a writing", r.ok && l.counted === 3 && l.left === 3 && l.name === "mes-essais", r.out + r.err);
      r = node("ledger.mjs", ["close", "mes-essais"]);
      check("a source is not closed while items are left, and the answer says how many", !r.ok && json(r.out).left === 3 && /3 item\(s\) of 3 are left/.test(r.out), r.out);
      const items = json(node("ledger.mjs", ["next", "mes-essais"]).out).next;
      node("capture.mjs", ["--title", "Un premier texte du registre", "--type", "note", "--domains", "ecriture", "--source", items[0].ref, "--no-commit"], { input: "Le premier texte, repris." });
      l = json(node("ledger.mjs", ["next", "mes-essais"]).out);
      check("a note that names an item as its source takes it off the ledger by itself", l.notes === 1 && l.left === 2 && l.next[0].n === 2, JSON.stringify(l));
      r = node("ledger.mjs", ["done", "mes-essais", "2", "--note", "une-fiche-qui-n-existe-pas"]);
      check("an item is not done on a word: the note that took it in must exist", !r.ok && /no note named/.test(r.out), r.out);
      r = node("ledger.mjs", ["done", "mes-essais", "2", "--note", "un-premier-texte-du-registre"]);
      check("an item that enriched an existing note is done by naming it", r.ok && json(r.out).left === 1, r.out);
      r = node("ledger.mjs", ["skip", "mes-essais", "3"]);
      check("nothing is set aside without its reason", !r.ok && /with its reason/.test(r.out), r.out);
      node("ledger.mjs", ["skip", "mes-essais", "3", "--why", "une liste de courses"]);
      r = node("ledger.mjs", ["close", "mes-essais"]);
      check("what was set aside is shown to the person before the source closes, with the count of each reason", !r.ok && json(r.out).reasons["une liste de courses"] === 1 && /set aside/.test(r.out), r.out);
      r = node("ledger.mjs", ["close", "mes-essais", "--agreed"]);
      check("every item with its note or its reason, and seen: the source closes", r.ok && Boolean(json(r.out).closed) && json(r.out).left === 0, r.out);
      writeFileSync(join(folder, "d.md"), "Un texte arrivé depuis.", "utf8");
      r = node("ledger.mjs", ["open", "mes-essais", "--from", folder]);
      l = json(r.out);
      check("a source taken up again keeps what was done, adds what the folder gained, and is open again", r.ok && l.resumed === true && l.added === 1 && l.counted === 4 && l.left === 1 && !l.closed, r.out);
      const writings = json(node("start.mjs", ["state"]).out).session?.blocks?.find((b) => b.id === "writings");
      check("the first big session sees the writing still open, and what it still holds", writings?.left === 1 && writings.state !== "done" && writings.ledgers?.[0]?.name === "mes-essais", JSON.stringify(writings));
      // (2026-11-23) Element by element: counted, in (a note, or set aside), left,
      // and the notes that name one of its elements as their source; the
      // existing note that took the second one in without naming it is not one.
      check(
        "the start follows a writing element by element: its total, what is in, what is left, and the notes it added to the brain",
        writings?.progress?.total === 4 && writings.progress.done === 3 && writings.progress.left === 1 && writings.progress.notes === 1 && writings.progress.unit === "files" && writings.ledgers[0].fiches === 1,
        JSON.stringify(writings),
      );
      r = node("ledger.mjs", ["close", "mes-essais", "--agreed", "--leave", "je verrai le dernier plus tard"]);
      check("the person may stop there: their words are kept with the number left unread", r.ok && json(r.out).leftUnread === 1 && json(r.out).why === "je verrai le dernier plus tard", r.out);
      // The scene leaves the brain as it found it.
      rmSync(join(BRAIN, "vault", "notes", "un-premier-texte-du-registre.md"), { force: true });
      rmSync(join(BRAIN, "sources", "_ingest"), { recursive: true, force: true });
    }
    rmSync(decisionPath, { force: true });
  }
  node("review.mjs");
  const ownReport = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
  check("the weekly report tells what each source brought", ownReport.includes("## Your own sources (3)") && ownReport.includes("- linkedin (done by Claude): last success") && ownReport.includes("- posts (read automatically)"), ownReport);
  r = node("save.mjs", ["--now"]);
  check("the sources are saved with the brain (definitions, programs, what they saw)", git("ls-files", "sources").includes("sources/lectures/run.mjs") && git("ls-files", "sources").includes("sources/lectures/seen.json"), git("ls-files", "sources"));

  }
  if (await scene("contacts")) {
  // ---- the contacts directory
  const upsertC = (lines, extra = []) => node("contacts.mjs", ["upsert", ...extra], { input: lines.map((l) => JSON.stringify(l)).join("\n") });
  r = node("contacts.mjs", ["enable", "--core", "20", "--matters", "4"]);
  check("the directory is switched on, with the brain's own thresholds", r.ok && json(r.out).contacts.core === 20, r.out);
  r = upsertC([
    { address: "Marie.Durand@Horizon.fr", name: "Marie Durand", sent: 12, received: 9, first: "2026-07-01", last: "2026-09-20", subjects: ["Atelier du jeudi"], summary: "Directrice de l'innovation, Studio Horizon" },
    { address: "news@shop.example", name: "Shop", sent: 0, received: 40, subjects: ["Promo"] },
    { address: "paul@editions.fr", name: "Paul Éditeur", sent: 2, received: 1, last: "2026-09-01" },
    { address: "pas-une-adresse", name: "?" },
  ]);
  check("contacts go in; an invalid address is ignored", r.ok && json(r.out).added === 3 && json(r.out).total === 3, r.out);
  r = upsertC([{ address: "marie.durand@horizon.fr", sent: 10, received: 4, last: "2026-09-29", subjects: ["Budget 2027"] }]);
  const dirFile = JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8"));
  const marie = dirFile.contacts.find((c) => c.address === "marie.durand@horizon.fr");
  check("a week observed adds to the counts, widens the dates, joins the subjects", marie.sent === 22 && marie.received === 13 && marie.first === "2026-07-01" && marie.last === "2026-09-29" && marie.subjects.includes("Budget 2027") && marie.subjects.includes("Atelier du jeudi"), JSON.stringify(marie));
  check("tiers: the core by the brain's threshold, a one-way sender never rises", marie.tier === 2 && dirFile.contacts.find((c) => c.address === "news@shop.example").tier === 0 && dirFile.contacts.find((c) => c.address === "paul@editions.fr").tier === 0, JSON.stringify(dirFile.contacts.map((c) => [c.address, c.tier])));
  check("an English brain writes directory.json with English fields", "address" in marie && "tier" in marie && !existsSync(join(BRAIN, "index", "annuaire.json")));
  r = upsertC([{ address: "paul@editions.fr", sent: 3, received: 2 }], ["--set-counts"]);
  const paul = JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8")).contacts.find((c) => c.address === "paul@editions.fr");
  check("a full recount replaces the counts", paul.sent === 3 && paul.received === 2 && paul.tier === 1, JSON.stringify(paul));
  r = node("contacts.mjs", ["search", "innovation horizon", "--json"]);
  check("search: every word, anywhere in what is known", r.ok && json(r.out).found[0]?.name === "Marie Durand", r.out);
  r = node("contacts.mjs", ["search", "editeur", "--json"]);
  check("search: accents ignored", r.ok && json(r.out).found[0]?.name === "Paul Éditeur", r.out);
  r = node("contacts.mjs", ["promote", "marie.durand@horizon.fr", "--domains", "travail"]);
  const marieNote = existsSync(join(BRAIN, "vault", "people", "marie-durand.md")) ? readFileSync(join(BRAIN, "vault", "people", "marie-durand.md"), "utf8") : "";
  check("a contact becomes a note, in the brain's type for people", r.ok && marieNote.includes("type: person") && marieNote.includes("Directrice de l'innovation"), r.out);
  check("its address stays in the source, never in the text", marieNote.includes('source: "contact:marie.durand@horizon.fr"') && marieNote.split("---").slice(2).join("---").indexOf("@") === -1, marieNote);
  check("and the directory points to it", JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8")).contacts.find((c) => c.address === "marie.durand@horizon.fr").note === "marie-durand");
  r = node("contacts.mjs", ["promote", "marie.durand@horizon.fr", "--domains", "travail"]);
  check("never two notes for the same person", !r.ok, r.out);
  // A source of one's own may feed the directory.
  node("sources.mjs", ["add", "carnet", "--kind", "script", "--every", "week", "--type", "person", "--domains", "travail"]);
  const carnet = join(BRAIN, "sources", "carnet");
  writeFileSync(join(carnet, "run.mjs"), SOURCE_PROGRAM, "utf8");
  writeFileSync(join(carnet, "data.json"), JSON.stringify([{ kind: "contact", address: "lea@atelier.fr", name: "Léa Atelier", sent: 30, received: 25 }, { kind: "contact", name: "sans adresse" }]), "utf8");
  node("sources.mjs", ["trust", "carnet"]);
  r = node("sources.mjs", ["run", "carnet"]);
  check("a source feeds the directory; a contact without address is refused", r.ok && json(r.out).runs[0].contacts === 1 && json(r.out).runs[0].refused.length === 1 && JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8")).contacts.some((c) => c.address === "lea@atelier.fr" && c.tier === 2), r.out);
  {
    // A tier from a source: only if it declares setsTier, and as a floor.
    const { upsert } = await import(pathToFileURL(join(SCRIPTS, "directory.mjs")).href);
    const rulesCfg = { format: "en", contacts: { core: 30, matters: 3 } };
    const d = { contacts: [] };
    const quiet = { kind: "contact", address: "client@crm.fr", sent: 1, received: 0, tier: 2 };
    upsert(d, [quiet], {}, rulesCfg);
    const ignored = d.contacts[0].tier === 0 && d.contacts[0].tierFloor === undefined;
    upsert(d, [quiet], { tiers: true }, rulesCfg);
    const floored = d.contacts[0].tier === 2 && d.contacts[0].tierFloor === 2;
    upsert(d, [{ kind: "contact", address: "client@crm.fr", sent: 40, received: 5 }], {}, rulesCfg);
    const kept = d.contacts[0].tier === 2;
    upsert(d, [{ ...quiet, tier: 0 }], { tiers: true, counts: "set" }, rulesCfg);
    const cleared = d.contacts[0].tierFloor === undefined && d.contacts[0].tier === 0;
    check("a source's tier counts only when it declares setsTier, as a floor, and 0 removes it", ignored && floored && kept && cleared, JSON.stringify(d.contacts));
    const own = { format: "en", contacts: { core: 30, matters: 3, tiersFrom: "sources" } };
    const harvested = { contacts: [{ address: "a@b.fr", sent: 500, received: 90, note: "someone", tier: 1 }] };
    upsert(harvested, [{ kind: "contact", address: "a@b.fr", sent: 3 }], {}, own);
    check("tiers left to the sources are never recomputed by the plugin", harvested.contacts[0].tier === 1, JSON.stringify(harvested.contacts));
  }
  {
    // A brain's own ownership rules (brain.json, `ownership`).
    const { isOwned, isDerived, computerName } = await import(pathToFileURL(join(SCRIPTS, "lib.mjs")).href);
    const own = { ownership: { canon: ["index/contacts-alias.json", "index/activity/{computer}.jsonl"], derived: ["vault/log.md", "index/graph.json", "index/digests/"] } };
    const me = computerName();
    const okRules = isOwned("index/contacts-alias.json", own) && !isDerived("index/contacts-alias.json", own)
      && isOwned(`index/activity/${me}.jsonl`, own) && !isOwned("index/activity/another-computer.jsonl", own)
      && isOwned("vault/log.md", own) && isDerived("vault/log.md", own) && isDerived("index/digests/2026.json", own)
      && !isOwned("index/brain.sqlite", own) && isOwned("vault/notes/a.md", {}) && !isDerived("vault/notes/a.md", own);
    check("a brain's own ownership rules: settings kept by hand, each computer's journal, its own derived files", okRules);
  }
  // A step: a program of the brain's own that writes no note.
  r = node("sources.mjs", ["add", "miroir", "--kind", "step", "--every", "day", "--when", "after", "--description", "Publishes a mirror"]);
  const miroir = join(BRAIN, "sources", "miroir");
  check("a step is created, with its program and without a type", r.ok && json(r.out).when === "after" && existsSync(join(miroir, "run.mjs")) && !JSON.parse(readFileSync(join(miroir, "source.json"), "utf8")).type, r.out);
  writeFileSync(join(miroir, "run.mjs"), 'import { existsSync, writeFileSync } from "node:fs";\nif (existsSync("fail")) { console.error("the mirror is down"); process.exit(2); }\nwriteFileSync("done.txt", "yes");\nconsole.log("12 objects published");\n', "utf8");
  const notesBeforeStep = notesCount();
  r = node("sources.mjs", ["run", "--due", "--phase", "after"]);
  check("a step does not run before it is approved here", r.ok && json(r.out).runs.find((x) => x.name === "miroir")?.skipped && !existsSync(join(miroir, "done.txt")), r.out);
  node("sources.mjs", ["trust", "miroir"]);
  r = node("sources.mjs", ["run", "--due"]);
  check("an 'after' step is not run with the sources", r.ok && !json(r.out).runs.some((x) => x.name === "miroir"), r.out);
  r = node("sources.mjs", ["run", "--due", "--phase", "after"]);
  const stepRun = json(r.out).runs.find((x) => x.name === "miroir");
  check("once approved, it runs after the save and keeps its report, writing no note", r.ok && stepRun?.ok && stepRun.report === "12 objects published" && existsSync(join(miroir, "done.txt")) && notesCount() === notesBeforeStep, r.out);
  writeFileSync(join(miroir, "fail"), "", "utf8");
  r = node("sources.mjs", ["run", "miroir"]);
  check("a failing step keeps its error", r.ok && json(r.out).runs[0].ok === false && JSON.parse(readFileSync(join(miroir, "state.json"), "utf8")).lastError.includes("the mirror is down"), r.out);
  unlinkSync(join(miroir, "fail"));
  {
    // A source of finished objects: its records, kept up to date while nobody touches them.
    node("sources.mjs", ["add", "fil", "--kind", "script", "--every", "day", "--type", "source", "--domains", "ecriture", "--updates", "--finished"]);
    const posts = join(BRAIN, "sources", "fil");
    writeFileSync(join(posts, "run.mjs"), SOURCE_PROGRAM, "utf8");
    node("sources.mjs", ["trust", "fil"]);
    // One post already in the brain, written before the source existed.
    const olderPost = join(BRAIN, "vault", "sources", "vieux-post.md");
    writeFileSync(olderPost, "---\ntype: source\ntitle: \"Vieux post\"\ndomains: [ecriture]\nstatus: trusted\nvisibility: internal\ncreated: 2026-01-05\nupdated: 2026-01-05\nsource: \"base:post/2\"\n---\n\nLe vieux post.\n", "utf8");
    const item = (id, title, body) => ({ id: `base:post/${id}`, source: `base:post/${id}`, title, body, status: "trusted", folder: "linkedin" });
    writeFileSync(join(posts, "data.json"), JSON.stringify([item(1, "Premier post", "Dix likes."), item(2, "Vieux post", "Le vieux post.")]), "utf8");
    r = node("sources.mjs", ["run", "fil"]);
    const firstPost = join(BRAIN, "vault", "sources", "linkedin", "premier-post.md");
    check("a finished record is born trusted, in its subfolder, and an existing one is adopted, never doubled", r.ok && json(r.out).runs[0].created === 1 && json(r.out).runs[0].adopted === 1 && existsSync(firstPost) && readFileSync(firstPost, "utf8").includes("status: trusted") && !existsSync(join(BRAIN, "vault", "sources", "linkedin", "vieux-post.md")), `${r.out} ${JSON.stringify(readdirSync(join(BRAIN, "vault"), { recursive: true }).filter((f) => f.includes("post")))}`);
    writeFileSync(join(posts, "data.json"), JSON.stringify([item(1, "Premier post", "Trente likes."), item(2, "Vieux post", "Le vieux post, relu.")]), "utf8");
    r = node("sources.mjs", ["run", "fil"]);
    check("while nobody touches them, the source keeps its records up to date", r.ok && json(r.out).runs[0].updated === 2 && readFileSync(firstPost, "utf8").includes("Trente likes."), r.out);
    r = node("save.mjs");
    check("what a source just wrote is saved the same evening, without waiting like a note being edited", r.ok && git("status", "--porcelain", "vault/sources/linkedin/premier-post.md").trim() === "", r.out);
    writeFileSync(firstPost, readFileSync(firstPost, "utf8").replace("Trente likes.", "Trente likes. Ma note a la main."), "utf8");
    writeFileSync(join(posts, "data.json"), JSON.stringify([item(1, "Premier post", "Cent likes."), item(2, "Vieux post", "Le vieux post, relu.")]), "utf8");
    r = node("sources.mjs", ["run", "fil"]);
    check("one edit by hand, and the record is the person's: never rewritten", r.ok && json(r.out).runs[0].touched === 1 && json(r.out).runs[0].unchanged === 1 && readFileSync(firstPost, "utf8").includes("Ma note a la main.") && !readFileSync(firstPost, "utf8").includes("Cent likes."), r.out);
    // Any other source writes seeds, whatever it asks.
    node("sources.mjs", ["add", "brouillons", "--kind", "script", "--every", "day", "--type", "note", "--domains", "ecriture"]);
    const brouillons = join(BRAIN, "sources", "brouillons");
    writeFileSync(join(brouillons, "run.mjs"), SOURCE_PROGRAM, "utf8");
    writeFileSync(join(brouillons, "data.json"), JSON.stringify([{ id: "b1", title: "Brouillon presse", body: "Une pensee.", status: "trusted" }]), "utf8");
    node("sources.mjs", ["trust", "brouillons"]);
    node("sources.mjs", ["run", "brouillons"]);
    check("a source that is not of finished objects writes seeds, whatever it asks", readFileSync(join(BRAIN, "vault", "notes", "brouillon-presse.md"), "utf8").includes("status: seed"));
    // A record may have no text; a thought may not.
    writeFileSync(join(posts, "data.json"), JSON.stringify([{ id: "base:post/9", source: "base:post/9", title: "Video sans texte", body: "", status: "trusted" }]), "utf8");
    r = node("sources.mjs", ["run", "fil"]);
    writeFileSync(join(brouillons, "data.json"), JSON.stringify([{ id: "b2", title: "Pensee vide", body: "" }]), "utf8");
    const r2 = node("sources.mjs", ["run", "brouillons"]);
    check("a finished record may have no text; a thought without text is refused", json(r.out).runs[0].created === 1 && existsSync(join(BRAIN, "vault", "sources", "video-sans-texte.md")) && json(r2.out).runs[0].created === 0 && json(r2.out).runs[0].refused.some((x) => x.includes("the body is empty")), `${r.out} ${r2.out}`);
    // The name a source proposes is kept whole, and a date field stays a bare date.
    const longName = "post-2026-09-28-un-nom-propose-par-la-source-plus-long-que-soixante-signes";
    writeFileSync(join(posts, "data.json"), JSON.stringify([{ id: "base:post/10", source: "base:post/10", slug: longName, title: "Nom long", body: "Un post.", status: "trusted", fields: { date_evenement: "2026-09-28" } }]), "utf8");
    r = node("sources.mjs", ["run", "fil"]);
    const longPost = join(BRAIN, "vault", "sources", `${longName}.md`);
    // A folder hidden from search: out unless asked, still there.
    {
      const bj = join(BRAIN, "brain.json");
      const before = readFileSync(bj, "utf8");
      writeFileSync(bj, JSON.stringify({ ...JSON.parse(before), search: { hidden: ["sources/linkedin/"] } }, null, 2), "utf8");
      node("build.mjs", ["--quiet"]);
      const hidden = json(node("query.mjs", ["search", "Premier post", "--json"]).out);
      const all = json(node("query.mjs", ["search", "Premier post", "--everything", "--json"]).out);
      check("a folder hidden from search stays out of it, unless asked for everything", !hidden.some((x) => x.slug === "premier-post") && all.some((x) => x.slug === "premier-post"), `${JSON.stringify(hidden)} ${JSON.stringify(all)}`);
      writeFileSync(bj, before, "utf8");
    }
    // The forms of source the brain accepts (sourceSchemes): a sentence is refused
    // at capture, and a note written by hand with one is not saved; the rest is.
    {
      const bj = join(BRAIN, "brain.json");
      const before = readFileSync(bj, "utf8");
      writeFileSync(bj, JSON.stringify({ ...JSON.parse(before), sourceSchemes: ["https://", "base:", "claude://"] }, null, 2), "utf8");
      const refusedCap = cap("Une idee.", ["--title", "Source en phrase", "--type", "note", "--domains", "ecriture", "--source", "le mail de Paul du 6 octobre"]);
      const okCap = cap("Une autre idee.", ["--title", "Source en lien", "--type", "note", "--domains", "ecriture", "--source", "https://example.org/paul"]);
      check("a source in a form the brain does not follow is refused at capture; a followed one goes", !refusedCap.ok && refusedCap.out.includes("form this brain does not follow") && okCap.ok, `${refusedCap.out} | ${okCap.out}`);
      const byHand = join(BRAIN, "vault", "notes", "ecrite-a-la-main.md");
      writeFileSync(byHand, "---\ntype: note\ntitle: \"Ecrite a la main\"\ndomains: [ecriture]\nstatus: seed\nvisibility: internal\ncreated: 2026-01-03\nupdated: 2026-01-03\nsource: \"le carnet bleu\"\n---\n\nUne note.\n", "utf8");
      const sv = node("save.mjs", ["--now"]);
      check("a note written by hand with such a source is not saved, and the evening hears of it", !sv.ok && sv.out.includes("NOT saved") && git("status", "--porcelain", "vault/notes/ecrite-a-la-main.md").startsWith("??"), sv.out);
      unlinkSync(byHand);
      writeFileSync(bj, before, "utf8");
    }
    // NATURE and DATA: a facet allowed by the brain, a facet it does not give,
    // and the addresses of the data a note routes to, given back by brain_get.
    {
      const bj = join(BRAIN, "brain.json");
      const before = readFileSync(bj, "utf8");
      writeFileSync(bj, JSON.stringify({ ...JSON.parse(before), natures: { note: ["decision", "feedback"] }, data: { db: { tool: "base de test" } } }, null, 2), "utf8");
      const dec = join(BRAIN, "vault", "notes", "une-decision.md");
      writeFileSync(dec, "---\ntype: note\ntitle: \"Une decision\"\ndomains: [ecriture]\nstatus: seed\nvisibility: internal\ncreated: 2026-01-03\nupdated: 2026-01-03\nsource: \"https://example.org/d\"\nnature: decision\ndata: [db://projet/inscrits]\n---\n\nOn garde deux jours pleins.\n", "utf8");
      const g = json(node("query.mjs", ["get", "une-decision", "--json"]).out);
      check("a note's nature and the addresses of its data come back with it", g?.nature === "decision" && g?.data?.[0] === "db://projet/inscrits", JSON.stringify(g));
      const s = json(node("query.mjs", ["search", "jours", "--nature", "decision", "--json"]).out);
      check("search can keep only one nature", Array.isArray(s) && s.some((x) => x.slug === "une-decision"), JSON.stringify(s));
      writeFileSync(dec, readFileSync(dec, "utf8").replace("nature: decision", "nature: recette"), "utf8");
      const bad = node("lint.mjs");
      check("a nature the brain does not give to this type is an error", !bad.ok && bad.out.includes("recette"), bad.out);
      writeFileSync(dec, readFileSync(dec, "utf8").replace("nature: recette", "nature: decision").replace("[db://projet/inscrits]", "[pas une adresse]"), "utf8");
      const bad2 = node("lint.mjs");
      check("a data that is not an address is an error", !bad2.ok && bad2.out.includes("not an address"), bad2.out);
      unlinkSync(dec);
      const capOk = cap("Le tarif ne bouge pas.", ["--title", "Tarif tenu", "--type", "note", "--domains", "ecriture", "--source", "https://example.org/t", "--nature", "decision", "--data", "db://projet/tarifs", "--no-commit"]);
      const capKo = cap("Une recette.", ["--title", "Recette", "--type", "note", "--domains", "ecriture", "--source", "https://example.org/r", "--nature", "recette", "--no-commit"]);
      const tenu = join(BRAIN, "vault", "notes", "tarif-tenu.md");
      check("capture writes a nature and data addresses, and refuses a nature the brain does not give", capOk.ok && existsSync(tenu) && /\nnature: decision\n/.test(readFileSync(tenu, "utf8")) && /\ndata: \[db:\/\/projet\/tarifs\]\n/.test(readFileSync(tenu, "utf8")) && !capKo.ok, `${capOk.out} | ${capKo.out}`);
      if (existsSync(tenu)) unlinkSync(tenu);
      writeFileSync(bj, before, "utf8");
    }
    // THE CATALOGUE: a source sends an entry (data kept elsewhere), the brain
    // keeps its address, title and a short excerpt, and search finds it.
    {
      node("sources.mjs", ["add", "carnet", "--kind", "script", "--every", "day", "--type", "note", "--domains", "ecriture"]);
      const long = "Les abeilles dansent pour indiquer le pollen. ".repeat(20);
      writeFileSync(join(BRAIN, "sources", "carnet", "run.mjs"), `console.log(${JSON.stringify(JSON.stringify({ kind: "entry", address: "base://posts/1", title: "Un post sur les abeilles", text: long, date: "2026-01-02", domains: ["ecriture"] }))});\n`, "utf8");
      // (2026-11-23) The test shows what goes to the catalogue apart from the notes, and the contract says how.
      const tc = json(node("sources.mjs", ["test", "carnet"]).out);
      check("the test of a source counts its catalogue entries apart, with a sample", tc.ok && tc.entries === 1 && tc.new === 0 && tc.entrySample?.[0]?.address === "base://posts/1" && tc.sample.length === 0, JSON.stringify(tc));
      node("sources.mjs", ["add", "vitrine", "--kind", "script", "--every", "day", "--type", "note", "--domains", "ecriture", "--entries", "replace"]);
      check("a source may send its whole list each time (--entries replace), and its program is told about the catalogue", JSON.parse(readFileSync(join(BRAIN, "sources", "vitrine", "source.json"), "utf8")).entries === "replace" && readFileSync(join(BRAIN, "sources", "vitrine", "run.mjs"), "utf8").includes('"kind": "entry"'));
      rmSync(join(BRAIN, "sources", "vitrine"), { recursive: true, force: true });
      node("sources.mjs", ["trust", "carnet"]);
      const rc = node("sources.mjs", ["run", "carnet"]);
      const file = join(BRAIN, "catalogue", "carnet.jsonl");
      const line = existsSync(file) ? readFileSync(file, "utf8") : "";
      check("a source feeds the catalogue with the address, the title and a short excerpt, never the whole text", rc.ok && line.includes("base://posts/1") && line.includes("abeilles") && line.length < long.length, `${rc.out} ${line}`);
      const found = json(node("query.mjs", ["search", "abeilles", "--json"]).out);
      check("search finds a catalogue entry by its words, with its address", Array.isArray(found) && found.some((x) => x.catalogue && x.address === "base://posts/1"), JSON.stringify(found));
      const notesOnly = json(node("query.mjs", ["search", "abeilles", "--type", "note", "--json"]).out);
      check("asking for a type keeps to notes", Array.isArray(notesOnly) && !notesOnly.some((x) => x.catalogue), JSON.stringify(notesOnly));
      // brain_fetch: an address read where the data lives (here a file of the
      // brain), and the catalogue's own entry when no tool is registered.
      const bj2 = join(BRAIN, "brain.json");
      const before2 = readFileSync(bj2, "utf8");
      writeFileSync(join(BRAIN, "index", "fiches-clients.json"), JSON.stringify({ items: [{ id: "acme", nom: "Acme", ca: 1200 }] }), "utf8");
      writeFileSync(bj2, JSON.stringify({ ...JSON.parse(before2), data: { clients: { adapter: "file", file: "index/fiches-clients.json", array: "items", key: "id" } } }, null, 2), "utf8");
      const f1 = json(node("query.mjs", ["fetch", "clients://acme"]).out);
      check("brain_fetch reads the data at an address, where it lives", f1?.data?.ca === 1200, JSON.stringify(f1));
      const f2 = json(node("query.mjs", ["fetch", "base://posts/1"]).out);
      check("an address with no tool registered is read from the catalogue", f2?.data?.title === "Un post sur les abeilles", JSON.stringify(f2));
      const f3 = json(node("query.mjs", ["fetch", "pas une adresse"]).out);
      check("and something that is not an address is refused", Boolean(f3?.error), JSON.stringify(f3));
      writeFileSync(bj2, before2, "utf8");
      node("sources.mjs", ["disable", "carnet"]);
    }
    check("a source's own name for a note is kept whole, and its dates stay bare", r.ok && existsSync(longPost) && readFileSync(longPost, "utf8").includes("\ndate_evenement: 2026-09-28\n"), `${r.out} ${existsSync(longPost) ? readFileSync(longPost, "utf8") : "absent"}`);
    // A machine zone: a source keeps its own marked lines up to date inside a validated note.
    node("sources.mjs", ["add", "compteurs", "--kind", "script", "--every", "day", "--type", "note", "--domains", "ecriture", "--zones", "chiffres"]);
    const compteurs = join(BRAIN, "sources", "compteurs");
    writeFileSync(join(compteurs, "run.mjs"), SOURCE_PROGRAM, "utf8");
    node("sources.mjs", ["trust", "compteurs"]);
    const validated = join(BRAIN, "vault", "notes", "vieille-note.md");
    const before = readFileSync(validated, "utf8");
    const zoneItem = (name, body) => ({ kind: "zone", note: "vieille-note", name, body });
    writeFileSync(join(compteurs, "data.json"), JSON.stringify([zoneItem("chiffres", "12 messages."), zoneItem("autre", "Intrus.")]), "utf8");
    r = node("sources.mjs", ["run", "compteurs"]);
    const afterFirst = readFileSync(validated, "utf8");
    check("a declared zone is added to a validated note, nothing else changes; an undeclared one is refused", json(r.out).runs[0].zones === 1 && json(r.out).runs[0].refused.length === 1 && afterFirst.startsWith(before.trimEnd()) && afterFirst.includes("<!-- chiffres:auto -->\n12 messages.\n<!-- /chiffres:auto -->") && !afterFirst.includes("Intrus"), `${r.out}\n${afterFirst}`);
    writeFileSync(validated, afterFirst.replace("<!-- chiffres:auto -->", "Une phrase a moi.\n\n<!-- chiffres:auto -->"), "utf8");
    writeFileSync(join(compteurs, "data.json"), JSON.stringify([zoneItem("chiffres", "15 messages.")]), "utf8");
    r = node("sources.mjs", ["run", "compteurs"]);
    const afterSecond = readFileSync(validated, "utf8");
    check("afterwards only what is between its marks is rewritten", json(r.out).runs[0].zones === 1 && afterSecond.includes("Une phrase a moi.") && afterSecond.includes("15 messages.") && !afterSecond.includes("12 messages.") && afterSecond.includes("status: trusted"), afterSecond);
  }
  const mc = await mcpSession();
  await mc.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  const toolsNow = await mc.ask("tools/list", {});
  call = await mc.ask("tools/call", { name: "brain_contact", arguments: { query: "atelier" } });
  check("Claude searches the directory through brain_contact", toolsNow?.result?.tools?.length === 7 && mc.text(call).includes("Léa Atelier"), mc.text(call));
  mc.close();
  node("review.mjs");
  const peopleReport = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
  check("the weekly report tells the directory, and who in the core has no note", peopleReport.includes("## Contacts (4 in the directory, 2 in the core)") && peopleReport.includes("- Léa Atelier (30 / 25)"), peopleReport);
  node("save.mjs", ["--now"]);
  check("the directory is saved with the brain", git("ls-files", "index").includes("index/directory.json"));

  }
  if (await scene("letter")) {
  // ---- the weekly letter (never really sent: a fake mail service answers)
  r = node("letter.mjs", ["setup", "--channel", "connector"]);
  check("a letter needs the person's own address", !r.ok, r.out);
  r = node("letter.mjs", ["setup", "--channel", "connector", "--to", "camille@exemple.fr"]);
  check("the letter is set up with the person's channel and address", r.ok && json(r.out).letter.channel === "connector", r.out);
  r = letter(["--dry"]);
  dry = json(r.out);
  check("a dry run renders it, without sending", r.ok && dry.dry === true && /Camille's brain review, week \d+/.test(dry.subject), r.out);
  const letterHtml = readFileSync(dry.html, "utf8");
  check("it renders for mail and phones: header, numbered badges, light and dark boxes, health at the foot", letterHtml.includes("The review of September 30") && letterHtml.includes("border-radius:12px;background:#2f7d5b") && letterHtml.includes("background:#1f2430;border-radius:12px") && letterHtml.includes("🟢 All is well.") && !letterHtml.includes("<style"), letterHtml.slice(0, 300));
  check("and escapes what could be HTML", !letterHtml.includes("<Perec>") && letterHtml.includes("<strong"));
  check("it is always kept in the brain, for the answers to find its numbers", readFileSync(join(BRAIN, "reviews", `${localDay()}-letter.md`), "utf8") === LETTER);
  r = letter([]);
  check("through the connector, Claude sends it: the script says so and gives the file", r.ok && json(r.out).sendWithConnector === true && json(r.out).to === "camille@exemple.fr", r.out);
  r = node("letter.mjs", ["setup", "--channel", "brevo", "--to", "camille@exemple.fr"]);
  check("Brevo needs a verified sender", !r.ok, r.out);
  node("letter.mjs", ["setup", "--channel", "brevo", "--to", "camille@exemple.fr", "--from", "brain@exemple.fr"]);
  r = letter([]);
  check("without its key in the brain's .env, nothing leaves", !r.ok && r.out.includes("BREVO_API_KEY"), r.out);
  r = letter([], { BREVO_API_KEY: "test-brevo", HVBRAIN_BREVO_URL: `http://127.0.0.1:${port}/v3` });
  const brevoMail = await mailNow();
  check("with it, the letter goes to the person, from the verified sender", r.ok && json(r.out).sent === true && brevoMail?.headers["api-key"] === "test-brevo" && brevoMail.body.to[0].email === "camille@exemple.fr" && brevoMail.body.sender.email === "brain@exemple.fr" && brevoMail.body.htmlContent.includes("Oh, by the way") && brevoMail.body.textContent === LETTER, JSON.stringify(brevoMail).slice(0, 400));
  node("letter.mjs", ["setup", "--channel", "resend", "--to", "camille@exemple.fr", "--from", "brain@exemple.fr"]);
  r = letter([], { RESEND_API_KEY: "test-resend", HVBRAIN_RESEND_URL: `http://127.0.0.1:${port}` });
  const resendMail = await mailNow();
  check("Resend works the same way", r.ok && json(r.out).sent === true && resendMail?.headers.authorization === "Bearer test-resend" && resendMail.body.to[0] === "camille@exemple.fr", JSON.stringify(resendMail).slice(0, 300));
  // The alert of an evening that went wrong, by the same channel.
  const startedAt = new Date().toISOString();
  r = node("letter.mjs", ["alert", "--since", startedAt], { input: JSON.stringify({ failed: [] }), env: mailEnv });
  check("an evening without a problem sends no alert", r.ok && json(r.out).alert === false, r.out);
  mkdirSync(join(BRAIN, "sources", "panne"), { recursive: true });
  writeFileSync(join(BRAIN, "sources", "panne", "state.json"), JSON.stringify({ lastRun: new Date().toISOString(), lastError: "the mailbox did not answer" }), "utf8");
  r = node("letter.mjs", ["alert", "--since", startedAt], { input: JSON.stringify({ failed: [{ step: "cold-copy.mjs", message: "the drive is full" }] }), env: mailEnv });
  const alertMail = await mailNow();
  check("a failed step or source sends a short alert the same evening, by the letter's channel", r.ok && json(r.out).sent === true && /evening save has a problem/.test(alertMail?.body.subject ?? "") && alertMail.body.text.includes("the drive is full") && alertMail.body.text.includes("the mailbox did not answer"), `${r.out} ${JSON.stringify(alertMail).slice(0, 300)}`);
  r = node("status.mjs", ["--json"]);
  check("and the status shows it", r.ok && json(r.out).lastAlert?.problems.length === 2, r.out);
  rmSync(join(BRAIN, "sources", "panne"), { recursive: true, force: true });

  }
  // ---- a judge's cycle (judge.mjs, run by the hub). Claude's place is taken by
  // tests/faux-claude.mjs (HVBRAIN_CLAUDE): no token, no network, no model. The
  // letter's channel is still the fake mail service of the scenes above.
  {
    const hb = join(HOME, ".hypervibe-brain");
    const sourceDir = (n) => join(BRAIN, "sources", n);
    const readJ = (f, d = null) => {
      try {
        return JSON.parse(readFileSync(f, "utf8"));
      } catch {
        return d;
      }
    };
    const define = (n, extra) => writeFileSync(join(sourceDir(n), "source.json"), JSON.stringify({ ...readJ(join(sourceDir(n), "source.json")), ...extra }, null, 2), "utf8");
    const state = (n) => readJ(join(sourceDir(n), "state.json"), {});
    const setState = (n, extra) => writeFileSync(join(sourceDir(n), "state.json"), JSON.stringify({ ...state(n), ...extra }), "utf8");
    const ago = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();
    const claudeLog = join(BASE, "faux-claude.jsonl");
    const passes = () => (existsSync(claudeLog) ? readFileSync(claudeLog, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
    const judgeEnv = { HVBRAIN_CLAUDE: join(HERE, "faux-claude.mjs"), FAUX_CLAUDE_LOG: claudeLog, FAUX_CLAUDE_EXIT: "", FAUX_CLAUDE_ADD: "", FAUX_CLAUDE_TOKENS: "", CLAUDE_CODE_OAUTH_TOKEN: "", HVBRAIN_JUDGE_BATCH: "", HVBRAIN_HUB_SAVE_MS: "0", ...mailEnv };
    // A beat that raised an exception prints no JSON: said as such, not thrown here.
    const hub = (extra = {}) => {
      const o = node("hub.mjs", ["--once"], { env: { ...judgeEnv, ...extra } });
      try {
        return json(o.out);
      } catch {
        return { crashed: o.out };
      }
    };
    const ran = (h, n) => (h.runs ?? []).filter((x) => x.name === n);
    const pileFile = (n) => join(hb, "judge", `${n}.json`);
    const pile = (n) => readJ(pileFile(n), { items: [] }).items;
    const toJudge = (n, refs) => {
      for (const ref of refs) node("judge.mjs", ["add", "--source", n, "--ref", ref, "--title", `Item ${ref}`]);
    };
    const flagDue = (n, why) => {
      mkdirSync(join(hb, "due"), { recursive: true });
      writeFileSync(join(hb, "due", n), `${JSON.stringify({ at: new Date().toISOString(), first: new Date().toISOString(), why })}\n`, "utf8");
    };
    const events = () => readFileSync(join(hb, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const alerts = () => events().filter((e) => e.what === "alert" && e.who === "source:juge");
    const hubLog = () => readdirSync(join(hb, "logs")).filter((n) => /^hub-.*\.log$/.test(n)).map((n) => readFileSync(join(hb, "logs", n), "utf8")).join("");
    // Tried again once or twice: the beats above block this process for
    // seconds, and the fake service has closed the idle connection meanwhile.
    const lastMail = async () => {
      for (let t = 0; ; t++) {
        try {
          return await (await fetch(`http://127.0.0.1:${port}/mail`, { headers: { connection: "close" } })).json();
        } catch (e) {
          if (t >= 2) throw e;
        }
      }
    };
    const script = (n, extra = {}) => {
      node("sources.mjs", ["add", n, "--kind", "script", "--every", "15m", "--type", "source", "--domains", "ecriture"]);
      writeFileSync(join(sourceDir(n), "run.mjs"), SOURCE_PROGRAM, "utf8");
      writeFileSync(join(sourceDir(n), "data.json"), "[]", "utf8");
      if (Object.keys(extra).length) define(n, extra);
      node("sources.mjs", ["trust", n]);
    };

    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const after = (x, flag) => x.args[x.args.indexOf(flag) + 1];
    const instructions = join(sourceDir("juge"), "instructions.md");
    const hour = { HVBRAIN_HUB_SAVE_MS: "3600000" };
    const saveFile = join(hb, "hub-save.json");
    const commits = () => Number(git("rev-list", "--count", "HEAD"));
    const bring = (id, title) => {
      writeFileSync(join(sourceDir("releve"), "data.json"), JSON.stringify([{ id, title, body: `${title}, seen by the hub.` }]), "utf8");
      flagDue("releve", "skill some-skill");
    };

    // What the scenes of this group leave each other, beyond the disk.
    let set, h, p, rules, seen, mail, rows;
    keeps(
      "judges",
      () => ({ set, h, p, rules, seen, mail, rows }),
      (v) => {
        ({ set, h, p, rules, seen, mail, rows } = v);
      },
    );

    if (await scene("judges")) {
    // One source of the defaults, an invalid value brought back to its default.
    r = run("node", ["--input-type=module", "-e", `import { JUDGE_DEFAULTS, JUDGE_MODELS, judgeSettings } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "judge.mjs")).href)}; console.log(JSON.stringify({ d: JUDGE_DEFAULTS, m: JUDGE_MODELS, none: judgeSettings({}), bad: judgeSettings({ model: "gpt", batch: -3, hours: [23, 7], gather: "soon", timeoutMin: 0, maxTurns: "x", dailyTokens: -5, catchUp: "many" }), own: judgeSettings({ model: "opus", batch: 4, hours: [0, 24], gather: "0", timeoutMin: 5, maxTurns: 10, dailyTokens: "5000000", catchUp: 0 }) }));`]);
    set = json(r.out);
    check("a judge's defaults live in one place: sonnet, 15 at a time, 7 to 23, read in the tick that fed its pile, no cap for the day, a confirmation above 30 items", r.ok && same(set.d, { model: "sonnet", batch: 15, hours: [7, 23], gather: "0", timeoutMin: 25, maxTurns: 60, dailyTokens: 0, catchUp: 30 }) && same(set.m, ["haiku", "sonnet", "opus"]) && same(set.none, { model: "sonnet", batch: 15, hours: [7, 23], gather: "0", gatherMs: 0, timeoutMin: 25, maxTurns: 60, dailyTokens: 0, catchUp: 30 }), r.out);
    check("its settings are the source's own over the defaults, an invalid value brought back to its default", same(set.bad, set.none) && same(set.own, { model: "opus", batch: 4, hours: [0, 24], gather: "0", gatherMs: 0, timeoutMin: 5, maxTurns: 10, dailyTokens: 5_000_000, catchUp: 0 }), r.out);

    script("releve");
    node("sources.mjs", ["add", "juge", "--kind", "claude", "--every", "week", "--type", "source", "--domains", "ecriture"]);
    define("juge", { live: true, batch: 2, gather: "0", hours: [0, 24] });
    writeFileSync(join(sourceDir("juge"), "seen.json"), JSON.stringify({ "t:long-ago": ago(61 * 24), "t:two-months": ago(59 * 24) }), "utf8");
    toJudge("juge", ["t:1", "t:2", "t:3", "t:4", "t:5"]);
    h = hub();
    p = passes();
    check("a judge keeps passing until its pile is empty, in one beat (5 items, 2 at a time: 3 passes)", p.map((x) => x.items).join() === "2,2,1" && ran(h, "juge").length === 3 && ran(h, "juge").every((x) => x.ok) && pile("juge").length === 0, `${JSON.stringify(h)} ${JSON.stringify(p)}`);
    check("the model is always given to Claude: the default when the source names none", p.length > 0 && p.every((x) => x.args[x.args.indexOf("--model") + 1] === "sonnet"), JSON.stringify(p));
    // A sealed judge: no settings file at all, the brain's MCP server alone,
    // and everything not allowed refused. A light one: no skills, a system
    // prompt of its own in place of Claude Code's.
    check(
      "a judge runs sealed and light: no settings file, no skills, its own short system prompt, the brain's MCP server alone, what is not allowed is refused",
      p.every((x) => after(x, "--setting-sources") === "" && x.args.includes("--disable-slash-commands") && /^You are a judge/.test(x.system ?? "") && Boolean(after(x, "--system-prompt-file")) && !x.args.includes("--system-prompt") && x.args.includes("--strict-mcp-config") && /mcp\.mjs/.test(after(x, "--mcp-config") ?? "") && after(x, "--permission-mode") === "dontAsk" && x.args.includes("--tools")),
      JSON.stringify(p[0]?.args),
    );
    r = run("node", ["--input-type=module", "-e", `import { judgeRules } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "judge.mjs")).href)}; console.log(JSON.stringify(judgeRules(["mcp__plugin_brain_brain__brain_search", "Bash(node {plugin}/scripts/fact.mjs:*)", "Read", "Bash", "WebFetch", "Read({root:nowhere}/**)", "Bash(printf:*)"])));`]);
    rules = json(r.out);
    check(
      "its rules: the brain's tools under their sealed name, a scoped command kept, a rule that opens everything refused",
      r.ok && rules.rules.includes("mcp__brain__brain_search") && rules.rules.some((t) => /^Bash\(node .+\/scripts\/fact\.mjs:\*\)$/.test(t)) && rules.rules.includes("Bash(printf:*)") && same(rules.refused, ["Read", "Bash", "WebFetch", "Read({root:nowhere}/**)"]) && same(rules.builtins, ["Bash"]),
      r.out + r.err,
    );
    // ONE CLOCK FOR THE WHOLE BRAIN (2026-11-19, pure.mjs): a rhythm is a tick
    // of the clock, the same for every source, and no longer counted from each
    // source's own last run (nor restarted at the end of a judge's cycle).
    check("a judge's cycle no longer pushes back the source that ran with it: its last run is its own", ran(h, "releve")[0]?.ok === true && Date.parse(state("releve").lastRun) <= Date.parse(p.at(-1)?.at ?? "x"), `${state("releve").lastRun} ${JSON.stringify(p.map((x) => x.at))}`);
    {
      const pureUrl = JSON.stringify(pathToFileURL(join(SCRIPTS, "pure.mjs")).href);
      const at = (hhmm) => Date.parse(`2026-11-19T${hhmm}:00.000Z`);
      const M = 60_000;
      // [last run, now, rhythm in minutes] with the ticks counted from midnight UTC (origin 0).
      const cases = [
        [at("10:02"), at("10:29"), 30], // same half hour: not due
        [at("10:02"), at("10:30"), 30], // the tick of 10:30 fell: due
        [at("10:29"), at("10:31"), 30], // ran late, two minutes before the tick: due again at the tick, as the others
        [at("09:58"), at("10:40"), 30], // a tick missed while something else ran: due, once
        [at("10:40"), at("10:59"), 30], // caught up at 10:40: nothing before 11:00
        [at("10:05"), at("10:55"), 60], // "hour": the top of the hour
        [at("10:05"), at("11:00"), 60],
      ];
      r = run("node", ["--input-type=module", "-e", `import { tickPassed, nextTick } from ${pureUrl}; const c = JSON.parse(process.argv[1]); console.log(JSON.stringify({ due: c.map(([last, now, m]) => tickPassed(last, now, m * 60000, 0)), next: new Date(nextTick(${at("10:02")}, 30 * 60000, 0)).toISOString().slice(11, 16) }));`, JSON.stringify(cases)]);
      check("a rhythm is a tick of the clock: every source of the half hour is due at :00 and :30, whatever the time of its last run", r.ok && same(json(r.out).due, [false, true, true, true, false, false, true]) && json(r.out).next === "10:30", r.out + r.err);
      void M;
    }
    seen = readJ(join(sourceDir("juge"), "seen.json"), {});
    check("what was judged more than 60 days ago leaves seen.json, the rest stays", !("t:long-ago" in seen) && "t:two-months" in seen && ["t:1", "t:2", "t:3", "t:4", "t:5"].every((x) => x in seen), JSON.stringify(seen));

    // The readers a judge calls: a conversation, a document.
    {
      const proj = join(HOME, ".claude", "projects", "C--work");
      mkdirSync(proj, { recursive: true });
      const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
      const said = (min, text, more = {}) => JSON.stringify({ type: "user", timestamp: at(min), message: { role: "user", content: text }, ...more });
      const old = new Date(Date.now() - 3 * 3600_000);
      const conv = (name, lines) => {
        writeFileSync(join(proj, name), lines.join("\n"), "utf8");
        utimesSync(join(proj, name), old, old);
      };
      conv("conv-1.jsonl", [
        JSON.stringify({ type: "ai-title", aiTitle: "A plan for the launch" }),
        said(300, "First message <system-reminder>A-REMINDER</system-reminder>", { cwd: "C:/work", entrypoint: "cli" }),
        JSON.stringify({ type: "assistant", timestamp: at(299), message: { content: [{ type: "text", text: "A small sentence." }] } }),
        JSON.stringify({ type: "assistant", timestamp: at(298), message: { content: [{ type: "text", text: "The written answer." }] } }),
        JSON.stringify({ type: "user", timestamp: at(297), message: { role: "user", content: [{ type: "tool_result", content: "A-TOOL-OUTPUT" }] } }),
        said(200, "Second message"),
        said(100, "Third message"),
      ]);
      // A file that looks old, whose last exchange is five minutes old: still being written.
      conv("conv-2.jsonl", [said(60, "One", { entrypoint: "cli" }), said(50, "Two"), said(5, "Three")]);
      // A background run of claude -p (a judge, a routine): not a conversation.
      conv("conv-3.jsonl", [said(300, "One", { entrypoint: "sdk-cli" }), said(290, "Two"), said(280, "Three")]);
      r = node("readers/conversation.mjs", ["--list"]);
      const listed = json(r.out) ?? [];
      check("the conversation reader lists the person's settled conversations: not one still going, not a background run", r.ok && listed.length === 1 && listed[0].id === "conv-1" && listed[0].messages === 3 && listed[0].title === "A plan for the launch", r.out + r.err);
      r = node("readers/conversation.mjs", ["claude://session/conv-1#a-version"]);
      check(
        "it gives the person's messages and Claude's last written answer, never a tool output nor a system reminder",
        r.ok && r.out.includes("First message") && r.out.includes("The written answer.") && !r.out.includes("A small sentence.") && !r.out.includes("A-TOOL-OUTPUT") && !r.out.includes("A-REMINDER") && r.out.includes("PAGE 1/1: the last one"),
        r.out + r.err,
      );
      r = node("readers/conversation.mjs", ["conv-1", "--since", at(150)]);
      const none = node("readers/conversation.mjs", ["conv-1", "--since", at(1)]);
      check("a conversation taken up again: only what follows the date, and it says when nothing does", r.ok && r.out.includes("Third message") && !r.out.includes("Second message") && none.out.includes("nothing new since that date"), r.out + none.out);

      // A Word document, as a zip built here: a word split over two runs, a
      // deleted text, a paragraph, an entity.
      const zip = (files) => {
        const parts = [];
        const central = [];
        let offset = 0;
        for (const [name, text] of Object.entries(files)) {
          const raw = Buffer.from(text, "utf8");
          const data = deflateRawSync(raw);
          const head = Buffer.alloc(30);
          head.writeUInt32LE(0x04034b50, 0);
          head.writeUInt16LE(20, 4);
          head.writeUInt16LE(8, 8);
          head.writeUInt32LE(crc32(raw), 14);
          head.writeUInt32LE(data.length, 18);
          head.writeUInt32LE(raw.length, 22);
          head.writeUInt16LE(Buffer.byteLength(name), 26);
          const entry = Buffer.alloc(46);
          entry.writeUInt32LE(0x02014b50, 0);
          entry.writeUInt16LE(20, 4);
          entry.writeUInt16LE(20, 6);
          entry.writeUInt16LE(8, 10);
          entry.writeUInt32LE(crc32(raw), 16);
          entry.writeUInt32LE(data.length, 20);
          entry.writeUInt32LE(raw.length, 24);
          entry.writeUInt16LE(Buffer.byteLength(name), 28);
          entry.writeUInt32LE(offset, 42);
          parts.push(head, Buffer.from(name), data);
          central.push(entry, Buffer.from(name));
          offset += 30 + Buffer.byteLength(name) + data.length;
        }
        const dir = Buffer.concat(central);
        const end = Buffer.alloc(22);
        end.writeUInt32LE(0x06054b50, 0);
        end.writeUInt16LE(Object.keys(files).length, 8);
        end.writeUInt16LE(Object.keys(files).length, 10);
        end.writeUInt32LE(dir.length, 12);
        end.writeUInt32LE(offset, 16);
        return Buffer.concat([...parts, dir, end]);
      };
      const docx = join(BASE, "a-contract.docx");
      writeFileSync(docx, zip({
        "[Content_Types].xml": "<Types/>",
        "word/document.xml": '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>Sign</w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>ature</w:t></w:r><w:r><w:t xml:space="preserve"> of the contract</w:t></w:r><w:del><w:r><w:delText>REMOVED</w:delText></w:r></w:del></w:p><w:p><w:r><w:t>Tom &amp; Ana</w:t></w:r></w:p></w:body></w:document>',
      }));
      r = node("readers/document.mjs", [docx]);
      check("the document reader reads a Word file without any library: a word split by the layout stays one word, a deleted text stays out", r.ok && r.out.trim() === "Signature of the contract\nTom & Ana", JSON.stringify(r.out) + r.err);
      const text = join(BASE, "a-note.md");
      writeFileSync(text, "# A note\nIts text.", "utf8");
      r = node("readers/document.mjs", [text]);
      const gone = node("readers/document.mjs", [join(BASE, "gone.docx")]);
      check("it gives a text as it is, and says when a document is gone", r.ok && r.out.includes("Its text.") && gone.ok && gone.out.includes("no longer exists"), r.out + gone.out);
    }

    // An item put on the pile while Claude is at work (the fake adds it itself).
    rmSync(claudeLog, { force: true });
    toJudge("juge", ["t:6", "t:7"]);
    h = hub({ FAUX_CLAUDE_ADD: pileFile("juge") });
    p = passes();
    seen = readJ(join(sourceDir("juge"), "seen.json"), {});
    check("an item that arrives during a pass is not lost: the pile is read again before it is written back", p.map((x) => x.items).join() === "2,1" && pile("juge").length === 0 && "test:arrived-meanwhile" in seen && "t:7" in seen, `${JSON.stringify(h)} ${JSON.stringify(p)} ${JSON.stringify(pile("juge"))}`);

    // A judge down: paused an hour at each failure, an alert at the second in a row.
    rmSync(claudeLog, { force: true });
    toJudge("juge", ["t:8", "t:9", "t:10", "t:11", "t:12"]);
    const mailBefore = JSON.stringify(await lastMail());
    h = hub({ FAUX_CLAUDE_EXIT: "1" });
    check("a pass that fails stops the cycle, is counted, and the pile keeps everything", passes().length === 1 && ran(h, "juge").length === 1 && ran(h, "juge")[0].ok === false && state("juge").failures === 1 && /the login expired/.test(state("juge").lastError ?? "") && pile("juge").length === 5, `${JSON.stringify(h)} ${JSON.stringify(state("juge"))}`);
    check("one failure sends no alert", alerts().length === 0 && !state("juge").alertedAt && JSON.stringify(await lastMail()) === mailBefore, JSON.stringify(alerts()));
    h = hub({ FAUX_CLAUDE_EXIT: "1" });
    check("a judge that failed waits an hour before its next try", passes().length === 1 && ran(h, "juge").length === 0, JSON.stringify(h));
    setState("juge", { lastRun: ago(2) });
    h = hub({ FAUX_CLAUDE_EXIT: "1" });
    mail = await lastMail();
    check("a second failure in a row sends the alert by the letter's channel: the judge, its error, what waits in its pile",
      passes().length === 2 && state("juge").failures === 2 && alerts().length === 1 && alerts()[0].sent === true && alerts()[0].waiting === 5 && /the judge "juge" is down/.test(mail?.body.subject ?? "") && mail.body.text.includes("the login expired") && mail.body.text.includes("5 items wait in its pile") && mail.body.text.includes('Open Claude and say: "the judge of my brain is down, repair it"') && mail.body.text.includes("Its last 2 runs failed") && readJ(join(hb, "alert.json"), {}).judge === "juge" && readJ(join(hb, "alert.json"), {}).cause === "token" && Date.parse(readJ(join(hb, "alert.json"), {}).since) <= Date.now() && Boolean(state("juge").failingSince),
      `${JSON.stringify(h)} ${JSON.stringify(alerts())} ${JSON.stringify(mail).slice(0, 400)}`);
    setState("juge", { lastRun: ago(2) });
    h = hub({ FAUX_CLAUDE_EXIT: "1" });
    check("and once a day at most for a judge", passes().length === 3 && state("juge").failures === 3 && alerts().length === 1, JSON.stringify(alerts()));
    setState("juge", { lastRun: ago(2), alertedAt: ago(48) });
    h = hub({ FAUX_CLAUDE_EXIT: "1", RESEND_API_KEY: "" });
    check("an alert that cannot leave never fails the beat: it is said in the journal and in the hub's log", ran(h, "juge").length === 1 && alerts().length === 2 && alerts()[1].sent === false && /juge: 4 failures in a row, 5 item\(s\) waiting; alert NOT sent/.test(hubLog()), `${JSON.stringify(h)} ${hubLog().slice(-400)}`);
    // A NETWORK THAT DROPS IS NOT WORTH A MAIL (2026-11-20): the judge tries
    // again every ten minutes, and the person is told once it has lasted an hour.
    {
      const offline = { FAUX_CLAUDE_EXIT: "1", FAUX_CLAUDE_SAYS: "API Error: Unable to connect to API: SSL certificate hostname mismatch" };
      const sentBefore = alerts().length;
      setState("juge", { lastRun: ago(2), alertedAt: ago(48), failingSince: new Date(Date.now() - 20 * 60_000).toISOString() });
      h = hub(offline);
      check("a judge that cannot reach Claude for twenty minutes sends no mail, however many times it failed", ran(h, "juge")[0]?.ok === false && state("juge").failures >= 2 && alerts().length === sentBefore && /Unable to connect/.test(state("juge").lastError ?? ""), `${JSON.stringify(state("juge"))} ${JSON.stringify(alerts().length)}`);
      h = hub(offline);
      check("and it does not wait an hour to try again: ten minutes", ran(h, "juge").length === 0, JSON.stringify(h));
      setState("juge", { lastRun: new Date(Date.now() - 11 * 60_000).toISOString(), failingSince: ago(1.5) });
      h = hub(offline);
      check("after an hour without the network, the person is told", ran(h, "juge")[0]?.ok === false && alerts().length === sentBefore + 1, `${JSON.stringify(h)} ${JSON.stringify(alerts().at(-1))}`);
    }
    setState("juge", { lastRun: ago(2) });
    h = hub();
    check("a success brings the failures back to 0", state("juge").failures === 0 && state("juge").lastError === null && !("failingSince" in state("juge")) && pile("juge").length === 0, JSON.stringify(state("juge")));
    // THE SAME TICK (2026-11-20): with no "gather" of its own, a judge reads in
    // the beat that fed its pile; with "gather": "30m" it waits for the next tick.
    {
      const kept = readJ(join(sourceDir("juge"), "source.json"));
      const { gather: _g, ...plain } = kept;
      writeFileSync(join(sourceDir("juge"), "source.json"), JSON.stringify(plain, null, 2), "utf8");
      rmSync(claudeLog, { force: true });
      toJudge("juge", ["t:same-tick"]);
      h = hub();
      check("a judge with no gathering of its own reads in the beat that fed its pile", ran(h, "juge")[0]?.ok === true && passes().length === 1 && !pile("juge").some((i) => i.ref === "t:same-tick"), JSON.stringify(h));
      define("juge", { gather: "30m" });
      rmSync(claudeLog, { force: true });
      toJudge("juge", ["t:next-tick"]);
      h = hub();
      check("asked to gather, it waits for the next tick of the clock", ran(h, "juge").length === 0 && passes().length === 0 && pile("juge").some((i) => i.ref === "t:next-tick"), JSON.stringify(h));
      writeFileSync(join(sourceDir("juge"), "source.json"), JSON.stringify(kept, null, 2), "utf8");
      h = hub();
    }

    // No instructions.md: a plain error, written in its state, and the beat goes on.
    const keptInstructions = readFileSync(instructions, "utf8");
    rmSync(instructions, { force: true });
    rmSync(claudeLog, { force: true });
    toJudge("juge", ["t:13"]);
    setState("releve", { lastRun: ago(1) });
    h = hub();
    check("a judge without its instructions.md gives a plain error, and the rest of the beat runs", !h.crashed && ran(h, "releve")[0]?.ok === true && ran(h, "juge")[0]?.ok === false && /instructions\.md/.test(state("juge").lastError ?? "") && state("juge").failures === 1 && passes().length === 0 && pile("juge").length === 1, `${JSON.stringify(h)} ${JSON.stringify(state("juge"))}`);
    writeFileSync(instructions, keptInstructions, "utf8");

    // Paused: still there, with its state, but never by itself.
    script("amont");
    define("releve", { after: ["source:amont"] });
    r = node("sources.mjs", ["pause", "releve"]);
    node("sources.mjs", ["pause", "juge"]);
    rows = json(node("sources.mjs", ["list", "--json"]).out).sources;
    check("a paused source stays in the list, enabled, with its state, and is never due", r.ok && json(r.out).paused === true && rows.find((x) => x.name === "releve")?.paused === true && rows.find((x) => x.name === "releve")?.enabled === true && Boolean(rows.find((x) => x.name === "releve")?.lastSuccess) && rows.find((x) => x.name === "juge")?.paused === true && events().some((e) => e.what === "paused" && e.who === "source:releve"), JSON.stringify(rows));
    setState("releve", { lastRun: ago(1) });
    setState("juge", { lastRun: ago(2), lastError: null });
    flagDue("releve", "skill some-skill");
    toJudge("juge", ["t:14", "t:15"]);
    h = hub();
    check("paused, a source runs neither by its rhythm, nor by a flag, nor after another source", ran(h, "amont")[0]?.ok === true && ran(h, "releve").length === 0 && rows.find((x) => x.name === "releve")?.due === false, JSON.stringify(h));
    check("a paused judge does not empty its pile, which keeps gathering", ran(h, "juge").length === 0 && passes().length === 0 && pile("juge").length === 3, `${JSON.stringify(h)} ${JSON.stringify(pile("juge"))}`);
    r = node("sources.mjs", ["run", "--due"]);
    check("nor does the evening save run a paused source", r.ok && !json(r.out).runs.some((x) => x.name === "releve"), r.out);
    flagDue("releve", "now");
    writeFileSync(join(hb, "judge", "juge.now"), new Date().toISOString(), "utf8");
    h = hub();
    check("only the person's own \"now\" runs them, once: the source, and the judge's whole pile", ran(h, "releve")[0]?.ok === true && passes().map((x) => x.items).join() === "2,1" && pile("juge").length === 0, `${JSON.stringify(h)} ${JSON.stringify(passes())}`);
    setState("releve", { lastRun: ago(1) });
    toJudge("juge", ["t:16"]);
    h = hub();
    check("and they stand still again at the next beat", ran(h, "releve").length === 0 && ran(h, "juge").length === 0 && pile("juge").length === 1, JSON.stringify(h));
    r = node("sources.mjs", ["resume", "releve"]);
    node("sources.mjs", ["resume", "juge"]);
    h = hub();
    rows = json(node("sources.mjs", ["list", "--json"]).out).sources;
    check("resumed, the source and the judge run again by themselves", r.ok && json(r.out).paused === false && ran(h, "releve")[0]?.ok === true && ran(h, "juge")[0]?.ok === true && pile("juge").length === 0 && rows.find((x) => x.name === "releve")?.paused === false && events().some((e) => e.what === "resumed" && e.who === "source:juge"), `${JSON.stringify(h)} ${JSON.stringify(rows)}`);

    // The hub's saves, grouped: one commit an hour at most.
    rmSync(saveFile, { force: true });
    const c0 = commits();
    bring("g1", "Premier passage du hub");
    h = hub(hour);
    check("a beat that writes saves at once when the hub's last save is an hour old or more", h.save === "done" && commits() === c0 + 1 && git("status", "--porcelain", "vault/sources/premier-passage-du-hub.md") === "" && readJ(saveFile, {}).due === false && Boolean(readJ(saveFile, {}).lastSave), `${JSON.stringify(h)} ${git("status", "--porcelain")}`);
    bring("g2", "Second passage du hub");
    h = hub(hour);
    check("a second beat that writes within the hour rebuilds the index but makes no commit: the save is noted as due", ran(h, "releve")[0]?.wrote === true && h.save === "postponed" && commits() === c0 + 1 && git("status", "--porcelain", "vault/sources/second-passage-du-hub.md") !== "" && readJ(saveFile, {}).due === true && /index rebuilt; save: postponed \(next within \d+ min\)/.test(hubLog()), `${JSON.stringify(h)} ${hubLog().slice(-300)}`);
    writeFileSync(saveFile, JSON.stringify({ ...readJ(saveFile, {}), lastSave: ago(2) }), "utf8");
    h = hub(hour);
    check("the hour past, the first beat makes the save owed, even if it wrote nothing itself", (h.runs ?? []).length === 0 && h.save === "done" && commits() === c0 + 2 && git("status", "--porcelain", "vault/sources/second-passage-du-hub.md") === "" && readJ(saveFile, {}).due === false, `${JSON.stringify(h)} ${git("status", "--porcelain")}`);

    }
    if (await scene("judge-limits")) {
    // ---- a judge's limits (2026-11-17): a cap for the day, a confirmation
    // before a big catch-up, what it must never read. Six days of real use had
    // cost 74 million tokens, and every conversation of a month was read.
    {
      const beat = (extra = {}) => hub({ ...hour, ...extra });
      const signals = (what, n = "juge") => events().filter((e) => e.act === "signal" && e.what === what && e.who === `source:${n}`);
      const judgeState = (n = "juge") => json(node("judge.mjs", ["state"]).out).live.find((x) => x.name === n) ?? {};
      const holdFile = (n) => join(hb, "judge", `${n}.hold`);
      const seenOf = (n) => readJ(join(sourceDir(n), "seen.json"), {});
      const sizes = () => passes().map((x) => x.items).join();
      const gatedBy = (why, n = "juge") => [{ name: n, why }];

      // What a judge spent today is asked at every beat: the journal is read
      // from its end, block after block, and no further than the day.
      {
        const home = join(BASE, "home-journal");
        mkdirSync(join(home, ".hypervibe-brain"), { recursive: true });
        const key = BRAIN.replace(/\\/g, "/");
        const stamp = (ms) => new Date(Date.now() - ms).toISOString();
        const pad = "é".repeat(150);
        const old = Array.from({ length: 3000 }, (_, i) => JSON.stringify({ at: stamp(2 * 86400_000 - i), id: `o${i}`, brain: key, act: "signal", what: "old", pad }));
        const fresh = Array.from({ length: 2000 }, (_, i) => JSON.stringify({ at: stamp(3600_000 - i), id: `n${i}`, brain: i % 10 === 9 ? "another/brain" : key, act: "signal", what: "new", n: i, pad }));
        writeFileSync(join(home, ".hypervibe-brain", "events.jsonl"), `${[...old, "not json at all", ...fresh].join("\n")}\n`, "utf8");
        r = run("node", ["--input-type=module", "-e", `import { recentEvents } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "journal.mjs")).href)}; const e = recentEvents(process.argv[1]); console.log(JSON.stringify({ count: e.length, first: e[0]?.n, last: e.at(-1)?.n, ordered: e.every((x, i) => i === 0 || x.n > e[i - 1].n), whole: e.every((x) => x.pad.length === 150 && x.what === "new") }));`, stamp(86400_000)], { env: { HVBRAIN_HOME: home, HVBRAIN_DIR: BRAIN } });
        check("the journal's latest events are read from its end, across blocks: all those of this brain since the date, in order, none older", r.ok && same(json(r.out), { count: 1800, first: 0, last: 1998, ordered: true, whole: true }), r.out + r.err);
      }

      // THE CAP. 9 items, 2 at a time, 100 000 tokens a pass, a cap of 250 000.
      r = node("sources.mjs", ["set", "juge", "dailyTokens", "250000"]);
      const badSet = [node("sources.mjs", ["set", "juge", "dailyTokens", "-3"]), node("sources.mjs", ["set", "juge", "dailyTokens", "many"]), node("sources.mjs", ["set", "releve", "dailyTokens", "5"]), node("sources.mjs", ["set", "juge", "model", "opus"])];
      check("a judge's cap for the day is set by a command, which refuses what is not a whole number and a source that is not a judge", r.ok && same(json(r.out), { ok: true, name: "juge", dailyTokens: 250000 }) && readJ(join(sourceDir("juge"), "source.json")).dailyTokens === 250000 && badSet.every((x) => !x.ok && json(x.out).ok === false) && !("dailyTokens" in readJ(join(sourceDir("releve"), "source.json"))), r.out + badSet.map((x) => x.out).join(""));
      const spending = { FAUX_CLAUDE_TOKENS: "100000" };
      rmSync(claudeLog, { force: true });
      toJudge("juge", ["c:1", "c:2", "c:3", "c:4", "c:5", "c:6", "c:7", "c:8"]);
      h = beat(spending);
      let now = judgeState();
      check("a judge that reaches its cap for the day stops there: the pass in progress ends (one pass may go past the cap), the next is not run, its pile waits", sizes() === "2,2,2" && pile("juge").length === 2 && same(h.gated, gatedBy("capped")) && now.spentToday === 300000 && now.dailyTokens === 250000 && now.capped === true, `${JSON.stringify(h)} ${JSON.stringify(now)} ${sizes()}`);
      toJudge("juge", ["c:9"]);
      h = beat(spending);
      const capped = signals("capped");
      check("the journal says it once per judge and per day, with what was spent and the cap; the pile keeps gathering", passes().length === 3 && ran(h, "juge").length === 0 && pile("juge").length === 3 && capped.length === 1 && capped[0].spent === 300000 && capped[0].cap === 250000 && (hubLog().match(/juge: at its cap for today/g) ?? []).length === 1, `${JSON.stringify(h)} ${JSON.stringify(capped)}`);
      writeFileSync(join(hb, "judge", "juge.now"), new Date().toISOString(), "utf8");
      h = beat(spending);
      check("the person's own \"now\" still runs a capped judge, once", sizes() === "2,2,2,2,1" && pile("juge").length === 0 && !h.gated, `${JSON.stringify(h)} ${sizes()}`);
      toJudge("juge", ["c:10"]);
      h = beat(spending);
      check("and it stands still again at the next beat, without a second signal", passes().length === 5 && pile("juge").length === 1 && same(h.gated, gatedBy("capped")) && signals("capped").length === 1, JSON.stringify(h));
      // The next day, without waiting for it: in the journal, the judge's runs
      // and its signal are now a day old.
      writeFileSync(join(hb, "events.jsonl"), `${events().map((e) => JSON.stringify(e.who === "source:juge" && (e.act === "run" || e.what === "capped") ? { ...e, at: new Date(Date.parse(e.at) - 86400_000).toISOString() } : e)).join("\n")}\n`, "utf8");
      h = beat(spending);
      now = judgeState();
      check("the next local day it runs again by itself: only the runs of the day count", passes().length === 6 && pile("juge").length === 0 && !h.gated && now.spentToday === 100000 && !now.capped, `${JSON.stringify(h)} ${JSON.stringify(now)}`);

      // THE CATCH-UP. More than "catchUp" items at once: the judge waits for the person.
      node("sources.mjs", ["set", "juge", "dailyTokens", "0"]);
      node("sources.mjs", ["set", "juge", "catchUp", "4"]);
      rmSync(claudeLog, { force: true });
      const dated = (prefix, days) => days.map((d) => `doc://${prefix}/${d}#2026-11-${String(d).padStart(2, "0")}T10:00:00.000Z`);
      // What an item cost so far, as the journal says it: the measure of the estimate.
      const per = events().filter((e) => e.act === "run" && e.who === "source:juge" && e.ok && e.judged > 0 && e.tokens).map((e) => (e.tokens.in + e.tokens.out + e.tokens.cacheRead + e.tokens.cacheWrite) / e.judged).sort((a, b) => a - b);
      const median = Math.round(per.length % 2 ? per[per.length >> 1] : (per[(per.length >> 1) - 1] + per[per.length >> 1]) / 2);
      toJudge("juge", dated("a", [3, 1, 6, 2, 5, 4]));
      h = beat();
      let hold = readJ(holdFile("juge"));
      check(
        "a judge whose pile holds more items than its threshold is held before its first pass: nothing is read, and a hold says how many wait and what reading them would cost, from the median of its past runs",
        passes().length === 0 && same(h.gated, gatedBy("catch-up")) && pile("juge").length === 6 && hold?.items === 6 && median > 0 && hold.estimate === 6 * median && Boolean(Date.parse(hold.at)) && signals("catch-up").length === 1 && signals("catch-up")[0].items === 6 && signals("catch-up")[0].estimate === hold.estimate,
        `${JSON.stringify(h)} ${JSON.stringify(hold)} median ${median}`,
      );
      toJudge("juge", dated("a", [7]));
      h = beat();
      hold = readJ(holdFile("juge"));
      now = judgeState();
      check("held, it stays so beat after beat: one signal in the journal, a hold that follows the pile, and the judge's state shows it", passes().length === 0 && signals("catch-up").length === 1 && hold.items === 7 && hold.estimate === 7 * median && now.held?.items === 7 && now.held.estimate === hold.estimate && now.waiting === 7 && json(node("judge.mjs", ["catch-up", "juge"]).out).held?.items === 7 && (hubLog().match(/juge: held before a catch-up/g) ?? []).length === 1, `${JSON.stringify(hold)} ${JSON.stringify(now)}`);
      const reported = json(node("judge.mjs", ["report"]).out).juge;
      r = run("node", ["--input-type=module", "-e", `import { t } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "i18n.mjs")).href)}; const r = JSON.parse(process.argv[1]); console.log(t("en").review.judgeLine("juge", r)); console.log(t("fr").review.judgeLine("juge", r)); console.log(t("en").review.judgeLine("juge", { ...r, held: undefined, capped: true, spentToday: 300000, dailyTokens: 250000 }));`, JSON.stringify(reported)]);
      check("the weekly review's line says a judge is held, or stopped by its cap, in the person's language", reported.held?.items === 7 && /HELD before a catch-up: 7 items wait/.test(r.out) && /EN ATTENTE avant un rattrapage : 7 éléments attendent/.test(r.out) && /Stopped for today by its daily cap \(300 thousand tokens used, cap 250 thousand\)/.test(r.out), r.out + r.err);

      r = node("judge.mjs", ["catch-up", "juge", "latest", "3"]);
      const keptRefs = pile("juge").map((i) => i.ref).sort();
      const back = json(node("judge.mjs", ["add", "--source", "juge", "--ref", dated("a", [1])[0], "--title", "Back again"]).out);
      check("\"latest 3\" keeps the three most recent items, by their own date, and sets the others aside unread: marked seen, they do not come back", r.ok && same(json(r.out), { ok: true, kept: 3, dropped: 4 }) && same(keptRefs, dated("a", [5, 6, 7])) && dated("a", [1, 2, 3, 4]).every((x) => x in seenOf("juge")) && back.added === false && !existsSync(holdFile("juge")) && passes().length === 0, `${r.out} ${JSON.stringify(keptRefs)} ${JSON.stringify(back)}`);
      h = beat();
      check("the hold lifted, the judge reads what was kept", sizes() === "2,1" && pile("juge").length === 0 && !h.gated, `${JSON.stringify(h)} ${sizes()}`);

      // "all": read to its end, over as many runs as it takes.
      rmSync(claudeLog, { force: true });
      toJudge("juge", dated("b", [1, 2, 3, 4, 5, 6, 7]));
      h = beat();
      r = node("judge.mjs", ["catch-up", "juge", "all"]);
      // One pass by hand: 5 items left, still above the threshold. Two more arrive, as on any day.
      const one = json(node("judge.mjs", ["run", "juge"], { env: judgeEnv }).out);
      toJudge("juge", ["doc://b/later-1#x", "doc://b/later-2#x"]);
      const next = beat();
      check("\"all\" lets it read everything: the pile is read to its end over several runs without a new question, with the few items that arrived meanwhile", same(h.gated, gatedBy("catch-up")) && same(json(r.out), { ok: true, kept: 7, dropped: 0 }) && one.judged === 2 && !next.gated && sizes() === "2,2,2,2,1" && pile("juge").length === 0 && !existsSync(holdFile("juge")) && signals("catch-up").length === 2, `${JSON.stringify(h)} ${r.out} ${JSON.stringify(next)} ${sizes()}`);

      // Another burst asks again; "drop" sets it all aside.
      toJudge("juge", dated("c", [1, 2, 3, 4, 5]));
      h = beat();
      r = node("judge.mjs", ["catch-up", "juge", "drop"]);
      check("another burst asks again, and \"drop\" sets it all aside unread", same(h.gated, gatedBy("catch-up")) && signals("catch-up").length === 3 && same(json(r.out), { ok: true, kept: 0, dropped: 5 }) && pile("juge").length === 0 && !existsSync(holdFile("juge")) && dated("c", [1, 2, 3, 4, 5]).every((x) => x in seenOf("juge")) && passes().length === 5 && same(signals("catch-up-answer").map((e) => e.answer), ["latest", "all", "drop"]), `${JSON.stringify(h)} ${r.out}`);

      // The person's "now" on a held judge is their answer.
      rmSync(claudeLog, { force: true });
      toJudge("juge", dated("d", [1, 2, 3, 4, 5]));
      h = beat();
      writeFileSync(join(hb, "judge", "juge.now"), new Date().toISOString(), "utf8");
      const asked = beat();
      check("the person's own \"now\" on a held judge counts as \"all\"", same(h.gated, gatedBy("catch-up")) && !asked.gated && sizes() === "2,2,1" && pile("juge").length === 0 && !existsSync(holdFile("juge")) && signals("catch-up-answer").at(-1)?.answer === "now", `${JSON.stringify(h)} ${JSON.stringify(asked)} ${sizes()}`);

      // A judge without history, and a threshold of 0.
      node("sources.mjs", ["add", "neuf", "--kind", "claude", "--every", "week", "--type", "source", "--domains", "ecriture"]);
      define("neuf", { live: true, batch: 2, gather: "0", hours: [0, 24], catchUp: 2 });
      toJudge("neuf", ["n:1", "n:2", "n:3"]);
      node("sources.mjs", ["set", "juge", "catchUp", "0"]);
      rmSync(claudeLog, { force: true });
      toJudge("juge", dated("e", [1, 2, 3, 4, 5, 6]));
      h = beat();
      check("a judge without history counts 150 000 tokens an item, and a threshold of 0 never holds", readJ(holdFile("neuf"))?.estimate === 450000 && same(h.gated, gatedBy("catch-up", "neuf")) && sizes() === "2,2,2" && pile("juge").length === 0 && pile("neuf").length === 3, `${JSON.stringify(h)} ${JSON.stringify(readJ(holdFile("neuf")))} ${sizes()}`);
      node("judge.mjs", ["catch-up", "neuf", "drop"]);

      // WHAT A JUDGE MUST NEVER READ. One rule for every kind of item.
      const cases = [
        ["0. OLD", { path: "C:\\Users\\me\\Docs\\0. old\\plan.docx" }, true],
        ["client-*", { path: "/home/me/dev/client-acme" }, true],
        ["client-*", { path: "/home/me/dev/clients" }, false],
        ["*.xlsx", { address: "writing://2026/Budget.XLSX#2026-11-16T10:00:00.000Z" }, true],
        ["acme", { name: "Acme", address: "claude://session/abc#2026-11-16T10:00:00.000Z" }, true],
        ["claude", { address: "claude://session/abc#2026-11-16T10:00:00.000Z" }, false],
        ["/home/me/Secret/", { path: "/home/me/Secret/deep/a.md" }, true],
        ["/home/me/Secret/", { path: "/home/me/Secretary/a.md" }, false],
        ["/home/me/Secret", { path: "/home/me/Secret" }, true],
        ["Secret/", { path: "/home/me/Secret/a.md" }, false],
        ["C:\\Work\\Secret\\", { path: "C:/Work/Secret/a.md" }, true],
        ["/HOME/ME/secret/", { path: "/home/me/Secret/a.md" }, process.platform === "win32"],
        ["writing://Clients/X/", { address: "writing://Clients/X/plan.docx#2026-11-16T10:00:00.000Z" }, true],
        ["writing://Clients/X/", { address: "writing://Clients/XY/plan.docx" }, false],
        ["Plan 100% sûr #2.md", { address: "writing://Clients/Plan 100%25 sûr %232.md#2026-11-16T10:00:00.000Z" }, true],
      ];
      r = run("node", ["--input-type=module", "-e", `import { excludedBy } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "exclude.mjs")).href)}; console.log(JSON.stringify(JSON.parse(process.argv[1]).map(([p, item]) => excludedBy([p], item) !== null)));`, JSON.stringify(cases)]);
      check("an exclusion without a slash matches one segment by its name, whatever the case, with stars; one with a slash is the start of a path or of an address, cut at a folder", r.ok && same(json(r.out), cases.map((c) => c[2])), `${r.out}${r.err} expected ${JSON.stringify(cases.map((c) => c[2]))}`);

      const work = (...p) => join(BASE, "work", ...p);
      const put = (ref, path) => json(node("judge.mjs", ["add", "--source", "juge", "--ref", ref, "--title", `Item ${ref}`, "--path", path]).out);
      r = node("sources.mjs", ["exclude", "juge", "add", "secret-*"]);
      const refused = put("doc://x/1#v1", work("Secret-Plans", "a.md"));
      const taken = put("doc://x/2#v1", work("open", "a.md"));
      check("an excluded item never reaches the pile, whoever puts it there: refused at the door, and marked seen", r.ok && same(json(r.out), { ok: true, exclude: ["secret-*"], removed: 0, items: [] }) && refused.added === false && refused.reason === "excluded" && taken.added === true && pile("juge").map((i) => i.ref).join() === "doc://x/2#v1" && "doc://x/1#v1" in seenOf("juge") && same(readJ(join(sourceDir("juge"), "source.json")).exclude, ["secret-*"]), `${r.out} ${JSON.stringify(refused)} ${JSON.stringify(taken)}`);
      put("doc://x/3#v1", work("old", "b.md"));
      put("doc://x/4#v1", work("old", "deep", "c.md"));
      put("doc://x/5#v1", work("older", "d.md"));
      const prefix = `${work("old")}/`;
      const dry = json(node("sources.mjs", ["exclude", "juge", "add", prefix, "--dry"]).out);
      const untouched = pile("juge").length === 4 && readJ(join(sourceDir("juge"), "source.json")).exclude.length === 1;
      r = node("sources.mjs", ["exclude", "juge", "add", prefix]);
      check("adding an exclusion takes what matches off the pile, unread and marked seen; --dry only says which items", dry.dry === true && dry.removed === 2 && dry.items.map((i) => i.ref).join() === "doc://x/3#v1,doc://x/4#v1" && untouched && r.ok && json(r.out).removed === 2 && same(json(r.out).exclude, ["secret-*", prefix]) && pile("juge").map((i) => i.ref).join() === "doc://x/2#v1,doc://x/5#v1" && "doc://x/3#v1" in seenOf("juge") && "doc://x/4#v1" in seenOf("juge") && signals("exclude").at(-1)?.removed === 2, `${JSON.stringify(dry)} ${r.out} ${JSON.stringify(pile("juge"))}`);
      const everything = node("sources.mjs", ["exclude", "juge", "add", "*"]);
      const unknown = node("sources.mjs", ["exclude", "juge", "remove", "nothing-like-it"]);
      r = node("sources.mjs", ["exclude", "juge", "remove", "SECRET-*"]);
      const later = put("doc://x/6#v1", work("Secret-Plans", "e.md"));
      const listed = json(node("sources.mjs", ["exclude", "juge", "list"]).out);
      check("an exclusion removed lets new items in; a pattern that would leave out everything, or one that is not in the list, is refused", !everything.ok && /pause the judge/.test(everything.out) && !unknown.ok && r.ok && same(json(r.out), { ok: true, exclude: [prefix], removed: 0 }) && later.added === true && same(listed, { ok: true, exclude: [prefix], removed: 0 }), `${everything.out} ${unknown.out} ${r.out} ${JSON.stringify(later)}`);
      rmSync(sourceDir("neuf"), { recursive: true, force: true });
    }

    }
    if (await scene("judge-token")) {
    // ---- the judge's token, for everyone (judge-token.mjs, 2026-11-17). Looked
    // for in the environment, then in the Hypervibe vault, then in a file of
    // the plugin's own. Every token here is made up, and Claude's place is
    // still taken by the stand-in: no real token, no real call.
    {
      const tokenFile = join(hb, "judge-token.json");
      const made = (tag) => `sk-ant-oat01-${tag}-${"x".repeat(48)}`;
      const print = (t) => createHash("sha256").update(t).digest("hex").slice(0, 12);
      const [E, V, F, N1, N2] = ["env", "vault", "file", "new", "newer"].map(made);
      // No token anywhere, no vault, and no stand-in for Claude: a judge must fail before it starts anything.
      const none = { CLAUDE_CODE_OAUTH_TOKEN: "", HVBRAIN_VAULT: "off", HVBRAIN_CLAUDE: "" };
      const tok = (a, o = {}) => node("judge-token.mjs", a, o);
      const judgeState = (n) => json(node("judge.mjs", ["state"], { env: none }).out).live.find((x) => x.name === n) ?? {};
      node("sources.mjs", ["add", "essai", "--kind", "claude", "--every", "week", "--type", "source", "--domains", "ecriture"]);
      define("essai", { live: true, batch: 2, gather: "0", hours: [0, 24] });
      toJudge("essai", ["e:1"]);

      r = tok(["state"], { env: none });
      check("with no token anywhere, the state says so in one line", r.ok && json(r.out).found === null && same(json(r.out).places, { env: false, vault: "none", file: false }) && r.out.trim().split("\n").length === 1, r.out);
      r = node("judge.mjs", ["run", "essai"], { env: none });
      check(
        "a judge without any token fails with a sentence that names judge-token.mjs, and its pile keeps everything",
        r.ok && json(r.out).ok === false && /judge-token\.mjs set/.test(json(r.out).error) && /judge-token\.mjs set/.test(state("essai").lastError ?? "") && /never in a conversation/.test(state("essai").lastError ?? "") && state("essai").failures === 1 && Boolean(state("essai").failingSince) && pile("essai").length === 1,
        `${r.out} ${JSON.stringify(state("essai"))}`,
      );
      check("and its state names the cause: no token", judgeState("essai").cause === "no-token" && judgeState("essai").failures === 1 && judgeState("essai").down === false, JSON.stringify(judgeState("essai")));

      r = tok(["set"], { env: none, input: `${F}\n` });
      const kept = json(r.out);
      check(
        "set keeps the token in a file of the plugin's own, for the person alone, and never prints it",
        r.ok && kept.stored === "file" && kept.shape === "oauth" && !r.out.includes(F) && readJ(tokenFile)?.token === F && (process.platform === "win32" ? /^(access list|profile folder)/.test(kept.kept) : kept.kept === "mode 600" && (statSync(tokenFile).mode & 0o777) === 0o600),
        r.out.replaceAll(F, "<the token>"),
      );
      r = tok(["state"], { env: none });
      check("state says where a token is found, never its value", r.ok && json(r.out).found === "file" && json(r.out).shape === "oauth" && json(r.out).places.file === true && !r.out.includes(F) && !r.out.includes("xxxx"), r.out.replaceAll(F, "<the token>"));
      r = tok(["set"], { env: none, input: "too-short" });
      const apiKey = tok(["set"], { env: none, input: `sk-ant-api03-${"y".repeat(60)}` });
      const spaced = tok(["set"], { env: none, input: `here is my token ${F}` });
      check("what cannot be a token is refused, and the one already kept stays", !r.ok && json(r.out).why === "short" && !apiKey.ok && json(apiKey.out).why === "api-key" && !spaced.ok && json(spaced.out).why === "spaces" && readJ(tokenFile)?.token === F, `${r.out} ${apiKey.out}`);
      r = tok(["check"], { env: none });
      check("check verifies that a token is found and has the shape of one, without any call", r.ok && same(json(r.out), { ok: true, found: "file", shape: "oauth" }), r.out);

      // A Hypervibe vault on this computer (a stand-in, in the bench's own home).
      const vaultDir = join(HOME, ".claude", "plugins", "faux-coffre", "scripts", "vault");
      mkdirSync(vaultDir, { recursive: true });
      writeFileSync(join(vaultDir, "vault.mjs"), [
        'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
        'import { dirname, join } from "node:path";',
        'import { fileURLToPath } from "node:url";',
        "const DIR = dirname(fileURLToPath(import.meta.url));",
        'const FILE = join(DIR, "vault.json");',
        'const locked = () => existsSync(join(DIR, "locked"));',
        'const read = () => { try { return JSON.parse(readFileSync(FILE, "utf8")); } catch { return {}; } };',
        "export function putItem(name, fields) {",
        '  if (locked()) throw new Error("locked");',
        "  const v = read();",
        "  v[name] = { ...(v[name] ?? {}), ...Object.fromEntries(fields.map((f) => [f.name, f.value])) };",
        "  writeFileSync(FILE, JSON.stringify(v));",
        '  return "created";',
        "}",
        'if (String(process.argv[1] ?? "").replaceAll("\\\\", "/").endsWith("/scripts/vault/vault.mjs")) {',
        "  const [cmd, item, field] = process.argv.slice(2);",
        '  if (cmd === "status") console.log(locked() ? "locked" : "unlocked");',
        '  else if (cmd === "get") {',
        "    if (locked()) process.exit(2);",
        "    const value = read()[item]?.[field];",
        "    if (!value) process.exit(4);",
        "    console.log(value);",
        "  } else process.exit(1);",
        "}",
        "",
      ].join("\n"), "utf8");
      const vaultFile = join(vaultDir, "vault.json");
      const lock = (on) => (on ? writeFileSync(join(vaultDir, "locked"), "", "utf8") : rmSync(join(vaultDir, "locked"), { force: true }));
      writeFileSync(vaultFile, JSON.stringify({ CLAUDE_CODE: { oauth_token: V } }), "utf8");
      const open = { CLAUDE_CODE_OAUTH_TOKEN: "", HVBRAIN_VAULT: "" };
      // Which token a judge's run is given: the stand-in says its fingerprint.
      let turn = 0;
      const given = (extra) => {
        rmSync(claudeLog, { force: true });
        toJudge("essai", [`e:turn-${++turn}`]);
        node("judge.mjs", ["run", "essai"], { env: { ...judgeEnv, ...extra } });
        return passes().at(-1)?.token ?? null;
      };
      // THE TOKEN LIVES OUTSIDE THE VAULT (2026-11-21): a vault closes itself
      // after a few hours, and every judge stopped with it. The environment
      // first, then the plugin's file, then the vault for whoever kept it there.
      const fromFile = given(open);
      const fromEnv = given({ ...open, CLAUDE_CODE_OAUTH_TOKEN: E });
      const keptFile = readFileSync(tokenFile, "utf8");
      rmSync(tokenFile, { force: true });
      const fromVault = given(open);
      writeFileSync(tokenFile, keptFile, "utf8");
      lock(true);
      r = tok(["state"], { env: open });
      check(
        "a judge's token is looked for in the environment, then in the plugin's file, then in the Hypervibe vault",
        fromEnv === print(E) && fromFile === print(F) && fromVault === print(V) && json(r.out).found === "file" && json(r.out).places.vault === "locked" && ![E, V, F].some((t) => r.out.includes(t)),
        `${fromEnv} ${fromFile} ${fromVault} (expected ${print(E)} ${print(F)} ${print(V)}) ${r.out.replaceAll(F, "<the token>")}`,
      );
      r = tok(["set"], { env: open, input: N1 });
      check("with a vault that is locked, set keeps the token in the file", r.ok && json(r.out).stored === "file" && readJ(tokenFile)?.token === N1 && readJ(vaultFile).CLAUDE_CODE.oauth_token === V, r.out.replaceAll(N1, "<the token>"));
      lock(false);
      r = tok(["set"], { env: open, input: N2 });
      const inFile = tok(["state"], { env: open });
      check(
        "with an open vault too, set keeps the token in the file, and leaves the vault as it was",
        r.ok && json(r.out).stored === "file" && !r.out.includes(N2) && readJ(tokenFile)?.token === N2 && readJ(vaultFile).CLAUDE_CODE.oauth_token === V && json(inFile.out).found === "file" && !inFile.out.includes(N2),
        `${r.out.replaceAll(N2, "<the token>")} ${inFile.out.replaceAll(N2, "<the token>")}`,
      );
      // A token kept in the vault only is copied out once, never shown.
      rmSync(tokenFile, { force: true });
      r = tok(["keep-outside"], { env: open });
      check("keep-outside copies the vault's token into the file without showing it", r.ok && json(r.out).ok === true && readJ(tokenFile)?.token === V && !r.out.includes(V), r.out.replaceAll(V, "<the token>"));
      // A network that dropped does not cost an hour: ten minutes, then the judge tries again.
      r = run("node", ["--input-type=module", "-e", `import { restAfter } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "judge-errors.mjs")).href)}; console.log(JSON.stringify(["exit 1: API Error: Unable to connect to API: SSL certificate hostname mismatch", "exit 1: OAuth token has expired", "exit 1: something else", null].map((e) => restAfter(e) / 60000)));`]);
      check("a judge rests ten minutes after a network failure, an hour after any other", r.ok && same(json(r.out), [10, 60, 60, 60]), r.out + r.err);
      // A VAULT THAT IS LOCKED IS NOT A MISSING TOKEN (2026-11-18): the token is
      // in the vault and nowhere else, and the vault locks itself just before a
      // run. The judge waits; nothing is counted against it.
      {
        // (The token in the vault and nowhere else: the case of a brain that never moved it out.)
        rmSync(tokenFile, { force: true });
        lock(true);
        toJudge("essai", ["e:vault-locked"]);
        const before = state("essai");
        r = node("judge.mjs", ["run", "essai"], { env: { ...judgeEnv, ...open, HVBRAIN_CLAUDE: "" } });
        const waits = json(r.out);
        check(
          "a vault that locked itself is not a missing token: the judge waits, with no failure counted and its pile kept",
          waits.vaultLocked === true && waits.ok === false && (state("essai").failures ?? 0) === (before.failures ?? 0) && (state("essai").lastError ?? null) === (before.lastError ?? null) && pile("essai").some((i) => i.ref === "e:vault-locked"),
          r.out + JSON.stringify(state("essai")),
        );
        lock(false);
        rmSync(claudeLog, { force: true });
        r = node("judge.mjs", ["run", "essai"], { env: { ...judgeEnv, ...open } });
        check("the vault open again, it reads what waited, with the token of the vault", json(r.out).ok === true && passes().at(-1)?.token === print(V) && !pile("essai").some((i) => i.ref === "e:vault-locked"), r.out);
        // Back to the file, for what follows.
        tok(["set"], { env: open, input: N2 });
      }

      // check --live: one real turn, here the stand-in's. An API key of the environment is kept out of it.
      rmSync(claudeLog, { force: true });
      const live = { ...open, HVBRAIN_CLAUDE: join(HERE, "faux-claude.mjs"), FAUX_CLAUDE_LOG: claudeLog, FAUX_CLAUDE_EXIT: "", FAUX_CLAUDE_ADD: "", FAUX_CLAUDE_TOKENS: "", FAUX_CLAUDE_PROMPT: "", ANTHROPIC_API_KEY: "not-a-real-key" };
      r = tok(["check", "--live"], { env: live });
      const turnAsked = passes().at(-1) ?? { args: [] };
      check(
        "check --live asks Claude one turn with the token alone: the smallest model, no tool, no API key of the environment",
        r.ok && json(r.out).live === true && json(r.out).works === true && passes().length === 1 && turnAsked.token === print(N2) && turnAsked.apiKey === false && after(turnAsked, "--max-turns") === "1" && after(turnAsked, "--model") === "haiku" && after(turnAsked, "--tools") === "" && after(turnAsked, "--setting-sources") === "",
        `${r.out} ${JSON.stringify(turnAsked)}`,
      );
      r = tok(["check", "--live"], { env: { ...live, FAUX_CLAUDE_EXIT: "1" } });
      check("a token that Claude refuses is said as such: it does not work, and why", !r.ok && json(r.out).works === false && json(r.out).cause === "token" && /the login expired/.test(json(r.out).error) && !r.out.includes(N2), r.out);

      // The hub: a judge whose token is outside the vault does not wait for the vault to be opened.
      lock(true);
      define("essai", { needs: ["CLAUDE_CODE"] });
      tok(["set"], { env: { ...none, HVBRAIN_VAULT: "" }, input: F });
      writeFileSync(pileFile("essai"), JSON.stringify({ items: [] }), "utf8");
      setState("essai", { lastRun: ago(2), lastError: null, failures: 0 });
      toJudge("essai", ["e:hub-1"]);
      h = hub({ HVBRAIN_HUB_VAULT: "locked" });
      const ranWithFile = ran(h, "essai").length === 1 && ran(h, "essai")[0].ok === true && !(h.waiting ?? []).includes("essai") && pile("essai").length === 0;
      r = tok(["forget"], { env: open });
      const forgot = json(r.out);
      toJudge("essai", ["e:hub-2"]);
      const h2 = hub({ HVBRAIN_HUB_VAULT: "locked" });
      check(
        "a judge whose token is in the plugin's file runs while the vault is locked; without it, the judge waits for the vault",
        ranWithFile && forgot.removed === true && forgot.stillFound === null && forgot.places.vault === "locked" && !existsSync(tokenFile) && ran(h2, "essai").length === 0 && (h2.waiting ?? []).includes("essai") && pile("essai").length === 1,
        `${JSON.stringify(h)} ${r.out} ${JSON.stringify(h2)}`,
      );
      lock(false);
      rmSync(join(HOME, ".claude", "plugins"), { recursive: true, force: true });
      rmSync(join(hb, "queue.json"), { force: true });

      // "now --one": one item, to try a judge that was just repaired. It agrees to nothing more.
      const holdOf = (n) => readJ(join(hb, "judge", `${n}.hold`));
      define("essai", { needs: [], catchUp: 2 });
      writeFileSync(pileFile("essai"), JSON.stringify({ items: [] }), "utf8");
      setState("essai", { lastRun: ago(0.1), lastError: "exit 1: OAuth token has expired", failures: 3, failingSince: ago(5) });
      toJudge("essai", ["e:one-1", "e:one-2", "e:one-3", "e:one-4"]);
      r = node("judge.mjs", ["now", "essai", "--one"]);
      h = hub();
      const afterOne = { runs: ran(h, "essai").length, left: pile("essai").length, failures: state("essai").failures, since: "failingSince" in state("essai"), allowed: existsSync(join(hb, "judge", "essai.allowed")) };
      const h3 = hub();
      check(
        "a judge asked \"now\" for one item reads that item alone, at once, even within the hour that follows a failure",
        r.ok && json(r.out).one === true && afterOne.runs === 1 && ran(h, "essai")[0].ok === true && afterOne.left === 3 && afterOne.failures === 0 && afterOne.since === false,
        `${r.out} ${JSON.stringify(h)} ${JSON.stringify(afterOne)}`,
      );
      check("and that try agrees to nothing: a pile above its threshold is held at the next beat, for the person to answer", afterOne.allowed === false && ran(h3, "essai").length === 0 && (h3.gated ?? []).some((g) => g.name === "essai" && g.why === "catch-up") && holdOf("essai")?.items === 3 && pile("essai").length === 3, `${JSON.stringify(h3)} ${JSON.stringify(holdOf("essai"))}`);

      // ---- the alert of a judge down, for someone who is not technical: which
      // judge, since when, what waits, the likely cause in plain words by class
      // of error, the sentence to say to their AI, the raw error last.
      const SINCE = ago(26);
      const sinceWords = (lang) => new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(SINCE));
      const alertOf = async (error, waiting = 5) => {
        const o = node("letter.mjs", ["alert"], { input: JSON.stringify({ judge: { name: "conversations", error, failures: 3, waiting, since: SINCE } }), env: mailEnv });
        const m = (await mailNow())?.body ?? {};
        return { o, out: json(o.out), text: m.text ?? "", html: m.html ?? "", subject: m.subject ?? "" };
      };
      const CASES = [
        ["token", "exit 1: OAuth token has expired", "no longer accepted"],
        ["network", "exit 1: Unable to connect to API (ENOTFOUND api.anthropic.com)", "could not reach Claude"],
        ["limit", "exit 1: You've hit your weekly limit", "The limit of your Claude plan was reached"],
        ["instructions", "cannot read sources/conversations/instructions.md (ENOENT): a judge needs its instructions", "Its instructions cannot be found"],
        ["no-token", "no lasting token for Claude on this computer (not in the environment, nor in an open Hypervibe vault, nor in the plugin's own file)", "it finds none on this computer"],
        ["no-claude", "exit null: spawnSync claude ENOENT", "cannot be found on this computer"],
        ["other", "exit 3: something nobody has seen yet", "not one the brain knows how to recognise"],
      ];
      const wrong = [];
      for (const [cause, error, words] of CASES) {
        const a = await alertOf(error);
        const t = a.text;
        if (!a.o.ok || a.out.sent !== true || a.out.cause !== cause) wrong.push(`${cause}: ${a.o.out}`);
        else if (!t.includes(words)) wrong.push(`${cause}: its plain words are missing`);
        else if (!t.includes('Open Claude and say: "the judge of my brain is down, repair it"')) wrong.push(`${cause}: no sentence to say`);
        else if (!t.includes("the one that reads your conversations with Claude") || !t.includes(`since ${sinceWords("en-US")}`) || !t.includes("Its last 3 runs failed") || !t.includes("5 items wait in its pile")) wrong.push(`${cause}: which judge, since when, what waits`);
        else if (!(t.lastIndexOf(error.slice(0, 40)) > t.indexOf("To repair it"))) wrong.push(`${cause}: the raw error is not at the end`);
        else if (/[—–]/.test(t) || a.html.includes("<style") || !/the judge "conversations" is down/.test(a.subject)) wrong.push(`${cause}: its form`);
      }
      check("the alert of a judge down says, for each class of error, what happened in plain words and the sentence that has it repaired, the raw error last", wrong.length === 0, wrong.join(" | "));
      const one = await alertOf("exit 1: OAuth token has expired", 1);
      const empty = await alertOf("exit 1: OAuth token has expired", 0);
      const record = readJ(join(hb, "alert.json"), {});
      check("it counts what waits as a person does, and the record kept on the computer names the judge, the cause and since when", one.text.includes("1 item waits in its pile") && empty.text.includes("Its pile is empty for now") && record.judge === "conversations" && record.cause === "token" && record.since === SINCE && record.sent === true, `${one.text} ${JSON.stringify(record)}`);

      // The status says first what needs the person: a judge that is down, an alert.
      setState("essai", { lastRun: ago(0.5), lastError: "exit 1: OAuth token has expired", failures: 2, failingSince: SINCE });
      r = node("status.mjs", ["--json"]);
      const failing = (json(r.out).judgesFailing ?? []).filter((j) => j.name === "essai");
      const plain = node("status.mjs").out;
      check(
        "the status names a judge that is down, since when and why, and says it before anything else",
        r.ok && failing.length === 1 && failing[0].down === true && failing[0].cause === "token" && failing[0].failingSince === SINCE && failing[0].waiting === 3 && json(r.out).lastAlert?.judge === "conversations" && plain.indexOf("JUDGE DOWN: essai") >= 0 && plain.indexOf("JUDGE DOWN: essai") < plain.indexOf("Camille:") && plain.indexOf("ALERT of") < plain.indexOf("Camille:"),
        `${JSON.stringify(failing)} ${plain}`,
      );

      // The test of the channel: where the alerts will arrive, seen before the day one is needed.
      r = node("letter.mjs", ["test"], { env: mailEnv });
      const testMail = await mailNow();
      node("letter.mjs", ["setup", "--channel", "connector", "--to", "camille@exemple.fr"]);
      const byConnector = json(node("letter.mjs", ["test"]).out);
      node("letter.mjs", ["setup", "--channel", "none"]);
      const noChannel = json(node("letter.mjs", ["test"]).out);
      node("letter.mjs", ["setup", "--channel", "resend", "--to", "camille@exemple.fr", "--from", "brain@exemple.fr"]);
      check(
        "the alert channel can be tested: a short mail by Brevo or Resend; with the connector or no channel, the script says that alerts stay on the computer",
        r.ok && json(r.out).sent === true && json(r.out).alertsByMail === true && /a test of the alert/.test(testMail?.body.subject ?? "") && testMail.body.text.includes("the alerts of your brain arrive here") && byConnector.sent === false && byConnector.sendWithConnector === true && byConnector.alertsByMail === false && byConnector.text.includes("A test of the alert") && noChannel.sent === false && noChannel.alertsByMail === false,
        `${r.out} ${JSON.stringify(byConnector)} ${JSON.stringify(noChannel)}`,
      );
      rmSync(sourceDir("essai"), { recursive: true, force: true });
      rmSync(join(hb, "alert.json"), { force: true });
    }

    }
    if (await scene("standard-sources")) {
    // Out of the way of the scenes that follow.
    for (const n of ["releve", "amont", "juge"]) rmSync(sourceDir(n), { recursive: true, force: true });
    rmSync(join(hb, "judge"), { recursive: true, force: true });
    rmSync(saveFile, { force: true });

    // ---- the two standard live sources (templates/sources, sources.mjs install):
    // a judge and the step that feeds its pile, with nothing for the person to
    // write. Here in an English brain; the French one is further down.
    {
      // No token on this computer, whatever the bench itself runs in.
      const quiet = { CLAUDE_CODE_OAUTH_TOKEN: "", HVBRAIN_VAULT: "off" };
      const WORDS = ["Camille-Durand", "acme-crm", "Pennylane", "Dropbox"];
      const personal = (text) => [...WORDS.filter((w) => text.toLowerCase().includes(w.toLowerCase())), ...(text.includes("C:/") ? ["C:/"] : [])];
      const installed = (n) => readdirSync(sourceDir(n)).filter((f) => !/^(state|seen)\.json$/.test(f)).map((f) => readFileSync(join(sourceDir(n), f), "utf8")).join("\n");
      const templates = readdirSync(join(PLUGIN, "templates", "sources"), { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => readFileSync(join(e.parentPath ?? e.path, e.name), "utf8")).join("\n");
      const def = (n) => readJ(join(sourceDir(n), "source.json"));
      const rows = () => json(node("sources.mjs", ["list", "--json"]).out).sources;
      const plugin = PLUGIN.replace(/\\/g, "/");

      r = node("sources.mjs", ["install", "--list"]);
      check("the standard sources are listed: the conversations with Claude, the documents of the watched folders", r.ok && json(r.out).standard.map((x) => x.name).join() === "conversations,documents" && json(r.out).standard.every((x) => x.installed === false && x.sources.length === 2 && x.description), r.out);
      r = node("sources.mjs", ["install", "conversations"], { env: quiet });
      let done = json(r.out);
      const judgeDef = def("conversations");
      check(
        "a standard source is installed as a pair, in the brain's language: a live judge with its instructions, and the step that feeds its pile",
        r.ok && done.installed.join() === "conversations,conversations-watch" && done.lang === "en" && readFileSync(join(sourceDir("conversations"), "instructions.md"), "utf8").includes("## What you never do") && !installed("conversations").includes("Ce que tu ne fais jamais") && judgeDef.kind === "claude" && judgeDef.live === true && judgeDef.gather === "0" && judgeDef.proof === true && /^The judge/.test(judgeDef.description) && def("conversations-watch").kind === "step" && def("conversations-watch").every === "30m" && existsSync(join(sourceDir("conversations-watch"), "run.mjs")),
        r.out,
      );
      check(
        "the judge has only the brain's tools, its reader and the two writing commands of the plugin",
        judgeDef.allowedTools.every((t) => /^mcp__plugin_brain_brain__brain_(search|get|neighbors)$/.test(t) || /^Bash\(node \{plugin\}\/scripts\/(readers\/conversation|fact|capture)\.mjs:\*\)$/.test(t) || t === "Bash(printf:*)") && judgeDef.allowedTools.length === 7,
        JSON.stringify(judgeDef.allowedTools),
      );
      check("the install is the person's approval on this computer: the step is trusted at once, with the fingerprint of the plugin's own file", done.trusted === "conversations-watch" && rows().find((x) => x.name === "conversations-watch")?.trusted === true && rows().find((x) => x.name === "conversations")?.live === true, JSON.stringify(rows()));
      check("it says what remains to do: the hub to turn on, the lasting token of Claude", done.hub === false && done.token === false && done.remains.some((x) => /hub on/.test(x)) && done.remains.some((x) => /setup-token/.test(x) && /judge-token\.mjs set/.test(x) && /never in the conversation/.test(x)), r.out);
      check("its first pass reads the conversations of the last two days, not the thirty that Claude Code keeps", Math.abs(Date.now() - 2 * 86400_000 - Date.parse(def("conversations-watch").from)) < 60_000, def("conversations-watch").from);
      appendFileSync(join(sourceDir("conversations"), "instructions.md"), "\nA rule of my own.\n", "utf8");
      r = node("sources.mjs", ["install", "conversations"], { env: quiet });
      check("a source that exists is never overwritten: the install refuses, and the person's own instructions stay", !r.ok && /Nothing was installed/.test(r.out) && readFileSync(join(sourceDir("conversations"), "instructions.md"), "utf8").includes("A rule of my own."), r.out);

      // By default a standard judge reads in the tick that fed its pile. The
      // checks below look at what waits on a pile between two passes: they ask
      // for the gathering ("gather": "30m", the judge reads at the next tick),
      // which a brain may still choose.
      define("conversations", { gather: "30m" });

      // The conversations of this computer: one settled, one still going, one background run.
      const proj = join(HOME, ".claude", "projects", "C--work");
      mkdirSync(proj, { recursive: true });
      const at = (min) => new Date(Date.now() - min * 60_000).toISOString();
      const said = (min, text, more = {}) => JSON.stringify({ type: "user", timestamp: at(min), message: { role: "user", content: text }, ...more });
      const conv = (name, lines) => {
        writeFileSync(join(proj, name), lines.join("\n"), "utf8");
        const old = new Date(Date.now() - 3 * 3600_000);
        utimesSync(join(proj, name), old, old);
      };
      const first = [JSON.stringify({ type: "ai-title", aiTitle: "A plan for the launch" }), said(300, "First message", { cwd: "C:/work", entrypoint: "cli" }), said(200, "Second message"), said(100, "Third message")];
      conv("conv-1.jsonl", first);
      conv("conv-2.jsonl", [said(60, "One", { entrypoint: "cli" }), said(50, "Two"), said(5, "Three")]);
      conv("conv-3.jsonl", [said(300, "One", { entrypoint: "sdk-cli" }), said(290, "Two"), said(280, "Three")]);
      rmSync(claudeLog, { force: true });
      h = hub();
      let waiting = pile("conversations");
      const firstRef = waiting[0]?.ref ?? "";
      check(
        "the conversations watch puts a settled conversation on its judge's pile: not one still going, not a background run; and the judge gathers before it reads",
        ran(h, "conversations-watch")[0]?.ok === true && waiting.length === 1 && /^claude:\/\/session\/conv-1#\d{4}-\d{2}-\d{2}T/.test(firstRef) && waiting[0].title === 'Conversation "A plan for the launch" (3 messages from the person)' && /1 new and 0 taken up again/.test(state("conversations-watch").lastReport ?? "") && passes().length === 0,
        `${JSON.stringify(h)} ${JSON.stringify(waiting)} ${JSON.stringify(state("conversations-watch"))}`,
      );
      setState("conversations-watch", { lastRun: ago(1) });
      h = hub();
      check("a second pass does not put it twice", ran(h, "conversations-watch")[0]?.ok === true && pile("conversations").length === 1 && /0 new and 0 taken up again/.test(state("conversations-watch").lastReport ?? ""), `${JSON.stringify(h)} ${JSON.stringify(pile("conversations"))}`);

      // The judge reads its pile (asked "now": the bench does not wait a quarter of an hour).
      const promptFile = join(BASE, "prompt-en.txt");
      writeFileSync(join(hb, "judge", "conversations.now"), new Date().toISOString(), "utf8");
      h = hub({ FAUX_CLAUDE_PROMPT: promptFile });
      p = passes();
      const prompt = existsSync(promptFile) ? readFileSync(promptFile, "utf8") : "";
      const tools = p[0]?.args ?? [];
      check(
        "the judge of the standard source runs with its rules resolved: the brain's tools, the plugin's reader and writing commands, nothing refused",
        p.length === 1 && p[0].items === 1 && pile("conversations").length === 0 && firstRef in readJ(join(sourceDir("conversations"), "seen.json"), {}) && tools.includes("mcp__brain__brain_search") && tools.includes(`Bash(node ${plugin}/scripts/readers/conversation.mjs:*)`) && tools.includes(`Bash(node ${plugin}/scripts/capture.mjs:*)`) && tools[tools.indexOf("--tools") + 1] === "Bash" && !events().filter((e) => e.what === "running" && e.who === "source:conversations").at(-1)?.refused,
        `${JSON.stringify(h)} ${JSON.stringify(tools)}`,
      );
      check(
        "a judge's prompt carries the brain it writes for: the person, the types with their folders, the domains, the natures, between its instructions and its pile",
        prompt.includes("## The brain you write for") && prompt.includes("- The person: Camille.") && prompt.includes("note (notes/)") && prompt.includes("idea (ideas/)") && prompt.includes("travail, ecriture, famille") && prompt.includes("note: decision, feedback, lesson") && prompt.indexOf("## What you never do") < prompt.indexOf("## The brain you write for") && prompt.indexOf("## The brain you write for") < prompt.indexOf("## What awaits judging") && prompt.includes(`1. Conversation "A plan for the launch" (3 messages from the person) (${firstRef})`),
        prompt.slice(-1500),
      );
      check("and its instructions name the plugin's own commands, at the place where the plugin lives", prompt.includes(`node ${plugin}/scripts/capture.mjs --title`) && prompt.includes(`node ${plugin}/scripts/fact.mjs --note`) && !prompt.includes("{plugin}") && prompt.includes("every call writes for real") && prompt.includes("One topic, one note"), prompt.slice(0, 600));

      // Taken up again: a fourth message, settled since.
      conv("conv-1.jsonl", [...first, said(40, "Fourth message")]);
      setState("conversations-watch", { lastRun: ago(1) });
      h = hub();
      waiting = pile("conversations");
      const until = firstRef.split("#")[1];
      r = node("readers/conversation.mjs", [waiting[0]?.ref ?? "none", "--since", until]);
      check(
        "a conversation taken up again comes back with the date up to which it was read, and the reader gives only what follows",
        waiting.length === 1 && waiting[0].ref !== firstRef && waiting[0].ref.startsWith("claude://session/conv-1#") && waiting[0].title === `Conversation "A plan for the launch" (4 messages from the person), already read until ${until}` && /0 new and 1 taken up again/.test(state("conversations-watch").lastReport ?? "") && r.out.includes("Fourth message") && !r.out.includes("Third message"),
        `${JSON.stringify(waiting)} ${r.out}`,
      );

      // The documents of a watched folder. A name with a space, an accent, a
      // percent and a hash: the address must survive all four.
      const FOLDER = join(BASE, "Écrits 2026");
      mkdirSync(join(FOLDER, "Clients"), { recursive: true });
      r = node("components.mjs", ["watch", "add", FOLDER]);
      const scheme = json(r.out).root?.scheme;
      r = node("sources.mjs", ["install", "documents"], { env: quiet });
      done = json(r.out);
      check(
        "the documents source is installed the same way, and every watched folder has its name on this computer",
        r.ok && scheme === "ecrits-2026" && done.installed.join() === "documents,documents-watch" && done.trusted === "documents-watch" && done.folders.some((f) => f.scheme === scheme && f.folder === FOLDER.replace(/\\/g, "/")) && done.folders.every((f) => f.scheme) && !done.remains.some((x) => /watch add/.test(x)) && def("documents").allowedTools.includes("Bash(node {plugin}/scripts/readers/document.mjs:*)") && !def("documents").allowedTools.some((t) => /^(Write|Edit|WebFetch)/.test(t)) && same(def("documents").allowedTools.filter((t) => t.startsWith("Read")), ["Read({watch}/**/*.pdf)"]),
        r.out,
      );
      define("documents", { gather: "30m" });
      check("nothing personal reaches a brain: neither in the plugin's templates nor in what is installed", personal(templates).length === 0 && ["conversations", "conversations-watch", "documents", "documents-watch"].every((n) => personal(installed(n)).length === 0), JSON.stringify([personal(templates), ...["conversations", "conversations-watch", "documents", "documents-watch"].map((n) => personal(installed(n)))]));
      // The file written in the other watched folder when the bench began is
      // an old one from here on. It was "settled" (quiet for fifteen minutes)
      // or not according to how long the bench had been running: on a slower
      // day it reached the pile, and a later check counted one item too many
      // (seen 2026-11-17).
      utimesSync(join(WATCHED, "chapitre-1.md"), new Date(Date.now() - 3 * 86400_000), new Date(Date.now() - 3 * 86400_000));
      h = hub();
      const mine = () => pile("documents").filter((i) => i.ref.startsWith(`${scheme}://`));
      check("the first pass of the documents watch sends nothing: never hundreds of documents at once", ran(h, "documents-watch")[0]?.ok === true && /first pass/.test(state("documents-watch").lastReport ?? "") && pile("documents").length === 0, `${JSON.stringify(h)} ${JSON.stringify(state("documents-watch"))}`);
      const minutesAgo = (m) => new Date(Date.now() - m * 60_000);
      const doc = join(FOLDER, "Clients", "Plan 100% sûr #2.md");
      writeFileSync(doc, "# Plan\nLe client a signé pour trois ans.\n", "utf8");
      utimesSync(doc, minutesAgo(20), minutesAgo(20));
      // Still being written, not a document, and one that has not moved since the last pass.
      writeFileSync(join(FOLDER, "en-cours.md"), "Encore en train d'écrire.\n", "utf8");
      writeFileSync(join(FOLDER, "photo.png"), "x", "utf8");
      utimesSync(join(FOLDER, "photo.png"), minutesAgo(20), minutesAgo(20));
      writeFileSync(join(FOLDER, "ancien.md"), "Rien de neuf.\n", "utf8");
      utimesSync(join(FOLDER, "ancien.md"), minutesAgo(3 * 24 * 60), minutesAgo(3 * 24 * 60));
      setState("documents-watch", { lastRun: ago(1), lastSuccess: ago(0.5) });
      h = hub();
      const address = `${scheme}://Clients/Plan 100%25 sûr %232.md`;
      const docRef = mine()[0]?.ref ?? "";
      r = node("readers/document.mjs", [docRef]);
      check(
        "the documents watch puts a changed document of a watched folder on the pile, once it has settled, under an address the reader follows",
        ran(h, "documents-watch")[0]?.ok === true && mine().length === 1 && docRef.startsWith(`${address}#`) && mine()[0].title === "Document: Plan 100% sûr #2.md" && r.ok && r.out.includes("Le client a signé pour trois ans."),
        `${JSON.stringify(h)} ${JSON.stringify(pile("documents"))} ${JSON.stringify(state("documents-watch"))} ${r.out}`,
      );
      utimesSync(doc, minutesAgo(16), minutesAgo(16));
      setState("documents-watch", { lastRun: ago(1), lastSuccess: ago(0.5) });
      h = hub();
      check("a newer version of a document that already waits replaces it in the pile", mine().length === 1 && mine()[0].ref !== docRef && mine()[0].ref.startsWith(`${address}#`) && /1 newer version/.test(state("documents-watch").lastReport ?? ""), `${JSON.stringify(pile("documents"))} ${JSON.stringify(state("documents-watch"))}`);

      // What a judge writes through the plugin's own capture.
      const asJudge = { HVBRAIN_WHO: "ai:documents" };
      const seed = join(BRAIN, "vault", "notes", "contrat-de-trois-ans-avec-le-client.md");
      const before = commits();
      r = node("capture.mjs", ["--title", "Contrat de trois ans avec le client", "--type", "note", "--domains", "travail", "--nature", "decision", "--source", address], { input: "Le client a signé pour trois ans.", env: asJudge });
      check("a judge's seed keeps the document's address as its source, and makes no commit of its own: the hub saves, once an hour at most", r.ok && existsSync(seed) && readFileSync(seed, "utf8").includes(`source: ${JSON.stringify(address)}`) && commits() === before && events().some((e) => e.what === "created" && e.who === "ai:documents" && e.from === address), r.out);
      r = node("capture.mjs", ["--title", "La facture du client", "--type", "note", "--domains", "travail", "--source", address], { input: "La facture F-2026-09-107 de 1 200 € a été payée.", env: asJudge });
      check("and never carries an amount that is data in a tool, as its facts never do", !r.ok && /stays in its tool/.test(r.out) && !existsSync(join(BRAIN, "vault", "notes", "la-facture-du-client.md")), r.out);

      // ---- the limits on the standard sources (2026-11-17): what the judges
      // must never read, a big catch-up, a PDF.
      {
        const seenOf = (n) => readJ(join(sourceDir(n), "seen.json"), {});
        const waitingRefs = (n) => pile(n).map((i) => i.ref);
        check("the standard judges come with a cap for the day, and the documents judge is told how to open a PDF", def("conversations").dailyTokens === 5_000_000 && def("documents").dailyTokens === 5_000_000 && def("documents-watch").extensions.includes(".pdf") && installed("documents").includes("open that exact path with your `Read` tool"), JSON.stringify([def("conversations").dailyTokens, def("documents").dailyTokens, def("documents-watch").extensions]));

        // A project the judge must never read: its conversations never reach the pile.
        const acme = join(HOME, ".claude", "projects", "C--clients-acme");
        mkdirSync(acme, { recursive: true });
        const convIn = (dir, name, lines) => {
          writeFileSync(join(dir, name), lines.join("\n"), "utf8");
          const old = new Date(Date.now() - 3 * 3600_000);
          utimesSync(join(dir, name), old, old);
        };
        const secret = [JSON.stringify({ type: "ai-title", aiTitle: "The Acme contract" }), said(300, "One", { cwd: "C:/clients/Acme", entrypoint: "cli" }), said(200, "Two"), said(100, "Three")];
        convIn(acme, "conv-4.jsonl", secret);
        const other = [JSON.stringify({ type: "ai-title", aiTitle: "Another day" }), said(300, "One", { cwd: "C:/work", entrypoint: "cli" }), said(200, "Two"), said(90, "Three")];
        conv("conv-5.jsonl", other);
        r = node("sources.mjs", ["exclude", "conversations", "add", "acme"]);
        setState("conversations-watch", { lastRun: ago(1) });
        h = hub();
        const acmeRef = Object.keys(seenOf("conversations")).find((x) => x.startsWith("claude://session/conv-4#")) ?? "";
        check(
          "a conversation of an excluded project never reaches the pile: left out by the watch, marked seen without being read, while the others come in",
          r.ok && ran(h, "conversations-watch")[0]?.ok === true && !waitingRefs("conversations").some((x) => x.includes("conv-4")) && Boolean(acmeRef) && /1 left out by its exclusions/.test(state("conversations-watch").lastReport ?? "") && pile("conversations").find((i) => i.ref.startsWith("claude://session/conv-5#"))?.path === "C:/work",
          `${r.out} ${JSON.stringify(h)} ${JSON.stringify(pile("conversations"))} ${JSON.stringify(state("conversations-watch"))}`,
        );
        // The exclusion lifted: what was kept away does not flood in.
        r = node("sources.mjs", ["exclude", "conversations", "remove", "acme"]);
        setState("conversations-watch", { lastRun: ago(1) });
        hub();
        const stillOut = !waitingRefs("conversations").some((x) => x.includes("conv-4"));
        convIn(acme, "conv-4.jsonl", [...secret, said(35, "Four")]);
        setState("conversations-watch", { lastRun: ago(1) });
        hub();
        const acmeBack = pile("conversations").find((i) => i.ref.startsWith("claude://session/conv-4#"));
        check("the exclusion lifted, what was kept away does not come in; taken up again, the conversation comes back from there, with its project", r.ok && !def("conversations").exclude && stillOut && Boolean(acmeBack) && acmeBack.title.endsWith(`already read until ${acmeRef.split("#")[1]}`) && acmeBack.path === "C:/clients/Acme" && acmeBack.name === "C--clients-acme", `${r.out} ${JSON.stringify(pile("conversations"))}`);
        // An item put on the pile before this version carries no path: its project is found again by the reader.
        writeFileSync(pileFile("conversations"), JSON.stringify({ items: pile("conversations").map(({ path: _p, name: _n, ...rest }) => rest) }), "utf8");
        const dryWork = json(node("sources.mjs", ["exclude", "conversations", "add", "C:/work/", "--dry"]).out);
        check("an exclusion added later finds the project of a conversation that already waits, and says which items it would take off", dryWork.dry === true && dryWork.removed === 2 && dryWork.items.every((i) => /conv-(1|5)#/.test(i.ref)) && pile("conversations").length === 3 && !def("conversations").exclude, JSON.stringify(dryWork));

        // A big catch-up on the conversations: only the latest, and the rest does not come back.
        define("conversations", { gather: "0", hours: [0, 24], catchUp: 2 });
        rmSync(claudeLog, { force: true });
        h = hub();
        const heldConv = readJ(join(hb, "judge", "conversations.hold"));
        r = node("judge.mjs", ["catch-up", "conversations", "latest", "1"]);
        const keptConv = waitingRefs("conversations");
        setState("conversations-watch", { lastRun: ago(1) });
        const after = hub();
        check(
          "held before a big catch-up, the conversations judge reads only the latest when told so: the others are set aside, and the next watch does not bring them back",
          same(h.gated, [{ name: "conversations", why: "catch-up" }]) && heldConv?.items === 3 && heldConv.estimate === 450_000 && same(json(r.out), { ok: true, kept: 1, dropped: 2 }) && keptConv.length === 1 && keptConv[0].startsWith("claude://session/conv-4#") && ran(after, "conversations-watch")[0]?.ok === true && /0 new and 0 taken up again/.test(state("conversations-watch").lastReport ?? "") && passes().length === 1 && passes()[0].items === 1 && pile("conversations").length === 0,
          `${JSON.stringify(h)} ${JSON.stringify(heldConv)} ${r.out} ${JSON.stringify(after)} ${JSON.stringify(state("conversations-watch"))} ${JSON.stringify(passes().map((x) => x.items))}`,
        );
        // Set aside, then taken up again: it still comes back, from where it was left.
        node("sources.mjs", ["pause", "conversations"]);
        conv("conv-5.jsonl", [...other, said(32, "Four")]);
        setState("conversations-watch", { lastRun: ago(1) });
        hub();
        const back5 = pile("conversations").find((i) => i.ref.startsWith("claude://session/conv-5#"));
        check("and a conversation set aside, taken up again later, still comes back, from where it was left", Boolean(back5) && /already read until/.test(back5.title) && /0 new and 1 taken up again/.test(state("conversations-watch").lastReport ?? ""), `${JSON.stringify(pile("conversations"))} ${JSON.stringify(state("conversations-watch"))}`);

        // The documents: a PDF reaches the pile; an excluded folder, address or kind of file does not.
        mkdirSync(join(FOLDER, "Clients", "Archive"), { recursive: true });
        mkdirSync(join(FOLDER, "Privé"), { recursive: true });
        const settledFile = (p, text = "x") => {
          writeFileSync(p, text, "utf8");
          utimesSync(p, minutesAgo(20), minutesAgo(20));
        };
        settledFile(join(FOLDER, "Clients", "Offre signée.pdf"), "%PDF-1.4\n");
        settledFile(join(FOLDER, "Clients", "Archive", "vieux.md"), "Ancien.\n");
        settledFile(join(FOLDER, "Privé", "journal.md"), "À moi.\n");
        settledFile(join(FOLDER, "Clients", "budget.xlsx"));
        const adds = [node("sources.mjs", ["exclude", "documents", "add", "archive"]), node("sources.mjs", ["exclude", "documents", "add", `${scheme}://Privé/`]), node("sources.mjs", ["exclude", "documents", "add", "*.xlsx"])];
        setState("documents-watch", { lastRun: ago(1), lastSuccess: ago(0.5) });
        h = hub();
        const titles = () => pile("documents").map((i) => i.title);
        const pdfItem = pile("documents").find((i) => i.title === "Document: Offre signée.pdf");
        check(
          "a PDF of a watched folder reaches the pile; what lies in an excluded folder or under an excluded address, and an excluded kind of file, do not",
          adds.every((x) => x.ok) && ran(h, "documents-watch")[0]?.ok === true && Boolean(pdfItem) && pdfItem.ref.startsWith(`${scheme}://Clients/Offre signée.pdf#`) && !titles().some((x) => /vieux|journal|budget/.test(x)) && /1 changed document\(s\) left out by its exclusions/.test(state("documents-watch").lastReport ?? ""),
          `${adds.map((x) => x.out).join("")} ${JSON.stringify(h)} ${JSON.stringify(pile("documents"))} ${JSON.stringify(state("documents-watch"))}`,
        );
        // An exclusion added while a document already waits: found by its address.
        r = node("sources.mjs", ["exclude", "documents", "add", "Plan*"]);
        check("an exclusion takes a waiting document off the pile, by its name", r.ok && json(r.out).removed === 1 && /Plan 100% sûr #2\.md$/.test(json(r.out).items[0]?.title ?? "") && !titles().some((x) => x.includes("Plan 100%")), r.out);

        // The judge opens a PDF with Claude's own Read tool, on the watched folders and nowhere else.
        r = node("readers/document.mjs", [pdfItem?.ref ?? "none"], { env: { HVBRAIN_WHO: "ai:documents" } });
        const printed = /path (.+)$/m.exec(r.out)?.[1]?.trim() ?? "";
        const asRule = (p) => {
          const s = p.replace(/\\/g, "/");
          const d = /^([a-zA-Z]):\/(.*)$/.exec(s);
          return d ? `//${d[1].toLowerCase()}/${d[2]}` : `/${s}`;
        };
        const rr = run("node", ["--input-type=module", "-e", `import { judgeRules } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "judge.mjs")).href)}; console.log(JSON.stringify(judgeRules(["mcp__plugin_brain_brain__brain_search", "Read({watch}/**/*.pdf)"])));`]);
        const withWatch = json(rr.out);
        const readRules = withWatch.rules.filter((x) => x.startsWith("Read("));
        const watchedHere = json(node("components.mjs", ["show", "--json"]).out).sources.watch.filter((w) => existsSync(w));
        check(
          "{watch} gives one Read rule per watched folder of this computer, and the path the reader prints for a PDF is one those rules allow",
          rr.ok && watchedHere.length >= 1 && readRules.length === watchedHere.length && readRules.every((x) => /^Read\(\/\/.+\/\*\*\/\*\.pdf\)$/.test(x)) && same(withWatch.refused, []) && same(withWatch.builtins, ["Read"]) && r.ok && /^PDF: read it with the Read tool, path /.test(r.out) && existsSync(printed) && readRules.some((x) => asRule(printed).startsWith(x.slice("Read(".length, -"**/*.pdf)".length))),
          `${rr.out}${rr.err} ${r.out} ${JSON.stringify(watchedHere)}`,
        );
        rmSync(claudeLog, { force: true });
        writeFileSync(join(hb, "judge", "documents.now"), new Date().toISOString(), "utf8");
        h = hub();
        const docArgs = passes().at(-1)?.args ?? [];
        check("the documents judge runs with Read among its tools, scoped to the watched folders, and nothing wider", passes().length === 1 && passes()[0].items === 1 && docArgs[docArgs.indexOf("--tools") + 1] === "Bash,Read" && readRules.length > 0 && readRules.every((x) => docArgs.includes(x)) && !docArgs.includes("Read") && !docArgs.some((a) => /^(Write|Edit|WebFetch)/.test(a)) && pile("documents").length === 0, `passes ${passes().map((x) => x.items).join()}, tools ${docArgs[docArgs.indexOf("--tools") + 1]}, left on the pile ${pile("documents").length} ${JSON.stringify(h)} ${JSON.stringify(docArgs)}`);

        // "depth", in the watch's own source.json: how deep it looks.
        settledFile(join(FOLDER, "à la racine.md"), "Ici.\n");
        settledFile(join(FOLDER, "Clients", "en profondeur.md"), "Plus bas.\n");
        define("documents-watch", { depth: 0 });
        setState("documents-watch", { lastRun: ago(1), lastSuccess: ago(0.5) });
        h = hub();
        // Without a depth of its own, a watched folder is read to its bottom.
        {
          const bottom = join(FOLDER, "a", "b", "c", "d", "e", "f", "g", "h");
          mkdirSync(bottom, { recursive: true });
          settledFile(join(bottom, "tout au fond.md"), "Au fond.\n");
          const code = `import { documentsBacklog } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "watch.mjs")).href)}; console.log(JSON.stringify({ all: documentsBacklog({ days: 1 }).items, seven: documentsBacklog({ days: 1, depth: 7 }).items }));`;
          const deep = run("node", ["--input-type=module", "-e", code]);
          check("without a depth of its own, a watched folder is read to its bottom, eight levels down as well", deep.ok && json(deep.out).all === json(deep.out).seven + 1, deep.out);
        }
        check("the documents watch looks as deep as its source.json says", ran(h, "documents-watch")[0]?.ok === true && titles().includes("Document: à la racine.md") && !titles().includes("Document: en profondeur.md"), `${JSON.stringify(h)} ${JSON.stringify(titles())} ${JSON.stringify(state("documents-watch"))}`);
      }

      // ---- the start of a brain, in two phases (start.mjs, 2026-11-17): where
      // it stands is read from the facts, what the person declined or agreed
      // to is kept in the computer's own settings, and the first big session
      // counts what exists before anything is read.
      {
        const start = (a = ["state"]) => node("start.mjs", a, { env: quiet });
        const st = () => json(start().out);
        const step = (s, id) => s.steps.find((x) => x.id === id) ?? {};
        const block = (s, id) => s.session.blocks.find((x) => x.id === id) ?? {};
        const brainFile = join(BRAIN, "brain.json");
        const keptBrain = readFileSync(brainFile, "utf8");
        const keptList = readFileSync(join(BRAIN, "SOURCES.md"), "utf8");
        const stage = (n) => writeFileSync(brainFile, `${JSON.stringify({ ...JSON.parse(keptBrain), stage: n }, null, 2)}\n`, "utf8");
        const userFile = join(hb, "config.json");
        const tokenFile = join(hb, "judge-token.json");
        const here = BRAIN.replace(/\\/g, "/");

        // (2026-11-23) The start goes part after part: the brain (its container,
        // then the live view), the tools that feed it, the knowledge, the
        // executive floor, the life of the brain.
        const part = (s, id) => s.parts.find((x) => x.id === id) ?? {};
        stage(2);
        let s = st();
        check(
          "the start reads where things stand from what is really there: a brain half built comes first, and the live reading is seen as installed",
          s.brain === here && s.phase === 1 && s.part === "container" && s.next === "brain" && part(s, "preflight").state === "done" && part(s, "computer").state === "done" && part(s, "container").state === "todo" && step(s, "computer").state === "done" && step(s, "brain").stage === 2 && step(s, "live").state === "done" && step(s, "live").judges.includes("conversations") && step(s, "live").judges.includes("documents") && step(s, "token").state === "todo" && block(s, "conversations").state === "todo",
          JSON.stringify(s),
        );
        stage(3);
        s = st();
        const viewNext = s.next === "view" && s.part === "container" && step(s, "brain").state === "done" && step(s, "brain").built === false;
        stage(6);
        start(["mark", "view", "done"]);
        s = st();
        check(
          "the container done (the brain, then its live view), the next thing is the first one still missing among the tools: here the judge's token (the cap comes with the standard judges)",
          viewNext && s.next === "token" && s.part === "tools" && part(s, "container").state === "done" && step(s, "brain").built === true && step(s, "sources").state === "done" && step(s, "cap").state === "done" && !step(s, "cap").uncapped && step(s, "cap").caps.conversations === 5_000_000,
          JSON.stringify(s.steps),
        );
        r = start(["mark", "token", "done"]);
        check("what the facts say cannot be marked by hand", !r.ok && /read from the facts/.test(r.out) && st().next === "token", r.out);
        node("judge-token.mjs", ["set"], { env: quiet, input: `sk-ant-oat01-start-${"z".repeat(48)}` });
        s = st();
        const tokenSeen = step(s, "token").state === "done" && s.part === "knowledge";
        // (2026-11-23) The cap, the alert and the live view are read from the
        // facts too: a judge's own cap, a real channel, a view that starts with
        // the session. Marks say only what the facts cannot.
        {
          const capFile = (n) => join(sourceDir(n), "source.json");
          const keptCaps = ["conversations", "documents"].map((n) => readFileSync(capFile(n), "utf8"));
          const without = (n) => {
            const { dailyTokens: _cap, ...rest } = JSON.parse(readFileSync(capFile(n), "utf8"));
            writeFileSync(capFile(n), `${JSON.stringify(rest, null, 2)}
`, "utf8");
          };
          without("documents");
          const oneLeft = step(st(), "cap");
          without("conversations");
          const noneLeft = step(st(), "cap");
          ["conversations", "documents"].forEach((n, i) => writeFileSync(capFile(n), keptCaps[i], "utf8"));
          const brainNow = readFileSync(brainFile, "utf8");
          writeFileSync(brainFile, `${JSON.stringify({ ...JSON.parse(brainNow), letter: { ...(JSON.parse(brainNow).letter ?? {}), channel: "none" } }, null, 2)}
`, "utf8");
          const noChannel = step(st(), "alert").state;
          writeFileSync(brainFile, `${JSON.stringify({ ...JSON.parse(brainNow), letter: { ...(JSON.parse(brainNow).letter ?? {}), channel: "resend" } }, null, 2)}
`, "utf8");
          const aChannel = step(st(), "alert").state;
          writeFileSync(brainFile, brainNow, "utf8");
          const settingsNow = readFileSync(userFile, "utf8");
          start(["mark", "view", "todo"]);
          const unmarked = step(st(), "view").state;
          const u = JSON.parse(readFileSync(userFile, "utf8"));
          writeFileSync(userFile, `${JSON.stringify({ ...u, routines: { ...(u.routines ?? {}), live: { on: new Date().toISOString() } } }, null, 2)}
`, "utf8");
          const withSession = step(st(), "view");
          writeFileSync(userFile, settingsNow, "utf8");
          check(
            "the cap, the alert and the live view are read from the facts: a judge without a cap of its own is named, none at all leaves the cap to do; a real channel settles the alert; a view that starts with the session settles the view",
            oneLeft.state === "done" && oneLeft.uncapped?.join() === "documents" && noneLeft.state === "todo" && noChannel === "todo" && aChannel === "done" && unmarked === "todo" && withSession.state === "done" && withSession.installed === true && step(st(), "view").state === "done",
            JSON.stringify({ oneLeft, noneLeft, noChannel, aChannel, unmarked, withSession }),
          );
        }
        start(["mark", "cap", "done"]);
        const afterCap = st();
        start(["mark", "alert", "done"]);
        const afterAlert = st().next;
        r = start(["mark", "routines", "declined", "--note", "no evening save on this computer"]);
        s = st();
        const kept = readJ(userFile, {}).start ?? {};
        check(
          "each part settled, the start goes to the next: the tools done, the knowledge comes before the life of the brain, and phase 1 ends when no part before the knowledge is left to do",
          tokenSeen && afterCap.part === "knowledge" && ["writings", "memory", "conversations", "documents", "contacts"].includes(afterCap.next) && afterCap.phase === 2 && part(afterCap, "tools").state === "done" && afterAlert === afterCap.next && r.ok && json(r.out).next === afterCap.next && json(r.out).part === "knowledge" && s.phase === 2 && step(s, "routines").state === "declined" && step(s, "routines").note === "no evening save on this computer" && step(s, "view").state === "done" && part(s, "life").state === "done" && !s.steps.some((x) => x.state === "todo"),
          `${JSON.stringify(afterCap.parts)} ${afterAlert} ${r.out} ${JSON.stringify(s.steps)}`,
        );
        check("what was declined or agreed is kept in this computer's settings, under the brain's name and not its folder, never in the brain's shared files", kept.of === `Camille|${JSON.parse(keptBrain).created}` && !JSON.stringify(kept).includes(here) && kept.steps.cap.state === "done" && kept.steps.view.state === "done" && kept.steps.routines.state === "declined" && !("start" in JSON.parse(readFileSync(brainFile, "utf8"))) && Boolean(kept.began), JSON.stringify(kept));
        start(["mark", "view", "todo"]);
        const again = st();
        start(["mark", "view", "declined"]);
        check("a step put back comes back in its own part, the day the person changes their mind", again.phase === 1 && again.next === "view" && again.part === "container", JSON.stringify(again.steps));

        // THE EXECUTIVE FLOOR (2026-11-23), read from the facts: nothing at all
        // does not apply; a skill left in Claude Code's own folders is to do;
        // the person may leave it there, and say so.
        {
          const floorBefore = step(st(), "executive").state;
          const mine = join(HOME, ".claude", "skills", "ma-skill-du-banc");
          mkdirSync(mine, { recursive: true });
          writeFileSync(join(mine, "SKILL.md"), "---\nname: ma-skill-du-banc\ndescription: a skill of the person\n---\n\n# A skill\n", "utf8");
          s = st();
          const leftOne = step(s, "executive").state === "todo" && step(s, "executive").left.skills >= 1 && part(s, "executive").state === "todo";
          r = start(["mark", "executive", "done", "--note", "the rest stays where it is"]);
          const leftThere = step(st(), "executive").state === "done";
          start(["mark", "executive", "todo"]);
          rmSync(mine, { recursive: true, force: true });
          check(
            "the executive floor is read from the facts: a skill left in Claude Code's folders is to do, the person may leave it there, and without it the floor is as before",
            floorBefore !== "todo" && leftOne && r.ok && leftThere && step(st(), "executive").state === floorBefore,
            `${floorBefore} ${JSON.stringify(step(s, "executive"))} ${r.out}`,
          );
        }

        // Phase 2: what already exists, counted before anything is read.
        const articles = join(BASE, "articles");
        mkdirSync(join(articles, "2024"), { recursive: true });
        for (const n of ["un.md", "deux.txt", join("2024", "trois.docx"), "image.png"]) writeFileSync(join(articles, n), "x", "utf8");
        writeFileSync(join(BRAIN, "SOURCES.md"), `# Sources\n\n- [x] Old notes: a notebook\n- [ ] My articles: ${articles}\n- [ ] My blog: https://example.invalid/blog\n`, "utf8");
        const before = json(start(["count", "--days", "30"]).out).blocks;
        const projStart = join(HOME, ".claude", "projects", "C--start");
        mkdirSync(projStart, { recursive: true });
        const fiveDays = 5 * 24 * 60;
        writeFileSync(join(projStart, "conv-old.jsonl"), [said(fiveDays + 20, "One", { cwd: "C:/start", entrypoint: "cli" }), said(fiveDays + 10, "Two"), said(fiveDays, "Three")].join("\n"), "utf8");
        // A file just written looks "still being written" to the reader: dated three hours back, as the other scenes do.
        utimesSync(join(projStart, "conv-old.jsonl"), new Date(Date.now() - 3 * 3600_000), new Date(Date.now() - 3 * 3600_000));
        r = start(["count", "--days", "30"]);
        const c = json(r.out).blocks;
        const oneDay = json(start(["count", "--days", "1"]).out).blocks;
        check(
          "the first big session counts first: the writings listed in SOURCES.md with the files of a folder, the conversations not read yet, the documents, and says the contacts cannot be counted from here",
          r.ok && json(r.out).estimate === true && c.writings.listed === 2 && c.writings.items === 3 && c.writings.uncounted === 1 && c.writings.estimate === 450_000 && c.writings.by === "conversation" && c.conversations.items === before.conversations.items + 1 && c.conversations.judge === true && typeof c.documents.items === "number" && c.documents.judge === true && c.contacts.measured === false && c.contacts.by === "conversation",
          r.out,
        );
        check(
          "each block read by a judge comes with an estimate (items times the size of one, 150 000 tokens without a measure of its own) and the days its cap spreads it over",
          c.conversations.perItem === 150_000 && c.conversations.estimate === c.conversations.items * 150_000 && c.conversations.cap === 5_000_000 && c.conversations.daysAtCap === Math.max(1, Math.ceil(c.conversations.estimate / 5_000_000)) && oneDay.conversations.items < c.conversations.items && pile("conversations").every((i) => !i.ref.includes("conv-old")),
          JSON.stringify(c.conversations),
        );
        s = st();
        check("and the state says what is listed and what is in", block(s, "writings").state === "todo" && block(s, "writings").listed === 3 && block(s, "writings").ingested === 1 && s.next === "writings", JSON.stringify(s.session));
        // (2026-11-23) The totals counted are kept: each block shows its total before anything is read.
        const w0 = block(s, "writings").progress ?? {};
        check(
          "what was counted is kept, and each block of the knowledge starts from its total: here three files to bring in, a line no program can count, and one ticked before the ledgers existed",
          w0.total === 3 && w0.done === 0 && w0.left === 3 && w0.notes === 0 && w0.counted === true && w0.uncounted === 1 && w0.unmeasured === 1 && block(s, "conversations").progress?.total === oneDay.conversations.items && block(s, "conversations").progress.counted === true && Boolean(s.session.counted) && Boolean(readJ(userFile, {}).start?.counted?.blocks?.writings),
          JSON.stringify(s.session.blocks.map((b) => [b.id, b.progress])),
        );

        // A block agreed: put on its judge's pile with the person's answer, so the judge does not ask again.
        define("conversations", { catchUp: 1 });
        r = start(["catch-up", "conversations", "--days", "30"]);
        const agreed = json(r.out);
        s = st();
        const heldNow = json(node("judge.mjs", ["catch-up", "conversations"]).out).held;
        check(
          "a block agreed is put on its judge's pile with the person's answer: the judge is not held, and the block is running",
          r.ok && agreed.kept === pile("conversations").length && agreed.put >= 1 && pile("conversations").some((i) => i.ref.includes("conv-old")) && agreed.estimate === agreed.kept * 150_000 && agreed.hub === false && heldNow === null && block(s, "conversations").state === "running" && block(s, "conversations").waiting === agreed.kept && readJ(userFile, {}).start.blocks.conversations.state === "agreed",
          `${r.out} ${JSON.stringify(s.session)} ${JSON.stringify(heldNow)}`,
        );
        const p1 = block(s, "conversations").progress ?? {};
        check("a block agreed is followed item by item, from what it was given: all of it left before its judge reads", p1.total === agreed.kept && p1.left === agreed.kept && p1.done === 0 && p1.notes === 0 && p1.unit === "conversations", JSON.stringify(p1));
        rmSync(claudeLog, { force: true });
        writeFileSync(join(hb, "judge", "conversations.now"), new Date().toISOString(), "utf8");
        h = hub();
        s = st();
        const p2 = block(s, "conversations").progress ?? {};
        check("once its judge has read it all, the block is done, and it is never counted again", pile("conversations").length === 0 && block(s, "conversations").state === "done" && json(start(["count", "--days", "30"]).out).blocks.conversations.items === 0, `${JSON.stringify(h)} ${JSON.stringify(s.session)}`);
        check("read through, its progress says every item in, none left, and the notes it added", p2.total === agreed.kept && p2.done === agreed.kept && p2.left === 0 && Number.isInteger(p2.notes), JSON.stringify(p2));
        r = start(["catch-up", "documents", "--days", "30", "--latest", "1"]);
        const cut = json(r.out);
        const refused = start(["catch-up", "contacts"]);
        check("a block can be cut to its latest items, and only a block that a judge reads is started this way", r.ok && cut.kept <= 1 && cut.kept === pile("documents").length && !refused.ok && /through the conversation/.test(refused.out), `${r.out} ${refused.out}`);

        // Later, never: the session can stop there, and says so.
        writeFileSync(join(hb, "judge", "documents.json"), JSON.stringify({ items: [] }), "utf8");
        start(["mark", "writings", "later"]);
        start(["mark", "contacts", "later"]);
        s = st();
        r = node("status.mjs", ["--json"], { env: quiet });
        const resting = s.phase === 2 && s.session.resting === true && s.session.finished === false && block(s, "documents").state === "done" && json(r.out).start?.phase === 2 && json(r.out).start.resting === true && json(r.out).start.blocks.writings === "later";
        start(["mark", "writings", "done"]);
        start(["mark", "contacts", "never"]);
        s = st();
        r = node("status.mjs", ["--json"], { env: quiet });
        check("blocks kept for later leave the start resting, which the status says; all done or refused, the start is finished and the status no longer speaks of it", resting && s.phase === "done" && s.next === null && s.session.finished === true && json(r.out).start === null, `${JSON.stringify(s)} ${r.out.slice(-300)}`);

        // As it was, for the scenes that follow.
        writeFileSync(brainFile, keptBrain, "utf8");
        writeFileSync(join(BRAIN, "SOURCES.md"), keptList, "utf8");
        rmSync(projStart, { recursive: true, force: true });
        rmSync(articles, { recursive: true, force: true });
        rmSync(tokenFile, { force: true });
        const { start: _start, ...rest } = readJ(userFile, {});
        rmSync(join(hb, "start"), { recursive: true, force: true });
        writeFileSync(userFile, `${JSON.stringify(rest, null, 2)}\n`, "utf8");
      }

      // Out of the way of the scenes that follow.
      rmSync(seed, { force: true });
      for (const n of ["conversations", "conversations-watch", "documents", "documents-watch"]) rmSync(sourceDir(n), { recursive: true, force: true });
      rmSync(join(hb, "judge"), { recursive: true, force: true });
      rmSync(saveFile, { force: true });
    }
    }
  }
  if (await scene("letter-off")) {
  node("letter.mjs", ["setup", "--channel", "none"]);
  r = letter([]);
  check("with no channel, the letter stays in the brain", r.ok && json(r.out).sent === false, r.out);
  // WHAT A BRAIN NEVER WRITES (2026-11-19, brain.json neverWrite): refused at
  // the write, for a new note, a fact and a rewriting, with the reason said.
  {
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = readFileSync(brainJson, "utf8");
    writeFileSync(brainJson, JSON.stringify({ ...JSON.parse(keptBrain), neverWrite: ["§"] }, null, 2), "utf8");
    const created = node("capture.mjs", ["--title", "Une note au signe interdit", "--type", "note", "--domains", "ecriture", "--no-commit"], { input: "Un texte qui porte le signe § que ce brain n'écrit jamais." });
    const fact = node("fact.mjs", ["--note", "projet-de-roman", "--text", "Un fait qui porte le signe § que ce brain n'écrit jamais, d'après un essai.", "--from", "claude://chat/essai"]);
    const fine = node("capture.mjs", ["--title", "Une note sans le signe", "--type", "note", "--domains", "ecriture", "--no-commit"], { input: "Un texte que ce brain peut écrire." });
    check(
      "what a brain says it never writes is refused at the write, for a note and for a fact, and the reason is said; the rest is written",
      !created.ok && /never writes/.test(created.out) && !existsSync(join(BRAIN, "vault", "notes", "une-note-au-signe-interdit.md")) && !fact.ok && /never writes/.test(fact.out) && !readFileSync(join(BRAIN, "vault", "projects", "projet-de-roman.md"), "utf8").includes("§") && fine.ok,
      created.out + fact.out + fine.out,
    );
    rmSync(join(BRAIN, "vault", "notes", "une-note-sans-le-signe.md"), { force: true });
    writeFileSync(brainJson, keptBrain, "utf8");
  }
  // A LOCKED VAULT IS NOT A DISCONNECTION (2026-11-18, health.mjs): a service
  // whose keys are in a vault that cannot be read tonight is not checked, and
  // not counted as failing, however many evenings it lasts.
  {
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = readFileSync(brainJson, "utf8");
    const bj = JSON.parse(keptBrain);
    bj.data = { ...(bj.data ?? {}), essai: { tool: "A service", adapter: "http", entities: { x: { base: "https://example.invalid", auth: { clientCredentials: { tokenUrl: "https://example.invalid/token", id: { vault: ["ESSAI", "client_id"] }, secret: { vault: ["ESSAI", "client_secret"] } } } } } } };
    writeFileSync(brainJson, JSON.stringify(bj, null, 2), "utf8");
    for (let i = 0; i < 3; i++) r = node("health.mjs", ["--only", "data:essai/x", "--json"], { env: { HVBRAIN_VAULT: "off" } });
    const state = JSON.parse(readFileSync(join(BRAIN, "index", "health.json"), "utf8"))["data:essai/x"];
    check("three checks with the vault locked: the service waits for its keys, it is not disconnected", r.ok && Boolean(state?.pending) && !state.fails && !state.disconnected && !json(r.out).disconnected?.some((d) => d.key === "data:essai/x"), JSON.stringify(state) + r.out.slice(0, 300));
    writeFileSync(brainJson, keptBrain, "utf8");
  }

  }
  if (await scene("french")) {
  // ---- a brain in French: what the person reads is in their language
  r = node("init.mjs", ["--dir", "~/cerveau-tilde", "--name", "T", "--domains", "a,b", "--switch", "--no-git"], { env: { LANG: "fr_FR.UTF-8", LC_ALL: "", LC_MESSAGES: "" } });
  check("a quoted ~ is the home folder, not a folder named ~", r.ok && json(r.out).dir === join(HOME, "cerveau-tilde").replace(/\\/g, "/"), r.out);
  check("the language comes from LANG when it is set", json(r.out).lang === "fr", r.out);
  r = node("init.mjs", ["--dir", join(BASE, "cerveau-c"), "--name", "T", "--domains", "a,b", "--switch", "--no-git"], { env: { LANG: "C.UTF-8", LC_ALL: "", LC_MESSAGES: "" } });
  check("LANG=C is ignored, not taken for a language", r.ok, r.out);
  const FR = join(BASE, "cerveau");
  // What the discovery shows before the types are chosen: folders and kinds of files, never a content.
  mkdirSync(join(HOME, "Documents", "Conférences", "2026"), { recursive: true });
  for (const n of ["lyon.pptx", "paris.pptx", "nantes.key"]) writeFileSync(join(HOME, "Documents", "Conférences", "2026", n), "x", "utf8");
  mkdirSync(join(HOME, "Documents", "Manuscrits"), { recursive: true });
  writeFileSync(join(HOME, "Documents", "Manuscrits", "roman.docx"), "x", "utf8");
  r = node("discover.mjs", ["--json"]);
  const disc = json(r.out);
  const docs = disc.places?.find((pl) => pl.root.endsWith("/Documents"));
  const confs = docs?.folders.find((f) => f.name === "Conférences");
  check("the discovery sees the person's folders and their kinds of files", r.ok && confs?.kinds.slides === 3 && confs.children.includes("2026") && docs.folders.some((f) => f.name === "Manuscrits"), r.out.slice(0, 600));

  // A French brain, with the types validated with the person.
  r = node("init.mjs", ["--dir", FR, "--name", "Léa", "--domains", "travail,famille", "--lang", "fr", "--types", "note:notes,idee:idees,personne:personnes,conference:conferences,livre", "--switch"]);
  const frInit = json(r.out);
  check("a French brain is created with its own types (and becomes the active one on --switch)", r.ok && frInit.lang === "fr" && frInit.format === "fr" && frInit.types.livre === "livres" && frInit.types.conference === "conferences", r.out);
  check("its format document lists its own types", readFileSync(join(FR, "vault", "CLAUDE.md"), "utf8").includes("| `conference` | `conferences/` |"));
  r = node("init.mjs", ["--dir", join(BASE, "mauvais"), "--name", "X", "--domains", "a,b", "--types", "Conférence:conf,note", "--switch", "--no-git"]);
  check("a type with capitals or accents is refused", !r.ok, r.out);
  check("its documents are in French", readFileSync(join(FR, "BRAIN.md"), "utf8").startsWith("# Le brain de Léa") && readFileSync(join(FR, "SOURCES.md"), "utf8").includes("Une source à la fois"));
  check("its history speaks French", run("git", ["log", "-1", "--format=%s"], { cwd: FR }).out.trim() === "Création du brain de Léa");
  r = cap("Une pensée.", ["--title", "Première pensée", "--type", "idea", "--domains", "travail"]);
  check("a type the brain does not have is refused, with the brain's own list", !r.ok && r.out.includes("idee, personne, conference, livre"), r.out);
  r = cap("Une pensée.", ["--title", "Première pensée", "--type", "idee", "--domains", "travail", "--status", "graine"]);
  check("its captures speak French", r.ok && run("git", ["log", "-1", "--format=%s"], { cwd: FR }).out.trim() === "capture : Première pensée", r.out);
  const frNote = readFileSync(join(FR, "vault", "idees", "premiere-pensee.md"), "utf8");
  check("and are written in the French format", /^titre: "Première pensée"$/m.test(frNote) && /^statut: graine$/m.test(frNote) && /^visibilite: interne$/m.test(frNote) && /^cree: /m.test(frNote) && /^touche: /m.test(frNote) && !/^title:/m.test(frNote), frNote);
  r = cap("Une conférence à Lyon sur le travail.", ["--title", "Conférence de Lyon", "--type", "conference", "--domains", "travail", "--visibility", "prive"]);
  check("a custom type and a visibility in French are understood", r.ok && existsSync(join(FR, "vault", "conferences", "conference-de-lyon.md")) && readFileSync(join(FR, "vault", "conferences", "conference-de-lyon.md"), "utf8").includes("visibilite: prive"), r.out);
  const frGet = json(node("query.mjs", ["get", "premiere-pensee", "--json"]).out);
  check("the brain answers in its own words (graine, interne)", frGet.status === "graine" && frGet.visibility === "interne", JSON.stringify(frGet));
  check("its private note is read like any other, in French too", json(node("query.mjs", ["get", "conference-de-lyon", "--json"]).out).body.includes("Lyon sur le travail"));
  const frStats = json(node("query.mjs", ["stats"]).out);
  check("its stats give its types and format, and speak its words", frStats.format === "fr" && frStats.types.livre === "livres" && frStats.byStatus.graine === 2, JSON.stringify(frStats));
  r = node("types.mjs", ["add", "oeuvre", "oeuvres"]);
  check("a type is added later", r.ok && json(r.out).types.oeuvre === "oeuvres" && existsSync(join(FR, "vault", "oeuvres")), r.out);
  r = node("types.mjs", ["add", "oeuvre"]);
  check("but never twice", !r.ok, r.out);
  r = cap("Une toile.", ["--title", "La Ville qui rêve", "--type", "oeuvre", "--domains", "famille", "--status", "fiable"]);
  check("and used right away", r.ok, r.out);
  // The promotion in French: an old graine, linked from another day, becomes fiable; an idee never.
  const oldFr = join(FR, "vault", "notes", "vieille.md");
  mkdirSync(join(FR, "vault", "notes"), { recursive: true });
  writeFileSync(oldFr, "---\ntype: note\ntitre: \"Vieille\"\ndomaines: [travail]\nstatut: graine\nvisibilite: interne\ncree: 2026-01-01\ntouche: 2026-01-01\nsource: \"banc\"\n---\n\nAncienne.\n", "utf8");
  const ideeFr = join(FR, "vault", "idees", "vieille-idee.md");
  writeFileSync(ideeFr, "---\ntype: idee\ntitre: \"Vieille idée\"\ndomaines: [travail]\nstatut: graine\nvisibilite: interne\ncree: 2026-01-01\ntouche: 2026-01-01\nsource: \"banc\"\n---\n\nAncienne.\n", "utf8");
  const pp = join(FR, "vault", "idees", "premiere-pensee.md");
  writeFileSync(pp, `${readFileSync(pp, "utf8")}\n[[vieille]] [[vieille-idee]]\n`, "utf8");
  r = node("lint.mjs");
  check("the French brain passes its own validation", r.ok, r.out);
  node("review.mjs", ["--apply"]);
  check("its promotion speaks French: statut: fiable, touche today", /^statut: fiable$/m.test(readFileSync(oldFr, "utf8")) && new RegExp(`^touche: ${localDay()}$`, "m").test(readFileSync(oldFr, "utf8")), readFileSync(oldFr, "utf8"));
  check("and an idee is never promoted by the machine", /^statut: graine$/m.test(readFileSync(ideeFr, "utf8")));
  node("contacts.mjs", ["enable"]);
  node("contacts.mjs", ["upsert"], { input: JSON.stringify({ address: "tom@exemple.fr", name: "Tom", sent: 5, received: 5 }) });
  const annu = JSON.parse(readFileSync(join(FR, "index", "annuaire.json"), "utf8"));
  check("a French brain keeps its directory in annuaire.json, in French", Array.isArray(annu.contacts) && annu.contacts[0].adresse === "tom@exemple.fr" && annu.contacts[0].envoyes === 5 && "etage" in annu.contacts[0] && "genere" in annu, JSON.stringify(annu).slice(0, 300));
  // THE FIRST FILL GOES MONTH BY MONTH (2026-11-17), and knows what is left.
  {
    r = node("contacts.mjs", ["months", "--back", "2"]);
    const fill = json(r.out);
    check("the period of the first fill is decided once: this month and the two before, none of them in yet", r.ok && fill.decided === true && fill.months.length === 3 && fill.left === 3 && fill.next === fill.months[0].month && fill.months[0].month > fill.months[2].month, r.out + r.err);
    r = node("contacts.mjs", ["upsert", "--month", fill.next], { input: JSON.stringify({ address: "zoe@exemple.fr", name: "Zoé", sent: 2, received: 1 }) });
    check("a month brought in is recorded, and the answer says what is left", r.ok && json(r.out).fill.left === 2 && json(r.out).fill.next === fill.months[1].month, r.out + r.err);
    r = node("contacts.mjs", ["upsert", "--month", fill.next], { input: JSON.stringify({ address: "zoe@exemple.fr", name: "Zoé", sent: 2, received: 1 }) });
    const zoe = JSON.parse(readFileSync(join(FR, "index", "annuaire.json"), "utf8")).contacts.find((c) => c.adresse === "zoe@exemple.fr");
    check("the same month a second time is refused: its messages are not counted twice", !r.ok && /already in the directory/.test(r.out) && zoe?.envoyes === 2, r.out + JSON.stringify(zoe));
    const block = json(node("start.mjs", ["state"]).out).session?.blocks?.find((b) => b.id === "contacts");
    check("the first big session knows the directory is not filled to the end", block?.monthsLeft === 2 && block.state !== "done", JSON.stringify(block));
  }
  r = node("letter.mjs", ["send", "--dry"], { input: "# La revue du 30 septembre\n\n## Les nouvelles graines\n1. Une." });
  check("its letter speaks French too", r.ok && /Revue du brain de Léa, semaine \d+/.test(json(r.out).subject) && readFileSync(json(r.out).html, "utf8").includes("Le brain &#183; semaine"), r.out);
  check("its weekly report is in French", readFileSync(join(FR, "reviews", `${localDay()}.md`), "utf8").startsWith("# Revue du brain de Léa"));

  // The standard live sources in a French brain: the judges' instructions,
  // and the prompt the plugin builds around them, speak French.
  {
    const quiet = { CLAUDE_CODE_OAUTH_TOKEN: "", HVBRAIN_VAULT: "off" };
    const NAMES = ["conversations", "conversations-watch", "documents", "documents-watch"];
    const frFile = (n, f) => readFileSync(join(FR, "sources", n, f), "utf8");
    r = node("sources.mjs", ["install", "conversations"], { env: quiet });
    const docs = node("sources.mjs", ["install", "documents"], { env: quiet });
    check(
      "in a French brain the standard sources are installed in French, and a brain that watches no folder is told so",
      r.ok && docs.ok && json(r.out).lang === "fr" && frFile("conversations", "instructions.md").includes("## Ce que tu ne fais jamais") && frFile("documents", "instructions.md").includes("## Pour chaque document") && !frFile("documents", "instructions.md").includes("What you never do") && /^Le juge/.test(JSON.parse(frFile("documents", "source.json")).description) && /^Repère/.test(JSON.parse(frFile("conversations-watch", "source.json")).description) && json(docs.out).folders.length === 0 && json(docs.out).remains.some((x) => /watch add/.test(x)),
      r.out + docs.out,
    );
    const all = NAMES.map((n) => readdirSync(join(FR, "sources", n)).map((f) => frFile(n, f)).join("\n")).join("\n");
    const found = [...["Camille-Durand", "acme-crm", "Pennylane", "Dropbox"].filter((w) => all.toLowerCase().includes(w.toLowerCase())), ...(all.includes("C:/") ? ["C:/"] : [])];
    check("nothing personal in what a French brain receives either, and no long dash", found.length === 0 && !/[—–]/.test(all), found.join(", "));
    node("judge.mjs", ["add", "--source", "conversations", "--ref", "claude://session/une#2026-01-01T00:00:00.000Z", "--title", "Conversation « Une »"]);
    const promptFile = join(BASE, "prompt-fr.txt");
    r = node("judge.mjs", ["run", "conversations"], { env: { ...quiet, HVBRAIN_CLAUDE: join(HERE, "faux-claude.mjs"), FAUX_CLAUDE_PROMPT: promptFile, FAUX_CLAUDE_LOG: "", FAUX_CLAUDE_EXIT: "", FAUX_CLAUDE_ADD: "" } });
    const frPrompt = existsSync(promptFile) ? readFileSync(promptFile, "utf8") : "";
    check(
      "and the judge's prompt carries the brain it writes for, in French: the person, its own types with their folders, its domains, its natures",
      r.ok && json(r.out).judged === 1 && frPrompt.includes("## Le brain pour lequel tu écris") && frPrompt.includes("- La personne : Léa.") && frPrompt.includes("idee (idees/)") && frPrompt.includes("oeuvre (oeuvres/)") && frPrompt.includes("travail, famille") && frPrompt.includes("note : decision, retour, lecon") && frPrompt.indexOf("## Le brain pour lequel tu écris") < frPrompt.indexOf("## Ce qui attend d'être jugé") && frPrompt.includes("chaque appel écrit pour de bon") && frPrompt.includes("Un sujet, une fiche") && !frPrompt.includes("{plugin}"),
      `${r.out} ${frPrompt.slice(-1200)}`,
    );
    // A JUDGE'S READING IS PROVEN (2026-11-17): what the readers saw opened is
    // read; what the judge did not open stays on the pile, whatever it says.
    {
      const lazy = { ...quiet, HVBRAIN_CLAUDE: join(HERE, "faux-claude.mjs"), FAUX_CLAUDE_PROMPT: promptFile, FAUX_CLAUDE_LOG: "", FAUX_CLAUDE_EXIT: "", FAUX_CLAUDE_ADD: "" };
      check("the judge is told that its reading is counted", frPrompt.includes("Lis chaque élément jusqu'à sa dernière page."), frPrompt.slice(-400));
      // WHAT IS SAID AT EVERY PASS IS IN THE SYSTEM PROMPT (2026-11-18): the
      // message is the list alone, so that the next pass reads the rest again
      // from Claude's cache instead of paying for it once more.
      const message = existsSync(`${promptFile}.message`) ? readFileSync(`${promptFile}.message`, "utf8") : "";
      const said = frPrompt.slice(0, frPrompt.length - message.length);
      check(
        "the message of a pass is the list alone; the instructions, the brain's card and its rules are the judge's system prompt",
        message.startsWith("## Ce qui attend d'être jugé") && message.includes("claude://session/une#") && !message.includes("## Le brain pour lequel tu écris") && !message.includes("## Ce que tu ne fais jamais") && /^You are a judge/.test(said) && said.includes("## Ce que tu ne fais jamais") && said.includes("## Le brain pour lequel tu écris") && said.includes("## Les règles d'écriture du brain"),
        `${message.slice(0, 300)} / ${said.slice(0, 200)}`,
      );
      for (const n of ["deux", "trois", "quatre"]) node("judge.mjs", ["add", "--source", "conversations", "--ref", `claude://session/${n}#2026-01-02T00:00:00.000Z`, "--title", `Conversation « ${n} »`]);
      const report = () => json(node("judge.mjs", ["report"]).out).conversations;
      r = node("judge.mjs", ["run", "conversations"], { env: { ...lazy, FAUX_CLAUDE_LAZY: "1" } });
      check("a run that opened one item of three has read one: the two others stay on the pile", r.ok && json(r.out).judged === 1 && json(r.out).unread === 2 && report().waiting === 2, r.out + r.err);
      r = node("judge.mjs", ["run", "conversations"], { env: { ...lazy, FAUX_CLAUDE_LAZY: "0" } });
      check("handed over again and not opened, they still wait", r.ok && json(r.out).judged === 0 && json(r.out).unread === 2 && report().waiting === 2, r.out + r.err);
      r = node("judge.mjs", ["run", "conversations"], { env: { ...lazy, FAUX_CLAUDE_LAZY: "0" } });
      const rep = report();
      check("after three runs that did not read them, they are left aside and named, never dropped in silence", r.ok && json(r.out).leftAside === 2 && rep.waiting === 0 && rep.unread === 2 && rep.handedAgain === 6, r.out + JSON.stringify(rep));
      node("judge.mjs", ["add", "--source", "conversations", "--ref", "claude://session/cinq#2026-01-03T00:00:00.000Z", "--title", "Conversation « cinq »"]);
      r = node("judge.mjs", ["run", "conversations"], { env: lazy });
      check("and a run that opens what it was given reads it", r.ok && json(r.out).judged === 1 && json(r.out).unread === undefined && report().waiting === 0, r.out + r.err);
    }
    // The limits in a French brain, which watches no folder (2026-11-17).
    r = run("node", ["--input-type=module", "-e", `import { judgeRules } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "judge.mjs")).href)}; console.log(JSON.stringify(judgeRules(["mcp__plugin_brain_brain__brain_get", "Read({watch}/**)", "Read({root:nowhere}/**)"])));`]);
    const frDocuments = JSON.parse(frFile("documents", "source.json"));
    check(
      "with no folder watched, a {watch} rule is dropped without a word and the judge has no Read tool at all, while a missing root is still refused",
      r.ok && JSON.stringify(json(r.out)) === JSON.stringify({ rules: ["mcp__brain__brain_get"], builtins: [], refused: ["Read({root:nowhere}/**)"] }),
      r.out + r.err,
    );
    check(
      "the French documents judge comes with its cap, its Read rule on the watched folders, and is told how to open a PDF",
      frDocuments.dailyTokens === 5_000_000 && frDocuments.allowedTools.includes("Read({watch}/**/*.pdf)") && JSON.parse(frFile("documents-watch", "source.json")).extensions.includes(".pdf") && frFile("documents", "instructions.md").includes("ouvre ce chemin exact avec ton outil `Read`"),
      JSON.stringify(frDocuments),
    );
    for (const n of NAMES) rmSync(join(FR, "sources", n), { recursive: true, force: true });
    rmSync(join(HOME, ".hypervibe-brain", "judge"), { recursive: true, force: true });
  }

  // The alert of a judge down and the test of its channel, in a French brain:
  // the same mail, in plain French (2026-11-17).
  {
    node("letter.mjs", ["setup", "--channel", "resend", "--to", "lea@exemple.fr", "--from", "brain@exemple.fr"]);
    const SINCE = new Date(Date.now() - 26 * 3600_000).toISOString();
    const depuis = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(SINCE));
    const alerte = async (error) => {
      const o = node("letter.mjs", ["alert"], { input: JSON.stringify({ judge: { name: "documents", error, failures: 2, waiting: 5, since: SINCE } }), env: mailEnv });
      const m = (await mailNow())?.body ?? {};
      return { o, out: json(o.out), text: m.text ?? "", subject: m.subject ?? "" };
    };
    const CAS = [
      ["token", "exit 1: OAuth token has expired", "n'est plus accepté"],
      ["limit", "exit 1: You've hit your session limit", "La limite de votre forfait Claude a été atteinte"],
      ["no-token", "no lasting token for Claude on this computer (scripts/judge-token.mjs set)", "il n'en trouve aucun sur cet ordinateur"],
      ["network", "exit 1: Unable to connect to API", "Il n'a pas réussi à joindre Claude"],
      ["instructions", "cannot read sources/documents/instructions.md (ENOENT): a judge needs its instructions", "Ses consignes sont introuvables"],
      ["other", "exit 3: du jamais vu", "n'est pas de celles que le brain sait reconnaître"],
    ];
    const faux = [];
    for (const [cause, error, mots] of CAS) {
      const a = await alerte(error);
      const t = a.text;
      if (!a.o.ok || a.out.sent !== true || a.out.cause !== cause) faux.push(`${cause}: ${a.o.out}`);
      else if (!t.includes(mots)) faux.push(`${cause}: ses mots simples manquent`);
      else if (!t.includes("Ouvrez Claude et dites : « le juge de mon brain est en panne, répare-le »")) faux.push(`${cause}: la phrase à dire manque`);
      else if (!t.includes("Le juge « documents » (celui qui lit les documents de vos dossiers suivis) n'arrive plus à travailler") || !t.includes(`depuis ${depuis}`) || !t.includes("Ses 2 derniers passages ont échoué") || !t.includes("5 éléments l'attendent dans sa pile")) faux.push(`${cause}: quel juge, depuis quand, ce qui attend`);
      else if (!t.includes("## Ce qui s'est probablement passé") || !t.includes("## Pour le réparer") || !(t.lastIndexOf(error.slice(0, 30)) > t.indexOf("## Pour le réparer"))) faux.push(`${cause}: son ordre`);
      else if (/[—–]/.test(t) || a.subject !== "Brain de Léa : le juge « documents » est en panne") faux.push(`${cause}: sa forme (${a.subject})`);
    }
    check("in a French brain the alert of a judge down speaks plain French, for each class of error, with the sentence to say to Claude", faux.length === 0, faux.join(" | "));
    r = node("letter.mjs", ["test"], { env: mailEnv });
    const essai = (await mailNow())?.body ?? {};
    check("and the test of the alert channel is in French too", r.ok && json(r.out).sent === true && essai.subject === "Brain de Léa : essai de l'alerte" && essai.text.includes("les alertes de votre brain arrivent bien ici") && essai.to[0] === "lea@exemple.fr", `${r.out} ${JSON.stringify(essai).slice(0, 300)}`);
    node("letter.mjs", ["setup", "--channel", "none"]);
    rmSync(join(HOME, ".hypervibe-brain", "alert.json"), { force: true });
  }

  }
  if (await scene("adopt")) {
  // ---- an existing brain made active again (restored, cloned, or built before the plugin)
  r = node("adopt.mjs", ["--dir", CLONE]);
  check("adopting refuses to replace the active brain silently", !r.ok && r.out.includes("--switch"), r.out);
  r = node("adopt.mjs", ["--dir", join(BASE, "rien")]);
  check("adopting refuses a folder that is not a brain", !r.ok, r.out);
  r = node("adopt.mjs", ["--dir", CLONE, "--switch"]);
  check("adopting a clone makes it the brain of this computer", r.ok && JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8")).brain === CLONE.replace(/\\/g, "/"), r.out);
  check("and it answers at once", json(node("query.mjs", ["search", "roman", "--json"]).out).some((x) => x.slug === "projet-de-roman"));
  }
  if (await scene("memory")) {
  // ---- what the person's AI remembers of them comes into the brain
  {
    const mem = (...a) => node("memory.mjs", a);
    const projects = join(HOME, ".claude", "projects");
    const settings = join(HOME, ".claude", "settings.json");
    const put = (rel, text) => {
      mkdirSync(dirname(join(projects, rel)), { recursive: true });
      writeFileSync(join(projects, rel), text, "utf8");
    };
    const block = () => json(node("start.mjs", ["state"]).out).session.blocks.find((b) => b.id === "memory") ?? {};
    check("a computer whose AI kept no memory has nothing to bring in: the block does not apply", json(mem("find").out).files === 0 && block().state === "na", JSON.stringify(block()));

    put("proj-a/memory/MEMORY.md", "- [Tests](feedback_tests.md) - never mock the database\n- [State](project_state.md)\n");
    put("proj-a/memory/feedback_tests.md", "Never mock the database in a test: a mocked test passed while the migration failed.\n");
    put("proj-a/memory/project_state.md", "The site went live on 3 March.\n");
    put("proj-b/memory/MEMORY.md", "- [Deep](sub/deep.md)\n");
    put("proj-b/memory/sub/deep.md", "The client reads on a phone: short pages.\n");
    mkdirSync(join(projects, "proj-c", "memory"), { recursive: true });
    writeFileSync(settings, JSON.stringify({ theme: "dark" }, null, 2), "utf8");

    r = mem("find");
    const found = json(r.out);
    check("the memory is counted from its names and sizes: every file of every working folder, an empty folder apart", r.ok && found.files === 5 && found.projects.length === 2 && found.estimate === 5 * 15_000 && found.projects[1].files === 2, r.out);
    const counted = json(node("start.mjs", ["count"]).out).blocks.memory;
    check("the first big session has a block for it, with its estimate", block().state === "todo" && block().files === 5 && counted.items === 5 && counted.projects === 2 && counted.estimate === 75_000, JSON.stringify([block(), counted]));

    r = mem("archive");
    check("nothing moves before a whole backup", !r.ok && json(r.out).missing === 5 && existsSync(join(projects, "proj-a", "memory", "feedback_tests.md")), r.out);
    r = mem("backup");
    const kept = json(r.out);
    const copy = (rel) => readFileSync(join(kept.folder, rel), "utf8");
    check("the backup copies every file and checks each copy against its original", r.ok && kept.verified === true && kept.files === 5 && copy("proj-b/memory/sub/deep.md").includes("on a phone") && JSON.parse(copy("manifest.json")).files.length === 5, r.out);
    put("proj-a/memory/project_state.md", "The site went live on 3 March. The shop followed on 9 April.\n");
    r = mem("archive");
    check("a file changed since the backup is not held by it: nothing moves", !r.ok && json(r.out).missing === 1, r.out);
    check("and the state says so", json(mem("state").out).backedUp === false);
    mem("backup");

    r = mem("archive");
    const moved = json(r.out);
    const day = localDay();
    const page = readFileSync(join(projects, "proj-a", "memory", "MEMORY.md"), "utf8");
    check(
      "the files move aside, never deleted, and a page says where the memory lives now",
      r.ok && moved.archived === 5 && moved.ledgers.length === 1 && moved.ledgers[0].counted === 5 && readFileSync(join(projects, "proj-a", `memory-archive-${day}`, "project_state.md"), "utf8").includes("9 April") && existsSync(join(projects, "proj-b", `memory-archive-${day}`, "sub", "deep.md")) && !existsSync(join(projects, "proj-a", "memory", "feedback_tests.md")) && page.includes("hypervibe-brain:memory") && page.includes(`memory-archive-${day}`),
      r.out,
    );
    const lot = moved.ledgers[0].name;
    const items = json(node("ledger.mjs", ["next", lot, "--n", "10"]).out);
    check("every file is an item of a ledger, with an address that holds on every computer and its place on this one", items.left === 5 && items.next.every((i) => i.ref.startsWith("ai-memory://proj-") && existsSync(i.path)) && lot.startsWith("memory-"), JSON.stringify(items).slice(0, 600));
    check("the page left in a memory folder is not a memory: nothing is found any more, and the block stays to do while the ledger holds files", json(mem("find").out).files === 0 && block().state === "todo" && block().left === 5, JSON.stringify(block()));
    const writings = json(node("start.mjs", ["state"]).out).session.blocks.find((b) => b.id === "writings");
    check("the ledgers of the memory are not counted as a writing left to finish", !(writings.ledgers ?? []).some((l) => l.name.startsWith("memory-")), JSON.stringify(writings));

    const refOf = (name) => items.next.find((i) => i.ref.endsWith(name));
    r = node("capture.mjs", ["--title", "Never mock the database in a test", "--type", "note", "--domains", "ecriture", "--source", refOf("feedback_tests.md").ref, "--no-commit"], { input: "A mocked test passed while the migration failed: tests run against a real database." });
    check("a note that names a file as its source takes it out of the ledger, by itself", r.ok && json(node("ledger.mjs", ["next", lot]).out).left === 4, r.out);
    node("capture.mjs", ["--title", "The site went live in March", "--type", "note", "--domains", "ecriture", "--source", refOf("project_state.md").ref, "--no-commit"], { input: "The site went live on 3 March, the shop on 9 April." });
    node("capture.mjs", ["--title", "The client reads on a phone", "--type", "note", "--domains", "ecriture", "--source", refOf("deep.md").ref, "--no-commit"], { input: "Short pages: the client reads on a phone." });
    for (const i of items.next.filter((x) => x.ref.endsWith("MEMORY.md"))) node("ledger.mjs", ["skip", lot, String(i.n), "--why", "index of the other memory files"]);
    r = node("ledger.mjs", ["close", lot]);
    check("what was set aside is the person's to see before the lot closes", !r.ok && json(r.out).skipped === 2, r.out);
    r = node("ledger.mjs", ["close", lot, "--agreed"]);
    check("every file covered and every lot closed, the block is done", r.ok && block().state === "done" && json(mem("state").out).left === 0, `${r.out} ${JSON.stringify(block())}`);

    // The lock: Claude Code's setting, the plugin's hook, the rule in the global CLAUDE.md.
    const hook = (input) => run("node", [join(SCRIPTS, "hook-memory.mjs")], { input: JSON.stringify(input) });
    const write = { tool_name: "Write", tool_input: { file_path: join(projects, "proj-a", "memory", "feedback_new.md") } };
    check("while the lock is off, the hook lets a write into the memory pass", hook(write).out.trim() === "");
    r = mem("lock", "on");
    const locked = JSON.parse(readFileSync(settings, "utf8"));
    const rules = () => readFileSync(join(HOME, ".claude", "CLAUDE.md"), "utf8");
    check("the lock switches Claude's own memory off, keeps the rest of its settings and the file as it was", r.ok && locked.autoMemoryEnabled === false && locked.theme === "dark" && JSON.parse(readFileSync(`${settings}.before-brain-memory`, "utf8")).autoMemoryEnabled === undefined, r.out);
    check("a rule in the person's global instructions says where to write instead", /\/brain:capture/.test(rules()) && /memory/i.test(rules().split("hypervibe-brain:rules")[1] ?? ""), rules().slice(-700));
    check("the hook refuses a write into a memory folder, and says where it goes", /"permissionDecision":"deny"/.test(hook(write).out) && /brain:capture/.test(hook(write).out), hook(write).out);
    check("a terminal command that sends its output there is refused too", /deny/.test(hook({ tool_name: "Bash", tool_input: { command: `echo x >> "${join(projects, "proj-a", "memory", "MEMORY.md").replace(/\\/g, "/")}"` } }).out));
    check(
      "reading the memory, writing in its archives or anywhere else is not its business",
      hook({ tool_name: "Bash", tool_input: { command: `cat "${join(projects, "proj-a", "memory", "MEMORY.md").replace(/\\/g, "/")}" | head -3 > out.txt` } }).out.trim() === "" && hook({ tool_name: "Write", tool_input: { file_path: join(projects, "proj-a", `memory-archive-${day}`, "x.md") } }).out.trim() === "" && hook({ tool_name: "Write", tool_input: { file_path: join(BASE, "app", "src", "memory", "cache.ts") } }).out.trim() === "",
    );
    r = mem("lock", "off");
    check("lifted, the lock gives Claude's setting back as it was, the rule leaves, the hook lets pass", r.ok && !Object.hasOwn(JSON.parse(readFileSync(settings, "utf8")), "autoMemoryEnabled") && !/brain:capture\`? \(/.test(rules().split("hypervibe-brain:rules")[1] ?? "") && hook(write).out.trim() === "", `${r.out} ${rules().slice(-500)}`);

    // The AI wrote again in its memory: the block is to do again, with what is new only.
    put("proj-a/memory/feedback_new.md", "Ask before deleting a branch.\n");
    check("a memory that grew again is offered again, with the new files only", block().state === "todo" && block().files === 1, JSON.stringify(block()));

    // Everything back where it was.
    mem("lock", "on");
    r = mem("restore");
    const back = json(r.out);
    check(
      "restore puts every file back, removes the page, keeps what was written since, and lifts the lock",
      r.ok && back.restored === 5 && back.lock === false && readFileSync(join(projects, "proj-a", "memory", "MEMORY.md"), "utf8").includes("feedback_tests.md") && existsSync(join(projects, "proj-b", "memory", "sub", "deep.md")) && existsSync(join(projects, "proj-a", "memory", "feedback_new.md")) && !existsSync(join(projects, "proj-a", `memory-archive-${day}`)) && json(mem("find").out).files === 6,
      r.out,
    );
    rmSync(join(projects, "proj-b", "memory", "sub", "deep.md"));
    r = mem("restore", "--backup");
    check("a file lost is taken back from the backup, and a file that is there is never written over", r.ok && json(r.out).restored === 1 && json(r.out).leftInPlace.length === 4 && existsSync(join(projects, "proj-b", "memory", "sub", "deep.md")) && readFileSync(join(projects, "proj-a", "memory", "project_state.md"), "utf8").includes("9 April"), r.out);
  }
  }
  if (await scene("start-page")) {
  // ---- the page of the start, and a start that is stopped and taken up again
  {
    const noOpen = { HVBRAIN_NO_OPEN: "1" };
    const start = (...a) => node("start.mjs", a, { env: noOpen });
    const page = () => readFileSync(join(HOME, ".hypervibe-brain", "start.html"), "utf8");
    r = start("page", "--doing", "Checking <b>the computer</b>", "--open");
    const made = json(r.out);
    check("the start has a page of its own, a file in this computer's settings", r.ok && made.opened === false && existsSync(made.file) && /<!doctype html>/i.test(page()) && page().includes('http-equiv="refresh"'), r.out);
    const st = json(start("state").out);
    check("it shows every step and every block, with where things stand", st.steps.every((x) => page().includes(`class="${x.id === st.next ? "now-row" : x.state}"`) || true) && (page().match(/<li /g) ?? []).length === st.steps.length + st.session.blocks.length && page().includes("What Claude remembers of you") && (page().match(/<section /g) ?? []).length === st.parts.length && page().includes("Part 6") && page().includes("The executive floor"), page().slice(0, 400));
    check("what is being done is written before the step, said on the page, and never read as code", st.doing?.text === "Checking <b>the computer</b>" && page().includes("Checking &lt;b&gt;the computer&lt;/b&gt;") && !page().includes("<b>the computer</b>"), JSON.stringify(st.doing));
    r = start("pause", "--note", "Back on Monday, the writings are half in");
    check("a pause the person asked for is kept with their words, for the page and for the next session", r.ok && json(start("state").out).paused?.note === "Back on Monday, the writings are half in" && page().includes("Back on Monday, the writings are half in") && /Paused on/.test(page()), r.out);
    start("page", "--doing", "The writings, taken up again");
    const again = json(start("state").out);
    check("taking the start up again ends the pause", again.paused === undefined && again.doing.text === "The writings, taken up again" && !/Paused on/.test(page()), JSON.stringify(again).slice(0, 300));
    // ONLY DURING A REAL START (2026-11-23): the live view shows the building
    // while the start is not finished AND served lately (something done or a
    // pause within seven days, or a brain created less than fourteen days ago).
    {
      const settingsFile = join(HOME, ".hypervibe-brain", "config.json");
      // (The brain active here, whichever scene made it so.)
      const brainFile = join(json(start("state").out).brain, "brain.json");
      const keptSettings = readFileSync(settingsFile, "utf8");
      const keptBrain = readFileSync(brainFile, "utf8");
      const withNow = (startNow) => writeFileSync(settingsFile, `${JSON.stringify({ ...JSON.parse(keptSettings), startNow }, null, 2)}\n`, "utf8");
      const created = (day) => writeFileSync(brainFile, `${JSON.stringify({ ...JSON.parse(keptBrain), created: day }, null, 2)}\n`, "utf8");
      const eightDays = new Date(Date.now() - 8 * 86_400_000).toISOString();
      created("2025-01-01");
      withNow({ doing: { text: "Long ago", at: eightDays } });
      const stale = json(start("state").out);
      withNow({ paused: { at: new Date().toISOString() } });
      const paused = json(start("state").out);
      withNow({});
      const nothing = json(start("state").out);
      created(new Date().toISOString().slice(0, 10));
      const young = json(start("state").out);
      writeFileSync(brainFile, keptBrain, "utf8");
      writeFileSync(settingsFile, keptSettings, "utf8");
      check(
        "the building is shown only during a real start: not after a week without anything done in an old brain, again with a pause of today, and always in a brain created these last days",
        stale.next !== null && stale.underway === false && paused.underway === true && nothing.underway === false && young.underway === true,
        JSON.stringify({ stale: stale.underway, paused: paused.underway, nothing: nothing.underway, young: young.underway, next: stale.next }),
      );
    }
    // Before the brain exists: the first step comes before it.
    const empty = join(BASE, "home-without-brain");
    mkdirSync(empty, { recursive: true });
    r = node("start.mjs", ["page", "--doing", "Looking at this computer"], { env: { ...noOpen, HVBRAIN_HOME: empty, HVBRAIN_DIR: "" } });
    const first = existsSync(join(empty, ".hypervibe-brain", "start.html")) ? readFileSync(join(empty, ".hypervibe-brain", "start.html"), "utf8") : "";
    check("the page exists before the brain does, and begins with the check for a brain that exists already", r.ok && json(r.out).next === "preflight" && json(r.out).part === "preflight" && first.includes("Looking at this computer") && first.includes("class=\"part-now\"") && (first.match(/<section /g) ?? []).length === 7, r.out);
  }
  }
} finally {
  closeScene();
  // The last run, scene by scene: a partial run updates the scenes it played.
  const scenes = SCENES.map((n) => played.find((s) => s.name === n) ?? LAST.scenes.find((s) => s.name === n)).filter(Boolean);
  try {
    mkdirSync(STORE, { recursive: true });
    writeFileSync(join(STORE, "last.json"), JSON.stringify({ at: new Date().toISOString(), scenes }), "utf8");
  } catch {
    // no store: the next run starts from the beginning, as before
  }
  console.log(`\n  ${played.map((s) => `${s.name} ${s.seconds} s`).join(", ")}`);
  const bad = played.filter((s) => s.failed);
  if (bad.length) console.log(`\n  To replay: ${bad.map((s) => `node tests/banc.mjs --only ${s.name}`).join("  |  ")}\n  To go on from the first one: node tests/banc.mjs --failed`);
  fake.kill();
  if (process.argv.includes("--keep")) console.log(`\n  (--keep: ${BASE} left in place)`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures}/${total} FAILED\n` : `\nAll ${total} checks pass.\n`);
process.exitCode = failures ? 1 : 0;
