#!/usr/bin/env node
// hook-suggest.mjs - At each message of the person (UserPromptSubmit), slips
// into the AI's context the few notes of the brain closest to the request,
// when there are any (suggest.mjs says why, and where the gate is).
//
// Fast path: a server that stays up keeps the index in memory and answers in
// a fraction of a second (the live view, live/server.mjs, at 127.0.0.1:47615,
// asked with its token, ~/.hypervibe-brain/live-token.json).
// Without it, the search runs here. It never fails and never blocks: on any
// trouble it says nothing, and the conversation goes on.
//
// A SECOND AND A HALF, THEN SILENCE (2026-11-21). The person's message waits
// for this hook. When the live view was not up, the search ran here and
// REBUILT THE INDEX first: over a week, 192 messages out of 488 waited 6.4
// seconds in the median and 10 at worst, where the hook was killed (and the
// rebuild it had started was thrown away, for the next message to start
// again). Now nothing is ever built here: the index is read as it is
// (engine.mjs, currentDb), a few minutes late at worst, which a suggestion
// can live with. And the whole hook has a budget, counted from the start of
// its program, the embeddings API included: past it, it says nothing and
// leaves.
//
// What it costs is written in the usage journal (~/.hypervibe-brain/usage.jsonl,
// tool "(suggestion)"), like every call to the brain.
//
// A LESSON AT THE MOMENT IT IS BORN (2026-11-22). When the message reads like
// a correction or a rule ("stop doing that", "from now on..."), the hook adds
// a short instruction: save it in the brain as a lesson, in this very answer
// (reminders.mjs). It is said even when there is nothing to suggest, and even
// when the budget runs out.
//
// NOTHING FOR WHAT IS NOT THE PERSON (2026-11-22). Six suggestions in ten went
// to messages no person wrote: the brain's own background readers (their
// Claude runs with HVBRAIN_WHO=ai:<name>), a subagent handing back its report,
// a scheduled task, a message from another session. None was ever opened.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { brainSettings, correctionText, soundsLikeRule } from "./reminders.mjs";

const BUDGET = 1500;
/** Milliseconds left of the budget (the start of Node itself is counted). */
const left = () => Math.floor(BUDGET - process.uptime() * 1000);
// The embeddings key, when it lives in the Hypervibe vault and not in the
// brain's .env, is not asked for here: reading a vault starts a program that
// takes longer than the whole budget, and nothing can interrupt it. The live
// view's server, which keeps the key in memory, answers for those brains.
process.env.HVBRAIN_VAULT = "off";

const HOME = process.env.HVBRAIN_HOME || homedir();
const DIR = join(HOME, ".hypervibe-brain");
// The live view's port: BRAIN_LIVE_PORT, else the one `live.mjs on` kept in
// the settings when it was not the usual one, else 47615.
const keptPort = () => {
  try {
    return JSON.parse(readFileSync(join(DIR, "config.json"), "utf8")).routines?.live?.port;
  } catch {
    return undefined;
  }
};
const PORT = Number(process.env.BRAIN_LIVE_PORT || keptPort() || 47615);
const t0 = Date.now();

function quiet() {
  process.exit(0);
}

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  quiet();
}
const prompt = String(input.prompt ?? "");
const session = String(input.session_id ?? "").slice(0, 64);
if (!prompt.trim()) quiet();
// An automatic event (a background task ending, a scheduled job, a subagent's
// report, a background reader of the brain) is not the person asking: nothing
// to suggest, nothing to remind (seen on 2026-11-07, 120 tokens for nothing).
if (/^ai:/.test(process.env.HVBRAIN_WHO ?? "")) quiet();
if (/^\s*<(task-notification|system-reminder|ci-monitor-event|agent-message|scheduled-task|cross-session-message)\b/.test(prompt) || prompt.includes("[SYSTEM NOTIFICATION")) quiet();
// A report one session hands another, the brief a session leaves to the one
// it starts (2026-11-22): nobody typed them (same test as reminders.mjs).
if (/^\s*(another claude session sent a message|background \(from the session)/i.test(prompt)) quiet();

// The reminder of a lesson, when the message reads like one: decided here,
// before anything slow, so that it is said whatever happens next.
let reminder = "";
try {
  const b = brainSettings();
  if (b?.corrections && soundsLikeRule(prompt, b.phrases)) reminder = correctionText(b);
} catch {
  reminder = "";
}
/** Writes what the AI should read with the message, then leaves. */
function say(text) {
  const all = [reminder, text].filter(Boolean).join("\n\n");
  if (all) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: all } }));
  process.exit(0);
}
if (process.env.HVBRAIN_SUGGEST === "off") say("");

// The notes already suggested in this conversation: a small file, kept a week.
const SEEN = join(DIR, "suggested.json");
let seenAll = {};
try {
  seenAll = JSON.parse(readFileSync(SEEN, "utf8"));
} catch {
  seenAll = {};
}
const seen = new Set(seenAll[session]?.slugs ?? []);

/** One line in the usage journal: every message is looked at, only some get a suggestion. */
function logUsage(line) {
  try {
    mkdirSync(DIR, { recursive: true });
    appendFileSync(join(DIR, "usage.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), client: "hook", conv: session.slice(0, 12) || undefined, tool: "(suggestion)", what: prompt.replace(/\s+/g, " ").slice(0, 160), in: prompt.length, ms: Date.now() - t0, ...line })}\n`, "utf8");
  } catch {
    // a comfort, never a failure
  }
}

// THE END OF THE BUDGET: whatever is still waiting (the server, the API), the
// hook says nothing and leaves. Its line in the journal says it ran out of
// time: a hook that was killed used to leave no trace at all.
setTimeout(() => {
  logUsage({ out: reminder.length, tokIn: Math.round(reminder.length / 3.5), tokOut: 0, ok: false, n: 0, by: "out of time", ...(reminder ? { reminder: true } : {}) });
  say("");
}, Math.max(0, left()));

async function viaServer() {
  // A server that is not there refuses at once; one that is busy gets two
  // thirds of the budget, the rest is for the search here.
  // The live view answers only who shows its token (2026-11-21): the file it
  // writes at its start, readable by this account alone.
  let token = "";
  try {
    token = String(JSON.parse(readFileSync(join(DIR, "live-token.json"), "utf8")).token ?? "");
  } catch {
    token = "";
  }
  const r = await fetch(`http://127.0.0.1:${PORT}/api/suggest`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { "x-brain-token": token } : {}) },
    body: JSON.stringify({ prompt, seen: [...seen] }),
    signal: AbortSignal.timeout(Math.max(50, Math.min(1000, left() - 100))),
  });
  if (!r.ok) throw new Error(`server ${r.status}`);
  return { ...(await r.json()), via: "server" };
}

async function here() {
  const { hasBrain, config } = await import("./lib.mjs");
  if (!hasBrain()) return { text: "", notes: [], lessons: [] };
  const { currentDb } = await import("./engine.mjs");
  const { suggest, render } = await import("./suggest.mjs");
  // The index as it is: nothing is built here, ever.
  const db = currentDb();
  try {
    const s = await suggest(db, prompt, { seen, timeout: Math.max(50, left() - 150) });
    return { ...s, text: render(s, { fr: (config().lang ?? config().format) === "fr" }), via: "here" };
  } finally {
    db.close();
  }
}

let res;
try {
  res = await viaServer();
} catch {
  try {
    res = await here();
  } catch {
    say("");
  }
}

const slugs = [...(res.notes ?? []), ...(res.lessons ?? [])].map((r) => r.slug);
try {
  mkdirSync(DIR, { recursive: true });
  if (slugs.length && session) {
    const week = Date.now() - 7 * 86_400_000;
    for (const [k, v] of Object.entries(seenAll)) if (!v.at || Date.parse(v.at) < week) delete seenAll[k];
    seenAll[session] = { at: new Date().toISOString(), slugs: [...seen, ...slugs] };
    writeFileSync(SEEN, JSON.stringify(seenAll), "utf8");
  }
} catch {
  // a comfort, never a failure
}
const chars = (res.text?.length ?? 0) + reminder.length;
// (2026-11-22) The best closeness of the message goes in the journal: the
// next calibration of the gate is made on real messages, not on a guess.
logUsage({ out: chars, tokIn: Math.round(chars / 3.5), tokOut: 0, ok: true, n: slugs.length, slugs: slugs.length ? slugs : undefined, by: res.via, ...(res.best !== undefined ? { best: res.best } : {}), ...(reminder ? { reminder: true } : {}) });
say(res.text ?? "");
