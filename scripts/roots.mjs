// roots.mjs - A file of this computer as an address that stays the same on
// every computer: "writing://2026/plan.docx".
//
// A note says where it comes from (`source`), and a judge's pile names what
// awaits judging. A path of the disk ("C:/Users/me/Documents/Writing/plan.docx")
// is right on one computer only: on the other one the weekly review would
// report the source as gone. So a folder the person works in gets a ROOT: a
// short name for it in THIS computer's settings (~/.hypervibe-brain/config.json,
// "sourceRoots": { "writing": "C:/Users/me/Documents/Writing" }), never in the
// brain. The address is the root's name, then the path inside it. The readers
// (readers/document.mjs), the review and brain_fetch already follow such
// addresses.
//
// HOW A WATCHED FOLDER GETS ITS NAME (2026-11-16): when the person asks for it
// to be watched (components.mjs watch add), and when the standard documents
// source is installed (sources.mjs install documents) for the folders watched
// before. A root that already holds the folder is used as it is (the deepest
// one); otherwise a root is made, named after the folder. Never by a program
// that runs in the background: a watcher only reads the roots.

import { existsSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { config, setUserConfig, userConfig } from "./lib.mjs";

/** A root's name as every reader of addresses accepts it: two characters at least. */
const NAME = /^[a-z][a-z0-9+.-]+$/;
/** Names that already mean something else in a note's source. */
const RESERVED = new Set(["http", "https", "file", "ftp", "mail", "mailto", "gmail", "claude", "source", "data"]);
const fwd = (p) => resolve(String(p)).replace(/\\/g, "/");
const inside = (root, p) => {
  const rel = relative(root, p);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};

// The three characters that would cut an address short are written as in a
// URL (% # ?); a space and an accent stay as they are, readable, as in the
// addresses real brains already hold. The readers decode what they find.
const encode = (segment) => segment.replace(/[%#?]/g, (c) => encodeURIComponent(c));

/**
 * The address of a file or folder of this computer, under the deepest root
 * that holds it. Null when no root holds it.
 * @param {string} path
 * @param {Record<string, string>} [roots]
 */
export function addressOf(path, roots = userConfig().sourceRoots ?? {}) {
  const abs = resolve(String(path));
  let best = null;
  for (const [scheme, root] of Object.entries(roots)) {
    if (!root || !NAME.test(scheme)) continue;
    const r = resolve(String(root));
    if (inside(r, abs) && (!best || r.length > best.root.length)) best = { scheme, root: r };
  }
  if (!best) return null;
  return `${best.scheme}://${relative(best.root, abs).split(sep).filter(Boolean).map(encode).join("/")}`;
}

/** A name for a root, from the folder's own name: lowercase, no accent, dashes. */
function nameFor(dir) {
  const s = basename(dir).normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return /^[a-z]/.test(s) && s.length > 1 ? s : `folder${s ? `-${s}` : ""}`;
}

/**
 * Makes sure a folder of this computer has a root, and says which. A file is
 * given the root of the folder it lives in.
 * @param {string} folder
 * @returns {{ scheme: string, root: string, created: boolean }}
 */
export function ensureRoot(folder) {
  let dir = resolve(String(folder));
  if (existsSync(dir) && !statSync(dir).isDirectory()) dir = dirname(dir);
  const roots = { ...(userConfig().sourceRoots ?? {}) };
  const held = addressOf(dir, roots);
  if (held) {
    const scheme = held.slice(0, held.indexOf("://"));
    return { scheme, root: fwd(roots[scheme]), created: false };
  }
  // Never the name of a tool the brain routes its data to (brain.json, data).
  let tools = {};
  try {
    tools = config().data ?? {};
  } catch {
    tools = {};
  }
  const base = nameFor(dir);
  let scheme = base;
  let created = true;
  let root = fwd(dir);
  // Named and added from the roots as they are at the write (2026-11-21): two
  // programs that each gave a folder its root at the same moment wrote the
  // list they had read, and the second one erased the first one's root. (The
  // same folder given its root by two programs at once gets one root.)
  setUserConfig((current) => {
    const now = { ...(current.sourceRoots ?? {}) };
    const meanwhile = addressOf(dir, now);
    if (meanwhile) {
      scheme = meanwhile.slice(0, meanwhile.indexOf("://"));
      root = fwd(now[scheme]);
      created = false;
      return {};
    }
    scheme = base;
    for (let i = 2; now[scheme] || RESERVED.has(scheme) || tools[scheme]; i++) scheme = `${base}-${i}`;
    return { sourceRoots: { ...now, [scheme]: fwd(dir) } };
  });
  return { scheme, root, created };
}
