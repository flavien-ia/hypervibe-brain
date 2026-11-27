// watch.mjs - What the two standard watchers do: they put on a judge's pile
// what just settled (a conversation with Claude, a document of a watched
// folder). No AI, no cost: they only look and list; the judge reads.
//
// The watchers live in the brain as two small steps (sources/conversations-watch,
// sources/documents-watch, installed by `sources.mjs install`), which call this
// file. THE WORK IS HERE, NOT IN THE BRAIN (2026-11-16): an update of the
// plugin repairs every brain at once, and a step that never changes is never
// to approve again.
//
// Each step runs at every tick of its rhythm (the half hour, :00 and :30). A
// conversation counts once quiet for thirty minutes, a document once left
// alone for fifteen minutes; a watched folder is read down to its last level,
// whatever its depth (DEPTH).
//
// Born in the brain this plugin grew from (2026-11-08 and 09), where six days
// of real use set the numbers below; moved here on 2026-11-16.

//
// WHAT A JUDGE MUST NEVER READ (2026-11-17, exclude.mjs): both watchers follow
// the "exclude" of the judge they feed. Nothing excluded reaches a pile.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { PLUGIN_ROOT, ROOT, config, isFrench, userConfig } from "./lib.mjs";
import { add, pileOf } from "./judge.mjs";
import { watchedApproved } from "./trust.mjs";
import { excludedBy, exclusionsOf } from "./exclude.mjs";
import { addressOf } from "./roots.mjs";

const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
const minutes = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d) * 60_000;
const whole = (v, d) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : d);

/** A judge must be there to read what is put on its pile. */
function requireJudge(judge) {
  const def = readJson(join(ROOT, "sources", judge, "source.json"), null);
  if (!def || def.kind !== "claude" || def.live !== true) throw new Error(`no judge named "${judge}" in this brain (a source of kind "claude" with "live": true): install it with sources.mjs install`);
}

/**
 * THE CONVERSATIONS WITH CLAUDE CODE. The person's own conversations (not a
 * sub-agent, not a background run), of three messages or more, settled for
 * `calm` minutes (30), and not read yet up to their last exchange. A
 * conversation taken up again comes back with the date up to which it was
 * read (from the judge's seen.json), so the judge reads only what follows.
 *   from   never a conversation whose last exchange is older (set when the
 *          source is installed: a first pass over thirty days of conversations
 *          would cost millions of tokens in one go)
 *   cap    at most this many put on the pile in one pass (25); the rest at
 *          the next one
 * A conversation of a project the judge excludes (by the project's folder or
 * its name) never reaches the pile: `add` refuses it and marks it seen, so
 * that lifting the exclusion later lets in only what is said from then on.
 * @returns {{ report: string, fresh: number, resumed: number, excluded: number }}
 */
export function watchConversations({ judge = "conversations", calm, from, cap } = {}) {
  requireJudge(judge);
  const floor = Date.parse(from ?? "") || 0;
  const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "readers", "conversation.mjs"), "--list", "--calm", String(minutes(calm, 30) / 60_000), ...(floor ? ["--since", new Date(floor).toISOString()] : [])], { encoding: "utf8", windowsHide: true, timeout: 8 * 60_000, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(String(r.stderr ?? "").trim().slice(0, 400) || "the list of conversations failed");
  const list = JSON.parse(r.stdout);

  // Up to where each conversation was read: the references already judged.
  const readUntil = new Map();
  for (const ref of Object.keys(readJson(join(ROOT, "sources", judge, "seen.json"), {}))) {
    const m = /^claude:\/\/session\/([^#]+)#(.+)$/.exec(ref);
    if (m && (!readUntil.has(m[1]) || m[2] > readUntil.get(m[1]))) readUntil.set(m[1], m[2]);
  }

  const french = isFrench(config());
  const limit = whole(cap, 25);
  let fresh = 0;
  let resumed = 0;
  let more = false;
  let excluded = 0;
  for (const c of list) {
    if (floor && Date.parse(c.modified) < floor) continue;
    const until = readUntil.get(c.id);
    if (until && until >= c.modified) continue;
    if (fresh + resumed >= limit) {
      more = true;
      break;
    }
    const name = String(c.title || (french ? "sans titre" : "untitled")).slice(0, 100);
    // The judge's instructions name this wording ("already read until"): keep the two in step.
    const title = french
      ? `Conversation « ${name} » (${c.messages} messages de la personne)${until ? `, déjà lue jusqu'au ${until}` : ""}`
      : `Conversation "${name}" (${c.messages} messages from the person)${until ? `, already read until ${until}` : ""}`;
    // A newer state of a conversation that already waits replaces it in the pile.
    const a = add(judge, `claude://session/${c.id}#${c.modified}`, title, { replace: true, path: c.cwd, name: c.project });
    if (a.added && !a.replaced) until ? resumed++ : fresh++;
    else if (a.reason === "excluded") excluded++;
  }
  return { fresh, resumed, excluded, report: `conversations: ${list.length} settled, ${fresh} new and ${resumed} taken up again put on the pile of "${judge}"${excluded ? `, ${excluded} left out by its exclusions` : ""}${more ? `, the rest at the next pass (${limit} at a time)` : ""}` };
}

// What a judge can read: Word, PowerPoint, Excel and text with the plugin's
// reader, and a PDF with Claude's own Read tool, which its rules open on the
// watched folders (2026-11-17, judge.mjs: {watch}).
const DOCUMENTS = [".docx", ".pptx", ".xlsx", ".md", ".txt", ".pdf"];
// TO THE BOTTOM (2026-11-20). A watched folder is read with all that is under
// it, however deep: it was six levels, and on a real brain set to four, seventy
// documents of running missions lay lower and were never seen. "depth" in the
// watch's source.json still narrows it for whoever wants to. (A link to a
// folder is not followed: no walk can turn in a circle.)
const DEPTH = Infinity;
const skippedFolder = (name) => name.startsWith(".") || name === "node_modules";
// "~$report.docx" is Word's lock on an open document, not a document.
const skippedFile = (name) => name.startsWith(".") || name.startsWith("~$") || /^(desktop\.ini|thumbs\.db)$/i.test(name);

/**
 * THE DOCUMENTS OF THE WATCHED FOLDERS (brain.json, sources.watch, kept by
 * components.mjs watch add|remove). A document counts once SETTLED: not
 * modified for `settle` minutes (15), so it is read when the person has
 * finished writing it; and NEW: modified since the pass before. A newer
 * version of a document that already waits replaces it in the pile.
 *   since       the date of the last pass (HVBRAIN_SOURCE_SINCE). A first
 *               pass, or a return after more than three days, sends nothing:
 *               never hundreds of documents at once (the weekly review lists
 *               what moved)
 *   cap         at most this many in one pass (25), the latest first
 *   extensions  the kinds of documents taken (Word, PowerPoint, Excel,
 *               markdown, text, PDF)
 *   depth       how many levels of sub-folders are looked into (all of them
 *               when it is not set; 0: only what lies in the watched folder
 *               itself)
 * The reference on the pile is an address of this computer's roots
 * (roots.mjs), with the document's modification date as its version:
 * "writing://2026/plan.docx#2026-11-16T10:00:00.000Z".
 * What the judge excludes is not even looked at: neither a document, nor
 * what lies under an excluded folder.
 * @returns {{ report: string, fresh: number, replaced: number, excluded: number }}
 */
export function watchDocuments({ judge = "documents", since, settle, cap, extensions, depth } = {}) {
  requireJudge(judge);
  // Only the folders the person approved on this computer (trust.mjs): one that arrived with the brain waits.
  const watched = watchedApproved((config().sources?.watch ?? []).map(String));
  if (!watched.length) return { fresh: 0, replaced: 0, report: "documents: no folder is watched (components.mjs watch add <folder>)" };
  const settled = minutes(settle, 15);
  const from = (Date.parse(since ?? "") || NaN) - settled;
  if (!Number.isFinite(from) || Date.now() - from > 3 * 86400_000) {
    return { fresh: 0, replaced: 0, report: `documents: ${Number.isFinite(from) ? "back after more than three days" : "first pass"}, nothing sent to the judge this time (the weekly review lists what moved)` };
  }
  const { found, excluded, noAddress, missing } = changedDocuments(judge, watched, { from, settled, extensions, depth });
  const french = isFrench(config());
  const limit = whole(cap, 25);
  let fresh = 0;
  let replaced = 0;
  for (const d of found.slice(0, limit)) {
    const a = add(judge, d.ref, `${french ? "Document : " : "Document: "}${d.name}`, { replace: true, path: d.path });
    if (a.added) a.replaced ? replaced++ : fresh++;
  }
  const more = [
    found.length > limit ? `${found.length - limit} more left to the weekly review (${limit} at a time)` : "",
    excluded ? `${excluded} changed document(s) left out by its exclusions` : "",
    noAddress ? `${noAddress} document(s) skipped, in a folder without a name on this computer (components.mjs watch add <folder> gives it one)` : "",
    missing ? `${missing} watched folder(s) not found on this computer` : "",
  ].filter(Boolean);
  return { fresh, replaced, excluded, report: `documents: ${fresh} new and ${replaced} newer version(s) put on the pile of "${judge}"${more.length ? `; ${more.join("; ")}` : ""}` };
}

/**
 * The documents of the watched folders changed after `from` and settled,
 * the latest first: what the watcher sends, and what the first big session
 * counts (documentsBacklog). What the judge excludes is not even looked at.
 */
function changedDocuments(judge, watched, { from, settled, extensions, depth }) {
  const maxDepth = depth !== undefined && depth !== null && depth !== "" && Number.isInteger(Number(depth)) && Number(depth) >= 0 ? Number(depth) : DEPTH;
  const patterns = exclusionsOf(judge);
  // The roots of this computer, read once for the whole walk (they were read
  // from the settings file for each folder and each file).
  const roots = userConfig().sourceRoots ?? {};
  const leftOut = (p) => patterns.length > 0 && excludedBy(patterns, { path: p, address: addressOf(p, roots) ?? undefined }) !== null;
  let excluded = 0;
  const kinds = new Set((Array.isArray(extensions) && extensions.length ? extensions : DOCUMENTS).map((e) => String(e).toLowerCase()));
  const brain = resolve(ROOT);
  const found = [];
  let noAddress = 0;
  const take = (p) => {
    if (!kinds.has(extname(p).toLowerCase())) return;
    let mtime = 0;
    try {
      mtime = statSync(p).mtimeMs;
    } catch {
      return; // gone meanwhile
    }
    if (mtime <= from || Date.now() - mtime < settled) return;
    if (leftOut(p)) {
      excluded++;
      return;
    }
    const address = addressOf(p, roots);
    if (!address) noAddress++;
    else found.push({ ref: `${address}#${new Date(mtime).toISOString()}`, name: basename(p), mtime, path: p });
  };
  const walk = (dir, level) => {
    // The brain's own notes are not documents to judge: it would read itself.
    const rel = relative(brain, dir);
    if (level > maxDepth || rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) return;
    // An excluded folder: nothing under it is looked at.
    if (leftOut(dir)) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // locked, or offline: the next pass
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!skippedFolder(e.name)) walk(join(dir, e.name), level + 1);
      } else if (!skippedFile(e.name)) take(join(dir, e.name));
    }
  };
  let missing = 0;
  for (const w of watched) {
    if (!existsSync(w)) missing++;
    else if (statSync(w).isDirectory()) walk(resolve(w), 0);
    else take(resolve(w));
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return { found, excluded, noAddress, missing };
}

// ------------------------------------ what already exists (2026-11-17)
// THE FIRST BIG SESSION of a brain (/brain:start, phase 2) reads what was
// there before it: the conversations Claude Code still keeps, the documents
// of the watched folders. It is counted FIRST, so that its cost is said and
// agreed before anything is read; `put` then puts it on the judges' piles,
// where it waits like any catch-up (judge.mjs: a judge holds a pile of more
// than "catchUp" items until the person has answered).

/**
 * The settled conversations of the last `days` days (30 at most: Claude Code
 * keeps no more) that the judge has not read to their end. `waiting`: those
 * already on its pile. With `put`, they are put on the pile, all of them.
 * @returns {{ items: number, waiting: number, days: number, put?: number }}
 */
export function conversationsBacklog({ judge = "conversations", days = 30, calm, put = false } = {}) {
  const span = Math.min(30, Math.max(1, Number(days) || 30));
  const from = new Date(Date.now() - span * 86400_000).toISOString();
  if (put) {
    const r = watchConversations({ judge, calm, from, cap: 100_000 });
    return { items: r.fresh + r.resumed, waiting: pileOf(judge).length, days: span, put: r.fresh + r.resumed };
  }
  const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "readers", "conversation.mjs"), "--list", "--calm", String(minutes(calm, 30) / 60_000), "--since", from], { encoding: "utf8", windowsHide: true, timeout: 8 * 60_000, maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(String(r.stderr ?? "").trim().slice(0, 400) || "the list of conversations failed");
  const seen = Object.keys(readJson(join(ROOT, "sources", judge, "seen.json"), {}));
  const readUntil = new Map();
  for (const ref of seen) {
    const m = /^claude:\/\/session\/([^#]+)#(.+)$/.exec(ref);
    if (m && (!readUntil.has(m[1]) || m[2] > readUntil.get(m[1]))) readUntil.set(m[1], m[2]);
  }
  const patterns = exclusionsOf(judge);
  const onPile = new Set(pileOf(judge).map((i) => String(i.ref)));
  let items = 0;
  let waiting = 0;
  for (const c of JSON.parse(r.stdout)) {
    if (Date.parse(c.modified) < Date.parse(from)) continue;
    const until = readUntil.get(c.id);
    if (until && until >= c.modified) continue;
    const ref = `claude://session/${c.id}#${c.modified}`;
    if (patterns.length && excludedBy(patterns, { path: c.cwd, name: c.project, address: ref }) !== null) continue;
    if (onPile.has(ref)) waiting++;
    else items++;
  }
  return { items, waiting, days: span };
}

/**
 * The documents of the watched folders changed in the last `days` days that
 * the judge has neither read nor on its pile, with the settings of its
 * watcher (`extensions`, `depth`, `settle`). With `put`, they are put on the
 * pile, all of them, the latest first.
 * @returns {{ items: number, waiting: number, days: number, folders: number, put?: number }}
 */
export function documentsBacklog({ judge = "documents", days = 30, settle, extensions, depth, put = false } = {}) {
  const span = Math.max(1, Number(days) || 30);
  // Only the folders the person approved on this computer (trust.mjs): one that arrived with the brain waits.
  const watched = watchedApproved((config().sources?.watch ?? []).map(String));
  if (!watched.length) return { items: 0, waiting: 0, days: span, folders: 0 };
  if (put) requireJudge(judge);
  const { found } = changedDocuments(judge, watched, { from: Date.now() - span * 86400_000, settled: minutes(settle, 15), extensions, depth });
  const seen = readJson(join(ROOT, "sources", judge, "seen.json"), {});
  const onPile = new Set(pileOf(judge).map((i) => String(i.ref)));
  const fresh = found.filter((d) => !seen[d.ref] && !onPile.has(d.ref));
  const out = { items: fresh.length, waiting: onPile.size, days: span, folders: watched.length };
  if (!put) return out;
  const french = isFrench(config());
  let done = 0;
  for (const d of fresh) if (add(judge, d.ref, `${french ? "Document : " : "Document: "}${d.name}`, { replace: true, path: d.path }).added) done++;
  return { ...out, waiting: pileOf(judge).length, put: done };
}

/**
 * WHERE EACH WAITING ITEM COMES FROM, for an exclusion added while it already
 * waits (sources.mjs exclude add): its path, its name, its address. What the
 * watcher wrote on the item is taken as it is; an item put on the pile before
 * 2026-11-17 has none, and is found again from its reference: a conversation
 * by its reader (the folder of its project), a document by its root.
 * @param {{ ref: string, path?: string, name?: string }[]} items
 * @returns {Map<string, { path?: string, name?: string, address: string }>}
 */
export function placesOf(items) {
  const out = new Map();
  const roots = userConfig().sourceRoots ?? {};
  const sessions = new Map();
  for (const i of items) {
    const ref = String(i.ref);
    const place = { address: ref, ...(i.path ? { path: String(i.path) } : {}), ...(i.name ? { name: String(i.name) } : {}) };
    out.set(ref, place);
    if (place.path) continue;
    const bare = ref.includes("#") ? ref.slice(0, ref.lastIndexOf("#")) : ref;
    const m = /^([a-z][a-z0-9+.-]+):\/\/(.*)$/i.exec(bare);
    if (!m) continue;
    if (m[1] === "claude" && m[2].startsWith("session/")) sessions.set(m[2].slice("session/".length), place);
    else if (roots[m[1]]) {
      try {
        place.path = resolve(String(roots[m[1]]), decodeURIComponent(m[2]));
      } catch {
        // an address that cannot be read back: its address alone is matched
      }
    }
  }
  if (sessions.size) {
    const r = spawnSync(process.execPath, [join(PLUGIN_ROOT, "scripts", "readers", "conversation.mjs"), "--where", ...sessions.keys()], { encoding: "utf8", windowsHide: true, timeout: 5 * 60_000, maxBuffer: 32 * 1024 * 1024 });
    let found = [];
    try {
      found = r.status === 0 ? JSON.parse(r.stdout) : [];
    } catch {
      found = [];
    }
    for (const c of found) {
      const place = sessions.get(c.id);
      if (!place) continue;
      if (c.cwd) place.path = c.cwd;
      if (c.project) place.name = c.project;
    }
  }
  return out;
}
