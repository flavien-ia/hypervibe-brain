#!/usr/bin/env node
// live.mjs - The LIVE VIEW of the brain: a local page that shows the map of
// the notes, the tools around it, and what reads and writes the brain as it
// happens. Its server lives in the plugin (live/server.mjs, no dependency,
// 127.0.0.1 only); this script installs it, starts it, opens it and stops it.
// The view answers only who shows its token (2026-11-21): the page carries it
// in a cookie, a program reads it in ~/.hypervibe-brain/live-token.json.
// THE WINDOW IS OPENED WITH A CODE (2026-11-27): the page no longer gets its
// cookie for the asking (any program of the computer could ask). `open` reads
// the token, asks the server for a code that serves once, and opens the
// window on the address with that code; the server gives the cookie against
// it and takes the code out of the address. A window that already has its
// cookie (the installed app, a page left open) needs none.
//
//   node scripts/live.mjs on [--dry-run]    start it with the session, and now
//   node scripts/live.mjs off [--dry-run]   no longer with the session, and stop it
//   node scripts/live.mjs open [--dry-run]  start it if needed, then open its window
//   node scripts/live.mjs state             one JSON line: installed, running, port, brain, version
//                                           (turnedOff: the person turned it off, and when)
//   node scripts/live.mjs start | stop      the server alone, the session's startup untouched
//
// One JSON line on stdout. The port is 47615; BRAIN_LIVE_PORT changes it
// (`on` keeps it in the settings: the launcher and the suggestion hook then
// find the view on it).
//
// WHY A LAUNCHER. The session starts ~/.hypervibe-brain/live-launch.mjs, which
// looks up where the plugin lives at run time: the place the settings name
// (`pluginRoot`), what Claude Code's own registry of plugins says, and of all
// the copies that carry the view, the newest version. A plugin update can
// move its folder; a start pointing at the old path would bring back the old
// view, or nothing.
//
// HOW IT STARTS WITH THE SESSION (2026-11-17): by one small file in the place
// the session itself reads when it opens, never by a scheduled task.
//   Windows  a .vbs in the Startup folder (it runs the launcher with no window)
//   macOS    a LaunchAgent (~/Library/LaunchAgents), RunAtLoad
//   Linux    a desktop entry in ~/.config/autostart
// The hub is a scheduled task (routines.mjs). The view cannot be one on
// Windows: it restarts itself when its code changes, by handing its port to a
// successor and leaving, and the Task Scheduler runs a task inside a job that
// it may close when the task's first process ends, successor included. A file
// of the Startup folder starts free processes: it is how the view has been
// started since its first day, self-restart included.
//
// NEVER A BLIND STOP. A server is only ever stopped when it answered on the
// port, said itself that it is this view serving this brain, and gave its own
// process number. A view of before (a repository of its own, which says
// neither) is left running and reported as such; so is another brain's view.
//
// HVBRAIN_TASK_SUFFIX changes the names: the test bench never touches the
// person's own start.

import { execFileSync, spawn, spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, hasBrain, setUserConfig, userConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const command = args[0];
const DRY = args.includes("--dry-run");
const SUFFIX = process.env.HVBRAIN_TASK_SUFFIX ?? "";
const TAG = SUFFIX.replace(/[^a-z0-9]/gi, "").toLowerCase();
const DIR = join(HOME, ".hypervibe-brain");
const LAUNCHER = join(DIR, "live-launch.mjs");
const LOG = join(DIR, "logs", "live-server.log");
const SERVER = join(PLUGIN_ROOT, "live", "server.mjs");
const NAME = `Hypervibe Brain live view${SUFFIX}`;
const OS = process.platform === "win32" ? "windows" : process.platform === "darwin" ? "mac" : "linux";
const DEFAULT_PORT = 47615;
const PORT = Number(process.env.BRAIN_LIVE_PORT || userConfig().routines?.live?.port || DEFAULT_PORT);
const VIEW_URL = `http://127.0.0.1:${PORT}/`;
const fwd = (p) => String(p).replace(/\\/g, "/");
const BRAIN = fwd(ROOT);
const VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), "utf8")).version ?? "");
  } catch {
    return "";
  }
})();
const out = (o) => console.log(JSON.stringify(o));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sameFolder = (a, b) => fwd(a).replace(/\/+$/, "").toLowerCase() === fwd(b).replace(/\/+$/, "").toLowerCase();
const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------- the start with the session

// The file the session reads at its opening. With HVBRAIN_HOME (the bench),
// it lives under that home like everything else: nothing of the person's.
const STARTUP = OS === "windows"
  ? join(process.env.HVBRAIN_HOME ? join(HOME, "AppData", "Roaming") : process.env.APPDATA ?? join(HOME, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup", `${NAME}.vbs`)
  : OS === "mac"
    ? join(HOME, "Library", "LaunchAgents", `fr.hypervibe.brain.live${TAG}.plist`)
    : join(HOME, ".config", "autostart", `hypervibe-brain-live${TAG}.desktop`);
const LABEL = `fr.hypervibe.brain.live${TAG}`;

/**
 * The node the session will start (as routines.mjs chooses it): with Homebrew
 * process.execPath names a versioned folder that `brew upgrade node` deletes,
 * and Homebrew keeps a stable link in opt/ across upgrades.
 */
function stableNode() {
  const p = process.execPath;
  const m = /^(.*)\/Cellar\/(node(?:@\d+)?)\/[^/]+\/bin\/node$/.exec(p);
  if (m) for (const c of [`${m[1]}/opt/${m[2]}/bin/node`, `${m[1]}/bin/node`]) if (existsSync(c)) return c;
  return p;
}
const NODE = stableNode();
const UNIX_PATH = [...new Set([dirname(NODE), "/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"])].join(":");

const LAUNCHER_CODE = `// Written by Hypervibe Brain (scripts/live.mjs). Starts the live view of the
// brain, with the plugin found at run time: an update of the plugin can move it.
// What it is given on its command line goes to the server (--restart, from a
// view that hands its port over).
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, statSync, truncateSync } from "node:fs";
import { join } from "node:path";

const HOME = ${JSON.stringify(fwd(HOME))};
const DIR = join(HOME, ".hypervibe-brain");
const read = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const cfg = read(join(DIR, "config.json")) ?? {};
const carriesView = (root) => Boolean(root) && existsSync(join(root, "live", "server.mjs"));
const versionOf = (root) => String(read(join(root, ".claude-plugin", "plugin.json"))?.version ?? "0").split(".").map((n) => parseInt(n, 10) || 0);
const newer = (a, b) => {
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};

function findPlugin() {
  // The place the settings name first, then what Claude Code's registry of
  // plugins lists (an update through its own commands puts the new version in
  // a new folder, and the settings may still name the old one).
  const places = [cfg.pluginRoot];
  const installed = read(join(HOME, ".claude", "plugins", "installed_plugins.json"))?.plugins ?? {};
  for (const [key, entries] of Object.entries(installed)) if (key.startsWith("brain@")) for (const e of [].concat(entries)) places.push(e?.installPath);
  let best = null;
  for (const p of places) if (carriesView(p) && (!best || newer(versionOf(p), versionOf(best)))) best = p;
  if (best) return best;
  // Neither knows: the newest copy of the plugin under ~/.claude/plugins.
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".git")) continue;
      const p = join(dir, e.name);
      if (carriesView(p) && existsSync(join(p, "skills", "live"))) found.push(p);
      else walk(p, depth + 1);
    }
  };
  walk(join(HOME, ".claude", "plugins"), 0);
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0] ?? null;
}

const root = findPlugin();
if (!root) process.exit(1);
// What the server says goes to one log, emptied when it grows past a megabyte.
const logFile = join(DIR, "logs", "live-server.log");
mkdirSync(join(DIR, "logs"), { recursive: true });
try {
  if (statSync(logFile).size > 1_000_000) truncateSync(logFile, 0);
} catch {
  // no log yet
}
const log = openSync(logFile, "a");
const port = cfg.routines?.live?.port;
// It stands in the plugin's settings folder, never in the plugin's own: on
// Windows a folder a program stands in cannot be renamed, and an update of
// the plugin renames it.
spawn(process.execPath, [join(root, "live", "server.mjs"), "--permanent", ...process.argv.slice(2)], { cwd: DIR, detached: true, stdio: ["ignore", log, log], windowsHide: true, env: { ...process.env, HVBRAIN_HOME: HOME, ...(port ? { BRAIN_LIVE_PORT: String(port) } : {}) } }).unref();
closeSync(log);
`;

/** What the session's file holds, on this system. */
function startupFile() {
  if (OS === "windows") {
    // wscript runs node without a console window.
    return `' Written by Hypervibe Brain (scripts/live.mjs): starts the live view of the brain when the session opens.\r\nCreateObject("WScript.Shell").Run """${process.execPath}"" ""${LAUNCHER}""", 0, False\r\n`;
  }
  if (OS === "mac") {
    // RunAtLoad only: the launcher starts the server and leaves. The server is
    // not launchd's to keep (it restarts itself), so it must outlive the job:
    // AbandonProcessGroup.
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${xml(LABEL)}</string>
  <key>ProgramArguments</key><array><string>${xml(NODE)}</string><string>${xml(LAUNCHER)}</string></array>
  <key>RunAtLoad</key><true/>
  <key>AbandonProcessGroup</key><true/>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(UNIX_PATH)}</string></dict>
  <key>StandardErrorPath</key><string>${xml(join(DIR, "logs", "live.err.log"))}</string>
</dict></plist>
`;
  }
  // (A desktop entry's own quoting: a quote, a backquote, a dollar and a backslash are escaped, a percent is doubled.)
  const quoted = (s) => `"${String(s).replace(/(["\`$\\])/g, "\\$1").replace(/%/g, "%%")}"`;
  return `[Desktop Entry]\nType=Application\nName=${NAME}\nComment=Hypervibe Brain: starts the live view of the brain when the session opens\nExec=${quoted(NODE)} ${quoted(LAUNCHER)}\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\n`;
}

const installed = () => Boolean(userConfig().routines?.live) && existsSync(STARTUP) && existsSync(LAUNCHER);

function install() {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(LAUNCHER, LAUNCHER_CODE, "utf8");
  mkdirSync(dirname(STARTUP), { recursive: true });
  // (A .vbs is written in UTF-16 with its mark: wscript reads a file without one in the system's code page, and a home folder with an accent in its name would not be found.)
  if (OS === "windows") writeFileSync(STARTUP, `${String.fromCharCode(0xfeff)}${startupFile()}`, "utf16le");
  else writeFileSync(STARTUP, startupFile(), "utf8");
  if (OS === "mac") mkdirSync(join(DIR, "logs"), { recursive: true });
  // The launcher starts the view from where the settings say the plugin is,
  // on the port chosen today when it is not the usual one.
  const routines = { ...(userConfig().routines ?? {}), live: { on: new Date().toISOString(), file: fwd(STARTUP), ...(PORT !== DEFAULT_PORT ? { port: PORT } : {}) } };
  delete routines.liveOff;
  setUserConfig({ pluginRoot: fwd(PLUGIN_ROOT), routines });
}

function uninstall() {
  // A LaunchAgent the session already loaded is unloaded too (it only ever
  // runs the launcher, which has long left). Never for the bench's own.
  if (OS === "mac" && !process.env.HVBRAIN_HOME) spawnSync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 501}/${LABEL}`], { encoding: "utf8", timeout: 30_000 });
  rmSync(STARTUP, { force: true });
  rmSync(LAUNCHER, { force: true });
  // THE PERSON TURNED IT OFF: kept, so that nothing turns it on again in
  // their place (an update of the plugin turns the view on for someone who
  // never had it, never for someone who said no).
  const routines = { ...(userConfig().routines ?? {}), liveOff: new Date().toISOString() };
  delete routines.live;
  setUserConfig({ routines });
}

// ---------------------------------------------------------------- who answers on the port

/**
 * Who holds the port:
 *   free        nobody
 *   foreign     a program that is not the live view
 *   other       the live view of another brain (another account of the computer)
 *   standalone  a live view of this brain from before it lived in the plugin (it says nothing of itself)
 *   plugin      a live view of this brain started from a copy of the plugin: { pid, version, root, permanent }
 */
/** The view's token, as this account's file keeps it ("" when there is none). */
function viewToken() {
  try {
    const kept = JSON.parse(readFileSync(join(DIR, "live-token.json"), "utf8")).token;
    return /^[0-9a-f]{64}$/.test(String(kept)) ? String(kept) : "";
  } catch {
    return "";
  }
}
async function who() {
  let text = null;
  try {
    // With the token (2026-11-27): a view only says which brain it serves, from
    // where and under which process number to who shows it.
    const token = viewToken();
    text = await (await fetch(`http://127.0.0.1:${PORT}/api/ping`, { headers: token ? { "x-brain-token": token } : {}, signal: AbortSignal.timeout(1500) })).text();
  } catch {
    text = null;
  }
  if (text === null || !text.startsWith("brain-live")) {
    // No answer of ours: is the port taken all the same?
    const taken = await new Promise((done) => {
      const s = connect({ port: PORT, host: "127.0.0.1" });
      s.setTimeout(800, () => { s.destroy(); done(false); });
      s.on("connect", () => { s.destroy(); done(true); });
      s.on("error", () => done(false));
    });
    return { kind: taken ? "foreign" : "free" };
  }
  const [, brain = "", more = ""] = text.split("\n");
  if (brain && !sameFolder(brain, BRAIN)) return { kind: "other", brain };
  let said = null;
  try {
    said = JSON.parse(more);
  } catch {
    said = null;
  }
  // A view that does not know our token says nothing of itself: it is not
  // this account's (another account of the computer, another home folder).
  if (said?.locked === true) return { kind: "other", brain: "another account's" };
  if (!said || !Number.isInteger(said.pid)) return { kind: "standalone", brain };
  return { kind: "plugin", brain, pid: said.pid, version: String(said.version ?? ""), root: fwd(said.root ?? ""), permanent: said.permanent === true, unconnected: typeof said.unconnected === "string" ? said.unconnected : null };
}

/** Whether a view that answers runs this very copy of the plugin. */
const current = (w) => w.kind === "plugin" && sameFolder(w.root, PLUGIN_ROOT) && w.version === VERSION;

/** Waits until the port is held by a view of this brain started from the plugin (ten seconds at most). */
async function waitUp(ms = 10_000) {
  for (let t = 0; t < ms; t += 200) {
    const w = await who();
    if (w.kind === "plugin") return w;
    await sleep(200);
  }
  return who();
}

/**
 * Starts the server, detached. Through the launcher when the start with the
 * session is installed (the same path as at the opening of the session, and
 * it stays up); else this copy's server, which stops by itself three minutes
 * after its last window is closed.
 */
function spawnServer() {
  mkdirSync(join(DIR, "logs"), { recursive: true });
  if (installed()) {
    // NOT A CHILD OF THE SESSION (2026-11-23). Started from a terminal of
    // Claude Code, the server was in the session's group of processes on
    // Windows, "detached" or not: when Claude Code was restarted the next
    // morning the group was closed, and the view with it, while the person
    // was told it was running. The file of the Startup folder is handed to
    // the Windows shell (explorer), which runs it as at the opening of the
    // session: a free process. (Not with a test suffix: the bench's view
    // stays its child, and stops with it.)
    if (OS === "windows" && !SUFFIX && !process.env.HVBRAIN_HOME) {
      spawn("explorer.exe", [STARTUP], { detached: true, stdio: "ignore", windowsHide: true }).unref();
      return;
    }
    spawn(process.execPath, [LAUNCHER], { cwd: DIR, detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, HVBRAIN_HOME: HOME } }).unref();
    return;
  }
  try {
    if (statSync(LOG).size > 1_000_000) truncateSync(LOG, 0);
  } catch {
    // no log yet
  }
  const log = openSync(LOG, "a");
  spawn(process.execPath, [SERVER], { cwd: DIR, detached: true, stdio: ["ignore", log, log], windowsHide: true, env: { ...process.env, HVBRAIN_HOME: HOME, BRAIN_LIVE_PORT: String(PORT) } }).unref();
  closeSync(log);
}

/**
 * Stops the view that answers on the port, if it is this brain's and started
 * from the plugin: asked again who it is right before, then its own process,
 * and nothing else.
 * @returns {Promise<number | null>} the process stopped
 */
async function stopServer() {
  const w = await who();
  if (w.kind !== "plugin") return null;
  try {
    process.kill(w.pid);
  } catch {
    return null; // gone meanwhile
  }
  for (let t = 0; t < 5000; t += 150) {
    const now = await who();
    if (now.kind !== "plugin" || now.pid !== w.pid) break;
    await sleep(150);
  }
  return w.pid;
}

/** Why the port cannot be ours, in one sentence, or null. */
const refusal = (w) =>
  w.kind === "foreign" ? `port ${PORT} is held by another program: choose another one (BRAIN_LIVE_PORT=<port>)`
  : w.kind === "other" ? `port ${PORT} already serves another brain (${w.brain}): choose another one (BRAIN_LIVE_PORT=<port>)`
  : null;

const STANDALONE_NOTE = `an older, standalone copy of the live view already serves this brain on port ${PORT}: it was left running and nothing was changed. To switch to the plugin's view, stop that copy (and whatever starts it with the session), then run this again`;

// ---------------------------------------------------------------- the commands

async function on() {
  if (!hasBrain()) return { ok: false, error: "no brain set up yet: create it first" };
  if (!existsSync(SERVER)) return { ok: false, error: `this copy of the plugin carries no live view (${fwd(SERVER)})` };
  const w = await who();
  if (refusal(w)) return { ok: false, error: refusal(w), port: PORT };
  // The owner of a standalone copy switches by hand: nothing is installed
  // beside it (two starts at the opening of the session would race for the port).
  if (w.kind === "standalone") return { ok: true, installed: installed(), running: true, standalone: true, port: PORT, url: VIEW_URL, brain: BRAIN, note: STANDALONE_NOTE };
  if (DRY) return { ok: true, dryRun: true, os: OS, startup: fwd(STARTUP), launcher: fwd(LAUNCHER), server: fwd(SERVER), port: PORT, url: VIEW_URL, wouldStart: !current(w) || !w.permanent };
  install();
  // A view that runs another copy of the plugin (an update), or one that
  // would stop with its last window: replaced by the one that stays.
  let replaced = null;
  if (w.kind === "plugin" && (!current(w) || !w.permanent)) replaced = await stopServer();
  if (w.kind !== "plugin" || replaced !== null) spawnServer();
  const up = await waitUp();
  if (up.kind !== "plugin") return { ok: false, installed: true, running: false, port: PORT, error: `the view is installed but its server did not start: see ${fwd(LOG)}` };
  return { ok: true, installed: true, running: true, os: OS, startup: fwd(STARTUP), port: PORT, url: VIEW_URL, brain: BRAIN, version: up.version, pid: up.pid, ...(replaced !== null ? { replaced } : {}) };
}

async function off() {
  const w = await who();
  if (DRY) return { ok: true, dryRun: true, os: OS, startup: fwd(STARTUP), launcher: fwd(LAUNCHER), wouldStop: w.kind === "plugin" ? w.pid : null };
  uninstall();
  const stopped = await stopServer();
  return { ok: true, installed: false, stopped, port: PORT, ...(w.kind === "standalone" ? { standalone: true, note: `an older, standalone copy of the live view serves this brain on port ${PORT}: it was not started by the plugin and was left running` } : {}) };
}

async function start() {
  if (!hasBrain()) return { ok: false, error: "no brain set up yet: create it first" };
  const w = await who();
  if (refusal(w)) return { ok: false, error: refusal(w), port: PORT };
  if (w.kind === "free") spawnServer();
  const up = w.kind === "free" ? await waitUp() : w;
  if (up.kind === "free" || up.kind === "foreign") return { ok: false, running: false, port: PORT, error: `the server did not start: see ${fwd(LOG)}, or run it in a terminal to read the error: node "${fwd(SERVER)}"` };
  return { ok: true, running: true, started: w.kind === "free", port: PORT, url: VIEW_URL, brain: BRAIN, ...(up.kind === "standalone" ? { standalone: true } : { version: up.version, pid: up.pid }) };
}

async function stop() {
  const w = await who();
  const stopped = await stopServer();
  return { ok: true, stopped, port: PORT, ...(w.kind === "standalone" ? { standalone: true, note: `an older, standalone copy of the live view serves this brain on port ${PORT}: it was left running` } : {}) };
}

async function state() {
  const w = await who();
  const running = w.kind === "plugin" || w.kind === "standalone";
  return {
    installed: installed(),
    running,
    port: PORT,
    url: VIEW_URL,
    brain: hasBrain() ? BRAIN : null,
    version: VERSION,
    os: OS,
    // The person turned it off themselves, and when.
    ...(userConfig().routines?.liveOff && !installed() ? { turnedOff: userConfig().routines.liveOff } : {}),
    // What answers on the port when it is not this copy's view.
    ...(w.kind === "plugin" ? { serving: { version: w.version, root: w.root, pid: w.pid, permanent: w.permanent }, current: current(w) } : {}),
    ...(w.kind === "standalone" ? { standalone: true } : {}),
    ...(w.kind === "other" ? { otherBrain: w.brain } : {}),
    ...(w.kind === "foreign" ? { portTaken: true } : {}),
  };
}

// ---------------------------------------------------------------- the window

// The names the installed app carried before 2026-11-17: an app installed
// then keeps its shortcut under that name until the browser renames it.
const FORMER_NAMES = ["Brain live", "Brain en direct"];

/** The names the view's installed app may carry: today's (live/i18n.mjs), then the former ones. */
async function appNames() {
  try {
    const { t } = await import("../live/i18n.mjs");
    return [...new Set([t("en").appName, t("fr").appName, ...FORMER_NAMES])];
  } catch {
    return ["Second Brain", ...FORMER_NAMES];
  }
}

/**
 * The shortcut of the installed app in the Start menu, or null. The browser
 * puts it in a folder it names in its own language ("Chrome Apps",
 * "Applications Chrome", "Edge Apps"...): every folder of the menu is looked
 * at, one level deep, rather than a list of names that misses a language.
 * @param {string} menu the Start menu's Programs folder
 * @param {string[]} names
 * @returns {string | null}
 */
function installedShortcut(menu, names) {
  let folders = [""];
  try {
    folders = ["", ...readdirSync(menu, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)];
  } catch {
    // no menu to read: nothing is installed as far as we know
  }
  for (const name of names) {
    for (const folder of folders) {
      const lnk = join(menu, folder, `${name}.lnk`);
      if (existsSync(lnk)) return lnk;
    }
  }
  return null;
}

/**
 * How the view opens on this computer, in a window of its own (no address
 * bar): the app installed from the page when there is one, else Chrome or
 * Edge in application mode, else the default browser.
 * `url`: the address to open (the view's, with a code when the window needs
 * its cookie). `app`: false to leave the installed app aside (its shortcut
 * opens the view's plain address: it cannot carry a code).
 * @param {string} [url] @param {{ app?: boolean }} [o]
 * @returns {Promise<{ how: "installed-app" | "app-window" | "browser", cmd: string, args: string[], url: string }>}
 */
async function windowPlan(url = VIEW_URL, { app = true } = {}) {
  const byDefault = OS === "windows" ? { how: "browser", cmd: "cmd", args: ["/c", "start", "", url], url } : { how: "browser", cmd: OS === "mac" ? "open" : "xdg-open", args: [url], url };
  const options = [`--app=${url}`, "--window-size=1400,950"];
  if (OS === "windows") {
    // The installed application, if it is: Chrome (or Edge) then created a real
    // shortcut, with the view's own icon. Starting it through that shortcut
    // keeps this icon in the taskbar. The shortcut carries the name the page
    // had when it was installed (either language), and the usual port.
    if (app && PORT === DEFAULT_PORT) {
      const menu = join(process.env.APPDATA ?? "", "Microsoft", "Windows", "Start Menu", "Programs");
      const lnk = installedShortcut(menu, await appNames());
      if (lnk) return { how: "installed-app", cmd: "cmd", args: ["/c", "start", "", lnk], url: VIEW_URL };
    }
    // The browser that already runs, Chrome first: a window in a browser that
    // already runs only costs its page.
    const local = process.env.LOCALAPPDATA ?? "";
    const pf = process.env.ProgramFiles ?? "C:/Program Files";
    const pf86 = process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)";
    const chrome = [join(pf, "Google/Chrome/Application/chrome.exe"), join(pf86, "Google/Chrome/Application/chrome.exe"), join(local, "Google/Chrome/Application/chrome.exe")].find(existsSync);
    const edge = [join(pf86, "Microsoft/Edge/Application/msedge.exe"), join(pf, "Microsoft/Edge/Application/msedge.exe")].find(existsSync);
    let running = "";
    try {
      running = execFileSync("tasklist", ["/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true }).toLowerCase();
    } catch {
      // never mind: the first one found will do
    }
    const exe = edge && running.includes("msedge.exe") && !running.includes("chrome.exe") ? edge : chrome ?? edge;
    return exe ? { how: "app-window", cmd: exe, args: options, url } : byDefault;
  }
  if (OS === "mac") {
    const browser = ["Google Chrome", "Microsoft Edge", "Chromium"].find((n) => existsSync(`/Applications/${n}.app`) || existsSync(join(process.env.HOME ?? "", "Applications", `${n}.app`)));
    return browser ? { how: "app-window", cmd: "open", args: ["-na", browser, "--args", ...options], url } : byDefault;
  }
  // Linux: the first Chrome or Chromium of the PATH; otherwise the default browser.
  const folders = String(process.env.PATH ?? "").split(":").filter(Boolean);
  const exe = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"].flatMap((n) => folders.map((d) => join(d, n))).find(existsSync);
  return exe ? { how: "app-window", cmd: exe, args: options, url } : byDefault;
}

/**
 * The view's address with a code that gives the window its cookie, once
 * (see the top). The plain address when no code could be had: a view of
 * before the codes, or one that does not know this account's token.
 */
async function addressWithCode() {
  const token = viewToken();
  if (!token) return VIEW_URL;
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/api/code`, { method: "POST", headers: { "x-brain-token": token }, signal: AbortSignal.timeout(3000) });
    const code = r.ok ? String((await r.json()).code ?? "") : "";
    return /^[0-9a-f]{16,}$/.test(code) ? `${VIEW_URL}?code=${code}` : VIEW_URL;
  } catch {
    return VIEW_URL;
  }
}

/** Opens the window; a browser that cannot be started leaves its place to the default one. */
function openWindow(plan) {
  /** @param {string} cmd @param {string[]} a @param {() => void} [otherwise] */
  const launch = (cmd, a, otherwise) => {
    const child = spawn(cmd, a, { detached: true, stdio: "ignore", windowsHide: cmd === "cmd" });
    child.on("error", () => otherwise?.());
    child.unref();
  };
  const url = plan.url ?? VIEW_URL;
  launch(plan.cmd, plan.args, plan.how === "app-window" ? () => (OS === "windows" ? launch("cmd", ["/c", "start", "", url]) : launch(OS === "mac" ? "open" : "xdg-open", [url])) : undefined);
}

async function open() {
  const plan = await windowPlan();
  if (DRY) {
    const w = await who();
    // A port that serves another brain is never opened in this person's place.
    if (refusal(w)) return { ok: false, error: refusal(w), port: PORT };
    return { ok: true, dryRun: true, wouldStart: w.kind === "free", wouldOpen: plan.how, with: fwd(plan.cmd), url: VIEW_URL };
  }
  const started = await start();
  if (!started.ok) return started;
  // The installed app opens from its shortcut, with the cookie it already
  // has. Any other window is opened on the address with a code.
  if (plan.how !== "installed-app") {
    openWindow(await windowPlan(await addressWithCode()));
    return { ...started, opened: plan.how };
  }
  const before = Date.now();
  openWindow(plan);
  // AN INSTALLED APP THAT LOST ITS COOKIE (its data was cleared) shows the
  // screen "not connected": the server saw a page asked for without a cookie.
  // A window of the same browser is then opened with a code: the cookie it
  // gets is the app's too, which connects by itself a few seconds later.
  await sleep(2500);
  const now = await who();
  if (now.kind === "plugin" && now.unconnected && Date.parse(now.unconnected) >= before - 500) {
    openWindow(await windowPlan(await addressWithCode(), { app: false }));
    return { ...started, opened: plan.how, connected: "by a window opened with a code" };
  }
  return { ...started, opened: plan.how };
}

const commands = { on, off, open, state, start, stop };
if (commands[command]) {
  out(await commands[command]());
  // (The window's browser was started detached: nothing holds this script.)
} else {
  console.log("usage: live.mjs on | off | open | state | start | stop   [--dry-run]");
  process.exitCode = 2;
}
