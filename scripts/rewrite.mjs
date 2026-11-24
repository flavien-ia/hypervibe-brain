#!/usr/bin/env node
// rewrite.mjs - Rewrites the body of a note, its title, or both, once the
// person agreed (a synthesis or a split of the weekly review, a correction
// asked in a chat, a title that says the thing badly).
// The front matter and the machine zones (<!-- x:auto -->...) stay exactly as
// they are (with a new body, the zones follow it at the end of the note; with
// a title alone, nothing under the front matter moves); the note's date of
// change is set to today; and the rewrite is in the brain's journal (what the
// note said before and after is kept, before.mjs: undo.mjs takes it back).
//
// WHY (2026-11-08): the review's agents rewrote three notes with a plain file
// write, and the live view showed white flows, writes without an author. Every
// write of Claude goes through a tool of the brain, and so into its journal;
// only the person's own edits by hand are found by the evening save.
//
//   node scripts/rewrite.mjs --note <slug> --file <body.md> --why "<what was agreed>" [--who <who>]
//   node scripts/rewrite.mjs --note <slug> --title "<the new title>" --why "<what was agreed>" [--who <who>]
//        (--file and --title together rewrite both at once)
//
// THE TITLE (2026-11-20). The name of the note's file (its slug) does not
// change: every link to it holds. Until then a title could only be changed by
// hand, a write without an author in the journal and without a way back.

import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";
import { ROOT, config, requireBrain, textProblem, today, vocab } from "./lib.mjs";
import { logEvent } from "./journal.mjs";
import { slugIndex, writeJudged } from "./notes.mjs";
import { keepBefore } from "./before.mjs";

requireBrain();
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o));
const note = opt("--note");
const file = opt("--file");
const why = opt("--why");
const title = opt("--title");
if (!note || (!file && !title) || !why) {
  out({ ok: false, error: 'usage: rewrite.mjs --note <slug> [--file <body.md>] [--title "<the new title>"] --why "<what was agreed>"' });
  process.exit(1);
}
const abs = slugIndex().get(note);
if (!abs || !existsSync(abs)) {
  out({ ok: false, error: `no note named ${note}` });
  process.exit(1);
}
if (title !== undefined && !String(title).trim()) {
  out({ ok: false, error: "a title cannot be empty" });
  process.exit(1);
}
if (file && !existsSync(file)) {
  out({ ok: false, error: `no file ${file}` });
  process.exit(1);
}

const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const cfg = config();
const ZONE = /<!-- ([a-z][a-z0-9-]*):auto -->[\s\S]*?<!-- \/\1:auto -->/g;
const before = readFileSync(abs, "utf8");
const nl = before.includes("\r\n") ? "\r\n" : "\n";
// READ AS EVERY OTHER TOOL READS A NOTE (2026-11-21, lib.mjs parseFiche): a
// byte order mark is no reason to refuse it, and a closing line followed by a
// space is still the closing line. Read otherwise, the front matter went on
// down to the first rule of the body, and what stood before that rule stayed
// in front of the new body.
const BOM = String.fromCharCode(0xfeff);
const bom = before.startsWith(BOM) ? BOM : "";
const t = before.slice(bom.length).replace(/\r\n/g, "\n");
const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(t);
if (!m) fail("the note has no front matter");
const k = vocab(cfg).keys.updated;
let fm = `---\n${m[1]}\n---\n`.replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${today()}`);
if (title) {
  const line = new RegExp(`^${vocab(cfg).keys.title}:.*$`, "m");
  if (!line.test(fm)) fail("the note has no title in its front matter");
  fm = fm.replace(line, () => `${vocab(cfg).keys.title}: ${JSON.stringify(String(title).trim())}`);
}
const oldBody = m[2] ?? "";
let after;
let body;
if (file) {
  const raw = readFileSync(file, "utf8");
  const given = (raw.startsWith(BOM) ? raw.slice(1) : raw).replace(/\r\n/g, "\n");
  // A BODY IS A BODY (2026-11-21): a file that opens with a front matter of
  // its own became the body as it was, and the note had two.
  const own = /^\s*---[ \t]*\n([\s\S]*?)\n---[ \t]*(\n|$)/.exec(given);
  if (own && own[1].split("\n").filter((l) => l.trim()).every((l) => /^([A-Za-z_][\w-]*:|\s*-\s)/.test(l))) fail("the file of the new body opens with a front matter of its own: give the body alone (the note keeps its front matter, a title is changed with --title)");
  const zones = [...oldBody.matchAll(ZONE)].map((z) => z[0]);
  // An opening machine line without its end is kept as it is too.
  const loose = oldBody.replace(ZONE, "").split("\n").filter((l) => /^<!-- [a-z][a-z0-9-]*:auto -->/.test(l.trim()));
  body = given.replace(ZONE, "").trim();
  if (body.length < 40) fail("the new body is nearly empty: refused");
  const tail = [...loose, ...zones];
  after = `${fm}\n${body}\n${tail.length ? `\n${tail.join("\n\n")}\n` : ""}`;
} else {
  // A TITLE ALONE: everything under the front matter stays where it is, to
  // the letter. (The machine zones were sent to the end of the note, whatever
  // their place, 2026-11-21.)
  body = oldBody.trim();
  after = `${fm}${oldBody}`;
}
// What this brain never writes (brain.json, neverWrite) is refused here as at any other write.
const tp = textProblem(`${title ?? ""}\n${file ? body : ""}`, cfg);
if (tp) fail(tp);
if (after === t) {
  out({ ok: true, note, unchanged: true });
  process.exit(0);
}
// Written and judged as any other write of a note (notes.mjs): beside, then
// renamed, and a note the brain's own judge refuses goes back to what it was.
try {
  writeJudged(abs, bom + after.replace(/\n/g, nl), cfg, before);
} catch (e) {
  fail(`the brain's own judge refuses the note as it would be, it was left as it was: ${e.message}`);
}
const id = logEvent({ act: "write", who: opt("--who") || process.env.HVBRAIN_WHO || "ai", note, what: "rewritten", from: why, text: why });
keepBefore(id, relative(ROOT, abs).replaceAll("\\", "/"), before, bom + after);
out({ ok: true, note, rel: relative(ROOT, abs).replaceAll("\\", "/"), ...(title ? { title: String(title).trim() } : {}), chars: { before: oldBody.trim().length, after: body.length }, event: id });
