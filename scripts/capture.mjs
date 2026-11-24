#!/usr/bin/env node
// capture.mjs - Writes ONE new note into the vault, classified, and commits it.
//
// It creates, it never modifies: a note that already exists is refused (the
// person decides whether to enrich it, and Claude then edits the file in
// front of them). That is the "post-veto" rule: the machine creates freely,
// in status "seed" by default, and never touches a validated note alone.
// The writing itself is notes.mjs: the same path as the sources take.
// A judge's capture (HVBRAIN_WHO=ai:<source>) makes no commit of its own: the
// hub saves what it wrote, one commit an hour at most.
//
//   echo "the body" | node scripts/capture.mjs --title "A short title" --type idea \
//       --domains work,writing [--links slug-a,slug-b] [--source "where it comes from"] \
//       [--nature decision] [--data scheme://path,scheme://other] \
//       [--status seed|trusted] [--visibility internal|public|private] [--slug <file name>] [--no-commit]
//
// The body comes from stdin (or --body-file). --slug: the note's file name,
// when it must not come from the title. Prints the created path.

import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { PLUGIN_ROOT, ROOT, config, requireBrain, today, userConfig } from "./lib.mjs";
import { commitPaths, pushIfAgreed, repoState } from "./git.mjs";
import { brainLang, t } from "./i18n.mjs";
import { createNote } from "./notes.mjs";
import { logEvent } from "./journal.mjs";
import { keepBefore } from "./before.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);
const fail = (msg) => {
  console.error(`refused: ${msg}`);
  process.exit(1);
};

requireBrain();
const cfg = config();
const title = opt("--title");
if (!title) fail("--title is required");
if (!opt("--type")) fail(`--type is required (this brain's types: ${Object.keys(cfg.types).join(", ")})`);
if (!list(opt("--domains")).length) fail(`--domains is required (this brain's domains: ${cfg.domains.join(", ")})`);
const body = opt("--body-file") ? readFileSync(opt("--body-file"), "utf8") : readFileSync(0, "utf8");

// A JUDGE'S CAPTURE (who: ai:<source>, a background Claude of the brain,
// 2026-11-16). The guard of its facts holds for its seeds (fact.mjs): never an
// amount that is data in a tool. And it makes no commit of its own: the hub
// saves what a judge wrote, one commit an hour at most (hub.mjs), where a
// commit and a push at each seed would bring back hundreds of them a day.
const byJudge = /^ai:/.test(process.env.HVBRAIN_WHO || "");
if (byJudge) {
  const { recordedAmount, AMOUNT_REFUSAL } = await import("./money.mjs");
  const s = recordedAmount(`${title}\n${body}`);
  if (s) fail(AMOUNT_REFUSAL(s));
  // ONLY THE PERSON VALIDATES (2026-11-21, as promote.mjs does): a judge's
  // note enters as a seed, whatever it asks for. Found by the documentation
  // review: --status trusted let a background Claude write a validated note.
  if (!["seed", "graine"].includes(String(opt("--status", "seed")))) fail("a background reader writes seeds only: the person validates a note (promote.mjs, or the Validate button of the live view)");
}

let created;
try {
  created = createNote({
    title,
    type: opt("--type"),
    domains: list(opt("--domains")),
    links: list(opt("--links")),
    status: opt("--status", "seed"),
    visibility: opt("--visibility", "internal"),
    source: opt("--source", `claude://chat/${today()}`),
    nature: opt("--nature"),
    data: list(opt("--data")),
    slug: opt("--slug"),
    body,
  }, cfg);
} catch (e) {
  fail(`${e.message}${/already exists/.test(e.message) ? ". Enrich it with the person's agreement, or choose another title." : ""}`);
}

console.log(`created: ${created.rel}`);
const event = logEvent({ act: "write", who: process.env.HVBRAIN_WHO || "ai", note: created.slug, what: "created", from: opt("--source", `claude://chat/${today()}`) });
// The note as it was created is kept (before.mjs): undoing the creation can
// then tell a note nobody touched from one edited by hand since, even when no
// save has seen it yet (a judge's seed waits up to an hour for its commit).
try {
  keepBefore(event, created.rel, "", readFileSync(join(ROOT, created.rel), "utf8"));
} catch {
  // the undo then falls back on what the journal says
}
const repo = args.includes("--no-commit") || byJudge ? null : repoState();
// A git that cannot answer is not "no repository": said, the note is safe on disk.
if (repo?.state === "failed") console.log(`not committed (git could not be run: ${repo.error}): the note is safe on disk, the next save will commit it`);
if (repo?.state === "yes") {
  const c = commitPaths([created.rel], t(brainLang(ROOT)).commitCapture(title));
  if (!c.ok) console.log(`not committed (${c.err.split("\n")[0].slice(0, 160)}): the note is safe on disk, the next save will commit it`);
  else if (userConfig().sync === true) {
    // Two computers: the synchronisation sends it (and first takes what the
    // other one sent), in the background, without making the person wait.
    spawn(process.execPath, [join(PLUGIN_ROOT, "scripts", "sync.mjs"), "--quiet"], { detached: true, stdio: "ignore", windowsHide: true, env: process.env }).unref();
    console.log("committed; the synchronisation sends it to the other computer");
  } else {
    const p = pushIfAgreed();
    console.log(p.pushed ? "committed and pushed" : `committed (${p.reason})`);
  }
}
// No build here: the next question to the brain rebuilds its index by itself.
