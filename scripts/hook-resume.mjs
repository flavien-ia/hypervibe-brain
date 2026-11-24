#!/usr/bin/env node
// hook-resume.mjs - When a session starts again over a summary of itself
// (SessionStart with source "compact": Claude Code compacted a long
// conversation), slips into the AI's context one short instruction: read
// again the brain's lessons on the subject in progress before going on.
//
// Why (2026-11-22): an audit of real conversations. After a summary, the
// lessons read at the start of the conversation were gone with the rest, and
// the AI made again the mistake it had been told not to make. The hook does
// not search itself: it does not know the subject, the AI does.
//
// Fast and light: it reads the brain's brain.json and nothing else
// (reminders.mjs), says nothing when there is no brain, when the session did
// not start over a summary, when the brain turned it off (brain.json,
// reminders.resume: false) or for a background reader of the brain. It never
// fails and never blocks.

import { readFileSync } from "node:fs";
import { brainSettings, resumeText } from "./reminders.mjs";

const quiet = () => process.exit(0);
try {
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    input = {};
  }
  // The hook is declared for "compact" only (hooks.json); checked again here,
  // so that a declaration of before, or a hand-made one, says nothing at an
  // ordinary start.
  if (input.source !== "compact") quiet();
  if (/^ai:/.test(process.env.HVBRAIN_WHO ?? "")) quiet();
  const b = brainSettings();
  if (!b?.resume) quiet();
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: resumeText(b) } }));
} catch {
  // a comfort, never a failure
}
process.exit(0);
