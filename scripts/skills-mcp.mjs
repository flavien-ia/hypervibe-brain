// skills-mcp.mjs - The skills of the brain's executive floor, served by the
// MCP server to an AI that is not Claude Code: as MCP prompts (the person
// picks one, in a client that shows them) and through the brain_skill tool
// (the AI reads one by itself, in a client that only knows tools).
//
// WHY (2026-11-23). The executive floor keeps the person's skills in the
// brain, so that another AI plugged into the brain loses nothing. Claude Code
// finds them by itself, through the links in ~/.claude/skills: for it, this
// file serves nothing (a skill would show twice). Another AI (Codex, Cursor,
// Claude Desktop, ChatGPT...) has no such folder: the brain's server hands the
// skill over, and translates what in it speaks only to Claude Code.
//
// WHAT IS TRANSLATED. A skill is written for Claude Code: its tools by their
// names (Bash, Read, Edit, AskUserQuestion, Agent...), the other skills by
// their /command, its own folder as ${CLAUDE_SKILL_DIR}. The folder is
// replaced by its real path; the rest is said once, at the head of the text,
// in a short table of what each name means for an AI that has other tools.
// The skill's own words are not rewritten: a rewritten skill would be a
// second skill, and the person improves one.
//
// WHAT IS NOT CARRIED: THE GUARDS. A guard is a hook of Claude Code, run by
// Claude Code before a step; no MCP server can stop another AI's step. What
// the guards forbid or ask is given as rules, with the skill, so that the AI
// asks the person first: a rule kept by the AI's goodwill, not a lock, and
// the text says so.
//
// This file reads the floor's files; the words are in skills-text.mjs, which
// the cloud copy's Worker runs too (it reads the same skills from its
// database, sent by cloud.mjs sync). Read only, nothing written.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SKILL_TOOL, findSkill, guardRule, guardsAStep, nativeClient, promptItem, renderSkill, skillList, skillsSentence as sentence, splitSkill } from "./skills-text.mjs";

export { SKILL_TOOL, nativeClient };

const fwd = (p) => String(p).replaceAll("\\", "/");

/**
 * The skills of the floor: a folder of executive/skills with a SKILL.md (a
 * folder without one is shared by others, "_presta", not a skill).
 * @param {string} brainDir
 * @returns {{ name: string, description: string, folder: string, dir: string }[]}
 */
export function listSkills(brainDir) {
  const root = join(brainDir, "executive", "skills");
  if (!existsSync(root)) return [];
  const out = [];
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith(".")) continue;
    const file = join(root, d.name, "SKILL.md");
    if (!existsSync(file)) continue;
    try {
      const { name, description } = splitSkill(readFileSync(file, "utf8"));
      out.push({ name: name || d.name, description, folder: d.name, dir: fwd(join(root, d.name)) });
    } catch {
      // a skill that cannot be read is left out, never the end of the list
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * What each guard of the floor that stands before a step says it does.
 * @param {string} brainDir
 * @returns {{ file: string, rule: string }[]}
 */
export function guardRules(brainDir) {
  const floor = join(brainDir, "executive");
  let manifest = {};
  try {
    manifest = JSON.parse(readFileSync(join(floor, "guards.json"), "utf8"));
  } catch {
    return [];
  }
  const rules = [];
  for (const [file, g] of Object.entries(manifest ?? {})) {
    if (!guardsAStep(/** @type {any} */ (g)?.hooks)) continue;
    let rule = "";
    try {
      rule = guardRule(readFileSync(join(floor, "guards", file), "utf8"));
    } catch {
      rule = "";
    }
    rule ||= String(/** @type {any} */ (g)?.what ?? "");
    if (rule) rules.push({ file, rule });
  }
  return rules;
}

/** What a skill's folder holds besides its SKILL.md. @param {string} dir */
export function skillFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((d) => d.name !== "SKILL.md" && !d.name.startsWith(".")).map((d) => (d.isDirectory() ? `${d.name}/` : d.name));
  } catch {
    return [];
  }
}

/** The body of a skill's SKILL.md, its head apart. @param {string} dir */
export const skillBody = (dir) => splitSkill(readFileSync(join(dir, "SKILL.md"), "utf8")).body;

/**
 * A skill as another AI can follow it.
 * @param {string} brainDir
 * @param {string} name its name, or its folder
 * @param {{ request?: string }} [o] what the person asked, for the skill's $ARGUMENTS
 * @returns {{ ok: true, name: string, description: string, folder: string, text: string } | { ok: false, error: string, skills: string[] }}
 */
export function skillFor(brainDir, name, { request = "" } = {}) {
  const all = listSkills(brainDir);
  const skill = findSkill(all, name);
  if (!skill) return { ok: false, error: `no skill named "${name}" in this brain`, skills: all.map((s) => s.name) };
  const text = renderSkill({ name: skill.name, body: skillBody(skill.dir), dir: skill.dir, files: skillFiles(skill.dir), rules: guardRules(brainDir).map((r) => r.rule), request });
  return { ok: true, name: skill.name, description: skill.description, folder: skill.folder, text };
}

/** The skills as MCP prompts (prompts/list). @param {string} brainDir */
export const promptList = (brainDir) => listSkills(brainDir).map(promptItem);

/**
 * One prompt (prompts/get): the skill, translated, as a message of the person.
 * @param {string} brainDir
 * @param {string} name
 * @param {Record<string, string>} [args]
 */
export function promptGet(brainDir, name, args = {}) {
  const r = skillFor(brainDir, name, { request: args?.request ?? "" });
  if (!r.ok) return r;
  return { ok: true, result: { description: r.description, messages: [{ role: "user", content: { type: "text", text: r.text } }] } };
}

/**
 * The tool brain_skill. Without a name: the list. With one: the skill to follow.
 * @param {string} brainDir
 * @param {{ name?: string, request?: string }} args
 */
export function skillTool(brainDir, args = {}) {
  if (!args?.name) return { ok: true, result: skillList(listSkills(brainDir)) };
  const r = skillFor(brainDir, args.name, { request: args.request ?? "" });
  return r.ok ? { ok: true, result: r.text, raw: true } : { ok: false, error: `${r.error}; the skills are: ${r.skills.join(", ") || "none"}` };
}

/** The sentence of the instructions. @param {string} brainDir */
export const skillsSentence = (brainDir) => sentence(listSkills(brainDir).map((s) => s.name));
