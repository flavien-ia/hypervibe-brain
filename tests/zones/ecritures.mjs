#!/usr/bin/env node
// ecritures.mjs - The checks of the zone "writes and integrity" (the audit of
// 0.8.2, corrected on 2026-11-21): one check for each correction that keeps a
// piece of data from being lost. A throwaway brain in the system's temporary
// folder, a fake home (HVBRAIN_HOME), nothing of the person's is touched, no
// AI is called.
//
//   node tests/zones/ecritures.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..", "..", "scripts");
const BASE = join(tmpdir(), `hvb-zone-ecritures-${process.pid}`);
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
const HB = join(HOME, ".hypervibe-brain");
mkdirSync(HOME, { recursive: true });
const GITCONFIG = join(BASE, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n\tname = zone\n\temail = zone@example.invalid\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n", "utf8");

const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", HVBRAIN_VAULT: "off", HVBRAIN_NO_WINDOW: "1", HVBRAIN_NO_OPEN: "1", HVBRAIN_CLAUDE: "no-claude-for-the-zone", HVBRAIN_WHO: "",
  CLAUDE_CODE_OAUTH_TOKEN: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "zone", GIT_AUTHOR_EMAIL: "zone@example.invalid", GIT_COMMITTER_NAME: "zone", GIT_COMMITTER_EMAIL: "zone@example.invalid",
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
  const r = spawnSync(cmd, a, { cwd: o.cwd ?? BASE, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
  const err = clean(r.stderr);
  return { ok: r.status === 0, status: r.status, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, err };
};
const runAsync = (cmd, a, o = {}) =>
  new Promise((res) => {
    const p = spawn(cmd, a, { cwd: o.cwd ?? BASE, env: { ...env, ...o.env }, windowsHide: true });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (status) => res({ ok: status === 0, status, out: status === 0 ? out : `${out}${clean(err)}`, err: clean(err) }));
    if (o.input !== undefined) p.stdin.end(o.input);
    else p.stdin.end();
  });
const node = (script, a = [], o = {}) => run("node", [join(SCRIPTS, script), ...a], o);
const nodeAsync = (script, a = [], o = {}) => runAsync("node", [join(SCRIPTS, script), ...a], o);
const url = (name) => JSON.stringify(pathToFileURL(join(SCRIPTS, name)).href);
const mod = (code, a = [], o = {}) => run("node", ["--input-type=module", "-e", code, ...a], o);
const modAsync = (code, a = [], o = {}) => runAsync("node", ["--input-type=module", "-e", code, ...a], o);
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const git = (...a) => run("git", a, { cwd: BRAIN });
const fwd = (p) => String(p).replace(/\\/g, "/");
const read = (f) => readFileSync(f, "utf8");
const readJ = (f, d = null) => {
  try {
    return JSON.parse(read(f));
  } catch {
    return d;
  }
};
const day = (ago = 0) => {
  const d = new Date(Date.now() - ago * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const BOM = String.fromCharCode(0xfeff);
const KEY = fwd(BRAIN);
const EVENTS = join(HB, "events.jsonl");
const CONFIG = join(HB, "config.json");
const liveLines = () => (existsSync(EVENTS) ? read(EVENTS).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : []);
const journalLines = () => (existsSync(join(BRAIN, "journal")) ? readdirSync(join(BRAIN, "journal")).flatMap((n) => read(join(BRAIN, "journal", n)).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))) : []);
const times = (list, id) => list.filter((e) => e.id === id).length;
const lastWrite = (what, note) => liveLines().filter((e) => e.act === "write" && e.what === what && e.note === note).at(-1)?.id;
const capture = (title, body, extra = [], o = {}) => node("capture.mjs", ["--title", title, "--type", "note", "--domains", "work", "--no-commit", ...extra], { input: body, ...o });
const noteFile = (slug) => join(BRAIN, "vault", "notes", `${slug}.md`);
const fold = () => mod(`import { foldEvents } from ${url("journal.mjs")}; console.log(JSON.stringify(foldEvents()));`);

let r;
try {
  r = node("init.mjs", ["--dir", BRAIN, "--name", "Camille", "--domains", "work,writing", "--lang", "en", "--switch"]);
  if (!r.ok) throw new Error(`the throwaway brain could not be created: ${r.out}`);

  // ------------------------------------------------------------------ settings
  console.log("\nThe settings of the computer (audit 2)");
  {
    const kept = read(CONFIG);
    writeFileSync(CONFIG, BOM + kept, "utf8");
    r = mod(`import { userConfig, userConfigProblem } from ${url("lib.mjs")}; console.log(JSON.stringify({ brain: userConfig().brain ?? null, problem: userConfigProblem() }));`);
    check("settings that start with a byte order mark are read as they are", r.ok && json(r.out).brain === KEY && json(r.out).problem === null, r.out);
    const broken = kept.replace(/\}\s*$/, ",\n}\n");
    writeFileSync(CONFIG, broken, "utf8");
    r = node("start.mjs", ["page", "--doing", "Looking at this computer"]);
    check(
      "settings that are there and cannot be read are never written over: the write stops with the reason, and a copy is kept beside",
      !r.ok && /cannot be read/.test(r.out) && read(CONFIG) === broken && existsSync(`${CONFIG}.bad`) && read(`${CONFIG}.bad`) === broken,
      r.out,
    );
    r = node("start.mjs", ["state"]);
    check("the state of the start says the settings cannot be read, not that there is no brain yet", !r.ok && json(r.out).ok === false && /cannot be read/.test(json(r.out).error) && read(CONFIG) === broken, r.out);
    r = node("fact.mjs", ["--note", "x", "--text", "A fact that will not be written anywhere.", "--from", "test://x"]);
    check("a script that needs the brain says the settings cannot be read, not that there is no brain", !r.ok && /cannot be read/.test(r.out) && !/no brain set up/.test(r.out), r.out);
    r = mod(`import { userConfig, userConfigProblem } from ${url("lib.mjs")}; console.log(JSON.stringify({ empty: Object.keys(userConfig()).length === 0, problem: Boolean(userConfigProblem()) }));`);
    check("they still read as {}, with the problem said", r.ok && json(r.out).empty && json(r.out).problem, r.out);
    writeFileSync(CONFIG, kept, "utf8");
    rmSync(`${CONFIG}.bad`, { force: true });
    const eight = await Promise.all([...Array(8).keys()].map((i) => modAsync(`import { setUserConfig } from ${url("lib.mjs")}; setUserConfig({ zone${i}: ${i} });`)));
    const after = readJ(CONFIG, {});
    check("eight programs that each keep a setting at the same moment lose none", eight.every((x) => x.ok) && [...Array(8).keys()].every((i) => after[`zone${i}`] === i) && after.brain === KEY, JSON.stringify(after) + eight.map((x) => x.err).join(""));
    const folders = [...Array(6).keys()].map((i) => join(BASE, "roots", `folder-${i}`));
    for (const f of folders) mkdirSync(f, { recursive: true });
    const six = await Promise.all(folders.map((f) => modAsync(`import { ensureRoot } from ${url("roots.mjs")}; console.log(JSON.stringify(ensureRoot(process.argv[1])));`, [f])));
    const roots = readJ(CONFIG, {}).sourceRoots ?? {};
    check("six folders given a root at the same moment all keep theirs", six.every((x) => x.ok) && folders.every((f) => Object.values(roots).includes(fwd(f))), JSON.stringify(roots) + six.map((x) => x.err).join(""));
    const one = join(BASE, "roots", "the-same-folder");
    mkdirSync(one, { recursive: true });
    const same = await Promise.all([...Array(5).keys()].map(() => modAsync(`import { ensureRoot } from ${url("roots.mjs")}; console.log(JSON.stringify(ensureRoot(process.argv[1])));`, [one])));
    const named = Object.entries(readJ(CONFIG, {}).sourceRoots ?? {}).filter(([, p]) => p === fwd(one));
    check("the same folder given its root by five programs at once gets one root", same.every((x) => x.ok) && named.length === 1 && same.every((x) => json(x.out).scheme === named[0][0]), JSON.stringify(named) + same.map((x) => x.out).join(""));
    r = mod(`import { rmSync } from "node:fs"; import { CONFIG_FILE, userConfig, setUserConfig } from ${url("lib.mjs")}; rmSync(CONFIG_FILE, { force: true }); const empty = Object.keys(userConfig()).length; const made = setUserConfig({ a: 1 }); console.log(JSON.stringify({ empty, made }));`, [], { env: { HVBRAIN_HOME: join(BASE, "home-empty") } });
    check("no settings yet still reads as {}, and the first setting is kept", r.ok && json(r.out).empty === 0 && json(r.out).made.a === 1, r.out);
  }

  // ------------------------------------------------------------------- journal
  console.log("\nThe fold of the journal (audit 1 and 15)");
  {
    const other = join(BASE, "another-brain");
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, "brain.json"), "{}", "utf8");
    const old = new Date(Date.now() - 45 * 86400_000).toISOString();
    // An old line of another brain of this computer, not folded yet, at the head: it must stay.
    writeFileSync(EVENTS, `${JSON.stringify({ at: old, id: "otherbrain1", computer: "zone", brain: fwd(other), act: "write", who: "ai:x", note: "n", what: "fact" })}\n${existsSync(EVENTS) ? read(EVENTS) : ""}`, "utf8");
    const WRITERS = 4;
    const EACH = 60;
    const writer = (tag) => modAsync(`import { logEvent } from ${url("journal.mjs")}; const ids = []; for (let i = 0; i < ${EACH}; i++) { ids.push(logEvent({ act: "write", who: "ai:zone", note: "n", what: "fact", mark: "writer-${tag}" })); await new Promise((r) => setTimeout(r, Math.random() * 12)); } console.log(JSON.stringify(ids));`);
    const noise = modAsync(`import { appendFileSync } from "node:fs"; for (let i = 0; i < 150; i++) { appendFileSync(process.argv[1], JSON.stringify({ at: process.argv[2], id: "noise" + i, computer: "zone", brain: process.argv[3], act: "signal", who: "source:x", what: "running" }) + "\\n"); await new Promise((r) => setTimeout(r, 6)); }`, [EVENTS, old, KEY]);
    // (The mark of the daily tidying is removed before each fold, so that each one tidies. Three programs remove the
    // same file at the same moment: on Windows the second is refused for an instant, EPERM, and that is the check's
    // own doing, not the journal's: tried again, and a removal that still fails only means another one did it.)
    const folder = () => modAsync(`import { rmSync } from "node:fs"; import { foldEvents } from ${url("journal.mjs")}; let n = 0; for (let i = 0; i < 25; i++) { try { rmSync(process.argv[1], { force: true, maxRetries: 10, retryDelay: 10 }); } catch {} n += foldEvents(); await new Promise((r) => setTimeout(r, 15)); } console.log(n);`, [join(HB, "events-pruned")]);
    const done = await Promise.all([...[...Array(WRITERS).keys()].map((i) => writer(i)), noise, folder(), folder(), folder()]);
    rmSync(join(HB, "events-pruned"), { force: true });
    const last = fold();
    const ids = done.slice(0, WRITERS).flatMap((x) => (x.ok ? json(x.out) : []));
    const live = liveLines();
    const inBrain = journalLines();
    check("every program ended well", done.every((x) => x.ok) && last.ok && ids.length === WRITERS * EACH && ids.every(Boolean), done.map((x) => x.err).join("") + last.out);
    check("an event written while the live file is being tidied is never lost: each is in the live file, once", ids.every((id) => times(live, id) === 1), `${ids.filter((id) => times(live, id) !== 1).length} of ${ids.length} are not there exactly once`);
    check("and never counted twice: each one joined the brain's journal, once, with three folds at the same moment", ids.every((id) => times(inBrain, id) === 1), `${ids.filter((id) => times(inBrain, id) !== 1).length} of ${ids.length} are not there exactly once`);
    check("the lines older than thirty days left the live file, and nothing was left beside it", !live.some((e) => String(e.id).startsWith("noise")) && !readdirSync(HB).some((n) => n.startsWith("events.jsonl.")), readdirSync(HB).join(" "));
    check("an old line of another brain of this computer, not folded yet, is kept for it", times(live, "otherbrain1") === 1);
    r = mod(`import { readEvents } from ${url("journal.mjs")}; const all = readEvents({ act: "write" }).filter((e) => String(e.mark ?? "").startsWith("writer-")); console.log(JSON.stringify({ n: all.length, unique: new Set(all.map((e) => e.id)).size }));`);
    check("read back, each event is there once", r.ok && json(r.out).n === ids.length && json(r.out).unique === ids.length, r.out);

    // The live file replaced under the same number while a program still holds what it read of it (2026-11-27).
    // On Linux a new file is often given the number of one just removed: a fold that had read the live file, then
    // found "the same file, grown" after two other folds had replaced it, read on from where it had stopped, in a
    // file where everything had moved. Written again in place here, which keeps its number on every system: one
    // line of the middle leaves, new ones are added until the file is no smaller, its first line is unchanged.
    r = mod(
      `import { readFileSync, writeFileSync } from "node:fs"; import { logEvent, readEvents } from ${url("journal.mjs")};
      const live = process.argv[1];
      const mine = (mark) => readEvents({ act: "write" }).filter((e) => e.mark === mark).map((e) => e.id);
      const first = [1, 2, 3].map(() => logEvent({ act: "write", who: "ai:zone", note: "n", what: "fact", mark: "same-number" }));
      const before = mine("same-number").length;
      const size = readFileSync(live).length;
      const lines = readFileSync(live, "utf8").split("\\n").filter(Boolean);
      const model = JSON.parse(lines.at(-1));
      const added = [];
      let text = "";
      do {
        added.push("samenumber" + added.length);
        text = [lines[0], ...lines.slice(2), ...added.map((id) => JSON.stringify({ ...model, id, mark: "same-number-after" }))].join("\\n") + "\\n";
      } while (Buffer.byteLength(text) < size);
      writeFileSync(live, text, "utf8");
      const after = mine("same-number-after");
      console.log(JSON.stringify({ before, added: added.length, after: after.length, all: added.every((id) => after.includes(id)), kept: first.every((id) => mine("same-number").includes(id)) }));`,
      [EVENTS],
    );
    check("a live file replaced under the same number is read whole again, not from where the reading had stopped", r.ok && json(r.out).before === 3 && json(r.out).after === json(r.out).added && json(r.out).all && json(r.out).kept, r.out);

    // A fold cut short between the journal and its mark.
    const log = (mark) => json(mod(`import { logEvent } from ${url("journal.mjs")}; console.log(JSON.stringify([1, 2, 3].map(() => logEvent({ act: "write", who: "ai:zone", note: "n", what: "fact", mark: process.argv[1] }))));`, [mark]).out);
    const markFile = join(HB, "events-folded.json");
    let before = read(markFile);
    let three = log("cut-short");
    fold();
    writeFileSync(markFile, before, "utf8");
    writeFileSync(join(HB, "events-folding.json"), JSON.stringify({ [KEY]: readJ(markFile)[KEY] }), "utf8");
    rmSync(join(HB, "events-folded-recent.json"), { force: true });
    r = fold();
    check("a fold cut short before its mark adds no line twice at the next one", r.ok && three.every((id) => times(journalLines(), id) === 1) && !existsSync(join(HB, "events-folding.json")), r.out);
    three = log("mark-unreadable");
    fold();
    writeFileSync(markFile, "{ this is not JSON", "utf8");
    r = fold();
    check("a mark that cannot be read does not fold everything again", r.ok && three.every((id) => times(journalLines(), id) === 1) && ids.every((id) => times(journalLines(), id) === 1), r.out);
    three = log("mark-gone");
    fold();
    rmSync(markFile, { force: true });
    r = fold();
    check("nor does a mark that is gone", r.ok && three.every((id) => times(journalLines(), id) === 1) && typeof readJ(markFile, {})[KEY] === "string", r.out);

    // A line stamped before the mark, written after the fold that set it.
    const top = readJ(markFile)[KEY];
    const lateAt = new Date(Date.parse(top.slice(0, top.indexOf("|"))) - 1500).toISOString();
    appendFileSync(EVENTS, `${JSON.stringify({ at: lateAt, id: "latecomer1", computer: "zone", brain: KEY, act: "write", who: "ai:zone", note: "n", what: "fact" })}\n`, "utf8");
    r = mod(`import { pendingEvents } from ${url("journal.mjs")}; console.log(JSON.stringify(pendingEvents().map((e) => e.id)));`);
    const seen = r.ok && json(r.out).includes("latecomer1");
    fold();
    log("after-the-latecomer");
    fold();
    check("a line stamped just before the mark and written just after is still folded, once", seen && times(journalLines(), "latecomer1") === 1, r.out);

    // A live file set aside by a fold that never put it back.
    const linesBefore = liveLines().length;
    renameSync(EVENTS, `${EVENTS}.4242-zz.0.away`);
    const [fresh] = log("after-the-cut");
    r = fold();
    const back = liveLines();
    check("a live file set aside by a fold cut short is joined again, each line once", r.ok && back.length === linesBefore + 3 && new Set(back.map((e) => e.id)).size === back.length && times(back, fresh) === 1 && !readdirSync(HB).some((n) => n.endsWith(".away")), `${back.length} lines for ${linesBefore + 3}`);

    // A line already twice in the brain's journal (two saves at the same moment, before the lock).
    const file = readdirSync(join(BRAIN, "journal")).map((n) => join(BRAIN, "journal", n))[0];
    appendFileSync(file, `${read(file).split("\n").find((l) => l.includes(ids[0]))}\n`, "utf8");
    r = mod(`import { readEvents } from ${url("journal.mjs")}; console.log(JSON.stringify(readEvents({ act: "write" }).filter((e) => e.id === process.argv[1]).length));`, [ids[0]]);
    check("a line that is twice in the brain's journal is read once", r.ok && json(r.out) === 1 && times(journalLines(), ids[0]) === 2, r.out);
  }

  // --------------------------------------------------------------------- notes
  console.log("\nCreating and undoing a note (audit 3, 10, 11)");
  {
    const same = await Promise.all([...Array(6).keys()].map((i) => nodeAsync("capture.mjs", ["--title", "The same news twice", "--type", "note", "--domains", "work", "--no-commit"], { input: `The body written by the capture number ${i}, whole.` })));
    const text = existsSync(noteFile("the-same-news-twice")) ? read(noteFile("the-same-news-twice")) : "";
    check(
      "six captures of the same title at the same moment: one note is created, the five others are refused, and the note is the winner's, whole",
      same.filter((x) => x.ok).length === 1 && same.filter((x) => !x.ok).every((x) => /already exists/.test(x.out)) && (text.match(/The body written by the capture number \d, whole\./g) ?? []).length === 1 && liveLines().filter((e) => e.what === "created" && e.note === "the-same-news-twice").length === 1,
      same.map((x) => x.out.trim()).join(" | "),
    );
    if (process.platform === "win32" || process.platform === "darwin") {
      writeFileSync(join(BRAIN, "vault", "notes", "README.md"), "The folder's own page: keep me.\n", "utf8");
      r = capture("Readme", "A note whose name is the folder's page on a disk that ignores case.");
      check("a note never takes the place of a file its list of names does not know (README.md, on a disk that ignores case)", !r.ok && /already exists/.test(r.out) && read(join(BRAIN, "vault", "notes", "README.md")) === "The folder's own page: keep me.\n", r.out);
      rmSync(join(BRAIN, "vault", "notes", "README.md"), { force: true });
    }

    // An undo of a rewrite, after a fact added another day.
    capture("Undo across days", "The first paragraph, as it was.\n\nThe second paragraph, which does not move.\n\nThe third paragraph, which does not move either.");
    const slug = "undo-across-days";
    const bodyFile = join(BASE, "body.md");
    writeFileSync(bodyFile, "The first paragraph, rewritten by the review.\n\nThe second paragraph, which does not move.\n\nThe third paragraph, which does not move either.\n", "utf8");
    r = node("rewrite.mjs", ["--note", slug, "--file", bodyFile, "--why", "agreed in the zone"]);
    const rewriteId = json(r.out).event;
    // The rewrite was three days ago, the note before it five days ago.
    const keptFile = join(HB, "undo", `${rewriteId}.json`);
    const kept = readJ(keptFile);
    writeFileSync(keptFile, JSON.stringify({ ...kept, before: kept.before.replace(/^updated: .*$/m, `updated: ${day(5)}`), after: kept.after.replace(/^updated: .*$/m, `updated: ${day(3)}`) }), "utf8");
    writeFileSync(noteFile(slug), read(noteFile(slug)).replace(/^updated: .*$/m, `updated: ${day(3)}`), "utf8");
    const fact = node("fact.mjs", ["--note", slug, "--text", "A fact that came two days after the rewrite, from the mail of the eighth.", "--from", "test://mail/8"]);
    r = node("undo.mjs", [rewriteId]);
    let now = read(noteFile(slug));
    check(
      "a rewrite is undone although a fact was added to the note another day: the first paragraph is back, the fact stays, the date is today's",
      fact.ok && r.ok && now.includes("The first paragraph, as it was.") && !now.includes("rewritten by the review") && now.includes("A fact that came two days after") && new RegExp(`^updated: ${day()}$`, "m").test(now),
      r.out + now,
    );

    // A judge's seed, never saved, undone.
    r = capture("A seed nobody saved", "What a judge wrote a minute ago, and no save has seen.", [], { env: { HVBRAIN_WHO: "ai:zone" } });
    const seedId = lastWrite("created", "a-seed-nobody-saved");
    r = node("undo.mjs", [seedId]);
    const undone = r.ok ? json(r.out) : {};
    check("undoing the creation of a note git never saw keeps its text on this computer", r.ok && !existsSync(noteFile("a-seed-nobody-saved")) && existsSync(undone.kept ?? "") && readJ(undone.kept).text.includes("What a judge wrote a minute ago"), r.out);
    capture("A seed retouched by hand", "What a judge wrote, before the person retouched it.", [], { env: { HVBRAIN_WHO: "ai:zone" } });
    const touchedId = lastWrite("created", "a-seed-retouched-by-hand");
    writeFileSync(noteFile("a-seed-retouched-by-hand"), `${read(noteFile("a-seed-retouched-by-hand"))}\nA line the person added by hand, not saved yet.\n`, "utf8");
    r = node("undo.mjs", [touchedId]);
    check("a note retouched by hand since its creation is not removed, even when no save has seen the retouch", !r.ok && /edited by hand/.test(r.out) && existsSync(noteFile("a-seed-retouched-by-hand")), r.out);
    r = node("undo.mjs", [touchedId, "--force"]);
    check("asked plainly it is removed, and the retouch is in what was kept", r.ok && !existsSync(noteFile("a-seed-retouched-by-hand")) && readJ(json(r.out).kept).text.includes("A line the person added by hand"), r.out);
  }

  // ------------------------------------------------------------------- rewrite
  console.log("\nRewriting a note (audit 12)");
  {
    capture("A note with a zone in the middle", "The text above the zone, long enough to be a body.\n\n<!-- figures:auto -->\n12 readers\n<!-- /figures:auto -->\n\nThe text under the zone, which must stay under it.");
    const slug = "a-note-with-a-zone-in-the-middle";
    const under = (x) => x.replace(/\r\n/g, "\n").split("\n---\n").slice(1).join("\n---\n");
    const before = read(noteFile(slug));
    r = node("rewrite.mjs", ["--note", slug, "--title", "A zone in its place", "--why", "a better title"]);
    check("a title alone moves nothing under the front matter: the machine zone stays where it was", r.ok && under(read(noteFile(slug))) === under(before) && /^title: "A zone in its place"$/m.test(read(noteFile(slug))), r.out + read(noteFile(slug)));
    const own = join(BASE, "with-front-matter.md");
    writeFileSync(own, "---\ntitle: \"Another title\"\nstatus: trusted\n---\n\nA body that came with a front matter of its own, long enough to pass.\n", "utf8");
    const held = read(noteFile(slug));
    r = node("rewrite.mjs", ["--note", slug, "--file", own, "--why", "a body with its own front matter"]);
    check("a body that opens with a front matter of its own is refused, and the note is left as it is", !r.ok && /front matter of its own/.test(r.out) && read(noteFile(slug)) === held, r.out);
    // A byte order mark, a closing line followed by a space, and a rule in the body.
    capture("A note written by hand", "The old text that stood before the rule.\n\n---\n\nThe old text that stood after the rule.");
    const hand = "a-note-written-by-hand";
    writeFileSync(noteFile(hand), BOM + read(noteFile(hand)).replace(/\n---\n\nThe old text that stood before/, "\n--- \n\nThe old text that stood before"), "utf8");
    const body = join(BASE, "new-body.md");
    writeFileSync(body, "The new body, which replaces everything the note said before it.\n", "utf8");
    r = node("rewrite.mjs", ["--note", hand, "--file", body, "--why", "rewritten whole"]);
    const now = read(noteFile(hand));
    check("a note with a byte order mark and a closing line followed by a space is rewritten whole: nothing of the old text stays in front", r.ok && now.includes("The new body, which replaces") && !now.includes("The old text that stood") && now.startsWith(BOM), r.out + now);
    r = mod(`import { parseFiche } from ${url("lib.mjs")}; console.log(JSON.stringify(parseFiche(process.argv[1]).fm.title));`, [noteFile(hand)]);
    check("and it is still a note the brain reads", r.ok && json(r.out) === "A note written by hand", r.out);
  }

  // ------------------------------------------------------------------- promote
  console.log("\nValidating a note (promote.mjs)");
  {
    capture("A seed to validate", "What the machine wrote, for the person to validate.\n\nA second paragraph.");
    const slug = "a-seed-to-validate";
    writeFileSync(noteFile(slug), read(noteFile(slug)).replace(/\r?\n/g, "\r\n").replace(/^updated: .*$/m, `updated: ${day(4)}`), "utf8");
    const before = read(noteFile(slug));
    r = node("promote.mjs", ["--note", slug, "--who", "ai"]);
    check("an AI is refused: only the person validates a note", !r.ok && r.status === 1 && json(r.out).ok === false && /only the person/.test(json(r.out).error) && read(noteFile(slug)) === before, r.out);
    r = node("promote.mjs", ["--note", slug], { env: { HVBRAIN_WHO: "ai:documents" } });
    check("a background Claude of the brain is an AI even when it does not say so", !r.ok && /only the person/.test(r.out) && read(noteFile(slug)) === before, r.out);
    r = node("promote.mjs", ["--note", slug]);
    const done = r.ok ? json(r.out) : {};
    const after = read(noteFile(slug));
    const changed = before.split("\r\n").map((l, i) => [l, after.split("\r\n")[i]]).filter(([a, b]) => a !== b);
    check(
      "the person validates a note: one line of JSON, only the status and the date change, the line endings stay",
      r.ok && r.out.trim().split("\n").length === 1 && done.ok === true && done.note === slug && done.status === "trusted" && Boolean(done.event) && changed.length === 2 && changed.some(([, b]) => b === "status: trusted") && changed.some(([, b]) => b === `updated: ${day()}`) && !/[^\r]\n/.test(after),
      r.out + JSON.stringify(changed),
    );
    const event = liveLines().find((e) => e.id === done.event) ?? {};
    check("the validation is in the brain's journal, with who made it", event.act === "write" && event.what === "validated" && event.who === "person" && event.note === slug, JSON.stringify(event));
    r = node("promote.mjs", ["--note", slug, "--to", "trusted"]);
    check("already validated: said, nothing written", r.ok && json(r.out).unchanged === true && json(r.out).status === "trusted" && read(noteFile(slug)) === after, r.out);
    r = node("undo.mjs", [done.event]);
    check("a validation is taken back like any other write: the note is a seed again, as it was", r.ok && read(noteFile(slug)) === before, r.out + read(noteFile(slug)));
    node("promote.mjs", ["--note", slug]);
    r = node("promote.mjs", ["--note", slug, "--to", "seed", "--who", "ai"]);
    check("a note is sent back to seed, by the person or by an AI", r.ok && json(r.out).status === "seed" && /^status: seed\r$/m.test(read(noteFile(slug))) && liveLines().at(-1).what === "unvalidated", r.out);
    r = node("promote.mjs", ["--note", "a-note-that-does-not-exist"]);
    check("a note that does not exist is an error said in JSON, with the exit code 1", !r.ok && r.status === 1 && json(r.out).ok === false && /no note named/.test(json(r.out).error), r.out);
    writeFileSync(noteFile(slug), read(noteFile(slug)).replace(/^status: seed(?=\r?$)/m, "status: archived"), "utf8");
    r = node("promote.mjs", ["--note", slug]);
    check("an archived note is not validated here", !r.ok && /archived/.test(json(r.out).error), r.out);
    r = node("promote.mjs", ["--note", slug, "--to", "published"]);
    check("a state that is not one is refused", !r.ok && json(r.out).ok === false, r.out);
    // Several notes at once: each its own write in the journal, undone alone.
    capture("A second seed", "Another text the machine wrote, for the person to validate.");
    capture("A third seed", "A third text the machine wrote, for the person to validate.");
    node("promote.mjs", ["--note", "a-third-seed"]);
    const second = read(noteFile("a-second-seed"));
    r = node("promote.mjs", ["--notes", "a-second-seed,a-third-seed,a-note-that-does-not-exist,a-seed-to-validate"]);
    const batch = r.ok ? json(r.out) : {};
    check(
      "several notes at once: one line of JSON, what was done, what was already so, what was refused and why",
      r.ok && r.out.trim().split("\n").length === 1 && batch.ok === true && JSON.stringify(batch.done?.map((d) => d.note)) === JSON.stringify(["a-second-seed"]) && JSON.stringify(batch.unchanged) === JSON.stringify(["a-third-seed"]) && batch.refused?.length === 2 && batch.refused.every((x) => x.note && x.error),
      r.out,
    );
    r = node("undo.mjs", [batch.done?.[0]?.event ?? "none"]);
    check("each note of a batch is a write of its own, undone alone", r.ok && read(noteFile("a-second-seed")) === second && /^status: trusted$/m.test(read(noteFile("a-third-seed"))), r.out);
    r = node("promote.mjs", ["--notes", "a-second-seed", "--who", "ai"]);
    check("a batch is refused to an AI as a whole", !r.ok && json(r.out).ok === false && /only the person/.test(json(r.out).error) && read(noteFile("a-second-seed")) === second, r.out);
    // (The archived note is set back, so that the saves further on are not stopped by it.)
    writeFileSync(noteFile(slug), read(noteFile(slug)).replace(/^status: archived/m, "status: seed"), "utf8");
  }

  // --------------------------------------------------------------- notes, units
  console.log("\nWhat a note may hold (audit 7 and the notes at the end)");
  {
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = read(brainJson);
    writeFileSync(brainJson, JSON.stringify({ ...JSON.parse(keptBrain), neverWrite: ["§"], data: { tool: {} } }, null, 2), "utf8");
    capture("A note for a zone", "A note a source keeps a figure in, long enough to be a body.");
    r = mod(`import { config } from ${url("lib.mjs")}; import { createNote, writeZone } from ${url("notes.mjs")}; const out = {}; try { writeZone("a-note-for-a-zone", "figures", "A title with the sign § in it", config()); out.zone = "written"; } catch (e) { out.zone = e.message; } try { createNote({ title: "A record with a field", type: "note", domains: ["work"], body: "A record a source wrote.", fields: { headline: "A headline with the sign § in it" } }, config()); out.field = "written"; } catch (e) { out.field = e.message; } try { const c = createNote({ title: "A record with a clean field", type: "note", domains: ["work"], body: "A record a source wrote.", source: "files://a/name with § in it.docx", fields: { headline: "A clean headline" } }, config()); out.clean = c.slug; } catch (e) { out.clean = "refused: " + e.message; } console.log(JSON.stringify(out));`);
    const said = r.ok ? json(r.out) : {};
    check("what a brain never writes is refused in a machine zone and in a field a source adds", /never writes/.test(said.zone ?? "") && /never writes/.test(said.field ?? "") && !read(noteFile("a-note-for-a-zone")).includes("§"), r.out);
    check("but not in an address: a source is named as it is named where it lives", said.clean === "a-record-with-a-clean-field", r.out);
    r = mod(`import { config, parseFiche } from ${url("lib.mjs")}; import { createNote } from ${url("notes.mjs")}; const c = createNote({ title: "A note that routes to data", type: "note", domains: ["work"], body: "A note that says where its data lives.", data: ["tool://clients/o'brien,ltd", "tool://clients/plain"] }, config()); console.log(JSON.stringify(parseFiche(process.argv[1] + "/" + c.rel).fm.data));`, [BRAIN]);
    check("two addresses of data, one with a comma and an apostrophe, are read back as two", r.ok && JSON.stringify(json(r.out)) === JSON.stringify(["tool://clients/o'brien,ltd", "tool://clients/plain"]), r.out);
    writeFileSync(brainJson, keptBrain, "utf8");
    r = mod(`import { nearTwin } from ${url("notes.mjs")}; const note = "---\\ntitle: x\\n---\\n\\nThe shop opens again next Monday morning.\\n"; console.log(JSON.stringify({ longer: nearTwin("The shop opens again next Monday morning, and the client signed the contract for three years with a first payment in January.", note), same: nearTwin("Next Monday morning the shop opens again.", note) }));`);
    check("a longer fact that takes up a short paragraph and brings something new is not refused as its twin; the same fact said again still is", r.ok && json(r.out).longer === null && typeof json(r.out).same === "string", r.out);
    capture("A note with a twin", "The shop opens again next Monday morning after the works.");
    r = node("fact.mjs", ["--note", "a-note-with-a-twin", "--text", "After the works the shop opens again next Monday morning.", "--from", "test://mail/9"]);
    const refusal = liveLines().filter((e) => e.what === "refused").at(-1) ?? {};
    check("a fact refused as a near twin keeps its text in the journal", !r.ok && /nearly the same/.test(r.out) && refusal.text === "After the works the shop opens again next Monday morning.", r.out + JSON.stringify(refusal));
  }

  // -------------------------------------------------------------------- ledger
  console.log("\nThe ledgers (audit 6)");
  {
    const folder = join(BASE, "chapters");
    mkdirSync(folder, { recursive: true });
    for (const n of [1, 2, 3]) writeFileSync(join(folder, `Chapitre #${n}.txt`), `The text of chapter ${n}.`, "utf8");
    r = node("ledger.mjs", ["open", "chapters", "--from", folder]);
    const opened = json(r.out);
    const items = json(node("ledger.mjs", ["next", "chapters"]).out).next;
    capture("The first chapter", "What the first chapter says.", ["--source", items[0].ref]);
    let l = json(node("ledger.mjs", ["next", "chapters"]).out);
    check("files whose names differ after a # are different items: a note that names the first one leaves the two others to do", opened.counted === 3 && l.notes === 1 && l.left === 2 && l.next.map((i) => i.n).join() === "2,3", JSON.stringify(l));
    r = node("ledger.mjs", ["done", "chapters", items[2].ref, "--note", "the-first-chapter"]);
    const kept = readJ(join(BRAIN, "sources", "_ingest", "chapters.json"));
    check("an item named by its reference is the one marked, not the first that looks like it", r.ok && kept.items[2].state === "note" && kept.items[1].state === "todo", JSON.stringify(kept.items));
    writeFileSync(join(folder, "Chapitre #4.txt"), "The text of chapter 4.", "utf8");
    r = node("ledger.mjs", ["open", "chapters", "--from", folder]);
    check("and a new one is added when the source is taken up again", r.ok && json(r.out).added === 1 && json(r.out).counted === 4, r.out);
    const list = join(BASE, "list.txt");
    writeFileSync(list, [...Array(8).keys()].map((i) => `https://example.invalid/article-${i}#top`).join("\n"), "utf8");
    node("ledger.mjs", ["open", "articles", "--list", list]);
    const eight = await Promise.all([...Array(8).keys()].map((i) => nodeAsync("ledger.mjs", ["skip", "articles", String(i + 1), "--why", `reason number ${i}`])));
    l = json(node("ledger.mjs", ["next", "articles"]).out);
    check("eight readers that each set an item aside at the same moment: the eight are kept", eight.every((x) => x.ok) && l.skipped === 8 && l.left === 0, JSON.stringify(l) + eight.map((x) => x.err).join(""));
    capture("An article by its address", "What the article says.", ["--source", "https://example.invalid/article-3"]);
    node("ledger.mjs", ["open", "web", "--list", list]);
    l = json(node("ledger.mjs", ["next", "web"]).out);
    check("the fragment of a web address still names the same page", l.notes === 1 && l.left === 7, JSON.stringify(l));
    const file = join(BRAIN, "sources", "_ingest", "web.json");
    writeFileSync(file, "{ a ledger cut in the middle", "utf8");
    r = node("ledger.mjs", ["open", "web", "--list", list]);
    check("a ledger that is there and cannot be read is not started again over itself", !r.ok && /cannot be read/.test(r.out) && read(file) === "{ a ledger cut in the middle", r.out);
    rmSync(file, { force: true });
    // A note that cannot be read for a moment does not send its item back to do.
    const chapter = noteFile("the-first-chapter");
    const good = read(chapter);
    writeFileSync(chapter, good.replace("---\n", "---\nthis line is not front matter\n"), "utf8");
    l = json(node("ledger.mjs", ["next", "chapters"]).out);
    writeFileSync(chapter, good, "utf8");
    check("a note that cannot be read for a moment keeps its items", l.notes === 2 && readJ(join(BRAIN, "sources", "_ingest", "chapters.json")).items[2].note === "the-first-chapter", JSON.stringify(l));
  }

  // -------------------------------------------------------------------- memory
  console.log("\nThe memory of the AI (audit 4, 5 and the notes at the end)");
  {
    const mem = (...a) => node("memory.mjs", a);
    const projects = join(HOME, ".claude", "projects");
    const settings = join(HOME, ".claude", "settings.json");
    const put = (rel, text) => {
      mkdirSync(dirname(join(projects, rel)), { recursive: true });
      writeFileSync(join(projects, rel), text, "utf8");
    };
    const memoryBlock = () => json(node("start.mjs", ["state"]).out).session.blocks.find((b) => b.id === "memory") ?? {};
    put("p1/memory/MEMORY.md", "- [A](a.md)\n- [B](b.md)\n");
    put("p1/memory/a.md", "The first thing the AI learnt.\n");
    put("p1/memory/b.md", "The second thing the AI learnt.\n");
    put("p2/memory/c.md", "A third thing, in another project.\n");
    mem("backup");
    // A run cut short after two moves: the plan was written, two files moved, no ledger opened.
    const today = day();
    const plan = { day: today, at: new Date().toISOString(), files: ["p1/memory/MEMORY.md", "p1/memory/a.md", "p1/memory/b.md", "p2/memory/c.md"].map((rel) => ({ project: rel.split("/")[0], from: join(projects, rel), to: join(projects, rel.replace("/memory/", `/memory-archive-${today}/`)), bytes: 30 })) };
    writeFileSync(join(HB, "memory-archive-plan.json"), JSON.stringify(plan), "utf8");
    for (const f of plan.files.slice(1, 3)) {
      mkdirSync(dirname(f.to), { recursive: true });
      renameSync(f.from, f.to);
    }
    check("a run of the archive that was cut short is seen: the state says so, and the block of the start is to do, never done", json(mem("state").out).pending === true && memoryBlock().state === "todo" && memoryBlock().pending === true, JSON.stringify(memoryBlock()));
    r = mem("archive");
    const archived = json(r.out);
    const inLedgers = json(node("ledger.mjs", ["state"]).out).ledgers.filter((x) => x.name.startsWith("memory-"));
    const refs = inLedgers.flatMap((x) => json(node("ledger.mjs", ["next", x.name, "--n", "20"]).out).next.map((i) => fwd(i.path)));
    check(
      "run again, it finishes: the files moved before the cut are in a ledger with the others, and nothing is listed twice",
      r.ok && archived.resumed === true && plan.files.every((f) => refs.filter((p) => p === fwd(f.to)).length === 1) && refs.length === 4 && !existsSync(join(HB, "memory-archive-plan.json")) && json(mem("state").out).pending === undefined,
      r.out + JSON.stringify(refs),
    );
    // The page the plugin left, with a line the AI added under it.
    const page = join(projects, "p1", "memory", "MEMORY.md");
    const pure = read(page);
    check("the page the plugin leaves is not a memory", pure.includes("hypervibe-brain:memory") && json(mem("find").out).files === 0);
    writeFileSync(page, `${pure}\n- The person prefers short answers (learnt today).\n`, "utf8");
    check("with a line the AI added under it, it is a file of the memory again: counted, so backed up and brought in", json(mem("find").out).files === 1 && memoryBlock().state === "todo", JSON.stringify(memoryBlock()));
    writeFileSync(page, pure, "utf8");
    // A second pass on one new file, then the archives are lost.
    put("p1/memory/d.md", "A fourth thing, learnt after the first pass.\n");
    mem("backup");
    r = mem("archive");
    for (const p of ["p1", "p2"]) for (const n of readdirSync(join(projects, p)).filter((x) => x.startsWith("memory-archive-"))) rmSync(join(projects, p, n), { recursive: true, force: true });
    r = mem("restore", "--backup");
    const back = json(r.out);
    check(
      "restored from the backups, every file comes back, not only those of the last backup",
      r.ok && back.restored === 5 && read(join(projects, "p1", "memory", "a.md")).includes("first thing") && read(join(projects, "p2", "memory", "c.md")).includes("third thing") && read(join(projects, "p1", "memory", "d.md")).includes("fourth thing") && read(page).includes("[A](a.md)"),
      r.out,
    );
    // Lifting the lock when Claude Code's settings cannot be read.
    writeFileSync(settings, JSON.stringify({ theme: "dark" }, null, 2), "utf8");
    r = mem("lock", "on");
    const locked = r.ok && readJ(settings).autoMemoryEnabled === false && readJ(CONFIG).memory.lock === true;
    writeFileSync(settings, "{ \"theme\": \"dark\", ", "utf8");
    r = mem("restore");
    const lifted = json(r.out);
    const hook = run("node", [join(SCRIPTS, "hook-memory.mjs")], { input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: join(projects, "p1", "memory", "new.md") } }) });
    check(
      "a restore that could not give Claude Code's setting back says so, and still lifts the plugin's own guard",
      locked && !r.ok && lifted.ok === false && lifted.lock === false && /autoMemoryEnabled/.test(lifted.error) && readJ(CONFIG).memory.lock === false && hook.out.trim() === "" && read(settings) === "{ \"theme\": \"dark\", ",
      r.out + hook.out,
    );
    writeFileSync(settings, JSON.stringify({ theme: "dark", autoMemoryEnabled: false }, null, 2), "utf8");
    r = mem("lock", "off");
    check("the settings repaired, lifting again gives the setting back as it was", r.ok && !Object.hasOwn(readJ(settings), "autoMemoryEnabled") && readJ(settings).theme === "dark" && readJ(CONFIG).memory.autoMemoryOwed === undefined, r.out + read(settings));
  }

  // --------------------------------------------------------------- rules block
  console.log("\nThe block of rules in the global instructions (a note at the end of the audit)");
  {
    const file = join(BASE, "CLAUDE-of-the-zone.md");
    writeFileSync(file, "# My own rules\n\nRule A, written by the person.\n", "utf8");
    const block = () => node("rules-block.mjs", ["--file", file, "--lang", "en"]);
    block();
    writeFileSync(file, `${read(file)}\n## Written after the block\n\nRule B, written by the person.\n`, "utf8");
    writeFileSync(file, read(file).replace("<!-- /hypervibe-brain:rules -->\n", ""), "utf8");
    block();
    r = block();
    const text = read(file);
    check(
      "a block whose closing mark is gone never takes the person's own rules with it",
      r.ok && text.includes("Rule A, written by the person.") && text.includes("Rule B, written by the person.") && text.split("<!-- hypervibe-brain:rules -->").length === 2 && text.split("<!-- /hypervibe-brain:rules -->").length === 2 && text.split("## The brain's rules").length === 2,
      text,
    );
  }

  // ---------------------------------------------------------------------- save
  console.log("\nThe save (audit 8 and 13)");
  {
    node("save.mjs", ["--now"]);
    node("capture.mjs", ["--title", "A note in conflict", "--type", "note", "--domains", "work"], { input: "The line both sides will change.\n\nA line nobody changes." });
    const slug = "a-note-in-conflict";
    const rel = `vault/notes/${slug}.md`;
    const change = (to) => writeFileSync(noteFile(slug), read(noteFile(slug)).replace(/^The line .*$/m, to), "utf8");
    node("save.mjs", ["--now"]);
    git("checkout", "-q", "-b", "other");
    change("The line as the other side wrote it.");
    git("commit", "-q", "-m", "the other side", "--", rel);
    git("checkout", "-q", "main");
    change("The line as this side wrote it.");
    git("commit", "-q", "-m", "this side", "--", rel);
    const merged = git("merge", "other");
    const head = git("rev-parse", "HEAD").out.trim();
    r = node("save.mjs", ["--now"]);
    check(
      "a merge left half done: the save stands aside and says so, and no conflict marker is committed",
      !merged.ok && read(noteFile(slug)).includes("<<<<<<<") && !r.ok && /half done/.test(r.out) && git("rev-parse", "HEAD").out.trim() === head && git("ls-files", "-u").out.trim() !== "",
      r.out,
    );
    git("merge", "--abort");
    // A stash given back by hand that met a change: unmerged, without a merge in progress.
    change("The line as a session was writing it.");
    git("stash", "push", "-q", "--", rel);
    change("The line as a save committed it meanwhile.");
    git("commit", "-q", "-m", "committed meanwhile", "--", rel);
    const popped = git("stash", "pop");
    r = node("save.mjs", ["--now"]);
    check(
      "a file left unmerged by a stash given back by hand is never saved as it is, and is not marked as solved",
      !popped.ok && read(noteFile(slug)).includes("<<<<<<<") && !r.ok && /in conflict/.test(r.out) && git("ls-files", "-u").out.trim() !== "" && !git("show", `HEAD:${rel}`).out.includes("<<<<<<<"),
      r.out,
    );
    git("checkout", "-q", "--theirs", "--", rel);
    git("add", "--", rel);
    git("stash", "drop", "-q");
    // Files whose names read as patterns.
    mkdirSync(join(BRAIN, "sources", "zone"), { recursive: true });
    writeFileSync(join(BRAIN, "sources", "zone", "a[1].txt"), "named with brackets\n", "utf8");
    writeFileSync(join(BRAIN, "sources", "zone", "a1.txt"), "named without\n", "utf8");
    r = node("save.mjs", ["--now"]);
    check("a file whose name reads as a pattern is saved as the file it is", r.ok && git("status", "--porcelain", "--", "sources/zone").out.trim() === "" && git("ls-files", "sources/zone").out.includes("a[1].txt"), r.out + git("status", "--porcelain").out);
    // A file being written beside its place by another program.
    writeFileSync(join(BRAIN, "sources", "zone", "state.json.4242.tmp"), "half", "utf8");
    writeFileSync(join(BRAIN, "sources", "zone", "state.json"), "{}\n", "utf8");
    r = node("save.mjs", ["--now"]);
    check("a file being written beside its place is not taken for a file to save", r.ok && !git("ls-files", "sources/zone").out.includes(".tmp") && git("ls-files", "sources/zone").out.includes("state.json"), r.out);
    rmSync(join(BRAIN, "sources", "zone", "state.json.4242.tmp"), { force: true });
    // A note deleted is saved as deleted (the paths are names, not patterns).
    rmSync(noteFile("the-same-news-twice"), { force: true });
    r = node("save.mjs", ["--now"]);
    check("a note removed is saved as removed", r.ok && !git("ls-files", "vault/notes").out.includes("the-same-news-twice"), r.out);

    // What this brain never writes, in a note, and a commit hook of its own that refuses it.
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = read(brainJson);
    writeFileSync(brainJson, JSON.stringify({ ...JSON.parse(keptBrain), neverWrite: ["§"] }, null, 2), "utf8");
    const hookFile = join(BRAIN, ".git", "hooks", "pre-commit");
    writeFileSync(hookFile, "#!/bin/sh\nif git diff --cached --name-only -z -- vault | xargs -0 grep -l '§' -- 2>/dev/null | grep -q .; then echo 'refused: a forbidden sign'; exit 1; fi\nexit 0\n", { encoding: "utf8", mode: 0o755 });
    capture("A note the hook lets pass", "A text this brain can write.");
    capture("A note the hook refuses", "A text this brain can write, for now.");
    writeFileSync(noteFile("a-note-the-hook-refuses"), `${read(noteFile("a-note-the-hook-refuses"))}\nA line added by hand with the sign § in it.\n`, "utf8");
    r = node("save.mjs", ["--now"]);
    const tracked = git("ls-tree", "-r", "--name-only", "HEAD", "--", "vault/notes").out;
    check(
      "a note that holds what the brain never writes no longer stops every save: it is set aside and named, the rest is saved",
      !r.ok && /never writes/.test(r.out) && /a-note-the-hook-refuses/.test(r.out) && /saved: /.test(r.out) && tracked.includes("a-note-the-hook-lets-pass") && !tracked.includes("a-note-the-hook-refuses"),
      r.out,
    );
    rmSync(hookFile, { force: true });
    rmSync(noteFile("a-note-the-hook-refuses"), { force: true });
    writeFileSync(brainJson, keptBrain, "utf8");
    git("reset", "-q");
    node("save.mjs", ["--now"]);

    // A brain that is not a repository, and a git that cannot answer.
    const home2 = join(BASE, "home-no-git");
    const brain2 = join(BASE, "brain-no-git");
    const two = { env: { HVBRAIN_HOME: home2 } };
    node("init.mjs", ["--dir", brain2, "--name", "Other", "--domains", "work,writing", "--lang", "en", "--no-git", "--switch"], two);
    r = node("save.mjs", ["--now"], two);
    check("a brain that is not a git repository has nothing to save, and that is not a failure", r.ok && /not a git repository/.test(r.out), r.out);
    writeFileSync(join(brain2, ".git"), "this is not what git expects here\n", "utf8");
    r = node("save.mjs", ["--now"], two);
    check("a git that cannot answer is a save that failed, said, not \"nothing to save\"", !r.ok && /git could not be run/.test(r.out), r.out);
    r = node("capture.mjs", ["--title", "A note while git fails", "--type", "note", "--domains", "work"], { input: "A note written while git cannot answer.", ...two });
    check("and a capture says the note was not committed", r.ok && /not committed \(git could not be run/.test(r.out) && existsSync(join(brain2, "vault", "notes", "a-note-while-git-fails.md")), r.out);
  }

  // ---------------------------------------------------------------------- sync
  console.log("\nThe lock of the synchronisation (audit 14)");
  {
    mod(`import { setUserConfig } from ${url("lib.mjs")}; setUserConfig({ sync: true });`);
    const lock = join(BRAIN, "index", "sync.lock");
    mkdirSync(dirname(lock), { recursive: true });
    const sync = () => json(node("sync.mjs", ["--json"]).out);
    writeFileSync(lock, String(process.pid), "utf8");
    let s = sync();
    check("a synchronisation that is running makes the next one wait", s.result === "busy" && existsSync(lock), JSON.stringify(s));
    const longAgo = new Date(Date.now() - 45 * 60_000);
    utimesSync(lock, longAgo, longAgo);
    s = sync();
    check("a lock older than any pass can last is taken over, whoever bears its number now", s.result !== "busy" && !existsSync(lock), JSON.stringify(s));
    writeFileSync(lock, "", "utf8");
    s = sync();
    check("a lock that holds no number is taken over too", s.result !== "busy" && !existsSync(lock), JSON.stringify(s));
    // Busy at every pass for a day: said once.
    const stateFile = readdirSync(HB).find((n) => /^sync-[0-9a-f]+\.json$/.test(n));
    const kept = readJ(join(HB, stateFile ?? "none"), {});
    writeFileSync(join(HB, stateFile ?? "sync-none.json"), JSON.stringify({ ...kept, busySince: new Date(Date.now() - 26 * 3600_000).toISOString() }), "utf8");
    writeFileSync(lock, String(process.pid), "utf8");
    const first = sync();
    const second = sync();
    rmSync(lock, { force: true });
    check("a synchronisation busy at every pass for a day says so, once a day", Boolean(stateFile) && first.result === "busy" && first.alerts.some((x) => /has not run for a day/.test(x)) && second.result === "busy" && !second.alerts.some((x) => /has not run for a day/.test(x)), JSON.stringify([first, second]));
    mod(`import { setUserConfig } from ${url("lib.mjs")}; setUserConfig({ sync: false });`);
  }

  // ----------------------------------------------------------------- cold copy
  console.log("\nThe cold copy (audit 9)");
  {
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = read(brainJson);
    const cold = join(BASE, "cold");
    mkdirSync(cold, { recursive: true });
    const others = [...Array(9).keys()].map((i) => `brain-camille-entreprise-2026-01-0${i + 1}.bundle`);
    for (const n of others) writeFileSync(join(cold, n), "another brain's archive", "utf8");
    const setDir = (d) => writeFileSync(brainJson, JSON.stringify({ ...JSON.parse(keptBrain), components: { ...(JSON.parse(keptBrain).components ?? {}), coldCopy: { dir: d } } }, null, 2), "utf8");
    setDir(fwd(cold));
    r = node("cold-copy.mjs");
    const made = r.ok ? json(r.out) : {};
    check(
      "two brains whose names start alike share a folder: this one's archive is kept, and the other one's are neither counted nor removed",
      r.ok && made.ok === true && made.removed === 0 && existsSync(made.archive ?? "") && others.every((n) => existsSync(join(cold, n))),
      r.out,
    );
    // Another brain of the same name.
    const cold2 = join(BASE, "cold-same-name");
    const stranger = join(BASE, "stranger");
    mkdirSync(cold2, { recursive: true });
    mkdirSync(stranger, { recursive: true });
    run("git", ["init", "-q"], { cwd: stranger });
    writeFileSync(join(stranger, "x.txt"), "another brain\n", "utf8");
    run("git", ["add", "x.txt"], { cwd: stranger });
    run("git", ["commit", "-q", "-m", "another brain"], { cwd: stranger });
    run("git", ["bundle", "create", join(cold2, `brain-camille-${day()}.bundle`), "--all"], { cwd: stranger });
    setDir(fwd(cold2));
    r = node("cold-copy.mjs");
    check("the archive of another brain of the same name is not taken for this one's: the copy stops, and says so", !r.ok && /another brain/.test(r.out) && readdirSync(cold2).length === 1, r.out);
    writeFileSync(brainJson, keptBrain, "utf8");
  }

  // --------------------------------------------------------------------- start
  console.log("\nThe start (audit of the skills, 14, 15 and 18)");
  {
    const brainJson = join(BRAIN, "brain.json");
    const keptBrain = read(brainJson);
    const start = (...a) => node("start.mjs", a);
    const st = () => json(start("state").out);
    const step = (s, id) => s.steps.find((x) => x.id === id) ?? {};
    const block = (s, id) => s.session.blocks.find((x) => x.id === id) ?? {};
    const setBrain = (patch) => writeFileSync(brainJson, `${JSON.stringify({ ...JSON.parse(keptBrain), stage: 6, ...patch }, null, 2)}\n`, "utf8");
    setBrain({});
    // (2026-11-23) The live view comes with the brain, in the part before the tools.
    start("mark", "view", "done");
    r = node("sources.mjs", ["install", "conversations"]);
    let s = st();
    check("with a judge installed and no token, the token is the step to do, in the part of the tools", r.ok && step(s, "token").state === "todo" && s.next === "token" && s.part === "tools", r.out + JSON.stringify(s.steps));
    r = start("mark", "token", "done");
    check("the token cannot be SAID done: it is read from the facts", !r.ok && /read from the facts/.test(r.out) && st().next === "token", r.out);
    r = start("mark", "token", "later", "--note", "the person creates it tomorrow");
    s = st();
    check("kept for later, the token no longer holds the start back", r.ok && step(s, "token").state === "later" && step(s, "token").note === "the person creates it tomorrow" && s.next !== "token" && s.part !== "tools", JSON.stringify(s.steps));
    start("mark", "cap", "done");
    start("mark", "alert", "declined");
    r = start("mark", "routines", "later");
    start("mark", "view", "declined");
    s = st();
    check("the routines can be kept for later too, and phase 1 ends with nothing left to do", r.ok && step(s, "routines").state === "later" && s.phase === 2 && !s.steps.some((x) => x.state === "todo"), JSON.stringify(s.steps));
    for (const b of ["writings", "memory", "conversations", "contacts"]) start("mark", b, b === "writings" ? "done" : "never");
    s = st();
    check("once no block is left, a step kept for later comes back: the start is not said done while it waits", s.phase === 2 && s.next === "token" && s.session.finished === true, JSON.stringify({ phase: s.phase, next: s.next, blocks: s.session.blocks.map((b) => `${b.id}:${b.state}`) }));
    start("page");
    check("the page shows a step kept for later as the one to do now, and does not count its part as done", /class="now-row"/.test(read(join(HB, "start.html"))) && read(join(HB, "start.html")).includes("5 of 7"), read(join(HB, "start.html")).slice(0, 300));
    start("mark", "token", "declined");
    r = start("mark", "routines", "declined");
    s = st();
    check("declined, both let the start end", r.ok && step(s, "token").state === "declined" && step(s, "routines").state === "declined" && s.phase === "done" && s.next === null, JSON.stringify({ phase: s.phase, next: s.next }));
    // A computer that does not run the brain.
    for (const id of ["token", "cap", "routines", "conversations", "contacts"]) start("mark", id, "todo");
    setBrain({ runner: "another-computer" });
    s = st();
    check(
      "on a computer that does not run the brain, what only the runner does does not apply: the token, the cap, the blocks a judge reads",
      s.runner === false && step(s, "token").state === "na" && step(s, "cap").state === "na" && block(s, "conversations").state === "na" && block(s, "contacts").state === "na" && s.next === "routines" && step(s, "live").state === "done",
      JSON.stringify(s),
    );
    mod(`import { setUserConfig, userConfig } from ${url("lib.mjs")}; setUserConfig({ routines: { ...(userConfig().routines ?? {}), save: { time: "21:00", task: "zone", armed: new Date().toISOString() } } });`);
    s = st();
    check("and its evening save is the whole of its routines: the background program is the runner's", step(s, "routines").state === "done" && step(s, "routines").hub === false && s.phase !== 1, JSON.stringify(s.steps));
    writeFileSync(brainJson, keptBrain, "utf8");
  }
} catch (e) {
  failures++;
  console.log(`  FAIL  the checks stopped: ${e.stack ?? e}`);
} finally {
  if (!process.argv.includes("--keep")) rmSync(BASE, { recursive: true, force: true });
}

console.log(`\n${total - failures} ok, ${failures} FAIL (of ${total})${process.argv.includes("--keep") ? `, kept in ${BASE}` : ""}\n`);
process.exit(failures ? 1 : 0);
