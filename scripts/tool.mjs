#!/usr/bin/env node
// tool.mjs - Runs ONE question of the MCP server, in a fresh process.
//
// Why a process per question: the server starts with the Claude session, and
// the brain may be created during that very session (/brain:create).
// A long-lived process would keep the settings it read at start and see no
// brain until the next session. A fresh process reads them each time; it
// costs a fraction of a second.
//
//   node scripts/tool.mjs <tool name>     (arguments as JSON on stdin; result as JSON on stdout)

import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { hasBrain, readsFile } from "./lib.mjs";
import { freshDb, get, neighbors, search, stats, timeline } from "./engine.mjs";
import { readDirectory, searchDirectory } from "./directory.mjs";

const RUN = {
  brain_search: (db, a) => search(db, a.query, { semantic: Boolean(a.meaning), limit: a.limit, type: a.type, domain: a.domain, everything: Boolean(a.everything) }),
  brain_get: (db, a) => get(db, a.slug) ?? { error: `no note named "${a.slug}": search for it with brain_search` },
  brain_neighbors: (db, a) => neighbors(db, a.slug, { limit: a.limit, everything: Boolean(a.everything) }) ?? { error: `no note named "${a.slug}"` },
  brain_timeline: (db, a) => timeline(db, a),
  brain_stats: (db) => stats(db),
  // The directory is data, not notes: it is read from its file, not the index.
  brain_contact: (db, a) => {
    const dir = readDirectory();
    if (!dir.contacts.length) return { error: "this brain has no contacts directory yet: /brain:contacts sets it up" };
    return { generated: dir.generated, found: searchDirectory(dir, a.query ?? "", { limit: a.limit ?? 15 }) };
  },
};

const name = process.argv[2];
let args = {};
try {
  args = JSON.parse(readFileSync(0, "utf8") || "{}");
} catch {
  args = {};
}

try {
  if (!RUN[name]) throw new Error(`unknown tool ${name}`);
  if (!hasBrain()) {
    console.log(JSON.stringify({ ok: true, result: { error: "no second brain is set up on this computer yet: the person can create one with /brain:create" } }));
  } else {
    const { db, warning } = await freshDb();
    try {
      const result = await RUN[name](db, args);
      console.log(JSON.stringify({ ok: true, result: warning ? { warning, result } : result }));
      // What Claude read: a seed read is a seed that serves (see review.mjs).
      const read = name === "brain_get" && result && !result.error ? [args.slug] : name === "brain_search" && Array.isArray(result) ? result.slice(0, 5).map((r) => r.slug) : [];
      if (read.length) {
        try {
          const at = new Date().toISOString();
          mkdirSync(dirname(readsFile()), { recursive: true });
          appendFileSync(readsFile(), read.map((slug) => JSON.stringify({ at, tool: name, slug })).join("\n") + "\n", "utf8");
        } catch {
          // a comfort, not a guarantee
        }
      }
    } finally {
      db.close();
    }
  }
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
}
