#!/usr/bin/env node
// ledger.mjs - One source of writings, counted item by item until none is left.
//
//   node scripts/ledger.mjs open <name> --from <folder or file> [--since YYYY-MM-DD]
//   node scripts/ledger.mjs open <name> --list <file>      one item per line (web addresses, titles)
//   node scripts/ledger.mjs state [<name>]                 counted, with a note, set aside, left
//   node scripts/ledger.mjs next <name> [--n 10]           the next items to bring in
//   node scripts/ledger.mjs done <name> <item> --note <slug>
//   node scripts/ledger.mjs skip <name> <item> --why "<the reason>"
//   node scripts/ledger.mjs close <name> [--agreed] [--leave "<the person's words>"]
//
// WHY (2026-11-17). Bringing a folder of eighty texts into a brain is long, and
// a model gets tired before the folder does: it writes twenty notes, says the
// source is in, and ticks it. Nothing counted. A ledger lists every item when
// the source is opened; an item leaves the list by a FACT, never by a word:
//
//   note      a note of the brain names it as its source (found by itself at
//             each call), or `done` names the note that took it in (an
//             existing note enriched): that note must exist
//   skipped   set aside with its reason, in words the person can read
//
// `close` refuses while one item is left, unless the person leaves the rest
// (`--leave`, with their words), and refuses to hide what was set aside: the
// reasons are shown to the person first (`--agreed`).
//
// The ledger lives in the brain (sources/_ingest/<name>.json), saved with it:
// a source begun on one computer is taken up again on another.
// `<item>` is its number in the ledger, or its reference.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { HOME, ROOT, readJsonFile, readVault, requireBrain, withFileLock, writeFileAtomic } from "./lib.mjs";
import { addressOf } from "./roots.mjs";

/** The kinds of files counted as one writing each. */
export const WRITTEN = new Set([".md", ".txt", ".docx", ".doc", ".odt", ".rtf", ".pdf", ".pptx", ".html"]);
const LIMIT = 5000;
const DIR = () => join(ROOT, "sources", "_ingest");
const fwd = (p) => String(p).replace(/\\/g, "/");
const slugOf = (s) => String(s).normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
const fileOf = (name) => join(DIR(), `${slugOf(name)}.json`);
/**
 * Two ways of writing the same place are the same place: one kind of slash, no
 * case, and no fragment at the end of an ADDRESS (scheme://...#part). Never at
 * the end of a path of the disk: "Chapitre #1.docx" and "Chapitre #2.docx"
 * were one and the same item (2026-11-21), so one note took every chapter out
 * of the list unread. (In an address made from a root, a "#" of a file's name
 * is written %23, roots.mjs: a bare "#" there can only open a fragment.)
 */
const same = (s) => {
  const t = fwd(String(s ?? ""));
  return (/^[a-z][a-z0-9+.-]*:\/\//i.test(t) && !/^file:/i.test(t) ? t.replace(/#[^/]*$/, "") : t).replace(/^file:\/\/\/?/i, "").replace(/\/+$/, "").toLowerCase();
};

/**
 * The writings of a folder (or the file itself), oldest path first: the same
 * walk the first count of a brain makes (start.mjs), so both give one number.
 * @param {string} place
 * @param {{ since?: number }} [o]
 * @returns {string[]} absolute paths
 */
export function written(place, { since = 0 } = {}) {
  const out = [];
  const take = (p) => {
    if (!WRITTEN.has(extname(p).toLowerCase())) return;
    if (since) {
      try {
        if (statSync(p).mtimeMs < since) return;
      } catch {
        return;
      }
    }
    out.push(fwd(p));
  };
  const walk = (d, level) => {
    if (level > 6 || out.length >= LIMIT) return;
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= LIMIT) return;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      if (e.isDirectory()) walk(join(d, e.name), level + 1);
      else take(join(d, e.name));
    }
  };
  try {
    if (statSync(place).isDirectory()) walk(place, 0);
    else take(place);
  } catch {
    return [];
  }
  return out;
}

// A LEDGER THAT CANNOT BE READ IS NOT A LEDGER THAT DOES NOT EXIST (2026-11-21):
// read at the instant another reader wrote it, it came back as "none", and
// `open` then started a new count over the old one. It is written beside and
// renamed, a file that is there and unreadable stops the command, and two
// readers working side by side take turns (a `done` and a `skip` at the same
// moment: the second one wrote the list it had read, without the first one's).
const read = (name) => {
  const r = readJsonFile(fileOf(name), null);
  if (r.missing) return null;
  if (!r.ok || !Array.isArray(r.value?.items)) throw new Error(`the ledger ${slugOf(name)} is there and cannot be read (${r.error ?? "it holds no list of items"}): it was not touched`);
  return r.value;
};
const write = (ledger) => writeFileAtomic(fileOf(ledger.name), `${JSON.stringify(ledger, null, 1)}\n`);
/** One at a time on a ledger, and an unreadable one answered as a refusal. (The lock lives outside the brain: nothing to save.) */
const held = (name, fn) => {
  try {
    return withFileLock(join(HOME, ".hypervibe-brain", `ledger-${slugOf(name)}.lock`), fn, { wait: 10_000, stale: 120_000, anyway: true }).value;
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

/**
 * What the brain itself says: an item still to do whose reference (or path) a
 * note names as its source has its note; an item said to have a note that is
 * gone is to do again. Returns true when something moved.
 */
function settle(ledger) {
  const bySource = new Map();
  const slugs = new Set();
  const vault = readVault();
  for (const f of vault.fiches) {
    const slug = f.slug;
    if (slug) slugs.add(slug);
    for (const s of [f.fm?.source].flat().filter(Boolean)) if (!bySource.has(same(s))) bySource.set(same(s), slug);
  }
  // A note that cannot be read right now (being written, a front matter to
  // repair) is still there: its item is not sent back to do, its name kept.
  for (const e of vault.errors) slugs.add(String(e.rel).split("/").pop().replace(/\.md$/, ""));
  let moved = false;
  for (const i of ledger.items) {
    if (i.state === "note" && !slugs.has(i.note)) {
      i.state = "todo";
      delete i.note;
      moved = true;
    }
    if (i.state !== "todo") continue;
    const slug = bySource.get(same(i.ref)) ?? (i.path ? bySource.get(same(i.path)) : undefined);
    if (slug) {
      i.state = "note";
      i.note = slug;
      moved = true;
    }
  }
  return moved;
}

/**
 * THE NOTES A SOURCE ADDED (2026-11-23). The start shows, for each source it
 * brings in, how many notes of the brain came from it: the notes that name
 * one of its items as their source (by its reference or its path, the same
 * way `settle` finds them). A note that names two items counts once. What it
 * does not count: an existing note that took an item in without naming it
 * (`done --note`, an enriched note), and a fact added to a note (it names its
 * source in its line, not in the note's head).
 * @returns {Map<string, Set<string>>} a source, as `same` writes it -> the slugs that name it
 */
export function namedSources() {
  const by = new Map();
  for (const f of readVault().fiches) {
    for (const s of [f.fm?.source].flat().filter(Boolean)) {
      const k = same(s);
      if (!by.has(k)) by.set(k, new Set());
      by.get(k).add(f.slug);
    }
  }
  return by;
}

/**
 * How many distinct notes name one of these references as their source.
 * @param {string[]} refs
 * @param {Map<string, Set<string>>} [named] namedSources(), when the caller already has it
 */
export function notesNaming(refs, named = namedSources()) {
  const slugs = new Set();
  for (const r of refs) for (const slug of named.get(same(r)) ?? []) slugs.add(slug);
  return slugs.size;
}

/** The figures of a ledger: what the person is told, and what `close` decides on. `named`: also the notes it added (`fiches`). */
function figures(ledger, named) {
  const of = (state) => ledger.items.filter((i) => i.state === state);
  const reasons = {};
  for (const i of of("skipped")) reasons[i.why] = (reasons[i.why] ?? 0) + 1;
  return {
    name: ledger.name,
    ...(ledger.from ? { from: ledger.from } : {}),
    counted: ledger.items.length,
    notes: of("note").length,
    skipped: of("skipped").length,
    ...(of("skipped").length ? { reasons } : {}),
    left: of("todo").length,
    ...(named ? { fiches: notesNaming(ledger.items.flatMap((i) => [i.ref, ...(i.path ? [i.path] : [])]), named) } : {}),
    ...(ledger.closed ? { closed: ledger.closed, ...(ledger.leftUnread ? { leftUnread: ledger.leftUnread, why: ledger.leave } : {}) } : {}),
  };
}

/** Every ledger of this brain, settled: for the first big session and the status. */
export function ledgers() {
  let names = [];
  try {
    names = readdirSync(DIR()).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
  if (!names.length) return [];
  // (Read once for every ledger, and only when there is one.)
  let seen = null;
  const named = () => (seen ??= namedSources());
  const quiet = (n) => {
    try {
      return read(n);
    } catch {
      return null; // unreadable right now: it cannot be counted, and is not touched
    }
  };
  return names.map((n) => {
    const seen = quiet(n);
    if (!seen || seen.closed || !settle(seen)) return seen;
    // Something moved: written from the ledger as it is under the lock.
    return held(n, () => {
      const l = read(n);
      if (l && !l.closed && settle(l)) write(l);
      return l;
    });
  }).filter((l) => l && Array.isArray(l.items)).map((l) => figures(l, named()));
}

/**
 * Every item of the ledgers whose name starts with `prefix`, as each ledger
 * holds it (memory.mjs: a file archived that no ledger lists is found there).
 * @returns {{ ledger: string, ref: string, path?: string, state: string }[]}
 */
export function listed(prefix = "") {
  let names = [];
  try {
    names = readdirSync(DIR()).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  } catch {
    return [];
  }
  const out = [];
  for (const n of names.filter((x) => x.startsWith(prefix))) {
    let l = null;
    try {
      l = read(n);
    } catch {
      l = null;
    }
    for (const i of l?.items ?? []) out.push({ ledger: n, ref: i.ref, ...(i.path ? { path: i.path } : {}), state: i.state });
  }
  return out;
}

/** Opens a source's ledger, or takes it up again: what is new in the folder is added, nothing is forgotten. */
export function open(name, o = {}) {
  if (!slugOf(name)) return { ok: false, error: "a ledger needs a name: the source's, in a word or two" };
  return held(name, () => openHeld(name, o));
}
function openHeld(name, { from, list, since, items } = {}) {
  const before = read(name);
  const ledger = before ?? { name: slugOf(name), opened: new Date().toISOString(), items: [] };
  let refs = [];
  // (Items given as they are, each with its reference and its file: the memory
  // of the person's AI, whose files are of any kind, memory.mjs.)
  if (Array.isArray(items)) refs = items.filter((i) => i?.ref).map((i) => ({ ref: String(i.ref), ...(i.path ? { path: String(i.path) } : {}) }));
  else if (list) {
    try {
      refs = readFileSync(list, "utf8").split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((ref) => ({ ref }));
    } catch (e) {
      return { ok: false, error: `cannot read the list ${list} (${e.code ?? e.message})` };
    }
  } else if (from) {
    const place = resolve(from);
    if (!existsSync(place)) return { ok: false, error: `nothing at ${fwd(place)} on this computer` };
    ledger.from = fwd(place);
    refs = written(place, { since: since ? Date.parse(since) || 0 : 0 }).map((p) => ({ ref: addressOf(p) ?? p, path: p }));
  } else if (!before) return { ok: false, error: "open <name> --from <folder or file> | --list <file with one item per line>" };
  const known = new Set(ledger.items.flatMap((i) => [same(i.ref), ...(i.path ? [same(i.path)] : [])]));
  let added = 0;
  for (const r of refs) {
    if (known.has(same(r.ref)) || (r.path && known.has(same(r.path)))) continue;
    ledger.items.push({ n: ledger.items.length + 1, ...r, state: "todo" });
    added++;
  }
  // A source taken up again is open again: what it gained is to bring in.
  if (added && ledger.closed) {
    delete ledger.closed;
    delete ledger.leftUnread;
    delete ledger.leave;
  }
  settle(ledger);
  write(ledger);
  return { ok: true, ...(before ? { resumed: true } : {}), added, ...figures(ledger), ...(refs.length >= LIMIT ? { cut: LIMIT } : {}) };
}

const find = (ledger, item) => ledger.items.find((i) => String(i.n) === String(item) || same(i.ref) === same(item) || (i.path && same(i.path) === same(item)));

const mark = (name, item, patch) => held(name, () => markHeld(name, item, patch));
function markHeld(name, item, patch) {
  const ledger = read(name);
  if (!ledger) return { ok: false, error: `no ledger named ${slugOf(name)} (ledger.mjs open)` };
  const i = find(ledger, item);
  if (!i) return { ok: false, error: `no item ${item} in the ledger ${ledger.name}` };
  if (patch.state === "note") {
    const slugs = new Set(readVault().fiches.map((f) => f.slug));
    if (!patch.note || !slugs.has(patch.note)) return { ok: false, error: `no note named ${patch.note ?? "(none)"} in the brain: an item is done by the note that took it in` };
    delete i.why;
  }
  if (patch.state === "skipped") {
    if (!patch.why || patch.why.trim().length < 3) return { ok: false, error: 'an item is set aside with its reason, in words the person can read (--why "a shopping list")' };
    delete i.note;
  }
  Object.assign(i, patch);
  settle(ledger);
  write(ledger);
  return { ok: true, item: i.n, ...figures(ledger) };
}

/** The next items to bring in, in the ledger's order. */
export function next(name, n = 10) {
  return held(name, () => nextHeld(name, n));
}
function nextHeld(name, n) {
  const ledger = read(name);
  if (!ledger) return { ok: false, error: `no ledger named ${slugOf(name)} (ledger.mjs open)` };
  if (settle(ledger)) write(ledger);
  return { ok: true, ...figures(ledger), next: ledger.items.filter((i) => i.state === "todo").slice(0, Math.max(1, n)).map((i) => ({ n: i.n, ref: i.ref, ...(i.path ? { path: i.path } : {}) })) };
}

/**
 * Closes a source. Refused while items are left, unless the person leaves
 * them (their words are kept, with the number left unread); refused while
 * what was set aside has not been shown to them (`agreed`).
 */
export function close(name, o = {}) {
  return held(name, () => closeHeld(name, o));
}
function closeHeld(name, { agreed = false, leave = "" } = {}) {
  const ledger = read(name);
  if (!ledger) return { ok: false, error: `no ledger named ${slugOf(name)} (ledger.mjs open)` };
  settle(ledger);
  const f = figures(ledger);
  if (f.left && !leave.trim()) {
    write(ledger);
    return { ok: false, error: `${f.left} item(s) of ${f.counted} are left: go on (ledger.mjs next ${ledger.name}), or, if the person stops here, close with --leave and their words`, ...f };
  }
  if (f.skipped && !agreed) {
    write(ledger);
    return { ok: false, error: `${f.skipped} item(s) were set aside: tell the person how many for each reason, then close with --agreed`, ...f };
  }
  ledger.closed = new Date().toISOString();
  if (f.left) {
    ledger.leftUnread = f.left;
    ledger.leave = leave.trim();
  }
  write(ledger);
  return { ok: true, ...figures(ledger) };
}

const isMain = process.argv[1] && fwd(process.argv[1]).endsWith("/scripts/ledger.mjs");
if (isMain) {
  requireBrain();
  const a = process.argv.slice(2);
  const opt = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : undefined);
  const out = (o) => {
    console.log(JSON.stringify(o));
    process.exit(o.ok === false ? 1 : 0);
  };
  if (a[0] === "open" && a[1]) out(open(a[1], { from: opt("--from"), list: opt("--list"), since: opt("--since") }));
  else if (a[0] === "state") out(a[1] && !a[1].startsWith("--") ? next(a[1], 1) : { ok: true, ledgers: ledgers() });
  else if (a[0] === "next" && a[1]) out(next(a[1], Number(opt("--n")) || 10));
  else if (a[0] === "done" && a[1] && a[2]) out(mark(a[1], a[2], { state: "note", note: opt("--note") }));
  else if (a[0] === "skip" && a[1] && a[2]) out(mark(a[1], a[2], { state: "skipped", why: opt("--why") }));
  else if (a[0] === "close" && a[1]) out(close(a[1], { agreed: a.includes("--agreed"), leave: opt("--leave") ?? "" }));
  else {
    console.log("usage: ledger.mjs open <name> --from <folder> | --list <file> | state [<name>] | next <name> [--n 10] | done <name> <item> --note <slug> | skip <name> <item> --why <reason> | close <name> [--agreed] [--leave <words>] (see the top of scripts/ledger.mjs)");
    process.exit(1);
  }
}
