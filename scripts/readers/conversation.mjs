#!/usr/bin/env node
// readers/conversation.mjs - A Claude Code conversation, condensed for a judge.
//
//   node scripts/readers/conversation.mjs <claude://session/<id>#<version> | id> [--since <ISO date>] [--page N]
//   node scripts/readers/conversation.mjs --list [--since <ISO date>] [--calm <minutes>]
//   node scripts/readers/conversation.mjs --where <id> [<id> ...]
//
// READING. The person's messages and Claude's written answers, in order;
// NEVER the tool outputs, the files read, the system reminders nor the pasted
// attachments (that is where secrets and volume lie). Nothing is cut: a long
// conversation is read in pages of 20 000 characters, cut between messages
// (`--page N`), under the size (30 KB) above which Claude Code stores an output
// in a file and shows only a preview (seen 2026-11-09: a judge saw 2 000
// characters and concluded the conversation was erased). `--since` keeps only
// the exchanges after a date: a conversation taken up again is not read twice.
//
// LISTING. The conversations worth judging, as JSON. A conversation counts if
// it is the person's own (not a sub-agent, not a background run of `claude -p`,
// the judge's own runs among them), has at least three messages from them, and
// has settled: no message for `--calm` minutes (30 by default).
//
// A CONVERSATION IS DATED BY ITS LAST EXCHANGE, not by its file (2026-11-10):
// the Claude app touches the date of its files when it opens (493 at once that
// morning, writing nothing in them), and every one of them looked taken up
// again.
//
// A CONVERSATION IS READ ONCE PER VERSION OF ITS FILE (2026-11-19). Listing
// read every conversation whole, each time: 1 618 files and 7 GB on a real
// computer, thirty seconds to three minutes at every pass of the watch. What
// the list needs of a conversation (how it was started, how many messages of
// the person, its last exchange, its folder, its title) is kept beside the
// plugin's other caches, by the date and size of its file: a conversation
// that did not move is not opened. Nothing of what was said is kept there.
//
// Reads only (and writes that cache). Born in the brain this plugin grew from
// (2026-11-09), moved here on 2026-11-10 so that every brain has it.

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { opened } from "./opened.mjs";

const PROJECTS = join(process.env.HVBRAIN_HOME || homedir(), ".claude", "projects");
const PAGE = 20_000;
const args = process.argv.slice(2);
/** The value of an option, under its name or the name it had before the move. */
const val = (...names) => {
  for (const n of names) if (args.includes(n)) return args[args.indexOf(n) + 1];
  return undefined;
};

/** @typedef {{ who: "USER" | "CLAUDE", at: string, text: string }} Exchange */

/** The top-level conversation files (sub-agents live in a sub-folder). */
function conversations() {
  /** @type {{ project: string, path: string, id: string }[]} */
  const out = [];
  if (!existsSync(PROJECTS)) return out;
  for (const p of readdirSync(PROJECTS, { withFileTypes: true })) {
    if (!p.isDirectory()) continue;
    for (const f of readdirSync(join(PROJECTS, p.name), { withFileTypes: true })) {
      if (f.isFile() && f.name.endsWith(".jsonl")) out.push({ project: p.name, path: join(PROJECTS, p.name, f.name), id: f.name.slice(0, -6) });
    }
  }
  return out;
}

const lines = (path) =>
  readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

/** The text of a message, without system reminders nor command tags. */
function textOf(content) {
  const raw = typeof content === "string" ? content : (content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("\n");
  return raw
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, "")
    .replace(/<(command-[a-z-]+|local-command-[a-z-]+|task-notification|pasted_content[^>]*)>[\s\S]*?<\/\1>/g, "")
    .replace(/<\/?pasted_content[^>]*>/g, "")
    .trim();
}

/** A conversation's exchanges, with its title, its folder and how it was started. */
function read(path) {
  /** @type {Exchange[]} */
  const exchanges = [];
  let title = "";
  let cwd = "";
  let entry = "";
  for (const e of lines(path)) {
    if (e.type === "custom-title" || e.type === "ai-title") title = e.customTitle ?? e.aiTitle ?? e.title ?? title;
    if (e.cwd) cwd = e.cwd;
    if (e.entrypoint) entry = e.entrypoint;
    if (e.isSidechain || e.isMeta || e.isCompactSummary || e.isVisibleInTranscriptOnly) continue;
    if (e.type === "user" && e.message?.role === "user") {
      const c = e.message.content;
      if (Array.isArray(c) && c.some((b) => b?.type === "tool_result")) continue;
      const t = textOf(c);
      if (t) exchanges.push({ who: "USER", at: e.timestamp, text: t });
    } else if (e.type === "assistant") {
      const t = textOf(e.message?.content);
      // Only Claude's LAST written answer after each message of the person
      // counts: the small sentences between two tools teach nothing.
      if (!t) continue;
      if (exchanges.at(-1)?.who === "CLAUDE") exchanges[exchanges.length - 1] = { who: "CLAUDE", at: e.timestamp, text: t };
      else exchanges.push({ who: "CLAUDE", at: e.timestamp, text: t });
    }
  }
  return { title, cwd, entry, exchanges };
}

if (args.includes("--list") || args.includes("--lister")) {
  const since = Date.parse(val("--since", "--depuis") ?? "") || Date.now() - 30 * 86400_000;
  const calm = Number(val("--calm", "--calme") ?? 30) * 60_000;
  // What the list needs of each conversation, kept by the version of its file.
  const cacheFile = join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain", "cache", "conversations.json");
  const useCache = process.env.HVBRAIN_NOTES_CACHE !== "off";
  let kept = {};
  if (useCache) {
    try {
      const c = JSON.parse(readFileSync(cacheFile, "utf8"));
      if (c.v === 1 && c.files && typeof c.files === "object") kept = c.files;
    } catch {
      // no cache yet, or an unreadable one: everything is read
    }
  }
  const next = {};
  let moved = false;
  const list = [];
  for (const c of conversations()) {
    const st = statSync(c.path);
    const stamp = `${st.mtimeMs}:${st.size}`;
    if (kept[c.path]?.s === stamp) next[c.path] = kept[c.path];
    if (st.mtimeMs < since || Date.now() - st.mtimeMs < calm) continue;
    let k = next[c.path];
    if (!k) {
      const x = read(c.path);
      k = { s: stamp, entry: x.entry, mine: x.exchanges.filter((m) => m.who === "USER").length, last: Math.max(0, ...x.exchanges.map((m) => Date.parse(m.at) || 0)), cwd: x.cwd, title: x.title };
      next[c.path] = k;
      moved = true;
    }
    // A background run (claude -p: a judge, a routine) is not a conversation.
    if (/^sdk/i.test(k.entry)) continue;
    if (k.mine < 3) continue;
    if (!k.last || Date.now() - k.last < calm) continue;
    // `cwd`: the folder of the project the conversation was held in. It is
    // what a judge's exclusions are checked against (2026-11-17).
    list.push({ id: c.id, project: c.project, cwd: k.cwd, title: k.title, modified: new Date(k.last).toISOString(), messages: k.mine });
  }
  if (useCache && (moved || Object.keys(next).length !== Object.keys(kept).length)) {
    try {
      mkdirSync(join(cacheFile, ".."), { recursive: true });
      // Written beside, then renamed: another program never reads half a file.
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ v: 1, files: next }), "utf8");
      renameSync(tmp, cacheFile);
    } catch {
      // a comfort, not a guarantee: the next listing reads what it must
    }
  }
  console.log(JSON.stringify(list.sort((a, b) => a.modified.localeCompare(b.modified))));
  process.exit(0);
}

// WHERE some conversations were held: their project and its folder, nothing
// of what was said. For an exclusion added while they already wait on a pile.
if (args.includes("--where")) {
  const ids = new Set(args.slice(args.indexOf("--where") + 1).filter((a) => !a.startsWith("--")));
  console.log(JSON.stringify(conversations().filter((c) => ids.has(c.id)).map((c) => ({ id: c.id, project: c.project, cwd: read(c.path).cwd }))));
  process.exit(0);
}

const ref = args.find((a) => !a.startsWith("--")) ?? "";
const id = ref.replace(/^claude:\/\/session\//, "").replace(/#.*$/, "");
const found = conversations().find((x) => x.id === id);
if (!found) {
  console.log(`The conversation ${id} no longer exists on this computer (Claude Code erases its conversations after 30 days).`);
  // Nothing is left to read: for the judge that asked, it is read.
  opened(`claude://session/${id}`);
  process.exit(0);
}
const x = read(found.path);
const since = Date.parse(val("--since", "--depuis") ?? "") || 0;
const kept = x.exchanges.filter((m) => !since || Date.parse(m.at) > since);
const cut = (s, n) => (s.length > n ? `${s.slice(0, n)} [...]` : s);
const head = [
  `CONVERSATION: ${x.title || "(untitled)"}`,
  `PROJECT: ${x.cwd || found.project}`,
  `FROM ${x.exchanges[0]?.at?.slice(0, 16) ?? "?"} TO ${x.exchanges.at(-1)?.at?.slice(0, 16) ?? "?"}`,
  ...(since ? [`(only what follows ${new Date(since).toISOString().slice(0, 16)})`] : []),
].join("\n");
const blocks = kept.map((m) => `--- ${m.who} (${String(m.at ?? "").slice(0, 16)})\n${cut(m.text, m.who === "USER" ? 4000 : 3000)}`);
const pages = [];
let current = "";
for (const b of blocks) {
  if (current && current.length + b.length + 2 > PAGE) {
    pages.push(current);
    current = "";
  }
  current += (current ? "\n\n" : "") + b;
}
if (current || !pages.length) pages.push(current);
const n = Math.min(Math.max(1, Number(val("--page") ?? 1) || 1), pages.length);
// The page a judge opens is kept (opened.mjs): a conversation counts as read
// once each of its pages was.
opened(`claude://session/${id}`, n, pages.length);
console.log(`${head}\nPAGE ${n}/${pages.length}${n < pages.length ? `: read page ${n + 1} next (--page ${n + 1})` : ": the last one"}${kept.length ? "" : "\n(nothing new since that date)"}\n\n${pages[n - 1]}`);
