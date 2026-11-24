#!/usr/bin/env node
// sources.mjs - The person's OWN sources: what feeds their brain beyond the
// living sources every brain has (mail and calendar, folders, work with
// Claude). Each person has different ones: their posts in some database, the
// talks of their agenda, a reading list, an export of an app...
//
// A source lives in the brain, in sources/<name>/:
//   source.json     what it is: { name, description, kind, every, type,
//                   domains, updates, needs, enabled, paused, timeoutMin }
//   run.mjs         kind "script": a small program that READS and prints the
//                   notes to create, one JSON per line (the contract is at the
//                   top of the template). It never writes a note itself: the
//                   plugin does, through notes.mjs, with every check.
//   run.mjs         kind "step": a program of the brain's own that writes NO
//                   note (it publishes, mirrors, checks...), run at its rhythm
//                   (the evening or the week, or a tick of the hub's clock),
//                   "before" the index is rebuilt or "after" the save.
//                   Approved on each computer like a script. Its output is only
//                   its report.
//   instructions.md kind "claude": what Claude does during the weekly review,
//                   for what needs judgment or a browser.
//   seen.json       which item became which note (never twice the same)
//   state.json      its last success, its last error: a source that failed
//                   for three days catches up by itself from its last success
//
// TRUST. A script that arrives with a clone (a second computer, a restored
// copy) must not run by itself: it runs only once the person approved it ON
// THIS COMPUTER, and a script that changed since is not run again until it is
// approved again. The approvals live in ~/.hypervibe-brain/config.json, never in
// the brain.
//
//   node scripts/sources.mjs list [--json]
//   node scripts/sources.mjs add <name> --kind script|claude --every day|week|hour|30m --type <type> --domains a,b [--description "..."] [--updates] [--finished] [--zones <zone>[,<zone>]] [--entries replace] [--needs <ITEM>[,<ITEM>]]
//   node scripts/sources.mjs add <name> --kind step --every day|week|hour|30m --when before|after [--description "..."] [--needs <ITEM>[,<ITEM>]]
//        (--every: "week" by default; "hour" and minutes such as "30m" are ticks of
//        the hub's clock, see hub.mjs. --finished: its notes are records it may
//        keep up to date, --zones: the machine zones it writes, see notes.mjs.
//        --needs: the vault items its keys are read from; see "THE KEYS OF A SOURCE" below)
//   node scripts/sources.mjs test <name>        run it, check its notes, write nothing
//   node scripts/sources.mjs trust <name>       approve its script on this computer
//   node scripts/sources.mjs run [<name>] [--due] [--phase after]   (without --phase: scripts and "before" steps)
//   node scripts/sources.mjs mark <name> --ok [--created N] | --error "<what>"   (for "claude" sources)
//   node scripts/sources.mjs enable|disable <name>
//   node scripts/sources.mjs pause|resume <name>
//   node scripts/sources.mjs install --list | <conversations|documents> [--days N]
//   node scripts/sources.mjs set <judge> dailyTokens|catchUp <n> | proof on|off   (--all in place of the name: every judge)
//   node scripts/sources.mjs exclude <judge> list | add "<pattern>" [--dry] | remove "<pattern>"
//
// A JUDGE'S LIMITS (2026-11-17, judge.mjs): `set` writes its cap for the day
// ("dailyTokens", 0: none) and the size of pile above which it waits for the
// person ("catchUp", 0: never). `exclude` keeps the list of what it must never
// read (exclude.mjs says how a pattern matches): adding a pattern also takes
// off its pile the items that match, unread; `--dry` only says which.
//
// THE STANDARD SOURCES (2026-11-16). Two sources every brain can have without
// writing anything, kept as templates in the plugin (templates/sources/): the
// conversations with Claude Code, and the documents of the watched folders.
// Each is a pair: a JUDGE (kind "claude", "live": true: a background Claude
// that reads what is on its pile, judge.mjs) and a small STEP that puts on that
// pile what just settled, at each tick of its rhythm (the half hour, :00 and
// :30; its work is watch.mjs).
// `install` copies a pair into the brain's sources/, in the brain's language,
// and never on top of a source that exists.
//
// PAUSED is not disabled. A disabled source ("enabled": false) is gone from
// the lists. A paused one ("paused": true) stays in them and keeps its state,
// but never runs by itself: not at its rhythm, not after a skill, not
// after another source, not in the evening. A paused judge (kind "claude",
// "live": true) keeps its pile, which goes on gathering. Only the person
// asking runs it: a named `run`, or "now" in the live view.
//
// THE KEYS OF A SOURCE STAY IN THE VAULT, AND A CLOSED VAULT IS A WAIT
// (2026-11-21, vault-queue.mjs). A source that names vault items ("needs") is
// not run while the Hypervibe vault is closed, whoever asks (the evening save,
// the hub, a named `run`) and whatever its rhythm: it is put in the queue,
// its state is left untouched (no error, so no alert), and the hub runs it at
// the first beat that finds the vault open. Until then the evening ran it
// anyway: it failed, and a source of the evening's rhythm was not tried again
// before the next evening.

import { entryProblem, upsertEntries } from "./catalogue.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PLUGIN_ROOT, ROOT, config, isFrench, isRunner, noteWritten, readJsonFile, readVault, requireBrain, requireRunner, setUserConfig, sha256, today, userConfig, writeFileAtomic } from "./lib.mjs";
import { dequeue, enqueue, readQueue, vaultState } from "./vault-queue.mjs";
import { checkNote, createNote, fileHash, refreshOwn, refreshSeed, slugIndex, writeZone } from "./notes.mjs";
import { readDirectory, upsert, writeDirectory } from "./directory.mjs";
import { logEvent } from "./journal.mjs";
import { interval, tickPassed } from "./pure.mjs";
import { keepBefore } from "./before.mjs";
import { ensureRoot } from "./roots.mjs";

requireBrain();
const args = process.argv.slice(2);
const [command, name] = args;
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const DIR = join(ROOT, "sources");
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const cfg = config();

const readJson = (p, d) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return d;
  }
};
// WRITTEN WHOLE OR NOT AT ALL, AND NEVER OVER A FILE THAT CANNOT BE READ
// (2026-11-21, lib.mjs). The hub, the evening save, a session and the live
// view read and write a source's files at the same time. Written in place, a
// file caught half written read as "nothing there", and what was written next
// started from nothing: `pause` wrote {"paused":true} as the whole source.json.
const writeJson = (p, o) => writeFileAtomic(p, `${JSON.stringify(o, null, 2)}\n`);
/** A file read to be written again: its value, or null when it is there and cannot be read. */
const readForWrite = (p, d) => {
  const r = readJsonFile(p, d);
  return r.unreadable ? null : r.value ?? d;
};
const def = (n) => readJson(join(DIR, n, "source.json"), null);
const state = (n) => readJson(join(DIR, n, "state.json"), {});
const all = () => (existsSync(DIR) ? readdirSync(DIR).filter((n) => def(n)) : []);
/** A note's text as it is on the disk, "" when it cannot be read: what before.mjs keeps of a change. */
const textOf = (abs) => {
  try {
    return abs ? readFileSync(abs, "utf8") : "";
  } catch {
    return "";
  }
};
const trustKey = (n) => `${ROOT.replace(/\\/g, "/")}::${n}`;
const scriptHash = (n) => (existsSync(join(DIR, n, "run.mjs")) ? sha256(readFileSync(join(DIR, n, "run.mjs"), "utf8").replace(/\r\n/g, "\n")) : null);
const trusted = (n) => scriptHash(n) !== null && userConfig().trustedSources?.[trustKey(n)] === scriptHash(n);
// Where this plugin lives, said to every program of a source (HVBRAIN_PLUGIN):
// a step that calls the plugin's own code finds it there, wherever an update
// has put it (2026-11-16).
const PLUGIN = PLUGIN_ROOT.replace(/\\/g, "/");
// The standard sources, each a pair: [the judge, the step that feeds its pile].
const STANDARD = join(PLUGIN_ROOT, "templates", "sources");
const PAIRS = { conversations: ["conversations", "conversations-watch"], documents: ["documents", "documents-watch"] };

/** The last time the evening save was due, in milliseconds: its hour (the settings, 21:00 otherwise), today or yesterday. */
function eveningSlot(now = Date.now()) {
  const [h, m] = String(userConfig().routines?.save?.time ?? "21:00").split(":").map(Number);
  const slot = new Date(now);
  slot.setHours(Number.isInteger(h) ? h : 21, Number.isInteger(m) ? m : 0, 0, 0);
  if (slot.getTime() > now) slot.setDate(slot.getDate() - 1);
  return slot.getTime();
}

function due(n) {
  const d = def(n);
  const now = Date.now();
  // A rhythm shorter than a day (the hub's): due once a tick of the clock fell
  // since the last run (pure.mjs), success or not (a failing source is not
  // retried at every beat). A last run dated in the future (the clock was set
  // back) counts as now.
  const ms = interval(d.every);
  if (ms) return tickPassed(Math.min(now, Date.parse(state(n).lastRun ?? state(n).lastSuccess ?? "") || 0), now, ms);
  const last = state(n).lastSuccess;
  if (!last) return true;
  // An hour of slack: a source run at 21:02 last week is due at 21:00 this week.
  if (d.every === "week") return now - Date.parse(last) >= 7 * 86400_000 - 3600_000;
  // Daily: not yet succeeded today, in local time.
  const l = new Date(last);
  const localDay = `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, "0")}-${String(l.getDate()).padStart(2, "0")}`;
  if (localDay < today()) return true;
  // OR NOT SINCE THE EVENING'S HOUR (2026-11-21). A source that succeeded
  // earlier the same day (the catch-up of an evening missed, run in the
  // morning; a skill that woke it; the vault opened at last) was "done today":
  // the evening skipped it, and it ran again some 35 hours later.
  return l.getTime() < eveningSlot(now);
}

/** The notes of the vault by their `source`, read once, when first needed. */
function sourceIndex() {
  let m = null;
  return () => {
    if (!m) {
      m = new Map();
      for (const f of readVault().fiches) if (f.fm.source) m.set(String(f.fm.source), join(ROOT, f.rel));
    }
    return m;
  };
}

/** Runs the script and reads its notes. Nothing is written here. */
function execute(n) {
  const d = def(n);
  const r = spawnSync(process.execPath, [join(DIR, n, "run.mjs")], {
    cwd: join(DIR, n),
    encoding: "utf8",
    windowsHide: true,
    timeout: (d.timeoutMin ?? 5) * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, HVBRAIN_BRAIN_DIR: ROOT, HVBRAIN_PLUGIN: PLUGIN, HVBRAIN_SOURCE_SINCE: state(n).lastSuccess ?? "", HVBRAIN_SOURCE_NAME: n },
  });
  const err = String(r.stderr ?? "").split("\n").filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)).slice(-3).join(" | ");
  if (r.error || r.status !== 0) return { ok: false, error: r.error?.code === "ETIMEDOUT" ? `stopped after ${d.timeoutMin ?? 5} min` : `exit ${r.status}${err ? `: ${err}` : ""}`.slice(0, 400) };
  const items = [];
  const bad = [];
  for (const [i, line] of String(r.stdout ?? "").split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.kind === "contact") {
        if (!o.address) throw new Error("a contact needs an address");
      } else if (o.kind === "zone") {
        if (!o.note || !o.name) throw new Error("a zone needs the note it belongs to and its name");
      } else if (o.kind === "entry") {
        const problem = entryProblem(o);
        if (problem) throw new Error(problem);
      } else if (!o.id || !o.title) throw new Error("each note needs an id and a title");
      items.push(o);
    } catch (e) {
      bad.push(`line ${i + 1}: ${e.message}`);
    }
  }
  return { ok: true, items, bad };
}

/**
 * One note from an item: the source's defaults filled in. A machine writes
 * seeds; only a source of finished objects (posts, articles, talks given:
 * records) may write them already trusted.
 */
const noteOf = (n, item) => {
  const d = def(n);
  return {
    title: item.title,
    type: item.type ?? d.type,
    domains: item.domains ?? d.domains,
    body: item.body,
    links: item.links,
    folder: item.folder,
    // A record may have no text; a thought may not.
    allowEmpty: d.finished === true,
    status: d.finished ? item.status ?? "seed" : "seed",
    visibility: item.visibility,
    source: item.source ?? `source:${n}:${item.id}`,
    created: item.created,
    slug: item.slug,
    fields: item.fields,
  };
};

/** A step: its program runs, its exit code says whether it worked, its last lines are its report. */
function runStep(n, st) {
  const d = def(n);
  const now = new Date().toISOString();
  const r = spawnSync(process.execPath, [join(DIR, n, "run.mjs")], {
    cwd: join(DIR, n),
    encoding: "utf8",
    windowsHide: true,
    timeout: (d.timeoutMin ?? 5) * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, HVBRAIN_BRAIN_DIR: ROOT, HVBRAIN_PLUGIN: PLUGIN, HVBRAIN_SOURCE_SINCE: st.lastSuccess ?? "", HVBRAIN_SOURCE_NAME: n },
  });
  const lines = (s) => String(s ?? "").split("\n").filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l));
  const report = lines(r.stdout).slice(-3).join(" | ").slice(0, 400);
  if (r.error || r.status !== 0) {
    const error = r.error?.code === "ETIMEDOUT" ? `stopped after ${d.timeoutMin ?? 5} min` : `exit ${r.status}: ${lines(r.stderr).slice(-3).join(" | ")}`.slice(0, 400);
    writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastError: error });
    return { name: n, ok: false, error };
  }
  writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastSuccess: now, lastError: null, lastReport: report });
  return { name: n, ok: true, step: true, report };
}

function runOne(n) {
  const d = def(n);
  if (!["script", "step"].includes(d.kind)) return { name: n, skipped: "done by Claude during the weekly review" };
  // Its state and what it has already written are read to be written again:
  // there and unreadable, the source is not run and nothing is written over
  // them (its last success says from where it reads, seen.json which item
  // became which note).
  const st = readForWrite(join(DIR, n, "state.json"), {});
  const seen = d.kind === "script" ? readForWrite(join(DIR, n, "seen.json"), {}) : {};
  if (!st || !seen) return { name: n, ok: false, error: `sources/${n}/${st ? "seen" : "state"}.json cannot be read: the source was not run, and nothing was written over that file. Repair it, or remove it` };
  const now = new Date().toISOString();
  if (d.kind === "step") {
    if (!trusted(n)) {
      writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastError: "not approved on this computer (sources.mjs trust)" });
      return { name: n, skipped: "not approved on this computer" };
    }
    logEvent({ act: "signal", who: `source:${n}`, what: "running", ...(process.env.HVBRAIN_RUN_WHY ? { why: process.env.HVBRAIN_RUN_WHY } : {}) });
    const r = runStep(n, st);
    logEvent({ act: "run", who: `source:${n}`, step: true, ok: r.ok !== false });
    return r;
  }
  if (!trusted(n)) {
    writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastError: "not approved on this computer (sources.mjs trust)" });
    return { name: n, skipped: "not approved on this computer" };
  }
  // The live view lights the flow of this source while it runs (the brain's journal).
  logEvent({ act: "signal", who: `source:${n}`, what: "running", ...(process.env.HVBRAIN_RUN_WHY ? { why: process.env.HVBRAIN_RUN_WHY } : {}) });
  const x = execute(n);
  if (!x.ok) {
    // A failed run writes nothing: partial output cannot be trusted. The next
    // run starts again from the last success.
    writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastError: x.error });
    return { name: n, ok: false, error: x.error };
  }
  const slugs = slugIndex();
  const bySource = sourceIndex();
  const res = { name: n, ok: true, created: 0, updated: 0, unchanged: 0, adopted: 0, touched: 0, zones: 0, contacts: 0, refused: [...x.bad] };
  const wrote = [];
  // A source may also feed the contacts directory: lines { "kind": "contact", "address", ... }.
  // Its counts are added (a period observed) or, with "contactCounts": "set" in its
  // definition, replace the old ones (a harvest that recounts everything).
  const contactItems = x.items.filter((i) => i.kind === "contact");
  if (contactItems.length) {
    const dir = readDirectory(cfg);
    upsert(dir, contactItems, { counts: d.contactCounts === "set" ? "set" : "add", tiers: d.setsTier === true }, cfg);
    writeDirectory(dir, cfg);
    res.contacts = contactItems.length;
  }
  // Its catalogue entries (catalogue.mjs): data the brain finds again without
  // keeping it. With "entries": "replace" in its definition, the entries it no
  // longer sends leave the catalogue.
  const entryItems = x.items.filter((i) => i.kind === "entry");
  if (entryItems.length) {
    try {
      // "WROTE" ONLY WHEN THE CATALOGUE'S FILE CHANGED (2026-11-21). On a real
      // brain a source said "3 entries" twenty-eight times in a day for a file
      // that changed four times, and the index was rebuilt each time. One way
      // to it, read in catalogue.mjs: of two lines sent for one address, the
      // first is counted as "updated" at every pass, against the second that
      // the file keeps. So one line an address goes to the catalogue (the last
      // one, the one it kept anyway), and whatever the counts say, the run
      // says it wrote only if the file moved; an entry that left the catalogue
      // counts as well as one that came.
      const file = join(ROOT, "catalogue", `${n}.jsonl`);
      const before = textOf(file);
      const c = upsertEntries(n, [...new Map(entryItems.map((i) => [String(i.address), i])).values()], cfg, { replace: d.entries === "replace" });
      const changed = textOf(file) !== before;
      res.entries = changed ? c.added + c.updated + c.removed : 0;
      if (changed) wrote.push(`catalogue/${n}.jsonl`);
    } catch (e) {
      res.refused.push(`catalogue: ${e.message}`);
    }
  }
  // Its machine zones: only the ones its definition names, only between their marks.
  for (const z of x.items.filter((i) => i.kind === "zone")) {
    try {
      if (!(d.zones ?? []).includes(z.name)) throw new Error(`the zone "${z.name}" is not one this source declared (zones in source.json)`);
      const zoneFile = slugs.get(String(z.note));
      const zoneBefore = textOf(zoneFile);
      const u = writeZone(String(z.note), z.name, z.body, cfg, slugs);
      if (u.updated) {
        res.zones++;
        wrote.push(u.rel);
        keepBefore(logEvent({ act: "write", who: `source:${n}`, note: String(z.note), what: "zone", zone: z.name }), u.rel, zoneBefore, textOf(zoneFile));
      } else if (u.reason === "gone") throw new Error("no such note");
    } catch (e) {
      res.refused.push(`zone ${z.name} of ${z.note}: ${e.message}`);
    }
  }
  for (const item of x.items.filter((i) => i.kind !== "contact" && i.kind !== "zone" && i.kind !== "entry")) {
    const id = String(item.id);
    try {
      const note = noteOf(n, item);
      let entry = typeof seen[id] === "string" ? { slug: seen[id] } : seen[id];
      // Already in the brain under the same source (written before this source
      // existed, by hand or by another program): it IS that note, never a twin.
      if (!entry && bySource().has(note.source)) {
        const abs = bySource().get(note.source);
        entry = { slug: abs.replace(/\\/g, "/").split("/").pop().slice(0, -3), hash: fileHash(abs) };
        seen[id] = entry;
        res.adopted++;
      }
      if (entry) {
        if (!d.updates) {
          res.unchanged++;
          continue;
        }
        const noteFile = slugs.get(entry.slug);
        const noteBefore = textOf(noteFile);
        const u = d.finished ? refreshOwn(entry.slug, note, cfg, slugs, entry.hash) : refreshSeed(entry.slug, note, cfg, slugs);
        if (u.hash) seen[id] = { ...entry, hash: u.hash };
        if (u.updated) {
          res.updated++;
          wrote.push(u.rel);
          keepBefore(logEvent({ act: "write", who: `source:${n}`, note: entry.slug, what: "updated", from: note.source ?? id }), u.rel, noteBefore, textOf(noteFile));
        } else if (u.reason === "touched") res.touched++;
        else res.unchanged++;
      } else {
        const c = createNote(note, cfg, slugs);
        seen[id] = { slug: c.slug, hash: fileHash(join(ROOT, c.rel)) };
        res.created++;
        wrote.push(c.rel);
        logEvent({ act: "write", who: `source:${n}`, note: c.slug, what: "created", from: note.source ?? id });
      }
    } catch (e) {
      res.refused.push(`${id}: ${e.message}`);
    }
  }
  writeJson(join(DIR, n, "seen.json"), seen);
  noteWritten(wrote);
  logEvent({ act: "run", who: `source:${n}`, created: res.created, updated: res.updated, zones: res.zones, entries: res.entries ?? 0, contacts: res.contacts, refused: res.refused.length });
  writeJson(join(DIR, n, "state.json"), {
    ...st,
    lastRun: now,
    lastSuccess: now,
    lastError: res.refused.length ? `${res.refused.length} item(s) refused, first: ${res.refused[0]}`.slice(0, 400) : null,
    lastCreated: res.created,
    lastUpdated: res.updated,
  });
  return res;
}

const TEMPLATE_STEP = (n, d) => `// ${n}: ${d.description ?? "a step of this brain's evening"}
//
// A STEP writes no note: it publishes, mirrors or checks something, every
// ${d.every === "day" ? "evening" : "week"}, ${d.when === "before" ? "before the index is rebuilt" : "once the evening's save is done"}.
// What it prints is its report (the last lines are kept); exit with a non-zero
// code when something went wrong. It receives HVBRAIN_BRAIN_DIR,
// HVBRAIN_SOURCE_SINCE (the date of its last success) and HVBRAIN_PLUGIN (the
// plugin's folder), and runs in its own folder. A key it needs goes in the
// brain's .env, never here.
// It runs only once approved on this computer, and again after any change.

console.log("nothing to do yet");
`;

const TEMPLATE_SCRIPT = (n, d) => `// ${n}: ${d.description ?? "a source of this brain"}
//
// THE CONTRACT. This program READS its source and prints, on its standard
// output, ONE JSON OBJECT PER LINE, one per note to create. It writes nothing
// itself: Hypervibe Brain writes the notes, with every check, and never twice the
// same (the "id").
//
//   { "id": "a stable identifier of the item (an url, a database id...)",
//     "title": "...", "body": "...",
//     "type": "(optional, default ${d.type})", "domains": ["(optional, default ${(d.domains ?? []).join(", ")})"],
//     "created": "YYYY-MM-DD (optional: the date of the item itself)",
//     "source": "(optional: where to check it, default source:${n}:<id>)",
//     "links": ["(optional) slugs of existing notes"],
//     "fields": { "(optional) extra fields": "kept in the note" } }
//
// It may also feed the contacts directory, one line per person:
//   { "kind": "contact", "address": "...", "name": "...", "sent": 3, "received": 2,
//     "first": "YYYY-MM-DD", "last": "YYYY-MM-DD", "subjects": ["..."] }
// and, only if source.json says "setsTier": true, "tier": 0, 1 or 2 (kept as a
// floor under the brain's own rules; 0 removes it).
//
// And it may keep a MACHINE ZONE up to date inside an existing note (a count,
// a figure), if source.json names it ("zones": ["figures"]):
//   { "kind": "zone", "note": "<slug of the note>", "name": "figures", "body": "..." }
// Only what is between <!-- figures:auto --> and <!-- /figures:auto --> is
// rewritten (added at the end the first time), never the rest of the note.
//
// THE CATALOGUE (2026-11-23). What the brain must find again but not think
// with (a post, an artwork, an event, a product, a video: many items alike,
// whose data lives in their own tool) is no note: it is a catalogue entry,
// one line per item. The brain keeps its address, title, date and a short
// excerpt, and finds it by search; the full text is read again where it lives.
//   { "kind": "entry", "address": "scheme://path (stable, unique)", "title": "...",
//     "text": "(the text it is found by)", "date": "YYYY-MM-DD",
//     "url": "(optional) where a person opens it", "domains": ["(optional)"],
//     "tool": "(optional) the name of the tool it lives in" }
// A thought, a decision, a lesson stays a note. With "entries": "replace" in
// source.json (sources.mjs add --entries replace), the program sends its
// whole list each time, and an item it no longer sends leaves the catalogue.
//
// What it receives: HVBRAIN_SOURCE_SINCE (the date of its last success, empty
// the first time: read only what is newer), HVBRAIN_BRAIN_DIR, HVBRAIN_PLUGIN
// (the plugin's folder), and it runs in its own folder. A key it needs goes in
// the brain's .env, never here.
// Anything printed on the error output is kept as its error; exit with a
// non-zero code when something went wrong: nothing will be written.

const since = process.env.HVBRAIN_SOURCE_SINCE || "";

// ... read the source here, then for each new item:
// console.log(JSON.stringify({ id, title, body }));
`;

const TEMPLATE_CLAUDE = (n, d) => `# ${n}

${d.description ?? ""}

What Claude does for this source during the weekly review, in the brain's language: where to look, what deserves a note, which type and domain, what to never take. Written with the person.

1. ...

Every note goes through the capture skill, as a seed, with \`--source "source:${n}:<identifier>"\`, and is searched first: never twice the same.
`;

if (command === "list") {
  const rows = all().map((n) => {
    const d = def(n);
    const st = state(n);
    return { name: n, kind: d.kind, every: d.every, type: d.type, enabled: d.enabled !== false, paused: d.paused === true, ...(d.live === true ? { live: true } : {}), trusted: ["script", "step"].includes(d.kind) ? trusted(n) : null, due: d.enabled !== false && d.paused !== true && due(n), lastSuccess: st.lastSuccess ?? null, lastError: st.lastError ?? null, notes: Object.keys(readJson(join(DIR, n, "seen.json"), {})).length, description: d.description ?? "" };
  });
  if (args.includes("--json")) out({ ok: true, sources: rows });
  else if (!rows.length) console.log("no source of its own yet");
  else for (const s of rows) console.log(`  ${s.enabled ? "on " : "off"}  ${s.name} (${s.kind}, every ${s.every})${s.paused ? " PAUSED" : ""}${s.trusted === false ? " NOT APPROVED HERE" : ""}  ${s.notes} note(s), last success ${s.lastSuccess?.slice(0, 10) ?? "never"}${s.lastError ? `, error: ${s.lastError}` : ""}`);
} else if (command === "add") {
  if (!name || !SLUG.test(name)) fail("the name of a source: lowercase words without accents, joined by dashes");
  if (existsSync(join(DIR, name))) fail(`the source "${name}" already exists`);
  const kind = opt("--kind");
  const every = opt("--every") ?? "week";
  const type = opt("--type");
  const domains = String(opt("--domains") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!["script", "claude", "step"].includes(kind)) fail("--kind script (it reads by itself), claude (Claude does it during the review) or step (a program that writes no note)");
  if (!["day", "week", "hour"].includes(every) && !/^\d+m$/.test(every)) fail("--every day, week, hour, or minutes such as 15m");
  // THE VAULT ITEMS IT TAKES ITS KEYS FROM (2026-11-21): "needs" was added by
  // hand to source.json after the add. Names only, never a value: while the
  // vault is closed, the source waits for it (vault-queue.mjs).
  const needs = opt("--needs") === undefined ? [] : String(opt("--needs")).split(",").map((x) => x.trim()).filter(Boolean);
  if (args.includes("--needs") && (!needs.length || needs.some((x) => !/^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(x)))) fail("--needs <ITEM>[,<ITEM>]: the names of the vault items the source reads its keys from (letters, digits, _ . -), never a key itself");
  const needed = needs.length ? { needs: [...new Set(needs)] } : {};
  if (kind === "step") {
    const when = opt("--when") ?? "after";
    if (!["before", "after"].includes(when)) fail("--when before (the index is rebuilt after it) or after (once the evening's save is done)");
    const d = { name, description: opt("--description") ?? "", kind, every, when, ...needed, enabled: true, timeoutMin: 5 };
    mkdirSync(join(DIR, name), { recursive: true });
    writeJson(join(DIR, name, "source.json"), d);
    writeFileSync(join(DIR, name, "run.mjs"), TEMPLATE_STEP(name, d), "utf8");
    out({ ok: true, name, kind, when, folder: join(DIR, name).replace(/\\/g, "/"), file: "run.mjs" });
    process.exit(0);
  }
  if (!cfg.types[type]) fail(`--type must be one of this brain's types: ${Object.keys(cfg.types).join(", ")}`);
  if (!domains.length || domains.some((x) => !cfg.domains.includes(x))) fail(`--domains among this brain's domains: ${cfg.domains.join(", ")}`);
  const d = { name, description: opt("--description") ?? "", kind, every, type, domains, updates: args.includes("--updates"), ...(args.includes("--finished") ? { finished: true } : {}), ...(opt("--zones") ? { zones: String(opt("--zones")).split(",").map((z) => z.trim()).filter(Boolean) } : {}), ...(opt("--entries") === "replace" ? { entries: "replace" } : {}), ...needed, enabled: true, timeoutMin: 5 };
  mkdirSync(join(DIR, name), { recursive: true });
  writeJson(join(DIR, name, "source.json"), d);
  if (kind === "script") writeFileSync(join(DIR, name, "run.mjs"), TEMPLATE_SCRIPT(name, d), "utf8");
  else writeFileSync(join(DIR, name, "instructions.md"), TEMPLATE_CLAUDE(name, d), "utf8");
  out({ ok: true, name, kind, folder: join(DIR, name).replace(/\\/g, "/"), file: kind === "script" ? "run.mjs" : "instructions.md" });
} else if (command === "test") {
  if (!def(name)) fail(`no source named "${name}"`);
  if (def(name).kind === "step") fail("a step writes no note: run it once with sources.mjs run <name>, after approving it");
  if (def(name).kind !== "script") fail("a source done by Claude is tested by doing it once, together");
  const x = execute(name);
  if (!x.ok) fail(x.error);
  const seen = readJson(join(DIR, name, "seen.json"), {});
  const slugs = slugIndex();
  const bySource = sourceIndex();
  // A catalogue entry is no note: the run files it in the catalogue, the test must not judge it as one.
  const checked = x.items.filter((i) => i.kind !== "contact" && i.kind !== "zone" && i.kind !== "entry").map((item) => {
    try {
      const note = noteOf(name, item);
      const known = Boolean(seen[String(item.id)]) || bySource().has(note.source);
      const c = known ? { slug: null, folder: null, taken: false } : checkNote(note, cfg, slugs);
      return { id: item.id, title: item.title, ...c, already: known };
    } catch (e) {
      return { id: item.id, title: item.title, refused: e.message };
    }
  });
  out({
    ok: true,
    items: x.items.length,
    contacts: x.items.filter((i) => i.kind === "contact").length,
    zones: x.items.filter((i) => i.kind === "zone").length,
    // What goes to the catalogue rather than to notes (2026-11-23): shown
    // apart, so that the person sees the split before anything is written.
    entries: x.items.filter((i) => i.kind === "entry").length,
    new: checked.filter((c) => !c.refused && !c.already).length,
    refused: [...x.bad, ...checked.filter((c) => c.refused).map((c) => `${c.id}: ${c.refused}`)],
    sample: x.items.filter((i) => !i.kind).slice(0, 3).map((i) => ({ id: i.id, title: i.title, type: i.type ?? def(name).type, body: String(i.body ?? "").slice(0, 300) })),
    entrySample: x.items.filter((i) => i.kind === "entry").slice(0, 3).map((i) => ({ address: i.address, title: i.title, date: i.date, text: String(i.text ?? "").slice(0, 200) })),
  });
} else if (command === "trust") {
  if (!def(name) || !["script", "step"].includes(def(name).kind)) fail(`no script or step named "${name}"`);
  setUserConfig({ trustedSources: { ...(userConfig().trustedSources ?? {}), [trustKey(name)]: scriptHash(name) } });
  out({ ok: true, name, trusted: true });
} else if (command === "run") {
  // Running a source writes notes and state: the runner's work.
  requireRunner(cfg);
  const after = opt("--phase") === "after";
  const inPhase = (d) => (after ? d.kind === "step" && d.when === "after" : d.kind === "script" || (d.kind === "step" && d.when === "before"));
  // Without a name (the evening save, with --due): never a paused source. Named: the person asked.
  const named = Boolean(name && !name.startsWith("--"));
  if (named && !def(name)) fail(`no source named "${name}"`);
  const names = named ? [name] : all().filter((n) => def(n).enabled !== false && def(n).paused !== true && inPhase(def(n)) && (!args.includes("--due") || due(n)));
  // A CLOSED VAULT IS A WAIT (see the top). Asked once, and only when a source
  // of this run names a key; the hub, which has just seen the vault open,
  // says so (HVBRAIN_VAULT_OPEN_AT) rather than have it asked twice.
  const seenOpen = Date.now() - Number(process.env.HVBRAIN_VAULT_OPEN_AT || 0) < 90_000;
  let vault;
  const queued = readQueue() ?? {};
  const runs = [];
  for (const n of names) {
    const d = def(n);
    const needs = [].concat(d.needs ?? []).map(String).filter(Boolean);
    if (needs.length && ["script", "step"].includes(d.kind)) {
      vault ??= seenOpen ? "unlocked" : (vaultState() ?? "none");
      if (vault === "locked") {
        enqueue(n, needs);
        runs.push({ name: n, waiting: "vault" });
        continue;
      }
    }
    runs.push(runOne(n));
    // It ran: it no longer waits (the evening ran a source the hub had queued).
    if (queued[n]) dequeue(n);
  }
  // Without the hub (a brain that only has its evening), nobody else empties
  // the queue of a source that is gone or was disabled.
  if (!named) for (const q of Object.keys(queued)) if (!def(q) || def(q).enabled === false) dequeue(q);
  out({ ok: true, runs });
} else if (command === "mark") {
  if (!def(name)) fail(`no source named "${name}"`);
  const st = readForWrite(join(DIR, name, "state.json"), {});
  if (!st) fail(`sources/${name}/state.json cannot be read: nothing was written over it. Repair that file, or remove it`);
  const now = new Date().toISOString();
  if (args.includes("--ok")) writeJson(join(DIR, name, "state.json"), { ...st, lastRun: now, lastSuccess: now, lastError: null, lastCreated: Number(opt("--created") ?? 0) });
  else writeJson(join(DIR, name, "state.json"), { ...st, lastRun: now, lastError: String(opt("--error") ?? "failed").slice(0, 400) });
  out({ ok: true, name });
} else if (command === "enable" || command === "disable") {
  // Read ONCE, and written from that reading (2026-11-21): the source was
  // read a second time for the write, and a second reading that failed wrote
  // the one changed field as the whole source.json.
  const d = def(name);
  if (!d) fail(`no source named "${name}"`);
  writeJson(join(DIR, name, "source.json"), { ...d, enabled: command === "enable" });
  out({ ok: true, name, enabled: command === "enable" });
} else if (command === "pause" || command === "resume") {
  const d = def(name);
  if (!d) fail(`no source named "${name}"`);
  writeJson(join(DIR, name, "source.json"), { ...d, paused: command === "pause" });
  // In the brain's journal: a live view shows since when a source stands still.
  logEvent({ act: "signal", who: `source:${name}`, what: command === "pause" ? "paused" : "resumed" });
  out({ ok: true, name, paused: command === "pause" });
} else if (command === "install") {
  const lang = isFrench(cfg) ? "fr" : "en";
  const text = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const template = (n) => JSON.parse(text(join(STANDARD, n, "source.json")));
  if (args.includes("--list") || !name) {
    out({ ok: true, standard: Object.entries(PAIRS).map(([n, pair]) => ({ name: n, sources: pair, installed: pair.every((x) => def(x)), description: template(n).description?.[lang] ?? "" })) });
    process.exit(0);
  }
  const pair = PAIRS[name];
  if (!pair) fail(`the standard sources are: ${Object.keys(PAIRS).join(", ")}`);
  // Never on top of something: a source of that name may be the person's own,
  // with its instructions reworked, its pile and its state.
  const taken = pair.filter((n) => existsSync(join(DIR, n)));
  if (taken.length) fail(`already in this brain's sources: ${taken.join(", ")}. Nothing was installed, nothing was overwritten`);
  // THE FIRST PASS OVER THE CONVERSATIONS reads the last two days, not the
  // thirty that Claude Code keeps: on a real brain a conversation judged costs
  // 100 000 to 200 000 tokens, and thirty days of them would cost tens of
  // millions in one go. --days says otherwise (0: only from now on).
  const days = Math.min(30, Math.max(0, Number.isFinite(Number(opt("--days"))) ? Number(opt("--days")) : 2));
  const from = name === "conversations" ? new Date(Date.now() - days * 86400_000).toISOString() : undefined;
  for (const n of pair) {
    const d = template(n);
    d.description = d.description?.[lang] ?? d.description?.en ?? "";
    if (n === "conversations-watch") d.from = from;
    mkdirSync(join(DIR, n), { recursive: true });
    writeJson(join(DIR, n, "source.json"), d);
    if (d.kind === "claude") writeFileSync(join(DIR, n, "instructions.md"), text(join(STANDARD, n, `instructions.${lang}.md`)), "utf8");
    else writeFileSync(join(DIR, n, "run.mjs"), text(join(STANDARD, n, "run.mjs")), "utf8");
    logEvent({ act: "signal", who: `source:${n}`, what: "installed" });
  }
  // THE STEP IS APPROVED HERE, BY THE INSTALL ITSELF. The rule: a program runs
  // only once the person approved it on this computer. An install is asked by
  // the person, on this computer, and the program it puts in the brain is the
  // plugin's own, the very code they installed: that is the approval. What
  // the rule guards against stays guarded: the approval lives in this
  // computer's settings, so the same step arriving by a clone on another
  // computer does not run there, and a step changed since (its fingerprint no
  // longer matches) waits for a new approval.
  const watch = pair[1];
  setUserConfig({ trustedSources: { ...(userConfig().trustedSources ?? {}), [trustKey(watch)]: scriptHash(watch) } });
  // A watched folder is named on the judge's pile by an address of this
  // computer's roots (roots.mjs): the folders watched before today get theirs.
  const folders = name === "documents" ? (cfg.sources?.watch ?? []).filter((f) => existsSync(f)).map((f) => ({ folder: f, ...ensureRoot(f) })) : undefined;
  // What remains to do, for Claude to say in the person's words.
  const remains = [];
  const hub = Boolean(userConfig().routines?.hub);
  if (!hub) remains.push("the program that runs the sources during the day is not on (routines.mjs hub on): until then the pile fills in the evening only, and the judge never reads it");
  // The judge's own key (judge-token.mjs): where one is found, never its value.
  const { tokenState } = await import("./judge-token.mjs");
  const places = tokenState();
  const token = Boolean(places.found);
  if (!token) remains.push(`the judge needs a lasting token for Claude, and none is found on this computer${places.places.vault === "locked" ? " (its Hypervibe vault is locked: it may be in there)" : ""}: the person creates it with \`claude setup-token\` and gives it to \`judge-token.mjs set\` in their own terminal (\`judge-token.mjs window\` opens one for them), never in the conversation; until then the judge fails, says so, and its pile waits`);
  if (folders && !folders.length) remains.push("no folder is watched yet (components.mjs watch add <folder>): the judge has nothing to read until one is");
  if (!isRunner(cfg)) remains.push(`this computer is not the one that runs this brain's sources (${cfg.runner}): on that one, approve the step (sources.mjs trust ${watch})`);
  out({ ok: true, installed: pair, lang, trusted: watch, hub, token, ...(from ? { from } : {}), ...(folders ? { folders } : {}), remains });
} else if (command === "set") {
  const isJudge = (x) => x && x.kind === "claude" && x.live === true;
  // --all (2026-11-17): the same value for every judge, as the start sets one cap for the live reading.
  const names = name === "--all" ? all().filter((n) => isJudge(def(n))) : [name];
  if (name === "--all" ? !names.length : !isJudge(def(name))) fail(name === "--all" ? "this brain has no judge yet (sources.mjs install)" : `no judge named "${name}" (a source of kind "claude" with "live": true)`);
  const [, , field, value] = args;
  if (!["dailyTokens", "catchUp", "proof"].includes(field)) fail("usage: set <judge> dailyTokens <n> (its cap for the day, in tokens; 0: no cap) | catchUp <n> (above that many items on its pile it waits for the person; 0: never) | proof on|off (an item not read to its last page comes back on the pile)");
  // THE PROOF OF READING (2026-11-21, judge.mjs): set by this command rather
  // than by a skill writing source.json by hand. "on" writes "proof": true,
  // "off" takes the line out (a judge without it is believed on its word).
  // Only for a judge whose instructions open each item with the plugin's
  // reader: the skill that calls checks that, this command cannot.
  if (field === "proof") {
    if (!["on", "off"].includes(String(value))) fail("proof is on or off");
    const on = value === "on";
    for (const j of names) {
      const d = def(j);
      if (!isJudge(d)) continue;
      const { proof: _was, ...rest } = d;
      writeJson(join(DIR, j, "source.json"), on ? { ...d, proof: true } : rest);
      logEvent({ act: "signal", who: `source:${j}`, what: "set", field, value: on });
    }
    out({ ok: true, ...(name === "--all" ? { judges: names } : { name }), proof: on });
    process.exit(0);
  }
  const n = Number(value);
  if (value === undefined || String(value).trim() === "" || !Number.isInteger(n) || n < 0) fail(`${field} is a whole number, 0 or more`);
  for (const j of names) {
    // Read once more, and left alone if it cannot be read this time.
    const d = def(j);
    if (!isJudge(d)) continue;
    writeJson(join(DIR, j, "source.json"), { ...d, [field]: n });
    logEvent({ act: "signal", who: `source:${j}`, what: "set", field, value: n });
  }
  out({ ok: true, ...(name === "--all" ? { judges: names } : { name }), [field]: n });
} else if (command === "exclude") {
  const d = def(name);
  if (!d || d.kind !== "claude" || d.live !== true) fail(`no judge named "${name}" (a source of kind "claude" with "live": true): the exclusions are a judge's`);
  const action = args[2] ?? "list";
  const list = (Array.isArray(d.exclude) ? d.exclude : []).filter((p) => typeof p === "string" && p.trim());
  const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const show = (items) => items.slice(0, 50).map((i) => ({ ref: i.ref, title: i.title }));
  if (action === "list") out({ ok: true, exclude: list, removed: 0 });
  else if (action === "add") {
    const { readPattern, excludedBy } = await import("./exclude.mjs");
    const x = readPattern(args[3]?.startsWith("--") ? "" : args[3]);
    if (!x) fail('usage: exclude <judge> add "<pattern>" [--dry]');
    if (x.all) fail("this pattern would leave out everything the judge reads: pause the judge instead (sources.mjs pause)");
    const next = list.some((p) => same(p, x.pattern)) ? list : [...list, x.pattern];
    // What already waits on its pile and matches: taken off unread, and marked
    // seen so that the same version does not come back.
    const { pileOf, setAside } = await import("./judge.mjs");
    const { placesOf } = await import("./watch.mjs");
    const waiting = pileOf(name);
    const places = placesOf(waiting);
    const hit = waiting.filter((i) => excludedBy(next, places.get(i.ref)) !== null);
    if (args.includes("--dry")) out({ ok: true, dry: true, exclude: next, removed: hit.length, items: show(hit) });
    else {
      writeJson(join(DIR, name, "source.json"), { ...d, exclude: next });
      const gone = setAside(name, hit.map((i) => i.ref));
      logEvent({ act: "signal", who: `source:${name}`, what: "exclude", change: "add", pattern: x.pattern, removed: gone.length });
      out({ ok: true, exclude: next, removed: gone.length, items: show(gone) });
    }
  } else if (action === "remove") {
    const pattern = String(args[3] ?? "");
    if (!list.some((p) => same(p, pattern))) fail(`"${pattern}" is not among the exclusions of "${name}": ${list.length ? list.join(" | ") : "it has none"}`);
    const next = list.filter((p) => !same(p, pattern));
    const { exclude: _before, ...rest } = d;
    writeJson(join(DIR, name, "source.json"), next.length ? { ...d, exclude: next } : rest);
    logEvent({ act: "signal", who: `source:${name}`, what: "exclude", change: "remove", pattern: pattern.trim(), removed: 0 });
    out({ ok: true, exclude: next, removed: 0 });
  } else fail('usage: exclude <judge> list | add "<pattern>" [--dry] | remove "<pattern>"');
} else {
  console.log("usage: sources.mjs list | add | test | trust | run | mark | enable | disable | pause | resume | install | set | exclude (see the top of scripts/sources.mjs)");
  process.exitCode = 2;
}
