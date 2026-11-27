// skills-text.mjs - What the brain says of a skill to an AI that is not
// Claude Code: the head of a SKILL.md read, the skill translated, the tool
// that serves it. Pure, no import: the MCP server of the computer
// (skills-mcp.mjs, which reads the files) and the cloud copy's Worker
// (templates/cloud/worker.js, which reads its database) say the same words.
// Why and what is translated: see skills-mcp.mjs.

/**
 * Claude Code says who it is when it connects ("claude-code"): it finds the
 * skills by itself and runs the guards itself.
 * @param {string} client the clientInfo.name given at the handshake
 */
export const nativeClient = (client) => /claude[-_ ]?code/i.test(String(client ?? ""));

/**
 * The head of a SKILL.md, its body apart. A value may be quoted, or folded on
 * the lines after it (description: >).
 * @param {string} text
 * @returns {{ name: string, description: string, body: string, cloud: boolean }}
 */
export function splitSkill(text) {
  const t = String(text).replace(/^﻿/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(t);
  const head = m?.[1] ?? "";
  /** @param {string} k */
  const field = (k) => {
    const line = new RegExp(`^${k}:[ \\t]*(.*)$`, "m").exec(head);
    if (!line) return "";
    let v = line[1].trim();
    if (/^[>|][-+]?$/.test(v)) {
      const rest = head.slice(line.index + line[0].length).split(/\r?\n/).slice(1);
      const folded = [];
      for (const l of rest) {
        if (/^\S/.test(l)) break;
        folded.push(l.trim());
      }
      v = folded.join(" ").trim();
    }
    return v.replace(/^["']|["']$/g, "");
  };
  // `cloud: false` in the head keeps a skill on the computer (2026-11-27): it
  // is never sent to the brain's cloud copy, whatever else was chosen.
  return { name: field("name"), description: field("description"), body: m ? t.slice(m[0].length) : t, cloud: !/^(false|no|non|off)$/i.test(field("cloud")) };
}

/**
 * What a guard says it does, from the comment at its head: the first
 * paragraph, and the next one when the first only names the guard ("the
 * messages app, for Claude."): the rule is what it allows and refuses.
 * @param {string} source the guard's code
 */
export function guardRule(source) {
  const lines = String(source).split(/\r?\n/).filter((l, i) => !(i === 0 && l.startsWith("#!")));
  /** @type {string[][]} */
  const paragraphs = [[]];
  for (const l of lines) {
    const m = /^\s*\/\/(.*)$/.exec(l);
    if (!m) break;
    const last = /** @type {string[]} */ (paragraphs.at(-1));
    if (!m[1].trim()) {
      if (last.length) paragraphs.push([]);
      continue;
    }
    last.push(m[1].trim());
  }
  const texts = paragraphs.filter((p) => p.length).map((p) => p.join(" "));
  const rule = (texts[0] ?? "").length < 100 && texts[1] ? `${texts[0]} ${texts[1]}` : (texts[0] ?? "");
  const kept = rule.replace(/^[\w.-]+\.m?js\s*[-:]\s*/i, "");
  return kept.length > 400 ? `${kept.slice(0, 397)}...` : kept;
}

/** A hook that stands before a step (and so frames it), not one that plays a sound at the end. @param {{ event?: string }[]} hooks */
export const guardsAStep = (hooks) => (hooks ?? []).some((h) => /^(PreToolUse|PermissionRequest)$/.test(String(h?.event ?? "")));

// What the names of Claude Code mean for another AI. Said once, at the head.
const GLOSSARY = [
  "This skill was written for Claude Code. Follow it with your own tools; where it names one of Claude Code's, use yours:",
  "- Bash / PowerShell: run the command in your shell or terminal tool (if you have none, show the command to the person and ask them to run it).",
  "- Read, Write, Edit, Glob, Grep: your tools to read, write, change and search files.",
  "- AskUserQuestion: ask the person in the chat, as numbered questions, and wait for the answer.",
  "- Agent / Task (a subagent): do that part yourself, step by step.",
  "- WebFetch / WebSearch: your web tools, if you have them.",
  "- Skill, or another skill named by its /command: call brain_skill with its name to read it, then follow it.",
  "- mcp__<server>__<tool>: the tool of that MCP server, if you are connected to it; mcp__plugin_brain_brain__<tool> is this brain's own tool of that name.",
  "- TodoWrite: keep the list of steps in the chat.",
];

/**
 * A skill as another AI can follow it. `dir`: its folder, when the AI runs on
 * the computer that holds it; null in the cloud, where the folder is out of
 * reach and only named.
 * @param {{ name: string, body: string, dir: string | null, files: string[], rules: string[], request?: string }} s
 */
export function renderSkill({ name, body, dir, files, rules, request = "" }) {
  const asked = String(request ?? "").trim();
  const place = dir ?? "(the skill's folder, on the person's computer)";
  const text = String(body).replaceAll("${CLAUDE_SKILL_DIR}", place).replaceAll("$ARGUMENTS", asked || "(nothing more was asked)").trim();
  const held = files.length ? ` (it holds: ${files.join(", ")})` : "";
  const folder = dir
    ? `Its folder is ${dir}${held}: the paths it names are there.`
    : `Its folder is on the person's computer${held}, out of your reach: a step that runs one of its scripts, or needs the computer, is for the person to do there. Say so, and do the rest.`;
  return [
    `# The skill ${name}, from the brain`,
    GLOSSARY.join("\n"),
    folder,
    ...(rules.length
      ? [["On the person's computer, Claude Code runs guards before some steps. You are not run through them: keep their rules yourself, and ask the person before any step they cover:", ...rules.map((r) => `- ${r}`)].join("\n")]
      : []),
    ...(asked ? [`What the person asked: ${asked}`] : []),
    "---",
    text,
  ].join("\n\n");
}

/** One skill as an MCP prompt (prompts/list). @param {{ name: string, description: string }} s */
export const promptItem = (s) => ({
  name: s.name,
  title: s.name,
  description: s.description.length > 1000 ? `${s.description.slice(0, 997)}...` : s.description,
  arguments: [{ name: "request", description: "What you want, in your words (optional)", required: false }],
});

/** The list brain_skill gives without a name. @param {{ name: string, description: string }[]} skills */
export const skillList = (skills) => ({
  skills: skills.map((s) => ({ name: s.name, description: s.description.length > 300 ? `${s.description.slice(0, 297)}...` : s.description })),
  how: "Call brain_skill again with the name of the one that fits, and follow what it says.",
});

/** The skill a name asks for: by its name or its folder, a leading / understood. @template {{ name: string, folder: string }} T @param {T[]} skills @param {string} name @returns {T | undefined} */
export function findSkill(skills, name) {
  const want = String(name ?? "").trim().replace(/^\//, "").toLowerCase();
  return skills.find((s) => s.name.toLowerCase() === want || s.folder.toLowerCase() === want);
}

/** The tool's definition: served only to an AI that is not Claude Code, and only when the brain holds skills. */
export const SKILL_TOOL = {
  name: "brain_skill",
  description:
    "The person's own skills, kept in their brain: know-how written for their AI (a procedure, a house style, a recurring task). Without a name: the list, each with what it is for. With a name: the skill, to read and follow, translated for you. Call it when the person asks for something one of them covers, or names one by its /command.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "The skill's name (without the /). Leave it out for the list." },
      request: { type: "string", description: "What the person asked, in their words, for the skill to work on" },
    },
  },
};

/**
 * One sentence for the instructions: that the skills are there, and their
 * names (a few tokens: the descriptions are in the tool's list).
 * @param {string[]} names
 */
export const skillsSentence = (names) =>
  names.length ? `The person's own skills live in the brain too (${names.length}: ${names.join(", ")}). When a request matches one, or names one by its /command, read it with brain_skill and follow it.` : "";
