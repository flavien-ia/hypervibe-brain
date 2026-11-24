// before.mjs - What a note said before the machine changed it, kept so that
// this change, and only it, can be taken back.
//
// WHY (2026-11-17). To undo a change, undo.mjs reversed "the first save after
// the write". That was exact while each write had its own save. Since the hub
// saves once an hour at most, one save can carry several writes of the same
// note: undoing one took the others back with it, without a word. A change is
// now undone from what it was itself: the note's text before, and after.
//
// Kept on this computer (~/.hypervibe-brain/undo/<event id>.json), never in the
// brain: it is the machine's own scaffolding, and the note's real history is in
// git. Sixty days, as long as the journal keeps a write in front of the person.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME } from "./lib.mjs";

const DIR = () => join(HOME, ".hypervibe-brain", "undo");
const KEPT_MS = 60 * 86400_000;
const lf = (s) => String(s ?? "").replace(/\r\n/g, "\n");

/**
 * Keeps what a write changed. Never throws: a write must not fail because its
 * undo could not be prepared (it then falls back on the saves, as before).
 * @param {string | null} id the event of the write in the journal
 * @param {string} rel the note, from the brain's folder
 * @param {string} before the note's whole text before the write
 * @param {string} after its whole text after
 */
export function keepBefore(id, rel, before, after) {
  if (!id || lf(before) === lf(after)) return;
  try {
    mkdirSync(DIR(), { recursive: true });
    writeFileSync(join(DIR(), `${id}.json`), JSON.stringify({ rel, before: lf(before), after: lf(after) }), "utf8");
    prune();
  } catch {
    // no room, no right: this write will be undone from the saves
  }
}

/**
 * Keeps the whole text of a note about to be removed (the undo of a creation),
 * beside what the writes changed and for as long. A note the machine created
 * may never have been saved (a judge's seed waits up to an hour for its
 * commit): removed then, git had nothing of it (2026-11-21).
 * @param {string} id the event of the creation being undone
 * @returns {string | null} the file that holds it, or null when it could not be kept
 */
export function keepRemoved(id, rel, text) {
  try {
    mkdirSync(DIR(), { recursive: true });
    const file = join(DIR(), `${String(id).replace(/[^a-z0-9]/gi, "")}-removed.json`);
    writeFileSync(file, JSON.stringify({ rel, removed: new Date().toISOString(), text: String(text ?? "") }), "utf8");
    return file;
  } catch {
    return null;
  }
}

/** What a write changed, or null when it was not kept (an older write, another computer). */
export function readBefore(id) {
  try {
    const o = JSON.parse(readFileSync(join(DIR(), `${String(id).replace(/[^a-z0-9]/gi, "")}.json`), "utf8"));
    return typeof o?.before === "string" && typeof o?.after === "string" ? o : null;
  } catch {
    return null;
  }
}

/** Once a day at most: what is older than sixty days leaves. */
function prune() {
  const mark = join(DIR(), ".pruned");
  try {
    if (existsSync(mark) && Date.now() - statSync(mark).mtimeMs < 86400_000) return;
    writeFileSync(mark, "", "utf8");
    for (const f of readdirSync(DIR())) {
      if (!f.endsWith(".json")) continue;
      const p = join(DIR(), f);
      if (Date.now() - statSync(p).mtimeMs > KEPT_MS) rmSync(p, { force: true });
    }
  } catch {
    // a comfort
  }
}
