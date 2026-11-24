#!/usr/bin/env node
// cold-copy.mjs - The cold copy: once a week, the brain's WHOLE history in a
// single file (a git bundle), in a folder the person chose (an external
// drive, a synced folder: a single file is safe there, unlike a live
// repository). It is the copy that survives the loss of both the computer and
// GitHub. Restoring: `git clone <file> <folder>`.
//
// Run by the evening save; does nothing when the component is off or when
// the newest archive is less than seven days old. Keeps the eight newest.
//
//   node scripts/cold-copy.mjs [--force]      (one JSON line on stdout)

import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config, requireBrain, requireRunner, slugify, today } from "./lib.mjs";
import { git, isRepo, tryGit } from "./git.mjs";

requireBrain();
requireRunner();
const args = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
const cfg = config();
const dir = cfg.components?.coldCopy?.dir;
if (!dir) {
  out({ ok: true, skipped: "component off" });
  process.exit(0);
}
if (!isRepo()) {
  out({ ok: false, error: "the brain is not a git repository" });
  process.exit(1);
}
if (!existsSync(dir)) {
  // A drive that is not plugged in is not an error, it is a day without copy.
  out({ ok: true, skipped: `${dir} is not reachable (drive unplugged?)` });
  process.exit(0);
}

const prefix = `brain-${slugify(cfg.name || "brain")}-`;
// This brain's archives: its prefix, then a date and nothing else. ("Camille"
// and "Camille Entreprise" share a start of name: without the date the purge
// below counted the other brain's archives and removed this one's, 2026-11-21.)
const mine = () => readdirSync(dir).filter((n) => n.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.bundle$/.test(n.slice(prefix.length))).sort();
const archives = mine();
const newest = archives.at(-1);
// TWO BRAINS OF THE SAME NAME IN ONE FOLDER (or two without a name) write
// under the same file names: the second one found the first one's archive
// recent and never made its own, week after week, without a word. The newest
// archive is asked what it holds (its header only): when this brain knows none
// of it, it is another brain's, and the copy stops there, said.
if (newest) {
  const heads = tryGit(["bundle", "list-heads", join(dir, newest)], { timeout: 60_000 });
  const shas = heads.ok ? heads.out.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter((s) => /^[0-9a-f]{40,64}$/.test(s)) : [];
  if (shas.length && !shas.some((s) => tryGit(["cat-file", "-e", `${s}^{commit}`]).ok)) {
    out({ ok: false, error: `the archives named ${prefix}<date>.bundle in ${String(dir).replace(/\\/g, "/")} are another brain's (same name): give this brain's cold copy a folder of its own, nothing was written nor removed` });
    process.exit(1);
  }
}
// Seven days counted on the calendar, from the dates in the names: counted to
// the minute, an evening save that ran two minutes earlier than the week
// before waited one more day, and the copy slipped by a day every week.
const days = (d) => Date.UTC(...d.split("-").map((n, i) => Number(n) - (i === 1 ? 1 : 0))) / 86400_000;
const age = newest ? days(today()) - days(newest.slice(prefix.length, prefix.length + 10)) : Infinity;
if (newest && !args.includes("--force") && age < 7) {
  out({ ok: true, skipped: `newest archive is recent (${newest})` });
  process.exit(0);
}

mkdirSync(dir, { recursive: true });
const file = join(dir, `${prefix}${today()}.bundle`);
const created = tryGit(["bundle", "create", file, "--all"], { timeout: 300_000 });
if (!created.ok) {
  out({ ok: false, error: created.err.split("\n")[0].slice(0, 300) });
  process.exit(1);
}
// An archive that does not verify is not kept, and nothing old is removed behind it.
const verified = tryGit(["bundle", "verify", file], { timeout: 300_000 });
if (!verified.ok) {
  try {
    unlinkSync(file);
  } catch {
    // nothing to remove
  }
  out({ ok: false, error: `the archive did not verify: ${verified.err.split("\n")[0].slice(0, 200)}` });
  process.exit(1);
}
const all = mine();
const removed = all.slice(0, Math.max(0, all.length - 8));
for (const n of removed) unlinkSync(join(dir, n));
out({ ok: true, archive: file.replace(/\\/g, "/"), commits: Number(git(["rev-list", "--all", "--count"])), removed: removed.length });
