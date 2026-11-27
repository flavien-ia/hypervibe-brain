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
// What it covers (2026-11-27, lock-paths.mjs): every tool that names the file
// it writes, the path worked out before it is compared (a segment that says
// nothing, a link, another case no longer get through); a terminal command
// that names the guards' folder or their wiring and is not one plain reading
// (cat, grep, ls, git diff... with nothing chained and no redirection); and a
// command that renames, moves or removes the floor's own folder, which would
// take the guards with it. What it does not: the platform's settings that
// wire a guard (~/.claude/settings.json), which other tools must be able to
// change; a name no text of the command holds (built by a program the command
// starts). Said in docs/executive.md.
// It imports nothing of the plugin but the shared reading of paths, to start
// fast; with no floor, it costs one small file read.
//
// The plugin runs it with the memory's lock in a single program,
// hook-locks.mjs (2026-11-24, see hook-memory.mjs); it still runs alone.

import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { MOVES, commandOf, commandPaths, deny, isShell, pathsOf, plainRead, readInput, readSettings, spellings, under } from "./lock-paths.mjs";

/** The brain whose guards are locked, or "" (none, or no floor in it). @param {any} settings */
export function lockedBrain(settings) {
  const brain = process.env.HVBRAIN_DIR || String(settings?.brain ?? "");
  return brain && existsSync(join(brain, "executive", "guards.json")) ? brain : "";
}

// The guards named by pieces in a command (a path joined in the code handed
// to node, a variable): the floor's name, and "guards" as a name of its own.
const NAMED = (command) => /executive/i.test(command) && /(^|[^a-z0-9_-])guards([^a-z0-9_-]|$)/i.test(command);
// A path written from the brain's folder, whatever the folder the tool stands in.
const RELATIVE = /(^|\/)executive\/(\.\/)*guards(\/|\.json$)/i;

/**
 * The refusal for a write into the guards of the executive floor, or null.
 * @param {{ tool_name?: string, tool_input?: any, cwd?: string }} input what Claude Code hands the hook
 * @param {string} brain the brain whose guards are locked (lockedBrain)
 * @returns {string | null}
 */
export function executiveRefusal(input, brain) {
  if (!brain) return null;
  const tool = String(input?.tool_name ?? "");
  const args = input?.tool_input ?? {};
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : undefined;
  const floor = spellings(join(brain, "executive"));
  const guards = spellings(join(brain, "executive", "guards"));
  const wiring = spellings(join(brain, "executive", "guards.json"));
  /** @param {string[]} list the spellings of one path */
  const inGuards = (list) => list.some((p) => wiring.includes(p) || guards.some((g) => under(g, p)));
  const isFloor = (list) => list.some((p) => floor.includes(p));
  const command = commandOf(input);
  // (The path written from the brain's folder counts for the file a tool names, not for any text a tool of another server carries.)
  const named = ["file_path", "path", "notebook_path"].map((k) => args?.[k]).filter((p) => typeof p === "string" && p);
  let aimed = pathsOf(isShell(tool) ? {} : input).some((p) => inGuards(spellings(p, cwd))) || (!isShell(tool) && named.some((p) => !isAbsolute(p) && RELATIVE.test(p.replaceAll("\\", "/"))));
  let moved = false;
  if (!aimed && command) {
    const { paths, folders } = commandPaths(command, cwd);
    // (A reading may send what it shows to a file outside the floor.)
    aimed = (paths.some(inGuards) || folders.some(inGuards) || NAMED(command)) && !plainRead(command, (target) => !spellings(target, cwd).some((p) => floor.some((d) => under(d, p))), cwd);
    // The floor's own folder renamed, moved or removed: the guards would go with it.
    moved = !aimed && MOVES.test(command) && paths.some(isFloor);
  }
  if (moved) {
    return (
      "Refused: this would rename, move or remove the brain's executive floor (its executive folder), and the guards it holds with it. A guard frames what the AI does, so the AI never moves one, alone or with its folder. " +
      "Tell the person what you would change and why: they do it by hand. Do not look for another way."
    );
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
