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
// The body comes from stdin, from --body "<the text>", or from --body-file.
// --slug: the note's file name, when it must not come from the title. Prints
// the created path.
//
// WHAT A JUDGE'S CAPTURE MAY NOT DO (2026-11-27, security audit). A judge
// reads text nobody checked, and this command is one of the few it may run.
// Turned against the person, it copied any file of the computer into the
// brain (--body-file, or a file sent on its input), named itself the source
// of what it wrote, and wrote "lessons" the AI then read as the person's
// rules. So, for a judge:
//   - the body is text: --body, or what is piped to it; never a file
//     (--body-file, an input that is a file);
//   - nothing its own environment holds (its token) may be written;
//   - the source is one of the references it was handed for this pass
//     (judge.mjs keeps them), not what it says;
//   - a lesson or a decision is PROPOSED: the note enters as an ordinary
//     seed, marked as a proposed lesson, and the weekly letter shows it to the
//     person, who alone makes it a rule.

import { fstatSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, config, isFrench, requireBrain, today, userConfig } from "./lib.mjs";
import { natureOf } from "./pure.mjs";
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
// A JUDGE'S CAPTURE (who: ai:<source>, a background Claude of the brain,
// 2026-11-16). The guard of its facts holds for its seeds (fact.mjs): never an
// amount that is data in a tool. And it makes no commit of its own: the hub
// saves what a judge wrote, one commit an hour at most (hub.mjs), where a
// commit and a push at each seed would bring back hundreds of them a day.
const byJudge = /^ai:/.test(process.env.HVBRAIN_WHO || "");
if (byJudge) {
  // Its body is text, never a file of the computer.
  if (args.includes("--body-file")) fail("a background reader gives the text of a note itself (--body, or piped to this command): it never has a file read for it");
  if (!args.includes("--body")) {
    let fromFile = false;
    try {
      fromFile = fstatSync(0).isFile();
    } catch {
      fromFile = false;
    }
    if (fromFile) fail("a background reader gives the text of a note itself (--body, or piped to this command): its input may not be a file");
  }
}
let body = args.includes("--body") ? String(opt("--body") ?? "") : opt("--body-file") ? readFileSync(opt("--body-file"), "utf8") : readFileSync(0, "utf8");
let source = opt("--source", `claude://chat/${today()}`);
let nature = opt("--nature");
/** The nature a judge asked for and may only propose: "lesson" or "decision", or null. */
let proposed = null;
if (byJudge) {
  // Nothing of its own environment: a token written in a note would leave with the brain's next save.
  for (const [k, v] of Object.entries(process.env)) {
    if (/token|secret|key|password/i.test(k) && typeof v === "string" && v.length >= 16 && `${title}\n${body}`.includes(v)) fail("this text holds a key of this computer: nothing was written");
  }
  // ITS SOURCE IS WHAT IT WAS HANDED. The references of this pass are kept by
  // judge.mjs while the judge runs: the one the judge names must be one of
  // them (with or without its version); alone in its pass, it is that one.
  let refs = [];
  try {
    refs = JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "judge", `${String(process.env.HVBRAIN_WHO).slice(3).replace(/[^a-z0-9_-]/gi, "")}.batch.json`), "utf8")).refs ?? [];
  } catch {
    refs = []; // no pass is running (a judge of before, a test): the source it gives is kept
  }
  if (refs.length) {
    const base = (r) => (String(r).includes("#") ? String(r).slice(0, String(r).lastIndexOf("#")) : String(r));
    const said = base(source).toLowerCase();
    const hit = refs.find((r) => base(r).toLowerCase() === said || String(r).toLowerCase() === String(source).toLowerCase());
    if (hit) source = base(hit);
    else if (refs.length === 1) source = base(refs[0]);
    else fail(`the source of a note is the reference of the item you are judging, as your list gives it (without its date): one of ${refs.map(base).slice(0, 15).join(", ")}`);
  }
  // A LESSON OR A DECISION IS THE PERSON'S TO MAKE: proposed, never written as one.
  const canon = nature ? natureOf(nature) : null;
  if (canon === "lesson" || canon === "decision") {
    proposed = canon;
    nature = undefined;
    const fr = isFrench(cfg);
    const mark = fr
      ? `(${canon === "lesson" ? "Leçon proposée" : "Décision proposée"} par un lecteur de fond, pas encore validée : la lettre de la semaine la montre à la personne, qui seule en fait une règle.)`
      : `(Proposed ${canon} from a background reader, not validated yet: the weekly letter shows it to the person, who alone makes it a rule.)`;
    body = `${mark}\n\n${body}`;
  }
}
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
    source,
    nature,
    data: list(opt("--data")),
    slug: opt("--slug"),
    body,
    // What a judge proposed and may not write itself: kept in the note's head.
    ...(proposed ? { fields: { proposed } } : {}),
  }, cfg);
} catch (e) {
  fail(`${e.message}${/already exists/.test(e.message) ? ". Enrich it with the person's agreement, or choose another title." : ""}`);
}

console.log(`created: ${created.rel}`);
if (proposed) console.log(`proposed: the note is an ordinary seed marked as a proposed ${proposed}; the person decides in the weekly letter`);
const event = logEvent({ act: "write", who: process.env.HVBRAIN_WHO || "ai", note: created.slug, what: "created", from: source });
// The proposal goes to the weekly letter, with the machine's other proposals.
if (proposed) logEvent({ act: "signal", who: process.env.HVBRAIN_WHO || "ai", what: "proposal", note: created.slug, from: source, text: `proposed ${proposed}: ${String(title).replace(/\s+/g, " ").trim()}` });
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
