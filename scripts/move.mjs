#!/usr/bin/env node
// move.mjs - Moves the brain to another folder of this computer, and keeps
// everything this computer knows about it.
//
//   node scripts/move.mjs --to <new folder> [--dry-run]
//
// THE BRAIN'S FOLDER IS WRITTEN IN ONE PLACE: `brain` in
// ~/.hypervibe-brain/config.json (HVBRAIN_DIR overrides it for one command).
// Every script, the hub, the evening save and a live view read it there. But
// several things this computer keeps about a brain are filed under its path:
// the sources approved here, the journal not yet saved, what the machine
// wrote, the state of the synchronisation. Renaming the folder by hand lost
// them all at once (the brain looked new: every source to approve again, its
// history gone from the live view). This command renames the folder and
// carries them over.
//
// It refuses to move a brain while the hub or the evening save runs, into a
// synchronised folder (Dropbox, OneDrive, iCloud, Google Drive: a git
// repository and a database do not survive there), into itself, or onto a
// folder that exists. The folder is renamed, never copied: same disk only.
// Run again after a failure half way, it finishes what is left.
//
// Nothing inside the brain names its own folder, so nothing in it changes.
// What the PERSON wrote elsewhere with the old path (a shortcut, a note, a
// skill of their own) is theirs to update: the answer lists the old path.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { HOME, PLUGIN_ROOT, setUserConfig, userConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
const fail = (error, extra = {}) => {
  out({ ok: false, error, ...extra });
  process.exit(1);
};
const DRY = args.includes("--dry-run");
const i = args.indexOf("--to");
if (i < 0 || !args[i + 1]) fail("usage: move.mjs --to <new folder> [--dry-run]");

const posix = (p) => String(p).replaceAll("\\", "/");
const DIR = join(HOME, ".hypervibe-brain");
const cfg = userConfig();
if (!cfg.brain) fail("no brain is set up on this computer yet: there is nothing to move");
const from = posix(resolve(cfg.brain));
const to = posix(resolve(args[i + 1].replace(/^~(?=[\\/]|$)/, HOME)));
const same = (a, b) => (process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b);

// The same folders the creation refuses (init.mjs).
const SYNCED = /[\\/](Dropbox|OneDrive[^\\/]*|iCloud ?Drive|Google ?Drive|My Drive|CloudStorage|Mobile Documents)([\\/]|$)/i;
if (same(from, to)) fail("the brain is already there");
if (SYNCED.test(to)) fail("a brain cannot live in a synchronised folder (Dropbox, OneDrive, iCloud, Google Drive): its history and its index would be damaged there");
const inside = relative(from, to);
if (inside && !inside.startsWith("..") && !/^[a-zA-Z]:/.test(inside)) fail("the new folder is inside the brain itself");

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
const lock = (name) => {
  try {
    const l = JSON.parse(readFileSync(join(DIR, name), "utf8"));
    return l?.pid && alive(l.pid) ? l.pid : null;
  } catch {
    return null;
  }
};
const hub = lock("hub.lock");
const nightly = lock("nightly.lock");
if (hub) fail("the program that runs the sources (the hub) is running: stop it first (routines.mjs hub off), move, then turn it on again", { hub });
if (nightly) fail("the evening save is running: wait for it to end", { nightly });

// Half-way state: the brain is already at its new place (a move that failed
// after the rename, or a brain moved by hand, its content carried out of a
// folder that keeps something else), the rest is owed.
const moved = !existsSync(join(from, "brain.json")) && existsSync(join(to, "brain.json"));
if (!moved) {
  if (!existsSync(join(from, "brain.json"))) fail(`${from} is not a brain (no brain.json)`);
  if (existsSync(to)) fail(`${to} already exists: name a folder that does not exist yet`);
  if (!existsSync(dirname(to))) fail(`${dirname(to)} does not exist: create it first`);
}

const hash = (p) => createHash("sha256").update(p).digest("hex").slice(0, 12);
const plan = {
  folder: moved ? "already moved" : "to rename",
  trustedSources: Object.keys(cfg.trustedSources ?? {}).filter((k) => k.startsWith(`${from}::`)).length,
};
if (DRY) {
  out({ ok: true, dry: true, from, to, plan });
  process.exit(0);
}

// The live view watches the brain's folders: on Windows that alone refuses
// the rename (seen 2026-11-17). It is stopped for the move and started again
// after, when it was running.
const live = (command) => {
  const script = join(PLUGIN_ROOT, "scripts", "live.mjs");
  if (!existsSync(script)) return null;
  const r = spawnSync(process.execPath, [script, command], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  try {
    return JSON.parse(String(r.stdout).trim().split("\n").at(-1));
  } catch {
    return null;
  }
};
const viewWasRunning = live("state")?.running === true && live("state")?.standalone !== true;
if (viewWasRunning) live("stop");

if (!moved) {
  try {
    renameSync(from, to);
  } catch (e) {
    const why =
      e.code === "EXDEV"
        ? "the new folder is on another disk: this command renames, it does not copy"
        : ["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(e.code)
          ? "a program holds a file of the brain open: close the conversations and the windows opened in that folder, stop the live view, then try again"
          : e.message;
    if (viewWasRunning) live("start");
    fail(`the folder could not be renamed (${e.code}): ${why}`, { from, to });
  }
}

// ---- what this computer files under the brain's path
const done = { trustedSources: 0, events: 0, written: false, folded: false, sync: false, notesCache: false };
const rekey = (o) => {
  if (!o || typeof o !== "object" || !(from in o)) return false;
  o[to] = o[from];
  delete o[from];
  return true;
};
const json = (name, change) => {
  const f = join(DIR, name);
  try {
    const o = JSON.parse(readFileSync(f, "utf8"));
    if (change(o)) {
      writeFileSync(`${f}.tmp`, `${JSON.stringify(o)}\n`, "utf8");
      renameSync(`${f}.tmp`, f);
      return true;
    }
  } catch {
    // absent or unreadable: nothing of this brain was kept there
  }
  return false;
};

const trusted = { ...(userConfig().trustedSources ?? {}) };
for (const k of Object.keys(trusted)) {
  if (!k.startsWith(`${from}::`)) continue;
  trusted[`${to}::${k.slice(from.length + 2)}`] = trusted[k];
  delete trusted[k];
  done.trustedSources++;
}
setUserConfig({ brain: to, trustedSources: trusted });

done.written = json("written.json", rekey);
done.folded = json("events-folded.json", rekey);

// The journal not saved yet: each line says which brain it is about.
try {
  const f = join(DIR, "events.jsonl");
  const needle = `"brain":${JSON.stringify(from)}`;
  const text = readFileSync(f, "utf8");
  const n = text.split(needle).length - 1;
  if (n) {
    writeFileSync(`${f}.tmp`, text.replaceAll(needle, `"brain":${JSON.stringify(to)}`), "utf8");
    renameSync(`${f}.tmp`, f);
    done.events = n;
  }
} catch {
  // no journal yet
}

// The synchronisation's state and the notes' cache are named after the path.
const renamed = (a, b) => {
  try {
    if (existsSync(join(DIR, a)) && !existsSync(join(DIR, b))) {
      renameSync(join(DIR, a), join(DIR, b));
      return true;
    }
  } catch {
    // a comfort: both are rebuilt when missing
  }
  return false;
};
done.sync = renamed(`sync-${hash(from.toLowerCase())}.json`, `sync-${hash(to.toLowerCase())}.json`);
done.notesCache = renamed(join("cache", `notes-${hash(from)}.json`), join("cache", `notes-${hash(to)}.json`));

if (viewWasRunning) live("start");

// A worktree of the brain's own repository keeps absolute paths: git repairs them.
let worktrees = 0;
try {
  worktrees = readdirSync(join(to, ".git", "worktrees")).length;
} catch {
  worktrees = 0;
}

out({
  ok: true,
  from,
  to,
  carried: done,
  next: [
    "turn the hub on again (routines.mjs hub on, or the session's next opening)",
    ...(viewWasRunning ? [] : ["restart a live view if one runs outside the plugin"]),
    ...(worktrees ? ["run `git worktree repair` in the brain's folder: it has worktrees"] : []),
    `anything the person wrote themselves with the old path (${from}) is theirs to update`,
  ],
});
