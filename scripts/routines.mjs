#!/usr/bin/env node
// routines.mjs - The EVENING SAVE of the brain, armed in this computer's own
// scheduler (Windows Task Scheduler, macOS launchd, Linux cron).
//
// What it does each evening, without any AI and at no cost: run the sources
// that are due and check what is connected (health.mjs), rebuild the index
// (the vectors of new notes included, if a key is set), then commit what is
// at rest and push if the person agreed to it (or synchronise, on two
// computers), and last the cold copy, the viewer, the cloud copy and the
// brain's "after" steps, each when there is one. Only the runner runs the
// sources, the check and what comes after the save. A step or a source that
// failed sends an alert (letter.mjs alert). Its trace goes to
// ~/.hypervibe-brain/logs/.
//
// The weekly REVIEW is not armed here: it needs Claude, so it is a scheduled
// task of Claude itself, armed by the /brain:add-routines skill.
//
// WHY A LAUNCHER. The scheduler runs ~/.hypervibe-brain/nightly.mjs, which looks
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
//   node scripts/routines.mjs hub on|off|state [--dry-run]
//        the live hub (hub.mjs), started with the person's session by its own
//        task, apart from the evening save
//
// HVBRAIN_TASK_SUFFIX changes the task's name: the test bench arms its own
// task, never the person's.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME, LEGACY_NAME, PLUGIN_ROOT, setUserConfig, userConfig } from "./lib.mjs";
import { brainLang, osLang, t } from "./i18n.mjs";

const args = process.argv.slice(2);
const command = args[0];
const DRY = args.includes("--dry-run");
const time = args.includes("--time") ? args[args.indexOf("--time") + 1] : "21:00";
const SUFFIX = process.env.HVBRAIN_TASK_SUFFIX ?? "";
const DIR = join(HOME, ".hypervibe-brain");
const LAUNCHER = join(DIR, "nightly.mjs");
const VBS = join(DIR, "nightly.vbs");
// The task's name is in the brain's language: the person sees it in their
// scheduler. Once armed, the name is kept in the settings: a later change of
// language must still find the task to stop it.
const WORDS = t(userConfig().brain ? brainLang(userConfig().brain) : osLang());
// A save armed under the plugin's name of before (until 0.4) is removed from
// the scheduler when the save is armed again, and armed under today's name.
const STORED = userConfig().routines?.save?.task;
const LEGACY = STORED && new RegExp(`^${LEGACY_NAME}\\b`, "i").test(STORED)
  ? { task: STORED, label: `fr.${LEGACY_NAME}.nightly${SUFFIX.replace(/[^a-z0-9]/gi, "").toLowerCase()}`, mark: `# ${LEGACY_NAME}-nightly${SUFFIX}` }
  : null;
const TASK = LEGACY ? `${WORDS.taskName}${SUFFIX}` : STORED ?? `${WORDS.taskName}${SUFFIX}`;
const LABEL = `fr.hypervibe.brain.nightly${SUFFIX.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
const PLIST = join(HOME, "Library", "LaunchAgents", `${LABEL}.plist`);
const CRON_MARK = `# hypervibe-brain-nightly${SUFFIX}`;
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

const LAUNCHER_CODE = `// Written by Hypervibe Brain (scripts/routines.mjs). The evening save of the brain:
// rebuild the index, then commit what is at rest and push if agreed.
// It looks up the plugin at run time: an update of the plugin can move it.
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { join } from "node:path";

const HOME = ${JSON.stringify(fwd(HOME))};
const CONFIG = join(HOME, ".hypervibe-brain", "config.json");
const LOGS = join(HOME, ".hypervibe-brain", "logs");
mkdirSync(LOGS, { recursive: true });
const localDay = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
const logFile = (d) => join(LOGS, "nightly-" + localDay(d) + ".log");
const log = (l) => appendFileSync(logFile(new Date()), new Date().toISOString() + "  " + l + "\\n");

// SETTINGS THAT CANNOT BE READ (2026-11-21). The plugin no longer writes over
// a config.json that is there and unreadable (a copy is kept beside it as
// config.json.bad). This launcher stopped on it with an exception, without a
// line in its log, every half hour. Now it says it ONCE (a line, a notice on
// the computer: the brain, hence its letter, is named in that very file), and
// the runs after it end quietly until the file is repaired. A missing file
// stops it as before.
const SAID = join(HOME, ".hypervibe-brain", "nightly-settings.json");
let cfg = null;
try {
  const raw = readFileSync(CONFIG, "utf8");
  // A byte order mark (an editor's) is read as the plugin reads it.
  cfg = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new Error("it does not hold a JSON object");
} catch (e) {
  if (e.code === "ENOENT") throw e;
  const problem = String(e.message ?? e).slice(0, 240);
  let said = null;
  try {
    said = JSON.parse(readFileSync(SAID, "utf8"));
  } catch {
    said = null;
  }
  if (said?.problem !== problem) {
    log("ERROR: the settings of this computer (" + CONFIG + ") cannot be read (" + problem + "): no save until the file is repaired (a copy is kept as config.json.bad). Said once.");
    const fr = String(Intl.DateTimeFormat().resolvedOptions().locale ?? "").toLowerCase().startsWith("fr");
    notify(
      fr ? "Brain, sauvegarde du soir" : "Brain, evening save",
      fr
        ? "Les réglages du brain sur cet ordinateur ne se lisent plus (~/.hypervibe-brain/config.json) : la sauvegarde du soir ne tourne pas tant qu'ils ne sont pas réparés. Vos notes ne sont pas touchées. Dites à Claude : « les réglages de mon brain ne se lisent plus »."
        : "The brain's settings on this computer can no longer be read (~/.hypervibe-brain/config.json): the evening save does not run until they are repaired. Your notes are untouched. Tell Claude: \\"the settings of my brain can no longer be read\\".",
    );
    try {
      writeFileSync(SAID, JSON.stringify({ problem, at: new Date().toISOString() }), "utf8");
    } catch {
      // said again at the next run: a line and a notice, no more
    }
  }
  process.exit(0);
}
try {
  unlinkSync(SAID);
} catch {
  // never said, or already cleared
}

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
// ONE LOCK, WRITTEN ONCE, IN ONE FORMAT (2026-11-21): { pid, at }. It was
// written twice, first as the bare number of this process, then as an object:
// a second launcher (the scheduler starts one every half hour to catch up a
// missed evening) read the object as "not a number", took it for no lock at
// all, and two evenings ran together; the first to end removed the lock of
// the other. It is now created, never written over (of two launchers that
// start together, one creates it), read in both formats (a bare number is a
// launcher of before), and removed only by the one that holds it.
const LOCK = join(HOME, ".hypervibe-brain", "nightly.lock");
const lockHolder = () => {
  let raw = "";
  try {
    raw = readFileSync(LOCK, "utf8").trim();
  } catch {
    return null;
  }
  let pid = Number(raw);
  let at = NaN;
  if (!raw || !Number.isInteger(pid)) {
    try {
      const o = JSON.parse(raw);
      pid = Number(o.pid);
      at = Date.parse(o.at);
    } catch {
      return null;
    }
  }
  if (!Number.isFinite(at)) {
    try {
      at = statSync(LOCK).mtimeMs;
    } catch {
      return null;
    }
  }
  // Older than three hours: the number of that process is another program's by now.
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid || Date.now() - at > 3 * 3600000) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch (e) {
    return e.code === "EPERM" ? pid : null;
  }
};
for (let tries = 0; tries < 2; tries++) {
  try {
    writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { encoding: "utf8", flag: "wx" });
    break;
  } catch (e) {
    // It cannot be written at all: the save goes on without a lock, as it always could.
    if (e.code !== "EEXIST") break;
    if (lockHolder()) {
      log("another save is running: nothing done");
      process.exit(0);
    }
    // Left behind by a save that is gone: removed, and created again.
    try {
      unlinkSync(LOCK);
    } catch {
      // gone meanwhile
    }
  }
}
process.on("exit", () => {
  try {
    if (JSON.parse(readFileSync(LOCK, "utf8")).pid === process.pid) unlinkSync(LOCK);
  } catch {
    // already gone, or another save's
  }
});
// THE HUB ENDS ITS BEAT FIRST (hub.mjs, 2026-11-21). The hub waited for the
// evening, the evening never waited for the hub: started while a judge was
// reading, it ran the sources, rebuilt and saved under it. The lock above is
// taken, so the hub starts nothing more and yields as soon as it can; the
// evening goes on once the hub's mark (hub-beat.json) is gone. Forty minutes
// at most: a judge's pass in progress is not interrupted.
const BEAT = join(HOME, ".hypervibe-brain", "hub-beat.json");
const beatRunning = () => {
  let b = null;
  try {
    b = JSON.parse(readFileSync(BEAT, "utf8"));
  } catch {
    return false;
  }
  if (!Number.isInteger(b.pid) || !(Date.now() - Date.parse(b.at) < 2 * 3600000)) return false;
  try {
    process.kill(b.pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
if (beatRunning()) {
  log("the hub is in the middle of a beat: the save waits for it to end");
  const until = Date.now() + 40 * 60000;
  while (Date.now() < until && beatRunning()) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  log(beatRunning() ? "the hub's beat is still going after 40 minutes: the save goes on" : "the hub's beat has ended");
}

function findPlugin() {
  if (cfg.pluginRoot && existsSync(join(cfg.pluginRoot, "scripts", "save.mjs"))) return cfg.pluginRoot;
  // The newest copy of the plugin under ~/.claude/plugins.
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".git")) continue;
      const p = join(dir, e.name);
      if (existsSync(join(p, "scripts", "save.mjs")) && existsSync(join(p, "skills", "create"))) found.push(p);
      else walk(p, depth + 1);
    }
  };
  walk(join(HOME, ".claude", "plugins"), 0);
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

const root = findPlugin();
if (!root) {
  log("ERROR: the Hypervibe Brain plugin was not found (uninstalled?). Nothing done.");
  process.exit(1);
}
if (!cfg.brain || !existsSync(join(cfg.brain, "brain.json"))) {
  log("ERROR: no brain set up (~/.hypervibe-brain/config.json). Nothing done.");
  process.exit(1);
}
// Rebuild (the vectors of new notes), save what is at rest, then the weekly
// cold copy if the person chose one (it does nothing on the other days).
// Then the viewer, refreshed if it was built once, and the data of the
// persistent app, if there is one (both do nothing otherwise).
// Two computers: only the runner computes (the sources, the cold copy, the
// app); every computer saves its notes, then synchronises if allowed there.
const brainCfg = JSON.parse(readFileSync(join(cfg.brain, "brain.json"), "utf8"));
const me = String(cfg.computer ?? process.env.HVBRAIN_COMPUTER ?? hostname()).trim().toLowerCase();
const runner = !brainCfg.runner || String(brainCfg.runner).toLowerCase() === me;
if (!runner) log("not the runner (" + brainCfg.runner + "): its sources, cold copy and app are left to it");
const steps = [
  ...(runner ? [["sources.mjs", ["run", "--due"]]] : []),
  // Is everything connected still there? (health.mjs: marked, never removed by itself)
  ...(runner ? [["health.mjs", []]] : []),
  ["build.mjs", ["--quiet"]],
  ["save.mjs", cfg.sync === true ? ["--no-push"] : []],
  ...(cfg.sync === true ? [["sync.mjs", ["--quiet", "--json"]]] : []),
  ...(runner ? [["cold-copy.mjs", []], ["viz.mjs", ["build", "--if-exists"]], ["viz.mjs", ["publish-app"]]] : []),
  // The cloud copy, by difference, if the person set one up.
  ...(runner && brainCfg.cloud?.database && brainCfg.cloud.paused !== true ? [["cloud.mjs", ["sync"]]] : []),
  // The brain's own steps that come after the save (a mirror, a publication...).
  ...(runner ? [["sources.mjs", ["run", "--due", "--phase", "after"]]] : []),
];
const fr = brainCfg.lang === "fr";
// A closed vault is a wait, never a failure (2026-11-21): the sources that take
// a key in it are queued (sources.mjs) and run as soon as it is open. The
// words say so, and a number is written with its noun in agreement.
const W = fr
  ? {
      title: "Brain, sauvegarde du soir",
      ask: "Le coffre Hypervibe est fermé : une fenêtre demande son mot de passe. Sans réponse en 6 minutes, la sauvegarde se fait sans lui, et les sources qui y prennent une clé attendent qu'il soit ouvert.",
      closed: "coffre Hypervibe fermé : les sources qui y prennent une clé attendent, sans échec, le premier passage qui le trouvera ouvert ; ce qui d'autre en dépend ce soir (copie cloud, email d'alerte) est sauté",
      problems: (n) => (n === 1 ? "1 problème ce soir" : n + " problèmes ce soir") + (vaultLocked ? ", et le coffre Hypervibe est resté fermé" : "") + ". Détail : /brain:status dans Claude.",
    }
  : {
      title: "Brain, evening save",
      ask: "The Hypervibe vault is locked: a window asks for its password. Without an answer in 6 minutes, the save is made without it, and the sources that take a key in it wait for it to be opened.",
      closed: "Hypervibe vault locked: the sources that take a key in it wait, without failing, for the first run that finds it open; what else depends on it tonight (cloud copy, alert email) is skipped",
      problems: (n) => (n === 1 ? "1 problem this evening" : n + " problems this evening") + (vaultLocked ? ", and the Hypervibe vault stayed locked" : "") + ". Details: /brain:status in Claude.",
    };

// A NOTICE ON THE COMPUTER, the channel that needs no key: the alert email
// needs one, and the most common failure (a locked vault) takes it away.
// Never makes the save fail.
function notify(title, text) {
  // The test benches show nothing on the screen of the person who runs them.
  if (process.env.HVBRAIN_NO_WINDOW) return;
  try {
    if (process.platform === "win32") {
      // PowerShell reads the typographic apostrophes as quotes too: each is doubled.
      const q = (s) => "'" + String(s).replace(/['‘’‚‛]/g, "$&$&") + "'";
      const ps = "[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null; " +
        "$t = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02); " +
        "$x = $t.GetElementsByTagName('text'); $x.Item(0).AppendChild($t.CreateTextNode(" + q(title) + ")) > $null; $x.Item(1).AppendChild($t.CreateTextNode(" + q(text) + ")) > $null; " +
        "[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe').Show([Windows.UI.Notifications.ToastNotification]::new($t))";
      // Encoded (UTF-16): accents survive the way to PowerShell whatever the code page.
      spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")], { windowsHide: true, timeout: 30000 });
    } else if (process.platform === "darwin") {
      spawnSync("osascript", ["-e", "display notification " + JSON.stringify(text) + " with title " + JSON.stringify(title)], { timeout: 30000 });
    } else {
      spawnSync("notify-send", [title, text], { timeout: 30000 });
    }
  } catch {
    // no graphical session: the log and the alert email remain
  }
}

// THE HYPERVIBE VAULT, asked for rather than failed. A person who keeps their
// keys in it (the plugin Hypervibe's Bitwarden) and finds it locked at the
// time of the save: a notice, the vault's own password window, and up to six
// minutes of patience. Then the save goes on either way. Only on the runner
// (its sources, cloud copy and alert read keys), and only for a vault set up
// on this computer: a person without one is never asked anything.
let vaultLocked = false;
const vaultScript = (() => {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".git")) continue;
      const p = join(dir, e.name);
      if (existsSync(join(p, "scripts", "vault", "vault.mjs")) && existsSync(join(p, "scripts", "vault", "launch.mjs"))) found.push(join(p, "scripts", "vault"));
      else walk(p, depth + 1);
    }
  };
  if (process.env.HVBRAIN_VAULT !== "off") walk(join(HOME, ".claude", "plugins"), 0);
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
})();
const vaultState = () => String(spawnSync(process.execPath, [join(vaultScript, "vault.mjs"), "status"], { encoding: "utf8", windowsHide: true, timeout: 60000 }).stdout ?? "").trim();
// What the save saw of the vault, said in its log whatever the branch: an
// evening that skipped the question without a word (2026-11-06) could not be
// explained afterwards.
const vaultAtStart = runner && vaultScript ? vaultState() : null;
log("Hypervibe vault: " + (!runner ? "not this computer's job" : !vaultScript ? "none found" : vaultAtStart + " (" + vaultScript + ")"));
if (runner && vaultScript && vaultAtStart !== "unlocked") {
  let signedIn = false;
  try {
    signedIn = JSON.parse(spawnSync(process.execPath, [join(vaultScript, "vault.mjs"), "account"], { encoding: "utf8", windowsHide: true, timeout: 60000 }).stdout).signedIn === true;
  } catch {
    signedIn = false;
  }
  if (signedIn) {
    notify(W.title, W.ask);
    const w = spawn(process.execPath, [join(vaultScript, "launch.mjs"), "unlock", "--lang", fr ? "fr" : "en"], { stdio: "ignore", detached: true, windowsHide: false });
    w.unref();
    const until = Date.now() + 6 * 60000;
    while (Date.now() < until && vaultState() !== "unlocked") Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
    vaultLocked = vaultState() !== "unlocked";
    log(vaultLocked ? W.closed : "Hypervibe vault: opened for the save");
  } else log("Hypervibe vault: no account signed in on this computer, nothing asked");
}

const started = new Date().toISOString();
// THE HUB WAITS (hub.mjs): while the evening runs, the live hub runs no
// source, so that none runs twice at the same time. It reads the lock taken
// at the top of this file.
// THE SOURCES HAVE THEIR OWN TIME LIMITS (2026-11-21). Every step was stopped
// after 15 minutes, the one that runs ALL the sources included: on a brain
// whose sources may take 20, 25 and 30 minutes, the first long one took the
// others of the list down with it, and none of them wrote its state. The
// step of the sources gets the sum of their limits ("timeoutMin", 5 minutes
// when a source sets none) and ten minutes more; each source is still
// stopped at its own.
const sourcesMin = (() => {
  let sum = 0;
  try {
    for (const n of readdirSync(join(cfg.brain, "sources"))) {
      try {
        const d = JSON.parse(readFileSync(join(cfg.brain, "sources", n, "source.json"), "utf8"));
        if (d.enabled !== false && d.paused !== true && (d.kind === "script" || d.kind === "step")) sum += Number(d.timeoutMin) > 0 ? Number(d.timeoutMin) : 5;
      } catch {
        // not a source
      }
    }
  } catch {
    // no sources at all
  }
  return Math.max(15, sum + 10);
})();
const failed = [];
for (const [script, extra] of steps) {
  // The command first (viz.mjs reads it as its first argument), the brain after.
  // The scripts read the same settings as this launcher (approvals of sources included).
  const r = spawnSync(process.execPath, [join(root, "scripts", script), ...extra, "--brain", cfg.brain], { encoding: "utf8", windowsHide: true, timeout: (script === "sources.mjs" ? sourcesMin : 15) * 60_000, env: { ...process.env, HVBRAIN_HOME: HOME } });
  const text = ((r.stdout ?? "") + (r.stderr ?? "")).split("\\n").filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)).join(" | ");
  log(script + " exit " + r.status + (text ? ": " + text.slice(0, 600) : ""));
  if (r.status !== 0) failed.push({ step: script + (extra[0] && !extra[0].startsWith("--") ? " " + extra[0] : ""), message: text.slice(0, 300) || "exit " + r.status });
}
// THE ALERT. A step that failed, or a source that ended in an error this
// evening: a short email by the letter's channel, the same evening, rather
// than a line in Sunday's letter. letter.mjs decides whether there is anything
// to say (it also reads the sources' states) and how to say it.
const a = spawnSync(process.execPath, [join(root, "scripts", "letter.mjs"), "alert", "--since", started, "--brain", cfg.brain], { input: JSON.stringify({ failed, vaultLocked }), encoding: "utf8", windowsHide: true, timeout: 2 * 60_000, env: { ...process.env, HVBRAIN_HOME: HOME } });
log("alert exit " + a.status + ": " + String(a.stdout ?? "").trim().slice(0, 300) + String(a.stderr ?? "").trim().slice(0, 200));
// The notice on the computer, whenever there is something to say, whether the
// email left or not (without the alert's answer: at least the failed steps).
let problems = failed.length;
try {
  // The alert keeps its record before it tries to send: it is there even when the mail could not leave.
  const r = JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "alert.json"), "utf8"));
  if (r.date >= started && Array.isArray(r.problems)) problems = r.problems.length;
} catch {
  // the alert could not say: the steps seen failing here remain
}
// A vault that stayed closed is no notice by itself (2026-11-21): what waits
// for it is no failure, and every evening the person was away showed one. It
// is said in the log above, and with the problems when there are some.
if (problems) notify(W.title, W.problems(problems));
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
  if (LEGACY && !DRY) {
    if (OS === "windows") ps(`Unregister-ScheduledTask -TaskName ${psq(LEGACY.task)} -Confirm:$false -ErrorAction SilentlyContinue; 'ok'`);
    else if (OS === "mac") {
      sh("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${LEGACY.label}`]);
      rmSync(join(HOME, "Library", "LaunchAgents", `${LEGACY.label}.plist`), { force: true });
    } else {
      const kept = sh("crontab", ["-l"]).out.split("\n").filter((l) => l && !l.includes(LEGACY.mark) && !/no crontab/i.test(l));
      sh("crontab", ["-"], kept.length ? `${kept.join("\n")}\n` : "");
    }
  }
  writeLauncher();
  const [h, m] = time.split(":").map(Number);
  let r;
  if (OS === "windows") {
    r = ps([
      `$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${psq(`"${VBS}"`)}`,
      `$t = New-ScheduledTaskTrigger -Daily -At ${psq(time)}`,
      // THE CATCH-UP. StartWhenAvailable should run an evening missed while
      // the computer slept or was off at the next wake-up; in practice Windows
      // does not always do it (seen on the brain this plugin grew from: two
      // evenings lost in a row). A second trigger every 30 minutes starts the
      // launcher, which ends at once when this evening's save is done (or not
      // due yet) and catches up otherwise.
      `$r = New-ScheduledTaskTrigger -Once -At ${psq(time)} -RepetitionInterval (New-TimeSpan -Minutes 30)`,
      // (The time limit and the single instance asked for here only ever see
      // wscript, which starts node and ends at once: what keeps two saves
      // apart is the launcher's own lock, and each step has its own limit.)
      "$s = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -MultipleInstances IgnoreNew",
      `Register-ScheduledTask -TaskName ${psq(TASK)} -Action $a -Trigger @($t, $r) -Settings $s -Description ${psq(WORDS.taskDescription)} -Force | Out-Null`,
      // LOCAL TIME, WHEREVER THE COMPUTER IS. Windows writes the start with the
      // time zone of the day (+02:00): a person who travels would see the save
      // run at 11 pm local time. Without a zone, the time follows the computer.
      `$k = Get-ScheduledTask -TaskName ${psq(TASK)}; foreach ($x in $k.Triggers) { $x.StartBoundary = $x.StartBoundary.Substring(0, 19) }; Set-ScheduledTask -InputObject $k | Out-Null`,
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
  // `rearm`: armed under the name of before, its launcher has moved: arm again, same time.
  const s = { os: OS, task: TASK, rearm: Boolean(LEGACY), armed: false, time: userConfig().routines?.save?.time ?? null, lastLog: last, lastRun: lastLines, review: userConfig().routines?.review ?? null };
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


// THE LIVE HUB (hub.mjs, P7): a program that stays up from the moment the
// person opens their session, and runs each source when its data moves. It is
// started by a small launcher in ~/.hypervibe-brain that finds the plugin at
// run time (an update of the plugin can move it). Separate from the evening
// save: `hub on` starts it, `hub off` stops it, and without it the brain
// simply keeps the evening's rhythm.
const HUB_TASK = `Hypervibe Brain hub${SUFFIX}`;
const HUB_LAUNCHER = join(DIR, "hub-launch.mjs");
const HUB_VBS = join(DIR, "hub.vbs");
const HUB_LABEL = `fr.hypervibe.brain.hub${SUFFIX.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
const HUB_PLIST = join(HOME, "Library", "LaunchAgents", `${HUB_LABEL}.plist`);
const HUB_UNIT_NAME = `hypervibe-brain-hub${SUFFIX.replace(/[^a-z0-9]/gi, "").toLowerCase()}.service`;
const HUB_UNIT = join(HOME, ".config", "systemd", "user", HUB_UNIT_NAME);
const HUB_LAUNCHER_CODE = `// Written by Hypervibe Brain (scripts/routines.mjs). Starts the live hub of the
// brain, with the plugin found at run time.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
const cfg = JSON.parse(readFileSync(join(${JSON.stringify(fwd(HOME))}, ".hypervibe-brain", "config.json"), "utf8"));
const r = spawnSync(process.execPath, [join(cfg.pluginRoot, "scripts", "hub.mjs")], { stdio: "ignore", windowsHide: true, env: { ...process.env, HVBRAIN_HOME: ${JSON.stringify(fwd(HOME))} } });
process.exit(r.status ?? 0);
`;

/**
 * The process of the hub that runs, or null. The lock of a hub of today is
 * kept fresh by its pulse (hub.mjs, "pulse": true): one that was not touched
 * for five minutes names a hub that is gone, whatever program now bears its
 * number (2026-11-21: the state said "running" for a hub long dead, and
 * `hub off` could stop another program in its place). A lock without a pulse
 * is a hub of before: its process is all there is to go by.
 */
function hubPid() {
  try {
    const file = join(DIR, "hub.lock");
    const l = JSON.parse(readFileSync(file, "utf8"));
    process.kill(l.pid, 0);
    if (l.pulse === true && Date.now() - statSync(file).mtimeMs > 5 * 60_000) return null;
    return l.pid;
  } catch {
    return null;
  }
}

function hubOn() {
  if (!userConfig().brain) return { ok: false, error: "no brain set up yet: create it first" };
  if (!DRY) {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(HUB_LAUNCHER, HUB_LAUNCHER_CODE, "utf8");
    setUserConfig({ pluginRoot: fwd(PLUGIN_ROOT) });
  }
  let r;
  if (OS === "windows") {
    if (!DRY) writeFileSync(HUB_VBS, `CreateObject("WScript.Shell").Run """${process.execPath}"" ""${HUB_LAUNCHER}""", 0, False\r\n`, "utf8");
    r = ps([
      `$a = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ${psq(`"${HUB_VBS}"`)}`,
      "$t = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME",
      // No time limit: it stays up for the session. What refuses a twin is
      // the hub's own lock (hub.mjs), and nothing else: the single instance
      // and the restarts asked for here only ever see wscript, which starts
      // node and ends at once, so the scheduler never knows a hub is running
      // nor that one stopped.
      "$s = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0) -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)",
      `Register-ScheduledTask -TaskName ${psq(HUB_TASK)} -Action $a -Trigger $t -Settings $s -Description ${psq("Hypervibe Brain: the brain, live (runs each source when its data moves)")} -Force | Out-Null`,
      `Start-ScheduledTask -TaskName ${psq(HUB_TASK)}`,
      "'ok'",
    ].join("; "));
  } else if (OS === "mac") {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(HUB_LABEL)}</string>
  <key>ProgramArguments</key><array><string>${xml(NODE)}</string><string>${xml(HUB_LAUNCHER)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(UNIX_PATH)}</string></dict>
  <key>StandardErrorPath</key><string>${xml(join(DIR, "logs", "hub.err.log"))}</string>
</dict></plist>
`;
    if (!DRY) {
      mkdirSync(join(HOME, "Library", "LaunchAgents"), { recursive: true });
      mkdirSync(join(DIR, "logs"), { recursive: true });
      writeFileSync(HUB_PLIST, plist, "utf8");
    }
    const uid = process.getuid?.() ?? 501;
    sh("launchctl", ["bootout", `gui/${uid}/${HUB_LABEL}`]);
    r = sh("launchctl", ["bootstrap", `gui/${uid}`, HUB_PLIST]);
    if (r.status !== 0) r = sh("launchctl", ["load", "-w", HUB_PLIST]);
  } else {
    const unit = `[Unit]\nDescription=Hypervibe Brain hub (the brain, live)\n\n[Service]\nEnvironment=PATH=${UNIX_PATH}\nExecStart="${NODE}" "${HUB_LAUNCHER}"\nRestart=always\nRestartSec=60\n\n[Install]\nWantedBy=default.target\n`;
    if (!DRY) {
      mkdirSync(dirname(HUB_UNIT), { recursive: true });
      writeFileSync(HUB_UNIT, unit, "utf8");
    }
    sh("systemctl", ["--user", "daemon-reload"]);
    r = sh("systemctl", ["--user", "enable", "--now", HUB_UNIT_NAME]);
  }
  if (r.status !== 0) return { ok: false, error: r.out.slice(0, 400) };
  if (!DRY) setUserConfig({ routines: { ...(userConfig().routines ?? {}), hub: { task: HUB_TASK, on: new Date().toISOString() } } });
  return { ok: true, hub: HUB_TASK, os: OS, dryRun: DRY || undefined, detail: DRY ? r.out : undefined };
}

function hubOff() {
  if (OS === "windows") ps(`Unregister-ScheduledTask -TaskName ${psq(HUB_TASK)} -Confirm:$false -ErrorAction SilentlyContinue; 'ok'`);
  else if (OS === "mac") {
    sh("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${HUB_LABEL}`]);
    if (!DRY) rmSync(HUB_PLIST, { force: true });
  } else {
    sh("systemctl", ["--user", "disable", "--now", HUB_UNIT_NAME]);
    if (!DRY) rmSync(HUB_UNIT, { force: true });
  }
  const pid = hubPid();
  if (pid && !DRY) {
    try {
      process.kill(pid);
    } catch {
      // gone meanwhile
    }
  }
  if (!DRY) {
    const routinesCfg = { ...(userConfig().routines ?? {}) };
    delete routinesCfg.hub;
    setUserConfig({ routines: routinesCfg });
  }
  return { ok: true, hubOff: HUB_TASK, stopped: pid ?? null, dryRun: DRY || undefined };
}

function hubState() {
  let st = null;
  try {
    st = JSON.parse(readFileSync(join(DIR, "hub-state.json"), "utf8"));
  } catch {
    st = null;
  }
  return { on: Boolean(userConfig().routines?.hub), running: hubPid(), lastBeat: st?.lastBeat ?? null, last: st?.last ?? null };
}

if (command === "hub") {
  const sub = args[1];
  out(sub === "on" ? hubOn() : sub === "off" ? hubOff() : hubState());
} else if (command === "arm") out(arm());
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
  console.log("usage: routines.mjs arm [--time HH:MM] | disarm | state | run-now | hub on|off|state   [--dry-run] [--json]");
  process.exitCode = 2;
}
