// activity.mjs: what a tool did for the brain, read in the sources and in the
// brain's journal: the panel that opens when a tool is clicked. Nothing is
// measured on where the notes came from (what the former view did): what
// counts is what the tool does NOW.

import { execFile } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { language, noteFile, titles as noteTitles } from "./brain.mjs";
import { rhythm, t } from "./i18n.mjs";
import { eventsSince, hubDir, journalStamp, readJson, readJsonOnce } from "./journal.mjs";
import { judgeState } from "./judges.mjs";
import { restAfter } from "../scripts/judge-errors.mjs";
import { nextTick } from "../scripts/pure.mjs";
import { connectedTools } from "./tools.mjs";

/** @typedef {import("./contract.d.ts").ToolDetail} ToolDetail */
/** @typedef {import("./contract.d.ts").ErrorResponse} ErrorResponse */
/** @typedef {import("./contract.d.ts").NextRun} NextRun */
/** @typedef {import("./contract.d.ts").Run} Run */
/** @typedef {import("./contract.d.ts").ChangeResponse} ChangeResponse */
/** @typedef {import("./contract.d.ts").WrittenNote} WrittenNote */
/** @typedef {import("./contract.d.ts").UndoCode} UndoCode */
/** @typedef {import("./journal.mjs").JournalEvent} JournalEvent */
/** @typedef {Omit<NextRun, "source">} Candidate one possible next run of a source */

// THE SETTINGS A JUDGE REALLY RUNS WITH ARE THE PLUGIN'S (2026-11-21). The
// view had its own defaults (a batch of 20, a gathering of fifteen minutes)
// where the plugin's are 15 and none at all: the ring announced batches of 20
// and a card said "15m after" for a judge that reads in the same tick. The
// server hands over the plugin's own judgeSettings once its engine is loaded
// (useJudgeSettings); until then, the plugin's defaults as they are today.
/** @type {(def: Record<string, any>) => { batch: number, hours: number[], gather: string }} */
let judgeSettings = (def) => ({
  batch: Number.isInteger(def?.batch) && def.batch > 0 ? def.batch : 15,
  hours: Array.isArray(def?.hours) && def.hours.length === 2 && def.hours.every((h) => Number.isInteger(h)) && def.hours[0] < def.hours[1] ? def.hours : [7, 23],
  gather: /^\d+\s*[mh]$/.test(String(def?.gather ?? "")) ? String(def.gather) : "0",
});
/** @param {(def: Record<string, any>) => { batch: number, hours: number[], gather: string }} fn the plugin's judgeSettings (scripts/judge.mjs) */
export function useJudgeSettings(fn) {
  judgeSettings = fn;
}

/** How long a run may last before the card stops saying it is going on (a judge is cut at twenty-five minutes by default). */
const RUNNING_MS = 45 * 60_000;

/**
 * The detail of a tool: its sources, their rhythm, their last run, the week's activity.
 * @param {string} brain
 * @param {string} id the tool
 * @returns {ToolDetail | ErrorResponse}
 */
export function toolDetail(brain, id) {
  const say = t(language(brain));
  const { tools, bySource } = connectedTools(brain);
  const o = tools.find((x) => x.id === id);
  if (!o) return { error: say.toolUnknown };
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const events = eventsSince(brain, weekAgo);
  const sources = [...bySource].filter(([, ids]) => ids.includes(id)).map(([n]) => n);
  const queue = readJsonOnce(join(hubDir(), "queue.json"), {}) ?? {};
  const detail = sources.map((n) => {
    const d = readJson(join(brain, "sources", n, "source.json"), {}) ?? {};
    const state = readJson(join(brain, "sources", n, "state.json"), {}) ?? {};
    const after = Array.isArray(d.after) ? d.after : [];
    const folders = Array.isArray(d.folders) ? d.folders : Array.isArray(d.files) ? d.files : [];
    // (A judge gathers for as long as the plugin says: none at all by default, it reads in the same tick.)
    const gather = d.live ? judgeSettings(d).gather : "0";
    const when = [
      d.live ? (String(gather) === "0" ? say.liveAtOnce : say.liveAfter(String(gather).replace(/^(\d+)\s*([mh])$/, (_, count, unit) => `${count} ${unit === "h" ? "h" : "min"}`))) : rhythm(say, d.every) ?? d.every ?? "",
      folders.length ? say.foldersAfterCalm : "",
      after.length ? say.after(after.map((x) => String(x).replace(/^(skill|source):/, ""))) : "",
    ].filter(Boolean);
    const itsRuns = events.filter((e) => e.act === "run" && e.who === `source:${n}`);
    const last = itsRuns.at(-1) ?? null;
    // A RUN THAT IS GOING ON IS NOT THE LAST RUN (2026-11-21). The card said
    // "Last run: today at 12:43, 5 items judged" while the run of 12:43 was
    // still going on: the date was the one of the run that had just started,
    // the count the one of the run before. A run is going on when the journal
    // says it started and has not said it ended; the last run is the last one
    // that ended.
    let runningSince = null;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.who !== `source:${n}`) continue;
      if (e.act === "run") break;
      if (e.act === "signal" && e.what === "running") {
        if (Date.now() - Date.parse(e.at) < RUNNING_MS) runningSince = String(e.at);
        break;
      }
    }
    return {
      name: n,
      description: d.description ?? "",
      when,
      key: Array.isArray(d.needs) && d.needs.length ? say.vaultKey(d.needs) : "",
      lastRun: state.lastRun ?? null,
      lastEnd: last ? String(last.at) : null,
      runningSince,
      lastSuccess: state.lastSuccess ?? null,
      lastError: state.lastError ?? null,
      outcome: last ? { created: last.created ?? 0, updated: last.updated ?? 0, zones: last.zones ?? 0, entries: last.entries ?? 0, judged: last.judged ?? 0, report: last.report ?? "" } : null,
      runs: itsRuns.length,
      // It needs a key and the vault is closed: it waits, it is not broken.
      // (Never a judge: its access to Claude does not come from the vault.)
      waitsForVault: Boolean(queue[n]) && !(d.kind === "claude" && d.live),
    };
  });
  // What the tool wrote this week: through its sources, and for Claude Code
  // through the captures and the facts of the judgement.
  const who = new Set(sources.flatMap((n) => [`source:${n}`, `ai:${n}`]));
  if (id === "claude-code") ["ai", "person"].forEach((x) => who.add(x));
  const written = events.filter((e) => e.act === "write" && who.has(e.who) && e.what !== "undone");
  /** @type {Record<string, number>} */
  const byKind = {};
  for (const e of written) byKind[e.what] = (byKind[e.what] ?? 0) + 1;
  const notes = [...new Set(written.map((e) => e.note).filter(Boolean))];
  // A tool read on demand, and what the conversations read from the brain.
  const reads = events.filter((e) => e.act === "read");
  // The addresses a tool serves (tools.mjs gives them: pennylane://,
  // neon://<project>/ for one database of a scheme with projects, the watched
  // folders).
  const prefixes = o.prefixes ?? [`${id}://`];
  const fetched = reads.filter((e) => e.tool === "brain_fetch" && (Array.isArray(e.notes) ? e.notes : []).some((a) => prefixes.some((p) => String(a).startsWith(p)))).length;
  const readByClaude = id === "claude-code" ? reads.length : 0;
  return { id, name: o.name, side: o.side, level: o.level, role: o.role, access: o.access, sources: detail, week: { writes: written.length, byKind, notes }, fetched, readByClaude };
}

// ------------------------------------------------------------ the next run
// THE RING OF EACH SOURCE (2026-11-08): when each source will run, and since
// when it has been waiting, for a ring that fills up around its tool. Read in
// what the hub keeps on this computer: its flags (a folder that moved waits
// for its calm), its queue (a key waits for the vault), the judge's piles,
// and the rhythm of each source.
const MIN = 60_000;
/** @param {unknown} x "15m", "2h" or "hour" @returns {number | null} milliseconds */
const duration = (x) => {
  const m = /^(\d+)\s*([mh])$/.exec(String(x ?? ""));
  if (m) return Number(m[1]) * (m[2] === "h" ? 60 : 1) * MIN;
  return x === "hour" ? 60 * MIN : null;
};
/**
 * The next time the clock shows `hhmm`, on a given day of the week when one is given.
 * @param {string} hhmm
 * @param {number | null} [weekday] 0 is Sunday
 * @returns {number} milliseconds
 */
const nextTime = (hhmm, weekday = null) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  if (weekday !== null) {
    d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
    if (d <= new Date()) d.setDate(d.getDate() + 7);
  } else if (d <= new Date()) d.setDate(d.getDate() + 1);
  return d.getTime();
};

// EACH FILE READ ONCE PER VERSION OF IT (2026-11-18). This is asked every
// thirty seconds by every open page, and read about a hundred and forty small
// files each time (a declaration, a state, the hub's settings, a flag, for
// every source): one second on a computer whose antivirus looks at every file
// opened, during which the server answered nothing else. A file whose date
// and size did not move is not opened again (readJsonOnce); what is read is
// only looked at here, never changed.
/**
 * The possible next runs of a source (`due` null: it waits for something else).
 * @param {string} brain
 * @param {string} n the source
 * @returns {Candidate[] | null} null for a source that is not there, or disabled
 */
/** The shortest rhythm of this brain's sources, in milliseconds: its tick (null when no source runs during the day). */
function brainTick(brain) {
  let shortest = null;
  let names = [];
  try {
    names = readdirSync(join(brain, "sources"));
  } catch {
    return null;
  }
  for (const n of names) {
    const d = readJsonOnce(join(brain, "sources", n, "source.json"), null);
    if (!d || d.enabled === false || d.paused === true) continue;
    const ms = duration(d.every);
    if (ms && (shortest === null || ms < shortest)) shortest = ms;
  }
  return shortest;
}

// THE TOTAL OF A CATCH-UP IS THE CATCH-UP'S (2026-11-21). The ring and the
// card counted as "already read" every item the judge had seen since its very
// first day (the keys of seen.json): a catch-up of 199 items, 50 of them read,
// showed "149 left out of 385" and 61 % where it stood at 25 %. What counts is
// the pile as it was when the catch-up began, plus what arrived since. It is
// kept here for as long as the catch-up lasts; a server that starts in the
// middle of one finds its beginning in the journal (the person's answer to
// the held judge says how many items were agreed, the runs since how many
// were judged).
/** @type {Map<string, { total: number, last: number }>} `<brain>|<judge>` -> the size of its catch-up, and of its pile when last looked at */
const catchUps = new Map();
/**
 * How far a judge is in its catch-up.
 * @param {string} brain
 * @param {string} n the judge
 * @param {number} left what its pile holds now
 * @returns {{ done: number, total: number }}
 */
function catchUpProgress(brain, n, left) {
  const key = `${brain}|${n}`;
  let c = catchUps.get(key);
  if (!c) {
    let done = 0;
    const events = eventsSince(brain, "");
    let answer = null;
    for (let i = events.length - 1; i >= 0 && !answer; i--) if (events[i].act === "signal" && events[i].who === `source:${n}` && events[i].what === "catch-up-answer") answer = events[i];
    const agreed = Number(answer?.kept) || 0;
    if (answer && agreed > 0) {
      for (const e of events) if (e.act === "run" && e.who === `source:${n}` && String(e.at) > String(answer.at)) done += Number(e.judged) || 0;
      // (Everything agreed was read since: the pile of now is another catch-up.)
      if (done >= agreed) done = 0;
    }
    c = { total: done + left, last: left };
  } else if (left > c.last) c.total += left - c.last; // what arrived meanwhile is to be read too
  c.last = left;
  catchUps.set(key, c);
  return { done: Math.max(0, c.total - left), total: c.total };
}

/**
 * The possible next runs of one source, or null for a source that is off.
 * @param {string} brain
 * @param {string} n
 * @returns {Candidate[] | null}
 */
function candidatesOf(brain, n) {
  const say = t(language(brain));
  const d = readJsonOnce(join(brain, "sources", n, "source.json"), null);
  if (!d || typeof d !== "object" || d.enabled === false) return null;
  const state = readJsonOnce(join(brain, "sources", n, "state.json"), {}) ?? {};
  const last = Date.parse(state.lastRun ?? "") || null;
  const now = Date.now();
  const config = readJsonOnce(join(hubDir(), "config.json"), {}) ?? {};
  /** @type {Candidate[]} */
  const candidates = [];
  // A key waits for the vault: the source runs when it opens. (Never a judge:
  // its access to Claude does not come from the vault; when it lacks it, its
  // card says so.)
  const queue = readJsonOnce(join(hubDir(), "queue.json"), {}) ?? {};
  if (queue[n] && !(d.kind === "claude" && d.live)) return [{ start: Date.parse(queue[n].at) || now, due: null, vault: /** @type {const} */ (true), reason: say.waitsForVault }];
  // PAUSED (the Settings): nothing is awaited, unless the person has just
  // asked for "now". The queue of a paused judge keeps growing.
  if (d.paused === true && readJsonOnce(join(hubDir(), "due", n), null)?.why !== "now" && !existsSync(join(hubDir(), "judge", `${n}.now`))) {
    const waiting = d.live ? (readJsonOnce(join(hubDir(), "judge", `${n}.json`), { items: [] })?.items?.length ?? 0) : 0;
    return [{ start: now, due: null, paused: true, reason: waiting ? say.pausedWaiting(waiting) : say.paused }];
  }
  // A JUDGE HELD OR CAPPED (2026-11-17). Held: its pile grew too big to be
  // read without asking, it waits for the person's answer. Capped: it spent
  // its tokens of the day, it runs again tomorrow.
  const judge = d.live ? judgeState(brain, n, d) : null;
  if (judge?.held) return [{ start: Date.parse(judge.held.at) || now, due: null, held: true, reason: say.heldForAnswer(judge.held.items) }];
  // A flag: a folder that moved (once calm), a skill, the source before.
  const flag = readJsonOnce(join(hubDir(), "due", n), null);
  if (flag) {
    if (/^file/.test(flag.why ?? "")) {
      const calm = (Date.parse(flag.at) || now) + (duration(d.calm ?? "15m") ?? 15 * MIN);
      const ceiling = (Date.parse(flag.first ?? flag.at) || now) + (duration(d.calmMax ?? "2h") ?? 120 * MIN);
      candidates.push({ start: Date.parse(flag.first ?? flag.at) || now, due: Math.min(calm, ceiling), reason: say.fileMoved, addresses: flag.addresses ?? null });
    } else candidates.push({ start: Date.parse(flag.at) || now, due: now + MIN, reason: flag.why === "now" ? say.askedNow : say.nextBeat });
  }
  // The judge's pile.
  if (d.live) {
    const pile = readJsonOnce(join(hubDir(), "judge", `${n}.json`), { items: [] }) ?? {};
    const set = judgeSettings(d);
    // (A pile that is no longer a catch-up: its count is forgotten.)
    if (!Array.isArray(pile.items) || pile.items.length <= set.batch * 2) catchUps.delete(`${brain}|${n}`);
    if (Array.isArray(pile.items) && pile.items.length) {
      const oldest = Math.min(...pile.items.map((i) => Date.parse(i?.at) || now));
      // The gathering ends at a tick of the clock, as the hub counts it (pure.mjs).
      const gather = String(set.gather) === "0" ? 0 : duration(set.gather) ?? 0;
      let due = existsSync(join(hubDir(), "judge", `${n}.now`)) ? now + MIN : gather ? nextTick(oldest, gather) : oldest;
      // A run that failed: the judge waits an hour before trying again.
      const rest = restAfter(state.lastError);
      const resting = Boolean(state.lastError && last && now - last < rest);
      if (resting && last) due = Math.max(due, last + rest);
      const [from, to] = set.hours;
      const h = new Date(due).getHours();
      if (h < from || h >= to) { const x = new Date(due); if (h >= to) x.setDate(x.getDate() + 1); x.setHours(from, 0, 0, 0); due = x.getTime(); }
      // CATCHING UP (2026-11-09): more than two runs of stock, the judge goes
      // on without a pause; the ring then shows the progress (already read
      // out of the total), not a time that would always be past.
      const batch = set.batch;
      if (judge?.capped) {
        // Tomorrow, when its working hours begin.
        const x = new Date(now);
        x.setDate(x.getDate() + 1);
        x.setHours(from, 0, 0, 0);
        candidates.push({ start: last ?? now, due: x.getTime(), reason: say.cappedToday(pile.items.length) });
      } else if (!resting && pile.items.length > batch * 2) {
        const progress = catchUpProgress(brain, n, pile.items.length);
        candidates.push({ start: oldest, due: null, catchUp: progress, reason: say.catchingUp(pile.items.length, progress.total, batch) });
      } else candidates.push({ start: resting && last ? last : oldest, due, reason: resting ? say.pausedAfterFailure(pile.items.length) : say.inJudgePile(pile.items.length) });
    }
  }
  // The rhythm.
  const step = duration(d.every);
  // A rhythm is a tick of the clock: the next one after its last run, or the
  // coming minute when that tick is already past (it runs at the next beat).
  // THE RING RUNS FROM ONE TICK TO THE NEXT (2026-11-21). It ran from the
  // source's own last run: two sources of the same rhythm, one run at the
  // tick and the other seven minutes later behind a judge, showed two
  // different arcs, and a source kept waiting overnight a ring nearly full.
  // The ring is the clock's: the same arc for every source of a rhythm.
  if (step) {
    const tick = nextTick(last ?? now, step);
    candidates.push({ start: tick > now ? tick - step : (last ?? now - step), due: Math.max(tick, now + MIN), reason: rhythm(say, d.every) ?? d.every ?? "" });
  }
  // A JUDGE HAS NO RHYTHM OF ITS OWN (2026-11-20): it reads when its sources
  // bring something, at a tick of the clock. With nothing on its pile it was
  // shown waiting for "the Sunday review", which is where a source read
  // during the review waits, not a judge.
  else if (d.live === true) {
    const tick = brainTick(brain);
    if (tick) candidates.push({ start: nextTick(now, tick) - tick, due: nextTick(now, tick), reason: say.atNextTick });
  } else if (d.every === "day") {
    // (The same for the evening and for the week: the ring is the day's, the week's.)
    const due = nextTime(config.routines?.save?.time ?? "19:30");
    candidates.push({ start: due - 24 * 60 * MIN, due, reason: say.atEveningSave });
  } else if (d.every === "week") {
    const due = nextTime("18:00", 0);
    candidates.push({ start: due - 7 * 24 * 60 * MIN, due, reason: say.atSundayReview });
  }
  // (A candidate that waits for something else has no time: it sorts first,
  // as a null does in a subtraction.)
  candidates.sort((x, y) => (x.due ?? 0) - (y.due ?? 0));
  return candidates;
}

/**
 * For each tool, the nearest of the next runs of its sources.
 * @param {string} brain
 * @returns {Record<string, NextRun>}
 */
export function nextRuns(brain) {
  const { bySource, tools } = connectedTools(brain);
  /** @type {Record<string, NextRun>} */
  const out = {};
  /** @type {Map<string, string[]>} tool -> its sources that wait for the vault */
  const waitingForVault = new Map();
  for (const [n, ids] of bySource) {
    const all = candidatesOf(brain, n);
    if (!all?.length) continue;
    if (all.some((c) => c.vault)) for (const id of ids) waitingForVault.set(id, [...(waitingForVault.get(id) ?? []), n]);
    for (const id of ids) {
      // A folder only takes the "once calm" ring if it moved itself.
      const addresses = tools.find((o) => o.id === id)?.addresses;
      const own = all.filter((c) => !c.addresses || !addresses || c.addresses.some((a) => addresses.includes(a)));
      // A time already past (a pile catching up, which leaves at every beat)
      // gives way to the next one to come: otherwise the ring stays full all
      // the time.
      const p = own.find((c) => c.catchUp) ?? own.find((c) => c.due === null || c.due > Date.now() + 30_000) ?? own[0];
      if (!p) continue;
      const already = out[id];
      // Catching up wins: it is what the tool is doing right now. So does a
      // judge that waits for the person: it is what the person can act on.
      /** @param {Candidate} c */
      const first = (c) => Boolean(c.catchUp || c.held);
      if (!already || (first(p) && !first(already)) || (!first(already) && (p.due ?? Infinity) < (already.due ?? Infinity))) out[id] = { ...p, source: n };
    }
  }
  // A SMALL KEY BESIDE THE TOOL (2026-11-21): one of its sources waits for the
  // vault to be opened. Said on the tool whichever of its sources gives the
  // ring its time: it is a wait, not a failure, and the person can end it.
  for (const [id, names] of waitingForVault) if (out[id]) out[id] = { ...out[id], vault: true, vaultSources: names };
  return out;
}

// ------------------------------------------------------------ the history
/**
 * The last runs of a tool's sources, and what each one wrote (thirty days).
 * @param {string} brain
 * @param {string} id the tool
 * @param {number} [max]
 * @returns {Run[]}
 */
export function history(brain, id, max = 25) {
  const { bySource } = connectedTools(brain);
  const sources = new Set([...bySource].filter(([, ids]) => ids.includes(id)).map(([n]) => n));
  if (!sources.size) return [];
  // KEPT WHILE NOTHING MOVED (2026-11-21, audit 14): the same thirty days were
  // gone through again at each opening of a card. The answer is kept for as
  // long as the journals did not grow, the index's titles are the same, and
  // the tool has the same sources.
  const titles = noteTitles(brain);
  const key = `${brain}|${id}|${max}`;
  const stamp = `${journalStamp(brain)}|${[...sources].join(",")}`;
  const kept = histories.get(key);
  if (kept && kept.stamp === stamp && kept.titles === titles) return kept.runs;
  const runs = readHistory(brain, sources, titles, max);
  histories.set(key, { stamp, titles, runs });
  return runs;
}
/** @type {Map<string, { stamp: string, titles: Map<string, string>, runs: Run[] }>} */
const histories = new Map();

/**
 * @param {string} brain
 * @param {Set<string>} sources the sources of the tool
 * @param {Map<string, string>} titles
 * @param {number} max
 * @returns {Run[]}
 */
function readHistory(brain, sources, titles, max) {
  const events = eventsSince(brain, new Date(Date.now() - 30 * 86400_000).toISOString());
  // What each write can still become (2026-11-16): taken back or not, and
  // when it was. An undo comes after its write: the same thirty days hold both.
  const undone = undoneWrites(events);
  /** @param {JournalEvent} e a write @returns {WrittenNote} */
  const written = (e) => ({
    note: e.note,
    what: e.what,
    at: e.at,
    ...(e.id ? { id: String(e.id) } : {}),
    ...(titles.has(e.note) ? { title: titles.get(e.note) } : {}),
    undoable: canUndo(e, undone),
    undone: undone.get(e.id) ?? null,
  });
  /** @param {unknown} who */
  const nameOf = (who) => String(who ?? "").replace(/^(source|ai):/, "");
  /** @typedef {Omit<Run, "writtenCount"> & Record<string, any>} OpenRun */
  /** @type {Map<string, OpenRun>} */
  const open = new Map();
  /** @type {OpenRun[]} */
  const runs = [];
  for (const e of events) {
    const n = nameOf(e.who);
    if (!sources.has(n) || !/^(source|ai):/.test(String(e.who ?? ""))) continue;
    if (e.act === "signal" && e.what === "running") {
      // A run still open when the next one begins: it was interrupted.
      const before = open.get(n);
      if (before) before.interrupted = true;
      /** @type {OpenRun} */
      const run = { source: n, start: e.at, why: e.why ?? "", items: e.items ?? null, written: [] };
      open.set(n, run);
      runs.push(run);
    } else if (e.act === "run") {
      let run = open.get(n);
      if (!run) {
        run = { source: n, start: e.at, written: [] };
        runs.push(run);
      }
      run.end = e.at;
      run.ok = e.ok !== false;
      for (const k of ["created", "updated", "zones", "entries", "contacts", "judged", "minutes"]) if (e[k] !== undefined) run[k] = e[k];
      open.delete(n);
    } else if (e.act === "write" && e.what !== "undone") {
      const run = open.get(n) ?? [...runs].reverse().find((x) => x.source === n);
      if (run) run.written.push(written(e));
    }
  }
  return runs.reverse().slice(0, max).map((run) => ({ ...run, written: run.written.slice(0, 12), writtenCount: run.written.length }));
}

// ------------------------------------------------------------ the change
// WHAT CHANGED IN A NOTE (2026-11-09): the history says which note a source
// wrote; the change itself is in git, since the brain is saved right after
// each write of a source. The first commit that touches the note after the
// write carries it; not saved yet, the difference with the last commit. Read
// only.
/** @param {string} brain @param {string} slug @returns {string | null} the note's file */
function notePath(brain, slug) {
  // THE INDEX KNOWS WHERE A NOTE IS (2026-11-21, audit 15): the whole vault
  // was walked through at each change shown and at each undo. The files are
  // only searched for a note the index does not know yet, or that moved since.
  const rel = noteFile(brain, slug);
  if (rel) {
    const abs = resolve(brain, rel);
    if (abs.startsWith(resolve(brain) + sep) && existsSync(abs)) return abs;
  }
  /** @param {string} folder @returns {string | null} */
  const search = (folder) => {
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      const p = join(folder, e.name);
      if (e.isDirectory()) { if (e.name !== "danger-zone") { const r = search(p); if (r) return r; } }
      else if (e.name === `${slug}.md`) return p;
    }
    return null;
  };
  // (A brand new brain has no vault yet: no note, not an error.)
  const vault = join(brain, "vault");
  return existsSync(vault) ? search(vault) : null;
}
/**
 * git, in the brain's folder, without holding the server while it runs (three
 * or four of them for one change shown: until 2026-11-21 every open page
 * waited for them). Without git, or outside a repository: `stdout` is empty
 * (never `null`), and `ok` says so.
 * @param {string} brain
 * @param {...string} args
 * @returns {Promise<{ ok: boolean, stdout: string }>}
 */
function gitIn(brain, ...args) {
  return new Promise((done) => {
    try {
      execFile("git", args, { cwd: brain, encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 30_000 }, (error, stdout) => done({ ok: !error, stdout: String(stdout ?? "") }));
    } catch {
      done({ ok: false, stdout: "" });
    }
  });
}
/**
 * What one write changed in a note.
 * @param {string} brain
 * @param {string} slug the note
 * @param {string} at when it was written (an ISO date)
 * @returns {Promise<ChangeResponse>}
 */
export async function change(brain, slug, at) {
  const say = t(language(brain));
  if (!/^[a-z0-9-]+$/.test(slug)) return { error: say.noteUnknown };
  const abs = notePath(brain, slug);
  if (!abs) return { error: say.noteGone };
  // (No note is kept from the view any more, 2026-11-21: the brain is there to
  // be read by the AI, and a "private" note no longer hides its changes.)
  const rel = abs.slice(brain.length + 1).replaceAll("\\", "/");
  /** @param {...string} args */
  const git = (...args) => gitIn(brain, ...args);
  if (!(await git("rev-parse", "--is-inside-work-tree")).ok) return { error: say.noHistory };
  const since = Number.isFinite(Date.parse(at)) ? new Date(Date.parse(at) - 1000).toISOString() : null;
  const commits = since ? (await git("log", "--reverse", "--format=%H|%cI|%s", `--since=${since}`, "--", rel)).stdout.trim().split("\n").filter(Boolean) : [];
  if (commits.length) {
    const [hash, when, subject] = commits[0].split("|");
    const diff = (await git("diff", "--no-color", "-U2", `${hash}^`, hash, "--", rel)).stdout;
    return { slug, rel, commit: hash.slice(0, 8), when, subject, diff: diff.slice(0, 40_000) };
  }
  const diff = (await git("diff", "--no-color", "-U2", "HEAD", "--", rel)).stdout;
  return { slug, rel, commit: null, when: null, subject: say.notSavedYet, diff: diff.slice(0, 40_000) };
}

// ------------------------------------------------------------ taking back a write
// UNDO (2026-11-16): the history window takes back one write of the machine,
// named by the id of its event in the journal. The plugin does it
// (scripts/undo.mjs); what is here says which writes it may be asked for, so
// that the page only offers those, and the server refuses the others before
// anything is started.

// The kinds of write the plugin's undo.mjs knows how to take back (0.6.7): a
// fact leaves its note, a created note is removed, a change is reversed.
const UNDOABLE_KINDS = new Set(["fact", "created", "updated", "zone", "rewritten", "condensed"]);

/**
 * The writes already taken back: the id of each, and when.
 * @param {JournalEvent[]} events
 * @returns {Map<string, string>}
 */
const undoneWrites = (events) => new Map(events.filter((e) => e.act === "write" && e.what === "undone" && e.undoes).map((e) => [String(e.undoes), String(e.at)]));

/**
 * Whether the journal lets a write be taken back: the machine's (an edit by
 * hand is the person's own), of a kind the plugin undoes, not taken back yet.
 * @param {JournalEvent} e
 * @param {Map<string, string>} undone
 * @returns {boolean}
 */
const canUndo = (e, undone) => Boolean(e.id) && e.act === "write" && e.who !== "hand" && UNDOABLE_KINDS.has(e.what) && !undone.has(e.id);

/**
 * The write an undo is asked for, or why it is refused before anything is
 * started. The refusals are worded as the plugin words its own (English, for
 * the log and for a page that does not know the code).
 *
 * The journal kept in memory goes back forty days (the history shows thirty):
 * an older write is unknown here.
 * @param {string} brain
 * @param {string} id the id of the write's event
 * @returns {Promise<{ ok: true, event: JournalEvent } | { ok: false, code: UndoCode, error: string }>}
 */
export async function undoableWrite(brain, id) {
  const events = eventsSince(brain, "");
  // (The id becomes an argument of the plugin's script: only one a real event carries.)
  const e = /^[a-z0-9]{4,64}$/i.test(id) ? events.find((x) => x.act === "write" && x.id === id) : undefined;
  if (!e) return { ok: false, code: "unknown", error: "no such write in the brain's journal" };
  if (e.who === "hand") return { ok: false, code: "by-hand", error: "an edit by hand is the person's own: it is not undone here" };
  if (!UNDOABLE_KINDS.has(e.what)) return { ok: false, code: "not-undoable", error: `a write "${String(e.what).slice(0, 40)}" cannot be undone here` };
  if (undoneWrites(events).has(id)) return { ok: false, code: "already-undone", error: "already undone" };
  // A NOTE IS ONLY REMOVED ONCE GIT HOLDS IT AS IT IS. Undoing a creation
  // deletes the file, and the person is told it stays in the history of
  // saves: true for a capture (committed at once), not yet for a note a source
  // created since the hub's last save (one an hour at most), nor for what was
  // added to the note since. The plugin refuses an unsaved change the same way.
  if (e.what === "created") {
    const abs = notePath(brain, String(e.note));
    if (abs) {
      const rel = abs.slice(brain.length + 1).replaceAll("\\", "/");
      const saved = (await gitIn(brain, "ls-files", "--error-unmatch", "--", rel)).ok && (await gitIn(brain, "status", "--porcelain", "--", rel)).stdout.trim() === "";
      if (!saved) return { ok: false, code: "not-saved", error: "this note is not saved yet: undo it after the next save" };
    }
  }
  return { ok: true, event: e };
}
