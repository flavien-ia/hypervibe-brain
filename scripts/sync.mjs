#!/usr/bin/env node
// sync.mjs - The same brain on two computers, GitHub in the middle.
//
// Each computer commits what is its own (the notes at rest; the runner also
// what it computes), takes what the other one sent, and sends its own. Every
// evening after the save, and right after each capture. Deterministic, no AI.
//
// What makes it safe, each rule learned in the brain this plugin grew from:
//  1. THE OVERLAP CHECK. Before taking anything, if a file arriving from GitHub
//     is also being modified here and not committed, it stops, touching
//     nothing. A blind `git pull` would leave conflict markers in a note, in
//     silence.
//  2. TAKING WITHOUT TOUCHING THE INDEX OF OTHER SESSIONS. No autostash (it
//     brings the stash back without --index: what another session staged comes
//     back unstaged). Nothing to replay here: a fast-forward, no stash at all.
//     Commits to replay: an explicit stash, the rebase, the stash back with
//     --index. A stash that does not come back is never dropped: it is named,
//     and nothing runs until it is given back.
//  3. NO CONFLICT IS EVER RESOLVED ALONE on the person's text: the rebase is
//     aborted, everything is as before, it is said once a day, and it is solved
//     in a conversation, with them.
//  4. NEVER: push --force, reset --hard, checkout -- <path>, clean, add -A.
//
//   node scripts/sync.mjs [--quiet] [--state] [--json]
//
// Runs only on a computer where the person allowed it (sync: true in
// ~/.hyperbrain/config.json, set by /hyperbrain:add-second-computer): it
// commits and pushes by itself.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, computerName, config, isRunner, requireBrain, userConfig } from "./lib.mjs";
import { tryGit } from "./git.mjs";

requireBrain();
const args = process.argv.slice(2);
const QUIET = args.includes("--quiet");
const out = (o) => {
  if (!QUIET || args.includes("--json")) console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
};
const STATE = join(HOME, ".hyperbrain", `sync-${createHash("sha256").update(ROOT.replace(/\\/g, "/").toLowerCase()).digest("hex").slice(0, 12)}.json`);
const LOCK = join(ROOT, "index", "sync.lock");
const readState = () => {
  try {
    return JSON.parse(readFileSync(STATE, "utf8"));
  } catch {
    return {};
  }
};
const writeState = (s) => {
  mkdirSync(dirname(STATE), { recursive: true });
  writeFileSync(STATE, `${JSON.stringify(s, null, 2)}\n`, "utf8");
};
const firstLine = (s) => String(s ?? "").split("\n").map((l) => l.trim()).filter((l) => l && !/^hint:/.test(l))[0]?.slice(0, 200) ?? "";
const OFFLINE = /could not resolve host|unable to access|failed to connect|timed out|network is unreachable|could not read from remote|early EOF|hung up/i;
const gitDir = () => resolve(ROOT, tryGit(["rev-parse", "--git-dir"]).out);

function localChanges() {
  const st = tryGit(["status", "--porcelain", "-z", "--untracked-files=all"], { raw: true }).out.split("\0").filter(Boolean);
  const files = new Set();
  for (let i = 0; i < st.length; i++) {
    files.add(st[i].slice(3));
    if (st[i][0] === "R" || st[i][0] === "C") files.add(st[++i]);
  }
  return files;
}

/** Takes origin/main without touching what another session staged (rule 2). */
function take(ahead) {
  const before = tryGit(["rev-parse", "HEAD"]).out;
  if (ahead === 0) {
    const r = tryGit(["merge", "--ff-only", "--quiet", "origin/main"], { timeout: 180_000 });
    return r.ok ? { ok: true } : { ok: false, error: `fast-forward refused: ${firstLine(r.err)}` };
  }
  const top = () => tryGit(["rev-parse", "-q", "--verify", "refs/stash"]).out;
  const topBefore = top();
  const put = tryGit(["stash", "push", "--quiet", "-m", `hyperbrain sync ${new Date().toISOString()}`], { timeout: 180_000 });
  // "Nothing to stash" succeeds without creating one: read it at the top of the stack.
  const stash = top() && top() !== topBefore ? top() : null;
  if (!put.ok && !stash) return { ok: false, error: `stash impossible: ${firstLine(put.err)}` };
  let conflict = null;
  const r = tryGit(["rebase", "origin/main"], { timeout: 180_000 });
  if (!r.ok) {
    const files = tryGit(["diff", "--name-only", "--diff-filter=U", "-z"], { raw: true }).out.split("\0").filter(Boolean);
    if (["rebase-merge", "rebase-apply"].some((n) => existsSync(join(gitDir(), n)))) tryGit(["rebase", "--abort"]);
    conflict = { nature: "rebase", files, intact: tryGit(["rev-parse", "HEAD"]).out === before };
  }
  if (stash) {
    // By its hash, not "the last one": another session may have stashed meanwhile.
    const rank = tryGit(["stash", "list", "--format=%H"]).out.split("\n").indexOf(stash);
    const back = rank < 0 ? { ok: false, err: "stash not found" } : tryGit(["stash", "pop", "--index", "--quiet", `stash@{${rank}}`], { timeout: 180_000 });
    if (!back.ok) return { ok: false, conflict, stash, error: `the stash did not come back: ${firstLine(back.err)}` };
  }
  return conflict ? { ok: false, conflict } : { ok: true };
}

function run() {
  const cfg = config();
  const state = readState();
  const now = new Date().toISOString();
  const report = { computer: computerName(), runner: isRunner(cfg), at: now, result: "nothing", took: [], pushed: 0, alerts: [] };
  const finish = (result, extra = {}) => {
    Object.assign(report, { result }, extra);
    const next = { ...state, lastRun: now, result };
    if (extra.conflict) {
      const key = `${extra.conflict.nature}:${(extra.conflict.files ?? []).join(",")}`;
      const again = state.conflict?.key === key && Date.now() - Date.parse(state.conflict.alertedAt ?? 0) < 86400_000;
      next.conflict = { key, ...extra.conflict, since: state.conflict?.key === key ? state.conflict.since : now, alertedAt: again ? state.conflict.alertedAt : now };
      if (!again) report.alerts.push(`a note was changed on both computers (${(extra.conflict.files ?? []).slice(0, 3).join(", ") || "a file"}). Nothing is lost. Open a conversation and say: "solve the conflict of my brain".`);
    } else if (result !== "busy") delete next.conflict;
    if (extra.stash) {
      next.stash = extra.stash;
      report.alerts.push(`the synchronisation set the changes in progress aside and could not give them back. Nothing is lost: they are in the git stash ${extra.stash.slice(0, 10)}. Open a conversation and say: "give back the stash of my brain".`);
    }
    if (result === "offline") next.offlineSince = state.offlineSince ?? now;
    else delete next.offlineSince;
    if (result === "ok" || result === "nothing") next.lastSuccess = now;
    next.alerts = report.alerts;
    writeState(next);
    return report;
  };

  if (userConfig().sync !== true) return finish("off", { reason: "the synchronisation is not allowed on this computer (/hyperbrain:add-second-computer)" });
  const branch = tryGit(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok) return finish("busy", { reason: "not a git repository" });
  if (branch.out !== "main") return finish("busy", { reason: `on branch ${branch.out}, not main` });
  if (["rebase-merge", "rebase-apply", "MERGE_HEAD", "CHERRY_PICK_HEAD"].some((n) => existsSync(join(gitDir(), n)))) return finish("busy", { reason: "a rebase or a merge is in progress" });
  if (state.stash && tryGit(["stash", "list", "--format=%H"]).out.split("\n").includes(state.stash)) {
    return finish("busy", { reason: `a stash of the synchronisation waits to be given back (${state.stash.slice(0, 10)})`, stash: state.stash });
  }
  delete state.stash;
  if (existsSync(LOCK)) {
    try {
      const pid = Number(readFileSync(LOCK, "utf8"));
      process.kill(pid, 0);
      return finish("busy", { reason: "another synchronisation is running" });
    } catch {
      // stale lock
    }
  }
  mkdirSync(dirname(LOCK), { recursive: true });
  writeFileSync(LOCK, String(process.pid), "utf8");
  try {
    // 1. What is at rest here, committed (on this computer's side of the rules).
    spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "save.mjs"), "--no-push", "--brain", ROOT], { encoding: "utf8", windowsHide: true, timeout: 300_000 });
    for (let attempt = 0; attempt < 2; attempt++) {
      // 2. What the other computer sent.
      const f = tryGit(["fetch", "--quiet", "origin", "main"], { timeout: 90_000 });
      if (!f.ok) return OFFLINE.test(f.err) ? finish("offline") : finish("error", { error: `GitHub unreachable: ${firstLine(f.err)}` });
      const behind = Number(tryGit(["rev-list", "--count", "HEAD..origin/main"]).out);
      const ahead = Number(tryGit(["rev-list", "--count", "origin/main..HEAD"]).out);
      if (behind > 0) {
        // 3. The overlap check (rule 1).
        const incoming = tryGit(["diff", "--name-only", "-z", "HEAD...origin/main"], { raw: true }).out.split("\0").filter(Boolean);
        const local = localChanges();
        const overlap = incoming.filter((x) => local.has(x));
        if (overlap.length) return finish("conflict", { conflict: { nature: "overlap", files: overlap } });
        // 4. Taking it (rule 2).
        const t = take(ahead);
        if (!t.ok) return finish(t.conflict ? "conflict" : "error", { conflict: t.conflict, stash: t.stash, error: t.error });
        report.took = incoming;
      }
      // 5. Sending ours. A refusal because the other computer pushed meanwhile: once more.
      const toPush = Number(tryGit(["rev-list", "--count", "origin/main..HEAD"]).out);
      if (!toPush) break;
      const p = tryGit(["push", "--quiet", "origin", "main"], { timeout: 180_000 });
      if (p.ok) {
        report.pushed = toPush;
        break;
      }
      if (OFFLINE.test(p.err)) return finish("offline");
      if (!/non-fast-forward|fetch first|rejected/i.test(p.err) || attempt === 1) return finish("error", { error: `push refused: ${firstLine(p.err)}` });
    }
    return finish(report.took.length || report.pushed ? "ok" : "nothing");
  } finally {
    try {
      unlinkSync(LOCK);
    } catch {
      // already gone
    }
  }
}

if (args.includes("--state")) {
  const s = readState();
  const behind = (tryGit(["fetch", "--quiet", "origin", "main"], { timeout: 60_000 }).ok && tryGit(["rev-list", "--count", "HEAD..origin/main"]).out) || null;
  out({ ok: true, computer: computerName(), runner: isRunner(config()), allowed: userConfig().sync === true, behind: behind === null ? null : Number(behind), ahead: Number(tryGit(["rev-list", "--count", "origin/main..HEAD"]).out || 0), ...s });
} else {
  const r = run();
  out(r);
  if (r.alerts.length && !QUIET) for (const a of r.alerts) console.error(`ALERT: ${a}`);
}
