#!/usr/bin/env node
// hook-skill.mjs - PreToolUse (the Skill tool) and UserPromptSubmit (a
// /command typed): notes that a skill is being used, for the live view, which
// lights it in the crown of the harnesses (live/page/executive.js).
//
// WHY (2026-11-23). The live view showed what the AI reads and writes in the
// knowledge; what it does with its skills stayed unseen. The end-of-answer
// hook already lists the skills called (hook-journal.mjs, for the sources
// waiting for one), but only once the answer is over: this one notes each
// skill the moment it starts.
//
// Only the name of the skill and the conversation, never the text. A tiny
// local file, ~/.hypervibe-brain/skills-used.jsonl, kept to its last 300
// lines, never folded into the brain. It answers nothing: it never slows nor
// changes what the AI does. It imports nothing of the plugin, to start fast.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  process.exit(0);
}
let skill = "";
if (input.tool_name === "Skill") skill = String(input.tool_input?.skill ?? input.tool_input?.command ?? "");
else if (typeof input.prompt === "string") skill = /^\s*\/([\w.-]+(?::[\w.-]+)?)/.exec(input.prompt)?.[1] ?? "";
skill = skill.replace(/^\//, "").trim();
if (!/^[\w.-]+(?::[\w.-]+)?$/.test(skill)) process.exit(0);

try {
  const dir = join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain");
  const file = join(dir, "skills-used.jsonl");
  mkdirSync(dir, { recursive: true });
  appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), session: String(input.session_id || ""), skill })}\n`, "utf8");
  const all = readFileSync(file, "utf8").split("\n").filter(Boolean);
  if (all.length > 600) writeFileSync(file, `${all.slice(-300).join("\n")}\n`, "utf8");
} catch {
  // a comfort of the live view
}
process.exit(0);
