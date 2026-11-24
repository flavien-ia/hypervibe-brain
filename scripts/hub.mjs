#!/usr/bin/env node
// hub.mjs - The brain, live (P7). A program that stays up, started when the
// person opens their session, and runs each source when its data moves rather
// than once an evening. The evening save stays: it catches up whatever was
// missed, saves, pushes and publishes.
//
// ONE MODEL FOR EVERY SOURCE: the hub asks, no source pushes. What makes a
// source due is declared in its own source.json, and nowhere else:
//   "every": "5m" | "30m" | "hour"     a tick of the clock ("day" and "week" keep the
//                                      evening's rhythm, unless a trigger)
//   "after": ["skill:scrape-my-x",     a skill that just ran (seen by the
//             "source:contacts"]       plugin's Stop hook), or another source
//                                      that just ran
//   "needs": ["GMAIL_API"]             the vault items it reads
//   "paused": true                     never runs by itself (sources.mjs pause):
//                                      not by its rhythm, a flag, the source
//                                      before it, nor the evening; only "now",
//                                      asked by the person, runs it once
// A skill never knows the brain exists.
//
// NO FILE WATCH (removed 2026-11-10). Until then a source could declare
// "files" (folders whose moves woke it, after a calm). No source used it any
// more: a folder is read by a script source on its own rhythm, which sees what
// moved since its last run, also what moved while the computer was off, and
// costs nothing between two runs. One model fewer, and no watcher to keep
// alive on three systems.
//
// THE VAULT, AS A QUEUE. A source that needs keys runs when the vault is open.
// Closed: the source waits in ~/.hypervibe-brain/queue.json (what to run,
// never a secret), and the vault's own window is opened, one at a time (the
// vault's launcher refuses a second one). A window closed without unlocking:
// not asked again for an hour (chosen on 2026-11-07). The queue
// empties at the first beat that finds the vault open, whoever opened it.
// The rule is the same for whoever runs a source (vault-queue.mjs,
// 2026-11-21): the evening save puts there the sources it could not run, of
// any rhythm, and the hub runs them once the vault is open. A source that is
// gone or disabled leaves the queue.
//
// One instance at a time (~/.hypervibe-brain/hub.lock, kept fresh by a pulse:
// a lock whose process number went to another program no longer stops a hub
// from starting); sources one at a time (they write in the same vault).
//
// NEVER WHILE THE EVENING SAVE RUNS, IN BOTH DIRECTIONS (2026-11-21). The hub
// looked at the evening's lock (~/.hypervibe-brain/nightly.lock) at the start
// of a beat only, a beat lasts up to half an hour, and the evening never
// looked at the hub: at 19:30, in the middle of a judge's reading, the evening
// ran its sources, rebuilt and saved, then the hub rebuilt and saved over it.
// Now each says "I am at work" FIRST and looks at the other AFTER: the hub
// writes hub-beat.json for the length of a beat, then reads the evening's
// lock; the evening takes its lock, then waits for hub-beat.json to go. And a
// beat that sees the evening arrive yields: it starts no other source nor
// judge's pass, and leaves the rebuild and the save to the evening.
//
// After a source that wrote: the index is
// rebuilt at once, and what the sources wrote is committed on this computer,
// ONE COMMIT AN HOUR AT MOST (a beat that writes within the hour notes the
// save as due, and the first beat past the hour makes it). Never a push: the
// evening and the synchronisation after a capture push, as before.
//
// Time is measured by the clock, not by the timer: a computer that slept
// wakes up with every timer fired at once, and the hub catches up rather than
// believing nothing happened (seen on the brain this plugin grew from, 2026-08-20).
//
//   node scripts/hub.mjs             stay up (what the session start launches)
//   node scripts/hub.mjs --once      one beat, then stop (the test bench, a check)
//   node scripts/hub.mjs --dry       say what would run, run nothing

import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { CONFIG_FILE, HOME, PLUGIN_ROOT, ROOT, config, hasBrain, isFrench, isRunner, readJsonFile, userConfig, userConfigProblem, writeFileAtomic } from "./lib.mjs";
import { logEvent } from "./journal.mjs";
import { interval, tickPassed } from "./pure.mjs";
import { duePiles, liveSources, mayRun, nowAsked, nowFile, run as judge, waiting as pileSize } from "./judge.mjs";
import { tokenOutsideVault } from "./judge-token.mjs";
import { judgeErrorClass } from "./judge-errors.mjs";
import { dequeue, enqueue, readQueue, vaultDir, vaultState } from "./vault-queue.mjs";

export { vaultState };

const args = process.argv.slice(2);
const ONCE = args.includes("--once") || args.includes("--dry");
const DRY = args.includes("--dry");
const DIR = join(HOME, ".hypervibe-brain");
const LOCK = join(DIR, "hub.lock");
const STATE = join(DIR, "hub-state.json");
const DUE = join(DIR, "due");
const NIGHTLY_LOCK = join(DIR, "nightly.lock");
// "A beat is at work", for the evening save to wait for its end (see the top).
const BEAT = join(DIR, "hub-beat.json");
const BEAT_MS = Number(process.env.HVBRAIN_HUB_BEAT_MS || 60_000);
// The hub's own saves: when the last one was made and whether one is owed, on
// disk so that a hub started again keeps counting from where the last stopped.
const SAVE = join(DIR, "hub-save.json");
const SAVE_MS = Number(process.env.HVBRAIN_HUB_SAVE_MS || 3600_000);
const ASK_AGAIN_MS = 3600_000;
const ALERT_AGAIN_MS = 86400_000;
// An alert that could not leave is tried again, an hour later at the earliest.
const ALERT_RETRY_MS = 3600_000;
// A vault found locked is not asked again at every beat (see vaultNow).
const VAULT_AGAIN_MS = 5 * 60_000;
// The evening's lock counts for this long: past it, its process number is
// taken for another program's.
const EVENING_MS = 3 * 3600_000;
const SOURCES = () => join(ROOT, "sources");

const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
// Written whole or not at all (lib.mjs, 2026-11-21): the live view and the
// evening save read these files while the hub writes them.
const writeJson = (f, o) => writeFileAtomic(f, `${JSON.stringify(o)}\n`);
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
};
/**
 * The evening save's lock, { pid, at }, whichever way it was written: one
 * JSON object since 2026-11-21, the bare number of its process before (a
 * launcher armed by an earlier version still writes that, and the hub did not
 * recognise it: no source waited for such an evening).
 */
function eveningLock() {
  let raw = "";
  try {
    raw = readFileSync(NIGHTLY_LOCK, "utf8").trim();
  } catch {
    return null;
  }
  let pid = Number(raw);
  let at = null;
  if (!raw || !Number.isInteger(pid)) {
    try {
      const o = JSON.parse(raw);
      pid = Number(o?.pid);
      at = typeof o?.at === "string" ? o.at : null;
    } catch {
      return null;
    }
  }
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (!at) {
    try {
      at = statSync(NIGHTLY_LOCK).mtime.toISOString();
    } catch {
      return null; // gone meanwhile
    }
  }
  return { pid, at };
}
/** Is the evening save at work (or waiting for this beat to end)? */
function eveningRunning() {
  const n = eveningLock();
  return Boolean(n && alive(n.pid) && Date.now() - Date.parse(n.at) < EVENING_MS);
}
function log(line) {
  try {
    mkdirSync(join(DIR, "logs"), { recursive: true });
    appendFileSync(join(DIR, "logs", `hub-${new Date().toISOString().slice(0, 10)}.log`), `${new Date().toISOString()}  ${line}\n`, "utf8");
  } catch {
    // a log that fails never stops the hub
  }
}

/** Every enabled source the hub may run, with its definition and state. */
export function definitions() {
  if (!existsSync(SOURCES())) return [];
  const out = [];
  for (const n of readdirSync(SOURCES()).sort()) {
    const d = readJson(join(SOURCES(), n, "source.json"), null);
    if (!d || d.enabled === false || !["script", "step"].includes(d.kind)) continue;
    out.push({ name: n, def: d, state: readJson(join(SOURCES(), n, "state.json"), {}) });
  }
  return out;
}

// When this hub last started each source. A run that leaves no trace in the
// source's state (sources.mjs gave no answer, a state that cannot be written)
// made the source due again at every beat, minute after minute: what the hub
// did itself counts as a run too (2026-11-21).
/** @type {Map<string, number>} */
const attempted = new Map();

/** The sources a tick of the clock made due. */
export function dueByTime(defs = definitions(), now = Date.now()) {
  return defs
    .filter((s) => {
      if (s.def.paused === true) return false;
      const ms = interval(s.def.every);
      if (!ms) return false;
      // Due when a tick of the clock fell since its last run (pure.mjs): every
      // source of a rhythm runs at the same moment, :00 and :30 for "30m".
      // A last run dated in the future (the clock was set back) counts as now:
      // the source waits for its next tick, not for the clock to catch up.
      const last = Math.min(now, Math.max(Date.parse(s.state.lastRun ?? s.state.lastSuccess ?? "") || 0, attempted.get(s.name) ?? 0));
      return tickPassed(last, now, ms);
    })
    .map((s) => s.name);
}

// ------------------------------------------------- the triggers: flags on disk
// A flag says "run this source at the next beat": written by the Stop hook
// when a skill ran (hook-journal.mjs), or by the live view when the person
// asks for a run now. On disk, so that a flag set while the hub was down
// waits for it.
const flagged = () => (existsSync(DUE) ? readdirSync(DUE).filter((n) => existsSync(join(SOURCES(), n, "source.json"))) : []);
const unflag = (name) => rmSync(join(DUE, name), { force: true });

/** The sources that wait for this one ("after": ["source:<name>"]); never a paused one. */
const followers = (name, defs) => defs.filter((s) => s.def.paused !== true && (s.def.after ?? []).includes(`source:${name}`)).map((s) => s.name);

// -------------------------------------------------------------------- the vault
// Where the vault is, and whether it is open: vault-queue.mjs, shared with
// sources.mjs. (Its folder was looked for once, when the hub started: after an
// update of the vault's plugin it was "locked" for as long as the hub ran.)
//
// A VAULT FOUND LOCKED IS NOT ASKED AGAIN AT EVERY BEAT (2026-11-21). Asking
// starts the vault's own program, each minute, for as long as the vault stays
// closed: a whole night. Found locked, it is asked again five minutes later at
// the earliest, or at once when the window this hub opened has closed. Found
// open, the answer holds for a minute: the vault can lock itself any time, and
// a beat lasts long enough for it to (it was asked once a beat, and a source
// run twenty minutes later failed on a vault closed since).
const VAULT_OPEN_MS = 60_000;
let vaultSeen = { state: null, at: 0 };
function vaultNow() {
  const age = Date.now() - vaultSeen.at;
  if (vaultSeen.state === "locked" && age < VAULT_AGAIN_MS) return "locked";
  if (vaultSeen.state === "unlocked" && age < VAULT_OPEN_MS) return "unlocked";
  vaultSeen = { state: vaultState(), at: Date.now() };
  return vaultSeen.state;
}
let window = null; // the unlock window this hub opened
let refusedAt = 0;
function askVault() {
  const dir = vaultDir();
  if (process.env.HVBRAIN_HUB_VAULT || !dir) return false;
  if (window || Date.now() - refusedAt < ASK_AGAIN_MS) return false;
  // The vault's launcher opens one window at a time: if a session already
  // opened one, this call waits for it instead of opening a second.
  const w = spawn(process.execPath, [join(dir, "launch.mjs"), "unlock", "--lang", isFrench(config()) ? "fr" : "en"], { stdio: "ignore", detached: true, windowsHide: false });
  window = w;
  logEvent({ act: "signal", who: "hub", what: "vault-asked" });
  log("vault locked: the unlock window is opened");
  w.on("exit", () => {
    window = null;
    // Asked afresh: the window has just closed, the next beat must know at once.
    vaultSeen = { state: null, at: 0 };
    if (vaultNow() !== "unlocked") {
      refusedAt = Date.now();
      log("unlock window closed, vault still locked: not asked again for an hour");
    }
  });
  w.unref();
  return true;
}

// -------------------------------------------------------------------- one beat
function node(script, extra = [], timeoutMin = 15, env = {}) {
  const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", script), ...extra], { encoding: "utf8", windowsHide: true, timeout: timeoutMin * 60_000, env: { ...process.env, ...env } });
  return { ok: r.status === 0, out: String(r.stdout ?? ""), err: String(r.stderr ?? "") };
}

/** Runs one source; says whether it wrote anything. */
// WHY it runs (the flag's reason, the clock, the vault, the source before it):
// written in the journal's "running" event, which the live view shows when
// the flow is hovered.
// ITS OWN TIME LIMIT COMES FIRST (2026-11-21). Every source was stopped from
// here after 15 minutes, whatever its own limit ("timeoutMin": 20, 25, 30 on a
// real brain): stopped from outside it writes no state, so it was due again at
// the next beat, and its program went on alone. The limit here is the
// source's own plus five minutes for what sources.mjs does around it.
function runSource(n, why = "", timeoutMin = 5) {
  attempted.set(n, Date.now());
  const own = Number(timeoutMin) > 0 ? Number(timeoutMin) : 5;
  // When this hub has just seen the vault open, it says so: sources.mjs then
  // does not ask the vault a second time for the same source.
  const seenOpen = vaultSeen.state === "unlocked" ? { HVBRAIN_VAULT_OPEN_AT: String(vaultSeen.at) } : {};
  const r = node("sources.mjs", ["run", n], Math.max(15, own + 5), { HVBRAIN_RUN_WHY: String(why).slice(0, 200), ...seenOpen });
  let res = null;
  try {
    res = JSON.parse(r.out.trim().split("\n").pop()).runs?.[0] ?? null;
  } catch {
    res = null;
  }
  // The vault locked itself since this beat asked: sources.mjs did not run the
  // source and put it in the queue itself.
  if (res?.waiting === "vault") {
    log(`${n}: waits for the vault, which locked itself`);
    return { name: n, ok: false, wrote: false, waiting: true };
  }
  const wrote = res ? (res.created ?? 0) + (res.updated ?? 0) + (res.zones ?? 0) + (res.entries ?? 0) + (res.contacts ?? 0) > 0 : false;
  log(`${n}: ${res ? (res.ok ? "ok" : `error ${String(res.error ?? "").slice(0, 200)}`) : `no answer ${r.err.slice(0, 200)}`}${wrote ? ", wrote" : ""}`);
  return { name: n, ok: Boolean(res?.ok), wrote };
}

/**
 * THE SAVES, GROUPED (2026-11-10): one commit an hour at most (it was one a
 * beat that wrote: 185 commits in a day, for counters that change every
 * quarter of an hour). A beat that wrote within the hour of the last save
 * notes a save as due; the first beat once the hour has passed makes it, even
 * if that beat wrote nothing. Null when there is nothing to save nor owed.
 */
function groupedSave(wrote) {
  const sv = readJson(SAVE, {});
  if (!wrote && !sv.due) return null;
  const left = SAVE_MS - (Date.now() - (Date.parse(sv.lastSave ?? "") || 0));
  if (left > 0) {
    if (!sv.due) writeJson(SAVE, { ...sv, due: true });
    return { state: "postponed", left };
  }
  const s = node("save.mjs", ["--no-push"]);
  // A save that failed stays due, and is tried again an hour later, not at every beat.
  writeJson(SAVE, { lastSave: new Date().toISOString(), due: !s.ok });
  return { state: s.ok ? "done" : "failed", said: (s.out.trim().split("\n").pop() || s.err.trim().split("\n").pop() || "").slice(0, 200) };
}

/**
 * A JUDGE DOWN (2026-11-10). A judge that fails waits an hour and tries again,
 * for ever: an expired login went unseen for days. At its second failure in a
 * row ("failures" in its state.json, counted by judge.mjs), the person is
 * told by the plugin's own alert (letter.mjs alert, the evening save's: a
 * short mail by the letter's channel, and ~/.hypervibe-brain/alert.json
 * either way), once a day at most for each judge. No channel, no key, a mail
 * refused: said in the log, never an error of the beat. The mail says since
 * when the judge fails ("failingSince" in its state), and letter.mjs reads
 * the likely cause in the error (2026-11-17).
 *
 * AN ALERT THAT DID NOT LEAVE IS NOT AN ALERT GIVEN (2026-11-21). "alertedAt"
 * was written whatever had happened: on 2026-11-18 three mails failed on a
 * network that was down, and the three judges kept quiet for a day. It is now
 * written only when the mail left, or when the letter's channel keeps alerts
 * on this computer by design (no channel, the connector). A mail that failed
 * is tried again at the judge's next failure, an hour later at the earliest.
 */
const NETWORK_ALERT_AFTER_MS = 3600_000;
/** @type {Map<string, number>} when an alert of each judge last failed to leave */
const alertTried = new Map();
function alertJudge(name, error) {
  const f = join(SOURCES(), name, "state.json");
  // Read to be written again: a state that cannot be read is left alone
  // (judge.mjs puts it aside at the judge's next run).
  const read = readJsonFile(f, {});
  if (read.unreadable) return;
  const st = read.value && typeof read.value === "object" ? read.value : {};
  const failures = Number(st.failures) || 0;
  if (failures < 2 || Date.now() - (Date.parse(st.alertedAt ?? "") || 0) < ALERT_AGAIN_MS) return;
  if (Date.now() - (alertTried.get(name) ?? 0) < ALERT_RETRY_MS) return;
  // A NETWORK THAT DROPS IS NOT WORTH A MAIL (2026-11-20). On a guest network
  // that came and went for an afternoon, three judges sent three mails for a
  // failure that mended by itself; a judge tries again every ten minutes after
  // a network failure. The person is told once it has lasted an hour.
  if (judgeErrorClass(error || st.lastError) === "network" && Date.now() - (Date.parse(st.failingSince ?? "") || Date.now()) < NETWORK_ALERT_AFTER_MS) return;
  const left = pileSize(name);
  const problem = String(error || st.lastError || "").slice(0, 300);
  let sent = false;
  // Given: the mail left, or the channel keeps alerts on this computer by design.
  let given = false;
  let said = "";
  try {
    const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "letter.mjs"), "alert"], { input: JSON.stringify({ judge: { name, error: problem, failures, waiting: left, since: st.failingSince ?? st.lastRun ?? null } }), encoding: "utf8", windowsHide: true, timeout: 2 * 60_000 });
    let a = {};
    try {
      a = JSON.parse(String(r.stdout ?? "").trim().split("\n").pop() || "{}");
    } catch {
      a = {};
    }
    sent = a.sent === true;
    const refused = Boolean(a.error) || r.status !== 0;
    given = sent || !refused;
    said = sent ? `sent by ${a.channel}` : refused ? `NOT sent: ${String(a.error ?? `exit ${r.status} ${String(r.stderr ?? "").trim()}`).slice(0, 200)}` : `kept on this computer only (letter channel: ${a.channel ?? "none"})`;
  } catch (e) {
    said = `NOT sent: ${e.message}`;
  }
  if (given) writeJson(f, { ...st, alertedAt: new Date().toISOString() });
  else alertTried.set(name, Date.now());
  logEvent({ act: "signal", who: `source:${name}`, what: "alert", failures, waiting: left, error: problem, sent });
  log(`${name}: ${failures} failures in a row, ${left} item(s) waiting; alert ${said}`);
}

/**
 * THE SETTINGS OF THIS COMPUTER CANNOT BE READ (2026-11-21). lib.mjs no longer
 * writes over ~/.hypervibe-brain/config.json when it is there and unreadable
 * (setUserConfig throws, a copy is kept as config.json.bad). Every program the
 * hub starts then stops on it (no brain, no approval of the sources): rather
 * than fail them all at every beat, the hub runs nothing until the file is
 * repaired. Said ONCE: one line in its log, one event, one alert (the letter's
 * channel when this hub knows its brain, alert.json otherwise), kept in
 * settings-alert.json so that a hub started again does not say it again. An
 * alert that could not leave is tried again an hour later; a new problem is
 * said anew; a repaired file clears the mark.
 * @returns {string | null} the problem, or null when the settings read well
 */
const SETTINGS_ALERT = join(DIR, "settings-alert.json");
let settingsSaid = null; // the same mark, in memory, should the file not be written
function settingsProblem() {
  const problem = userConfigProblem();
  if (!problem) {
    settingsSaid = null;
    if (existsSync(SETTINGS_ALERT)) {
      rmSync(SETTINGS_ALERT, { force: true });
      log("the settings of this computer read well again: the hub goes on");
    }
    return null;
  }
  const said = readJson(SETTINGS_ALERT, null) ?? settingsSaid;
  if (said?.problem === problem && (said.given || Date.now() - (Date.parse(said.at) || 0) < ALERT_RETRY_MS)) return problem;
  const file = CONFIG_FILE.replaceAll("\\", "/");
  if (said?.problem !== problem) {
    log(`the settings of this computer (${file}) cannot be read (${problem}): nothing runs until the file is repaired (a copy is kept as config.json.bad)`);
    logEvent({ act: "signal", who: "hub", what: "alert", settings: true, error: String(problem).slice(0, 300) });
  }
  let given = false;
  if (hasBrain()) {
    // This hub knows its brain (it read it before the file broke): the letter
    // is run on that brain, since it could not find it by itself now.
    const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "letter.mjs"), "alert"], { input: JSON.stringify({ settings: { error: problem, file } }), encoding: "utf8", windowsHide: true, timeout: 2 * 60_000, env: { ...process.env, HVBRAIN_DIR: ROOT } });
    let a = {};
    try {
      a = JSON.parse(String(r.stdout ?? "").trim().split("\n").pop());
    } catch {
      a = {};
    }
    given = r.status === 0 && !a.error;
    log(`settings: alert ${a.sent ? `sent by ${a.channel}` : given ? "kept on this computer only" : `NOT sent: ${String(a.error ?? `exit ${r.status}`).slice(0, 200)}`}`);
  } else {
    // No brain known: no letter to send it by. Kept where /brain:status and the
    // live view read an alert.
    try {
      writeJson(join(DIR, "alert.json"), { date: new Date().toISOString(), settings: true, problems: [`${file}: ${problem}`], sent: false });
      given = true;
    } catch {
      given = false;
    }
  }
  settingsSaid = { problem, at: new Date().toISOString(), given };
  try {
    writeJson(SETTINGS_ALERT, settingsSaid);
  } catch {
    // without the mark, the alert is said again an hour later at the most
  }
  return problem;
}

// What the last beat said to be waiting for the vault: a beat that only waits,
// for the same sources as the one before, writes nothing more in the journal
// (884 of the hub's 2 915 events on a real brain said "still waiting").
let saidWaiting = "";

/**
 * One beat. Returns what it did. `sleptSince(ms)`: did the computer sleep
 * since that moment? (the hub's pulse knows; see the program, below).
 * @param {{ sleptSince?: (since: number) => boolean }} [options]
 */
export function beat(options = {}) {
  // Settings there and unreadable: nothing runs, said once (settingsProblem).
  if (settingsProblem()) return { skipped: "the settings of this computer cannot be read" };
  if (!hasBrain()) return { skipped: "no brain" };
  const cfg = config();
  if (!isRunner(cfg)) return { skipped: "not the runner: this computer reads, the runner feeds" };
  if (DRY) return eveningRunning() ? { skipped: "the evening save is running" } : work(options);
  // "A beat is at work" FIRST, the evening's lock AFTER (see the top): of a
  // beat and an evening that start in the same instant, one sees the other.
  try {
    writeJson(BEAT, { pid: process.pid, at: new Date().toISOString() });
  } catch {
    // without it the evening does not wait for this beat: as before
  }
  try {
    if (eveningRunning()) return { skipped: "the evening save is running" };
    return work(options);
  } finally {
    try {
      if (readJson(BEAT, null)?.pid === process.pid) rmSync(BEAT, { force: true });
    } catch {
      // gone already
    }
  }
}

/**
 * The sources due, a source after the one it follows ("after":
 * ["source:<name>"]) when both are due in the same beat. They ran in the
 * order of their names: "annuaire", due by its own rhythm, passed before
 * "contacts" which feeds it, and was not run again after (2026-11-21).
 */
function inOrder(due, byName) {
  const out = [];
  const visit = (name, onTheWay) => {
    if (out.includes(name) || onTheWay.has(name)) return;
    onTheWay.add(name);
    for (const a of byName.get(name)?.def.after ?? []) {
      const before = /^source:(.+)$/.exec(String(a))?.[1];
      if (before && due.includes(before)) visit(before, onTheWay);
    }
    out.push(name);
  };
  for (const name of due) visit(name, new Set());
  return out;
}

function work({ sleptSince } = {}) {
  const defs = definitions();
  const byName = new Map(defs.map((s) => [s.name, s]));
  // The queue as the disk holds it now (vault-queue.mjs). Each change below
  // is made on the disk at once: the evening save and sources.mjs queue too.
  const queue = readQueue() ?? {};
  // Due: by time, by a flag, or waiting in the queue for the vault.
  // A PAUSED SOURCE ("paused": true) never runs by itself: not by its rhythm
  // (dueByTime), nor by a skill's flag, nor from the queue, nor
  // after another source (followers). Its flags and its place in the queue
  // stay where they are, for the day it is resumed. The one exception is the
  // person's own "now" (the live view's button writes a flag whose why is
  // "now"), which runs it once.
  const flagWhy = (name) => readJson(join(DUE, name), null)?.why;
  const held = (name) => byName.get(name)?.def.paused === true && flagWhy(name) !== "now" && queue[name]?.why !== "now";
  const due = inOrder([...new Set([...Object.keys(queue), ...flagged(), ...dueByTime(defs)])].filter((x) => byName.has(x) && !held(x)), byName);
  if (DRY) return { due, queued: Object.keys(queue) };
  // THE QUEUE EMPTIES (2026-11-21): a source that is gone or was disabled left
  // its name in the queue for ever, and the view drew it a key for ever. (A
  // paused one keeps its place, as said above.)
  for (const name of Object.keys(queue)) {
    if (byName.has(name)) continue;
    dequeue(name);
    delete queue[name];
  }
  let vault = null;
  const runs = [];
  const waiting = [];
  const byFollower = new Map();
  // The evening save arrived while this beat was at work: nothing more is
  // started, and the rebuild and the save are left to it (see the top).
  let yielded = false;
  for (let i = 0; i < due.length; i++) {
    if (eveningRunning()) {
      yielded = true;
      break;
    }
    const name = due[i];
    const needs = [].concat(byName.get(name).def.needs ?? []);
    if (needs.length) {
      vault = vaultNow();
      if (vault === "locked") {
        // A "now" keeps its reason in the queue: it is what lets a paused source through.
        if (!queue[name]) queue[name] = enqueue(name, needs, flagWhy(name) === "now" ? { why: "now" } : {});
        waiting.push(name);
        unflag(name);
        continue;
      }
    }
    const why = queue[name] ? "vault" : readJson(join(DUE, name), null)?.why ?? (byFollower.get(name) ? `source:${byFollower.get(name)}` : "time");
    if (queue[name]) dequeue(name);
    delete queue[name];
    unflag(name);
    const r = runSource(name, why, byName.get(name).def.timeoutMin);
    // sources.mjs found the vault locked after all, and queued the source itself.
    if (r.waiting) {
      vault = "locked";
      vaultSeen = { state: "locked", at: Date.now() };
      waiting.push(name);
      continue;
    }
    runs.push(r);
    // The sources that follow this one run in the same beat.
    if (r.ok) for (const f of followers(name, defs)) if (!due.includes(f)) { due.push(f); byFollower.set(f, name); }
  }
  // WHAT NEEDS UNDERSTANDING (judge.mjs): a live source of Claude whose pile
  // has gathered long enough. Its pile waits on disk while the vault is locked.
  // A CYCLE IN ONE GO (2026-11-10: once it starts, it does the whole pile until
  // it is done, and only then do its fifteen minutes start again): a judge keeps passing, batch after batch, until its pile is
  // empty, in this same beat. Thirty minutes at most, since nothing else runs
  // meanwhile: past that, the other sources get their turn and the pile goes
  // on at the next beat. A judge that fails or does not shrink its pile stops.
  const cycleEnd = Date.now() + 30 * 60_000;
  const judged = new Set();
  const stopped = new Set();
  // A judge asked "now" goes on until its pile is empty like any other, even
  // where duePiles() would not bring it back after its first pass (paused,
  // out of its hours, items too fresh): the request is spent by that first pass.
  // A "NOW" ON AN EMPTY PILE IS SPENT (2026-11-21). The live view writes one
  // whatever the pile holds; it stayed there, and days later the first item
  // to arrive woke the judge out of its hours, paused or past its cap. The
  // sources of this beat have run: a pile still empty has nothing to read now,
  // and the request is dropped (one older than an hour too: nowAsked).
  const live = liveSources();
  const asked = new Set();
  for (const s of live) {
    if (!nowAsked(s.name)) continue;
    if (pileSize(s.name) > 0) asked.add(s.name);
    else rmSync(nowFile(s.name), { force: true });
  }
  // (The first look uses the live sources just read; every later one reads
  // them again, so that a judge paused during a long cycle stops there.)
  let first = true;
  const ready = () => {
    const due = first ? duePiles(new Date(), live) : duePiles();
    first = false;
    return [...new Set([...due, ...[...asked].filter((x) => pileSize(x) > 0)])].filter((x) => !stopped.has(x));
  };
  // A JUDGE'S LIMITS (2026-11-17, judge.mjs mayRun). Asked before EACH pass:
  // a judge held before a big catch-up (its pile holds more than "catchUp"
  // items the person has not agreed to) or at its cap for the day
  // ("dailyTokens") is not run, and its pile keeps gathering. A pass in
  // progress is never interrupted, so the cap can be passed by one pass. The
  // person's own "now" passes both, as it runs a paused judge. Before the
  // vault: a judge that will not run must not open its window.
  const gated = [];
  let piles = yielded ? [] : ready();
  while (piles.length && Date.now() < cycleEnd && !yielded) {
    for (const name of piles) {
      if (eveningRunning()) {
        yielded = true;
        break;
      }
      const gate = mayRun(name, { asked: asked.has(name) });
      if (!gate.ok) {
        stopped.add(name);
        gated.push({ name, why: gate.why });
        // Said once in the log, when the journal says it: the judge stays due at every beat.
        if (gate.first) log(gate.why === "capped" ? `${name}: at its cap for today (${gate.spent} tokens used, cap ${gate.cap}), not run until tomorrow` : `${name}: held before a catch-up of ${gate.items} item(s) (about ${gate.estimate} tokens), waiting for the person's answer`);
        continue;
      }
      // A JUDGE'S TOKEN IS OUTSIDE THE VAULT (judge-token.mjs: in the plugin's
      // own file since 2026-11-21, or in the environment): such a judge never
      // waits for a vault to be opened, unless its source.json names OTHER
      // keys to take there. A token still kept only in the vault is read from
      // it, and the judge then waits like a source.
      const needs = [].concat(liveSources().find((x) => x.name === name)?.def.needs ?? []).filter((n) => n !== "CLAUDE_CODE" || !tokenOutsideVault());
      if (needs.length) {
        vault = vaultNow();
        if (vault === "locked") {
          if (!waiting.includes(name)) waiting.push(name);
          stopped.add(name);
          continue;
        }
      }
      const j = judge(name, { sleptSince });
      // The vault locked itself since this beat asked: the judge waits with
      // the sources that need a key, and the vault's window is asked for.
      if (j.vaultLocked) {
        vault = "locked";
        vaultSeen = { state: "locked", at: Date.now() };
        if (!waiting.includes(name)) waiting.push(name);
        stopped.add(name);
        log(`${name}: waits for the vault, which locked itself`);
        continue;
      }
      log(`${name}: ${j.ok ? `judged ${j.judged}` : `error ${String(j.error ?? "").slice(0, 200)}`}${j.report ? `, ${j.report}` : ""}`);
      runs.push({ name, ok: j.ok, wrote: j.judged > 0 });
      judged.add(name);
      // A try of one item (judge.mjs now --one) is one pass, whatever is left.
      if (!j.ok || !j.judged || j.one) stopped.add(name);
      // A pass the computer's sleep interrupted is not a failure: no alert.
      if (!j.ok && !j.interrupted) alertJudge(name, j.error);
      if (Date.now() >= cycleEnd) break;
    }
    piles = yielded ? [] : ready();
  }
  // (The rhythm restarted here at the end of a judge's cycle, so that the next
  // reading would not follow it at once. The clock keeps the rhythm now: a
  // tick that fell while a judge was reading runs right after, and the next
  // one is on time.)
  if (waiting.length) askVault();
  let saved = null;
  if (yielded || eveningRunning()) {
    // The evening save rebuilds the index and saves by itself: doing both
    // here too had the two write the same files and commit at the same moment.
    // What this beat wrote is noted as owed, should the evening not save it.
    if (runs.some((r) => r.wrote)) {
      const sv = readJson(SAVE, {});
      if (!sv.due) writeJson(SAVE, { ...sv, due: true });
    }
    log("the evening save is starting: this beat stops here, and leaves the index and the save to it");
  } else if (runs.some((r) => r.wrote)) {
    // The index follows at once (the words; the vectors when a key is at hand).
    // What the sources wrote is committed on this computer, an hour at least
    // after the hub's last save (groupedSave). No push.
    const b = node("build.mjs", [], 20);
    saved = groupedSave(true);
    log(`index ${b.ok ? "rebuilt" : `NOT rebuilt: ${b.err.slice(0, 200)}`}; save: ${saved.state === "postponed" ? `postponed (next within ${Math.ceil(saved.left / 60_000)} min)` : saved.said}`);
  } else {
    // Nothing written in this beat, but a save owed since an earlier one.
    saved = groupedSave(false);
    if (saved && saved.state !== "postponed") log(`save (due since an earlier beat): ${saved.said}`);
  }
  // A beat that only waits for the vault, for the same sources as the beat
  // before, is not written again (see saidWaiting).
  const waits = waiting.join(",");
  if (runs.length || (waiting.length && waits !== saidWaiting)) logEvent({ act: "run", who: "hub", sources: runs.map((r) => r.name), wrote: runs.filter((r) => r.wrote).map((r) => r.name), waiting });
  saidWaiting = waits;
  return { due, runs, waiting, ...(gated.length ? { gated } : {}), ...(saved ? { save: saved.state } : {}), ...(yielded ? { yielded: true } : {}) };
}

function writeState(extra) {
  try {
    writeJson(STATE, { pid: process.pid, brain: ROOT.replaceAll("\\", "/"), ...extra });
  } catch {
    // the state is a comfort
  }
}

// ---------------------------------------------------------------- the program
// ONE HUB AT A TIME, AND A LOCK THAT CAN BE TRUSTED (2026-11-21). The lock was
// the number of the hub's process, and nothing else. Stopped without a word
// (routines.mjs hub off and the end of a session kill it on Windows, where no
// "exit" is then run), the hub left its lock behind; once Windows had given
// that number to another program, a system one included, every start answered
// "already runs" and stopped: no sources, no judges, and a state that said
// "running". The lock now has a PULSE: a thread of its own touches the file
// every half minute, also while a beat lasts half an hour. A lock that names
// a living process but was not touched for five minutes is watched for one
// more pulse, then taken. A lock written by a hub of before (no "pulse" in
// it) is judged as before, by its process alone: that hub does not touch it.
const PULSE_MS = 30_000;
const STALE_MS = 5 * 60_000;
const lockAge = () => {
  try {
    return Date.now() - statSync(LOCK).mtimeMs;
  } catch {
    return Infinity;
  }
};
/** Is the hub named by the lock still at work? */
function holderAlive(held) {
  if (!held?.pid || held.pid === process.pid || !alive(held.pid)) return false;
  if (held.pulse !== true) return true;
  if (lockAge() < STALE_MS) return true;
  // Not touched for a while: the number may be another program's by now, or
  // the computer has just woken up and the hub's pulse has not beaten yet.
  // One more pulse tells.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, PULSE_MS + 10_000);
  return lockAge() < STALE_MS;
}
/** Takes the hub's lock. Returns null when it is taken, or the process of the hub that holds it. */
function takeLock() {
  for (let tries = 0; tries < 3; tries++) {
    try {
      // Created, never written over: of two hubs that start together, one creates it.
      const fd = openSync(LOCK, "wx");
      writeSync(fd, `${JSON.stringify({ pid: process.pid, at: new Date().toISOString(), pulse: true })}\n`);
      closeSync(fd);
      return null;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    const held = readJson(LOCK, null);
    if (holderAlive(held)) return held.pid;
    rmSync(LOCK, { force: true });
  }
  return readJson(LOCK, null)?.pid ?? -1;
}
/**
 * The pulse: a thread that touches the lock every half minute, whatever the
 * hub itself is doing (a beat blocks it for as long as a judge reads). It also
 * notes when the computer slept, a tick far later than asked: [0] when the
 * sleep began, [1] when it ended, in milliseconds. Null when the thread could
 * not be started: the hub then runs as before, without either.
 */
function startPulse() {
  try {
    const shared = new SharedArrayBuffer(16);
    const code = `
      const { workerData } = require("node:worker_threads");
      const fs = require("node:fs");
      const slept = new Float64Array(workerData.shared);
      let last = Date.now();
      setInterval(() => {
        const now = Date.now();
        if (now - last > workerData.period * 4) { slept[0] = last; slept[1] = now; }
        last = now;
        try { fs.utimesSync(workerData.lock, new Date(now), new Date(now)); } catch {}
      }, workerData.period);
    `;
    const w = new Worker(code, { eval: true, workerData: { lock: LOCK, period: PULSE_MS, shared } });
    w.on("error", (e) => log(`the pulse stopped: ${e.message}`));
    w.unref();
    return new Float64Array(shared);
  } catch (e) {
    log(`no pulse: ${e.message}`);
    return null;
  }
}
/** The version of the plugin this file belongs to, as its plugin.json says it now; null when it cannot be read. */
const pluginVersion = () => readJson(join(PLUGIN_ROOT, ".claude-plugin", "plugin.json"), null)?.version ?? null;
/**
 * Why this hub should hand over to a newer copy of the plugin, or null: the
 * plugin's folder is gone, its version changed where it stands, or the
 * settings name another folder since this hub started (routines.mjs writes
 * "pluginRoot" when the evening save or the hub is armed again after an
 * update). A hub started from a folder the settings never named is left alone:
 * nothing changed since it started.
 */
function outdated(versionAtStart, rootSetAtStart) {
  if (!existsSync(join(PLUGIN_ROOT, "scripts", "hub.mjs"))) return "this copy of the plugin is gone";
  const version = pluginVersion();
  if (version && versionAtStart && version !== versionAtStart) return `the plugin was updated where it stands (${versionAtStart} to ${version})`;
  const set = String(userConfig().pluginRoot ?? "");
  if (set && set !== rootSetAtStart && existsSync(join(set, "scripts", "hub.mjs"))) {
    try {
      // The same folder under another spelling (a link, a letter's case) is not another copy.
      if (realpathSync.native(set) !== realpathSync.native(PLUGIN_ROOT)) return `the plugin now lives in ${set.replaceAll("\\", "/")}`;
    } catch {
      return null;
    }
  }
  return null;
}

const isMain = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/hub.mjs");
if (isMain) {
  mkdirSync(DIR, { recursive: true });
  if (ONCE) {
    console.log(JSON.stringify(beat()));
  } else {
    const other = takeLock();
    if (other) {
      console.log(JSON.stringify({ ok: false, error: `the hub already runs (process ${other})` }));
      process.exit(0);
    }
    const release = () => {
      try {
        if (readJson(LOCK, null)?.pid === process.pid) rmSync(LOCK, { force: true });
      } catch {
        // gone already
      }
    };
    process.on("exit", release);
    for (const s of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(s, () => process.exit(0));
    log(`started, process ${process.pid}, brain ${ROOT}`);
    logEvent({ act: "signal", who: "hub", what: "started" });
    const pulse = startPulse();
    /** Did the computer sleep since that moment? (the pulse saw a gap that ended after it) */
    const sleptSince = (since) => Boolean(pulse && pulse[1] > since);
    const versionAtStart = pluginVersion();
    const rootSetAtStart = String(userConfig().pluginRoot ?? "");
    let saidOutdated = false;
    let last = Date.now();
    const tick = () => {
      const now = Date.now();
      // ANOTHER HUB TOOK THE LOCK (it took this one for dead: a pulse that
      // stopped, a lock removed by hand): one of the two must go, and the lock
      // says which. A lock that is gone is taken again.
      const holder = readJson(LOCK, null);
      if (holder?.pid && holder.pid !== process.pid) {
        log(`another hub holds the lock (process ${holder.pid}): this one stops`);
        process.exit(0);
      }
      if (!holder && !existsSync(LOCK)) takeLock();
      // A NEWER COPY OF THE PLUGIN (2026-11-21). The hub kept in memory the
      // hub.mjs and judge.mjs it was started with until the session was opened
      // again, and ran the new scripts beside them; a folder moved or purged by
      // the update, and every run failed, minute after minute. Looked at
      // between two beats, never in the middle of one.
      const why = outdated(versionAtStart, rootSetAtStart);
      if (why) {
        const launcher = join(DIR, "hub-launch.mjs");
        // On macOS and Linux the system starts the hub again by itself once it
        // stops (routines.mjs: KeepAlive, Restart=always): starting one here
        // too would leave two launchers fighting over the lock. On Windows
        // nothing does: the launcher is started from here.
        const restarted = process.platform !== "win32" && Boolean(userConfig().routines?.hub);
        if (restarted || existsSync(launcher)) {
          log(`${why}: this hub hands over to the new one`);
          logEvent({ act: "signal", who: "hub", what: "restart", why });
          release();
          if (!restarted) spawn(process.execPath, [launcher], { detached: true, stdio: "ignore", windowsHide: true }).unref();
          process.exit(0);
        }
        if (!saidOutdated) log(`${why}, and there is no launcher to start the new one (routines.mjs hub on writes it): this hub goes on as it is`);
        saidOutdated = true;
      }
      // A beat far later than asked: the computer slept. Said once, and the
      // beat catches up from the clock. Counted from the END of the beat
      // before (see "finally"): a beat can last minutes (a judge at work), and
      // counted from its start each long beat was taken for a sleep.
      if (now - last > 3 * BEAT_MS) {
        log(`awake after ${Math.round((now - last) / 60_000)} min`);
        logEvent({ act: "signal", who: "hub", what: "wake", asleepMin: Math.round((now - last) / 60_000) });
      }
      try {
        const r = beat({ sleptSince });
        writeState({ lastBeat: new Date().toISOString(), last: r });
      } catch (e) {
        log(`beat failed: ${e.message}`);
      } finally {
        last = Date.now();
      }
    };
    // (A flag "busy" guarded this function against running twice at once: a
    // beat is synchronous from end to end, and a timer cannot fire during it.)
    tick();
    setInterval(tick, BEAT_MS);
  }
}
