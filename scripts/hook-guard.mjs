#!/usr/bin/env node
// hook-guard.mjs - Runs a guard of the brain's executive floor, once it has
// checked that the guard is still the one the person approved on this computer.
//
//   node hook-guard.mjs <brain>/executive/guards/<file>
//
// WHY (2026-11-27, security audit). The platform's settings ran each guard
// straight from the brain's folder: a guard that arrived by a pull, or that
// was changed by one, was code run at the next action, with nobody asked. The
// settings now run this program, which runs the guard only when its files are
// to the byte those the person approved (executive.mjs trust, kept in
// ~/.hypervibe-brain/config.json, never in the brain). A guard that changed,
// or that was never approved here, is NOT run, and what it guards is refused
// meanwhile (a PreToolUse answer "deny"): a guard that may have been rewritten
// must not decide, and an action it would have stopped must not pass.
//
// IT IS COPIED BESIDE THE SETTINGS. executive.mjs copies this file to
// ~/.hypervibe-brain/guard.mjs and the platform's settings run that copy: an
// update of the plugin can move the plugin's folder, and a hook that points
// at a folder that is gone does not run at all (the platform then lets the
// action through). So this file imports nothing of the plugin: only Node.
//
// ONE START OF NODE. A guard written as a module (.mjs) is loaded in this
// very process, which then is the guard: it reads the hook's input and answers
// as if it had been started alone. Any other guard is started as a program of
// its own, the input and the output handed over as they are.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const fwd = (p) => String(p).replaceAll("\\", "/");
const CASELESS = process.platform === "win32" || process.platform === "darwin";
/** Two spellings of one key of the approvals (a brain's folder, then what is approved). */
const sameKey = (a, b) => (CASELESS ? a.toLowerCase() === b.toLowerCase() : a === b);

/**
 * The fingerprint of a set of files: each one's path (as given, relative to
 * `root`) and its content, line endings aside (git on Windows checks a file
 * out with other line endings than on a Mac). A file that cannot be read
 * counts as missing, and the fingerprint says so: it never equals one taken
 * when the file was there.
 * @param {string} root @param {string[]} rels
 */
export function printFiles(root, rels) {
  const h = createHash("sha256");
  for (const rel of [...rels].map(fwd).sort()) {
    let content = "missing";
    try {
      content = createHash("sha256").update(readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n")).digest("hex");
    } catch {
      content = "missing";
    }
    h.update(`${rel}\n${content}\n`);
  }
  return h.digest("hex");
}

/** The approval of one thing in this computer's settings, or null. @param {any} settings @param {string} key */
export function approvalOf(settings, key) {
  const all = settings?.trusted;
  if (!all || typeof all !== "object") return null;
  if (all[key]) return all[key];
  const found = Object.keys(all).find((k) => sameKey(k, key));
  return found ? all[found] : null;
}

/** The answer of a hook that refuses, for the moment it runs at. @param {string} reason */
function refuse(reason) {
  let event = "";
  let tool = false;
  try {
    const input = JSON.parse(readFileSync(0, "utf8") || "{}");
    event = String(input?.hook_event_name ?? "");
    tool = typeof input?.tool_name === "string";
  } catch {
    event = "";
  }
  // Before an action: the action is refused. At any other moment (the end of
  // an answer, the start of a session) there is nothing to refuse: it is said.
  if (event === "PreToolUse" || (!event && tool)) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
  else process.stdout.write(JSON.stringify({ systemMessage: reason }));
  process.exit(0);
}

/** Runs the guard named on the command line, or refuses. */
async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  // Beside the settings (its copy), the settings are its neighbours; run from
  // the plugin (a test), they are those of the home folder.
  const dir = basename(here) === ".hypervibe-brain" ? here : join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain");
  const guard = resolve(String(process.argv[2] ?? ""));
  const m = /^(.*)\/executive\/guards\/([\w.-]+\.m?js)$/.exec(fwd(guard));
  let settings = {};
  try {
    const raw = readFileSync(join(dir, "config.json"), "utf8");
    settings = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw) ?? {};
  } catch {
    settings = {};
  }
  const how = settings.pluginRoot ? `node "${fwd(join(String(settings.pluginRoot), "scripts", "trust.mjs"))}" guide` : "/brain:executive";
  const ask = `Tell the person, in their words: they read what the guard does and approve it themselves, in a terminal of their own (${how}). Do not look for another way to do what was refused.`;
  if (!m) refuse(`Refused: "${fwd(String(process.argv[2] ?? ""))}" is not a guard of a brain's executive floor (executive/guards/<file>.mjs), so nothing was run. ${ask}`);
  const [, root, file] = /** @type {RegExpExecArray} */ (m);
  const record = approvalOf(settings, `${root}::guard::${file}`);
  const files = Array.isArray(record?.files) && record.files.length ? record.files.map(String) : null;
  // A guard that is no longer where the settings look for it (the brain was
  // moved, its disk is not there): nothing can be checked, so nothing passes.
  if (!existsSync(guard)) {
    const place = settings.pluginRoot ? `node "${fwd(join(String(settings.pluginRoot), "scripts", "executive.mjs"))}" place` : "/brain:executive";
    refuse(`Refused: the guard ${file} is no longer where the settings look for it (${fwd(guard)}): the brain may have been moved, or its disk is not there. It could not be run, so what it guards is refused meanwhile. Tell the person, in their words: once their brain is back, they put its guards in place again themselves, in a terminal of their own (${place}). Do not look for another way to do what was refused.`);
  }
  if (!record || !files) refuse(`Refused: the guard ${file} of the brain's executive floor was never approved on this computer, so it was not run, and what it guards is refused meanwhile. ${ask}`);
  if (printFiles(root, /** @type {string[]} */ (files)) !== record.hash) refuse(`Refused: the guard ${file} of the brain's executive floor has changed since the person approved it on this computer, so it was not run, and what it guards is refused meanwhile. ${ask}`);
  let text = "";
  try {
    text = readFileSync(guard, "utf8");
  } catch {
    text = "";
  }
  // A guard that asks whether it is the program that was started is started as
  // one: loaded here, it would answer no, and guard nothing.
  if (/\.mjs$/.test(file) && !/import\.meta\.main|require\.main|process\.mainModule|module\.parent/.test(text)) {
    process.argv.splice(1, process.argv.length - 1, guard);
    await import(pathToFileURL(guard).href);
    return;
  }
  const r = spawnSync(process.execPath, [guard], { stdio: "inherit", windowsHide: true });
  process.exit(r.status ?? 1);
}

if (/[\\/](hook-)?guard\.mjs$/i.test(process.argv[1] ?? "")) await main();
