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
import { TOOLS, instructionsFor } from "./tools.mjs";

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
      send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "hyperbrain", version: "1.0.0" }, instructions: instructionsFor(brainInfo()?.name ?? null) } });
    } else if (method === "ping") send({ id, result: {} });
    else if (method === "tools/list") send({ id, result: { tools: TOOLS } });
    else if (method === "tools/call") {
      if (!TOOLS.some((t) => t.name === params?.name)) return send({ id, result: { content: [{ type: "text", text: `unknown tool ${params?.name}` }], isError: true } });
      const r = await call(params.name, params.arguments);
      send({ id, result: r.ok ? { content: [{ type: "text", text: JSON.stringify(r.result, null, 1) }] } : { content: [{ type: "text", text: r.error }], isError: true } });
    } else send({ id, error: { code: -32601, message: `method not found: ${method}` } });
  });
}
