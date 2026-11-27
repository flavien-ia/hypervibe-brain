#!/usr/bin/env node
// hub-juges.mjs - The checks of the zone "background program, sources and
// judges" (the audit of 0.8.2, corrected on 2026-11-21): one check for each
// correction that keeps a run, an item or an alert from being lost, and for
// the person's decision on the vault (the judges' token outside it, the keys
// of the sources in it, a closed vault a wait). A throwaway brain in the
// system's temporary folder, a fake home (HVBRAIN_HOME), nothing of the
// person's is touched, no AI is called (a stand-in program takes Claude's
// place, tests/faux-claude.mjs or one written here).
//
//   node tests/zones/hub-juges.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..", "..", "scripts");
const BASE = join(tmpdir(), `hvb-zone-hub-juges-${process.pid}`);
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
const HB = join(HOME, ".hypervibe-brain");
mkdirSync(HB, { recursive: true });

const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", HVBRAIN_VAULT: "off", HVBRAIN_NO_WINDOW: "1", HVBRAIN_NO_OPEN: "1", HVBRAIN_CLAUDE: "no-claude-for-the-zone", HVBRAIN_WHO: "",
  HVBRAIN_HUB_VAULT: "", HVBRAIN_JUDGE_BATCH: "", HVBRAIN_VAULT_OPEN_AT: "", CLAUDE_CODE_OAUTH_TOKEN: "", ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "",
  BREVO_API_KEY: "", RESEND_API_KEY: "", GIT_CONFIG_NOSYSTEM: "1",
};
// Never the real home, never the real brain.
if (!env.HVBRAIN_HOME.startsWith(tmpdir()) || env.HVBRAIN_DIR !== "") {
  console.error("the zone's checks only run on a throwaway home");
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
const clean = (s) => String(s ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { cwd: o.cwd ?? BASE, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true, timeout: o.timeout ?? 180_000 });
  const err = clean(r.stderr);
  return { ok: r.status === 0, status: r.status, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, err };
};
const node = (script, a = [], o = {}) => run(process.execPath, [join(SCRIPTS, script), ...a], o);
const url = (name) => JSON.stringify(pathToFileURL(join(SCRIPTS, name)).href);
const mod = (code, a = [], o = {}) => run(process.execPath, ["--input-type=module", "-e", code, ...a], o);
// One JSON answer, on one line or spread over several (--json); the last line
// that is one when a program printed several.
const json = (s) => {
  const text = String(s);
  const i = text.search(/^[[{]/m);
  try {
    return JSON.parse(i >= 0 ? text.slice(i) : text);
  } catch {
    const lines = text.split("\n").filter((l) => /^[[{]/.test(l.trim()));
    return JSON.parse(lines.at(-1) ?? text);
  }
};
const fwd = (p) => String(p).replace(/\\/g, "/");
const read = (f) => readFileSync(f, "utf8");
const readJ = (f, d = null) => {
  try {
    return JSON.parse(read(f));
  } catch {
    return d;
  }
};
const SRC = (n) => join(BRAIN, "sources", n);
const QUEUE = join(HB, "queue.json");
const LOCK_EVENING = join(HB, "nightly.lock");
const HUB_LOCK = join(HB, "hub.lock");
const pileFile = (n) => join(HB, "judge", `${n}.json`);
const pile = (n) => readJ(pileFile(n), { items: [] }).items;
const state = (n) => readJ(join(SRC(n), "state.json"), {});
const define = (n, d) => {
  mkdirSync(SRC(n), { recursive: true });
  writeFileSync(join(SRC(n), "source.json"), `${JSON.stringify(d, null, 2)}\n`, "utf8");
  // A judge runs only once approved on this computer (trust.mjs, 2026-11-27):
  // the bench approves the judges it defines, as the person would.
  if (d.kind === "claude" && d.live === true && existsSync(join(SRC(n), "instructions.md"))) node("sources.mjs", ["trust", n]);
};
const patch = (n, extra) => define(n, { ...readJ(join(SRC(n), "source.json"), {}), ...extra });
const hub = (extra = {}) => {
  const o = node("hub.mjs", ["--once"], { env: extra });
  try {
    return json(o.out);
  } catch {
    return { crashed: o.out };
  }
};
const ran = (h, n) => (h.runs ?? []).filter((x) => x.name === n);
const hubLog = () => (existsSync(join(HB, "logs")) ? readdirSync(join(HB, "logs")).filter((n) => /^hub-/.test(n)).map((n) => read(join(HB, "logs", n))).join("") : "");
const eveningLog = () => (existsSync(join(HB, "logs")) ? readdirSync(join(HB, "logs")).filter((n) => /^nightly-/.test(n)).map((n) => read(join(HB, "logs", n))).join("") : "");
/** A process number that no program bears any more: one that has just ended. */
const deadPid = () => spawnSync(process.execPath, ["-e", ""], { windowsHide: true }).pid;
const FAUX = join(HERE, "..", "faux-claude.mjs");
const SCRIPT_PROGRAM = [
  'import { readFileSync } from "node:fs";',
  'for (const x of JSON.parse(readFileSync("data.json", "utf8"))) console.log(JSON.stringify(x));',
  "",
].join("\n");
/** A source of kind script, approved on this computer, that prints what data.json holds. */
const scriptSource = (n, items, extra = []) => {
  const r = node("sources.mjs", ["add", n, "--kind", "script", "--every", "day", "--type", "note", "--domains", "work", ...extra]);
  writeFileSync(join(SRC(n), "run.mjs"), SCRIPT_PROGRAM, "utf8");
  writeFileSync(join(SRC(n), "data.json"), JSON.stringify(items), "utf8");
  node("sources.mjs", ["trust", n]);
  return r;
};
/** A judge (kind "claude", "live": true), its instructions written. */
const judge = (n, extra = {}) => {
  mkdirSync(SRC(n), { recursive: true });
  writeFileSync(join(SRC(n), "instructions.md"), "Read each item, then say what you did.\n", "utf8");
  define(n, { name: n, kind: "claude", live: true, every: "week", gather: "0", hours: [0, 24], enabled: true, ...extra });
};
const toPile = (n, refs) => {
  for (const ref of refs) node("judge.mjs", ["add", "--source", n, "--ref", ref, "--title", `Item ${ref}`]);
};
const setState = (n, s) => writeFileSync(join(SRC(n), "state.json"), JSON.stringify(s), "utf8");
const ago = (hours) => new Date(Date.now() - hours * 3600_000).toISOString();

let r;
try {
  r = node("init.mjs", ["--dir", BRAIN, "--name", "T", "--domains", "work,writing", "--lang", "en", "--switch", "--no-git"]);
  if (!r.ok) throw new Error(`the throwaway brain could not be created: ${r.out}`);

  // --------------------------------------------------------- the evening's lock
  console.log("\nThe evening save and the hub (audit 1, 5)");
  {
    // The launcher the scheduler runs is written by routines.mjs from a text:
    // that text is taken as it is and given this fake home.
    const text = read(join(SCRIPTS, "routines.mjs"));
    const from = text.indexOf("const LAUNCHER_CODE = `") + "const LAUNCHER_CODE = `".length;
    const body = text.slice(from, text.indexOf("\n`;", from) + 1);
    const code = new Function("fwd", "HOME", `return \`${body}\`;`)(fwd, HOME);
    const launcher = join(HB, "nightly.mjs");
    writeFileSync(launcher, code, "utf8");
    r = run(process.execPath, ["--check", launcher]);
    check("the evening's launcher, as routines.mjs writes it, is a program that runs", r.ok, r.out);
    const evening = () => run(process.execPath, [launcher, "--force"], { timeout: 60_000 });
    writeFileSync(LOCK_EVENING, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
    const held = read(LOCK_EVENING);
    r = evening();
    check("an evening already at work (its lock as one JSON object) stops a second one, which leaves that lock alone", r.ok && /another save is running/.test(eveningLog()) && read(LOCK_EVENING) === held, eveningLog().slice(-400));
    writeFileSync(LOCK_EVENING, String(process.pid), "utf8");
    rmSync(join(HB, "logs"), { recursive: true, force: true });
    r = evening();
    check("the bare number a launcher of before wrote stops it too", /another save is running/.test(eveningLog()) && read(LOCK_EVENING) === String(process.pid), eveningLog().slice(-400));
    writeFileSync(LOCK_EVENING, JSON.stringify({ pid: deadPid(), at: new Date().toISOString() }), "utf8");
    rmSync(join(HB, "logs"), { recursive: true, force: true });
    r = evening();
    // No plugin under this fake home: the evening stops right after its lock, and removes it.
    check("a lock left by an evening that is gone is taken, then removed by the one that took it", /plugin was not found/.test(eveningLog()) && !/another save is running/.test(eveningLog()) && !existsSync(LOCK_EVENING), eveningLog().slice(-400));

    writeFileSync(LOCK_EVENING, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
    let h = hub();
    check("the hub starts nothing while the evening runs (its lock as one JSON object)", h.skipped === "the evening save is running", JSON.stringify(h));
    writeFileSync(LOCK_EVENING, String(process.pid), "utf8");
    h = hub();
    check("nor while an evening armed by an earlier version runs (a bare number)", h.skipped === "the evening save is running", JSON.stringify(h));
    rmSync(LOCK_EVENING, { force: true });
    h = hub();
    check("and the beat leaves no mark of its own behind it", !h.skipped && !existsSync(join(HB, "hub-beat.json")), JSON.stringify(h));
  }

  // ------------------------------------------------------------- the hub's lock
  console.log("\nOne hub at a time, and a lock that can be trusted (audit 8)");
  {
    const start = () => node("hub.mjs", [], { timeout: 30_000, env: { HVBRAIN_HUB_BEAT_MS: "3600000", HVBRAIN_HUB_VAULT: "unlocked" } });
    writeFileSync(HUB_LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
    r = start();
    check("a hub of before that holds the lock (no pulse) stops a second one at once", r.ok && /already runs/.test(r.out), r.out);
    writeFileSync(HUB_LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString(), pulse: true }), "utf8");
    r = start();
    check("a hub whose pulse beats stops a second one at once", r.ok && /already runs/.test(r.out), r.out);
    r = node("routines.mjs", ["hub", "state"]);
    check("its state says it runs", json(r.out).running === process.pid, r.out);
    const old = new Date(Date.now() - 10 * 60_000);
    utimesSync(HUB_LOCK, old, old);
    r = node("routines.mjs", ["hub", "state"]);
    check("a lock whose pulse stopped ten minutes ago names no running hub, whatever program bears its number now", json(r.out).running === null, r.out);
    // A hub started over that lock takes it, a pulse later (some forty seconds).
    const child = spawn(process.execPath, [join(SCRIPTS, "hub.mjs")], { cwd: BASE, env: { ...env, HVBRAIN_HUB_BEAT_MS: "3600000", HVBRAIN_HUB_VAULT: "unlocked" }, stdio: "ignore", windowsHide: true });
    let took = false;
    for (let i = 0; i < 90 && !took; i++) {
      await new Promise((res) => setTimeout(res, 1000));
      took = readJ(HUB_LOCK, {})?.pid === child.pid;
    }
    check("a hub started over such a lock takes it, instead of answering that a hub already runs", took, read(HUB_LOCK));
    try {
      child.kill();
    } catch {
      // gone already
    }
    await new Promise((res) => setTimeout(res, 1000));
    rmSync(HUB_LOCK, { force: true });
  }

  // ------------------------------------------------------------ the vault queue
  console.log("\nThe keys of the sources stay in the vault, a closed vault is a wait (decision of 2026-11-21, audit 12)");
  {
    r = node("sources.mjs", ["add", "x-bad", "--kind", "step", "--every", "day", "--needs", "TWO WORDS"]);
    check("--needs refuses what cannot be the name of a vault item", !r.ok && !existsSync(SRC("x-bad")), r.out);
    r = scriptSource("cle", [{ id: "c1", title: "What the key opened", body: "A note read with a key of the vault." }], ["--needs", "SOME_KEY,OTHER_KEY"]);
    check("add --needs writes the vault items in source.json", r.ok && JSON.stringify(readJ(join(SRC("cle"), "source.json")).needs) === JSON.stringify(["SOME_KEY", "OTHER_KEY"]), r.out);
    const started = new Date().toISOString();
    r = node("sources.mjs", ["run", "--due"], { env: { HVBRAIN_HUB_VAULT: "locked" } });
    const q = readJ(QUEUE, {});
    check(
      "the evening's run (--due) with the vault closed puts the source in the queue instead of running it: no error, no state written",
      r.ok && json(r.out).runs.some((x) => x.name === "cle" && x.waiting === "vault") && typeof q.cle?.at === "string" && !existsSync(join(SRC("cle"), "state.json")),
      `${r.out} ${JSON.stringify(q)}`,
    );
    r = node("letter.mjs", ["alert", "--since", started], { input: JSON.stringify({ failed: [], vaultLocked: true }) });
    check("and the evening's alert has nothing to say about it", r.ok && json(r.out).alert === false, r.out);
    r = node("status.mjs", ["--json"]);
    check("the status says which sources wait for the vault", r.ok && JSON.stringify(json(r.out).waitingForVault) === JSON.stringify(["cle"]), r.out.slice(-600));
    let h = hub({ HVBRAIN_HUB_VAULT: "locked" });
    check("the hub keeps it waiting while the vault stays closed", (h.waiting ?? []).includes("cle") && !ran(h, "cle").length && readJ(QUEUE, {}).cle?.at === q.cle.at, JSON.stringify(h));
    h = hub({ HVBRAIN_HUB_VAULT: "unlocked" });
    check("the vault open, the hub runs the source of the evening's rhythm at once, and the queue empties", ran(h, "cle").some((x) => x.ok) && !readJ(QUEUE, {}).cle && Boolean(state("cle").lastSuccess), JSON.stringify(h));

    writeFileSync(QUEUE, JSON.stringify({ ghost: { at: new Date().toISOString() }, cle: { at: new Date().toISOString() } }), "utf8");
    node("sources.mjs", ["disable", "cle"]);
    h = hub({ HVBRAIN_HUB_VAULT: "unlocked" });
    check("a source that is gone or disabled does not stay in the queue (the hub)", Object.keys(readJ(QUEUE, { x: 1 })).length === 0, `${JSON.stringify(h)} ${read(QUEUE)}`);
    node("sources.mjs", ["enable", "cle"]);
    writeFileSync(QUEUE, JSON.stringify({ ghost: { at: new Date().toISOString() } }), "utf8");
    node("sources.mjs", ["run", "--due"], { env: { HVBRAIN_HUB_VAULT: "locked" } });
    check("nor for an evening without a hub (sources.mjs run --due)", !readJ(QUEUE, {}).ghost, read(QUEUE));
    writeFileSync(QUEUE, "{ a queue cut short", "utf8");
    mkdirSync(join(HB, "due"), { recursive: true });
    writeFileSync(join(HB, "due", "cle"), "{}", "utf8");
    hub({ HVBRAIN_HUB_VAULT: "locked" });
    check("a queue that cannot be read is never written over", read(QUEUE) === "{ a queue cut short", read(QUEUE));
    rmSync(QUEUE, { force: true });
    rmSync(join(HB, "due"), { recursive: true, force: true });

    // DUE IN THE EVENING after a success earlier the same day (a morning catch-up).
    const at = new Date(Date.now() - 60_000);
    const time = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    mod(`import { setUserConfig, userConfig } from ${url("lib.mjs")}; setUserConfig({ routines: { ...(userConfig().routines ?? {}), save: { time: ${JSON.stringify(time)} } } });`);
    const slot = new Date(at);
    slot.setSeconds(0, 0);
    setState("cle", { lastRun: new Date(slot.getTime() - 30_000).toISOString(), lastSuccess: new Date(slot.getTime() - 30_000).toISOString() });
    const due = () => json(node("sources.mjs", ["list", "--json"]).out).sources.find((s) => s.name === "cle")?.due;
    check("a source of the evening that succeeded before the evening's hour is due at the evening", due() === true);
    setState("cle", { lastRun: new Date(Date.now() - 5_000).toISOString(), lastSuccess: new Date(Date.now() - 5_000).toISOString() });
    check("and not again once it ran since that hour", due() === false);
  }

  // ------------------------------------------------------------ the judge's token
  console.log("\nThe judges' access to Claude lives outside the vault (decision of 2026-11-21)");
  {
    const tok = (a, o = {}) => node("judge-token.mjs", a, o);
    const T1 = `sk-ant-oat01-${"a".repeat(80)}`;
    const T2 = `sk-ant-oat01-${"b".repeat(80)}`;
    const tokenFile = join(HB, "judge-token.json");
    // A Hypervibe vault on this computer (a stand-in, in this fake home),
    // registered as the platform registers a plugin: a vault.mjs found
    // anywhere else is never taken for one (lib.mjs, 2026-11-27).
    const vaultDir = join(HOME, ".claude", "plugins", "faux-coffre", "scripts", "vault");
    mkdirSync(vaultDir, { recursive: true });
    writeFileSync(join(HOME, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: { "hypervibe@bench": [{ installPath: join(HOME, ".claude", "plugins", "faux-coffre") }] } }), "utf8");
    writeFileSync(join(vaultDir, "vault.mjs"), [
      'import { existsSync, readFileSync } from "node:fs";',
      'import { dirname, join } from "node:path";',
      'import { fileURLToPath } from "node:url";',
      "const DIR = dirname(fileURLToPath(import.meta.url));",
      'const locked = () => existsSync(join(DIR, "locked"));',
      'const read = () => { try { return JSON.parse(readFileSync(join(DIR, "vault.json"), "utf8")); } catch { return {}; } };',
      "export function putItem() { throw new Error(\"nothing is written in this vault\"); }",
      'if (String(process.argv[1] ?? "").replaceAll("\\\\", "/").endsWith("/scripts/vault/vault.mjs")) {',
      "  const [cmd, item, field] = process.argv.slice(2);",
      '  if (cmd === "status") console.log(locked() ? "locked" : "unlocked");',
      '  else if (cmd === "get") { if (locked()) process.exit(2); const v = read()[item]?.[field]; if (!v) process.exit(4); console.log(v); }',
      "  else process.exit(1);",
      "}",
      "",
    ].join("\n"), "utf8");
    writeFileSync(join(vaultDir, "launch.mjs"), "process.exit(0);\n", "utf8");
    writeFileSync(join(vaultDir, "vault.json"), JSON.stringify({ CLAUDE_CODE: { oauth_token: T2 } }), "utf8");
    const withVault = { HVBRAIN_VAULT: "" };
    const lockVault = (on) => (on ? writeFileSync(join(vaultDir, "locked"), "", "utf8") : rmSync(join(vaultDir, "locked"), { force: true }));

    r = tok(["state"], { env: withVault });
    check("a token found only in the vault is still read", r.ok && json(r.out).found === "vault", r.out);
    r = tok(["keep-outside"], { env: withVault });
    check(
      "keep-outside copies the vault's token into the plugin's file, says where from and where to, and never shows it",
      r.ok && JSON.stringify(json(r.out)) === JSON.stringify({ ok: true, from: "vault", to: "file" }) && !r.out.includes(T2) && readJ(tokenFile)?.token === T2,
      r.out,
    );
    if (process.platform !== "win32") check("the file is for the person's account alone (mode 600)", (statSync(tokenFile).mode & 0o777) === 0o600, (statSync(tokenFile).mode & 0o777).toString(8));
    r = tok(["state"], { env: withVault });
    check("the file is read before the vault", json(r.out).found === "file", r.out);
    r = tok(["set"], { env: withVault, input: T1 });
    check("set writes the file, even with the vault open, and leaves the vault alone", r.ok && json(r.out).stored === "file" && readJ(tokenFile)?.token === T1 && readJ(join(vaultDir, "vault.json")).CLAUDE_CODE.oauth_token === T2, r.out);
    tok(["forget"], { env: withVault });
    lockVault(true);
    r = tok(["keep-outside"], { env: withVault });
    check("keep-outside with the vault locked says why, and copies nothing", !r.ok && json(r.out).why === "vault-locked" && !existsSync(tokenFile), r.out);
    r = tok(["keep-outside"]);
    check("and without any vault, says that too", !r.ok && json(r.out).why === "no-vault", r.out);
    lockVault(false);
    rmSync(join(HOME, ".claude"), { recursive: true, force: true });

    // A judge whose token is outside the vault never waits for it.
    tok(["set"], { input: T1 });
    judge("lit", { needs: ["CLAUDE_CODE"] });
    toPile("lit", ["test:lit-1"]);
    const claude = { HVBRAIN_CLAUDE: FAUX, FAUX_CLAUDE_LOG: "", FAUX_CLAUDE_EXIT: "", FAUX_CLAUDE_ADD: "", FAUX_CLAUDE_TOKENS: "", FAUX_CLAUDE_PROMPT: "" };
    let h = hub({ ...claude, HVBRAIN_HUB_VAULT: "locked" });
    check("a judge whose token is in the plugin's file runs while the vault is locked", ran(h, "lit").some((x) => x.ok) && !(h.waiting ?? []).includes("lit") && pile("lit").length === 0, JSON.stringify(h));
    patch("lit", { needs: ["CLAUDE_CODE", "OTHER_KEY"] });
    toPile("lit", ["test:lit-2"]);
    h = hub({ ...claude, HVBRAIN_HUB_VAULT: "locked" });
    check("unless its source.json names other keys to take there: then it waits", (h.waiting ?? []).includes("lit") && !ran(h, "lit").length && pile("lit").length === 1, JSON.stringify(h));
    patch("lit", { needs: ["CLAUDE_CODE"] });
    tok(["forget"]);
    h = hub({ ...claude, HVBRAIN_HUB_VAULT: "locked" });
    check("a token kept only in the vault: the judge waits for the vault, as a source does", (h.waiting ?? []).includes("lit") && !ran(h, "lit").length, JSON.stringify(h));
    patch("lit", { paused: true });
    rmSync(QUEUE, { force: true });
  }

  // ---------------------------------------------------------------- the judges
  console.log("\nA judge's pass, its pile and its limits (audit 2, 3, 4, 6, 7, 11, 15)");
  {
    // A Claude that opens the first two items it is handed, then, with FAUX_CLAUDE_SLOW (a judge only gets the variables it needs, and the stand-in's own),
    // works on until the judge's time limit stops it.
    const slow = join(BASE, "slow-claude.mjs");
    const told = join(BASE, "slow-claude.jsonl");
    writeFileSync(slow, [
      'import { appendFileSync, readFileSync } from "node:fs";',
      `import { opened } from ${JSON.stringify(pathToFileURL(join(SCRIPTS, "readers", "opened.mjs")).href)};`,
      'const refs = readFileSync(0, "utf8").split("\\n").map((l) => /^\\d+\\. .*\\((.+)\\)$/.exec(l.trim())?.[1]).filter(Boolean);',
      `appendFileSync(${JSON.stringify(told)}, JSON.stringify({ items: refs.length }) + "\\n");`,
      "for (const ref of refs.slice(0, 2)) opened(ref);",
      'if (process.env.FAUX_CLAUDE_SLOW) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 30000);',
      'console.log("Read them.");',
      "",
    ].join("\n"), "utf8");
    judge("lent", { proof: true, batch: 4, timeoutMin: 0.05, allowedTools: ["Bash(node {plugin}/scripts/readers/conversation.mjs:*)"] });
    toPile("lent", ["s1", "s2", "s3", "s4"].map((s) => `claude://session/${s}#2026-11-20T10:00:00.000Z`));
    r = node("judge.mjs", ["run", "lent"], { env: { HVBRAIN_CLAUDE: slow, FAUX_CLAUDE_SLOW: "1" } });
    const left = pile("lent").map((i) => i.ref.slice(17, 19));
    const seen = Object.keys(readJ(join(SRC("lent"), "seen.json"), {}));
    check(
      "a pass stopped at its time limit still marks read what the trace proves read (the item opened last excepted)",
      json(r.out).ok === false && JSON.stringify(left) === JSON.stringify(["s2", "s3", "s4"]) && seen.length === 1 && seen[0].includes("s1"),
      `${r.out} ${JSON.stringify(left)} ${JSON.stringify(seen)}`,
    );
    check("and hands over half as many items the next time", state("lent").nextBatch === 2 && state("lent").failures === 1, JSON.stringify(state("lent")));
    r = node("judge.mjs", ["run", "lent"], { env: { HVBRAIN_CLAUDE: slow, FAUX_CLAUDE_SLOW: "" } });
    const passes = read(told).trim().split("\n").map((l) => JSON.parse(l).items);
    check("the next pass is handed two items, and the batch grows back once a pass ends well", json(r.out).ok === true && passes[1] === 2 && state("lent").nextBatch === undefined && state("lent").failures === 0, `${r.out} ${JSON.stringify(passes)} ${JSON.stringify(state("lent"))}`);

    node("sources.mjs", ["set", "lent", "dailyTokens", "1000000"]);
    mod(`import { logEvent } from ${url("journal.mjs")}; logEvent({ act: "run", who: "source:lent", ok: false, judged: 0, minutes: 30, tokensEstimated: 12345 });`);
    r = node("judge.mjs", ["state"]);
    check("the daily cap counts what a pass stopped before it could say it used (its estimate)", (json(r.out).live.find((j) => j.name === "lent")?.spentToday ?? 0) >= 12345, r.out.slice(0, 600));
    patch("lent", { paused: true });

    r = mod(`import { pruneSeen } from ${url("judge.mjs")}; const old = new Date(Date.now() - 90 * 86400000).toISOString(); console.log(JSON.stringify(Object.keys(pruneSeen({ "claude://session/a#2026-01-02": old, "claude://session/a#2025-12-01": old, "x://plain": old, "claude://session/b#2026-11-20": new Date().toISOString() })).sort()));`);
    check("what was judged long ago leaves seen.json, except the latest version of each conversation", r.ok && r.out.trim() === JSON.stringify(["claude://session/a#2026-01-02", "claude://session/b#2026-11-20"]), r.out);

    judge("vide");
    r = node("judge.mjs", ["now", "vide"]);
    check("a \"now\" asked on an empty pile is not kept", r.ok && json(r.out).now === false && !existsSync(join(HB, "judge", "vide.now")), r.out);
    judge("pause", { paused: true });
    toPile("pause", ["test:pause-1"]);
    writeFileSync(join(HB, "judge", "pause.now"), ago(2), "utf8");
    let h = hub({ HVBRAIN_CLAUDE: FAUX, FAUX_CLAUDE_LOG: "" });
    check("a \"now\" older than an hour no longer wakes a paused judge, and is dropped", !ran(h, "pause").length && !existsSync(join(HB, "judge", "pause.now")) && pile("pause").length === 1, JSON.stringify(h));

    judge("nuit", { hours: [22, 6] });
    r = node("judge.mjs", ["state"]);
    const nuit = json(r.out).live.find((j) => j.name === "nuit");
    check("hours across midnight, which a judge does not run with, are said in its state", JSON.stringify(nuit?.hoursIgnored) === "[22,6]" && JSON.stringify(nuit?.hours) === "[7,23]", JSON.stringify(nuit));

    writeFileSync(pileFile("vide"), "{ a pile cut short", "utf8");
    r = node("judge.mjs", ["add", "--source", "vide", "--ref", "test:x", "--title", "X"]);
    check("an item added to a pile that cannot be read is refused, and the pile is not written over", !r.ok && /cannot be read/.test(r.out) && read(pileFile("vide")) === "{ a pile cut short", r.out);
    mkdirSync(SRC("cassee"), { recursive: true });
    writeFileSync(join(SRC("cassee"), "source.json"), "{ a source cut short", "utf8");
    r = node("sources.mjs", ["pause", "cassee"]);
    check("a source.json that cannot be read is not replaced by the one field a command changes", !r.ok && read(join(SRC("cassee"), "source.json")) === "{ a source cut short", r.out);
    rmSync(SRC("cassee"), { recursive: true, force: true });
    rmSync(pileFile("vide"), { force: true });

    // An alert that could not leave is not an alert given.
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = read(brainJson);
    writeFileSync(brainJson, JSON.stringify({ ...JSON.parse(keptBrain), letter: { channel: "brevo", to: "person@example.invalid", from: "brain@example.invalid" } }, null, 2), "utf8");
    judge("panne");
    toPile("panne", ["test:panne-1"]);
    setState("panne", { lastRun: ago(2), lastError: "exit 1: the login expired", failures: 1, failingSince: ago(5) });
    const failing = { HVBRAIN_CLAUDE: FAUX, FAUX_CLAUDE_LOG: "", FAUX_CLAUDE_EXIT: "1", FAUX_CLAUDE_SAYS: "OAuth token has expired" };
    h = hub(failing);
    check("a judge's alert that could not leave (no key for its mail) is not noted as given", ran(h, "panne").length === 1 && state("panne").failures === 2 && !state("panne").alertedAt && /alert NOT sent/.test(hubLog()), `${JSON.stringify(h)} ${JSON.stringify(state("panne"))}`);
    writeFileSync(brainJson, keptBrain, "utf8");
    node("judge.mjs", ["now", "panne"]);
    h = hub(failing);
    check("the next failure tries again, and an alert kept on this computer by design is noted as given", state("panne").failures === 3 && Boolean(state("panne").alertedAt), `${JSON.stringify(h)} ${JSON.stringify(state("panne"))}`);
    patch("panne", { paused: true });
  }

  // ------------------------------------------- git that fails, settings that break
  console.log("\nGit that fails, settings that cannot be read (the writes' corrector, 2026-11-21)");
  {
    writeFileSync(join(BRAIN, ".git"), "gitdir: a-folder-that-is-not-there\n", "utf8");
    r = node("status.mjs", ["--json"]);
    const st = json(r.out);
    check("the status tells git that fails from no git at all, and says why", r.ok && st.git === false && typeof st.gitError === "string" && st.gitError.length > 0, r.out.slice(0, 400));
    rmSync(join(BRAIN, ".git"), { force: true });
    r = node("status.mjs", ["--json"]);
    check("and without git at all, says no error", r.ok && json(r.out).git === false && !("gitError" in json(r.out)), r.out.slice(0, 300));

    const CONFIG = join(HB, "config.json");
    const kept = read(CONFIG);
    const broken = kept.replace(/\}\s*$/, ",\n}\n");
    const said = () => (hubLog().match(/cannot be read \(/g) ?? []).length;
    rmSync(join(HB, "logs"), { recursive: true, force: true });
    rmSync(join(HB, "alert.json"), { force: true });
    writeFileSync(CONFIG, broken, "utf8");
    let h = hub();
    const h2 = hub();
    const alert = readJ(join(HB, "alert.json"), {});
    check(
      "settings there and unreadable: the hub runs nothing, says it once in its log and keeps one alert, and does not stop",
      h.skipped === "the settings of this computer cannot be read" && h2.skipped === h.skipped && said() === 1 && alert.settings === true && read(CONFIG) === broken,
      `${JSON.stringify(h)} ${said()} ${JSON.stringify(alert)}`,
    );
    // A hub that knows its brain (it read it before the file broke) sends the alert by the letter.
    rmSync(join(HB, "settings-alert.json"), { force: true });
    rmSync(join(HB, "alert.json"), { force: true });
    h = hub({ HVBRAIN_DIR: BRAIN });
    const byLetter = readJ(join(HB, "alert.json"), {});
    check("a hub that knows its brain gives the alert by the letter's channel, in its own words", h.skipped === "the settings of this computer cannot be read" && byLetter.settings === true && /Settings of this computer/.test(JSON.stringify(byLetter.problems)) && /settings: alert kept on this computer only/.test(hubLog()), `${JSON.stringify(h)} ${JSON.stringify(byLetter)}`);
    const text = read(join(SCRIPTS, "routines.mjs"));
    const from = text.indexOf("const LAUNCHER_CODE = `") + "const LAUNCHER_CODE = `".length;
    const launcher = join(HB, "nightly.mjs");
    writeFileSync(launcher, new Function("fwd", "HOME", `return \`${text.slice(from, text.indexOf("\n`;", from) + 1)}\`;`)(fwd, HOME), "utf8");
    const evening = () => run(process.execPath, [launcher, "--force"], { timeout: 60_000 });
    const a = evening();
    const b = evening();
    const lines = (eveningLog().match(/cannot be read/g) ?? []).length;
    check("the evening save says it once too, and the runs after it end quietly", a.ok && b.ok && lines === 1 && read(CONFIG) === broken, `${a.out} ${b.out} ${eveningLog().slice(-300)}`);
    writeFileSync(CONFIG, kept, "utf8");
    h = hub();
    check("the file repaired, the hub goes on and forgets what it said", !h.skipped && !existsSync(join(HB, "settings-alert.json")), JSON.stringify(h));
    evening();
    check("and the evening too", !existsSync(join(HB, "nightly-settings.json")) && /plugin was not found/.test(eveningLog()), eveningLog().slice(-300));
    rmSync(join(HB, "alert.json"), { force: true });
  }

  // ---------------------------------------------------- the skills' two commands
  console.log("\nTwo commands for the skills, and the catalogue (audit 14)");
  {
    r = node("sources.mjs", ["set", "lent", "proof", "off"]);
    check("set <judge> proof off takes the line out of source.json", r.ok && json(r.out).proof === false && !("proof" in readJ(join(SRC("lent"), "source.json"))), r.out);
    r = node("sources.mjs", ["set", "lent", "proof", "on"]);
    const d = readJ(join(SRC("lent"), "source.json"));
    check("set <judge> proof on writes \"proof\": true, and changes nothing else", r.ok && d.proof === true && d.batch === 4 && d.paused === true && d.dailyTokens === 1000000, JSON.stringify(d));
    r = node("sources.mjs", ["set", "lent", "proof", "maybe"]);
    check("anything but on or off is refused", !r.ok, r.out);
    r = node("sources.mjs", ["set", "cle", "proof", "on"]);
    check("and a source that is not a judge is refused", !r.ok && !("proof" in readJ(join(SRC("cle"), "source.json"))), r.out);

    scriptSource("agenda", [
      { kind: "entry", address: "agenda://event-1", title: "A first title", text: "The first line sent." },
      { kind: "entry", address: "agenda://event-1", title: "The title kept", text: "The second line sent, for the same address." },
    ]);
    r = node("sources.mjs", ["run", "agenda"]);
    const first = json(r.out).runs[0];
    r = node("sources.mjs", ["run", "agenda"]);
    const second = json(r.out).runs[0];
    check("a source that sends two lines for one address says it wrote once, then nothing while the file does not change", first.entries > 0 && second.entries === 0 && second.ok, `${JSON.stringify(first)} ${JSON.stringify(second)}`);
  }
} catch (e) {
  failures++;
  console.log(`  FAIL  the checks stopped: ${e.stack ?? e}`);
} finally {
  if (!process.argv.includes("--keep")) {
    try {
      rmSync(BASE, { recursive: true, force: true });
    } catch {
      // a file still held for an instant on Windows: the system's temporary folder empties itself
    }
  }
}

console.log(`\n${total - failures} ok, ${failures} FAIL (of ${total})${process.argv.includes("--keep") ? `, kept in ${BASE}` : ""}\n`);
process.exit(failures ? 1 : 0);
