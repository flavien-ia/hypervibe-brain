#!/usr/bin/env node
// undo.mjs - Takes back one write of the machine, named by its event in the
// brain's journal (P7: everything the machine writes is seen and undone in a
// sentence). The weekly letter numbers the writes of the week and keeps which
// number is which event (reviews/<day>-writes.json): "annule la 3" becomes
// `undo.mjs 3 --letter <day>`.
//
//   node scripts/undo.mjs <event id> [--force]
//   node scripts/undo.mjs <number> --letter <YYYY-MM-DD> [--force]
//
// What it does, by kind of write:
//   fact     the paragraph leaves the note (wherever it is now)
//   created  the note the machine created is removed. Its text is kept on this
//            computer for sixty days (before.mjs), and git keeps it too once a
//            save has seen it
//   updated, zone, rewritten, validated, unvalidated   the change of that write is
//            reversed, and only it, from what the note said before and after
//            (before.mjs): a later change of the same lines makes it refuse
//            rather than guess.
//            A write from before 2026-11-17, or made on another computer, was
//            not kept that way: it is reversed from the save that carried it,
//            and refused when that save carried another write of the note.
//   created  refused when the note has lived since: validated, edited by
//            hand, or written to again (--force removes it all the same)
// The person's own edits (who: hand) are never undone here.

import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keepRemoved, readBefore } from "./before.mjs";
import { ROOT, config, parseFiche, requireBrain, today, vocab, writeFileAtomic } from "./lib.mjs";
import { logEvent, readEvents } from "./journal.mjs";
import { sameContent, slugIndex } from "./notes.mjs";
import { tryGit } from "./git.mjs";

requireBrain();
const args = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
let id = args[0];
if (!id) fail("usage: undo.mjs <event id> | <number> --letter <YYYY-MM-DD>");
if (args.includes("--letter")) {
  const day = args[args.indexOf("--letter") + 1];
  const f = join(ROOT, "reviews", `${day}-writes.json`);
  if (!existsSync(f)) fail(`no numbered writes for the letter of ${day}`);
  id = JSON.parse(readFileSync(f, "utf8"))[String(id)];
  if (!id) fail(`no write numbered ${args[0]} in the letter of ${day}`);
}
// Every write of the journal, read once (every month of every computer: it
// was read five times for one undo).
const writes = readEvents({ act: "write" });
const e = writes.find((x) => x.id === id);
if (!e) fail(`no write ${id} in the brain's journal`);
if (e.who === "hand") fail("an edit by hand is the person's own: it is not undone here");
if (writes.some((x) => x.what === "undone" && x.undoes === id)) fail("already undone");
let keptText = null;
const abs = slugIndex().get(e.note);
const rel = abs ? abs.slice(ROOT.length + 1).replaceAll("\\", "/") : null;

if (e.what === "fact") {
  if (!abs) fail(`the note ${e.note} is gone`);
  const before = readFileSync(abs, "utf8");
  const nl = before.includes("\r\n") ? "\r\n" : "\n";
  const t = before.replace(/\r\n/g, "\n");
  if (!t.includes(e.text)) fail("the fact is no longer in the note (changed or removed since)");
  const k = vocab().keys.updated;
  // The paragraph leaves with the blank line that set it apart: what is before
  // and what is after meet again with one blank line, or the note ends on one
  // line break. (It left an empty line behind when it was the last paragraph,
  // and the next change at the end of the note was then refused.)
  const at = t.indexOf(e.text);
  const head = t.slice(0, at).replace(/\n+$/, "");
  const tail = t.slice(at + e.text.length).replace(/^\n+/, "");
  const next = (tail ? `${head}\n\n${tail}` : `${head}\n`).replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${today()}`);
  writeFileAtomic(abs, next.replace(/\n/g, nl));
} else if (e.what === "created") {
  if (!abs) fail(`the note ${e.note} is gone already`);
  const text = readFileSync(abs, "utf8");
  // A NOTE THAT HAS LIVED IS NOT REMOVED IN ONE CLICK (2026-11-17). Created by
  // the machine, then validated by the person, edited by hand, or written to
  // again: removing it would take all of that with it.
  if (!args.includes("--force")) {
    let status = "";
    try {
      status = String(parseFiche(abs).fm.status ?? "");
    } catch {
      status = "";
    }
    const undone = new Set(writes.filter((x) => x.what === "undone").map((x) => x.undoes));
    const later = writes.filter((x) => x.note === e.note && x.id !== id && x.what !== "undone" && String(x.at) > String(e.at) && !undone.has(x.id));
    if (status && status !== "seed") fail("the note has been validated since it was created: a later change touched the same lines, remove it by hand, with the person");
    if (later.length) fail(`the note was written to ${later.length} time(s) since it was created: a later change touched the same lines, undo those first or remove it by hand, with the person`);
    // EDITED BY HAND SINCE, SEEN WITHOUT WAITING FOR A SAVE (2026-11-21). The
    // journal only learns of an edit by hand at a save: a note retouched and
    // not saved yet left with its retouch. The note as it was created is kept
    // (capture.mjs): a text that differs now, with no write of the machine
    // since, was changed by hand.
    const made = readBefore(id);
    if (made && made.before === "" && !sameContent(text, made.after, config())) fail("the note was edited by hand since it was created: a later change touched the same lines, remove it by hand, with the person");
  }
  // WHAT IS REMOVED IS KEPT (2026-11-21). "Git keeps it" was only true of a
  // note a save had seen: a judge's seed waits up to an hour for its commit,
  // and undone within the hour it was gone for good. The text is kept on this
  // computer first; a note git does not hold as it is, is not removed when
  // that could not be done.
  keptText = keepRemoved(id, rel, text);
  if (!keptText) {
    const held = tryGit(["status", "--porcelain", "--", rel]);
    if (!held.ok || held.out.trim()) fail("the note was never saved and its text could not be kept on this computer: not removed (save the brain first, or remove it by hand)");
  }
  unlinkSync(abs);
} else if (["updated", "zone", "rewritten", "condensed", "validated", "unvalidated"].includes(e.what)) {
  if (!rel) fail(`the note ${e.note} is gone`);
  // THIS WRITE, AND ONLY IT (2026-11-17). What the note said before and after
  // was kept at the write (before.mjs): the change from "after" back to
  // "before" is applied to the note as it is now, by git's own three-way merge
  // of files. A later change elsewhere in the note stays; a later change of the
  // same lines is a conflict, and nothing is written. No save is needed.
  const kept = readBefore(id);
  if (kept) {
    const raw = readFileSync(abs, "utf8");
    const nl = raw.includes("\r\n") ? "\r\n" : "\n";
    const current = raw.replace(/\r\n/g, "\n");
    let next = null;
    if (current === kept.after) next = kept.before;
    else {
      // THE DATE OF THE LAST CHANGE IS NOT A CHANGE OF THE SAME LINES
      // (2026-11-21). Every write of the machine sets that line: a fact added
      // another day, anywhere in the note, changed it again, and the merge saw
      // the same line changed on both sides. The undo of a rewrite was then
      // refused as soon as anything dated had followed it. The three texts are
      // given the note's present date line before the merge, and today's date
      // is set on the result.
      const k = vocab().keys.updated;
      const dateLine = new RegExp(`^${k}:.*$`, "m");
      const stamp = dateLine.exec(current)?.[0];
      const dated = (t) => (stamp ? t.replace(dateLine, () => stamp) : t);
      const dir = mkdtempSync(join(tmpdir(), "hvb-undo-"));
      try {
        writeFileSync(join(dir, "current"), current, "utf8");
        writeFileSync(join(dir, "after"), dated(kept.after), "utf8");
        writeFileSync(join(dir, "before"), dated(kept.before), "utf8");
        // merge-file <current> <base> <other>: what changed from base to other, brought into current.
        const m = tryGit(["merge-file", "-p", join(dir, "current"), join(dir, "after"), join(dir, "before")], { raw: true });
        // (Nothing left of this write: said below, the note is not touched for its date alone.)
        if (m.ok) next = stamp && m.out !== current ? m.out.replace(dateLine, () => `${k}: ${today()}`) : m.out;
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (next === null) fail("a later change touched the same lines: undo it by hand, with the person");
    if (next === current) fail("nothing of this write is left to undo");
    writeFileAtomic(abs, next.replace(/\n/g, nl));
  } else {
  // Not kept (a write from before 2026-11-17, or made on another computer):
  // the commit that carried it, the first one touching the file after it.
  const commits = tryGit(["log", "--reverse", "--format=%H %cI", `--since=${e.at}`, "--", rel]).out.trim().split("\n").filter(Boolean);
  if (!commits.length) fail("this write is not saved yet: undo it after the next save");
  // One save an hour can carry several writes of the same note: reversing the
  // save would take them all back. Refused rather than guessed.
  const savedAt = commits[0].split(" ")[1] ?? "";
  const together = writes.filter((x) => x.note === e.note && x.id !== id && x.what !== "undone" && String(x.at) > String(e.at) && (!savedAt || Date.parse(x.at) <= Date.parse(savedAt)));
  if (together.length) fail(`${together.length} other write(s) of this note were saved together with this one: a later change touched the same lines, undo it by hand, with the person`);
  commits[0] = commits[0].split(" ")[0];
  const diff = tryGit(["diff", `${commits[0]}^`, commits[0], "--", rel], { raw: true }).out;
  if (!diff.trim()) fail("nothing of this write is left to undo");
  const tmp = join(ROOT, ".undo.patch");
  writeFileSync(tmp, diff, "utf8");
  const r = tryGit(["apply", "-R", "--whitespace=nowarn", tmp]);
  unlinkSync(tmp);
  if (!r.ok) fail("a later change touched the same lines: undo it by hand, with the person");
  }
} else fail(`a write "${e.what}" cannot be undone here`);

const undone = logEvent({ act: "write", who: process.env.HVBRAIN_WHO || "person", note: e.note, what: "undone", undoes: id });
out({ ok: true, undone: id, note: e.note, what: e.what, event: undone, ...(keptText ? { kept: keptText.replaceAll("\\", "/") } : {}) });
