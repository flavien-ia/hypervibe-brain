// git.mjs - The few git gestures the brain makes by itself.
//
// Two rules, both learned the hard way on a brain shared by several Claude
// sessions:
//  - commit ONLY the files this script is about (`git commit --only`): another
//    session may have staged its own work in the same repository;
//  - never `git add -A`, never `git add .`, never a stash, never a pull with
//    autostash (it unstages what other sessions staged).

import { execFileSync } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROOT, config } from "./lib.mjs";

// `raw`: keep the output as is. `git status --porcelain` starts with a space
// when the first file is modified but not staged: trimmed, its path shifts.
export function git(args, { timeout = 60_000, raw = false } = {}) {
  const out = execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return raw ? out : out.trim();
}

export function tryGit(args, o) {
  try {
    return { ok: true, out: git(args, o) };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? ""), err: `${String(e.stderr ?? "")} ${e.message}`.trim() };
  }
}

export const isRepo = () => tryGit(["rev-parse", "--is-inside-work-tree"]).ok;
export const hasRemote = () => Boolean(tryGit(["remote"]).out);

/** Commits exactly these paths (added first), with this message. */
export function commitPaths(paths, message) {
  if (!paths.length) return { ok: true, committed: 0 };
  const list = join(tmpdir(), `brain-${process.pid}-${Date.now()}.txt`);
  writeFileSync(list, paths.join("\0"), "utf8");
  try {
    const add = tryGit(["add", `--pathspec-from-file=${list}`, "--pathspec-file-nul"]);
    if (!add.ok) return { ok: false, err: add.err };
    const c = tryGit(["commit", "-q", "-m", message, "--only", `--pathspec-from-file=${list}`, "--pathspec-file-nul"], { timeout: 180_000 });
    return c.ok ? { ok: true, committed: paths.length } : { ok: false, err: c.err };
  } finally {
    try {
      unlinkSync(list);
    } catch {
      // temporary file
    }
  }
}

/**
 * Pushes when the person agreed to it (autoPush in brain.json) and a
 * remote exists. A failure is reported, never fatal: the commit is safe
 * locally and the next push carries it.
 */
export function pushIfAgreed() {
  let agreed = false;
  try {
    agreed = config().autoPush === true;
  } catch {
    // no config: no push
  }
  if (!agreed || !hasRemote()) return { pushed: false, reason: agreed ? "no remote" : "automatic push not enabled" };
  const p = tryGit(["push", "--quiet"], { timeout: 120_000 });
  return p.ok ? { pushed: true } : { pushed: false, reason: p.err.split("\n")[0].slice(0, 200) };
}
