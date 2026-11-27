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
// covers every tool that names the file it writes (Write, Edit, MultiEdit,
// NotebookEdit, a tool of another server), and a terminal command (the shell
// tools, and the terminal of the desktop app) that names such a folder and is
// not a plain reading (lock-paths.mjs says how a path and a command are read,
// since 2026-11-27: `cp`, a `cd` then a redirection, a write from node or
// python went through the list of words it had before). The archives
// (memory-archive-*) are not concerned: they are read. Inert while the lock
// is off. It imports nothing of the plugin but the shared reading of paths,
// to start fast.
//
// ONE PROGRAM FOR THE LOCKS (2026-11-24). The plugin runs this check and the
// executive floor's (hook-executive.mjs) in a single program, hook-locks.mjs:
// one start of Node before each command instead of two. Two programs, on a
// computer busy with other work, once took longer than Claude Code waits, and
// a lock that does not answer in time lets the action through unchecked. This
// file still runs alone (node hook-memory.mjs), as before.

import { commandOf, commandPaths, deny, isShell, pathsOf, plainRead, readInput, readSettings, spellings } from "./lock-paths.mjs";

export { deny, readInput, readSettings };

// ~/.claude/projects/<project>/memory and what it holds, on a path already
// resolved (forward slashes, no "." nor ".." left in it).
const MEMORY = /\/\.claude\/projects\/[^/]+\/memory(\/|$)/i;
/** @param {string[]} list the spellings of one path */
const isMemory = (list) => list.some((p) => MEMORY.test(p));
// The same named in a command by pieces (a variable holds the start of the
// path): the three names are there, "memory" as a folder of its own.
const NAMED = (command) => /\.claude/i.test(command) && /projects/i.test(command) && /(^|[\\/"'\s=])memory([\\/"'\s]|$)/i.test(command);

/**
 * The refusal for a write into a memory folder of Claude Code, or null.
 * @param {{ tool_name?: string, tool_input?: any, cwd?: string }} input what Claude Code hands the hook
 * @param {any} settings the computer's settings of the brain
 * @returns {string | null}
 */
export function memoryRefusal(input, settings) {
  if (settings?.memory?.lock !== true) return null;
  const tool = String(input?.tool_name ?? "");
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : undefined;
  const command = commandOf(input);
  let aimed = pathsOf(isShell(tool) ? {} : input).some((p) => isMemory(spellings(p, cwd)));
  if (!aimed && command) {
    const { paths, folders } = commandPaths(command, cwd);
    // (A reading may send what it shows to a file that is not in a memory folder.)
    aimed = (paths.some(isMemory) || folders.some(isMemory) || NAMED(command)) && !plainRead(command, (target) => !isMemory(spellings(target, cwd)), cwd);
  }
  if (!aimed) return null;
  return (
    "Refused: this person's memory lives in their second brain, no longer in Claude's own memory folders. " +
    "Write it in the brain with /brain:capture: a rule or a trap learnt is a note of nature lesson, a choice of theirs a decision, what a client or a reader said of their work a feedback. " +
    "Do not look for another way to write this file."
  );
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
