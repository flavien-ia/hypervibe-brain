#!/usr/bin/env node
// save.mjs - Commits what is AT REST in the brain, and pushes if agreed.
//
// "At rest": new notes, deleted notes, and modified notes that have not moved
// for 30 minutes. A note edited a minute ago may be half written by a session
// still at work: it waits for the next save. The vectors, the reviews and the
// brain's own documents go with it. Code and anything else are never taken.
//
//   node scripts/save.mjs [--now] [--no-push]    (--now: ignore the 30-minute rest)
//
// On a computer that is not the runner, what the runner computes (vectors,
// directory, reviews, the state of the sources) is never committed here.
// When the synchronisation of two computers is on, it is the one that pushes.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { ROOT, computerName, config, isDerived, isOwned, isRunner, readVault, readWritten, requireBrain, setWritten, textProblem, userConfig, validate } from "./lib.mjs";

requireBrain();
import { commitPaths, pushIfAgreed, repoState, tryGit } from "./git.mjs";
import { foldEvents, foldJournal, foldedPaths, logEvent, pendingEvents, readEvents } from "./journal.mjs";
import { writeSourcesZone } from "./sources-zone.mjs";
import { brainLang, t } from "./i18n.mjs";

const REST_MS = process.argv.includes("--now") ? 0 : 30 * 60_000;
const cfgNow = config();
const runner = isRunner(cfgNow);
// What a source wrote this evening, untouched since: at rest at once (lib.mjs).
const written = readWritten();

const repo = repoState();
if (repo.state === "no") {
  console.log("not a git repository: nothing to save");
  process.exit(0);
}
// A git that cannot answer is not "nothing to save" (2026-11-21): said, and the save fails.
if (repo.state === "failed") {
  console.log(`NOT saved: git could not be run on the brain's folder (${repo.error})`);
  process.exit(1);
}
// A REBASE OR A MERGE LEFT HALF DONE (2026-11-21): nothing is saved over it.
// A file in conflict holds git's markers in its text; adding it tells git the
// conflict is solved, and the commit then carried the markers into the brain,
// and to the other computer. The synchronisation already stood aside in that
// state (sync.mjs): the save does too, and says so.
{
  const gitDir = resolve(ROOT, tryGit(["rev-parse", "--git-dir"]).out || ".git");
  if (["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"].some((n) => existsSync(join(gitDir, n)))) {
    console.log('NOT saved: a rebase or a merge is left half done in the brain\'s folder. Nothing is lost. Open a conversation and say: "solve the conflict of my brain".');
    process.exit(1);
  }
}

// The work journal of this computer joins the brain (journal/<computer>-<month>.jsonl),
// for the weekly review to see the work of every computer.
if (cfgNow.sources?.journal) foldJournal();
// The list of the connected sources in SOURCES.md, read from sources/ (sources-zone.mjs).
try {
  writeSourcesZone();
} catch {
  // the list waits for the next save
}

const listed = tryGit(["status", "--porcelain", "-z", "--untracked-files=all"], { raw: true });
// A list that git could not give whole is not a list to save from.
if (!listed.ok) {
  console.log(`NOT saved: git could not list what changed (${listed.err.split("\n").find((l) => l.trim() && !/^warning: /.test(l))?.slice(0, 240) ?? "no reason given"})`);
  process.exit(1);
}
const status = listed.out.split("\0").filter(Boolean);
const paths = [];
const waiting = [];
const conflicted = [];
for (let i = 0; i < status.length; i++) {
  const entry = status[i];
  const code = entry.slice(0, 2);
  const path = entry.slice(3);
  if (code[0] === "R" || code[0] === "C") i++; // the old name follows a rename
  if (!isOwned(path, cfgNow)) continue;
  if (!runner && isDerived(path, cfgNow)) continue;
  // A file being written beside its place by another program of the brain
  // (lib.mjs writeFileAtomic) is gone in an instant: naming it would refuse the whole save.
  if (/\.\d+\.tmp$/.test(path)) continue;
  // Not merged (a stash given back by hand that met a change): it holds git's
  // markers, it is never saved as it is (see above).
  if (code.includes("U") || code === "AA" || code === "DD") {
    conflicted.push(path);
    continue;
  }
  if (code.includes("?") || code.includes("D") || code.includes("A") || !path.startsWith("vault/")) {
    paths.push(path);
    continue;
  }
  let age = Infinity;
  let mtime = null;
  try {
    mtime = statSync(join(ROOT, path)).mtimeMs;
    age = Date.now() - mtime;
  } catch {
    // gone meanwhile
  }
  (age >= REST_MS || (written[path] !== undefined && written[path] === mtime) ? paths : waiting).push(path);
}

// No commit hook guards this repository (a global hooks setting, such as the
// one of a secrets scanner, would make it inert anyway): the judge runs here.
// A broken note stays out of git, the others go in.
const { fiches, errors: parseErrors } = readVault();
// A source in a form the brain does not follow (sourceSchemes) keeps the note out of git too.
const judged = validate(fiches, config());
const bad = new Map([...parseErrors, ...judged.errors, ...judged.warnings.filter((w) => w.source)].map((e) => [e.rel, e.msg]));
const refused = paths.filter((p) => bad.has(p));
for (const p of refused) paths.splice(paths.indexOf(p), 1);
for (const p of refused) console.log(`NOT saved, invalid: ${p}: ${bad.get(p)}`);
if (refused.length) process.exitCode = 1;
for (const p of conflicted) console.log(`NOT saved, in conflict: ${p}: it was changed in two places and holds both versions. Nothing is lost. Open a conversation and say: "solve the conflict of my brain".`);
if (conflicted.length) process.exitCode = 1;

// THE BRAIN'S JOURNAL (journal.mjs). A note about to be saved that no tool
// announced (no write event in the past week) was edited by hand, by the
// person or a session: the journal says so, so that every change of the brain
// is in it. Then this computer's events join the brain, in this same commit
// (when there is one to make: see below).
{
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const announced = new Set(readEvents({ since, act: "write" }).map((e) => e.note));
  for (const p of paths) {
    if (!p.startsWith("vault/") || !p.endsWith(".md")) continue;
    const slug = p.split("/").pop().slice(0, -3);
    if (announced.has(slug)) continue;
    const gone = !existsSync(join(ROOT, p));
    logEvent({ act: "write", who: "hand", note: slug, what: gone ? "deleted" : tryGit(["ls-files", "--error-unmatch", p]).ok ? "edited" : "created", file: p });
  }
  logEvent({ act: "run", who: "save", notes: paths.filter((p) => p.startsWith("vault/")).length, files: paths.length, waiting: waiting.length });
  // 2026-11-16. A save's own line never makes a commit by itself. Folded at
  // every pass, it made each synchronisation commit and push a line saying
  // that nothing had happened: one commit per pass on each computer, and one
  // more at each pass of a computer stopped on a conflict. With nothing to
  // save and no other event, the line stays in the live file (still read from
  // there, never pruned before it is folded) and joins the brain with the
  // next commit. Any other event (a read, a source's run) still leaves at once.
  const ownLine = (e) => e.act === "run" && e.who === "save";
  if ((paths.length || pendingEvents().some((e) => !ownLine(e))) && foldEvents()) {
    // The months it wrote in, and the file of before the months when it was just cut.
    // (A file removed that git never knew is nothing to commit: naming it would refuse the whole save.)
    for (const mine of foldedPaths()) if (!paths.includes(mine) && (existsSync(join(ROOT, mine)) || tryGit(["ls-files", "--error-unmatch", mine]).ok)) paths.push(mine);
  }
}

if (!paths.length) console.log(`nothing to save${waiting.length ? ` (${waiting.length} note(s) still being edited, they wait)` : ""}`);
else {
  const commit = (list) => {
    const notes = list.filter((p) => p.startsWith("vault/")).length;
    return commitPaths(list, t(brainLang(ROOT)).commitSave(notes, list.length - notes));
  };
  let c = commit(paths);
  if (!c.ok) {
    // WHAT THIS BRAIN NEVER WRITES, FOUND IN A NOTE (brain.json, neverWrite;
    // 2026-11-21). A brain that says so often has a commit hook of its own
    // that checks it: one note holding such a character (brought by a hand, or
    // by a program before the writes checked it) and the hook refused every
    // save. Those notes are set aside, named, and the rest is saved.
    const faulty = paths.filter((p) => {
      if (!p.startsWith("vault/") || !p.endsWith(".md")) return false;
      try {
        return Boolean(textProblem(readFileSync(join(ROOT, p), "utf8"), cfgNow));
      } catch {
        return false; // a note removed has nothing in it
      }
    });
    const rest = paths.filter((p) => !faulty.includes(p));
    const again = faulty.length && rest.length ? commit(rest) : null;
    if (again?.ok) {
      for (const p of faulty) console.log(`NOT saved, ${textProblem(readFileSync(join(ROOT, p), "utf8"), cfgNow)}: ${p}`);
      for (const p of faulty) paths.splice(paths.indexOf(p), 1);
      process.exitCode = 1;
      c = again;
    }
  }
  if (!c.ok) {
    // Git's own warnings come first (line endings, one per file) and hid the
    // reason of the refusal (seen 2026-11-18: a commit hook that refused a
    // note, and three lines about line endings in the log).
    const why = c.err.split("\n").filter((l) => l.trim() && !/^warning: /.test(l));
    console.log(`NOT saved: ${(why.length ? why : c.err.split("\n")).slice(0, 3).join(" | ").slice(0, 400)}`);
    process.exitCode = 1;
  } else {
    // What was committed no longer needs remembering.
    if (Object.keys(written).length) setWritten(Object.fromEntries(Object.entries(written).filter(([rel]) => !paths.includes(rel))));
    const p = process.argv.includes("--no-push") || userConfig().sync === true ? { pushed: false, reason: "the synchronisation sends it" } : pushIfAgreed();
    console.log(`saved: ${paths.length} file(s)${waiting.length ? `, ${waiting.length} still being edited` : ""}; ${p.pushed ? "pushed" : p.reason}`);
  }
}
