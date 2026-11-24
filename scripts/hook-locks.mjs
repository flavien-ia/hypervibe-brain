#!/usr/bin/env node
// hook-locks.mjs - PreToolUse: the plugin's two locks in one program. The
// memory's (hook-memory.mjs: no write into Claude Code's own memory folders
// once the memory lives in the brain) and the executive floor's
// (hook-executive.mjs: the AI never writes a guard).
//
// WHY ONE PROGRAM (2026-11-24). Claude Code starts every hook of a tool call
// as a program of its own, and waits for each a fixed time. Two locks were
// two starts of Node before each command (a third of a second each, on a
// quiet computer); on a computer busy with other work (a bench of hundreds of
// programs, the brain's background judges), one of them once took longer than
// the wait, and Claude Code said "a hook of the brain plugin didn't answer in
// time" and let the action through unchecked. One start now, the settings
// read once, the input read once, and nothing read at all when neither lock
// is on.

import { executiveRefusal, lockedBrain } from "./hook-executive.mjs";
import { deny, memoryRefusal, readInput, readSettings } from "./hook-memory.mjs";

const settings = readSettings();
const memoryOn = settings?.memory?.lock === true;
const brain = lockedBrain(settings);
if (memoryOn || brain) {
  const input = readInput();
  const reason = input ? memoryRefusal(input, settings) ?? executiveRefusal(input, brain) : null;
  if (reason) process.stdout.write(deny(reason));
}
