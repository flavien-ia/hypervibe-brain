#!/usr/bin/env node
// prereqs.mjs - The silent audit of /start-brain: what this computer has,
// what it lacks. Reads only; installs nothing (the skill installs, with the
// person's agreement). Every command has its own timeout: a tool that hangs
// on a network call becomes "timeout", never a frozen audit.
//
// It also records where the plugin lives (pluginRoot in ~/.hypervibe-brain/
// config.json): the evening routine starts from there, and a plugin update
// can move it.
//
//   node scripts/prereqs.mjs [--json]

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, setUserConfig, userConfig } from "./lib.mjs";

const run = (cmd, args, timeout = 20_000) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout, windowsHide: true, shell: process.platform === "win32" && !cmd.endsWith(".exe") });
  if (r.error?.code === "ETIMEDOUT" || r.signal === "SIGTERM") return { status: "timeout", out: "" };
  if (r.error || r.status === null) return { status: "missing", out: "" };
  return { status: r.status === 0 ? "ok" : "error", out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};
const firstLine = (s) => s.split(/\r?\n/).find(Boolean) ?? "";

const os = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
const [maj, min] = process.versions.node.split(".").map(Number);
const node = { version: process.versions.node, ok: maj > 22 || (maj === 22 && min >= 13), path: process.execPath };

// The full-text search needs SQLite's FTS5 in this node. Official builds have
// it; a node built against another SQLite (some package managers) may not.
let sqliteFts = false;
try {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE VIRTUAL TABLE t USING fts5(a, tokenize = 'unicode61 remove_diacritics 2')");
  db.close();
  sqliteFts = true;
} catch {
  sqliteFts = false;
}

// On a fresh Mac, this first git call opens the "install the developer tools"
// window: that is expected, and it installs git.
const gitV = run("git", ["--version"]);
const git = { installed: gitV.status === "ok", version: firstLine(gitV.out).replace(/^git version /, "") || null };
const identity = git.installed
  ? { name: firstLine(run("git", ["config", "--global", "user.name"]).out) || null, email: firstLine(run("git", ["config", "--global", "user.email"]).out) || null }
  : { name: null, email: null };

const ghV = run("gh", ["--version"]);
let gh = { installed: ghV.status === "ok", loggedIn: false, account: null };
if (gh.installed) {
  const s = run("gh", ["api", "user", "--jq", ".login"], 25_000);
  gh = { ...gh, loggedIn: s.status === "ok", account: s.status === "ok" ? firstLine(s.out) : null, check: s.status };
}

const wrV = run("wrangler", ["--version"]);
let cloudflare = { installed: wrV.status === "ok", loggedIn: false, account: null };
if (cloudflare.installed) {
  const w = run("wrangler", ["whoami"], 30_000);
  const email = /associated with the email ([^\s.]+@[^\s]+?)\.?\s/i.exec(w.out)?.[1] ?? null;
  cloudflare = { ...cloudflare, loggedIn: w.status === "ok" && !/not authenticated|You are not/i.test(w.out), account: email, check: w.status };
}

const cfg = setUserConfig({ pluginRoot: PLUGIN_ROOT.replace(/\\/g, "/") });
const brain = cfg.brain && existsSync(join(cfg.brain, "brain.json")) ? cfg.brain : null;

const report = {
  os,
  node,
  sqliteFts,
  git,
  gitIdentity: identity,
  gh,
  cloudflare,
  brain,
  required: { node: node.ok, sqliteFts, git: git.installed, gitIdentity: Boolean(identity.name && identity.email) },
  ready: node.ok && sqliteFts && git.installed && Boolean(identity.name && identity.email),
};
void userConfig;

if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  const mark = (b) => (b ? "ok " : "-- ");
  console.log(`\n${mark(node.ok)} Node ${node.version}${node.ok ? "" : " (22.13 or later needed)"}`);
  console.log(`${mark(git.installed)} git ${git.version ?? "missing"}`);
  console.log(`${mark(report.required.gitIdentity)} git identity ${identity.name ? `${identity.name} <${identity.email ?? "?"}>` : "missing"}`);
  console.log(`${mark(gh.loggedIn)} GitHub CLI ${gh.installed ? (gh.loggedIn ? `connected as ${gh.account}` : "installed, not connected") : "missing"} (optional: online backup)`);
  console.log(`${mark(cloudflare.loggedIn)} Cloudflare ${cloudflare.installed ? (cloudflare.loggedIn ? "connected" : "installed, not connected") : "missing"} (optional: cloud access, later)`);
  console.log(`\nbrain: ${brain ?? "none yet"}\n`);
}
