#!/usr/bin/env node
// promote.mjs - Validates a note: its status goes from "seed" (written by the
// machine, not validated yet) to "trusted" (validated by the person), or back.
//
// THE MACHINE CREATES, IT DOES NOT VALIDATE (the post-veto rule, notes.mjs):
// only the person makes a note trusted. Until 2026-11-21 that was done by
// editing the note's file by hand: a write without an author in the journal,
// and without a way back. It is now a tool of the brain like the others: one
// line of the front matter changes (and the date of the last change), the
// write is in the brain's journal, and undo.mjs takes it back.
//
//   node scripts/promote.mjs --note <slug> [--to trusted|seed] [--who person|ai]
//   node scripts/promote.mjs --notes <slug1,slug2,...> [--to trusted|seed] [--who person|ai]
//
// --to     trusted (the default) or seed, in the canonical words or the brain's own
// --who    person (the default) or ai. An AI is REFUSED for --to trusted, and a
//          background Claude of the brain (HVBRAIN_WHO=ai:<source>) is an AI
//          whatever it says. An AI may send a note back to seed.
// --notes  several notes at once (the person validates a batch in the live
//          view or in a review): each note is a write of its own in the
//          journal, undone alone; a note that cannot be changed does not stop
//          the others.
//
// Prints ONE line of JSON:
//   { "ok": true, "note": "<slug>", "status": "trusted", "event": "<id>" }
//   { "ok": true, "note": "<slug>", "status": "trusted", "unchanged": true }   already in that state
//   { "ok": false, "error": "<why>" }                                           and exits with 1
// and with --notes:
//   { "ok": true, "status": "trusted", "done": [{ "note", "event" }], "unchanged": ["<slug>"], "refused": [{ "note", "error" }] }

import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { ROOT, hasBrain, parseFiche, today, vocab, writeFileAtomic } from "./lib.mjs";
import { logEvent } from "./journal.mjs";
import { slugIndex } from "./notes.mjs";
import { keepBefore } from "./before.mjs";

const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};

if (!hasBrain()) fail("no brain set up on this computer yet");
const note = opt("--note");
const many = opt("--notes");
const usage = "usage: promote.mjs --note <slug> | --notes <slug1,slug2,...> [--to trusted|seed] [--who person|ai]";
if ((!note && !many) || (note && many)) fail(usage);
const voc = vocab();
// The state asked for, in the canonical words or in the brain's own ("fiable", "graine").
const asked = String(opt("--to") ?? "trusted");
const to = ["trusted", "seed"].find((s) => s === asked || voc.status[s] === asked);
if (!to) fail(`--to is trusted or seed (${voc.status.trusted} or ${voc.status.seed} in this brain), not "${asked}"`);
// Who asks. A background Claude of the brain says so in its environment: it
// cannot pass for the person by leaving --who out.
const said = String(opt("--who") ?? "person");
const env = String(process.env.HVBRAIN_WHO ?? "");
const who = /^ai(:|$)/.test(env) ? env : said;
if (who !== "person" && !/^ai(:|$)/.test(who)) fail(`--who is person or ai, not "${said}"`);
// (Said once for the whole call, a batch too: nothing is written for an AI that validates.)
if (to === "trusted" && who !== "person") fail("only the person validates a note: the machine creates, it does not validate");

const index = slugIndex();

/**
 * One note to the state asked for. Throws with the reason when it cannot be.
 * @returns {{ unchanged: true } | { event: string | null }}
 */
function promote(slug) {
  const abs = index.get(slug);
  if (!abs) throw new Error(`no note named ${slug}`);
  const rel = relative(ROOT, abs).replaceAll("\\", "/");
  let status = "";
  try {
    status = String(parseFiche(abs, voc).fm.status ?? "");
  } catch (e) {
    throw new Error(`the note cannot be read (${e.message}): repair it first`);
  }
  if (status === "archived") throw new Error("an archived note is history: it is neither validated nor sent back to seed here");
  if (status === to) return { unchanged: true };

  // Only the line of the status changes, and the date of the last change: the
  // front matter is read as every tool reads it (lib.mjs parseFiche), the rest
  // of the file stays to the letter, with its line endings.
  const before = readFileSync(abs, "utf8");
  const nl = before.includes("\r\n") ? "\r\n" : "\n";
  const bom = before.charCodeAt(0) === 0xfeff ? before[0] : "";
  const t = before.slice(bom.length).replace(/\r\n/g, "\n");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n[\s\S]*)?$/.exec(t);
  if (!m) throw new Error("the note has no front matter");
  const line = new RegExp(`^${voc.keys.status}:.*$`, "m");
  if (!line.test(m[1])) throw new Error(`the note has no ${voc.keys.status} in its front matter`);
  const fm = m[1].replace(line, () => `${voc.keys.status}: ${voc.status[to]}`).replace(new RegExp(`^${voc.keys.updated}:.*$`, "m"), () => `${voc.keys.updated}: ${today()}`);
  const after = `---\n${fm}${t.slice(4 + m[1].length)}`;
  const written = bom + after.replace(/\n/g, nl);
  // Written beside, then renamed (never half a note), and read again: a note
  // that no longer says the state asked for goes back to what it was.
  writeFileAtomic(abs, written);
  let now = "";
  try {
    now = String(parseFiche(abs, voc).fm.status ?? "");
  } catch {
    now = "";
  }
  if (now !== to) {
    writeFileAtomic(abs, before);
    throw new Error("the status could not be changed: the note was left as it was");
  }
  const id = logEvent({ act: "write", who, note: slug, what: to === "trusted" ? "validated" : "unvalidated", status: to, was: status });
  // What the note said before and after, kept: undo.mjs takes this write back, and only it.
  keepBefore(id, rel, before, written);
  return { event: id };
}

if (note) {
  try {
    const r = promote(note);
    out({ ok: true, note, status: to, ...r });
  } catch (e) {
    fail(e.message);
  }
} else {
  const slugs = [...new Set(String(many).split(",").map((s) => s.trim()).filter(Boolean))];
  if (!slugs.length) fail(usage);
  const done = [];
  const unchanged = [];
  const refused = [];
  for (const slug of slugs) {
    try {
      const r = promote(slug);
      if (r.unchanged) unchanged.push(slug);
      else done.push({ note: slug, event: r.event });
    } catch (e) {
      refused.push({ note: slug, error: e.message });
    }
  }
  out({ ok: true, status: to, done, unchanged, refused });
}
