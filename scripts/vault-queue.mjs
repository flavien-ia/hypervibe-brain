// vault-queue.mjs - The vault as a queue, for whoever runs a source (2026-11-21).
//
// THE KEYS OF A SOURCE STAY IN THE VAULT, AND A CLOSED VAULT IS A WAIT, NEVER A
// FAILURE. A source that names vault items ("needs" in its source.json) and
// finds the vault closed is not run: it waits in ~/.hypervibe-brain/queue.json
// (what to run, never a secret), and the hub runs it at the first beat that
// finds the vault open. Until today only the hub knew that rule: the evening
// save ran such a source anyway, which failed, was counted as an error and
// sent an alert, and a source of the evening's rhythm was never tried again
// before the next evening. The rule is now here, for the hub (hub.mjs) and for
// sources.mjs alike, whoever starts a source and whatever its rhythm.
//
// queue.json is one object: { "<source>": { "at": "<ISO date>", "needs": [...] } }.
// The live view reads it to draw a small key on a source that waits. It is
// changed one entry at a time, each change read again from the disk: the hub
// kept its own copy for a whole beat (half an hour when a judge reads) and
// wrote it back over whatever had been queued meanwhile.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME, hypervibeVaultScripts, readJsonFile, writeFileAtomic } from "./lib.mjs";

const QUEUE = join(HOME, ".hypervibe-brain", "queue.json");

// Where the Hypervibe vault's scripts are. Looked for again when the folder
// found is gone: an update of that plugin moves it, and a hub that kept the old
// path for as long as it ran saw a vault "locked" for ever (2026-11-21). No
// vault at all: not looked for again before ten minutes.
const LOOK_AGAIN_MS = 10 * 60_000;
let found = null;
let lookedAt = 0;
/** The folder of the Hypervibe vault's scripts on this computer, or null. */
export function vaultDir() {
  if (process.env.HVBRAIN_VAULT === "off") return null;
  if (found && existsSync(join(found, "vault.mjs")) && existsSync(join(found, "launch.mjs"))) return found;
  if (!found && lookedAt && Date.now() - lookedAt < LOOK_AGAIN_MS) return null;
  found = null;
  lookedAt = Date.now();
  // Only the vault of a Hypervibe plugin the platform registered (lib.mjs,
  // hypervibeVaultScripts, 2026-11-27): never a vault.mjs found elsewhere.
  for (const script of hypervibeVaultScripts()) {
    if (existsSync(join(dirname(script), "launch.mjs"))) {
      found = dirname(script);
      break;
    }
  }
  return found;
}

/** "unlocked", "locked", or null when there is no vault on this computer. */
export function vaultState() {
  if (process.env.HVBRAIN_HUB_VAULT) return process.env.HVBRAIN_HUB_VAULT; // the test bench
  const dir = vaultDir();
  if (!dir) return null;
  const r = spawnSync(process.execPath, [join(dir, "vault.mjs"), "status"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  return String(r.stdout ?? "").trim() === "unlocked" ? "unlocked" : "locked";
}

/**
 * The queue as it is on the disk: {} when there is none, null when the file is
 * there and cannot be read (it is then never written over).
 * @returns {Record<string, { at: string, needs?: string[], why?: string }> | null}
 */
export function readQueue() {
  const r = readJsonFile(QUEUE, {});
  if (r.unreadable) return null;
  return r.value && typeof r.value === "object" && !Array.isArray(r.value) ? r.value : {};
}

/** One change of the queue, made on what the disk holds at that moment. False when the queue cannot be read. */
function change(fn) {
  const q = readQueue();
  if (!q) return false;
  const before = JSON.stringify(q);
  fn(q);
  if (JSON.stringify(q) !== before) writeFileAtomic(QUEUE, `${JSON.stringify(q)}\n`);
  return true;
}

/**
 * Puts a source in the queue, unless it already waits there (the date of its
 * first wait is kept). Returns its entry.
 * @param {string} name @param {string[]} needs @param {Record<string, unknown>} [extra]
 */
export function enqueue(name, needs, extra = {}) {
  let entry = { at: new Date().toISOString(), needs: [].concat(needs ?? []).map(String), ...extra };
  change((q) => {
    if (q[name]) entry = q[name];
    else q[name] = entry;
  });
  return entry;
}

/** Takes a source out of the queue (it ran, or it is gone). */
export function dequeue(name) {
  change((q) => {
    delete q[name];
  });
}
