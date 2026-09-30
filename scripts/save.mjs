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

import { statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, isDerived, isOwned, isRunner, readVault, readWritten, requireBrain, setWritten, userConfig, validate } from "./lib.mjs";

requireBrain();
import { commitPaths, isRepo, pushIfAgreed, tryGit } from "./git.mjs";
import { brainLang, t } from "./i18n.mjs";

const REST_MS = process.argv.includes("--now") ? 0 : 30 * 60_000;
const cfgNow = config();
const runner = isRunner(cfgNow);
// What a source wrote this evening, untouched since: at rest at once (lib.mjs).
const written = readWritten();

if (!isRepo()) {
  console.log("not a git repository: nothing to save");
  process.exit(0);
}

const status = tryGit(["status", "--porcelain", "-z", "--untracked-files=all"], { raw: true }).out.split("\0").filter(Boolean);
const paths = [];
const waiting = [];
for (let i = 0; i < status.length; i++) {
  const entry = status[i];
  const code = entry.slice(0, 2);
  const path = entry.slice(3);
  if (code[0] === "R" || code[0] === "C") i++; // the old name follows a rename
  if (!isOwned(path, cfgNow)) continue;
  if (!runner && isDerived(path, cfgNow)) continue;
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
const bad = new Map([...parseErrors, ...validate(fiches, config()).errors].map((e) => [e.rel, e.msg]));
const refused = paths.filter((p) => bad.has(p));
for (const p of refused) paths.splice(paths.indexOf(p), 1);
for (const p of refused) console.log(`NOT saved, invalid: ${p}: ${bad.get(p)}`);
if (refused.length) process.exitCode = 1;

if (!paths.length) console.log(`nothing to save${waiting.length ? ` (${waiting.length} note(s) still being edited, they wait)` : ""}`);
else {
  const notes = paths.filter((p) => p.startsWith("vault/")).length;
  const c = commitPaths(paths, t(brainLang(ROOT)).commitSave(notes, paths.length - notes));
  if (!c.ok) {
    console.log(`NOT saved: ${c.err.split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
    process.exitCode = 1;
  } else {
    // What was committed no longer needs remembering.
    if (Object.keys(written).length) setWritten(Object.fromEntries(Object.entries(written).filter(([rel]) => !paths.includes(rel))));
    const p = process.argv.includes("--no-push") || userConfig().sync === true ? { pushed: false, reason: "the synchronisation sends it" } : pushIfAgreed();
    console.log(`saved: ${paths.length} file(s)${waiting.length ? `, ${waiting.length} still being edited` : ""}; ${p.pushed ? "pushed" : p.reason}`);
  }
}
