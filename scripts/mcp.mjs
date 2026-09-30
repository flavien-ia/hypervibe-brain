#!/usr/bin/env node
// mcp.mjs - The brain as an MCP server: what lets Claude read it, from any
// folder, in any session. Declared by the plugin itself (.mcp.json): nothing
// to write into the person's Claude configuration.
//
// The protocol is spoken by hand (JSON-RPC, one message per line on stdin and
// stdout) rather than through the SDK: five read-only tools do not justify a
// dependency, and a plugin with nothing to install cannot break on install.
// Each question runs in a fresh process (tool.mjs): see why there.
// Nothing here writes a note: Claude writes through the capture skill, where
// the person sees what is written.
//
// STDOUT IS THE PROTOCOL. Nothing else may ever be printed on it.
//
//   node scripts/mcp.mjs              serve (Claude starts it by itself)
//   node scripts/mcp.mjs --self-test  run each tool once and print the results

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { userConfig } from "./lib.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "tool.mjs");

/** Read fresh each time: the brain may be created after the server started. */
function brainInfo() {
  const dir = process.env.HYPERBRAIN_DIR || userConfig().brain;
  if (!dir || !existsSync(join(dir, "hyperbrain.json"))) return null;
  try {
    return { dir, name: JSON.parse(readFileSync(join(dir, "hyperbrain.json"), "utf8")).name || "The person" };
  } catch {
    return null;
  }
}

/**
 * What every session is told about the brain, through the MCP handshake: the
 * plugin never edits the person's CLAUDE.md, the server says it itself.
 */
function instructions() {
  const b = brainInfo();
  if (!b) {
    return "Hyperbrain is installed but no second brain is set up on this computer yet. If the person talks about a second brain, notes to keep or ideas to remember, suggest /hyperbrain:start-hyperbrain (checks the prerequisites) then /hyperbrain:create-brain.";
  }
  return [
    `${b.name} has a second brain: their ideas, projects, the people who matter to them, their publications and decisions, as linked notes.`,
    `Query it WITHOUT BEING ASKED whenever an answer depends on what ${b.name} thinks, has already written or decided, or on who they know: before writing in their voice, summarising one of their positions, or talking about one of their projects. Search by words first, then by meaning (meaning: true) if nothing comes up.`,
    "Read it by its rules: a `trusted` note can be quoted as it is; a `seed` was written by a machine and not validated yet, handle it with care and say so; follow the `source` before asserting anything important.",
    "Write to it ONLY through the /hyperbrain:brain skill (capture), never by writing a file by hand.",
  ].join(" ");
}

const TOOLS = [
  {
    name: "brain_search",
    description: "Search the person's second brain (their notes, ideas, projects, people, publications). Full text by default: every word must appear, anywhere, accents ignored. Set meaning=true to search by meaning when the notes may use other words than the question. Returns slugs to open with brain_get.",
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
  },
  {
    name: "brain_get",
    description: "Open one note of the second brain: its full text, where it comes from (source), how trustworthy it is (status: seed = written by a machine and not yet validated, trusted = validated), its links and the notes that link to it.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "brain_neighbors",
    description: "What surrounds a note: the notes it links to, the notes that link to it, and the closest notes by meaning. Use it to understand a context rather than a single fact.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, limit: { type: "number" } }, required: ["slug"] },
  },
  {
    name: "brain_timeline",
    description: "The notes in the order of time (most recent first), optionally between two dates (YYYY, YYYY-MM or YYYY-MM-DD) or of one type.",
    inputSchema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" }, type: { type: "string" }, limit: { type: "number" } } },
  },
  {
    name: "brain_stats",
    description: "The state of the second brain: how many notes, by type, domain and status, and whether search by meaning is available.",
    inputSchema: { type: "object", properties: {} },
  },
];

function runTool(name, args) {
  return new Promise((res) => {
    const child = spawn(process.execPath, [TOOL, name], { windowsHide: true, env: process.env });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.resume(); // warnings of node:sqlite, never on our stdout
    const timer = setTimeout(() => child.kill(), 5 * 60_000);
    child.on("close", () => {
      clearTimeout(timer);
      try {
        res(JSON.parse(out.trim().split("\n").pop()));
      } catch {
        res({ ok: false, error: "the brain did not answer (see the plugin's scripts/tool.mjs)" });
      }
    });
    child.stdin.end(JSON.stringify(args ?? {}));
  });
}

// One question at a time: two refreshes of the index in parallel would race.
let queue = Promise.resolve();
function call(name, args) {
  const p = queue.then(() => runTool(name, args));
  queue = p.catch(() => {});
  return p;
}

if (process.argv.includes("--self-test")) {
  console.log(`brain: ${brainInfo()?.dir ?? "none"}`);
  for (const [name, a] of [["brain_stats", {}], ["brain_search", { query: "a" }], ["brain_timeline", { limit: 3 }]]) {
    const r = await call(name, a);
    console.log(`${name}: ${r.ok ? JSON.stringify(r.result).slice(0, 300) : `ERROR ${r.error}`}`);
    if (!r.ok) process.exitCode = 1;
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
    if (method === "initialize") {
      send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hyperbrain", version: "1.0.0" }, instructions: instructions() } });
    } else if (method === "ping") send({ id, result: {} });
    else if (method === "tools/list") send({ id, result: { tools: TOOLS } });
    else if (method === "tools/call") {
      if (!TOOLS.some((t) => t.name === params?.name)) return send({ id, result: { content: [{ type: "text", text: `unknown tool ${params?.name}` }], isError: true } });
      const r = await call(params.name, params.arguments);
      send({ id, result: r.ok ? { content: [{ type: "text", text: JSON.stringify(r.result, null, 1) }] } : { content: [{ type: "text", text: r.error }], isError: true } });
    } else send({ id, error: { code: -32601, message: `method not found: ${method}` } });
  });
}
