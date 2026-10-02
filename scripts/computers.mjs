#!/usr/bin/env node
// computers.mjs - Setting up the brain on two computers.
//
//   node scripts/computers.mjs state [--json]
//        this computer's name, whether it is the runner, whether it may sync
//   node scripts/computers.mjs make-runner
//        this computer runs the brain (sources, vectors, directory, reviews,
//        cold copy): written in brain.json and committed, so that the
//        other computer knows
//   node scripts/computers.mjs allow-sync on|off
//        the person's agreement, ON THIS COMPUTER, that the brain commits and
//        pushes by itself (kept in ~/.hypervibe-brain/config.json, never in the brain)
//   node scripts/computers.mjs clone --url <repository> --dir <folder>
//        on the second computer: the brain from GitHub, made the active brain here

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BRAIN, HOME, PLUGIN_ROOT, computerName, hasBrain, setUserConfig, userConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const [command, a1] = args;
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const git = (a, cwd = BRAIN) => {
  const r = spawnSync("git", a, { cwd, encoding: "utf8", windowsHide: true, timeout: 300_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  return { ok: r.status === 0, out: String(r.stdout ?? "").trim(), err: String(r.stderr ?? "").trim() };
};
const brainCfg = () => JSON.parse(readFileSync(join(BRAIN, "brain.json"), "utf8"));

if (command === "state") {
  const cfg = hasBrain() ? brainCfg() : {};
  out({
    ok: true,
    computer: computerName(),
    brain: hasBrain() ? BRAIN.replace(/\\/g, "/") : null,
    runner: cfg.runner ?? null,
    isRunner: !cfg.runner || String(cfg.runner).toLowerCase() === computerName(),
    syncAllowed: userConfig().sync === true,
    remote: hasBrain() ? git(["remote", "get-url", "origin"]).out || null : null,
  });
} else if (command === "make-runner") {
  if (!hasBrain()) fail("no brain on this computer");
  if (!git(["remote", "get-url", "origin"]).ok) fail("the brain has no online copy yet: two computers meet on GitHub (/brain:add-backup first)");
  const file = join(BRAIN, "brain.json");
  const raw = brainCfg();
  if (raw.runner && raw.runner !== computerName() && !args.includes("--take-over")) fail(`the runner is ${raw.runner}: taking its place is a decision (repeat with --take-over, and stop its routines there)`);
  raw.runner = computerName();
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  const c = git(["commit", "-q", "--only", "-m", `runner: ${raw.runner}`, "--", "brain.json"]);
  out({ ok: true, runner: raw.runner, committed: c.ok || /nothing to commit/.test(c.out + c.err) });
} else if (command === "allow-sync") {
  if (!["on", "off"].includes(a1)) fail("allow-sync on|off");
  setUserConfig({ sync: a1 === "on" });
  out({ ok: true, computer: computerName(), syncAllowed: a1 === "on" });
} else if (command === "clone") {
  const url = opt("--url");
  const dir = opt("--dir") ? resolve(String(opt("--dir")).replace(/^~(?=[\\/]|$)/, HOME)) : null;
  if (!url || !dir) fail("--url and --dir are required");
  if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} exists and is not empty`);
  const c = git(["clone", "-q", url, dir], process.cwd());
  if (!c.ok) fail(`the clone failed: ${c.err.split("\n")[0]}`);
  const a = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "adopt.mjs"), "--dir", dir, ...(args.includes("--switch") ? ["--switch"] : [])], { encoding: "utf8", windowsHide: true });
  const adopted = JSON.parse(String(a.stdout).trim().split("\n").pop() || "{}");
  if (!adopted.ok) fail(adopted.error ?? "the brain could not be made active here");
  out({ ok: true, dir: dir.replace(/\\/g, "/"), name: adopted.name, runner: JSON.parse(readFileSync(join(dir, "brain.json"), "utf8")).runner ?? null, computer: computerName() });
} else {
  console.log("usage: computers.mjs state | make-runner | allow-sync on|off | clone --url <repository> --dir <folder>");
  process.exitCode = 2;
}
