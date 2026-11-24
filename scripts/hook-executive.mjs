#!/usr/bin/env node
// hook-executive.mjs - PreToolUse: the guards of the brain's executive floor
// (executive/guards/ and executive/guards.json, executive.mjs) are never
// written by the AI. The person changes them by hand.
//
// WHY (2026-11-22). A guard frames what the AI does: an AI that may rewrite
// it is not framed. The skills of the floor stay open to the AI (that is how
// they get better); the guards do not. Refused, not asked: a confirmation the
// AI words itself is the very thing a guard is there to avoid.
//
// What it covers: the tools that write a file, and a terminal command that
// names the guards' folder together with a word that writes, moves or
// deletes. What it does not: the platform's settings that wire a guard
// (~/.claude/settings.json), which other tools must be able to change; a
// command that builds the path from pieces. Said in docs/executive.md.
// It imports nothing of the plugin but the other lock, to start fast; with no
// floor, it costs one small file read.
//
// The plugin runs it with the memory's lock in a single program,
// hook-locks.mjs (2026-11-24, see hook-memory.mjs); it still runs alone.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { deny, readInput, readSettings } from "./hook-memory.mjs";

/** The brain whose guards are locked, or "" (none, or no floor in it). @param {any} settings */
export function lockedBrain(settings) {
  const brain = process.env.HVBRAIN_DIR || String(settings?.brain ?? "");
  return brain && existsSync(join(brain, "executive", "guards.json")) ? brain : "";
}

const norm = (p) => String(p).replaceAll("\\", "/").replace(/\/+/g, "/").toLowerCase();
// A redirection counts only when it aims at the guards (2026-11-23: a check
// that read the guards and wrote its own result elsewhere was refused).
const REDIRECT = /(^|[^<0-9&])>{1,2}\s*["']?[^\s"'|;&<>]*executive[\\/]+guards/i;
const WRITES = /\btee\b|\b(rm|mv|cp|del|erase|ren|rename|move|copy|truncate|chmod|unlink|rmdir|install|ln|mklink)\b|\bsed\s+(-[a-z]*\s+)*-i|\bperl\s+-[a-z]*i|\b(set|add|clear)-content\b|\bout-file\b|\b(remove|move|copy|rename|new)-item\b|writefile|appendfile|rmsync|unlinksync|renamesync|copyfile|cpsync|\bgit\s+(checkout|restore|rm|mv|reset|clean|stash|apply)\b/i;

/**
 * The refusal for a write into the guards of the executive floor, or null.
 * @param {{ tool_name?: string, tool_input?: any }} input what Claude Code hands the hook
 * @param {string} brain the brain whose guards are locked (lockedBrain)
 * @returns {string | null}
 */
export function executiveRefusal(input, brain) {
  if (!brain) return null;
  const tool = String(input?.tool_name ?? "");
  const args = input?.tool_input ?? {};
  const floor = `${norm(brain).replace(/\/$/, "")}/executive/`;
  // The guards' folder or their wiring, by the full path or by the brain-relative one.
  const inGuards = (p) => {
    const n = norm(p);
    return n.startsWith(`${floor}guards/`) || n === `${floor}guards.json` || /(^|\/)executive\/guards(\/|\.json$)/.test(n);
  };
  let aimed = false;
  if (/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(tool)) aimed = inGuards(args.file_path ?? args.notebook_path ?? "");
  else if (/^(Bash|PowerShell)$/.test(tool) || /run_in_terminal$/.test(tool)) {
    const command = String(args.command ?? "");
    aimed = REDIRECT.test(command) || (/executive[\\/]+guards/i.test(command) && WRITES.test(command));
  }
  if (!aimed) return null;
  return (
    "Refused: this is a guard of the brain's executive floor (executive/guards). A guard frames what the AI does, so the AI never writes, moves or deletes one. " +
    "Tell the person what you would change and why: they change it by hand. Do not look for another way to write this file."
  );
}

// Run alone (not imported by hook-locks.mjs).
if (/hook-executive\.mjs$/i.test(process.argv[1] ?? "")) {
  const brain = lockedBrain(readSettings());
  if (brain) {
    const input = readInput();
    const reason = input ? executiveRefusal(input, brain) : null;
    if (reason) process.stdout.write(deny(reason));
  }
}
