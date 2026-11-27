#!/usr/bin/env node
// mcp.mjs - The brain as an MCP server: what lets Claude read it, from any
// folder, in any session. Declared by the plugin itself (.mcp.json): nothing
// to write into the person's Claude configuration.
//
// The protocol is spoken by hand (JSON-RPC, one message per line on stdin and
// stdout) rather than through the SDK: seven read-only tools do not justify a
// dependency, and a plugin with nothing to install cannot break on install.
// Each question is answered inside this process (tool.mjs, answer), which
// keeps the index's vectors in memory for the whole conversation; only when
// no brain existed as the server started does a question run in a fresh
// process, which reads the settings anew (see tool.mjs).
// Nothing here writes a note: Claude writes through the capture skill, where
// the person sees what is written.
// To an AI that is not Claude Code, it also serves the skills of the brain's
// executive floor: as MCP prompts, and through an eighth tool, brain_skill,
// translated for that AI (skills-mcp.mjs). Claude Code finds them by itself.
//
// STDOUT IS THE PROTOCOL. Nothing else may ever be printed on it.
//
//   node scripts/mcp.mjs              serve (Claude starts it by itself)
//   node scripts/mcp.mjs --self-test  run three tools once (stats, search, timeline) and print the results

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAIN, HOME, userConfig } from "./lib.mjs";
import { LOCAL_TOOLS as TOOLS, instructionsFor } from "./tools.mjs";
import { SKILL_TOOL, listSkills, nativeClient, promptGet, promptList, skillTool, skillsSentence } from "./skills-mcp.mjs";

// The brain's rules in the person's global CLAUDE.md (rules-block.mjs): kept
// current by the server itself, at each start, with the plugin of the day.
// Only once a brain exists, never twice the same text, never a failure.
if (BRAIN && process.env.HVBRAIN_RULES_BLOCK !== "off") {
  import("./rules-block.mjs").then((m) => m.writeRulesBlock()).catch(() => {});
}

// The computer's own journals keep ninety days (lib.mjs, purgeLocalJournals):
// looked at once a day at most, a few seconds after the start, never in the way.
setTimeout(() => import("./lib.mjs").then((m) => m.purgeLocalJournals()).catch(() => {}), 5000).unref();

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "tool.mjs");

/** Read fresh each time: the brain may be created after the server started. */
function brainInfo() {
  const dir = process.env.HVBRAIN_DIR || userConfig().brain;
  if (!dir || !existsSync(join(dir, "brain.json"))) return null;
  try {
    return { dir, name: JSON.parse(readFileSync(join(dir, "brain.json"), "utf8")).name || "The person" };
  } catch {
    return null;
  }
}

// Who is asking: the AI's own name, given when it connects (claude-code,
// codex-mcp-client...), and this server's process number, unique to the
// conversation that started it. Written in the reads journal, so that a live
// view can say which conversation reads which note.
let client = "";

// THE SKILLS FOR ANOTHER AI (2026-11-23, skills-mcp.mjs): the executive
// floor's skills, as prompts and through brain_skill, for an AI that is not
// Claude Code (which finds them by itself, through its links). Decided once,
// at the handshake, by who connects.
let servesSkills = false;
const toolsNow = () => (servesSkills ? [...TOOLS, SKILL_TOOL] : TOOLS);

function runTool(name, args) {
  return new Promise((res) => {
    const env = { ...process.env, HVBRAIN_CLIENT: client, HVBRAIN_CONV: String(process.pid) };
    const child = spawn(process.execPath, [TOOL, name], { windowsHide: true, env });
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

// THE USAGE JOURNAL: what each call to the brain costs. What a tool answers
// enters the AI's context: those are INPUT tokens, the brain's real cost. The
// arguments the AI writes to call it are OUTPUT tokens, a few. Tokens are
// estimated from characters (about 3.5 per token for French or English text
// in JSON): an order of magnitude, not an invoice. One line per call in
// ~/.hypervibe-brain/usage.jsonl, outside the brain (it would never rest),
// read by a live view. The connection itself is counted once: the
// instructions and the tools' descriptions, sent at the start of every
// conversation.
const USAGE = join(HOME, ".hypervibe-brain", "usage.jsonl");
const tokens = (chars) => Math.round(chars / 3.5);
// WHO READS (2026-11-10): a background Claude of the brain itself (the judge,
// HVBRAIN_WHO=ai:<source>) signs its lines, so the live view can tell the
// brain's own work from the person's conversations.
const USAGE_WHO = /^ai:/.test(process.env.HVBRAIN_WHO ?? "") ? process.env.HVBRAIN_WHO : undefined;
function logUsage(line) {
  try {
    mkdirSync(dirname(USAGE), { recursive: true });
    appendFileSync(USAGE, `${JSON.stringify({ at: new Date().toISOString(), client: client || undefined, conv: String(process.pid), who: USAGE_WHO, ...line })}\n`, "utf8");
  } catch {
    // a comfort, never a failure of the tool
  }
}
/** What the call was about, in a few words: the question, the note, the address. */
const what = (a = {}) => String(a.query ?? a.slug ?? a.address ?? [a.since, a.until, a.type].filter(Boolean).join(" ") ?? "").slice(0, 160);

// RESIDENT: the brain this process found as it started is the one it serves
// itself. If the person creates or switches brains during the conversation,
// the questions go to a fresh process again, which sees the new one.
const norm = (d) => resolve(String(d)).replace(/\\/g, "/").toLowerCase();
const resident = () => {
  const info = brainInfo();
  return Boolean(BRAIN && info && norm(info.dir) === norm(BRAIN));
};
let answerHere = null;
async function runHere(name, args) {
  answerHere ??= (await import("./tool.mjs")).answer;
  // THE BACKGROUND WORK (2026-11-09): a Claude run by the brain itself (the
  // judge: HVBRAIN_WHO=ai:<source>) reads the brain to check what it already
  // knows. Its reads are signed with its name and marked as background: the
  // live view does not draw them, and they do not count as "read by an AI"
  // (promotion of a seed, weight of a note).
  const bg = /^ai:/.test(process.env.HVBRAIN_WHO ?? "") ? process.env.HVBRAIN_WHO.slice(3) : null;
  return answerHere(name, args ?? {}, { who: { client, conv: bg ?? String(process.pid), background: Boolean(bg) }, resident: true });
}

// One question at a time: two refreshes of the index in parallel would race.
let queue = Promise.resolve();
function call(name, args) {
  const p = queue.then(() => (resident() ? runHere(name, args) : runTool(name, args)));
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
  // STDOUT IS THE PROTOCOL, and the tools now run in this very process:
  // whatever they might print goes to stderr, never between two messages.
  for (const k of ["log", "info", "debug"]) console[k] = (...a) => process.stderr.write(`${a.join(" ")}\n`);
  // A failure inside a tool is that tool's answer, never the end of the server.
  process.on("uncaughtException", (e) => process.stderr.write(`brain: ${e?.stack ?? e}\n`));
  process.on("unhandledRejection", (e) => process.stderr.write(`brain: ${e?.stack ?? e}\n`));
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
      client = String(params?.clientInfo?.name ?? "").slice(0, 60);
      // The brain's table of contents goes with the instructions (summary.mjs).
      let summaryText = "";
      if (resident()) {
        try {
          const [{ openDb }, { summary }] = await Promise.all([import("./build.mjs"), import("./summary.mjs")]);
          const db = openDb({ readonly: true });
          if (db) {
            summaryText = summary(db);
            db.close();
          }
        } catch {
          summaryText = "";
        }
      }
      const info = brainInfo();
      // Only a floor that holds skills: a tool that would list nothing is not offered.
      try {
        servesSkills = Boolean(info) && !nativeClient(client) && process.env.HVBRAIN_MCP_SKILLS !== "off" && listSkills(info.dir).length > 0;
      } catch {
        servesSkills = false;
      }
      let skillsText = "";
      try {
        skillsText = servesSkills ? skillsSentence(info.dir) : "";
      } catch {
        skillsText = "";
      }
      const instructions = [instructionsFor(info?.name ?? null, summaryText), skillsText].filter(Boolean).join(" ");
      const capabilities = servesSkills ? { tools: {}, prompts: {} } : { tools: {} };
      send({ id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities, serverInfo: { name: "brain", version: "1.0.0" }, instructions } });
      const fixed = instructions.length + JSON.stringify(toolsNow()).length;
      logUsage({ tool: "(connection)", what: "instructions and tool descriptions", in: 0, out: fixed, tokIn: tokens(fixed), tokOut: 0, ms: 0, ok: true });
    } else if (method === "ping") send({ id, result: {} });
    else if (method === "tools/list") send({ id, result: { tools: toolsNow() } });
    else if (method === "prompts/list") {
      const info = brainInfo();
      let prompts = [];
      try {
        prompts = servesSkills && info ? promptList(info.dir) : [];
      } catch {
        prompts = [];
      }
      send({ id, result: { prompts } });
    } else if (method === "prompts/get") {
      const info = brainInfo();
      const t0 = Date.now();
      const r = servesSkills && info ? promptGet(info.dir, params?.name, params?.arguments ?? {}) : { ok: false, error: "no skill is served to this client" };
      if (r.ok) send({ id, result: r.result });
      else send({ id, error: { code: -32602, message: r.error } });
      const out = r.ok ? JSON.stringify(r.result).length : 0;
      logUsage({ tool: "(prompt)", what: String(params?.name ?? "").slice(0, 160), in: 0, out, tokIn: tokens(out), tokOut: 0, ms: Date.now() - t0, ok: r.ok });
    } else if (method === "tools/call" && servesSkills && params?.name === SKILL_TOOL.name) {
      const t0 = Date.now();
      const info = brainInfo();
      let r;
      try {
        r = info ? skillTool(info.dir, params.arguments ?? {}) : { ok: false, error: "no brain is set up on this computer" };
      } catch (e) {
        r = { ok: false, error: String(e?.message ?? e) };
      }
      const text = r.ok ? (r.raw ? String(r.result) : JSON.stringify(r.result)) : String(r.error);
      send({ id, result: r.ok ? { content: [{ type: "text", text }] } : { content: [{ type: "text", text }], isError: true } });
      const args = JSON.stringify(params.arguments ?? {});
      logUsage({ tool: SKILL_TOOL.name, what: String(params.arguments?.name ?? "(the list)").slice(0, 160), in: args.length, out: text.length, tokIn: tokens(text.length), tokOut: tokens(args.length + 20), ms: Date.now() - t0, ok: r.ok });
    } else if (method === "tools/call") {
      if (!TOOLS.some((t) => t.name === params?.name)) return send({ id, result: { content: [{ type: "text", text: `unknown tool ${params?.name}` }], isError: true } });
      const t0 = Date.now();
      const r = await call(params.name, params.arguments);
      // Compact JSON: the indentation of before cost tokens and told nothing.
      const text = r.ok ? JSON.stringify(r.result) : String(r.error ?? "the brain did not answer");
      send({ id, result: r.ok ? { content: [{ type: "text", text }] } : { content: [{ type: "text", text }], isError: true } });
      const args = JSON.stringify(params.arguments ?? {});
      // (2026-11-21) A failure keeps its words: the journal counted 22 errors
      // in two weeks and could not say what any of them was. `buildError`
      // (in `how`, from tool.mjs) is why the index could not be refreshed.
      logUsage({ tool: params.name, what: what(params.arguments), in: args.length, out: text.length, tokIn: tokens(text.length), tokOut: tokens(args.length + params.name.length + 20), ms: Date.now() - t0, ok: r.ok, ...(r.ok ? {} : { error: text.slice(0, 300) }), ...(r.how ?? {}) });
    } else send({ id, error: { code: -32601, message: `method not found: ${method}` } });
  });
}
