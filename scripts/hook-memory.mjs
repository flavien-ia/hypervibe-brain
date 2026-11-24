#!/usr/bin/env node
// hook-memory.mjs - PreToolUse: once the person's AI writes its memory in the
// brain (memory.mjs lock on), a write into one of Claude Code's own memory
// folders is refused, and the refusal says where to write instead.
//
// WHY A HOOK (2026-11-20). A rule in CLAUDE.md was not enough: on the brain
// this was first done for, the rule named one folder, Claude Code keeps one
// memory folder per working folder, and a session opened elsewhere wrote
// twenty more files in two weeks. A rule is context a model may not follow; a
// hook is the one thing that holds.
//
// It refuses, it does not ask: there is no case where the write is wanted. It
// covers the tools that write a file, and a terminal command (the shell tools,
// and the terminal of the desktop app) that sends its output into such a folder. The archives (memory-archive-*) are not
// concerned: they are read. Inert while the lock is off. It imports nothing
// of the plugin, to start fast.
//
// ONE PROGRAM FOR THE LOCKS (2026-11-24). The plugin runs this check and the
// executive floor's (hook-executive.mjs) in a single program, hook-locks.mjs:
// one start of Node before each command instead of two. Two programs, on a
// computer busy with other work, once took longer than Claude Code waits, and
// a lock that does not answer in time lets the action through unchecked. This
// file still runs alone (node hook-memory.mjs), as before.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** The computer's settings of the brain, or {}. (A byte order mark at their head must not open the lock.) */
export function readSettings() {
  try {
    const raw = readFileSync(join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain", "config.json"), "utf8");
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) ?? {};
  } catch {
    return {};
  }
}

// ~/.claude/projects/<project>/memory/<file>, however the path is written.
const MEMORY = /[\\/]\.claude[\\/]projects[\\/][^\\/"'\s]+[\\/]memory[\\/]/i;

/**
 * The refusal for a write into a memory folder of Claude Code, or null.
 * @param {{ tool_name?: string, tool_input?: any }} input what Claude Code hands the hook
 * @param {any} settings the computer's settings of the brain
 * @returns {string | null}
 */
export function memoryRefusal(input, settings) {
  if (settings?.memory?.lock !== true) return null;
  const tool = String(input?.tool_name ?? "");
  const args = input?.tool_input ?? {};
  let aimed = false;
  if (/^(Write|Edit|NotebookEdit)$/.test(tool)) aimed = MEMORY.test(String(args.file_path ?? args.notebook_path ?? ""));
  else if (/^(Bash|PowerShell)$/.test(tool) || /run_in_terminal$/.test(tool)) {
    const command = String(args.command ?? "");
    // A redirection, a tee, or a writing cmdlet that aims at a memory folder.
    // (The path must follow the chevron in one piece: a chevron inside a quoted
    // text, followed further on by a path that is only read, is no redirection.)
    aimed = />>?\s*["']?[^\s"'|;&<>]*[\\/]\.claude[\\/]projects[\\/][^\\/"'\s]+[\\/]memory[\\/]/i.test(command) || (/\b(tee|Set-Content|Add-Content|Out-File)\b/i.test(command) && MEMORY.test(command));
  }
  if (!aimed) return null;
  return (
    "Refused: this person's memory lives in their second brain, no longer in Claude's own memory folders. " +
    "Write it in the brain with /brain:capture: a rule or a trap learnt is a note of nature lesson, a choice of theirs a decision, what a client or a reader said of their work a feedback. " +
    "Do not look for another way to write this file."
  );
}

/** The answer of a PreToolUse hook that refuses. @param {string} reason */
export const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

/** What Claude Code hands the hook, or null when it cannot be read (then nothing is refused). */
export function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return null;
  }
}

// Run alone (not imported by hook-locks.mjs).
if (/hook-memory\.mjs$/i.test(process.argv[1] ?? "")) {
  const settings = readSettings();
  if (settings?.memory?.lock === true) {
    const input = readInput();
    const reason = input ? memoryRefusal(input, settings) : null;
    if (reason) process.stdout.write(deny(reason));
  }
}
