#!/usr/bin/env node
// save.mjs - Commits what is AT REST in the brain, and pushes if agreed.
//
// "At rest": new notes, deleted notes, and modified notes that have not moved
// for 30 minutes. A note edited a minute ago may be half written by a session
// still at work: it waits for the next save. The vectors, the reviews and the
// brain's own documents go with it. Code and anything else are never taken.
//
//   node scripts/save.mjs [--now]    (--now: ignore the 30-minute rest)

import { statSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, readVault, requireBrain, validate } from "./lib.mjs";

requireBrain();
import { commitPaths, isRepo, pushIfAgreed, tryGit } from "./git.mjs";

const REST_MS = process.argv.includes("--now") ? 0 : 30 * 60_000;
const OWNED = [/^vault\//, /^index\/embeddings\//, /^reviews\//, /^(BRAIN|SOURCES)\.md$/, /^hyperbrain\.json$/];

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
  if (!OWNED.some((re) => re.test(path))) continue;
  if (code.includes("?") || code.includes("D") || code.includes("A") || !path.startsWith("vault/")) {
    paths.push(path);
    continue;
  }
  let age = Infinity;
  try {
    age = Date.now() - statSync(join(ROOT, path)).mtimeMs;
  } catch {
    // gone meanwhile
  }
  (age >= REST_MS ? paths : waiting).push(path);
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
  const c = commitPaths(paths, `save: ${notes} note(s), ${paths.length - notes} other file(s)`);
  if (!c.ok) {
    console.log(`NOT saved: ${c.err.split("\n").slice(0, 3).join(" | ").slice(0, 400)}`);
    process.exitCode = 1;
  } else {
    const p = pushIfAgreed();
    console.log(`saved: ${paths.length} file(s)${waiting.length ? `, ${waiting.length} still being edited` : ""}; ${p.pushed ? "pushed" : p.reason}`);
  }
}
