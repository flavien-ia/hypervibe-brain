#!/usr/bin/env node
// capture.mjs - Writes ONE new note into the vault, classified, and commits it.
//
// It creates, it never modifies: a note that already exists is refused (the
// person decides whether to enrich it, and Claude then edits the file in
// front of them). That is the "post-veto" rule: the machine creates freely,
// in status "seed" by default, and never touches a validated note alone.
// The writing itself is notes.mjs: the same path as the sources take.
//
//   echo "the body" | node scripts/capture.mjs --title "A short title" --type idea \
//       --domains work,writing [--links slug-a,slug-b] [--source "where it comes from"] \
//       [--status seed|trusted] [--visibility internal|public|private] [--no-commit]
//
// The body comes from stdin (or --body-file). Prints the created path.

import { readFileSync } from "node:fs";
import { ROOT, config, requireBrain, today } from "./lib.mjs";
import { commitPaths, isRepo, pushIfAgreed } from "./git.mjs";
import { brainLang, t } from "./i18n.mjs";
import { createNote } from "./notes.mjs";

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
    slug: opt("--slug"),
    body,
  }, cfg);
} catch (e) {
  fail(`${e.message}${/already exists/.test(e.message) ? ". Enrich it with the person's agreement, or choose another title." : ""}`);
}

console.log(`created: ${created.rel}`);
if (!args.includes("--no-commit") && isRepo()) {
  const c = commitPaths([created.rel], t(brainLang(ROOT)).commitCapture(title));
  if (!c.ok) console.log(`not committed (${c.err.split("\n")[0].slice(0, 160)}): the note is safe on disk, the next save will commit it`);
  else {
    const p = pushIfAgreed();
    console.log(p.pushed ? "committed and pushed" : `committed (${p.reason})`);
  }
}
// No build here: the next question to the brain rebuilds its index by itself.
