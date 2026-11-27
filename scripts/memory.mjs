#!/usr/bin/env node
// memory.mjs - The memory of the person's AI comes into the brain (2026-11-20).
//
// Claude Code keeps a memory of its own: files it writes by itself, one folder
// per working folder (~/.claude/projects/<project>/memory/, with an index,
// MEMORY.md). What it learnt of the person, of their projects, of their
// decisions and of its own mistakes lives there, out of the brain: another AI
// plugged into the brain tomorrow would know none of it. The first big
// session brings it in, like a writing, and from then on the AI writes what it
// learns in the brain.
//
//   node scripts/memory.mjs find                what is there: per project, files and size, with an estimate
//   node scripts/memory.mjs backup              a whole copy, checked file by file, before anything moves
//   node scripts/memory.mjs archive             the files leave for memory-archive-<day>/ beside, a page says
//                                               where the memory lives now, and ledgers list every file
//   node scripts/memory.mjs state               found, backed up, the ledgers and what they still hold, the lock
//   node scripts/memory.mjs lock on|off         the AI stops (or starts again) writing in its own memory
//   node scripts/memory.mjs restore [--backup]  everything back where it was (from the archives, or from the backup)
//   (`lock off` and `restore` lift the lock: the person runs them, in a terminal of their own)
//
// NOTHING IS LOST, AND IT IS A PROGRAM THAT SAYS SO.
//   backup   copies every file of every memory folder into this computer's
//            settings (~/.hypervibe-brain/memory-backup/<moment>/), reads each
//            copy again and compares it with its original. `archive` refuses
//            to move a file that no checked backup holds as it is now.
//   archive  moves, never deletes: the files stay beside, read-only in
//            practice, and each one is the source of the note that takes it in.
//   ledgers  one item per file (ledger.mjs): a file leaves the list when a
//            note of the brain names it as its source, never on a word. Lots
//            of twenty-five at most, a very long file alone, so that several
//            readers can work side by side.
//   restore  puts every file back and lifts the lock.
//
// THE LOCK is three things, set or lifted together: Claude Code's own setting
// (autoMemoryEnabled: false in ~/.claude/settings.json, its former value kept
// to be given back), the plugin's hook that refuses a write into a memory
// folder (hook-memory.mjs, inert until then), and a rule in the plugin's block
// of the global CLAUDE.md (rules-block.mjs) that says where to write instead.

import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { HOME, ROOT, hasBrain, readJsonFile, setUserConfig, today, userConfig, writeFileAtomic, writeJsonAtomic } from "./lib.mjs";
import { brainLang } from "./i18n.mjs";
import { ledgers, listed, open } from "./ledger.mjs";
import { addressOf, ensureRoot } from "./roots.mjs";
import { writeRulesBlock } from "./rules-block.mjs";
import { NOT_THE_PERSON, personAsks } from "./trust.mjs";

/** The mark of the page the plugin leaves in a memory folder: not a memory, a signpost. */
export const POINTER = "<!-- hypervibe-brain:memory -->";
/** The ledgers of a memory all bear this start of name: the start tells them from the writings. */
export const LEDGER = "memory-";
/** The order of size of one file brought in, in tokens (157 files, 2.4 million tokens, 2026-11-20). */
export const PER_FILE = 15_000;
/** The name these folders have on this computer, in the address of each file. */
const ROOT_NAME = "ai-memory";
const LOT = 25;
const GIANT = 100_000;
const ARCHIVE = /^memory-archive-\d{4}-\d{2}-\d{2}$/;
const fwd = (p) => String(p).replace(/\\/g, "/");
const PROJECTS = () => join(HOME, ".claude", "projects");
const BACKUPS = () => join(HOME, ".hypervibe-brain", "memory-backup");
const SETTINGS = () => join(HOME, ".claude", "settings.json");
const sha = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

/** Every file under a folder, as paths relative to it ("/" between names). */
function walk(dir, under = "") {
  let entries = [];
  try {
    entries = readdirSync(join(dir, under), { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = under ? `${under}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(dir, rel));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}
// THE PLUGIN'S PAGE, AND NOTHING ADDED TO IT (2026-11-21). A MEMORY.md was
// taken for the page as soon as it held the mark. With the lock off, the AI
// may write under it: those lines were then neither counted nor backed up,
// written over by the next `archive` and deleted by `restore`. The page is
// the plugin's only while it says exactly what the plugin wrote (the brain's
// place and the day aside): with anything more, it is a file of the memory.
// (The day the text of PAGE changes, the text of before must stay known here.)
const squeeze = (s) => String(s).replace(/\s+/g, " ").trim();
const isPointer = (file) => {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return false;
  }
  if (!text.includes(POINTER)) return false;
  const said = squeeze(text);
  // The page is: a, the brain's place, b, the day, c.
  const [one, two] = [String.fromCharCode(1), String.fromCharCode(2)];
  return Object.values(PAGE).some((page) => {
    const whole = squeeze(page(one, two));
    const [a, b, c] = [whole.slice(0, whole.indexOf(one)), whole.slice(whole.indexOf(one) + 1, whole.indexOf(two)), whole.slice(whole.indexOf(two) + 1)];
    if (!said.startsWith(a) || !said.endsWith(c) || said.length < a.length + b.length + c.length) return false;
    const middle = said.slice(a.length, said.length - c.length);
    const at = middle.indexOf(b);
    return at >= 0 && !middle.slice(0, at).includes("`") && /^\d{4}-\d{2}-\d{2}$/.test(middle.slice(at + b.length));
  });
};
const projectNames = () => {
  try {
    return readdirSync(PROJECTS(), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
};

/**
 * WHAT IS THERE. Every memory folder that holds something of the AI's own: the
 * page the plugin left there is not counted. Reads the names and the sizes,
 * never the text.
 */
export function find() {
  const projects = [];
  for (const project of projectNames()) {
    const dir = join(PROJECTS(), project, "memory");
    const list = walk(dir)
      .filter((rel) => !(rel === "MEMORY.md" && isPointer(join(dir, rel))))
      .map((rel) => ({ rel, bytes: statSync(join(dir, rel)).size }));
    if (list.length) projects.push({ project, folder: fwd(dir), files: list.length, bytes: list.reduce((n, f) => n + f.bytes, 0), list });
  }
  const files = projects.reduce((n, p) => n + p.files, 0);
  // (Claude Code can be told to keep its memory elsewhere: autoMemoryDirectory.
  // That folder is not looked at here; it is named, for the person to decide.)
  let elsewhere = null;
  try {
    elsewhere = JSON.parse(readFileSync(SETTINGS(), "utf8")).autoMemoryDirectory ?? null;
  } catch {
    elsewhere = null;
  }
  return { ok: true, files, bytes: projects.reduce((n, p) => n + p.bytes, 0), perFile: PER_FILE, estimate: files * PER_FILE, projects, ...(elsewhere ? { elsewhere: String(elsewhere) } : {}) };
}

/** The backups made on this computer, the latest last. */
function backups() {
  let names = [];
  try {
    names = readdirSync(BACKUPS()).sort();
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    try {
      const m = JSON.parse(readFileSync(join(BACKUPS(), n, "manifest.json"), "utf8"));
      if (Array.isArray(m.files)) out.push({ folder: join(BACKUPS(), n), at: m.at, files: m.files });
    } catch {
      // a backup cut short has no manifest: it does not count
    }
  }
  return out;
}

/** The files of the memory, as it is now, that no checked backup holds. */
function notBackedUp(found = find()) {
  const held = new Set(backups().flatMap((b) => b.files.map((f) => `${f.project}|${f.rel}|${f.sha256}`)));
  const missing = [];
  for (const p of found.projects) for (const f of p.list) if (!held.has(`${p.project}|${f.rel}|${sha(join(PROJECTS(), p.project, "memory", f.rel))}`)) missing.push(`${p.project}/${f.rel}`);
  return missing;
}

/**
 * THE WHOLE COPY, CHECKED. Each file is copied, its copy read again and
 * compared with its original; the list of what was copied is written last, so
 * a backup cut short is not taken for a whole one.
 */
export function backup() {
  const found = find();
  if (!found.files) return { ok: true, files: 0, nothing: true };
  const at = new Date().toISOString();
  const dest = join(BACKUPS(), at.replace(/[:.]/g, "-").slice(0, 19));
  const files = [];
  for (const p of found.projects) {
    for (const f of p.list) {
      const from = join(PROJECTS(), p.project, "memory", f.rel);
      const to = join(dest, p.project, "memory", f.rel);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
      const original = sha(from);
      if (sha(to) !== original) return { ok: false, error: `the copy of ${p.project}/${f.rel} differs from its original: the backup is not whole, nothing else was touched`, folder: fwd(dest) };
      files.push({ project: p.project, rel: f.rel, bytes: f.bytes, sha256: original });
    }
  }
  writeFileSync(join(dest, "manifest.json"), `${JSON.stringify({ at, files }, null, 1)}\n`, "utf8");
  return { ok: true, folder: fwd(dest), files: files.length, bytes: found.bytes, projects: found.projects.length, verified: true };
}

const PAGE = {
  en: (brain, day) =>
    [
      POINTER,
      "# Memory",
      "",
      `What is known of the person, of their projects, of their decisions and of the lessons learnt lives in their second brain (\`${brain}\`), no longer in this folder. Another AI plugged into the brain finds it all there.`,
      "",
      "- **Before a task**, look in the brain (`brain_search`): what they think, what they decided, and the lessons that apply.",
      "- **What deserves to be remembered** is written in the brain with `/brain:capture`: a rule or a trap learnt is a lesson, a choice of theirs a decision, what a client or a reader said of their work a feedback.",
      `- **The files that were here** are kept as they were in \`memory-archive-${day}/\`, beside this folder. Each is the source of a note of the brain.`,
      "",
      "Nothing is written in this folder any more.",
      "",
    ].join("\n"),
  fr: (brain, day) =>
    [
      POINTER,
      "# Mémoire",
      "",
      `Ce qui est su de la personne, de ses projets, de ses décisions et des leçons apprises vit dans son second brain (\`${brain}\`), plus dans ce dossier. Une autre IA branchée sur le brain y retrouve tout.`,
      "",
      "- **Avant une tâche**, cherche dans le brain (`brain_search`) : ce qu'elle pense, ce qu'elle a décidé, et les leçons qui s'appliquent.",
      "- **Ce qui mérite d'être retenu** s'écrit dans le brain avec `/brain:capture` : une règle ou un piège appris est une leçon, un choix de la personne une décision, ce qu'un client ou un lecteur a dit de son travail un retour.",
      `- **Les fichiers qui étaient ici** sont gardés tels quels dans \`memory-archive-${day}/\`, à côté de ce dossier. Chacun est la source d'une fiche du brain.`,
      "",
      "Plus rien ne s'écrit dans ce dossier.",
      "",
    ].join("\n"),
};

/** A free place for a file in an archive that may already hold one of that name. */
function freePlace(to) {
  if (!existsSync(to)) return to;
  const ext = extname(to);
  for (let i = 2; ; i++) {
    const other = `${to.slice(0, to.length - ext.length)}-${i}${ext}`;
    if (!existsSync(other)) return other;
  }
}

// A PASS CUT SHORT LEAVES NO FILE OUT OF THE LEDGERS (2026-11-21). The files
// were moved one by one, and the ledgers opened only once all had moved, from
// the list the program held in memory: a move refused for an instant (an
// antivirus looking at the file just hashed) or the computer switched off, and
// the files already moved were in no ledger. Run again, the program saw only
// the files left, and the others never came into the brain, while it said that
// everything had. So what is going to move is WRITTEN DOWN first (the plan,
// in this computer's settings); a file moved is listed in a ledger whatever
// happens to the others; and the next run finishes a plan left behind before
// anything else.
const PLAN = () => join(HOME, ".hypervibe-brain", "memory-archive-plan.json");
/** A pass of `archive` that did not reach its end is waiting to be finished. */
export const archivePending = () => existsSync(PLAN());
const moveFile = (from, to) => {
  for (let tries = 0; ; tries++) {
    try {
      return renameSync(from, to);
    } catch (e) {
      if (tries >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
};

/**
 * Carries a plan out: moves what is to move, leaves the page, lists in ledgers
 * every file moved that no ledger lists yet. `resumed`: a plan found from a
 * run before, of which only what had already moved is taken (a file still in
 * its folder may have changed since: it goes through the backup check again).
 * @param {{ day: string, files: { project: string, from: string, to: string, bytes: number }[] }} plan
 */
function carryOut(plan, { resumed = false } = {}) {
  const lang = brainLang(ROOT) === "fr" ? "fr" : "en";
  const moved = [];
  let failed = null;
  for (const f of plan.files) {
    if (existsSync(f.to)) {
      moved.push(f);
      continue;
    }
    if (resumed || failed || !existsSync(f.from)) continue;
    try {
      mkdirSync(dirname(f.to), { recursive: true });
      moveFile(f.from, f.to);
      moved.push(f);
    } catch (e) {
      failed = `${f.project}/${fwd(f.from).split("/memory/").pop()} could not be moved (${e.code ?? e.message})`;
    }
  }
  // The page, where the memory's own index has left (never over a file still there).
  for (const project of new Set(moved.map((f) => f.project))) {
    const page = join(PROJECTS(), project, "memory", "MEMORY.md");
    try {
      if (!existsSync(page) || isPointer(page)) writeFileAtomic(page, PAGE[lang](fwd(ROOT), plan.day));
    } catch {
      // the folder left meanwhile: no page to leave
    }
  }
  // Every file moved is in a ledger: the ones no ledger lists yet get theirs.
  const low = (p) => fwd(p).toLowerCase();
  const known = new Set(listed(LEDGER).flatMap((i) => [i.path, i.ref]).filter(Boolean).map(low));
  const fresh = moved.filter((f) => !known.has(low(f.to)));
  // Lots: twenty-five files at most, a very long file alone.
  const lots = [];
  let lot = [];
  for (const m of fresh) {
    if (m.bytes >= GIANT) {
      lots.push([m]);
      continue;
    }
    lot.push(m);
    if (lot.length === LOT) {
      lots.push(lot);
      lot = [];
    }
  }
  if (lot.length) lots.push(lot);
  const taken = new Set(ledgers().map((l) => l.name));
  const opened = [];
  let n = 1;
  for (const items of lots) {
    while (taken.has(`${LEDGER}${plan.day}-${n}`)) n++;
    const name = `${LEDGER}${plan.day}-${n}`;
    taken.add(name);
    const r = open(name, { items: items.map((m) => ({ ref: addressOf(m.to) ?? fwd(m.to), path: fwd(m.to) })) });
    if (r.ok === false) {
      failed ??= `the ledger ${name} could not be opened (${r.error})`;
      break;
    }
    opened.push({ name, counted: r.counted ?? items.length });
  }
  if (moved.length) setUserConfig((c) => ({ memory: { ...(c.memory ?? {}), archived: plan.day } }));
  // The plan leaves only once everything it named is moved and listed.
  if (!failed) rmSync(PLAN(), { force: true });
  return { moved, listed: fresh.length, opened, failed };
}

/**
 * THE MEMORY LEAVES ITS FOLDERS. Every file moves to memory-archive-<day>/
 * beside its folder, a page takes its place, and ledgers list every file moved.
 * Refused while one file is held by no checked backup.
 */
export function archive() {
  if (!hasBrain()) return { ok: false, error: "no brain on this computer yet: the memory comes in once the brain exists (/brain:start)" };
  // A run that was cut short is finished first: what it moved gets its ledgers.
  let before = null;
  const left = readJsonFile(PLAN(), null);
  if (left.unreadable) return { ok: false, error: `the plan of a run that was cut short (${fwd(PLAN())}) cannot be read: nothing was moved. Look at the folders memory-archive-* beside the memory folders, then remove that file.` };
  if (left.ok && Array.isArray(left.value?.files)) {
    before = carryOut(left.value, { resumed: true });
    if (before.failed) return { ok: false, error: `${before.failed}: nothing else was moved, run \`memory.mjs archive\` again`, archived: before.moved.length, ledgers: before.opened };
  }
  const resumed = before ? { resumed: true, listedNow: before.listed } : {};
  const found = find();
  if (!found.files) return before ? { ok: true, ...resumed, archived: before.moved.length, projects: new Set(before.moved.map((f) => f.project)).size, day: left.value.day, ledgers: before.opened } : { ok: true, nothing: true, ...state() };
  const missing = notBackedUp(found);
  if (missing.length) return { ok: false, error: "the memory as it is now has no whole backup: run `memory.mjs backup` first, nothing was moved", missing: missing.length, first: missing.slice(0, 5), ...resumed };
  const day = today();
  // The files get an address that holds on every computer: "ai-memory://<project>/...".
  // (A name of its own: "claude" is the form of a conversation's address, and a
  // root made from the folder's name would be "claude-2". A computer where a
  // root already holds these folders keeps its own.)
  if (!addressOf(PROJECTS())) {
    if ((userConfig().sourceRoots ?? {})[ROOT_NAME]) ensureRoot(PROJECTS());
    else setUserConfig((c) => ({ sourceRoots: { ...(c.sourceRoots ?? {}), [ROOT_NAME]: fwd(PROJECTS()) } }));
  }
  const plan = { day, at: new Date().toISOString(), files: [] };
  for (const p of found.projects) {
    const dir = join(PROJECTS(), p.project, "memory");
    const target = join(PROJECTS(), p.project, `memory-archive-${day}`);
    for (const f of p.list) plan.files.push({ project: p.project, from: join(dir, f.rel), to: freePlace(join(target, f.rel)), bytes: f.bytes });
  }
  writeJsonAtomic(PLAN(), plan);
  const done = carryOut(plan);
  const opened = [...(before?.opened ?? []), ...done.opened];
  if (done.failed) return { ok: false, error: `${done.failed}: the files already moved are listed in the ledgers, nothing is lost. Run \`memory.mjs archive\` again to finish.`, archived: done.moved.length, day, ledgers: opened };
  return { ok: true, ...resumed, archived: done.moved.length, projects: found.projects.length, day, ledgers: opened };
}

/** The archives left beside the memory folders, per project. */
function archives() {
  const out = [];
  for (const project of projectNames()) {
    let names = [];
    try {
      names = readdirSync(join(PROJECTS(), project)).filter((n) => ARCHIVE.test(n)).sort();
    } catch {
      names = [];
    }
    for (const n of names) out.push({ project, folder: join(PROJECTS(), project, n), files: walk(join(PROJECTS(), project, n)) });
  }
  return out;
}

/**
 * EVERYTHING BACK WHERE IT WAS. From the archives (each file returns to its
 * memory folder, the plugin's page leaves), or from the backups when the
 * archives are gone. A file of that name already there is never written over:
 * it is named, and left. The lock is lifted. The notes written meanwhile stay
 * in the brain: they are the person's to keep or to undo.
 */
export function restore({ fromBackup = false } = {}) {
  let back = 0;
  const kept = [];
  if (fromBackup) {
    // EVERY BACKUP, NOT THE LAST ONE (2026-11-21). A backup holds what was in
    // the memory folders that day: after a first pass (157 files) and a second
    // one on 3 new files, the last backup held those 3 alone, and "restored: 3"
    // left 157 files in a backup nobody looked at. Each file is taken from the
    // latest backup that holds it.
    const all = backups();
    if (!all.length) return { ok: false, error: "no backup of the memory on this computer" };
    const latest = new Map();
    for (const b of all) for (const f of b.files) latest.set(`${f.project}|${f.rel}`, { folder: b.folder, f });
    for (const { folder, f } of latest.values()) {
      const to = join(PROJECTS(), f.project, "memory", f.rel);
      if (existsSync(to) && !(f.rel === "MEMORY.md" && isPointer(to))) {
        kept.push(`${f.project}/${f.rel}`);
        continue;
      }
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(folder, f.project, "memory", f.rel), to);
      back++;
    }
  } else {
    for (const a of archives()) {
      const dir = join(PROJECTS(), a.project, "memory");
      const page = join(dir, "MEMORY.md");
      if (isPointer(page)) unlinkSync(page);
      for (const rel of a.files) {
        const to = join(dir, rel);
        if (existsSync(to)) {
          kept.push(`${a.project}/${rel}`);
          continue;
        }
        mkdirSync(dirname(to), { recursive: true });
        moveFile(join(a.folder, rel), to);
        back++;
      }
      try {
        // (Emptied: the folder leaves. Not empty: it holds what was left, named above.)
        for (const sub of walkDirs(a.folder).reverse()) rmdirSync(sub);
      } catch {
        // something was left in it
      }
    }
  }
  // (Everything is back: a plan left by a run cut short has nothing more to finish.)
  rmSync(PLAN(), { force: true });
  // A lock that could not be wholly lifted is said, not answered "ok" (2026-11-21).
  const lifted = lock(false);
  return { ok: lifted.ok !== false, restored: back, ...(kept.length ? { leftInPlace: kept } : {}), lock: lifted.lock ?? userConfig().memory?.lock === true, ...(lifted.ok === false ? { error: lifted.error } : {}) };
}
/** A folder and the folders under it, the deepest last. */
function walkDirs(dir) {
  const out = [dir];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) if (e.isDirectory()) out.push(...walkDirs(join(dir, e.name)));
  return out;
}

/**
 * THE LOCK, on or off: Claude Code's own setting, the plugin's hook (it reads
 * this computer's settings), and the rule in the global CLAUDE.md. The setting
 * of Claude Code is given back as it was when the lock is lifted.
 */
export function lock(on) {
  const file = SETTINGS();
  let raw = null;
  let settings = {};
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    raw = null;
  }
  const mem = userConfig().memory ?? {};
  // (The lock was set, or lifted without Claude Code's setting being given back.)
  const owed = mem.lock === true || mem.autoMemoryOwed === true;
  if (raw !== null) {
    try {
      settings = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("not an object");
    } catch {
      if (on) return { ok: false, error: `${fwd(file)} is not read as JSON: it was not touched, and the lock was not changed` };
      // LIFTING NEVER LEAVES THE GUARD UP (2026-11-21). Claude Code's settings
      // could not be read, nothing was changed, and `restore` still answered
      // "ok": the files were back and every write into them was refused. The
      // plugin's own guard and rule are lifted whatever happens; what is owed
      // to Claude Code's setting is remembered for the next `lock off`.
      setUserConfig((c) => ({ memory: { ...(c.memory ?? {}), lock: false, ...(owed && mem.autoMemoryBefore !== false ? { autoMemoryOwed: true } : {}) } }));
      const rules = writeRulesBlock();
      return { ok: false, lock: false, rules: rules.file ? fwd(rules.file) : null, error: `${fwd(file)} is not read as JSON: it was not touched, so Claude Code's own memory setting (autoMemoryEnabled) was not given back. The plugin's guard and its rule are lifted. Repair that file, then run \`memory.mjs lock off\` again.` };
    }
  }
  const write = () => {
    // (The file as it was, kept once beside it.)
    if (raw !== null && !existsSync(`${file}.before-brain-memory`)) writeFileSync(`${file}.before-brain-memory`, raw, "utf8");
    writeFileAtomic(file, `${JSON.stringify(settings, null, 2)}\n`);
  };
  if (on) {
    const before = Object.hasOwn(settings, "autoMemoryEnabled") ? settings.autoMemoryEnabled : null;
    if (settings.autoMemoryEnabled !== false) {
      settings.autoMemoryEnabled = false;
      write();
    }
    setUserConfig((c) => {
      const { autoMemoryOwed: _owed, ...now } = c.memory ?? {};
      return { memory: { ...now, lock: true, lockedAt: now.lockedAt ?? new Date().toISOString(), ...(owed ? {} : { autoMemoryBefore: before }) } };
    });
  } else {
    if (owed && settings.autoMemoryEnabled === false && mem.autoMemoryBefore !== false) {
      if (mem.autoMemoryBefore === null || mem.autoMemoryBefore === undefined) delete settings.autoMemoryEnabled;
      else settings.autoMemoryEnabled = mem.autoMemoryBefore;
      write();
    }
    setUserConfig((c) => {
      const { lockedAt: _at, autoMemoryBefore: _before, autoMemoryOwed: _owed, ...rest } = c.memory ?? {};
      return { memory: { ...rest, lock: false } };
    });
  }
  const rules = writeRulesBlock();
  return { ok: true, lock: on, autoMemory: settings.autoMemoryEnabled !== false, rules: rules.file ? fwd(rules.file) : null };
}

/** Where the memory stands: what is still in its folders, what the ledgers hold, the backup, the lock. */
export function state() {
  const found = find();
  const mine = hasBrain() ? ledgers().filter((l) => l.name.startsWith(LEDGER)) : [];
  const last = backups().at(-1);
  return {
    ok: true,
    found: { files: found.files, bytes: found.bytes, projects: found.projects.map((p) => ({ project: p.project, files: p.files, bytes: p.bytes })) },
    estimate: found.estimate,
    backedUp: found.files ? notBackedUp(found).length === 0 : null,
    ...(last ? { backup: { folder: fwd(last.folder), at: last.at, files: last.files.length } } : {}),
    ledgers: mine,
    left: mine.filter((l) => !l.closed).reduce((n, l) => n + l.left, 0),
    lock: userConfig().memory?.lock === true,
    // A run of `archive` that was cut short: `memory.mjs archive` finishes it.
    ...(archivePending() ? { pending: true } : {}),
  };
}

const isMain = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/memory.mjs");
if (isMain) {
  const a = process.argv.slice(2);
  const out = (o) => {
    console.log(JSON.stringify(o));
    if (o.ok === false) process.exitCode = 1;
  };
  if (a[0] === "find") {
    const f = find();
    out({ ...f, projects: f.projects.map(({ list: _list, ...p }) => p) });
  } else if (a[0] === "backup") out(backup());
  else if (a[0] === "archive") out(archive());
  else if (a[0] === "state" || a[0] === undefined) out(state());
  // LIFTING THE LOCK IS THE PERSON'S OWN GESTURE (2026-11-27): `lock off` and
  // `restore` (which lifts it) run in a terminal of theirs, never for them
  // (trust.mjs, personAsks; the plugin's lock refuses the AI these commands).
  else if (a[0] === "lock" && a[1] === "on") out(lock(true));
  else if ((a[0] === "lock" && a[1] === "off") || a[0] === "restore") {
    if (!personAsks()) out({ ...NOT_THE_PERSON(), error: "lifting the memory's lock is the person's own gesture: they run this command themselves, in a terminal of their own", byHand: `node "${fwd(process.argv[1])}" ${a.join(" ")}` });
    else out(a[0] === "restore" ? restore({ fromBackup: a.includes("--backup") }) : lock(false));
  }
  else {
    console.log("usage: memory.mjs find | backup | archive | state | lock on|off | restore [--backup] (see the top of scripts/memory.mjs)");
    process.exitCode = 2;
  }
}
