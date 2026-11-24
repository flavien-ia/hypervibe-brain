// exclude.mjs - What a judge must never read (2026-11-17).
//
// A judge reads what lands on its pile: every conversation with Claude, every
// document of a watched folder. Some of it is not for it: the work done for a
// client under a confidentiality clause, an archive, a kind of file. The
// source.json of a JUDGE lists what to leave out:
//
//   "exclude": ["0. OLD", "client-*", "*.xlsx", "C:/Work/Secret/", "dropbox://Clients/X/"]
//
// ONE RULE, THE SAME FOR EVERY KIND OF ITEM. An item has a path (a document's
// path on this computer; for a conversation, the folder of its project), an
// address when it has one ("dropbox://Clients/X/plan.docx"), and sometimes a
// name of its own (for a conversation, the name Claude Code gives its project).
//
//   A pattern WITHOUT a slash   matches ONE SEGMENT, by its name: any folder
//                               on the way, or the file itself, in the path
//                               or in the address, or the item's own name.
//                               Never case-sensitive; "*" stands for any run
//                               of characters. "0. OLD" leaves out everything
//                               under a folder of that name wherever it is,
//                               "client-*" every project or folder whose name
//                               starts so, "*.xlsx" every Excel workbook.
//   A pattern WITH a slash      is the START of a path or of an address, cut
//                               at a folder: "C:/Work/Secret/" leaves out the
//                               folder and all it holds, never
//                               "C:/Work/Secretary". Not case-sensitive on
//                               Windows; "\" and "/" are the same; "*" is not
//                               special here.
//
// Applied BEFORE anything reaches a pile: `add` (judge.mjs) refuses an excluded
// item whoever calls it, and the two standard watchers (watch.mjs) do not even
// look inside an excluded folder. A person's own watcher gives the item's path
// to `add` (`{ path }`, or `--path` on the command line), or asks first:
//
//   import { excluded } from "<plugin>/scripts/exclude.mjs";
//   if (excluded("conversations", { path: cwd, address: ref })) continue;
//
// The list is kept by `sources.mjs exclude <judge> list | add | remove`.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";

const WINDOWS = process.platform === "win32";

/** "\" as "/", doubled slashes as one; the "://" of an address and the "//" of a network share stay. */
function slashes(s) {
  const t = String(s ?? "").trim().normalize("NFC").replaceAll("\\", "/");
  const m = /^([a-z][a-z0-9+.-]+:\/\/|\/\/)?(.*)$/is.exec(t);
  return `${m[1] ?? ""}${m[2].replace(/\/{2,}/g, "/")}`;
}
/** An address without its version ("#2026-11-17T..."), as the watchers write them. */
const bare = (address) => {
  const s = String(address ?? "");
  return s.includes("#") ? s.slice(0, s.lastIndexOf("#")) : s;
};
/** The three characters an address writes as in a URL (roots.mjs), read back. */
const decoded = (s) => s.replace(/%(25|23|3F)/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
const segments = (s) => s.replace(/^[a-z][a-z0-9+.-]+:\/\//i, "").split("/").filter(Boolean);
const literal = (s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
const glob = (pattern) => new RegExp("^" + pattern.split("*").map(literal).join(".*") + "$", "iu");
const under = (whole, start) => {
  const [w, s] = WINDOWS ? [whole.toLowerCase(), start.toLowerCase()] : [whole, start];
  return w === s || w.startsWith(`${s}/`);
};

/**
 * A pattern as it is kept: trimmed, or null when it says nothing. `all` is
 * true for one that would leave out everything (only stars, only a slash).
 */
export function readPattern(raw) {
  const p = String(raw ?? "").trim().normalize("NFC");
  if (!p) return null;
  const prefix = /[\\/]/.test(p);
  const start = prefix ? slashes(p).replace(/\/+$/, "") : "";
  return { pattern: p, prefix, start, all: prefix ? start === "" : /^\*+$/.test(p) };
}

/**
 * Does one of the patterns leave this item out? Returns the pattern, or null.
 * @param {string[]} patterns
 * @param {{ path?: string, address?: string, name?: string }} item
 */
export function excludedBy(patterns, { path, address, name } = {}) {
  if (!Array.isArray(patterns) || !patterns.length) return null;
  const p = path ? slashes(path).replace(/\/+$/, "") : "";
  const a = address ? slashes(bare(address)).replace(/\/+$/, "") : "";
  // An address is tried as written and as read back: a person types "100%", the address says "100%25".
  const wholes = [p, a, a && decoded(a)].filter(Boolean);
  const names = [...new Set([...wholes.flatMap(segments), ...(name ? [String(name).normalize("NFC")] : [])])];
  for (const raw of patterns) {
    const x = readPattern(raw);
    if (!x) continue;
    if (x.prefix ? x.start !== "" && wholes.some((w) => under(w, x.start)) : names.some((n) => glob(x.pattern).test(n))) return x.pattern;
  }
  return null;
}

/** The patterns of a judge, from its source.json. */
export function exclusionsOf(judge) {
  try {
    const list = JSON.parse(readFileSync(join(ROOT, "sources", String(judge), "source.json"), "utf8")).exclude;
    return Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.trim()) : [];
  } catch {
    return [];
  }
}

/**
 * Is this item left out of what the judge reads? For a watcher of the
 * person's own: ask before putting anything on the pile.
 * @param {string} judge the judge's name
 * @param {{ path?: string, address?: string, name?: string }} item
 */
export const excluded = (judge, item) => excludedBy(exclusionsOf(judge), item) !== null;
