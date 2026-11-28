// journal.mjs - The work journal, shared by the person's computers.
//
// The Stop hook (hook-journal.mjs) notes, on each computer, in which project
// the person works with Claude: one line per session and per six hours, in
// ~/.hypervibe-brain/journal.jsonl, outside the brain (it is written at every
// answer, the brain's folder would never be at rest).
//
// Each evening, the save folds this computer's new lines into the brain, in
// journal/<computer>-<YYYY-MM>.jsonl, with the title Claude gave each session:
// files written by one computer alone, so two computers never conflict, and
// the synchronisation brings the other computer's work to the weekly review.
//
// ONE FILE A MONTH, AND NOTHING THAT SAYS NOTHING (2026-11-18). The journal
// was one file per computer, for ever: 4.2 MB after five weeks on a real
// brain, written again in git at every save and read whole by every question
// put to it. Half of it said that a source had run and found nothing. So:
//   - a file per computer AND per month: only this month's file still
//     changes, and a question about the last week opens one or two files;
//   - a "quiet" line (a source that ran and changed nothing, a judge that
//     starts) never joins the brain: it stays in this computer's live file,
//     read from there for thirty days, then leaves.
// The file of before (journal/<computer>.jsonl) is cut into months by the
// computer that wrote it, at its next save; another computer's is read as it is.

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, fstatSync, linkSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, closeSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, ROOT, bindReadEvents, computerName, readJsonFile, withFileLock, writeFileAtomic } from "./lib.mjs";

export const LOCAL_JOURNAL = () => join(HOME, ".hypervibe-brain", "journal.jsonl");
const DIR = () => join(ROOT, "journal");

const lines = (file) => {
  const out = [];
  if (!existsSync(file)) return out;
  for (const l of readFileSync(file, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try {
      out.push(JSON.parse(l));
    } catch {
      // an unreadable line is skipped
    }
  }
  return out;
};

const MONTHLY = /^(.+)-(\d{4}-\d{2})\.jsonl$/;
const monthOf = (e) => {
  const m = String(e.at ?? e.t ?? "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : new Date().toISOString().slice(0, 7);
};

/**
 * The brain's journal files, oldest month first. `month` is "" for a file of
 * before the months, which holds everything its computer wrote until then.
 * `since` (a date) leaves out the months that ended before it.
 * @param {{ since?: string, computer?: string }} [o]
 * @returns {{ file: string, rel: string, computer: string, month: string }[]}
 */
export function journalFiles({ since = "", computer } = {}) {
  if (!existsSync(DIR())) return [];
  const from = String(since).slice(0, 7);
  return readdirSync(DIR())
    .filter((n) => n.endsWith(".jsonl"))
    .map((n) => {
      const m = MONTHLY.exec(n);
      return { file: join(DIR(), n), rel: `journal/${n}`, computer: m ? m[1] : n.slice(0, -6), month: m ? m[2] : "" };
    })
    .filter((f) => (!computer || f.computer === computer) && (!f.month || !from || f.month >= from))
    .sort((a, b) => a.month.localeCompare(b.month) || a.rel.localeCompare(b.rel));
}

/**
 * A line that says nothing happened: it stays on this computer and never
 * joins the brain. A source or a step that ran well and changed nothing, a
 * beat of the hub that wrote nothing, and the "running" signal that only
 * animates the live view. A failure, a judge's run (its cost is part of the
 * story), a save's own line, and anything that wrote, are never quiet.
 */
export const quiet = (e) => {
  if (e.act === "signal") return e.what === "running";
  if (e.act !== "run" || e.ok === false || e.error) return false;
  const who = String(e.who ?? "");
  if (who === "hub") return !e.wrote?.length && !e.waiting?.length;
  if (!who.startsWith("source:") || "judged" in e || "tokens" in e) return false;
  return e.step === true || !["created", "updated", "zones", "entries", "contacts", "refused"].some((k) => Number(e[k]) > 0);
};

/** The brain's files the folds of this run wrote or removed (from the brain's folder): the save commits them. */
const touched = new Set();
export const foldedPaths = () => [...touched];

/** Adds lines to this computer's journal, each in the file of its month. */
function addToMonths(rows) {
  if (!rows.length) return;
  mkdirSync(DIR(), { recursive: true });
  const byMonth = new Map();
  for (const e of rows) byMonth.set(monthOf(e), [...(byMonth.get(monthOf(e)) ?? []), e]);
  for (const [month, list] of byMonth) {
    const name = `${computerName()}-${month}.jsonl`;
    appendFileSync(join(DIR(), name), list.map((e) => `${JSON.stringify(e)}\n`).join(""), "utf8");
    touched.add(`journal/${name}`);
  }
}

/**
 * The file of before the months, cut into months by the computer that wrote
 * it. A line already in its month is not added twice (a cut interrupted, an
 * old file that a synchronisation brought back), and the quiet lines leave.
 */
function cutIntoMonths() {
  const name = `${computerName()}.jsonl`;
  const old = join(DIR(), name);
  if (!existsSync(old)) return;
  const rows = lines(old).filter((e) => !quiet(e));
  const there = new Set();
  for (const month of new Set(rows.map(monthOf))) for (const e of lines(join(DIR(), `${computerName()}-${month}.jsonl`))) there.add(JSON.stringify(e));
  addToMonths(rows.filter((e) => !there.has(JSON.stringify(e))));
  rmSync(old, { force: true });
  touched.add(`journal/${name}`);
}

/**
 * The title Claude gave a session, read from the head of its transcript
 * (the first lines carry it). Only the title: the conversation itself is
 * never read here.
 */
export function sessionTitle(transcript) {
  if (!transcript || !existsSync(transcript)) return null;
  let head = "";
  try {
    const fd = openSync(transcript, "r");
    const buf = Buffer.alloc(256 * 1024);
    const n = readSync(fd, buf, 0, buf.length, 0);
    closeSync(fd);
    head = buf.subarray(0, n).toString("utf8");
  } catch {
    return null;
  }
  let title = null;
  for (const l of head.split("\n").slice(0, 40)) {
    try {
      const o = JSON.parse(l);
      if (o.aiTitle) title = o.aiTitle;
      else if (o.customTitle && !title) title = o.customTitle;
    } catch {
      // a line cut by the buffer
    }
  }
  return title ? String(title).slice(0, 200) : null;
}

/** Folds this computer's new journal lines into the brain. Returns how many. */
export function foldJournal() {
  // One fold at a time on this computer (see foldEvents): two saves at the same
  // moment read the same last session and folded the same lines twice.
  return withFileLock(FOLD_LOCK(), foldJournalHeld, FOLD_WAIT).value ?? 0;
}
function foldJournalHeld() {
  cutIntoMonths();
  const local = lines(LOCAL_JOURNAL());
  if (!local.length) return 0;
  // The last session folded: old lines say `t`, the journal's events `at`.
  // Looked for from this month backwards, no further than the first month
  // that holds one.
  let last = "";
  for (const f of journalFiles({ computer: computerName() }).reverse()) {
    last = lines(f.file).filter((e) => (e.what ?? e.type) === "session").reduce((m, e) => (String(e.at ?? e.t) > m ? String(e.at ?? e.t) : m), "");
    if (last) break;
  }
  const fresh = local.filter((e) => String(e.t) > last);
  if (!fresh.length) return 0;
  addToMonths(fresh.map((e) => ({ at: e.t, act: "signal", what: "session", project: e.project, cwd: e.cwd, session: e.session, title: e.title ?? sessionTitle(e.transcript) ?? undefined })));
  return fresh.length;
}

/**
 * Every session since a date, from every computer: the brain's journal files,
 * and this computer's lines not folded yet. Each entry says its computer.
 */
export function readJournals(since) {
  const me = computerName();
  const out = [];
  const folded = new Set();
  {
    for (const { file, computer } of journalFiles({ since })) {
      for (const raw of lines(file)) {
        // The journal holds every event now: only the sessions are the work journal.
        if ((raw.what ?? raw.type) !== "session") continue;
        const e = { ...raw, t: raw.t ?? raw.at };
        if (computer === me) folded.add(`${e.session}|${e.t}`);
        if (String(e.t).slice(0, 10) >= since) out.push({ ...e, computer });
      }
    }
  }
  for (const e of lines(LOCAL_JOURNAL())) {
    if (String(e.t).slice(0, 10) < since || folded.has(`${e.session}|${e.t}`)) continue;
    out.push({ ...e, computer: me, title: e.title ?? sessionTitle(e.transcript) });
  }
  return out;
}

// THE BRAIN'S JOURNAL (P7, 2026-11-07). One line for everything that happens
// to the brain: a note read, a note written, a source or an evening run, a
// signal (a Claude session, a skill that ran, a file that moved). Written live
// in ~/.hypervibe-brain/events.jsonl (outside the brain, which would never be
// at rest), folded into journal/<computer>.jsonl at each save: one writer per
// file, two computers never conflict, every copy of the brain has it.
//
//   { at, id, computer, act: read|write|run|signal, who, ... }
//   who: source:<name>, ai:<conversation>, person, hand (an edit seen at the
//   save that no tool announced), evening, hub
//
// What a search was ABOUT never enters it: only the notes it found. The text
// of a question stays in usage.jsonl, on this computer.
export const EVENTS = () => join(HOME, ".hypervibe-brain", "events.jsonl");
const FOLDED = () => join(HOME, ".hypervibe-brain", "events-folded.json");
const brainKey = () => ROOT.replaceAll("\\", "/");

/** Notes one event. Never throws: a journal that fails must not stop the work. */
export function logEvent(e) {
  try {
    const line = {
      at: new Date().toISOString(),
      id: randomBytes(5).toString("hex"),
      computer: computerName(),
      brain: brainKey(),
      ...e,
    };
    mkdirSync(join(HOME, ".hypervibe-brain"), { recursive: true });
    appendFileSync(EVENTS(), `${JSON.stringify(line)}\n`, "utf8");
    return line.id;
  } catch {
    return null;
  }
}

/**
 * THIS COMPUTER'S LATEST EVENTS of this brain, since a date, oldest first.
 * The live file is read from its END, block by block, and the reading stops
 * at the first line older than the date: the file is written in order, and
 * the hub asks at every beat what a judge spent today (2026-11-17: 4.6 MB of
 * events on a real computer, of which a day is a small tail). Only what this
 * computer wrote, and only the 30 days the live file keeps.
 */
export function recentEvents(since) {
  let fd;
  try {
    fd = openSync(EVENTS(), "r");
  } catch {
    return [];
  }
  const out = [];
  try {
    const BLOCK = 256 * 1024;
    const key = brainKey();
    let pos = fstatSync(fd).size;
    let head = Buffer.alloc(0); // the start of a line cut by the block read before
    let done = false;
    while (pos > 0 && !done) {
      const n = Math.min(BLOCK, pos);
      pos -= n;
      const buf = Buffer.alloc(n);
      readSync(fd, buf, 0, n, pos);
      const chunk = Buffer.concat([buf, head]);
      // Its first line may be cut: it waits for the block before it.
      const cut = pos > 0 ? chunk.indexOf(10) + 1 : 0;
      if (pos > 0 && cut === 0) {
        head = chunk;
        continue;
      }
      head = chunk.subarray(0, cut);
      const rows = chunk.subarray(cut).toString("utf8").split("\n");
      for (let i = rows.length - 1; i >= 0; i--) {
        if (!rows[i].trim()) continue;
        let e = null;
        try {
          e = JSON.parse(rows[i]);
        } catch {
          continue; // an unreadable line is skipped
        }
        if (String(e.at) < since) {
          done = true;
          break;
        }
        if (e.brain === key) out.push(e);
      }
    }
  } catch {
    // a journal that cannot be read says nothing
  } finally {
    closeSync(fd);
  }
  return out.reverse();
}

/** The old line of the work journal ({ t, type: "session" }) as an event. */
const normal = (e, computer) =>
  e.act ? { computer, ...e } : { at: e.t, act: "signal", what: e.type ?? "session", computer, ...Object.fromEntries(Object.entries(e).filter(([k]) => k !== "t" && k !== "type")) };

/**
 * How far each brain's events were folded: { <brain>: "<at>|<id>" }. `sure`
 * is false when the mark cannot be read: the fold then looks at what the
 * brain's journal already holds, rather than fold everything again.
 */
const foldedTo = () => {
  const r = readJsonFile(FOLDED(), {});
  const good = r.ok && r.value && typeof r.value === "object" && !Array.isArray(r.value);
  return { done: good ? r.value : {}, sure: good || r.missing };
};

// THE LIVE FILE IS PARSED ONCE (2026-11-21). A save asked for it four times
// (6 MB and 25 000 lines on a real computer after two weeks), an undo five
// times. What was parsed is kept for the two seconds a script lasts, and when
// the same file has only grown, only what was added is read. Never kept
// longer: a program that stays up (the MCP server) must not hold a month of
// events in memory.
//
// THE SAME FILE, GROWN, IS TOLD BY ITS LAST BYTES TOO (2026-11-27). It was
// told by its number on the disk, its first bytes and its size. On Linux a new
// file is often given the number of one just removed: after two other folds
// had replaced the live file (its first line unchanged, old lines gone from
// its middle, new ones at its end), a program that had read it took the new
// file for the old one grown, and read on from where it had stopped, in a
// file where every line had moved. The lines it never saw were not in what it
// wrote as "folded in the last ten seconds", and the next fold added them to
// the brain's journal a second time (one event of 240 counted twice, on the
// bench on Linux). So the last bytes read are kept, and looked for at the
// same place: a line carries its instant and a random id, another file does
// not have the same ones there.
const EDGE = 96;
const bytesAt = (fd, from, to) => {
  const buf = Buffer.alloc(Math.max(0, to - from));
  const n = buf.length ? readSync(fd, buf, 0, buf.length, from) : 0;
  return buf.subarray(0, n).toString("latin1");
};
/** @type {{ ino: number, size: number, head: string, tail: string, rows: any[] } | null} */
let liveKept = null;
let liveTimer = null;
function liveRows() {
  let fd;
  try {
    fd = openSync(EVENTS(), "r");
  } catch {
    liveKept = null;
    return [];
  }
  try {
    const st = fstatSync(fd);
    const head = bytesAt(fd, 0, Math.min(EDGE, st.size));
    // The same file, grown: it is not smaller, and neither its first bytes nor the last ones read have changed.
    const grown = liveKept && liveKept.ino === st.ino && st.size >= liveKept.size && head.startsWith(liveKept.head) && bytesAt(fd, liveKept.size - liveKept.tail.length, liveKept.size) === liveKept.tail;
    const from = grown ? liveKept.size : 0;
    const rows = grown ? liveKept.rows : [];
    let size = from;
    if (st.size > from) {
      const buf = Buffer.alloc(st.size - from);
      const n = readSync(fd, buf, 0, buf.length, from);
      // Whole lines only: a line being written right now is read next time.
      const end = buf.subarray(0, n).lastIndexOf(10) + 1;
      for (const l of buf.subarray(0, end).toString("utf8").split("\n")) {
        if (!l.trim()) continue;
        try {
          rows.push(JSON.parse(l));
        } catch {
          // an unreadable line is skipped
        }
      }
      size = from + end;
    }
    liveKept = { ino: st.ino, size, head, tail: bytesAt(fd, Math.max(0, size - EDGE), size), rows };
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      liveKept = null;
    }, 2000);
    liveTimer.unref();
    return rows;
  } catch {
    liveKept = null;
    return lines(EVENTS());
  } finally {
    closeSync(fd);
  }
}

/**
 * What a fold of this brain has to take from the live file. `beyond`: the
 * lines after the mark (the quiet ones pass it without joining the brain).
 * `behind`: the lines stamped just BEFORE the mark that no fold has taken. A
 * writer stamps its line, then writes it: a line stamped a millisecond before
 * the last line a fold read, and written a millisecond after that reading, is
 * behind the mark for ever. So each fold looks ten seconds back, and the ids
 * folded in those ten seconds are kept (events-folded-recent.json) to tell
 * such a line from one already in the brain; without them (`unsure`), the
 * fold looks at what the brain's journal holds.
 */
function toFold() {
  const key = brainKey();
  const { done, sure } = foldedTo();
  const last = done[key] ?? "";
  const mine = liveRows().filter((e) => e.brain === key);
  const beyond = mine.filter((e) => keyOf(e) > last);
  const lastAt = Date.parse(last.slice(0, Math.max(0, last.indexOf("|"))));
  let behind = [];
  let unsure = !sure || !(key in done);
  if (!Number.isNaN(lastAt)) {
    const back = new Date(lastAt - LOOK_BACK_MS).toISOString();
    behind = mine.filter((e) => keyOf(e) <= last && String(e.at) >= back && !quiet(e));
    if (behind.length) {
      // (Kept with the mark they go with: another mark, they say nothing.)
      const recent = readJsonFile(RECENT(), {});
      const mine2 = recent.ok ? recent.value?.[key] : null;
      const ids = mine2 && mine2.mark === last && Array.isArray(mine2.ids) ? new Set(mine2.ids) : null;
      if (ids) behind = behind.filter((e) => !ids.has(e.id));
      else unsure = true;
    }
  }
  return { key, done, last, mine, beyond, behind, unsure };
}

/** This computer's events of this brain that are to join its journal and have not yet (the quiet ones never do). */
export function pendingEvents() {
  const t = toFold();
  if (!t.unsure || !t.behind.length) return [...t.behind, ...t.beyond.filter((e) => !quiet(e))];
  // (Not known for sure: a line the brain's journal already holds is not pending.)
  const there = idsInMonths(t.behind);
  return [...t.behind.filter((e) => !there.has(e.id)), ...t.beyond.filter((e) => !quiet(e))];
}
/** The ids the brain's journal of this computer already holds, in the months of these lines. */
function idsInMonths(rows) {
  const there = new Set();
  for (const month of new Set(rows.map(monthOf))) for (const e of lines(join(DIR(), `${computerName()}-${month}.jsonl`))) if (e.id) there.add(e.id);
  return there;
}

// ONE FOLD AT A TIME, AND A LIVE FILE NEVER WRITTEN OVER (2026-11-21).
//
// The fold read the live file, wrote the brain's journal, wrote its mark, then
// wrote the live file again without its old lines. Nothing held the others
// back meanwhile: an event written by another program between that reading and
// that writing was erased (a fact, a note created: no line left, so nothing to
// undo and nothing in the letter), and two saves at the same moment (the hub's
// hourly one, the one after a capture, the evening's) read the same mark and
// folded the same lines twice, so a judge's cost was counted twice.
//
//   - A LOCK (a file created exclusively, lib.mjs withFileLock) is held for
//     the whole fold: the second save waits a few seconds, then leaves the
//     fold to the first one. Its events join the brain at the next save.
//   - THE WRITERS TAKE NO LOCK (an event must never wait): so the live file is
//     never written in place. To drop its old lines, what stays is written
//     beside, the live file is RENAMED away (a writer that comes at that
//     instant starts a new one, a writer already in it finishes in the renamed
//     one), what stays takes the name without ever replacing a file (a hard
//     link, refused when a new file is already there: its lines are then taken
//     too), and whatever was added to the renamed file meanwhile is put back
//     at the end. Every line written is in exactly one of those places.
//   - A FOLD CUT SHORT (the computer switched off between the journal and the
//     mark) leaves a word behind it (events-folding.json): the next fold then
//     checks what the brain's journal already holds, and adds no line twice.
//     The same check runs when the mark is gone or cannot be read.
//   - A file renamed away and never put back (cut short there) is found by the
//     next fold and joined again, each line once.
const FOLD_LOCK = () => join(HOME, ".hypervibe-brain", "events-fold.lock");
/** A fold lasts a second or two; one that holds the lock for five minutes is dead. */
const FOLD_WAIT = { wait: 5000, stale: 300_000 };
const FOLDING = () => join(HOME, ".hypervibe-brain", "events-folding.json");
const RECENT = () => join(HOME, ".hypervibe-brain", "events-folded-recent.json");
const PRUNED = () => join(HOME, ".hypervibe-brain", "events-pruned");
const LOOK_BACK_MS = 10_000;
const keyOf = (e) => `${e.at}|${e.id}`;

/** Folds this computer's new events of this brain into its journal, each in the file of its month. Returns how many joined. */
export function foldEvents() {
  return withFileLock(FOLD_LOCK(), foldEventsHeld, FOLD_WAIT).value ?? 0;
}
function foldEventsHeld() {
  cutIntoMonths();
  try {
    putBackLeftovers();
  } catch {
    // A live file set aside by a fold cut short could not be joined again yet
    // (held by another program): no fold now, its lines must not be passed over.
    return 0;
  }
  const { key, done, last, mine, beyond, behind, unsure } = toFold();
  let joined = 0;
  if (beyond.length || behind.length) {
    // The quiet lines pass the mark without joining the brain: they stay here.
    let joining = [...behind, ...beyond.filter((e) => !quiet(e))];
    const cut = readJsonFile(FOLDING(), {});
    const intents = cut.ok && cut.value && typeof cut.value === "object" ? cut.value : {};
    // No mark for this brain, a mark that cannot be read, or a fold cut short
    // before its mark: what the brain's journal already holds is not added again.
    if (joining.length && (unsure || cut.unreadable || key in intents)) {
      const there = idsInMonths(joining);
      joining = joining.filter((e) => !there.has(e.id));
    }
    const top = beyond.reduce((m, e) => (keyOf(e) > m ? keyOf(e) : m), last);
    writeFileAtomic(FOLDING(), `${JSON.stringify({ ...intents, [key]: top })}\n`);
    addToMonths(joining.map(({ brain, computer, ...rest }) => rest));
    done[key] = top;
    writeFileAtomic(FOLDED(), `${JSON.stringify(done)}\n`);
    // The ids of the last ten seconds before the mark: all in the brain now.
    try {
      const back = new Date(Date.parse(top.slice(0, top.indexOf("|"))) - LOOK_BACK_MS).toISOString();
      const kept = readJsonFile(RECENT(), {});
      writeFileAtomic(RECENT(), `${JSON.stringify({ ...(kept.ok && kept.value && typeof kept.value === "object" ? kept.value : {}), [key]: { mark: top, ids: mine.filter((e) => !quiet(e) && keyOf(e) <= top && String(e.at) >= back).map((e) => e.id) } })}\n`);
    } catch {
      rmSync(RECENT(), { force: true }); // the next fold then looks at the brain's journal itself
    }
    const { [key]: _mine, ...others } = intents;
    if (Object.keys(others).length) writeFileAtomic(FOLDING(), `${JSON.stringify(others)}\n`);
    else rmSync(FOLDING(), { force: true });
    joined = joining.length;
  }
  try {
    pruneLive(done);
  } catch {
    // the old lines leave at another fold: nothing is lost by keeping them
  }
  return joined;
}

const retried = (f) => {
  for (let tries = 0; ; tries++) {
    try {
      return f();
    } catch (e) {
      if (tries >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
};
const wholeLines = (buf) => buf.subarray(0, buf.lastIndexOf(10) + 1);

/**
 * Gives the live file a new content WITHOUT EVER WRITING OVER IT (see above).
 * `make(buf)` gets the whole lines of the live file as they are now and
 * returns the text that replaces them, or null to leave the file alone.
 * Everything a writer adds meanwhile ends up in the new file, once.
 */
function replaceLive(make) {
  const live = EVENTS();
  let buf = Buffer.alloc(0);
  try {
    buf = readFileSync(live);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const taken = wholeLines(buf);
  const text = make(taken);
  if (text === null) return false;
  const tag = `${process.pid}-${Date.now().toString(36)}`;
  const next = `${live}.${tag}.next`;
  writeFileSync(next, text, "utf8");
  // The files renamed away, with how much of each was read already.
  const away = [];
  const aside = (n) => `${live}.${tag}.${n}.away`;
  try {
    if (buf.length || existsSync(live)) {
      try {
        retried(() => renameSync(live, aside(0)));
        away.push({ file: aside(0), read: taken.length });
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
    }
  } catch (e) {
    // The live file could not be moved (held by another program): it stays as it is.
    rmSync(next, { force: true });
    throw e;
  }
  let placed = false;
  for (let tries = 0; tries < 10 && !placed; tries++) {
    try {
      linkSync(next, live);
      placed = true;
    } catch (e) {
      if (e.code !== "EEXIST") break; // no hard link on this disk: see below
      // An event was written in the instant between the two: its file is taken too.
      try {
        retried(() => renameSync(live, aside(away.length)));
        away.push({ file: aside(away.length), read: 0 });
      } catch {
        break;
      }
    }
  }
  // (No hard link, or writers that never pause: the new content is added to
  // whatever is there. Nothing is lost; a few lines may be out of order.)
  if (!placed) appendFileSync(live, readFileSync(next));
  rmSync(next, { force: true });
  // What was added to the files renamed away after they were read: a writer
  // that had the file open at the rename, or that wrote during the reading.
  for (let pass = 0; pass < 3; pass++) {
    let more = false;
    for (const a of away) {
      const b = readFileSync(a.file);
      const late = wholeLines(b).subarray(a.read);
      if (!late.length) continue;
      appendFileSync(live, late);
      a.read += late.length;
      more = true;
    }
    if (!more) break;
  }
  for (const a of away) rmSync(a.file, { force: true });
  liveKept = null;
  return true;
}

/**
 * A live file renamed away by a fold that was cut short (the computer switched
 * off in that instant) is joined to the live file again: its lines first, then
 * the live file's, each line once.
 */
function putBackLeftovers() {
  const dir = join(HOME, ".hypervibe-brain");
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => n.startsWith("events.jsonl.") && (n.endsWith(".away") || n.endsWith(".next")));
  } catch {
    return;
  }
  const away = names.filter((n) => n.endsWith(".away")).sort();
  if (away.length) {
    const before = away.map((n) => readFileSync(join(dir, n), "utf8"));
    replaceLive((buf) => {
      const seen = new Set();
      const out = [];
      for (const l of [...before.flatMap((t) => t.split("\n")), ...buf.toString("utf8").split("\n")]) {
        if (!l.trim() || seen.has(l)) continue;
        seen.add(l);
        out.push(l);
      }
      return out.length ? `${out.join("\n")}\n` : "";
    });
  }
  for (const n of names) rmSync(join(dir, n), { force: true });
}

/**
 * The live file keeps 30 days: older lines are in the brain already, or were
 * quiet ones. Looked at once a day at most, and only when its first line is
 * old enough (the file is written in order): the lines were all read again at
 * every save to find out. A line of another brain of this computer that has
 * not joined its journal yet stays, as long as that brain exists.
 */
function pruneLive(done) {
  try {
    if (Date.now() - statSync(PRUNED()).mtimeMs < 86400_000) return;
  } catch {
    // never pruned yet
  }
  const limit = new Date(Date.now() - 30 * 86400_000).toISOString();
  const first = liveRows()[0];
  if (!first) return;
  const there = new Map();
  const brainThere = (b) => {
    if (!there.has(b)) there.set(b, Boolean(b) && existsSync(join(String(b), "brain.json")));
    return there.get(b);
  };
  const stays = (e) => String(e.at) >= limit || (keyOf(e) > (done[e.brain] ?? "") && !quiet(e) && brainThere(e.brain));
  if (String(first.at) < limit) {
    replaceLive((buf) => {
      const kept = [];
      let dropped = 0;
      for (const l of buf.toString("utf8").split("\n")) {
        if (!l.trim()) continue;
        let e = null;
        try {
          e = JSON.parse(l);
        } catch {
          e = null; // an unreadable line says nothing: it leaves
        }
        if (e && stays(e)) kept.push(l);
        else dropped++;
      }
      return dropped ? (kept.length ? `${kept.join("\n")}\n` : "") : null;
    });
  }
  try {
    writeFileSync(PRUNED(), "", "utf8");
    utimesSync(PRUNED(), new Date(), new Date());
  } catch {
    // looked at again at the next fold
  }
}

/**
 * Every event since a date, from every computer: the brain's journal files
 * (only the months the date reaches), and this computer's live file, which
 * holds what is not folded yet and the quiet lines of its last thirty days. Filter by `act` and `who` prefix.
 */
export function readEvents({ since = "", act, who } = {}) {
  const me = computerName();
  const out = [];
  const seen = new Set();
  const keep = (e) => (!since || String(e.at) >= since) && (!act || e.act === act) && (!who || String(e.who ?? "").startsWith(who));
  {
    for (const { file, computer } of journalFiles({ since })) {
      for (const raw of lines(file)) {
        const e = normal(raw, computer);
        // Each event once: a line folded twice (two saves at the same moment,
        // before 2026-11-21) counted a judge's cost twice.
        if (e.id) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
        }
        if (keep(e)) out.push(e);
      }
    }
  }
  for (const e of liveRows()) {
    if (e.brain !== brainKey() || seen.has(e.id)) continue;
    const { brain, ...rest } = e;
    if (keep(rest)) out.push({ ...rest, computer: rest.computer ?? me });
  }
  return out.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
bindReadEvents(readEvents);
