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
//   node scripts/cold-copy.mjs [--force] [--json]

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
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
const archives = readdirSync(dir).filter((n) => n.startsWith(prefix) && /^\d{4}-\d{2}-\d{2}\.bundle$/.test(n.slice(prefix.length))).sort();
const newest = archives.at(-1);
if (newest && !args.includes("--force") && Date.now() - statSync(join(dir, newest)).mtimeMs < 7 * 86400_000) {
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
const all = readdirSync(dir).filter((n) => n.startsWith(prefix) && n.endsWith(".bundle")).sort();
const removed = all.slice(0, Math.max(0, all.length - 8));
for (const n of removed) unlinkSync(join(dir, n));
out({ ok: true, archive: file.replace(/\\/g, "/"), commits: Number(git(["rev-list", "--all", "--count"])), removed: removed.length });
