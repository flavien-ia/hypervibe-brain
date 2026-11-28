// journal.mjs: the brain's journal, as the plugin writes it (journal.mjs
// there): one event per line, in the brain's journal/ folder and, for what
// this computer has not handed over yet, in ~/.hypervibe-brain/events.jsonl.
// What a tool did (activity.mjs) and what the judges cost (judges.mjs) are
// both read from it.

import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** @typedef {Record<string, any>} JournalEvent one line of the brain's journal (the plugin's keys: at, act, who, what, note...) */

/**
 * A JSON file, or `fallback` when it cannot be read.
 * @param {string} file
 * @param {any} [fallback]
 * @returns {any}
 */
export const readJson = (file, fallback = null) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
};

/** @type {Map<string, { stamp: string, value: any }>} file -> its date and size when it was read, and what it held */
const kept = new Map();
/**
 * A JSON file read once per version of it (its date and size): what is asked
 * again and again (a source's declaration, a judge's pile) then costs a look
 * at the file, not a reading. The value is shared: it must not be changed.
 * @param {string} file
 * @param {any} [fallback]
 * @returns {any}
 */
export function readJsonOnce(file, fallback = null) {
  let stamp = "";
  try {
    const s = statSync(file);
    stamp = `${s.mtimeMs}:${s.size}`;
  } catch {
    kept.delete(file);
    return fallback;
  }
  const known = kept.get(file);
  if (known?.stamp === stamp) return known.value;
  const value = readJson(file, fallback);
  kept.set(file, { stamp, value });
  return value;
}

// WRITTEN WHOLE OR NOT AT ALL (2026-11-21). The view wrote a source's
// declaration, the hub's flags and the territories in place: a reader that
// came between the truncation and the write saw an empty file, and took a
// source for absent or lost the names given by hand. The same gesture as the
// plugin's lib.mjs (writeFileAtomic): beside the file, then renamed over it.
// (Not imported from there: lib.mjs looks for the brain when it is loaded,
// and the view's type check would follow the import into the plugin's scripts.)
/**
 * Writes a file beside itself, then renames it over. On Windows a rename over
 * a file being read is refused for an instant: tried again for half a second.
 * @param {string} file
 * @param {string} text
 * @param {{ mode?: number }} [how] `mode`: the rights of the file, where the system has some
 */
export function writeFileAtomic(file, text, { mode } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { encoding: "utf8", ...(mode ? { mode } : {}) });
  for (let tries = 0; ; tries++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      if (tries >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}

/**
 * A JSON file read to be written again: `missing` when there is no such file,
 * `unreadable` when it is there and cannot be parsed. Never write over an
 * unreadable file from a fallback: what it held would be lost.
 * @param {string} file
 * @returns {{ value: any, missing: boolean, unreadable: boolean }}
 */
export function readForWrite(file) {
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch (e) {
    return { value: null, missing: e.code === "ENOENT", unreadable: e.code !== "ENOENT" };
  }
  try {
    // (Without the byte order mark an editor may have put at its start.)
    return { value: JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text), missing: false, unreadable: false };
  } catch {
    return { value: null, missing: false, unreadable: true };
  }
}

/** What the plugin keeps on this computer (its settings, its journal, its piles). */
export const hubDir = () => join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain");

// THE JOURNALS ARE NOT READ AGAIN IN FULL (audit B4.2). They only grow (0.6 MB
// a day) and a tool's panel asked for them twice at each opening. Each file is
// kept in memory, and only the lines added since are read. A reader says which
// events it keeps: the one of the tools forty days of everything, the one of
// the judges their runs for as long as the journal goes back.

/**
 * A reader of journal files that remembers what it has read.
 * @param {() => (e: JournalEvent) => boolean} keeping called at each reading: which of the new events are kept
 * @returns {(file: string) => JournalEvent[]} the events kept of a file, in the order of the file
 */
export function journalReader(keeping) {
  /** @type {Map<string, { read: number, tail: string, events: JournalEvent[] }>} file -> the bytes already read, the last of them, and their events */
  const journals = new Map();
  /** @param {number} fd @param {number} from @param {number} to @returns {string} the bytes of a file between two places */
  const bytesAt = (fd, from, to) => {
    const b = Buffer.alloc(Math.max(0, to - from));
    const n = b.length ? readSync(fd, b, 0, b.length, from) : 0;
    return b.subarray(0, n).toString("latin1");
  };
  return (file) => {
    let size = 0;
    try {
      size = statSync(file).size;
    } catch {
      journals.delete(file);
      return [];
    }
    let j = journals.get(file);
    // A file made shorter or replaced is read again from the start.
    if (!j || size < j.read) j = { read: 0, tail: "", events: [] };
    if (size > j.read) {
      const keep = keeping();
      /** @type {number | null} */
      let fd = null;
      try {
        fd = openSync(file, "r");
        // REPLACED AND NO SHORTER (2026-11-27): the computer's live journal is
        // written again once a day without its old lines, and what was added
        // since the last reading can make the new file as long as the old one
        // was. Its size alone then said "the same file, grown", and the
        // reading went on from the old place, in a file where every line had
        // moved. The last bytes read are looked for where they were: a line
        // carries its instant and a random id, another file has others there.
        if (j.read > 0 && bytesAt(fd, j.read - j.tail.length, j.read) !== j.tail) j = { read: 0, tail: "", events: [] };
        const buffer = Buffer.alloc(size - j.read);
        readSync(fd, buffer, 0, buffer.length, j.read);
        // A last line still being written waits for the next reading.
        const end = buffer.lastIndexOf(10);
        if (end >= 0) {
          for (const l of buffer.subarray(0, end).toString("utf8").split("\n")) {
            if (!l) continue;
            try {
              const e = JSON.parse(l);
              if (e.at && keep(e)) j.events.push(e);
            } catch {
              // an unreadable line
            }
          }
          j.read += end + 1;
          j.tail = bytesAt(fd, Math.max(0, j.read - 96), j.read);
        }
      } catch {
        // unreadable right now: the next call tries again
      } finally {
        if (fd !== null) closeSync(fd);
      }
      journals.set(file, j);
    }
    return j.events;
  };
}

// Beyond forty days (the history shows thirty), a line is not kept.
const KEEP_MS = 40 * 86_400_000;
const readRecent = journalReader(() => {
  const limit = new Date(Date.now() - KEEP_MS).toISOString();
  return (e) => e.at >= limit;
});

/**
 * The events of the journal since a date: the brain's files and what this
 * computer has not handed over yet, each event once, in the order of time.
 * @param {string} brain
 * @param {string} since an ISO date ("" for everything the reader keeps)
 * @param {(file: string) => JournalEvent[]} [read] the reader (the one of the last forty days by default)
 * @returns {JournalEvent[]}
 */
export function eventsSince(brain, since, read = readRecent) {
  const all = allEvents(brain, read);
  if (!since) return all;
  // (In the order of time: the first event from the date on is found by halves.)
  let low = 0;
  let high = all.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (String(all[middle].at) < since) low = middle + 1;
    else high = middle;
  }
  return all.slice(low);
}

// MERGED ONCE PER STATE OF THE JOURNALS (2026-11-21, audit 14). Each call
// merged, deduplicated and sorted forty days of events again: a third of a
// second for the card of a tool, asked twice at each opening. What was merged
// is kept for as long as no journal file grew (their sizes say so, which opens
// nothing). The list is shared: it must not be changed.
/** @type {WeakMap<Function, Map<string, { stamp: string, events: JournalEvent[] }>>} reader -> brain -> what was merged, and for which sizes */
const merged = new WeakMap();
/**
 * Every event a reader keeps, each once, in the order of time.
 * @param {string} brain
 * @param {(file: string) => JournalEvent[]} read
 * @returns {JournalEvent[]}
 */
function allEvents(brain, read) {
  const key = brain.replaceAll("\\", "/");
  const files = journalFiles(brain);
  const stamp = sizesOf(files);
  let byBrain = merged.get(read);
  if (!byBrain) merged.set(read, (byBrain = new Map()));
  const kept = byBrain.get(key);
  if (kept?.stamp === stamp) return kept.events;
  const seen = new Set();
  /** @type {JournalEvent[]} */
  const out = [];
  for (const f of files) {
    for (const e of read(f)) {
      if (e.brain && e.brain !== key) continue;
      if (e.id) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
      }
      out.push(e);
    }
  }
  out.sort((a, b) => (String(a.at) < String(b.at) ? -1 : String(a.at) > String(b.at) ? 1 : 0));
  byBrain.set(key, { stamp, events: out });
  return out;
}

/**
 * A result kept for as long as what it was computed from did not move.
 * @template T
 * @param {Map<string, { stamp: string, value: T }>} store
 * @param {string} key
 * @param {string} stamp what the result depends on, in a word
 * @param {() => T} compute
 * @returns {T}
 */
export function keptWhile(store, key, stamp, compute) {
  const kept = store.get(key);
  if (kept?.stamp === stamp) return kept.value;
  const value = compute();
  store.set(key, { stamp, value });
  return value;
}

/**
 * What says whether the journals of a brain moved: the size of each file.
 * @param {string} brain
 * @returns {string}
 */
export const journalStamp = (brain) => sizesOf(journalFiles(brain));

/** @param {string} brain @returns {string[]} the files of the brain's journal, then what this computer has not handed over yet */
function journalFiles(brain) {
  const folder = join(brain, "journal");
  const files = existsSync(folder) ? readdirSync(folder).filter((n) => n.endsWith(".jsonl")).map((n) => join(folder, n)) : [];
  files.push(join(hubDir(), "events.jsonl"));
  return files;
}

/** @param {string[]} files @returns {string} each file and its size (asking for it opens nothing) */
function sizesOf(files) {
  let stamp = "";
  for (const f of files) {
    try {
      stamp += `${f}:${statSync(f).size}|`;
    } catch {
      stamp += `${f}:none|`;
    }
  }
  return stamp;
}
