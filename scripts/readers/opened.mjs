// readers/opened.mjs - What a judge really opened, kept as a fact.
//
// WHY (2026-11-17). A judge was handed five conversations, and when its run
// ended well all five were counted as read: on its word. A model that reads
// three and stops says the same closing line. The readers now leave a trace of
// each item a judge opens, and of how far it went in it; judge.mjs counts as
// read what the trace shows read to the last page, and leaves the rest on the
// pile.
//
// Written only for a judge (HVBRAIN_WHO = ai:<name>): a person reading in a
// conversation leaves nothing. One file a judge, emptied before each run.
// Never throws: a reading must not fail because its trace could not be kept.

import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** One item, however it is written: a conversation by its id, a document by its address without its version. */
export const keyOf = (ref) => {
  const s = String(ref ?? "").trim();
  const session = /^claude:\/\/session\/([^#]+)/.exec(s);
  if (session) return `claude://session/${session[1]}`;
  let bare = s.replace(/#[^/\\]*$/, "");
  try {
    bare = decodeURIComponent(bare);
  } catch {
    // a % that encodes nothing: the address as it is written
  }
  return bare.replace(/\\/g, "/").toLowerCase();
};

/** The trace file of a judge (judge.mjs reads and empties it). */
export const openedFile = (judge, home = process.env.HVBRAIN_HOME || homedir()) => join(home, ".hypervibe-brain", "judge", `${String(judge).replace(/[^a-z0-9_-]/gi, "")}.opened`);

/**
 * Notes that the judge at work opened this item, at this page of that many.
 * @param {string} ref
 * @param {number} [page]
 * @param {number} [pages]
 */
export function opened(ref, page = 1, pages = 1) {
  const judge = /^ai:(.+)$/.exec(process.env.HVBRAIN_WHO ?? "")?.[1];
  if (!judge) return;
  try {
    const file = openedFile(judge);
    mkdirSync(join(file, ".."), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ key: keyOf(ref), page, pages })}\n`, "utf8");
  } catch {
    // no room, no right: this run will not prove what it read, and reads again
  }
}
