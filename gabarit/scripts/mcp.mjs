#!/usr/bin/env node
// mcp.mjs - The brain as an MCP server: what lets Claude read it, from any
// folder, in any session.
//
// The protocol is spoken by hand (JSON-RPC, one message per line on stdin and
// stdout) rather than through the SDK: five read-only tools do not justify a
// dependency, and a brain with nothing to install cannot break on install.
// Nothing here writes a note: Claude writes through the capture skill, where
// the person sees what is written.
//
// STDOUT IS THE PROTOCOL. Nothing else may ever be printed on it.
//
//   node scripts/mcp.mjs              serve (Claude starts it by itself)
//   node scripts/mcp.mjs --self-test  run each tool once and print the results

import { createInterface } from "node:readline";
import { config } from "./lib.mjs";
import { freshDb, get, neighbors, search, stats, timeline } from "./engine.mjs";

const NAME = (() => {
  try {
    return config().name || "brain";
  } catch {
    return "brain";
  }
})();

const TOOLS = [
  {
    name: "brain_search",
    description: `Search ${NAME}'s second brain (their notes, ideas, projects, people, publications). Full text by default: every word must appear, anywhere, accents ignored. Set meaning=true to search by meaning when the notes may use other words than the question. Returns slugs to open with brain_get.`,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for" },
        meaning: { type: "boolean", description: "Search by meaning instead of by words" },
        limit: { type: "number", description: "How many results (default 10)" },
        type: { type: "string", description: "Only this type: idea, concept, note, project, person, organization, publication, event, source" },
        domain: { type: "string", description: "Only this domain" },
      },
      required: ["query"],
    },
    run: (db, a) => search(db, a.query, { semantic: Boolean(a.meaning), limit: a.limit, type: a.type, domain: a.domain }),
  },
  {
    name: "brain_get",
    description: "Open one note of the second brain: its full text, where it comes from (source), how trustworthy it is (status: seed = written by a machine and not yet validated, trusted = validated), its links and the notes that link to it.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
    run: (db, a) => get(db, a.slug) ?? { error: `no note named "${a.slug}": search for it with brain_search` },
  },
  {
    name: "brain_neighbors",
    description: "What surrounds a note: the notes it links to, the notes that link to it, and the closest notes by meaning. Use it to understand a context rather than a single fact.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, limit: { type: "number" } }, required: ["slug"] },
    run: (db, a) => neighbors(db, a.slug, { limit: a.limit }) ?? { error: `no note named "${a.slug}"` },
  },
  {
    name: "brain_timeline",
    description: "The notes in the order of time (most recent first), optionally between two dates (YYYY, YYYY-MM or YYYY-MM-DD) or of one type.",
    inputSchema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" }, type: { type: "string" }, limit: { type: "number" } } },
    run: (db, a) => timeline(db, a),
  },
  {
    name: "brain_stats",
    description: "The state of the second brain: how many notes, by type, domain and status, and whether search by meaning is available.",
    inputSchema: { type: "object", properties: {} },
    run: (db) => stats(db),
  },
];

// One call at a time: two refreshes of the index in parallel would race.
let queue = Promise.resolve();
function call(name, args) {
  const p = queue.then(() => callNow(name, args));
  queue = p.catch(() => {});
  return p;
}

async function callNow(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`unknown tool ${name}`);
  const { db, warning } = await freshDb();
  try {
    const result = await tool.run(db, args ?? {});
    return warning ? { warning, result } : result;
  } finally {
    db.close();
  }
}

if (process.argv.includes("--self-test")) {
  for (const [name, a] of [["brain_stats", {}], ["brain_search", { query: "a" }], ["brain_timeline", { limit: 3 }]]) {
    try {
      console.log(`${name}: ${JSON.stringify(await call(name, a)).slice(0, 300)}`);
    } catch (e) {
      console.log(`${name}: ERROR ${e.message}`);
      process.exitCode = 1;
    }
  }
} else {
  const send = (msg) => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", async (line) => {
    if (!line.trim()) return;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return send({ id: null, error: { code: -32700, message: "parse error" } });
    }
    const { id, method, params } = msg;
    if (id === undefined || id === null) return; // a notification: nothing to answer
    try {
      if (method === "initialize") {
        send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: `${NAME}-brain`, version: "1.0.0" } } });
      } else if (method === "ping") send({ id, result: {} });
      else if (method === "tools/list") send({ id, result: { tools: TOOLS.map(({ run, ...t }) => t) } });
      else if (method === "tools/call") {
        try {
          const result = await call(params?.name, params?.arguments);
          send({ id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 1) }] } });
        } catch (e) {
          send({ id, result: { content: [{ type: "text", text: e.message }], isError: true } });
        }
      } else send({ id, error: { code: -32601, message: `method not found: ${method}` } });
    } catch (e) {
      send({ id, error: { code: -32603, message: e.message } });
    }
  });
}
