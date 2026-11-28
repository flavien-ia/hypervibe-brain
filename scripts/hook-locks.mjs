#!/usr/bin/env node
// hook-locks.mjs - PreToolUse: the plugin's locks in one program. The
// memory's (hook-memory.mjs: no write into Claude Code's own memory folders
// once the memory lives in the brain), the executive floor's
// (hook-executive.mjs: the AI never writes a guard), and since 2026-11-27 the
// two that keep the others standing (lock-paths.mjs): the plugin's own
// settings on this computer are never written by the AI (a lock is lifted
// there, a program approved there), and the gestures that lift a lock or
// approve what runs are the person's own.
//
// WHY ONE PROGRAM (2026-11-24). Claude Code starts every hook of a tool call
// as a program of its own, and waits for each a fixed time. Two locks were
// two starts of Node before each command (a third of a second each, on a
// quiet computer); on a computer busy with other work (a bench of hundreds of
// programs, the brain's background judges), one of them once took longer than
// the wait, and Claude Code said "a hook of the brain plugin didn't answer in
// time" and let the action through unchecked. One start now, the settings
// read once, the input read once.
//
// CLOSED WHEN IT CANNOT TELL (2026-11-27). A lock that fails used to let
// through: an input it could not read, an error in its own code, and the
// action went on unchecked. It is called only for the tools that write or run
// something: when it cannot read what one of them is about to do, or when it
// fails, it refuses, and says so. (What it cannot do anything about: a
// program that does not start at all, or that the platform stops for being
// too slow.)

let out = "";
try {
  const { executiveRefusal, lockedBrain } = await import("./hook-executive.mjs");
  const { memoryRefusal } = await import("./hook-memory.mjs");
  const { READ_TOOL, deny, gestureRefusal, keyRefusal, readInput, readSettings, settingsRefusal } = await import("./lock-paths.mjs");
  try {
    const settings = readSettings();
    const brain = lockedBrain(settings);
    const input = readInput();
    if (!input) out = deny("Refused: the brain plugin's lock could not read what this tool is about to do, so it let nothing through (it guards the person's memory folders, the guards of their brain and the plugin's settings). Try again; if it goes on, tell the person.");
    else {
      // (A tool that only reads meets the lock of the keys alone: reading stays free everywhere else.)
      const reason = READ_TOOL.test(String(input.tool_name ?? "")) ? keyRefusal(input) : gestureRefusal(input) ?? keyRefusal(input) ?? settingsRefusal(input) ?? memoryRefusal(input, settings) ?? executiveRefusal(input, brain);
      if (reason) out = deny(reason);
    }
  } catch (e) {
    out = deny(`Refused: the brain plugin's lock failed while it looked at this action (${String(e?.message ?? e).slice(0, 160)}), so it let nothing through. Try again; if it goes on, tell the person.`);
  }
} catch (e) {
  // Its own files cannot be loaded: said in the answer a hook gives, built by hand.
  out = JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `Refused: the brain plugin's lock could not start (${String(e?.message ?? e).slice(0, 160)}), so it let nothing through. Tell the person: the plugin may need to be installed again.` } });
}
if (out) process.stdout.write(out);
