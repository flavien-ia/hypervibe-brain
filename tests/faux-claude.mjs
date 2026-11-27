#!/usr/bin/env node
// faux-claude.mjs - Claude's place in the test bench (HVBRAIN_CLAUDE): what a
// judge runs instead of `claude -p`. No model, no network, no secret. It reads
// the prompt on its standard input, as Claude does, and says in a log what it
// was asked, so that the bench can count the passes of a judge.
//
//   FAUX_CLAUDE_LOG   a file: one JSON line per pass ({ at, args, items })
//   FAUX_CLAUDE_EXIT  the exit code (0 by default); not 0: a pass that failed,
//                     with a sentence on the error output, as an expired login gives
//   FAUX_CLAUDE_SAYS  that sentence, when another failure is played (the network)
//   FAUX_CLAUDE_ADD   the file of a pile: during its FIRST pass, an item is
//                     added to it, as a source would while the judge is at work
//   FAUX_CLAUDE_PROMPT  a file: what the last pass was told, its system prompt
//                     then its message; and beside it, "<file>.message", the
//                     message alone (what changes from a pass to the next)
//   FAUX_CLAUDE_LAZY  a number: the pass opens only that many of its items
//                     (all of them by default), as a model that stops early
//   FAUX_CLAUDE_TOKENS  a number: the pass answers as Claude does when asked
//                     for JSON, and says it used that many tokens in all (a
//                     judge's daily cap counts them)
//
// The log also says WHICH token the pass was given, as a fingerprint (never
// the token: the bench compares it with the fingerprints of its made-up
// ones), and whether an API key was in its environment.

//
// It also stands for `claude plugin enable | disable <plugin>@<marketplace>`
// (2026-11-27), which the executive floor runs to switch a harness: it writes
// enabledPlugins in the settings of the bench's home (HVBRAIN_HOME, never the
// person's), as Claude does, and fails when the plugin is already so.
//   FAUX_CLAUDE_PLUGIN  "absent": a Claude without that command (it fails and
//                     writes nothing; the floor then goes by the settings)

import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { opened } from "../scripts/readers/opened.mjs";

if (process.argv[2] === "plugin") {
  const [, verb, plugin] = process.argv.slice(2);
  if (process.env.FAUX_CLAUDE_LOG) appendFileSync(process.env.FAUX_CLAUDE_LOG, `${JSON.stringify({ at: new Date().toISOString(), args: process.argv.slice(2) })}\n`, "utf8");
  const home = process.env.HVBRAIN_HOME;
  if (!home || process.env.FAUX_CLAUDE_PLUGIN === "absent" || !/^(enable|disable)$/.test(verb ?? "") || !plugin) {
    console.error("error: unknown command 'plugin'");
    process.exit(1);
  }
  const file = join(home, ".claude", "settings.json");
  let settings = {};
  try {
    settings = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    settings = {};
  }
  const want = verb === "enable";
  if ((settings.enabledPlugins?.[plugin] !== false) === want) {
    console.log(`Plugin "${plugin}" is already ${want ? "enabled" : "disabled"}`);
    process.exit(1);
  }
  settings.enabledPlugins = { ...(settings.enabledPlugins ?? {}), [plugin]: want };
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(file, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  console.log(`Successfully ${want ? "enabled" : "disabled"} plugin: ${plugin} (scope: user)`);
  process.exit(0);
}

const prompt = readFileSync(0, "utf8");
const items = prompt.split("\n").filter((l) => /^\d+\. .*\(.+\)$/.test(l.trim())).length;
const log = process.env.FAUX_CLAUDE_LOG;
const first = !log || !existsSync(log);
const pile = process.env.FAUX_CLAUDE_ADD;
if (pile && first) {
  const p = JSON.parse(readFileSync(pile, "utf8"));
  p.items.push({ at: new Date().toISOString(), ref: "test:arrived-meanwhile", title: "Arrived while the judge was at work" });
  writeFileSync(pile, `${JSON.stringify(p)}\n`, "utf8");
}
// The system prompt comes in a file (--system-prompt-file), as Claude reads it.
const told = process.argv.slice(2);
let system = "";
try {
  system = told.includes("--system-prompt-file") ? readFileSync(told[told.indexOf("--system-prompt-file") + 1], "utf8") : "";
} catch {
  system = "";
}
if (process.env.FAUX_CLAUDE_PROMPT) {
  writeFileSync(process.env.FAUX_CLAUDE_PROMPT, `${system}\n${prompt}`, "utf8");
  writeFileSync(`${process.env.FAUX_CLAUDE_PROMPT}.message`, prompt, "utf8");
}
const given = process.env.CLAUDE_CODE_OAUTH_TOKEN;
if (log) appendFileSync(log, `${JSON.stringify({ at: new Date().toISOString(), args: process.argv.slice(2), items, system: system.slice(0, 60), token: given ? createHash("sha256").update(given).digest("hex").slice(0, 12) : null, apiKey: Boolean(process.env.ANTHROPIC_API_KEY) })}\n`, "utf8");
// It "reads" its items as the readers would have it do: each one opened
// leaves its trace (readers/opened.mjs), which the judge counts.
const refs = prompt.split("\n").map((l) => /^\d+\. .*\((.+)\)$/.exec(l.trim())?.[1]).filter(Boolean);
const lazy = process.env.FAUX_CLAUDE_LAZY;
for (const ref of lazy === undefined || lazy === "" ? refs : refs.slice(0, Number(lazy) || 0)) opened(ref);
const code = Number(process.env.FAUX_CLAUDE_EXIT || 0);
if (code) {
  console.error(process.env.FAUX_CLAUDE_SAYS || "the login expired");
  process.exit(code);
}
const text = `Read ${items} item(s).\n0 fact added, 0 note created, 0 proposal.`;
const tokens = Number(process.env.FAUX_CLAUDE_TOKENS || 0);
if (tokens > 0) {
  // Mostly read again from the cache, as a real judge's pass is.
  const part = Math.floor(tokens / 10);
  console.log(JSON.stringify({ type: "result", is_error: false, result: text, num_turns: 3, total_cost_usd: 0.1, usage: { input_tokens: part, output_tokens: part, cache_creation_input_tokens: part, cache_read_input_tokens: tokens - 3 * part } }));
} else console.log(text);
