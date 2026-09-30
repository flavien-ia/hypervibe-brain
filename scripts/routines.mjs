#!/usr/bin/env node
// routines.mjs - The EVENING SAVE of the brain, armed in this computer's own
// scheduler (Windows Task Scheduler, macOS launchd, Linux cron).
//
// What it does each evening, without any AI and at no cost: rebuild the index
// (the vectors of new notes included, if a key is set), then commit what is
// at rest and push if the person agreed to it. Its trace goes to
// ~/.hyperbrain/logs/.
//
// The weekly REVIEW is not armed here: it needs Claude, so it is a scheduled
// task of Claude itself, armed by the /hyperbrain:add-routines skill.
//
// WHY A LAUNCHER. The scheduler runs ~/.hyperbrain/nightly.mjs, which looks
// up where the plugin lives at run time (pluginRoot in the settings file, or
// a search of ~/.claude/plugins). A plugin update can move its folder; a task
// pointing at the old path would fail in silence.
//
//   node scripts/routines.mjs arm [--time 21:00] [--dry-run]
//   node scripts/routines.mjs disarm [--dry-run]
//   node scripts/routines.mjs state [--json]
//   node scripts/routines.mjs run-now          (the same as the evening, right now)
//   node scripts/routines.mjs note-review --when "Sunday 18:00" --id <task> | --off
//        (the weekly review is a task of Claude: this only records it, for the status)
//
// HYPERBRAIN_TASK_SUFFIX changes the task's name: the test bench arms its own
// task, never the person's.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME, PLUGIN_ROOT, setUserConfig, userConfig } from "./lib.mjs";
import { brainLang, osLang, t } from "./i18n.mjs";

const args = process.argv.slice(2);
const command = args[0];
const DRY = args.includes("--dry-run");
const time = args.includes("--time") ? args[args.indexOf("--time") + 1] : "21:00";
const SUFFIX = process.env.HYPERBRAIN_TASK_SUFFIX ?? "";
const DIR = join(HOME, ".hyperbrain");
const LAUNCHER = join(DIR, "nightly.mjs");
const VBS = join(DIR, "nightly.vbs");
// The task's name is in the brain's language: the person sees it in their
// scheduler. Once armed, the name is kept in the settings: a later change of
// language must still find the task to stop it.
const WORDS = t(userConfig().brain ? brainLang(userConfig().brain) : osLang());
const TASK = userConfig().routines?.save?.task ?? `${WORDS.taskName}${SUFFIX}`;
const LABEL = `fr.hyperbrain.nightly${SUFFIX.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
const PLIST = join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const CRON_MARK = `# hyperbrain-nightly${SUFFIX}`;
const OS = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
const out = (o) => console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
const fwd = (p) => p.replace(/\\/g, "/");
/**
 * The node the scheduler will start. process.execPath resolves symlinks: with
 * Homebrew it names a versioned folder (/opt/homebrew/Cellar/node/24.1.0/...)
 * that `brew upgrade node` deletes, and the evening save would then fail every
 * night without a trace. Homebrew keeps a stable link in opt/ across upgrades.
 * (A node from nvm keeps its version folder until it is uninstalled.)
 */
function stableNode() {
  const p = process.execPath;
  const m = /^(.*)\/Cellar\/(node(?:@\d+)?)\/[^/]+\/bin\/node$/.exec(p);
  if (m) for (const c of [`${m[1]}/opt/${m[2]}/bin/node`, `${m[1]}/bin/node`]) if (existsSync(c)) return c;
  return p;
}
const NODE = stableNode();
// The PATH given to the evening save on macOS and Linux: the folder of this
// node, Homebrew (Apple Silicon and Intel), then the system.
const UNIX_PATH = [...new Set([dirname(NODE), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":");
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
  out({ ok: false, error: "--time must be HH:MM" });
  process.exit(1);
}

const sh = (cmd, a, input) => {
  if (DRY) return { status: 0, out: `[dry-run] ${cmd} ${a.join(" ")}` };
  const r = spawnSync(cmd, a, { encoding: "utf8", windowsHide: true, input, timeout: 60_000 });
  return { status: r.status, out: `${r.stdout ?? ""}${r.stderr ?? ""}`.trim() };
};
const ps = (script) => sh("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script]);
const psq = (s) => `'${String(s).replace(/'/g, "''")}'`;

const LAUNCHER_CODE = `// Written by Hyperbrain (scripts/routines.mjs). The evening save of the brain:
// rebuild the index, then commit what is at rest and push if agreed.
// It looks up the plugin at run time: an update of the plugin can move it.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

const HOME = ${JSON.stringify(fwd(HOME))};
const CONFIG = join(HOME, ".hyperbrain", "config.json");
const LOGS = join(HOME, ".hyperbrain", "logs");
const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
mkdirSync(LOGS, { recursive: true });
const localDay = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const logFile = (d) => join(LOGS, "nightly-" + localDay(d) + ".log");
const log = (l) => appendFileSync(logFile(new Date()), new Date().toISOString() + "  " + l + "\\n");

// ONCE PER EVENING. The scheduler may start this at the set time, but also at
// login (macOS, to catch up an evening missed while the computer was off) or
// at boot (Linux). If a save already ran since the last set time, there is
// nothing to catch up. run-now passes --force.
if (!process.argv.includes("--force")) {
  const [h, m] = String(cfg.routines?.save?.time ?? "21:00").split(":").map(Number);
  const slot = new Date();
  slot.setHours(h, m, 0, 0);
  if (slot > new Date()) slot.setDate(slot.getDate() - 1);
  const done = [new Date(), new Date(Date.now() - 86400000)].some((d) => {
    try {
      return readFileSync(logFile(d), "utf8").split("\\n").some((l) => l.includes("save.mjs exit") && new Date(l.slice(0, 24)) >= slot);
    } catch {
      return false;
    }
  });
  if (done) process.exit(0);
}
// NEVER TWO AT ONCE: they would fight over git's own lock.
const LOCK = join(HOME, ".hyperbrain", "nightly.lock");
try {
  process.kill(Number(readFileSync(LOCK, "utf8")), 0);
  log("another save is running: nothing done");
  process.exit(0);
} catch {
  // no lock, or its process is gone
}
writeFileSync(LOCK, String(process.pid));
process.on("exit", () => {
  try {
    unlinkSync(LOCK);
  } catch {
    // already gone
  }
});

function findPlugin() {
  if (cfg.pluginRoot && existsSync(join(cfg.pluginRoot, "scripts", "save.mjs"))) return cfg.pluginRoot;
  // The newest copy of the plugin under ~/.claude/plugins.
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".git")) continue;
      const p = join(dir, e.name);
      if (existsSync(join(p, "scripts", "save.mjs")) && existsSync(join(p, "skills", "create-brain"))) found.push(p);
      else walk(p, depth + 1);
    }
  };
  walk(join(HOME, ".claude", "plugins"), 0);
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

const root = findPlugin();
if (!root) {
  log("ERROR: the Hyperbrain plugin was not found (uninstalled?). Nothing done.");
  process.exit(1);
}
if (!cfg.brain || !existsSync(join(cfg.brain, "hyperbrain.json"))) {
  log("ERROR: no brain set up (~/.hyperbrain/config.json). Nothing done.");
  process.exit(1);
}
// Rebuild (the vectors of new notes), save what is at rest, then the weekly
// cold copy if the person chose one (it does nothing on the other days).
// Then the viewer, refreshed if it was built once, and the data of the
// persistent app, if there is one (both do nothing otherwise).
// Two computers: only the runner computes (the sources, the cold copy, the
// app); every computer saves its notes, then synchronises if allowed there.
const brainCfg = JSON.parse(readFileSync(join(cfg.brain, "hyperbrain.json"), "utf8"));
const me = String(cfg.computer ?? process.env.HYPERBRAIN_COMPUTER ?? hostname()).trim().toLowerCase();
const runner = !brainCfg.runner || String(brainCfg.runner).toLowerCase() === me;
if (!runner) log("not the runner (" + brainCfg.runner + "): its sources, cold copy and app are left to it");
const steps = [
  ...(runner ? [["sources.mjs", ["run", "--due"]]] : []),
  ["build.mjs", ["--quiet"]],
  ["save.mjs", cfg.sync === true ? ["--no-push"] : []],
  ...(cfg.sync === true ? [["sync.mjs", ["--quiet", "--json"]]] : []),
  ...(runner ? [["cold-copy.mjs", []], ["viz.mjs", ["build", "--if-exists"]], ["viz.mjs", ["publish-app"]]] : []),
  // The cloud copy, by difference, if the person set one up.
  ...(runner && brainCfg.cloud?.database ? [["cloud.mjs", ["sync"]]] : []),
  // The brain's own steps that come after the save (a mirror, a publication...).
  ...(runner ? [["sources.mjs", ["run", "--due", "--phase", "after"]]] : []),
];
for (const [script, extra] of steps) {
  // The command first (viz.mjs reads it as its first argument), the brain after.
  // The scripts read the same settings as this launcher (approvals of sources included).
  const r = spawnSync(process.execPath, [join(root, "scripts", script), ...extra, "--brain", cfg.brain], { encoding: "utf8", windowsHide: true, timeout: 15 * 60_000, env: { ...process.env, HYPERBRAIN_HOME: HOME } });
  const text = ((r.stdout ?? "") + (r.stderr ?? "")).split("\\n").filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)).join(" | ");
  log(script + " exit " + r.status + (text ? ": " + text.slice(0, 600) : ""));
}
`;

function writeLauncher() {
  if (DRY) return;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LAUNCHER, LAUNCHER_CODE, "utf8");
  if (OS === "windows") {
    // wscript runs node without a console window: a scheduled task in a
    // visible console would flash on the screen every evening.
    writeFileSync(VBS, `CreateObject("WScript.Shell").Run """${process.execPath}"" ""${LAUNCHER}""", 0, False\r\n`, "utf8");
  }
  setUserConfig({ pluginRoot: fwd(PLUGIN_ROOT) });
}

function arm() {
  if (!userConfig().brain) return { ok: false, error: "no brain set up yet: create it first" };
  writeLauncher();
  const [h, m] = time.split(":").map(Number);
  let r;
  if (OS === "windows") {
    r = ps([
      `$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${psq(`"${VBS}"`)}`,
      `$t = New-ScheduledTaskTrigger -Daily -At ${psq(time)}`,
      // Missed because the computer was asleep or off: runs at the next wake-up.
      "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew",
      `Register-ScheduledTask -TaskName ${psq(TASK)} -Action $a -Trigger $t -Settings $s -Description ${psq(WORDS.taskDescription)} -Force | Out-Null`,
      "'ok'",
    ].join("; "));
  } else if (OS === "mac") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(LABEL)}</string>
  <key>ProgramArguments</key><array><string>${xml(NODE)}</string><string>${xml(LAUNCHER)}</string></array>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>${h}</integer><key>Minute</key><integer>${m}</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(UNIX_PATH)}</string></dict>
  <key>StandardErrorPath</key><string>${xml(join(DIR, "logs", "launchd.err.log"))}</string>
</dict></plist>
`;
    // RunAtLoad: launchd runs a time missed during SLEEP at wake-up, but never
    // one missed while the Mac was OFF. Starting at login too, the launcher
    // catches up if the last evening was missed, and does nothing otherwise.
    if (!DRY) {
      mkdirSync(join(HOME, "Library", "LaunchAgents"), { recursive: true });
      mkdirSync(join(DIR, "logs"), { recursive: true });
      writeFileSync(PLIST, plist, "utf8");
    }
    const uid = process.getuid?.() ?? 501;
    sh("launchctl", ["bootout", `gui/${uid}/${LABEL}`]);
    r = sh("launchctl", ["bootstrap", `gui/${uid}`, PLIST]);
    // Right after a bootout, bootstrap can answer "Input/output error" for a
    // moment: one more try, then the older load command, which does the same job.
    if (r.status !== 0) {
      pause(1500);
      r = sh("launchctl", ["bootstrap", `gui/${uid}`, PLIST]);
    }
    if (r.status !== 0) r = sh("launchctl", ["load", "-w", PLIST]);
  } else {
    const current = sh("crontab", ["-l"]).out.split("\n").filter((l) => l && !l.includes(CRON_MARK) && !/no crontab/i.test(l));
    // cron runs nothing that was missed: the @reboot line catches up (the
    // launcher does nothing if the last evening was saved).
    r = sh("crontab", ["-"], `${[...current,
      `${m} ${h} * * * PATH="${UNIX_PATH}" "${NODE}" "${LAUNCHER}" ${CRON_MARK}`,
      `@reboot sleep 300; PATH="${UNIX_PATH}" "${NODE}" "${LAUNCHER}" ${CRON_MARK}`].join("\n")}\n`);
  }
  if (r.status !== 0) return { ok: false, error: r.out.slice(0, 400) };
  if (!DRY) setUserConfig({ routines: { ...(userConfig().routines ?? {}), save: { time, task: TASK, armed: new Date().toISOString() } } });
  return { ok: true, armed: TASK, time, os: OS, dryRun: DRY || undefined, detail: DRY ? r.out : undefined };
}

function disarm() {
  let r;
  if (OS === "windows") r = ps(`Unregister-ScheduledTask -TaskName ${psq(TASK)} -Confirm:$false -ErrorAction SilentlyContinue; 'ok'`);
  else if (OS === "mac") {
    r = sh("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${LABEL}`]);
    if (r.status !== 0) r = sh("launchctl", ["unload", "-w", PLIST]);
    if (!DRY) rmSync(PLIST, { force: true });
    r = { status: 0, out: r.out };
  } else {
    const current = sh("crontab", ["-l"]).out.split("\n").filter((l) => l && !l.includes(CRON_MARK) && !/no crontab/i.test(l));
    r = sh("crontab", ["-"], current.length ? `${current.join("\n")}\n` : "");
  }
  if (!DRY) {
    const routinesCfg = { ...(userConfig().routines ?? {}) };
    delete routinesCfg.save;
    setUserConfig({ routines: routinesCfg });
  }
  return { ok: r.status === 0, disarmed: TASK, dryRun: DRY || undefined, detail: DRY ? r.out : undefined };
}

function state() {
  const logs = join(DIR, "logs");
  const last = existsSync(logs) ? readdirSync(logs).filter((n) => n.startsWith("nightly-")).sort().at(-1) : null;
  const lastLines = last ? readFileSync(join(logs, last), "utf8").trim().split("\n").slice(-7) : [];
  const s = { os: OS, task: TASK, armed: false, time: userConfig().routines?.save?.time ?? null, lastLog: last, lastRun: lastLines, review: userConfig().routines?.review ?? null };
  if (OS === "windows") {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `$t = Get-ScheduledTask -TaskName ${psq(TASK)} -ErrorAction SilentlyContinue; if ($t) { $i = $t | Get-ScheduledTaskInfo; '{0}|{1}|{2}|{3}' -f $t.State, $i.LastRunTime, $i.NextRunTime, $i.LastTaskResult }`], { encoding: "utf8", windowsHide: true });
    const line = (r.stdout ?? "").trim();
    if (line) {
      const [st, lastRun, nextRun, result] = line.split("|");
      Object.assign(s, { armed: true, schedulerState: st, schedulerLastRun: lastRun, nextRun, lastResult: result });
    }
  } else if (OS === "mac") {
    // The file alone proves nothing: launchd must have it loaded, and the node
    // it points to must still exist.
    const p = spawnSync("launchctl", ["print", `gui/${process.getuid?.() ?? 501}/${LABEL}`], { encoding: "utf8" });
    const nodeInPlist = existsSync(PLIST) ? /<string>([^<]+)<\/string><string>/.exec(readFileSync(PLIST, "utf8"))?.[1] : null;
    Object.assign(s, {
      armed: p.status === 0,
      fileExists: existsSync(PLIST),
      lastResult: /last exit code = (\S+)/.exec(p.stdout ?? "")?.[1] ?? null,
      nodeFound: nodeInPlist ? existsSync(nodeInPlist.replace(/&amp;/g, "&")) : null,
    });
  }
  else s.armed = (spawnSync("crontab", ["-l"], { encoding: "utf8" }).stdout ?? "").includes(CRON_MARK);
  return s;
}

function runNow() {
  writeLauncher();
  const r = spawnSync(process.execPath, [LAUNCHER, "--force"], { encoding: "utf8", windowsHide: true, timeout: 20 * 60_000 });
  return { ok: r.status === 0, lastRun: state().lastRun };
}

if (command === "arm") out(arm());
else if (command === "disarm") out(disarm());
else if (command === "state") out(state());
else if (command === "run-now") out(runNow());
else if (command === "note-review") {
  const routinesCfg = { ...(userConfig().routines ?? {}) };
  if (args.includes("--off")) delete routinesCfg.review;
  else routinesCfg.review = { when: args.includes("--when") ? args[args.indexOf("--when") + 1] : null, id: args.includes("--id") ? args[args.indexOf("--id") + 1] : null, armed: new Date().toISOString() };
  setUserConfig({ routines: routinesCfg });
  out({ ok: true, review: routinesCfg.review ?? null });
}
else {
  console.log("usage: routines.mjs arm [--time HH:MM] | disarm | state | run-now   [--dry-run] [--json]");
  process.exitCode = 2;
}
