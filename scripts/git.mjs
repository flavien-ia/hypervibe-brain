// git.mjs - The few git gestures the brain makes by itself.
//
// Two rules, both learned the hard way on a brain shared by several Claude
// sessions:
//  - commit ONLY the files this script is about (`git commit --only`): another
//    session may have staged its own work in the same repository;
//  - never `git add -A`, never `git add .`, never a stash, never a pull with
//    autostash (it unstages what other sessions staged).

import { execFileSync } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ROOT, config } from "./lib.mjs";

// `raw`: keep the output as is. `git status --porcelain` starts with a space
// when the first file is modified but not staged: trimmed, its path shifts.
// `literal`: the paths given are names, not patterns (a note's file named with
// a "[" or a "*" made git refuse the whole commit). The output may be long (a
// status of thousands of files): Node's own limit of 1 MB cut it in the middle
// of a path (2026-11-21).
export function git(args, { timeout = 60_000, raw = false, literal = false } = {}) {
  const out = execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout,
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(literal ? { GIT_LITERAL_PATHSPECS: "1" } : {}) },
  });
  return raw ? out : out.trim();
}

export function tryGit(args, o) {
  try {
    return { ok: true, out: git(args, o) };
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? ""), err: `${String(e.stderr ?? "")} ${e.message}`.trim(), code: e.code };
  }
}

/**
 * Is the brain's folder a git repository: "yes", "no", or "failed" when git
 * itself could not answer (not on the PATH of a scheduled task, a folder git
 * refuses to trust, a damaged repository). A git that fails was taken for "not
 * a repository" (2026-11-21): the save said "nothing to save" and ended well,
 * evening after evening, while nothing was saved.
 * @returns {{ state: "yes" | "no" | "failed", error?: string }}
 */
export function repoState() {
  const r = tryGit(["rev-parse", "--is-inside-work-tree"]);
  if (r.ok) return { state: "yes" };
  // Read from the disk, not from git's words (they follow the computer's
  // language): no .git here nor above, it is simply not a repository.
  let there = false;
  for (let dir = ROOT; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) there = true;
    if (there || dirname(dir) === dir) break;
  }
  if (!there) return { state: "no" };
  const line = r.code === "ENOENT" ? "git was not found on this computer's PATH" : (r.err.split("\n").map((l) => l.trim()).find((l) => /^(fatal|error)/i.test(l)) ?? r.err.split("\n")[0] ?? "");
  return { state: "failed", error: line.slice(0, 240) };
}
export const isRepo = () => repoState().state === "yes";
export const hasRemote = () => Boolean(tryGit(["remote"]).out);

/** Commits exactly these paths (added first), with this message. */
export function commitPaths(paths, message) {
  if (!paths.length) return { ok: true, committed: 0 };
  const list = join(tmpdir(), `brain-${process.pid}-${Date.now()}.txt`);
  writeFileSync(list, paths.join("\0"), "utf8");
  try {
    const add = tryGit(["add", `--pathspec-from-file=${list}`, "--pathspec-file-nul"], { literal: true });
    if (!add.ok) return { ok: false, err: add.err };
    const c = tryGit(["commit", "-q", "-m", message, "--only", `--pathspec-from-file=${list}`, "--pathspec-file-nul"], { timeout: 180_000, literal: true });
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
