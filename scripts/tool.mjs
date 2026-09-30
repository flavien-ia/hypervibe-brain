#!/usr/bin/env node
// tool.mjs - Runs ONE question of the MCP server, in a fresh process.
//
// Why a process per question: the server starts with the Claude session, and
// the brain may be created during that very session (/hyperbrain:create-brain).
// A long-lived process would keep the settings it read at start and see no
// brain until the next session. A fresh process reads them each time; it
// costs a fraction of a second.
//
//   node scripts/tool.mjs <tool name>     (arguments as JSON on stdin; result as JSON on stdout)

import { readFileSync } from "node:fs";
import { hasBrain } from "./lib.mjs";
import { freshDb, get, neighbors, search, stats, timeline } from "./engine.mjs";
import { readDirectory, searchDirectory } from "./directory.mjs";

const RUN = {
  brain_search: (db, a) => search(db, a.query, { semantic: Boolean(a.meaning), limit: a.limit, type: a.type, domain: a.domain }),
  brain_get: (db, a) => get(db, a.slug) ?? { error: `no note named "${a.slug}": search for it with brain_search` },
  brain_neighbors: (db, a) => neighbors(db, a.slug, { limit: a.limit }) ?? { error: `no note named "${a.slug}"` },
  brain_timeline: (db, a) => timeline(db, a),
  brain_stats: (db) => stats(db),
  // The directory is data, not notes: it is read from its file, not the index.
  brain_contact: (db, a) => {
    const dir = readDirectory();
    if (!dir.contacts.length) return { error: "this brain has no contacts directory yet: /hyperbrain:brain-contacts sets it up" };
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
    console.log(JSON.stringify({ ok: true, result: { error: "no second brain is set up on this computer yet: the person can create one with /hyperbrain:create-brain" } }));
  } else {
    const { db, warning } = await freshDb();
    try {
      const result = await RUN[name](db, args);
      console.log(JSON.stringify({ ok: true, result: warning ? { warning, result } : result }));
    } finally {
      db.close();
    }
  }
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: e.message }));
}
