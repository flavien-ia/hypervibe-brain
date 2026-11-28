// reload-reminder.mjs - A plugin switched while a conversation is open
// (2026-11-28). Claude Code reads the plugins when a session starts, and again
// only when the person types /reload-plugins: a plugin switched off from the
// live view or by another session still runs in the conversations already
// open, and the person, who saw the switch move, believes it gone. Nothing can
// type that command for them (the platform documents no way: neither a hook,
// nor a program, nor the model). So the next message they type in such a
// conversation carries a line for the AI: tell them to type it.
//
// The changes are kept in ~/.hypervibe-brain/reload-plugins.json, with, for
// each conversation told, the moment of the last change it was told about.
// A conversation that started after a change has it already: it is not told.
// Light on purpose: read on every message the person types (hook-suggest.mjs).

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const FILE = () => join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain", "reload-plugins.json");
/** Two days: a conversation left open longer than that is told by its next start, as any other. */
const KEEP_MS = 2 * 86400_000;

/** @returns {{ changes: Record<string, { to: "on" | "off", at: string }>, told: Record<string, string> }} */
function readKept() {
  try {
    const j = JSON.parse(readFileSync(FILE(), "utf8"));
    return { changes: j && typeof j.changes === "object" && j.changes ? j.changes : {}, told: j && typeof j.told === "object" && j.told ? j.told : {} };
  } catch {
    return { changes: {}, told: {} };
  }
}
/** @param {{ changes: object, told: object }} kept */
function writeKept(kept) {
  const file = FILE();
  mkdirSync(join(file, ".."), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(kept, null, 2)}\n`, "utf8");
  renameSync(tmp, file);
}

/**
 * A plugin was switched on this computer (executive.mjs switch harness).
 * @param {string} key the plugin, <plugin>@<marketplace>
 * @param {"on" | "off"} to
 */
export function noteSwitch(key, to) {
  try {
    const kept = readKept();
    const now = Date.now();
    kept.changes[key] = { to, at: new Date(now).toISOString() };
    for (const [k, c] of Object.entries(kept.changes)) if (now - Date.parse(c.at) > KEEP_MS) delete kept.changes[k];
    for (const [s, at] of Object.entries(kept.told)) if (now - Date.parse(at) > KEEP_MS) delete kept.told[s];
    writeKept(kept);
  } catch {
    // Not kept: the conversations open are not told, the switch itself holds.
  }
}

/**
 * The line the AI reads with the person's message when a plugin was switched
 * since this conversation started and it was not told yet, or "".
 * @param {{ session_id?: string, transcript_path?: string }} input what Claude Code hands the hook
 */
export function reloadReminder(input) {
  try {
    const kept = readKept();
    const session = String(input?.session_id ?? "").slice(0, 64);
    const list = Object.entries(kept.changes);
    if (!list.length || !session) return "";
    // When the conversation started: its transcript was made then. Unknown, every change counts.
    let started = 0;
    try {
      const st = statSync(String(input?.transcript_path ?? ""));
      started = st.birthtimeMs > 0 ? st.birthtimeMs : 0;
    } catch {
      started = 0;
    }
    const toldAt = Date.parse(kept.told[session] ?? "") || 0;
    const fresh = list.filter(([, c]) => Date.parse(c.at) > Math.max(started, toldAt));
    if (!fresh.length) return "";
    kept.told[session] = fresh.map(([, c]) => c.at).sort().at(-1) ?? new Date().toISOString();
    writeKept(kept);
    const what = fresh.map(([k, c]) => `${k.split("@")[0]} ${c.to === "off" ? "switched off" : "switched on"}`).join(", ");
    return `Since this conversation started, the person switched a plugin of Claude Code from their brain (${what}). Claude Code applies it in this conversation only once they type /reload-plugins (a new conversation has it already); nobody else can type it for them. Tell them so in one short line, in their language, before your answer.`;
  } catch {
    return "";
  }
}
