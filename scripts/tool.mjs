#!/usr/bin/env node
// tool.mjs - Answers ONE question of the MCP server.
//
// Two ways to run it. The MCP server (mcp.mjs) calls `answer` in its own
// process: it stays up for the whole conversation and keeps the index's
// vectors in memory, so a question no longer pays for starting a program and
// reloading 9,000 vectors (3 to 6 seconds a search, measured on 2026-11-05).
// When no brain existed as the server started (one is being created in this
// very session, /brain:create), the server runs this file in a fresh process
// instead, which reads the settings anew each time:
//
//   node scripts/tool.mjs <tool name>     (arguments as JSON on stdin; result as JSON on stdout)

import { appendFileSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasBrain } from "./lib.mjs";
import { logEvent } from "./journal.mjs";
import { FULL_BODY, FULL_LINKS, TIMELINE_MAX, filterProblem, freshDb, get, lastSearch, neighbors, nextSteps, refreshVectors, search, stats, timeline } from "./engine.mjs";
import { readDirectory, searchDirectory } from "./directory.mjs";
import { fetchAddress, shorten } from "./fetch.mjs";
import { LINKS_LIMIT } from "./pure.mjs";

// What an AI receives by default is kept light: a note's text up to a few
// thousand characters (most notes fit whole), at most 20 links each way. The
// rest is one argument away (full: true, then offset for a very long note),
// and the answer says what was left.
const LINKS = LINKS_LIMIT;

// THE BACKGROUND READS ITS NOTES SHORT (2026-11-23). Nine reads of a note in
// ten are the brain's own work (a judge checking what the brain already
// knows, HVBRAIN_WHO=ai:<source>): the head of a note and a few links tell it
// that, the whole text rarely. Measured over two days: 6,500 characters a
// read at the median, for 2,500 that would do. The person's conversations
// keep the whole default: their AI opens a note because it needs its text,
// and a second call would cost more than it saves. Any reader asks more with
// full: true, or offset.
const BRIEF_BODY = 2500;
const BRIEF_LINKS = 8;

// NO ANSWER WITHOUT AN END (2026-11-21). Only brain_search was bounded: a
// timeline of 5,000 notes, a contact search of a thousand people or a whole
// API response came back as they were, up to what the client refuses. Each
// tool now has its own bound (engine.mjs, fetch.mjs), and whatever still
// comes out larger than this is cut here, with what was left said in it.
const MAX_ANSWER = 80_000;
const fit = (result) => shorten(result, MAX_ANSWER);

const RUN = {
  // A filter this brain does not have answers with the values it has, not with an empty list.
  brain_search: (db, a) => filterProblem(db, a) ?? search(db, a.query, { by: a.words ? "words" : a.meaning ? "meaning" : a.by, limit: a.limit, type: a.type, domain: a.domain, nature: a.nature, entries: a.entries !== false, everything: Boolean(a.everything) }),
  brain_get: (db, a, ctx = {}) => {
    const brief = Boolean(ctx.background) && !a.full;
    const f = get(db, a.slug, { full: Boolean(a.full), maxLinks: a.full ? FULL_LINKS : brief ? BRIEF_LINKS : LINKS, offset: a.offset, bodyLimit: FULL_BODY, brief: brief ? BRIEF_BODY : 0 });
    if (!f) return { error: `no note named "${a.slug}": search for it with brain_search` };
    // Where to go next, measured against the question of the conversation's
    // last search (engine.mjs, nextSteps). Every note has them, a private
    // one too (2026-11-21: the AI reads the whole brain).
    // The background does not walk from note to note: no next steps for it.
    const next = brief ? [] : nextSteps(db, a.slug, { query: lastSearch.qv });
    if (next.length) f.next = next;
    return f;
  },
  brain_neighbors: (db, a) => neighbors(db, a.slug, { limit: a.limit, everything: Boolean(a.everything), maxLinks: LINKS }) ?? { error: `no note named "${a.slug}"` },
  brain_timeline: (db, a) => {
    const problem = filterProblem(db, { type: a.type });
    if (problem) return problem;
    const rows = timeline(db, a);
    // Asked for more than a call gives: the answer says so, and how to go on.
    return Number(a.limit) > TIMELINE_MAX && rows.length === TIMELINE_MAX ? { cut: { shown: rows.length, more: `at most ${TIMELINE_MAX} notes a call: narrow with since and until (the oldest shown is of ${rows.at(-1).created})` }, result: rows } : rows;
  },
  // The data a note routes to, read where it lives (fetch.mjs): read only.
  brain_fetch: (db, a) => fetchAddress(String(a.address ?? "")),
  brain_stats: (db) => stats(db),
  // The directory is data, not notes: it is read from its file, not the index.
  brain_contact: (db, a) => {
    const dir = readDirectory();
    if (!dir.contacts.length) return { error: "this brain has no contacts directory yet: /brain:contacts sets it up" };
    const limit = Math.floor(Number(a.limit));
    return { generated: dir.generated, found: searchDirectory(dir, a.query ?? "", { limit: Number.isFinite(limit) && limit >= 1 ? Math.min(limit, 100) : 15 }) };
  },
};

export const TOOL_NAMES = Object.keys(RUN);

/**
 * One question, answered. `who` says which AI and which conversation ask (the
 * reads journal). The index is brought up to date for the text alone, and the
 * vectors owed are computed right after by a program of its own (engine.mjs,
 * refreshVectors): the answer never waits for the embeddings API, whether the
 * caller stays up (`resident`: the MCP server) or answers one question and
 * leaves. Returns { ok, result, how } or { ok: false, error }.
 */
export async function answer(name, args = {}, { who = {}, resident = false } = {}) {
  try {
    if (!RUN[name]) throw new Error(`unknown tool ${name}`);
    if (!hasBrain()) return { ok: true, result: { error: "no second brain is set up on this computer yet: the person can create one with /brain:create" } };
    const { db, warning, owed, buildError } = await freshDb({ vectors: false, resident });
    let out;
    try {
      const result = fit(await RUN[name](db, args, { background: Boolean(who.background) }));
      // How the search went (engine.mjs), for the usage journal of mcp.mjs: on
      // the side, never in what the AI reads. `buildError`: why the index
      // could not be refreshed before this answer, when it could not.
      const how = { ...(name === "brain_search" ? { by: lastSearch.by, cached: lastSearch.cached, note: lastSearch.note ?? undefined, n: Array.isArray(result) ? result.length : undefined } : {}), ...(buildError ? { buildError } : {}) };
      out = { ok: true, result: warning ? { warning, result } : result, how };
      // What Claude read: a seed read is a seed that serves (see review.mjs).
      const read = name === "brain_fetch" && result && !result.error ? [String(args.address)] : name === "brain_get" && result && !result.error ? [args.slug] : name === "brain_search" && Array.isArray(result) ? result.slice(0, 5).map((r) => r.slug ?? r.address) : [];
      if (read.length) {
        // The brain's journal (journal.mjs): which notes, never what the
        // question was about. `client` and `conv` (see mcp.mjs): which AI, which conversation.
        logEvent({ act: "read", who: `ai:${who.conv || "?"}`, client: who.client || undefined, tool: name, notes: read, ...(who.background ? { background: true } : {}) });
      }
    } finally {
      db.close();
    }
    if (owed) refreshVectors();
    return out;
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// Run as a program: one question, in a fresh process.
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  let args = {};
  try {
    args = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    args = {};
  }
  const r = await answer(process.argv[2], args, { who: { client: process.env.HVBRAIN_CLIENT, conv: process.env.HVBRAIN_CONV, background: /^ai:/.test(process.env.HVBRAIN_WHO ?? "") } });
  console.log(JSON.stringify(r));
}
