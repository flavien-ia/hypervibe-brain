// journal.mjs - The work journal, shared by the person's computers.
//
// The Stop hook (hook-journal.mjs) notes, on each computer, in which project
// the person works with Claude: one line per session and per six hours, in
// ~/.hypervibe-brain/journal.jsonl, outside the brain (it is written at every
// answer, the brain's folder would never be at rest).
//
// Each evening, the save folds this computer's new lines into the brain, in
// journal/<computer>.jsonl, with the title Claude gave each session: one file
// per computer, written by it alone, so two computers never conflict, and the
// synchronisation brings the other computer's work to the weekly review.

import { appendFileSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, closeSync } from "node:fs";
import { join } from "node:path";
import { HOME, ROOT, computerName } from "./lib.mjs";

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
  const local = lines(LOCAL_JOURNAL());
  if (!local.length) return 0;
  const file = join(DIR(), `${computerName()}.jsonl`);
  const last = lines(file).reduce((m, e) => (String(e.t) > m ? String(e.t) : m), "");
  const fresh = local.filter((e) => String(e.t) > last);
  if (!fresh.length) return 0;
  mkdirSync(DIR(), { recursive: true });
  appendFileSync(
    file,
    fresh.map((e) => `${JSON.stringify({ t: e.t, type: "session", project: e.project, cwd: e.cwd, session: e.session, title: e.title ?? sessionTitle(e.transcript) ?? undefined })}\n`).join(""),
    "utf8",
  );
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
  if (existsSync(DIR())) {
    for (const f of readdirSync(DIR()).filter((n) => n.endsWith(".jsonl"))) {
      const computer = f.slice(0, -6);
      for (const e of lines(join(DIR(), f))) {
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
