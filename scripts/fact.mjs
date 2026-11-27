#!/usr/bin/env node
// fact.mjs - Adds a fact to a note of the brain: the machine keeping the brain
// live (P7, writing rule 7). One paragraph that says where it comes from, at
// the end of the note's text; refused where the rule says the machine only
// proposes (a validated decision, lesson, concept or idea). Every fact is in
// the brain's journal, and undo.mjs takes it back.
//
//   node scripts/fact.mjs --note <slug> --text "<the fact, with where it comes from>" --from <address> [--who <who>]
//
// --from: the address of the origin (gmail:<id>, dropbox://..., a URL): kept
// by the journal, so that the weekly letter can say where each fact came from.
// --who: who writes, when nothing else says it. A background Claude of the
// brain says so in its environment (HVBRAIN_WHO=ai:<source>) and stays it
// whatever --who says (2026-11-27, as promote.mjs does): with --who it passed
// for somebody else, and the guard of the amounts did not hold for it.

import { config, requireBrain } from "./lib.mjs";
import { logEvent } from "./journal.mjs";
import { addFact } from "./notes.mjs";

requireBrain();
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o));
const note = opt("--note");
const text = opt("--text");
const from = opt("--from");
// Who writes: what the environment says of a background Claude wins over --who.
const env = String(process.env.HVBRAIN_WHO ?? "");
const who = /^ai(:|$)/.test(env) ? env : opt("--who") || env || "ai";
if (!note || !text || !from) {
  out({ ok: false, error: "usage: fact.mjs --note <slug> --text \"...\" --from <address>" });
  process.exit(1);
}
try {
  // A JUDGE (who: ai:<source>) never writes an amount that is data in a tool
  // (money.mjs, the rule of 2026-11-09).
  if (/^ai:/.test(who)) {
    const { recordedAmount, AMOUNT_REFUSAL } = await import("./money.mjs");
    const s = recordedAmount(text);
    if (s) throw new Error(AMOUNT_REFUSAL(s));
    // Nothing of its own environment (its token) may be written in the brain.
    for (const [k, v] of Object.entries(process.env)) {
      if (/token|secret|key|password/i.test(k) && typeof v === "string" && v.length >= 16 && String(text).includes(v)) throw new Error("this text holds a key of this computer: nothing was written");
    }
  }
  const r = addFact(note, text, config());
  const id = logEvent({ act: "write", who, note, what: "fact", from, text: String(text).replace(/\s+/g, " ").trim() });
  out({ ok: true, note, rel: r.rel, event: id });
} catch (e) {
  // Where the rule keeps the change for the person, it is not lost: it becomes
  // a proposal of the weekly letter, kept in the brain's journal.
  const proposal = /thinking/.test(e.message);
  if (proposal) logEvent({ act: "signal", who, what: "proposal", note, from, text: String(text).replace(/\s+/g, " ").trim() });
  // Any other refusal (a near twin, a fact already there...) is counted too:
  // the measure of the judge says how often it tried to write twice. The text
  // of a fact refused as a near twin is kept with it (2026-11-21): refused by
  // mistake, it can be found again. Only that one: a text refused for what it
  // holds (an amount, what this brain never writes) must not enter the journal.
  else logEvent({ act: "signal", who, what: "refused", note, from, reason: String(e.message).slice(0, 160), ...(/saying nearly the same/.test(e.message) ? { text: String(text).replace(/\s+/g, " ").trim().slice(0, 600) } : {}) });
  out({ ok: false, note, error: e.message, proposed: proposal || undefined });
  process.exit(1);
}
