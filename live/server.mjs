#!/usr/bin/env node
// server.mjs: the local server of the brain's live view.
//
// It lives in the plugin (live/), and the plugin starts it: scripts/live.mjs
// on demand, or at the opening of the session with --permanent. Without that
// flag it stops by itself when no window watches it any more. One process for
// the whole computer. It only listens to the computer itself (127.0.0.1). It reads the
// brain; the few routes that change something (the rhythm or the pause of a
// source, a judge's settings, what it never reads, the answer to a judge that
// waits, a "now", a territory's name, a health action, a write of the machine
// taken back, a note validated) are POST only, and go through the plugin's own
// files and scripts. Everything under /api/ but the ping asks for the view's
// token (see THE TOKEN, below): the page carries it in a cookie, a program
// reads it in ~/.hypervibe-brain/live-token.json and sends it in a header.
//
// What it serves (every shape is in contract.d.ts):
//   /                     the page (page/)
//   /api/ping             who answers, for which brain, and from which copy of the plugin
//   /api/setup            what this brain still lacks (no source, the hub off...)
//   /api/start            where the building of the brain stands, while /brain:start goes on
//   /api/vocabulary       the brain's language, domains and types
//   /api/map              the notes and their links, from the plugin's index
//   /api/territories      the territories of meaning (territories.mjs)
//   /api/tools            the tools around the brain (tools.mjs)
//   /api/tool, /api/history, /api/next, /api/change
//                         what a tool did and when it runs next (activity.mjs)
//   /api/undo?id=         takes back one write of the machine (the plugin's undo.mjs)
//   /api/settings        the rhythm of the sources, the judges' settings
//   /api/judges           what the judges cost, and where each stands today (judges.mjs)
//   /api/exclude, /api/catch-up
//                         what a judge never reads; the answer to a judge that
//                         holds its pile (the plugin's sources.mjs and judge.mjs)
//   /api/note?slug=       one note, read on a click
//   /api/validate, /api/open-note, /api/index/refresh
//                         a note validated by the person, or the seeds the filters
//                         leave all at once (the plugin's promote.mjs),
//                         its file shown in the file manager, the index brought up to date
//   /api/contacts, /api/catalogue, /api/weights, /api/written, /api/usage
//                         the layers and filters of the map, the usage journal
//   /api/stream           the live feed (Server-Sent Events): each read of the
//                         brain, each note written, each source that runs
//   /api/suggest          the plugin's hook asks here for the notes to suggest
//
// Frugal: no dependency; nothing is read in a loop, the system tells when a
// file changes and only the new lines are read; a note's content is only read
// on a click. (Only the date of the view's own code is looked at, every two
// seconds: see watchCode.)

import { createServer } from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appendFileSync, chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, statSync, watch, watchFile } from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { connectedTools } from "./tools.mjs";
import { BRING_FORWARD } from "./forward.mjs";
import { change, history, nextRuns, toolDetail, undoableWrite, useJudgeSettings } from "./activity.mjs";
import { builtAt, graph, indexPath, language, noteFile, settings, updatedSince, vocabulary, weights } from "./brain.mjs";
import { osLanguage, rhythm, t } from "./i18n.mjs";
import { eventsSince, journalReader, readForWrite, readJsonOnce, writeFileAtomic } from "./journal.mjs";
import { askPlugin, catchUp, exclude, judgeCosts, judgeState } from "./judges.mjs";
import { claudeAsker, rename, territories } from "./territories.mjs";

/** @typedef {import("node:http").IncomingMessage} Request */
/** @typedef {import("node:http").ServerResponse} Response */
/** @typedef {import("./contract.d.ts").StreamEvents} StreamEvents */
/** @typedef {import("./contract.d.ts").ReadEvent} ReadEvent */
/** @typedef {import("./contract.d.ts").WriteEvent} WriteEvent */
/** @typedef {import("./contract.d.ts").TurnEnd} TurnEnd */
/** @typedef {import("./contract.d.ts").RunSignal} RunSignal */
/** @typedef {import("./contract.d.ts").UndoCode} UndoCode */
/** @typedef {import("./contract.d.ts").UndoResponse} UndoResponse */
/** @typedef {Record<string, any>} JournalEvent one line of the brain's journal (the plugin's keys: at, act, who, what, note...) */
/** @typedef {Omit<ReadEvent, "convTitle">} RawRead a read as the journal gives it, before its conversation is found */

const HERE = dirname(fileURLToPath(import.meta.url));
// THE PLUGIN IS THE FOLDER ABOVE (2026-11-17). The view lives in the plugin's
// live/ folder: its scripts are beside it, at ../scripts, whatever the settings
// say (until then the view was a repository of its own and found the plugin
// through `pluginRoot` in ~/.hypervibe-brain/config.json).
const PLUGIN = join(HERE, "..");
/** @param {string} name a file of the plugin's scripts/ */
const script = (name) => join(PLUGIN, "scripts", name);
const PORT = Number(process.env.BRAIN_LIVE_PORT || 47615);
// The plugin's folder on this computer (settings, journals, piles): one place
// says it, HVBRAIN_HOME included (the plugin's tests move it).
const HUB = join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain");
const CONFIG = join(HUB, "config.json");

// NOTHING THAT GOES WRONG STOPS THE SERVER (2026-11-21, audit 1 and 5). One
// request whose address cannot be parsed (`GET //`, which any web page can
// send with an image), or one line of another shape in a watched file, threw
// outside every `try`: Node then ends the process, and nothing starts the
// view again before the next session. What is thrown anywhere is now written
// in the log, and the server goes on.
process.on("uncaughtException", (e) => console.error(`${new Date().toISOString()}  not caught: ${e?.stack ?? e}`));
process.on("unhandledRejection", (e) => console.error(`${new Date().toISOString()}  not handled: ${/** @type {any} */ (e)?.stack ?? e}`));

// THE HOOK'S SUGGESTION (the plugin's scripts/hook-suggest.mjs). This server
// stays up: it keeps the index and its vectors in memory and answers in a
// fraction of a second, where the hook alone would take two seconds at each
// message. The engine is the plugin's, loaded once.
/** @type {Promise<{ E: any, S: any, L: any, J: any }> | null} the plugin's engine, suggest, lib and judge modules */
let engine = null;
function loadEngine() {
  engine ??= (async () => {
    // (By its address, not by a bare "../scripts/x.mjs": the type check of the
    // view would otherwise follow the import and check the plugin's scripts.)
    /** @param {string} file */
    const load = (file) => import(pathToFileURL(script(file)).href);
    const [E, S, L, J] = await Promise.all([load("engine.mjs"), load("suggest.mjs"), load("lib.mjs"), load("judge.mjs")]);
    pluginLib = L;
    return { E, S, L, J };
  })();
  // A failure (settings unreadable for an instant) must not stay in memory
  // for ever: the next call tries again.
  engine.catch(() => { engine = null; });
  return engine;
}
/**
 * The notes to suggest for a message, as the plugin's engine finds them.
 * @param {string} prompt
 * @param {string[] | undefined} seen the slugs already suggested in this conversation
 * @returns {Promise<Record<string, unknown> & { text: string }>}
 */
async function suggest(prompt, seen) {
  const { E, S, L } = await loadEngine();
  // THE INDEX AS IT IS (2026-11-21). freshDb rebuilds the index when a note
  // moved, here, on the server's own thread: every open page and the hook
  // itself waited for it. The engine's currentDb opens the index without
  // building anything; it is brought up to date apart, by another program. (A
  // plugin of before currentDb still answers through freshDb.)
  const db = E.currentDb ? E.currentDb() : (await E.freshDb({ vectors: false })).db;
  if (!db) throw new Error("the index does not exist yet");
  if (E.currentDb) refreshIndexApart();
  try {
    const r = await S.suggest(db, prompt, { seen: new Set(seen ?? []) });
    return { ...r, text: S.render(r, { fr: (L.config().lang ?? L.config().format) === "fr" }) };
  } finally {
    db.close();
  }
}
const CLAUDE_PROJECTS = join(homedir(), ".claude", "projects");
// The usage journal of the brain's MCP server (the plugin's scripts/mcp.mjs).
const USAGE = join(HUB, "usage.jsonl");
const VISIBLE_MS = 2 * 60_000; // a read stays visible for two minutes
const IDLE_STOP_MS = 3 * 60_000; // with no window open, the server stops after three minutes

/** @returns {Record<string, any>} the plugin's settings on this computer ({} when they cannot be read) */
function userSettings() {
  try {
    return JSON.parse(readFileSync(CONFIG, "utf8")) ?? {};
  } catch {
    return {};
  }
}
/**
 * The brain of this account, found as the plugin's own scripts find it
 * (scripts/lib.mjs): HVBRAIN_DIR, else the one the plugin noted.
 * @returns {string | null}
 */
function brainDir() {
  const dir = process.env.HVBRAIN_DIR || userSettings().brain;
  return dir ? resolve(String(dir)) : null;
}
const found = brainDir();
if (!found || !existsSync(found)) {
  console.error(t(osLanguage()).noBrain);
  process.exit(1);
}
// NOTHING OF THE PLUGIN'S FOLDER IS HELD (2026-11-17). On Windows a folder
// cannot be renamed while a program stands in it or watches one of its files,
// and an update of the plugin swaps that folder: started from inside it, the
// view made the update fail. So it stands in the plugin's settings folder,
// and looks at its own code without holding it (watchCode).
try {
  process.chdir(HUB);
} catch {
  try { process.chdir(homedir()); } catch { /* it stays where it is */ }
}
/** @type {string} */
const BRAIN = found;
const INDEX = join(BRAIN, "index");
/** The version of the plugin this view belongs to ("" when its manifest cannot be read). */
const VERSION = (() => {
  try {
    return String(JSON.parse(readFileSync(join(PLUGIN, ".claude-plugin", "plugin.json"), "utf8")).version ?? "");
  } catch {
    return "";
  }
})();
/** What the server words for the person, in the brain's language (i18n/). */
const words = () => t(language(BRAIN));

// ---------------------------------------------------------------- the token

// THE TOKEN (2026-11-21, audit 3). Until then anything that could reach the
// port had every right: a second account of the computer, a tool in a sandbox,
// read the notes and the directory and changed the settings with a plain
// request. Every route under /api/ (the ping aside, which says nothing of the
// brain) and the logos now ask for a token:
//   - it is made the first time a server starts, and kept in
//     ~/.hypervibe-brain/live-token.json ({ "token": "<64 hex>", "created": "<ISO date>" }),
//     readable by this account alone where the system has such rights. It
//     stays the same from one start to the next: the server restarts itself
//     at each change of its code, and the open pages must still be known;
//   - the page gets it in a cookie (HttpOnly: no script reads it; SameSite=Strict:
//     no other site's request carries it) when the page itself is asked for;
//   - a program (the plugin's suggestion hook) reads it in the file and sends
//     it in the header `x-brain-token`.
//
// THE PAGE NO LONGER GETS IT FOR THE ASKING (2026-11-27, security audit). The
// page's own document came with the cookie: any program of the computer that
// asked for "/" received the whole token, the file's rights notwithstanding.
// The cookie is now given against a CODE: scripts/live.mjs, which reads the
// token in its file, asks this server for one (POST /api/code, with the
// token), and opens the window on "/?code=<it>". A code serves once, for two
// minutes, and leaves the address at once (a redirection). A page asked for
// without a cookie nor a code is a short screen that says how to open the view
// (/brain:live); a page that has its cookie keeps it, and gets it again at
// each visit (a view opened from its shortcut, a server restarted).
// The file itself is kept for the person alone: its mode elsewhere, and on
// Windows an access list that names their account only (as the judge's token).
const TOKEN_FILE = join(HUB, "live-token.json");
const COOKIE = `brain-live-${PORT}`;
/** @param {unknown} token */
const isToken = (token) => typeof token === "string" && /^[0-9a-f]{64}$/.test(token);
const STARTED_TOKEN = (() => {
  const kept = readForWrite(TOKEN_FILE).value?.token;
  if (isToken(kept)) return String(kept);
  const fresh = randomBytes(32).toString("hex");
  try {
    writeFileAtomic(TOKEN_FILE, `${JSON.stringify({ token: fresh, created: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  } catch (e) {
    console.error(`the view's token could not be kept in ${TOKEN_FILE} (${e.message}): the page works, a program cannot read it`);
  }
  return fresh;
})();
/** The token of now: the file's (another server of this account may have written it at the same instant), else the one of the start. */
function token() {
  const kept = readJsonOnce(TOKEN_FILE, null)?.token;
  return isToken(kept) ? String(kept) : STARTED_TOKEN;
}
/** @param {Request} req @returns {boolean} whether a request carries the token: in its header (a program), or in its cookie (the page) */
function hasToken(req) {
  const expected = Buffer.from(token());
  let cookie = "";
  for (const part of String(req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === COOKIE) cookie = part.slice(i + 1).trim();
  }
  return [String(req.headers["x-brain-token"] ?? ""), cookie].some((given) => {
    const g = Buffer.from(given);
    return g.length === expected.length && timingSafeEqual(g, expected);
  });
}
/** What the page is given against a code (and again at each visit it already carries it): the token, for this address only, for a year. */
const tokenCookie = () => `${COOKIE}=${token()}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict`;

/**
 * The token's file for the person alone. Its mode says so where the system
 * reads modes; on Windows a file takes its folder's access list, which may
 * name other accounts: one that names this account only is written instead
 * (granted first, the inherited entries removed only once that worked: the
 * other order could leave a file nobody reads). Done at each start: a file of
 * before the rule gets it too.
 * @returns {string} how the file is kept
 */
function keepForThePersonAlone() {
  try {
    if (process.platform !== "win32") {
      chmodSync(TOKEN_FILE, 0o600);
      return "mode 600";
    }
    const who = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
    if (!who) return "profile folder";
    /** @param {string[]} a */
    const icacls = (a) => spawnSync("icacls", [TOKEN_FILE, ...a], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).status === 0;
    return icacls(["/grant:r", `${who}:(F)`]) && icacls(["/inheritance:r"]) ? "access list: this account only" : "profile folder";
  } catch {
    return "profile folder";
  }
}
const TOKEN_KEPT = keepForThePersonAlone();

// THE CODES (see THE TOKEN): each serves once, within two minutes of its making.
const CODE_MS = 120_000;
/** @type {Map<string, number>} a code and the moment it stops serving */
const codes = new Map();
/** A new code, for whoever showed the token. */
function newCode() {
  const now = Date.now();
  for (const [c, until] of codes) if (until < now) codes.delete(c);
  // (Never more than a handful: each opening of the window makes one.)
  if (codes.size > 50) codes.clear();
  const code = randomBytes(24).toString("hex");
  codes.set(code, now + CODE_MS);
  return code;
}
/** Whether a code serves, and it no longer does. @param {string} code */
function spendCode(code) {
  const until = codes.get(code);
  if (until === undefined) return false;
  codes.delete(code);
  return until >= Date.now();
}
/** When a page was last asked for without its cookie (a window that waits to be opened the right way), for scripts/live.mjs. */
let lastUnconnected = 0;
/** The screen of a page asked for without a cookie nor a code: how to open the view. No script, it asks again by itself. */
function notConnectedPage() {
  const fr = language(BRAIN) === "fr";
  const [title, line, how, wait] = fr
    ? ["Second brain", "Cette fenêtre n’est pas reliée à votre second brain.", "Pour ouvrir la vue en direct, dites <b>/brain:live</b> à Claude, ou demandez-lui d’ouvrir la vue en direct.", "Cette page se reliera toute seule, sans rien recharger."]
    : ["Second brain", "This window is not connected to your second brain.", "To open the live view, say <b>/brain:live</b> to Claude, or ask it to open the live view.", "This page will connect by itself, with nothing to reload."];
  return `<!doctype html><html lang="${fr ? "fr" : "en"}"><head><meta charset="utf-8"><meta http-equiv="refresh" content="4"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>html{color-scheme:light dark}body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center}main{max-width:32rem;padding:2rem}h1{font-size:1.25rem;margin:0 0 1rem}p{margin:.5rem 0}small{opacity:.7}</style></head><body><main><h1>${line}</h1><p>${how}</p><p><small>${wait}</small></p></main></body></html>`;
}

// ---------------------------------------------------------------- the map

// EVERYTHING THE MAP KNOWS OF THE NOTES COMES FROM THE PLUGIN'S INDEX
// (brain.mjs, 2026-11-10): the notes, their links, their vectors, their
// nature, their weight. No file that only one person's brain would produce.
const VAULT = join(BRAIN, "vault");
/** @type {{ key: string, built: string | null, notes: import("./brain.mjs").Note[], json: string } | null} */
let map = null;
/** @type {Set<string>} every note seen, to recognise a new one */
const knownSlugs = new Set();

/**
 * The header of a note that has just moved: its title, type and domains, as the note writes them.
 * @param {string} file
 * @returns {{ type: string, title: string, domains: string[] } | null}
 */
function readHeader(file) {
  const buffer = Buffer.alloc(3072);
  let n = 0;
  const fd = openSync(file, "r");
  try {
    n = readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    closeSync(fd);
  }
  const head = buffer.toString("utf8", 0, n);
  if (!head.startsWith("---")) return null;
  const end = head.indexOf("\n---", 3);
  const frontMatter = end > 0 ? head.slice(0, end) : head;
  /** @param {string} name */
  const field = (name) => new RegExp(`^${name}:\\s*"?([^"\\r\\n]+)"?`, "m").exec(frontMatter)?.[1]?.trim() ?? "";
  // The two languages of the notes' format (title or titre, domains or domaines).
  const domains = (/^(?:domains|domaines):\s*\[([^\]]*)\]/m.exec(frontMatter)?.[1] ?? "").split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  return { type: field("type"), title: field("title") || field("titre"), domains };
}

// Claude's lasting token, to name the territories the way the judge does: the
// plugin's vault, read by the plugin itself once it is loaded.
/** @type {any} the plugin's lib.mjs, once the engine is loaded */
let pluginLib = null;
const claudeToken = () => pluginLib?.hypervibeVault?.("CLAUDE_CODE", "oauth_token") ?? null;

/**
 * The territories of meaning (territories.mjs); a name proposed by the AI tells the open pages.
 *
 * A READING STARTS NOTHING (2026-11-21, audit 4). Reading the map or the
 * territories (a GET) could cut them again, write their file and call Claude
 * for names. A reading now takes the cutting as it is kept (`cut: false`);
 * the cutting itself is made by the server alone, at its start and each time
 * the index is rebuilt (keepTerritories), or when the person asks for a new
 * one (POST /api/territories/redo).
 * @param {import("./brain.mjs").Note[]} notes
 * @param {{ redo?: boolean, cut?: boolean }} [how]
 */
function currentTerritories(notes, { redo = false, cut = false } = {}) {
  return territories(BRAIN, notes, {
    redo,
    cut: cut || redo,
    nameByAi: cut || redo ? claudeAsker(claudeToken) : null,
    onNamed: () => broadcast("territories", { at: new Date().toISOString() }),
  });
}
/**
 * The cutting brought up to date by the server itself: the first one of a
 * brain, a new one for a brain that grew, the names still to ask for.
 * @param {{ tell?: boolean }} [how] `tell`: say so to the pages that already read the map, when the cutting changed
 */
function keepTerritories({ tell = false } = {}) {
  try {
    const before = map ? map.key : null;
    const { computedAt } = currentTerritories(graph(BRAIN).notes, { cut: true });
    // A cutting that was not there a moment ago moves the notes of the Semantic view: the pages read the map again.
    if (tell && computedAt && before !== null && !before.endsWith(`|${computedAt}`)) broadcast("map", { at: new Date().toISOString() });
  } catch (e) {
    console.error(`the territories were not brought up to date: ${e?.stack ?? e}`);
  }
}

/**
 * The map: one note is one row, in the plugin's vocabulary (the type and
 * domain identifiers as the notes carry them). The words and the colours come
 * with it, read in brain.json.
 * @returns {string} a MapResponse, as JSON
 */
function readMap() {
  const built = builtAt(BRAIN);
  const fresh = map && map.built === built ? null : graph(BRAIN);
  const notes = fresh?.notes ?? map?.notes ?? [];
  const terr = currentTerritories(notes);
  const key = `${built}|${terr.computedAt}`;
  if (map?.key === key) return map.json;
  const g = fresh ?? graph(BRAIN);
  const voc = vocabulary(BRAIN);
  for (const n of g.notes) knownSlugs.add(n.id);
  // The contacts and the notes of people are not drawn: the map is the map
  // of ideas. They are not sent, nor are their links.
  const drawn = g.notes.filter((n) => !n.contact && n.type !== voc.personType);
  const ids = new Set(drawn.map((n) => n.id));
  /** @type {import("./contract.d.ts").MapResponse} */
  const body = {
    builtAt: g.builtAt,
    vocabulary: voc,
    fields: ["id", "title", "type", "domains", "degree", "status", "pos", "date", "nature"],
    nodes: drawn.map((n) => [n.id, n.title, n.type, n.domains, n.degree, n.status, terr.positions[n.id] ?? null, n.created, n.nature]),
    links: g.links.filter(([a, b]) => ids.has(a) && ids.has(b)),
  };
  const json = JSON.stringify(body);
  map = { key, built, notes: g.notes, json };
  return json;
}

// ---------------------------------------------------------------- the reads

/** @type {RawRead[]} the reads of the last two minutes, for a window that opens */
const recentReads = [];

// THE BRAIN'S JOURNAL (the plugin's journal.mjs). Since 2026-11-07 the reads
// go there (one line per call, with the notes read), and the sources say
// there when they run and what they write: enough to light up the flow of
// the tool the data comes from.
const EVENTS = join(HUB, "events.jsonl");
const BRAIN_KEY = BRAIN.replaceAll("\\", "/");
/** @type {number | null} */
let eventsOffset = null;
/** @returns {JournalEvent[]} the events written since the last call (the last 64 KB the first time) */
function newEvents() {
  let size = 0;
  try {
    size = statSync(EVENTS).size;
  } catch {
    return [];
  }
  if (eventsOffset === null || size < eventsOffset) eventsOffset = Math.max(0, size - 64 * 1024);
  if (size <= eventsOffset) return [];
  const buffer = Buffer.alloc(size - eventsOffset);
  try {
    const fd = openSync(EVENTS, "r");
    try {
      readSync(fd, buffer, 0, buffer.length, eventsOffset);
    } finally {
      closeSync(fd);
    }
  } catch {
    return []; // held by another program for an instant: the next change reads it
  }
  const text = buffer.toString("utf8");
  const end = text.lastIndexOf("\n");
  if (end < 0) return [];
  eventsOffset += Buffer.byteLength(text.slice(0, end + 1));
  const out = [];
  for (const l of text.slice(0, end).split("\n")) {
    try {
      const e = JSON.parse(l);
      // (Only an object with its date: a line of another shape is not an event.)
      if (e && typeof e === "object" && typeof e.at === "string" && (!e.brain || e.brain === BRAIN_KEY)) out.push(e);
    } catch {
      // a line cut at the start of the window read
    }
  }
  return out;
}
const TURNS = join(dirname(EVENTS), "turns.jsonl");
// THE SKILLS IN USE (2026-11-23): scripts/hook-skill.mjs notes each skill the
// AI starts, the page lights it in the crown of the harnesses.
const SKILLS_USED = join(dirname(EVENTS), "skills-used.jsonl");
/** @type {number | null} */
let skillsOffset = null;
/** @returns {import("./contract.d.ts").SkillUse[]} the skills started since the last call */
function newSkills() {
  let size = 0;
  try {
    size = statSync(SKILLS_USED).size;
  } catch {
    // Not there yet: its first line, when it comes, is read from the start.
    if (skillsOffset === null) skillsOffset = 0;
    return [];
  }
  if (skillsOffset === null) skillsOffset = size;
  else if (size < skillsOffset) skillsOffset = 0;
  if (size <= skillsOffset) return [];
  const buffer = Buffer.alloc(size - skillsOffset);
  try {
    const fd = openSync(SKILLS_USED, "r");
    try {
      readSync(fd, buffer, 0, buffer.length, skillsOffset);
    } finally {
      closeSync(fd);
    }
  } catch {
    return [];
  }
  skillsOffset = size;
  return parseSkills(buffer.toString("utf8").split("\n"));
}
/** @param {string[]} lines @returns {import("./contract.d.ts").SkillUse[]} */
function parseSkills(lines) {
  const out = [];
  for (const l of lines) {
    try {
      const e = JSON.parse(l);
      if (e && typeof e.skill === "string" && typeof e.at === "string") out.push({ at: e.at, session: String(e.session ?? ""), skill: e.skill });
    } catch {
      // a cut line
    }
  }
  return out;
}
/**
 * A skill in use, with the title of its conversation (its transcript, by the
 * session's id): the activity panel names who used it, as for a read.
 * @param {import("./contract.d.ts").SkillUse} e @returns {import("./contract.d.ts").SkillUse}
 */
function withSessionTitle(e) {
  if (!e.session) return e;
  try {
    const t = listTranscripts().find((x) => x.session === e.session);
    const title = t ? sessionTitle(t.path) : null;
    return title ? { ...e, convTitle: title } : e;
  } catch {
    return e;
  }
}
/** The skills started since a date (the activity panel's count of the day). @param {string} since */
function skillsSince(since) {
  try {
    return parseSkills(readFileSync(SKILLS_USED, "utf8").split("\n")).filter((e) => e.at >= since).map(withSessionTitle);
  } catch {
    return [];
  }
}
/** @returns {import("./contract.d.ts").SkillUse[]} the skills started in the last two minutes, for a page that opens */
function recentSkills() {
  const limit = new Date(Date.now() - 2 * 60_000).toISOString();
  try {
    return parseSkills(readFileSync(SKILLS_USED, "utf8").split("\n").slice(-100)).filter((e) => e.at >= limit);
  } catch {
    return [];
  }
}
/** @type {number | null} */
let turnsOffset = null;
/** @returns {TurnEnd[]} the ends of answers noted since the last call */
function newTurns() {
  let size = 0;
  try {
    size = statSync(TURNS).size;
  } catch {
    return [];
  }
  // At start: at the end of the file. A file made shorter (kept to its last
  // 300 lines): read again from the start, the ends already seen do nothing.
  if (turnsOffset === null) turnsOffset = size;
  else if (size < turnsOffset) turnsOffset = 0;
  if (size <= turnsOffset) return [];
  const buffer = Buffer.alloc(size - turnsOffset);
  try {
    const fd = openSync(TURNS, "r");
    try {
      readSync(fd, buffer, 0, buffer.length, turnsOffset);
    } finally {
      closeSync(fd);
    }
  } catch {
    return []; // held by another program for an instant: the next change reads it
  }
  turnsOffset = size;
  const out = [];
  for (const l of buffer.toString("utf8").split("\n")) {
    try {
      const e = JSON.parse(l);
      if (e && typeof e.session === "string" && typeof e.at === "string") out.push({ session: e.session, at: e.at });
    } catch {
      // a cut line
    }
  }
  return out;
}
/** @returns {TurnEnd[]} the ends of answers of the last two hours, for a page that opens */
function recentTurns() {
  const limit = new Date(Date.now() - 2 * 3600_000).toISOString();
  const out = [];
  try {
    for (const l of readFileSync(TURNS, "utf8").split("\n").slice(-300)) {
      try {
        const e = JSON.parse(l);
        if (e && typeof e.session === "string" && typeof e.at === "string" && e.at >= limit) out.push({ session: e.session, at: e.at });
      } catch {
        // a cut line
      }
    }
  } catch {
    // no end noted yet
  }
  return out;
}
/** @type {Map<string, { tool: string, t: number }>} who has just written each note, from the brain's journal */
const writerOf = new Map();
/** @param {JournalEvent} e a write @returns {string} the tool it comes from, "" when the journal does not say */
function toolOfEvent(e) {
  const who = String(e.who ?? "");
  const from = String(e.from ?? "");
  // Where what was written comes from, when the journal says it: a watched
  // folder (the tool of the source that collects from it), else the tool that
  // carries the name of the address's scheme (gmail:<id> comes from the
  // "gmail" tool).
  if (from) {
    const { origins, tools } = connectedTools(BRAIN);
    const folder = origins.find((o) => from.startsWith(o.prefix));
    if (folder) return folder.tool;
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(from)?.[1];
    if (scheme && tools.some((o) => o.id === scheme)) return scheme;
  }
  const name = who.startsWith("source:") ? who.slice(7) : who.startsWith("ai:") ? who.slice(3) : null;
  if (name) {
    const tools = connectedTools(BRAIN).bySource.get(name) ?? [];
    if (tools.length) return tools[tools.length - 1];
  }
  if (who === "ai" || who === "person" || who.startsWith("ai:")) return "claude-code";
  return "";
}
// The reads of the background work (the judge, 2026-11-09) are not drawn: its
// digestion already shows through the breathing of its source and its writes.
/** @param {JournalEvent} e a read @returns {RawRead[]} one read per note */
// (A line whose `notes` is not a list, or holds something that is not a name, lights nothing up: it used to throw, audit 5.)
const asReads = (e) => (e.background || !Array.isArray(e.notes) ? [] : e.notes.filter((slug) => typeof slug === "string")).map((slug) => ({ at: e.at, tool: String(e.tool ?? ""), slug, client: String(e.client ?? ""), conv: String(e.who ?? "").replace(/^ai:/, "").replace(/^\?$/, "") }));
/** @param {JournalEvent} e @returns {RunSignal | null} the tools of a source that runs or writes: the flow to light up */
function runSignal(e) {
  const name = String(e.who ?? "").startsWith("source:") ? String(e.who).slice(7) : e.what === "running" ? e.source : null;
  if (!name) return null;
  const tools = connectedTools(BRAIN).bySource.get(name) ?? [];
  if (!tools.length) return null;
  if (e.what !== "running") return { at: e.at, source: name, tools, state: "end", ok: e.ok !== false, judged: e.judged };
  // WHAT IS GOING ON, for the bubble of the hovered flow (2026-11-08): what
  // the source does, why it runs, and for the judge what it is reading (the
  // titles of its pile, read on this computer, never written to the journal).
  let description = "";
  try {
    description = JSON.parse(readFileSync(join(BRAIN, "sources", name, "source.json"), "utf8")).description ?? "";
  } catch {
    // a source without a readable declaration: the bubble only says its name
  }
  let titles = [];
  try {
    titles = JSON.parse(readFileSync(join(HUB, "judge", `${name}.json`), "utf8")).items?.map((i) => i.title).filter(Boolean).slice(0, 8) ?? [];
  } catch {
    // not a judge's source
  }
  return { at: e.at, source: name, tools, state: "start", description, why: e.why ?? "", items: e.items ?? null, titles };
}

/** At start: the reads still lit, then the place is taken at the end of each file. */
function prime() {
  // Taking place at the end of the file of the ends of answers: the first end
  // noted after the start is broadcast (before, it served to take place, and
  // was lost).
  newTurns();
  newSkills();
  for (const e of newEvents()) if (e.act === "read" && Date.parse(e.at) >= Date.now() - VISIBLE_MS) recentReads.push(...asReads(e));
  recentReads.sort((a, b) => a.at.localeCompare(b.at));
}

// ---------------------------------------------------------------- the conversations

// Who read? Each Claude Code conversation writes its calls to the brain in its
// transcript (~/.claude/projects/<project>/<session>.jsonl): an opening as
// "input":{"slug":"x"}, a search by its results (\"slug\": \"x\"). The local
// server finds the line that carries the note read, within a few seconds of
// the read, and takes the session from it: that is the identifier of the
// conversation, stable, whether it was opened before or after the brain's
// server learnt to name itself. What the journal says of the reader (`conv`)
// is a shortcut: once its session is found, nothing is searched again.
//
// Frugal: only the end of the transcripts modified around the read is read,
// and only when a read arrives.

/** @typedef {{ session: string, path: string, project: string }} Session */
/** @type {Map<string, Session>} what the journal says of a reader -> its session */
const sessionOfConv = new Map();
/** @type {Map<string, { title: string | null, read: number }>} transcript -> its title, and when it was read */
const sessions = new Map();
/** @type {Map<string, { conv: string, convTitle: string }>} `${at}|${slug}` -> the conversation of that read */
const resolved = new Map();
/** @type {Map<string, Session | null>} `${at}|${conv}|${tool}` (one call to the brain) -> its session, null when none was found */
const sessionOfCall = new Map();
/** @type {Map<string, number>} what the journal says of a reader -> until when it is not looked for again (it had no transcript) */
const notFound = new Map();

/** @param {string} file @param {number} size @param {number} bytes @returns {string} the end of a file */
function readTail(file, size, bytes) {
  const n = Math.min(size, bytes);
  const buffer = Buffer.alloc(n);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buffer, 0, n, size - n);
  } finally {
    closeSync(fd);
  }
  return buffer.toString("utf8");
}

/** @param {string} file a transcript @returns {string | null} the title of its conversation */
function sessionTitle(file) {
  const known = sessions.get(file);
  if (known && Date.now() - known.read < 10 * 60_000) return known.title;
  let title = null;
  let first = null;
  try {
    const size = statSync(file).size;
    // The title Claude gives to the conversation is rewritten as it goes: the
    // latest is towards the end. The first message is at the start.
    const texts = [readTail(file, size, 1024 * 1024)];
    const fd = openSync(file, "r");
    try {
      const n = Math.min(size, 256 * 1024);
      const b = Buffer.alloc(n);
      readSync(fd, b, 0, n, 0);
      texts.unshift(b.toString("utf8"));
    } finally {
      closeSync(fd);
    }
    for (const text of texts) {
      for (const l of text.split("\n")) {
        if (!l.includes("Title") && !(first === null && l.includes('"type":"user"'))) continue;
        try {
          const o = JSON.parse(l);
          if (o.aiTitle) title = o.aiTitle;
          else if (o.customTitle) title = o.customTitle;
          else if (first === null && o.type === "user" && typeof o.message?.content === "string" && !o.isMeta) first = o.message.content;
        } catch {
          // a cut line
        }
      }
    }
  } catch {
    // unreadable: no title
  }
  const clean = (title ?? first ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || null;
  sessions.set(file, { title: clean, read: Date.now() });
  return clean;
}

// THE TRANSCRIPTS ARE LISTED ONCE FOR A BURST OF READS (2026-11-21, audit 12).
// Finding who read went through every transcript of the computer (1 700 files
// looked at, a fifth of a second, on a real one) once per NOTE read: a search
// that returns ten notes froze the server for two seconds when its reader had
// no transcript. The list, with the date and the size of each file, is kept
// for ten seconds; a conversation is looked for once per event, not once per
// note; and one that was not found is not looked for again for a minute.
/** @type {{ at: number, files: { path: string, project: string, session: string, mtimeMs: number, size: number }[] } | null} */
let transcripts = null;
function listTranscripts() {
  if (transcripts && Date.now() - transcripts.at < 10_000) return transcripts.files;
  /** @type {{ path: string, project: string, session: string, mtimeMs: number, size: number }[]} */
  const files = [];
  let projects = [];
  try {
    projects = readdirSync(CLAUDE_PROJECTS);
  } catch {
    projects = [];
  }
  for (const project of projects) {
    const folder = join(CLAUDE_PROJECTS, project);
    let names = [];
    try {
      names = readdirSync(folder).filter((n) => n.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of names) {
      const path = join(folder, f);
      try {
        const st = statSync(path);
        files.push({ path, project, session: f.slice(0, -6), mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // gone meanwhile
      }
    }
  }
  transcripts = { at: Date.now(), files };
  return files;
}

/** @param {RawRead} e @returns {Session | null} the Claude Code session that made this read */
function findSession(e) {
  if (!existsSync(CLAUDE_PROJECTS)) return null;
  const instant = Date.parse(e.at);
  const signatures = [`"slug":"${e.slug}"`, `\\"slug\\": \\"${e.slug}\\"`, `\\"slug\\":\\"${e.slug}\\"`];
  /** @type {Session | null} */
  let best = null;
  let gap = 30_000; // beyond thirty seconds, it is not the same read
  {
    for (const { path, project, session, mtimeMs } of listTranscripts()) {
      // (The list may be ten seconds old: a transcript that was at rest for
      // half an hour when it was made is not the one of a read of now. The
      // others are looked at again, for their date and their size of now.)
      if (mtimeMs < instant - 30 * 60_000) continue;
      let st;
      try {
        st = statSync(path);
      } catch {
        continue;
      }
      // Only a transcript written after the read, and not too long after.
      if (st.mtimeMs < instant - 5000 || st.mtimeMs > instant + 30 * 60_000) continue;
      const tail = readTail(path, st.size, 512 * 1024);
      if (!tail.includes("brain_")) continue;
      // A search only writes its notes in the transcript afterwards: failing
      // the note, the conversation that started a search at that moment.
      const call = e.tool ? `${e.tool}","input"` : null;
      for (const l of tail.split("\n")) {
        if (!signatures.some((sg) => l.includes(sg)) && !(call && l.includes(call))) continue;
        const m = /"timestamp":"([^"]+)"/.exec(l);
        if (!m) continue;
        const d = Math.abs(Date.parse(m[1]) - instant);
        if (d < gap) {
          gap = d;
          best = { session, path, project };
        }
      }
    }
  }
  return best;
}

/** @param {RawRead} e @returns {{ conv: string, convTitle: string }} the conversation of a read, and its title */
function identify(e) {
  const key = `${e.at}|${e.slug}`;
  const already = resolved.get(key);
  if (already) return already;
  /** @type {Session | null} */
  let s = null;
  // (Every note of one call to the brain has the same reader: looked for once.)
  const call = `${e.at}|${e.conv}|${e.tool}`;
  if (e.conv && sessionOfConv.has(e.conv)) s = sessionOfConv.get(e.conv) ?? null;
  else if (sessionOfCall.has(call)) s = sessionOfCall.get(call) ?? null;
  else if (e.conv && (notFound.get(e.conv) ?? 0) > Date.now()) s = null;
  else {
    try {
      s = findSession(e);
    } catch {
      s = null;
    }
    if (s && e.conv) sessionOfConv.set(e.conv, s);
    else if (e.conv) notFound.set(e.conv, Date.now() + 60_000);
    sessionOfCall.set(call, s);
    if (sessionOfCall.size > 500) {
      const oldest = sessionOfCall.keys().next().value;
      if (oldest !== undefined) sessionOfCall.delete(oldest);
    }
  }
  const say = words();
  const r = s
    ? { conv: s.session, convTitle: sessionTitle(s.path) ?? s.project }
    : e.conv
      ? { conv: `pid-${e.conv}`, convTitle: e.client ? say.conversationOf(e.client, e.conv) : say.conversation(e.conv) }
      : { conv: "", convTitle: "" };
  resolved.set(key, r);
  if (resolved.size > 2000) {
    const oldest = resolved.keys().next().value;
    if (oldest !== undefined) resolved.delete(oldest);
  }
  return r;
}

// ---------------------------------------------------------------- the live feed

/** @type {Set<Response>} the open pages */
const subscribers = new Set();
let lastWindowAt = Date.now();

/**
 * One event of the stream, as the page receives it.
 * @template {keyof StreamEvents} K
 * @param {K} event
 * @param {StreamEvents[K]} data
 */
const message = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Sends one event to every open page.
 * @template {keyof StreamEvents} K
 * @param {K} event
 * @param {StreamEvents[K]} data
 */
function broadcast(event, data) {
  const msg = message(event, data);
  for (const res of subscribers) res.write(msg);
}

/** @param {RawRead} e @returns {ReadEvent} */
function withConversation(e) {
  return { ...e, ...identify(e) };
}

// ---------------------------------------------------------------- the writes of the vault

// Everything that enters the brain ends up writing a note: watching the vault
// therefore shows, live, each incoming flow, whatever its source (a capture,
// the evening save, the review, a write by hand).
/** @type {WriteEvent[]} */
const recentWrites = [];
/** @type {Map<string, NodeJS.Timeout>} file -> timer: one write makes several signals */
const pending = new Map();

/** @param {string} relative a file of the vault that has just moved */
function onVaultChange(relative) {
  if (!relative || !relative.endsWith(".md") || relative.includes("danger-zone")) return;
  const file = join(VAULT, relative);
  clearTimeout(pending.get(file));
  pending.set(
    file,
    setTimeout(() => {
      pending.delete(file);
      if (!existsSync(file)) return;
      // A READ IS NOT A WRITE (2026-11-08). On Windows, the watching also
      // signals the date of last access, updated in batches when a program
      // reads the notes (rebuilding the index reads them all): only a note
      // whose content has just changed counts, that is one modified less
      // than ten seconds ago.
      try {
        if (Date.now() - statSync(file).mtimeMs > 10_000) return;
      } catch {
        return;
      }
      let header;
      try {
        header = readHeader(file);
      } catch {
        return;
      }
      if (!header) return;
      const slug = (relative.replace(/\\/g, "/").split("/").pop() ?? "").slice(0, -3);
      const isNew = !knownSlugs.has(slug);
      knownSlugs.add(slug);
      // THE TOOL THAT WRITES, not the one the note comes from (2026-11-08):
      // the brain's journal says who has just written this note (a source,
      // the judgement, a capture). A touch by hand lights up no tool.
      const writer = writerOf.get(slug);
      const tool = writer && Date.now() - writer.t < 15_000 ? writer.tool : "";
      /** @type {WriteEvent} */
      const e = { at: new Date().toISOString(), slug, title: header.title || slug, type: header.type, domains: header.domains, tool, isNew };
      recentWrites.push(e);
      const limit = Date.now() - VISIBLE_MS;
      while (recentWrites.length && Date.parse(recentWrites[0].at) < limit) recentWrites.shift();
      broadcast("writes", [e]);
      // What the view saw move, and who wrote it (unknown: nobody announced
      // it to the journal). Enough to find where a burst came from.
      try {
        appendFileSync(join(HUB, "logs", `live-${e.at.slice(0, 10)}.log`), `${e.at}  ${relative.replaceAll("\\", "/")}  ${tool || "(unknown writer)"}\n`, "utf8");
      } catch {
        // a missing diagnostic log prevents nothing
      }
    }, 900),
  );
}

/**
 * fs.watch that never kills the server: a folder that is not there (a brand
 * new brain has no index yet) or is removed along the way (an update of the
 * plugin, a renamed folder) is noted in the log, not thrown.
 * @param {string} path
 * @param {(event: string, file: string | null) => void} listener
 * @param {{ recursive?: boolean }} [options]
 * @returns {import("node:fs").FSWatcher | null}
 */
function safeWatch(path, listener, options = {}) {
  try {
    const w = watch(path, options, listener);
    w.on("error", (e) => console.error(`watching ${path}: ${e.message}`));
    return w;
  } catch (e) {
    console.error(`cannot watch ${path}: ${e.message}`);
    return null;
  }
}

// A FOLDER OF THE BRAIN THAT IS NOT THERE YET (2026-11-17). A brain just
// created has no sources/ and no index/ (and a brain being restored may have
// no vault/ for a moment). Their watching failed at start and was never set
// up again: the first source added, the first index built showed nothing
// until the server was restarted. Now a folder that is missing is awaited:
// the brain's own folder is watched, and tells when it appears. A folder
// removed along the way is awaited again.
/** @type {Map<string, () => void>} the name of a missing folder of the brain -> what starts its watching */
const awaited = new Map();
/**
 * Watches one folder of the brain, now or as soon as it exists.
 * @param {string} name its name in the brain ("vault", "sources", "index")
 * @param {(event: string, file: string | null) => void} listener
 * @param {{ recursive?: boolean, onStart?: () => void }} [options] `onStart`: called when the watching starts after a wait
 */
function watchFolder(name, listener, { recursive = false, onStart } = {}) {
  const path = join(BRAIN, name);
  const start = (/** @type {boolean} */ late) => {
    const w = safeWatch(path, listener, { recursive });
    if (!w) return void awaited.set(name, () => start(true));
    // Removed or renamed: the watcher says so by an error; the folder is awaited again.
    w.on("error", () => {
      w.close();
      awaited.set(name, () => start(true));
    });
    if (late) onStart?.();
  };
  if (existsSync(path)) start(false);
  else awaited.set(name, () => start(true));
}
/** @param {string} name what has just moved in the brain's own folder: a folder that was awaited starts being watched */
function onBrainFolderChange(name) {
  const start = awaited.get(name);
  if (!start || !existsSync(join(BRAIN, name))) return;
  awaited.delete(name);
  start();
}

function watchBrain() {
  // Without the vault being watched: no pulses, the rest works.
  watchFolder("vault", (_type, f) => onVaultChange(f ? String(f) : ""), { recursive: true });
  // The brain's journal: the reads, and the flow of the sources that run.
  try {
    /** @type {NodeJS.Timeout | undefined} */
    let eventsTimer;
    safeWatch(dirname(EVENTS), (_type, file) => {
      // The plugin's settings, in the same folder: a newer copy of the plugin
      // or a brain that moved is named there (watchCode).
      if (file === "config.json") return void onSettingsChange();
      if (file !== "events.jsonl") return;
      // Several signals for one write: they are gathered.
      clearTimeout(eventsTimer);
      eventsTimer = setTimeout(() => {
        // (Whatever a line of the journal holds, the server goes on: what is
        // thrown here is noted in the log, the next lines are read as usual.)
        try {
          const events = newEvents();
          const reads = events.filter((e) => e.act === "read").flatMap(asReads).map(withConversation);
          if (reads.length) {
            recentReads.push(...reads);
            const limit = Date.now() - VISIBLE_MS;
            while (recentReads.length && Date.parse(recentReads[0].at) < limit) recentReads.shift();
            broadcast("reads", reads);
          }
          for (const e of events) if (e.act === "write" && e.note && e.who !== "hand") writerOf.set(String(e.note), { tool: toolOfEvent(e), t: Date.now() });
          const signals = events.map(runSignal).filter((s) => s !== null);
          if (signals.length) broadcast("runs", signals);
          // A judge that has just been capped for the day, or that holds its
          // pile until the person answers: the pages read its state again.
          if (events.some((e) => e.act === "signal" && (e.what === "capped" || e.what === "catch-up"))) broadcast("judges", { at: new Date().toISOString() });
        } catch (e) {
          console.error(`the journal's new lines were not all read: ${e?.stack ?? e}`);
        }
      }, 30);
    });
    // The ends of Claude's answers (the plugin's Stop hook, turns.jsonl): the
    // trace of a conversation goes out when its answer ends.
    /** @type {NodeJS.Timeout | undefined} */
    let turnsTimer;
    /** @type {NodeJS.Timeout | undefined} */
    let skillsTimer;
    safeWatch(dirname(EVENTS), (_type, file) => {
      if (file !== "skills-used.jsonl") return;
      clearTimeout(skillsTimer);
      skillsTimer = setTimeout(() => {
        const skills = newSkills().map(withSessionTitle);
        if (skills.length) broadcast("skills", skills);
      }, 30);
    });
    safeWatch(dirname(EVENTS), (_type, file) => {
      if (file !== "turns.jsonl") return;
      clearTimeout(turnsTimer);
      turnsTimer = setTimeout(() => {
        const turns = newTurns();
        if (turns.length) broadcast("turns", turns);
      }, 30);
    });
  } catch {
    // without the journal: the writes of the vault still light up the flows
  }
  // THE TOOLS THAT COME OR GO (2026-11-08): a source added or removed, a data
  // registry modified, a state of health that changes, and the page redraws
  // its circle, without reloading.
  /** @type {NodeJS.Timeout | undefined} */
  let toolsTimer;
  // (bySource is a Map: JSON.stringify would make it empty, and a change that
  // only touches it would go unnoticed.)
  /** @param {import("./tools.mjs").ConnectedTools} o */
  const print = (o) => JSON.stringify({ ...o, bySource: [...o.bySource] });
  let toolsPrint = "";
  try {
    toolsPrint = print(connectedTools(BRAIN, { fresh: true }));
  } catch (e) {
    // (A declaration that cannot be read at start: the server starts all the same, the next change reads it again.)
    console.error(`the tools could not be read at start: ${e?.stack ?? e}`);
  }
  const onToolsChange = () => {
    clearTimeout(toolsTimer);
    toolsTimer = setTimeout(() => {
      try {
        const now = print(connectedTools(BRAIN, { fresh: true }));
        if (now === toolsPrint) return;
        toolsPrint = now;
        try { appendFileSync(join(HUB, "logs", `live-${new Date().toISOString().slice(0, 10)}.log`), `${new Date().toISOString()}  tools: the circle is redrawn\n`, "utf8"); } catch { /* no log */ }
        broadcast("tools", { at: new Date().toISOString() });
      } catch {
        // a source.json half written: the next change will read it again
      }
    }, 1500);
  };
  // (A brain without a folder of sources yet: awaited, and the first source
  // added redraws the circle.)
  watchFolder("sources", (_type, f) => {
    if (!f || /source\.json$|run\.mjs$/.test(String(f)) || !String(f).includes(".")) onToolsChange();
  }, { recursive: true, onStart: onToolsChange });
  // The brain's own folder: its settings (brain.json), and the folders that
  // were missing at start (watchFolder).
  safeWatch(BRAIN, (_type, f) => {
    if (f === "brain.json") onToolsChange();
    else if (f) onBrainFolderChange(String(f));
  });
  // THE INDEX REBUILT: the map has changed. The index's file moves often (the
  // weights, the vectors); only its date of building counts.
  /** @type {NodeJS.Timeout | undefined} */
  let mapTimer;
  let built = builtAt(BRAIN);
  const onIndexChange = () => {
    clearTimeout(mapTimer);
    mapTimer = setTimeout(() => {
      const now = builtAt(BRAIN);
      if (!now || now === built) return;
      built = now;
      // The cutting follows the index (the first one of a brain, a new one
      // when it grew): made here, by the server itself, never by a reading.
      keepTerritories();
      broadcast("map", { at: new Date().toISOString() });
    }, 1500);
  };
  const indexFile = indexPath(BRAIN);
  // (A brand new brain has no index yet: its folder appears at the first
  // building, the watching settles there then, and the map is read at once.)
  watchFolder("index", (_type, file) => {
    if (file === "health.json") return void onToolsChange();
    if (dirname(indexFile) === INDEX && String(file ?? "").startsWith(basename(indexFile))) onIndexChange();
  }, { onStart: onIndexChange });
  if (dirname(indexFile) !== INDEX) safeWatch(dirname(indexFile), (_type, file) => { if (String(file ?? "").startsWith(basename(indexFile))) onIndexChange(); });
}

// ---------------------------------------------------------------- the notes written since

// THE "WRITTEN RECENTLY" FILTER. The writes of the brain's journal (since
// 2026-11-07: sources, machine, captures, touches by hand seen by the save),
// those of this computer not handed over yet, and for a window of a day or
// more, the date each note was last touched (the index's `updated`), which
// covers what comes before the journal.
/** @param {string} since an ISO date @returns {string[]} the slugs of the notes written since */
function writtenSince(since) {
  const from = Date.parse(since);
  if (!Number.isFinite(from)) return [];
  /** @type {Set<string>} */
  const slugs = new Set();
  // THE JOURNAL IS NOT READ AGAIN (2026-11-21, audit 13). Each change of the
  // filter read every journal file of the period in full, a fifth of a second
  // that grew with the journal. The journal the tools' cards already keep in
  // memory (forty days, of which only the new lines are read) answers: the
  // filter goes back thirty days at most.
  for (const e of eventsSince(BRAIN, new Date(from).toISOString())) if (e.act === "write" && e.note) slugs.add(String(e.note));
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  if (from <= startOfDay.getTime()) {
    const day = since.slice(0, 10);
    for (const slug of updatedSince(BRAIN, day)) slugs.add(slug);
  }
  return [...slugs];
}

// ---------------------------------------------------------------- the usage journal

// THE USAGE JOURNAL IS NOT READ AGAIN IN FULL (2026-11-21, audit 13). The
// activity panel asks for three figures each time it opens: the whole journal
// (2 MB on a real brain) and the whole journal of events (6 MB) were read and
// parsed for them, a quarter of a second during which the server answered
// nothing else. Each file is now kept in memory and only its new lines are
// read (journalReader); what is worked out from them is kept for as long as
// neither file grew.
const readUsage = journalReader(() => () => true);
// (Of the journal of events, only the judge's reads in the background: what tells its old lines of usage apart.)
const readBackground = journalReader(() => (e) => e.act === "read" && e.background === true);
/** @type {{ stamp: string, lines: import("./contract.d.ts").UsageResponse } | null} */
let usageKept = null;
/** @returns {import("./contract.d.ts").UsageResponse} the last 20,000 calls, enough for months (the page does the counting); the list is shared, it must not be changed */
function usageLines() {
  /** @param {string} f */
  const sizeOf = (f) => {
    try {
      return statSync(f).size;
    } catch {
      return -1;
    }
  };
  const stamp = `${sizeOf(USAGE)}|${sizeOf(EVENTS)}`;
  if (usageKept?.stamp === stamp) return usageKept.lines;
  const lines = /** @type {import("./contract.d.ts").UsageResponse} */ (readUsage(USAGE).slice(-20000));
  // WHO READS (2026-11-10): the judge signs its lines since the plugin's
  // 0.6.3 (who: "ai:<source>"). Before, it is found through the journal
  // of events, which marks its "background" reads since 9 November: a
  // line that falls in the same second, for the same tool, names the
  // whole session (its process number, that day). Earlier, nothing tells
  // them apart: they count as conversations.
  // Only the lines of before the first signed line are to be found: for
  // someone who installs the plugin today, there are none.
  const firstSigned = lines.find((l) => l.who && !l.inferred)?.at ?? "9999";
  const unsigned = lines.filter((l) => !l.who && l.at < firstSigned);
  if (unsigned.length) {
    // The background reads, filed by tool and by second: one direct
    // lookup per line, instead of going through them all.
    /** @type {Map<string, string>} */
    const background = new Map();
    for (const e of readBackground(EVENTS)) background.set(`${e.tool}|${Math.floor(Date.parse(e.at) / 1000)}`, String(e.who ?? ""));
    /** @type {Map<string, string>} */
    const whoOfSession = new Map();
    if (background.size) for (const l of unsigned) {
      const s = Math.floor(Date.parse(l.at) / 1000);
      for (let d = -3; d <= 3; d++) {
        const who = background.get(`${l.tool}|${s + d}`);
        if (who) { whoOfSession.set(`${l.conv}|${String(l.at).slice(0, 10)}`, who); break; }
      }
    }
    if (whoOfSession.size) for (const l of unsigned) {
      const who = whoOfSession.get(`${l.conv}|${String(l.at).slice(0, 10)}`);
      if (who) { l.who = who; l.inferred = true; }
    }
  }
  usageKept = { stamp, lines };
  return lines;
}

// ---------------------------------------------------------------- one note

// ONE NOTE, READ BY THE ENGINE KEPT IN MEMORY. Before 2026-11-07, each click
// started a program (query.mjs), which rebuilt the index if it had moved,
// vectors included: twenty seconds to open a long note right after a series of
// captures. Now the index is only rebuilt for the text (a few seconds at
// worst), and the vectors owed are computed afterwards, in the background.
/** @param {string} slug @returns {Promise<import("./contract.d.ts").NoteResponse>} */
async function readNote(slug) {
  const say = words();
  if (!/^[\p{L}\p{N}._-]+$/u.test(slug)) return { error: say.noteNameInvalid };
  try {
    // AT ONCE (2026-11-21, the engine's getNow): the note is read from the
    // index as it is, and from its own file when it changed since. The index
    // is brought up to date apart, by another program: rebuilding it here
    // froze the whole view for seconds each time a judge had just written.
    // (This reading starts nothing: an index that is behind is said with the
    // note, `stale`, and the page asks for it by POST /api/index/refresh.)
    const { E } = await loadEngine();
    const { note, stale } = E.getNow(slug);
    return note ? { ...note, ...(stale ? { stale: /** @type {const} */ (true) } : {}) } : { error: say.noteNotFound };
  } catch (e) {
    // (The detail stays in the log: it often carries a path of the machine.)
    console.error(`note ${slug}: ${e?.stack ?? e}`);
    return { error: say.noteUnreadable };
  }
}
let refreshingIndex = false;
let refreshedIndexAt = 0;
/** @type {NodeJS.Timeout | null} a refresh asked for while one ran, or too soon after the last one */
let refreshLater = null;
/** The index brought up to date by a program of its own, one at a time, fifteen seconds apart at least. Asked for too soon, it is done once the fifteen seconds are over: what was asked for is not lost (an undo, a note just validated). */
function refreshIndexApart() {
  const wait = refreshingIndex ? 2000 : 15_000 - (Date.now() - refreshedIndexAt);
  if (refreshingIndex || wait > 0) {
    refreshLater ??= setTimeout(() => {
      refreshLater = null;
      refreshIndexApart();
    }, Math.max(wait, 500));
    refreshLater.unref();
    return;
  }
  refreshingIndex = true;
  refreshedIndexAt = Date.now();
  const done = () => { refreshingIndex = false; };
  try {
    spawn(process.execPath, [script("build.mjs"), "--quiet", "--if-stale"], { env: { ...process.env, HVBRAIN_DIR: BRAIN }, stdio: "ignore", windowsHide: true }).on("error", done).on("exit", done);
  } catch {
    done();
  }
}

// ---------------------------------------------------------------- the catalogue

// The entries of the catalogue (the brain's catalogue/*.jsonl), reduced to
// what the map draws: address, tool, title, date. The directory of contacts
// is not in it (thousands of contacts, out of the default search).
const CATALOGUE = join(BRAIN, "catalogue");
/** @type {{ key: string, json: string } | null} */
let catalogue = null;
/** @returns {string} a CatalogueResponse, as JSON */
function readCatalogue() {
  if (!existsSync(CATALOGUE)) return "[]";
  const files = readdirSync(CATALOGUE).filter((n) => n.endsWith(".jsonl") && n !== "annuaire.jsonl").sort();
  const key = files.map((f) => `${f}:${statSync(join(CATALOGUE, f)).mtimeMs}`).join(",");
  if (catalogue?.key === key) return catalogue.json;
  /** @type {import("./contract.d.ts").CatalogueResponse} */
  const out = [];
  for (const f of files) {
    for (const l of readFileSync(join(CATALOGUE, f), "utf8").split("\n")) {
      if (!l.trim()) continue;
      try {
        const e = JSON.parse(l);
        out.push([e.address, e.tool, e.title, e.date ?? ""]);
      } catch {
        // a cut line
      }
    }
  }
  catalogue = { key, json: JSON.stringify(out) };
  return catalogue.json;
}

/**
 * The data at an address, read by the plugin (query.mjs fetch): read only, and not noted in the journal.
 * @param {string} address
 * @returns {Promise<import("./contract.d.ts").FetchResponse>}
 */
function fetchAddress(address) {
  const say = words();
  return new Promise((done) => {
    if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/.test(address)) return done({ error: say.addressInvalid });
    const child = spawn(process.execPath, [script("query.mjs"), "fetch", address], { windowsHide: true, env: { ...process.env, HVBRAIN_DIR: BRAIN } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.resume();
    child.on("close", () => {
      try {
        done(JSON.parse(out));
      } catch {
        done({ error: say.answerUnreadable });
      }
    });
  });
}

// ---------------------------------------------------------------- taking back a write

// UNDO (2026-11-16). The history window takes back ONE write of the machine,
// named by the id of its event in the brain's journal. The plugin does it
// (scripts/undo.mjs: no AI, the same gesture as "undo 3" in the weekly
// letter): a fact leaves its note, a note the machine created is removed, a
// change is reversed, and the journal gets a write "undone" that names it.
//
// What the plugin leaves for later, and who does it:
//   - the index: rebuilt at the next question asked to the brain. The server
//     asks for it at once, by a program of its own (refreshIndexApart); the
//     watching of the index then tells the pages that the map changed.
//   - the commit: the plugin's next save takes the note (removed: at once;
//     changed: once at rest). The "undone" of the journal announces it, so the
//     save does not count it as an edit by hand. Nothing is committed here.

// The refusals of undo.mjs (English free text), as stable codes for the page.
// A sentence that is not here goes out as "other", with its text.
/** @type {[RegExp, UndoCode][]} */
const UNDO_REFUSALS = [
  [/^no write /, "unknown"],
  [/^an edit by hand/, "by-hand"],
  [/^already undone/, "already-undone"],
  [/ is gone/, "gone"],
  [/no longer in the note/, "changed-since"],
  [/later change touched the same lines/, "changed-since"],
  [/not saved yet/, "not-saved"],
  [/nothing of this write is left/, "nothing-left"],
  [/cannot be undone here/, "not-undoable"],
];

/** @type {Promise<unknown>} the undo before this one: two never run together (a double click, two windows) */
let lastUndo = Promise.resolve();
/**
 * Takes back one write of the machine, once the undo before it has ended.
 * @param {string} id the id of the write's event in the journal
 * @returns {Promise<UndoResponse>}
 */
function undoWrite(id) {
  const mine = lastUndo.then(() => runUndo(id));
  lastUndo = mine.catch(() => {});
  return mine;
}

/** @param {string} id @returns {Promise<UndoResponse>} */
async function runUndo(id) {
  // Refused before anything is started: an id no write of this brain carries,
  // an edit by hand, a kind that is not undone, a write taken back already.
  const asked = await undoableWrite(BRAIN, id);
  if (!asked.ok) return asked;
  /** @type {Record<string, any> | null} what the plugin's script answered: one JSON line */
  const said = await new Promise((done) => {
    let child;
    try {
      // The click is the person's, whoever started this server.
      child = spawn(process.execPath, [script("undo.mjs"), id], { cwd: BRAIN, windowsHide: true, timeout: 30_000, env: { ...process.env, HVBRAIN_DIR: BRAIN, HVBRAIN_WHO: "person" } });
    } catch {
      return done(null);
    }
    let out = "";
    let err = "";
    child.stdout.on("data", (b) => (out += b));
    child.stderr.on("data", (b) => (err += b));
    child.on("error", () => done(null));
    child.on("close", () => {
      try {
        done(JSON.parse(out.trim().split("\n").pop() || ""));
      } catch {
        // (What it said instead stays in the server's log: it may carry a path of the machine.)
        if (err.trim()) console.error(`undo ${id}: ${err.trim().slice(0, 400)}`);
        done(null);
      }
    });
  });
  if (!said || typeof said !== "object") return { ok: false, code: "no-answer", error: "the plugin did not answer" };
  if (said.ok !== true) {
    const error = String(said.error ?? "").slice(0, 300);
    const code = UNDO_REFUSALS.find(([text]) => text.test(error))?.[1] ?? "other";
    // (A refusal the page has no words for is said in its own, general ones: what the plugin said, in English, is kept here.)
    if (code === "other") console.error(`undo ${id}: refused (${error})`);
    return { ok: false, code, error };
  }
  const at = new Date().toISOString();
  // The other history windows mark the line; the map follows the index, which
  // is brought up to date apart (not here: it held every open page meanwhile).
  broadcast("undone", { id, note: String(asked.event.note), at });
  refreshIndexApart();
  return { ok: true, id, note: String(asked.event.note), what: String(asked.event.what), at };
}

// ---------------------------------------------------------------- the contacts

// The directory (index/directory.json), reduced to what the Contacts layer
// draws: address, name, client, tier, note. Only sent when the layer is lit.
/** @returns {string} a ContactsResponse, as JSON */
/**
 * The executive floor (scripts/executive.mjs, 2026-11-22): the person's skills
 * and guards, and whether each is placed where the AI's platform looks.
 * Read by the plugin's own script, on this brain.
 * @returns {import("./contract.d.ts").ExecutiveResponse}
 */
function readExecutive() {
  const r = spawnSync(process.execPath, [script("executive.mjs"), "state", "--brain", BRAIN], { encoding: "utf8", timeout: 15_000, windowsHide: true });
  /** @type {import("./contract.d.ts").ExecutiveResponse} */
  let floor;
  try {
    floor = JSON.parse(r.stdout);
  } catch {
    return { ok: false, skills: [], guards: [], harnesses: [], error: String(r.stderr || r.error?.message || "no answer").slice(0, 300) };
  }
  // WHICH TOOLS A SKILL USES (2026-11-23): the tools of the ring its SKILL.md
  // names. A harness acts on a tool directly (an invoice in Pennylane, a
  // draft in Gmail), not only through the knowledge: the Executive view draws
  // it. Read from the text, so a guess: a tool named in passing counts too.
  const words = toolWords();
  const uses = (/** @type {string | undefined} */ file) => {
    if (!file) return [];
    let text = "";
    try {
      text = readFileSync(file, "utf8").slice(0, 80_000).toLowerCase();
    } catch {
      return [];
    }
    return words.filter(({ re }) => re.test(text)).map(({ id }) => id);
  };
  for (const s of floor.skills ?? []) s.uses = uses(s.file);
  for (const h of floor.harnesses ?? []) for (const s of h.skills) s.uses = uses(s.file);
  skillFiles = new Set([...(floor.skills ?? []), ...(floor.harnesses ?? []).flatMap((h) => h.skills)].map((s) => String(s.file ?? "").toLowerCase()).filter(Boolean));
  // What each hook of a plugin says it does (its head comment), by its file:
  // translated like a skill's description (2026-11-23).
  hookTexts = new Map((floor.harnesses ?? []).flatMap((h) => h.hooks ?? []).filter((x) => x.file && x.what).map((x) => [String(x.file).toLowerCase(), String(x.what)]));
  return floor;
}
/** @type {Map<string, string>} */
let hookTexts = new Map();

/** The SKILL.md files the floor named last: the only files the page may ask to read. @type {Set<string> | null} */
let skillFiles = null;
/** Whether a file is one of the floor's skills (never another file of the computer). @param {string} file */
const isSkillFile = (file) => {
  if (!skillFiles) readExecutive();
  return Boolean(file) && Boolean(skillFiles?.has(file.replaceAll("\\", "/").toLowerCase()));
};

/**
 * A skill's text, to read in a window of the page.
 * @param {string} file
 * @returns {{ ok: boolean, text?: string, error?: string }}
 */
function readSkill(file) {
  if (!isSkillFile(file)) return { ok: false, error: "not a skill of the floor" };
  try {
    return { ok: true, text: readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "") };
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 200) };
  }
}

// A SKILL'S DESCRIPTION IN THE PERSON'S LANGUAGE (2026-11-23). Most skills of
// the plugins describe themselves in English; the card shows the description
// in the language of the page. Translated by Claude once, on the first
// opening of the card, and kept (~/.hypervibe-brain/translations.json, by the
// text and the language): the next opening reads the copy.
const TRANSLATIONS = join(HUB, "translations.json");
/**
 * @param {string} file the skill's SKILL.md (one of the floor's)
 * @param {string} lang "fr", "en"...
 * @returns {Promise<{ ok: boolean, text?: string, kept?: boolean, error?: string }>}
 */
async function translateSkill(file, lang) {
  if (!skillFiles) readExecutive();
  const hookText = hookTexts.get(file.replaceAll("\\", "/").toLowerCase());
  if (!hookText && !isSkillFile(file)) return { ok: false, error: "not a skill nor a hook of the floor" };
  if (!/^[a-z]{2}$/.test(lang)) return { ok: false, error: "no language" };
  let text = hookText ?? "";
  if (!hookText) {
    try {
      const head = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(file, "utf8"))?.[1] ?? "";
      text = (/^description:\s*(.*)$/m.exec(head)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
    } catch {
      text = "";
    }
  }
  if (!text) return { ok: false, error: "no description" };
  const key = `${lang}:${createHash("sha1").update(text).digest("hex")}`;
  /** @type {Record<string, string>} */
  let kept = {};
  try {
    kept = JSON.parse(readFileSync(TRANSLATIONS, "utf8"));
  } catch {
    kept = {};
  }
  if (kept[key]) return { ok: true, text: kept[key], kept: true };
  const language = { fr: "French", en: "English", es: "Spanish", de: "German", it: "Italian" }[lang] ?? lang;
  const said = await claudeAsker(claudeToken)(`Translate this description of a software skill or hook into ${language}. Keep the commands, names of tools and quoted phrases as they are, and keep its paragraphs and its lists (lines starting with "- ") as they are. Answer with the translation only, no quotes around it, never an em dash or en dash.\n\n${text}`);
  const done = String(said ?? "").trim().replace(/[\u2013\u2014]/g, ",");
  if (!done) return { ok: false, error: "no translation" };
  try {
    kept = JSON.parse(readFileSync(TRANSLATIONS, "utf8"));
  } catch {
    kept = {};
  }
  kept[key] = done;
  writeFileAtomic(TRANSLATIONS, `${JSON.stringify(kept, null, 1)}\n`);
  return { ok: true, text: done };
}

/**
 * The words that name each tool of the ring in a skill's text: its name, its
 * id, a few common other names. Tools whose name is a common word (the
 * folders, the repositories, this very AI) are left out: every skill would
 * seem to use them.
 * @returns {{ id: string, re: RegExp }[]}
 */
function toolWords() {
  const ASIDE = new Set(["folders", "depots", "claude-code", "x", "blog", "podcasts"]);
  // The other names a tool goes by: the agenda's common ones, and those a
  // tool declares itself (`aliases` in its definition). No person's own
  // tools are written here (2026-11-24): this code is published.
  const MORE = { agenda: ["google agenda", "google calendar", "calendar", "agenda"] };
  const esc = (/** @type {string} */ w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /** @type {{ id: string, re: RegExp }[]} */
  const out = [];
  for (const tool of connectedTools(BRAIN).tools) {
    if (tool.parent || ASIDE.has(tool.id)) continue;
    const declared = Array.isArray(/** @type {any} */ (tool).aliases) ? /** @type {any} */ (tool).aliases.map((/** @type {unknown} */ a) => String(a).toLowerCase()) : [];
    const list = [...new Set([String(tool.name).toLowerCase(), tool.id, ...(MORE[/** @type {keyof typeof MORE} */ (tool.id)] ?? []), ...declared])].filter((w) => w.length >= 3);
    out.push({ id: tool.id, re: new RegExp(`(^|[^a-z0-9à-ÿ])(${list.map(esc).join("|")})([^a-z0-9à-ÿ]|$)`) });
  }
  return out;
}

function readContacts() {
  // index/directory.json has English fields since 2026-11-07 (address, name,
  // domain, tier, note); the French file of before (index/annuaire.json) is
  // still read, in the same shape.
  const file = existsSync(join(INDEX, "directory.json")) ? join(INDEX, "directory.json") : join(INDEX, "annuaire.json");
  if (!existsSync(file)) return "[]";
  // (Kept while neither the directory, the index nor the brain's settings
  // moved: the whole graph was read again at each rebuilding of the map, a
  // quarter of a second, audit 14 of 2026-11-21.)
  /** @param {string} f */
  const stampOf = (f) => {
    try {
      const s = statSync(f);
      return `${s.mtimeMs}:${s.size}`;
    } catch {
      return "none";
    }
  };
  const key = `${file}|${stampOf(file)}|${stampOf(indexPath(BRAIN))}|${stampOf(join(BRAIN, "brain.json"))}`;
  if (contactsKept?.key === key) return contactsKept.json;
  const d = JSON.parse(readFileSync(file, "utf8"));
  /** @param {Record<string, any>} c @returns {{ address: string, name?: string, client?: string, domain?: string, tier?: number, note?: string }} */
  const entry = (c) => ({ address: c.address ?? c.adresse, name: c.name ?? c.nom, client: c.client, domain: c.domain ?? c.domaine, tier: c.tier ?? c.etage, note: c.note ?? c.fiche, volume: (Number(c.sent ?? c.envoyes) || 0) + (Number(c.received ?? c.recus) || 0), last: String(c.last ?? c.dernier ?? "") });
  /** @type {ReturnType<typeof entry>[]} */
  const list = (Array.isArray(d) ? d : (d.contacts ?? [])).map(entry).filter((c) => c.address);
  // The notes each contact's note touches (other contacts aside): the contact
  // will sit in the middle of them.
  const g = graph(BRAIN);
  const personType = vocabulary(BRAIN).personType;
  const contacts = new Set(g.notes.filter((n) => n.contact || n.type === personType).map((n) => n.id));
  /** @type {Map<string, string[]>} */
  const neighbours = new Map();
  /** @param {string} from @param {string} to */
  const tie = (from, to) => {
    const list = neighbours.get(from) ?? [];
    neighbours.set(from, list);
    list.push(to);
  };
  for (const [a, b] of g.links) {
    if (contacts.has(a) && !contacts.has(b)) tie(a, b);
    if (contacts.has(b) && !contacts.has(a)) tie(b, a);
  }
  // The client guessed from the domain of the address, when a colleague of
  // the same domain is tied to a client (never for the public mail services).
  const PUBLIC = /^(gmail|googlemail|hotmail|outlook|live|yahoo|icloud|me|orange|wanadoo|free|sfr|laposte|gmx|protonmail|proton|pm|ymail|yandex|tutanota|zoho|mail|aol|msn|netcourrier|neuf|bbox|club-internet|numericable)\./;
  /** @type {Map<string, string>} */
  const clientOfDomain = new Map();
  for (const c of list) if (c.client && c.domain && !PUBLIC.test(c.domain)) clientOfDomain.set(c.domain, c.client);
  /** @type {import("./contract.d.ts").ContactsResponse} */
  const rows = list.map((c) => [
    c.address, c.name ?? "", c.client ?? "", c.tier ?? 0, c.note ?? "",
    (c.note && neighbours.get(c.note)) || [],
    c.client ? "" : (c.domain && !PUBLIC.test(c.domain) && clientOfDomain.get(c.domain)) || "",
    // (2026-11-22) The organization of the address, unless it is a public
    // mail service; how many messages both ways; the last one. They place the
    // contacts around the brain: by organization, nearer when more is exchanged.
    c.domain && !PUBLIC.test(c.domain) ? c.domain : "", c.volume, c.last,
  ]);
  contactsKept = { key, json: JSON.stringify(rows) };
  return contactsKept.json;
}
/** @type {{ key: string, json: string } | null} */
let contactsKept = null;

// ---------------------------------------------------------------- what the brain still lacks

// THE EMPTY STATES (2026-11-17). A brain just created has no source, no
// judge, and the program that runs the sources (the plugin's hub) is off: the
// page says each of these in a sentence, with what to say to Claude, instead
// of showing an empty box. This is what it needs to know, read from the
// plugin's own files; nothing is started and no key is asked for.
/** @returns {import("./contract.d.ts").SetupResponse} */
function readSetup() {
  const folder = join(BRAIN, "sources");
  /** @param {string} file */
  const read = (file) => { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } };
  /** @type {{ n: string, d: Record<string, any> }[]} every source that declares itself and is not disabled */
  const declared = existsSync(folder) ? readdirSync(folder).flatMap((n) => { const d = read(join(folder, n, "source.json")); return d && d.enabled !== false ? [{ n, d }] : []; }) : [];
  const judges = declared.filter(({ d }) => d.kind === "claude" && d.live === true);
  // The hub runs when its lock names a process that is alive (as the plugin's
  // routines.mjs tells it), and is "on" once the person turned it on.
  let running = false;
  try {
    process.kill(Number(read(join(HUB, "hub.lock")).pid), 0);
    running = true;
  } catch {
    running = false;
  }
  const mine = userSettings();
  // On a brain that lives on two computers, only one runs the sources: on the
  // other, a hub that is off is as it should be.
  const runner = String(settings(BRAIN).runner ?? "").toLowerCase();
  const here = !runner || runner === String(mine.computer ?? (process.env.HVBRAIN_COMPUTER || hostname())).trim().toLowerCase();
  // What only the hub runs: a judge, a rhythm shorter than the evening, a
  // source that follows another (the plugin's hub.mjs).
  const needed = declared.some(({ d }) => d.paused !== true && (d.live === true || /^(\d+m|hour)$/.test(String(d.every ?? "")) || (Array.isArray(d.after) && d.after.length > 0)));
  // A judge whose last run stopped for lack of Claude's lasting token says so
  // in its state, in the plugin's own words (scripts/judge.mjs).
  const noToken = judges.filter(({ n }) => /no lasting token/i.test(String(read(join(folder, n, "state.json"))?.lastError ?? ""))).map(({ n }) => n);
  return { sources: declared.length - judges.length, judges: judges.length, hub: { on: Boolean(mine.routines?.hub), running, needed, here }, noToken };
}

// ---------------------------------------------------------------- the building of the brain

// THE START, WHILE IT GOES ON (2026-11-23). /brain:start opens the view in its
// second part and keeps it open for the rest: the page shows a panel of the
// building (page/build.js), from the plugin's own `start.mjs state` (which says
// whether a start is really going on: `underway`, lately used), trimmed
// to what the panel draws. Asked every few seconds while the start goes on,
// so it is frugal: a computer where no start was ever begun is answered from
// its settings alone, without starting anything, and a start found finished
// is not asked again while the settings do not change.
/** @type {{ mtime: number, answer: import("./contract.d.ts").StartResponse } | null} */
let finishedStart = null;
/** @returns {Promise<import("./contract.d.ts").StartResponse>} */
async function readStart() {
  const mine = userSettings();
  if (!mine.start?.began && !mine.startNow?.doing && !mine.startNow?.paused) return { ok: true, underway: false, part: null, next: null, parts: [], blocks: [], doing: null, paused: null, began: null };
  let mtime = 0;
  try {
    mtime = statSync(CONFIG).mtimeMs;
  } catch {
    mtime = 0;
  }
  if (finishedStart && finishedStart.mtime === mtime) return finishedStart.answer;
  const asked = await askPlugin(PLUGIN, BRAIN, "start.mjs", ["state"]);
  if (!asked.ok) return { ok: false, underway: false, part: null, next: null, parts: [], blocks: [], doing: null, paused: null, began: null, error: asked.error };
  const s = asked.said;
  /** @type {import("./contract.d.ts").StartResponse} */
  const answer = {
    ok: true,
    underway: s.underway === true,
    part: typeof s.part === "string" ? s.part : null,
    next: typeof s.next === "string" ? s.next : null,
    parts: (Array.isArray(s.parts) ? s.parts : []).map((/** @type {any} */ p) => ({ id: String(p.id), state: String(p.state) })),
    blocks: (Array.isArray(s.session?.blocks) ? s.session.blocks : []).map((/** @type {any} */ b) => ({ id: String(b.id), state: String(b.state), ...(b.progress ? { progress: b.progress } : {}) })),
    doing: typeof s.doing?.text === "string" ? s.doing.text : null,
    paused: s.paused ? { at: String(s.paused.at ?? ""), ...(s.paused.note ? { note: String(s.paused.note) } : {}) } : null,
    began: typeof s.session?.began === "string" ? s.session.began : null,
  };
  finishedStart = answer.underway ? null : { mtime, answer };
  return answer;
}

// ---------------------------------------------------------------- validating a note

/**
 * The person validates a note (or puts it back as a seed): the plugin's
 * `promote.mjs --note <slug> --to trusted|seed --who person`, which answers
 * one JSON line ({ ok, note, status, event } or { ok: false, error }). Asked
 * like the other commands of the plugin: never on the server's own thread,
 * one at a time. A plugin that has no such script yet is told apart
 * ("not-available") from one that refused.
 * @param {string} slug
 * @param {string} to "trusted" or "seed"
 * @returns {Promise<import("./contract.d.ts").ValidateResponse>}
 */
async function validateNote(slug, to) {
  // (The slug becomes an argument of the plugin's script: a note's name, never something that reads as an option.)
  if (!isNoteName(slug) || (to !== "trusted" && to !== "seed")) return { ok: false, code: "invalid", error: "a note's name, and trusted or seed" };
  const answer = await askPlugin(PLUGIN, BRAIN, "promote.mjs", ["--note", slug, "--to", to, "--who", "person"], { HVBRAIN_WHO: "person" });
  if (!answer.ok) {
    if (answer.code === "refused") console.error(`validate ${slug}: refused (${answer.error})`);
    return { ok: false, code: answer.code === "refused" || answer.code === "not-available" || answer.code === "no-answer" ? answer.code : "no-answer", error: answer.error };
  }
  // The map carries each note's status: the index is brought up to date
  // apart, and its watching then tells the pages.
  refreshIndexApart();
  return { ok: true, note: slug, status: answer.said.status === "seed" ? "seed" : answer.said.status === "trusted" ? "trusted" : to, event: String(answer.said.event ?? "") };
}

/** @param {unknown} slug @returns {slug is string} a note's name: never empty, never something that reads as an option */
const isNoteName = (slug) => typeof slug === "string" && /^[\p{L}\p{N}._-]+$/u.test(slug) && !slug.startsWith("-") && slug.length <= 200;
/** How many notes one request validates at most (the page sends a longer list in several). */
const BATCH_MAX = 300;

/**
 * SEVERAL SEEDS VALIDATED AT ONCE (2026-11-21, a decision of the person): the
 * seeds the filters leave on the map, after one confirmation. The plugin's
 * `promote.mjs --notes <a,b,c> --to trusted --who person` does them in one go
 * and answers `{ ok, done, unchanged, refused: [{ note, error }] }`. A plugin
 * whose promote.mjs only knows one note at a time is asked note by note: the
 * person gets the same answer.
 * @param {unknown} notes the slugs
 * @returns {Promise<import("./contract.d.ts").ValidateBatchResponse>}
 */
async function validateNotes(notes) {
  const slugs = Array.isArray(notes) ? [...new Set(notes)] : [];
  if (!slugs.length || slugs.length > BATCH_MAX || !slugs.every(isNoteName)) return { ok: false, code: "invalid", error: `between 1 and ${BATCH_MAX} notes' names` };
  const names = /** @type {string[]} */ (slugs);
  const answer = await askPlugin(PLUGIN, BRAIN, "promote.mjs", ["--notes", names.join(","), "--to", "trusted", "--who", "person"], { HVBRAIN_WHO: "person" });
  const said = answer.said;
  /** @type {import("./contract.d.ts").ValidateBatchResponse} */
  let result;
  if (said && (Array.isArray(said.done) || Array.isArray(said.refused))) {
    // What the plugin did, note by note (it may have refused some and done the others).
    const strings = (/** @type {unknown} */ list) => (Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
    const refused = Array.isArray(said.refused) ? said.refused.filter((r) => r && typeof r.note === "string").map((r) => ({ note: String(r.note), error: String(r.error ?? "").slice(0, 300) })) : [];
    result = { ok: true, done: strings(said.done), unchanged: strings(said.unchanged), refused };
  } else if (!answer.ok && (answer.code === "not-available" || (answer.code === "refused" && /^usage:/i.test(answer.error)))) {
    // A promote.mjs of before the batches: one note at a time, the same answer.
    result = { ok: true, done: [], unchanged: [], refused: [] };
    for (const slug of names) {
      const one = await askPlugin(PLUGIN, BRAIN, "promote.mjs", ["--note", slug, "--to", "trusted", "--who", "person"], { HVBRAIN_WHO: "person" });
      if (!one.ok) {
        if (one.code === "not-available") return { ok: false, code: "not-available", error: one.error };
        result.refused.push({ note: slug, error: one.error });
      } else if (one.said.unchanged) result.unchanged.push(slug);
      else result.done.push(slug);
    }
  } else if (answer.ok) {
    return { ok: false, code: "no-answer", error: "the plugin did not say what it did" };
  } else {
    if (answer.code === "refused") console.error(`validate ${names.length} notes: refused (${answer.error})`);
    return { ok: false, code: answer.code === "refused" ? "refused" : "no-answer", error: answer.error };
  }
  for (const r of result.refused) console.error(`validate ${r.note}: refused (${r.error})`);
  if (result.done.length) refreshIndexApart();
  return result;
}

// ---------------------------------------------------------------- the file manager

/**
 * Shows a file or a folder in the system's file manager: the Explorer, the
 * Finder, or the Linux desktop's. A file shows selected there when the system
 * knows how; otherwise its folder opens.
 * @param {string} target a path the caller took from the brain's own files, never from a request
 */
function showInFileManager(target) {
  // (HVBRAIN_OPEN=off: a test never opens a window on the person's screen.)
  if (process.env.HVBRAIN_OPEN === "off") return;
  const isFile = statSync(target).isFile();
  /** @type {[string, string[]]} */
  const [command, args] =
    process.platform === "win32" ? ["explorer.exe", isFile ? [`/select,${target.replaceAll("/", "\\")}`] : [target.replaceAll("/", "\\")]]
    : process.platform === "darwin" ? ["open", isFile ? ["-R", target] : [target]]
    : ["xdg-open", [isFile ? dirname(target) : target]];
  // Without an error listener, a missing command would kill the server.
  spawn(command, args, { detached: true, stdio: "ignore", windowsHide: false }).on("error", (e) => console.error(`open: ${e.message}`)).unref();
  // IN FRONT (2026-11-20). On Windows, a window opened by a program that
  // runs in the background (this server) opens BEHIND the window in use:
  // the folder was open, under the brain's own window. A small script
  // waits for the Explorer window of that folder and brings it forward.
  if (process.platform === "win32") {
    spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", BRING_FORWARD], { detached: true, stdio: "ignore", windowsHide: true, env: { ...process.env, HVBRAIN_OPEN_FOLDER: (isFile ? dirname(target) : target).replaceAll("/", "\\") } }).on("error", () => {}).unref();
  }
}

// ---------------------------------------------------------------- HTTP

/** @type {Record<string, string>} */
// (2026-11-24) The fonts of the Hypervibe design (page/fonts/): served with
// their own type, under nosniff. The page's policy allows them already: its
// default-src 'self' covers the fonts, nothing comes from elsewhere.
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

/**
 * Answers with JSON.
 * @param {Response} res
 * @param {unknown} body an object, or JSON already written
 * @param {{ status?: number, noStore?: boolean }} [how] `noStore`: what is read must never come from a cache
 */
function sendJson(res, body, { status = 200, noStore = false } = {}) {
  res.writeHead(status, { "content-type": MIME[".json"], ...(noStore ? { "cache-control": "no-store" } : {}) });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

// THE PAGE'S FILES, KEPT IN MEMORY (2026-11-18). The page is forty small
// files, and on a computer whose antivirus looks at every file opened each
// one took 85 ms to leave the disk: 1.4 second of the opening, measured. A
// file is read once, and again only when its date or its size changed (asking
// for those opens nothing): the page edited is still the page served.
/** @type {Map<string, { stamp: string, body: Buffer }>} */
const pageFiles = new Map();
/** @param {string} file @returns {Buffer | null} the file's content, null when there is no such file */
function pageFile(file) {
  let st;
  try {
    st = statSync(file);
  } catch {
    pageFiles.delete(file);
    return null;
  }
  if (!st.isFile()) return null;
  const stamp = `${st.mtimeMs}:${st.size}`;
  const kept = pageFiles.get(file);
  if (kept?.stamp === stamp) return kept.body;
  const body = readFileSync(file);
  pageFiles.set(file, { stamp, body });
  return body;
}

/** Reads the page's files ahead, one a turn of the loop: the first opening after a start does not pay for the disk either. */
function readPageAhead() {
  let names = [];
  try {
    names = [...readdirSync(join(HERE, "page")), ...readdirSync(join(HERE, "page", "i18n")).map((n) => join("i18n", n))];
  } catch {
    return;
  }
  const next = () => {
    const n = names.shift();
    if (!n) return;
    pageFile(join(HERE, "page", n));
    setImmediate(next);
  };
  setImmediate(next);
}

// THE DOOR (2026-11-10, audit A1). The server only listens to this machine,
// but the person's browser is on it too: any web page can send requests to
// 127.0.0.1. Three checks, before any route:
//   1. `Host`: only this address. A foreign domain name that points to
//      127.0.0.1 ("DNS rebinding") would otherwise become the same origin and
//      read everything, notes and directory included.
//   2. `Origin`: when the browser says it, it must be this page.
//   3. `Sec-Fetch-Site`, on the API: the browser says itself where the request
//      comes from (a header a page cannot forge); only this page
//      (`same-origin`) or the address bar (`none`) get through. An image or a
//      form from another site therefore triggers nothing any more.
// A program of the machine (the plugin's hook, open.mjs) sends none of these
// headers: it gets through, it already had all the person's rights.
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);
/** @param {Request} req @param {string} path @returns {"host" | "origin" | "site" | null} why the request is refused, or null */
function refusal(req, path) {
  if (!HOSTS.has(String(req.headers.host ?? "").toLowerCase())) return "host";
  const origin = req.headers.origin;
  if (origin && !ORIGINS.has(origin)) return "origin";
  const site = req.headers["sec-fetch-site"];
  if (path.startsWith("/api/") && site && site !== "same-origin" && site !== "none") return "site";
  return null;
}
/** Everything that writes, starts a process or calls a tool: never by a GET. (POST /api/settings is told apart from its GET in the route.) */
const EFFECT_ROUTES = new Set(["/api/code", "/api/suggest", "/api/fetch", "/api/territories/redo", "/api/territories/rename", "/api/health", "/api/open", "/api/open-note", "/api/now", "/api/undo", "/api/exclude", "/api/catch-up", "/api/validate", "/api/index/refresh", "/api/executive/translate"]);

// WHAT EVERY ANSWER CARRIES (2026-11-21, audit 2). The page could be shown in
// an invisible frame of another site, whose clicks then fell on its buttons
// (a pause, a refresh, an answer to a judge): no answer may be framed any
// more. What the page may load is its own files only (its styles written in
// the markup and the image of its icon aside), and a file is never taken for
// another kind than the one said.
/** @type {[string, string][]} */
const PROTECTION = [
  ["x-frame-options", "DENY"],
  ["content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "no-referrer"],
  ["cross-origin-resource-policy", "same-origin"],
];
/** The page's own documents: served to who carries the cookie, or brings a code (see THE TOKEN). */
const DOCUMENTS = new Set(["/", "/index.html", "/history.html", "/legend.html"]);

const server = createServer(async (req, res) => {
  for (const [name, value] of PROTECTION) res.setHeader(name, value);
  // AN ADDRESS THAT CANNOT BE READ IS A BAD REQUEST (2026-11-21, audit 1).
  // `GET //` (an image of any web page is enough to send it) threw here,
  // before every check and outside every `try`: the server stopped.
  let url;
  try {
    url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    return void res.end("bad request");
  }
  const p = url.pathname;
  const query = url.searchParams;
  try {
    const say = words();
    const refused = refusal(req, p);
    if (refused) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      return void res.end(say.refused(refused));
    }
    if (EFFECT_ROUTES.has(p) && req.method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      return void res.end();
    }
    // THE TOKEN (see above): everything under /api/ but the ping, and the logos.
    if (((p.startsWith("/api/") && p !== "/api/ping") || p === "/logos.json") && !hasToken(req)) {
      // A PAGE OPENED BEFORE THE TOKEN EXISTED (or whose cookie was removed)
      // reconnects its stream without it: it is told to reload, which gives
      // it its cookie. Refused outright, its stream would stop for good, and
      // the window would stay dead until someone thought of reloading it.
      if (p === "/api/stream") {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
        return void res.end(message("reload", { at: new Date().toISOString() }));
      }
      res.writeHead(401, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return void res.end(say.refused("token"));
    }
    // Who answers, and for which brain: on a machine with several accounts,
    // the port is the same for all, and open.mjs must know whether it talks
    // to its own.
    // A third line since 2026-11-17: which process answers, and from which
    // copy of the plugin (scripts/live.mjs only ever stops a server that says
    // so itself; a view of before, a repository of its own, says two lines).
    // ONLY TO WHO SHOWS THE TOKEN (2026-11-27): the brain's folder, the
    // plugin's and the process number were given to anything that asked.
    // Without the token, the ping says that a view answers, and no more.
    if (p === "/api/ping") {
      if (!hasToken(req)) return void res.end(`brain-live\n\n${JSON.stringify({ locked: true })}`);
      return void res.end(`brain-live\n${BRAIN_KEY}\n${JSON.stringify({ pid: process.pid, version: VERSION, root: PLUGIN.replaceAll("\\", "/"), permanent: process.argv.includes("--permanent"), started: STARTED, tokenKept: TOKEN_KEPT, ...(lastUnconnected ? { unconnected: new Date(lastUnconnected).toISOString() } : {}) })}`);
    }
    // A code for one opening of the window (scripts/live.mjs, which showed the token).
    if (p === "/api/code") return sendJson(res, { ok: true, code: newCode(), ms: CODE_MS }, { noStore: true });
    if (p === "/api/setup") return sendJson(res, readSetup(), { noStore: true });
    if (p === "/api/start") return sendJson(res, await readStart(), { noStore: true });
    // The words of this brain, for a page that does not draw the map (the
    // history, the help): its language above all.
    if (p === "/api/vocabulary") return sendJson(res, vocabulary(BRAIN), { noStore: true });
    if (p === "/api/map") return sendJson(res, readMap(), { noStore: true });
    if (p === "/api/contacts") return sendJson(res, readContacts(), { noStore: true });
    if (p === "/api/executive") return sendJson(res, readExecutive(), { noStore: true });
    if (p === "/api/executive/skill") return sendJson(res, readSkill(query.get("file") ?? ""), { noStore: true });
    if (p === "/api/skills-used") return sendJson(res, skillsSince(query.get("since") ?? new Date(Date.now() - 86_400_000).toISOString()), { noStore: true });
    if (p === "/api/executive/translate" && req.method === "POST") return sendJson(res, await translateSkill(query.get("file") ?? "", query.get("lang") ?? ""), { noStore: true });
    if (p === "/api/suggest" && req.method === "POST") {
      // JSON only (a form of a third-party page cannot send any without
      // permission), and a message of human size.
      if (!String(req.headers["content-type"] ?? "").includes("application/json")) {
        res.writeHead(415);
        return void res.end();
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 200_000) {
          res.writeHead(413);
          return void res.end();
        }
      }
      try {
        /** @type {Partial<import("./contract.d.ts").SuggestBody>} */
        const { prompt, seen } = JSON.parse(body || "{}");
        return sendJson(res, await suggest(String(prompt ?? ""), seen));
      } catch (e) {
        return sendJson(res, { error: String(e.message).slice(0, 200) }, { status: 500 });
      }
    }
    if (p === "/api/weights") return sendJson(res, weights(BRAIN), { noStore: true });
    if (p === "/api/usage") {
      let lines = usageLines();
      // `since`: only the lines from a date on (the activity panel only needs
      // today, not the whole journal).
      const since = Date.parse(query.get("since") ?? "");
      if (Number.isFinite(since)) lines = lines.filter((l) => Date.parse(l.at) >= since);
      return sendJson(res, lines, { noStore: true });
    }
    if (p === "/api/catalogue") return sendJson(res, readCatalogue(), { noStore: true });
    if (p === "/api/fetch" && req.method === "POST") return sendJson(res, await fetchAddress(query.get("address") ?? ""));
    // THE TERRITORIES OF THE SEMANTIC VIEW (2026-11-09): stable, kept in
    // index/territories.json, named by the person, else by an AI, else by
    // their keywords (territories.mjs).
    if (p === "/api/territories" || p === "/api/territories/redo") {
      // (A reading takes the cutting as it is kept; only the POST cuts again.)
      const redo = p.endsWith("/redo");
      const { positions, ...rest } = currentTerritories(map?.built === builtAt(BRAIN) ? map.notes : graph(BRAIN).notes, { redo });
      // A new cutting moves the notes: the pages read the map again.
      if (redo) broadcast("map", { at: new Date().toISOString() });
      /** @type {import("./contract.d.ts").TerritoriesResponse} */
      const body = rest;
      return sendJson(res, body, { noStore: true });
    }
    if (p === "/api/territories/rename" && req.method === "POST") return sendJson(res, rename(BRAIN, query.get("id") ?? "", query.get("name") ?? ""));
    // THE SETTINGS (2026-11-09): the rhythm of each source; for each judge (a
    // live source read by an AI) its model, its hours, the size of its
    // batches. All of it lives in the source.json of each.
    if (p === "/api/settings") {
      /** @typedef {import("./contract.d.ts").SettingsSaved} SettingsSaved */
      /** @param {SettingsSaved} body */
      const saved = (body) => sendJson(res, body);
      const folder = join(BRAIN, "sources");
      // A brain without any source: empty settings, not an error.
      if (!existsSync(folder)) {
        if (req.method === "POST") return sendJson(res, /** @type {SettingsSaved} */ ({ ok: false, error: say.sourceUnknown }), { noStore: true });
        /** @type {import("./contract.d.ts").SettingsResponse} */
        const none = { sources: [], judges: [], models: [] };
        return sendJson(res, none, { noStore: true });
      }
      /** @returns {{ n: string, d: Record<string, any> }[]} every source that declares itself, with its declaration */
      const declared = () => readdirSync(folder).flatMap((n) => { try { const d = JSON.parse(readFileSync(join(folder, n, "source.json"), "utf8")); return d && typeof d === "object" && !Array.isArray(d) ? [{ n, d }] : []; } catch { return []; } });
      const judges = declared().filter((x) => x.d.kind === "claude" && x.d.live === true && x.d.enabled !== false);
      // The rhythms a source may take: a source read by an AI (kind claude)
      // costs at every run, it stays at the evening or the week.
      /** @param {Record<string, any>} d */
      // (The brain's clock beats at the half hour: a quarter of an hour is no
      // longer offered. A source already set so keeps its own choice shown.)
      /** @param {Record<string, any>} d */
      const choices = (d) => (d.kind === "claude" ? ["day", "week"] : [...(d.every === "15m" ? ["15m"] : []), "30m", "hour", "day", "week"]);
      // THE PAUSE (2026-11-10): a source or a judge that is paused no longer
      // runs by itself, and stays visible. The plugin writes it (sources.mjs
      // pause | resume): it notes the event in its journal.
      if (req.method === "POST" && query.has("paused")) {
        const name = String(query.get("source") ?? "").replace(/[^a-z0-9-]/gi, "");
        if (!name || !existsSync(join(folder, name, "source.json"))) return saved({ ok: false, error: say.sourceUnknown });
        const paused = query.get("paused") === "1";
        // WITHOUT HOLDING THE SERVER (2026-11-21, audit 15 and 16): the script
        // was waited for on the server's own thread (every page froze for as
        // long as it ran), and when it failed the start of its error output,
        // a path of the machine included, was shown to the person. It is now
        // asked like every other command of the plugin; what it said instead
        // of an answer stays in the server's log.
        const answer = await askPlugin(PLUGIN, BRAIN, "sources.mjs", [paused ? "pause" : "resume", name]);
        if (!answer.ok) console.error(`settings: ${name} was not ${paused ? "paused" : "resumed"} (${answer.code}: ${answer.error})`);
        return saved(answer.ok ? { ok: true, paused } : { ok: false, error: answer.code === "no-answer" ? say.pluginSilent : say.pluginFailed });
      }
      // WRITTEN WHOLE, FROM WHAT THE FILE HOLDS NOW (2026-11-21, audit 8). A
      // declaration was read, changed after a wait, then written in place: a
      // reader that came during the write saw an empty file, and what another
      // program had written meanwhile (an exclusion added from a terminal)
      // was written over. It is read again right before it is written, with
      // nothing awaited in between, and written beside then renamed. A file
      // that is there and cannot be read is never written over.
      /**
       * Changes a source's declaration.
       * @param {string} name
       * @param {(d: Record<string, any>) => string | null} change changes `d` in place; returns why it refuses, or null
       * @returns {{ ok: true, d: Record<string, any> } | { ok: false, error: string }}
       */
      const changeDeclaration = (name, change) => {
        const file = join(folder, name, "source.json");
        const read = readForWrite(file);
        if (read.unreadable) return { ok: false, error: say.sourceUnreadable };
        if (read.missing || !read.value || typeof read.value !== "object" || Array.isArray(read.value)) return { ok: false, error: say.sourceUnknown };
        const refusal = change(read.value);
        if (refusal) return { ok: false, error: refusal };
        writeFileAtomic(file, `${JSON.stringify(read.value, null, 2)}\n`);
        return { ok: true, d: read.value };
      };
      if (req.method === "POST" && query.has("every")) {
        const every = query.get("every") ?? "";
        const done = changeDeclaration(String(query.get("source") ?? "").replace(/[^a-z0-9-]/gi, ""), (d) => {
          if (d.kind === "claude" && d.live) return say.judgeFollowsSources;
          if (!choices(d).includes(every)) return say.rhythmNotAllowed;
          d.every = every;
          return null;
        });
        return saved(done.ok ? { ok: true } : done);
      }
      if (req.method === "POST") {
        const judge = judges.find((x) => x.n === query.get("source"));
        if (!judge) return saved({ ok: false, error: say.judgeUnknown });
        const { J } = await loadEngine();
        // WHOLE NUMBERS ONLY (2026-11-21, audit 9). "7.5" as the first hour was
        // answered "saved", and the plugin, which only takes whole numbers,
        // went on with its defaults: the judge worked from 7 to 23 whatever
        // the page showed. What is not a whole number is refused, in words; a
        // batch out of its bounds is brought back inside them, and the answer
        // says what was kept.
        /** @param {string} key @returns {number} the whole number given, NaN otherwise */
        const whole = (key) => (/^\s*-?\d+\s*$/.test(query.get(key) ?? "") ? Number(query.get(key)) : NaN);
        const done = changeDeclaration(judge.n, (d) => {
          if (query.has("model")) {
            if (!J.JUDGE_MODELS.includes(query.get("model"))) return say.modelUnknown;
            d.model = query.get("model");
          }
          if (query.has("batch")) {
            if (!Number.isInteger(whole("batch"))) return say.wholeNumbers;
            d.batch = Math.min(30, Math.max(1, whole("batch")));
          }
          if (query.has("from") && query.has("to")) {
            if (!Number.isInteger(whole("from")) || !Number.isInteger(whole("to"))) return say.wholeNumbers;
            const from = Math.min(23, Math.max(0, whole("from"))), to = Math.min(24, Math.max(1, whole("to")));
            if (to <= from) return say.hoursOrder;
            d.hours = [from, to];
          }
          // THE CAP OF A DAY (2026-11-17): a whole number of tokens, written
          // where the plugin reads it; no cap at all is the key left out.
          if (query.has("dailyTokens")) {
            const cap = Number(query.get("dailyTokens"));
            if (!Number.isInteger(cap) || cap < 0 || cap > 1_000_000_000) return say.capInvalid;
            if (cap) d.dailyTokens = cap;
            else delete d.dailyTokens;
          }
          return null;
        });
        if (!done.ok) return saved(done);
        if (query.has("dailyTokens")) broadcast("judges", { at: new Date().toISOString() });
        const kept = J.judgeSettings(done.d);
        return saved({ ok: true, model: kept.model, batch: kept.batch, hours: [kept.hours[0], kept.hours[1]] });
      }
      // The sources and their rhythm, for the page: which tool, which pace.
      const { bySource } = connectedTools(BRAIN);
      const sources = declared()
        .filter((x) => x.d.enabled !== false && Array.isArray(x.d.tools) && x.d.tools.length && !(x.d.kind === "claude" && x.d.live))
        .map(({ n, d }) => ({ name: n, tools: bySource.get(n) ?? [], paused: d.paused === true, every: d.every ?? "week", choices: choices(d), description: String(d.description ?? "").replace(/\s*\([^)]*:\/\/[^)]*\)/g, ""), rhythm: rhythm(say, d.every) ?? "" }));
      const { J } = await loadEngine();
      /** @type {import("./contract.d.ts").SettingsResponse} */
      const body = { sources, judges: judges.map(({ n, d }) => { const s = J.judgeSettings(d); return { name: n, tools: bySource.get(n) ?? [], paused: d.paused === true, model: s.model, batch: s.batch, hours: s.hours, exclude: Array.isArray(d.exclude) ? d.exclude.map(String) : [], ...judgeState(BRAIN, n, d) }; }), models: J.JUDGE_MODELS };
      return sendJson(res, body, { noStore: true });
    }
    // THE JUDGES (2026-11-17): what each one cost, run by run (the page does
    // the counting, by period), and where it stands today: its cap, a pile it
    // holds until the person answers.
    if (p === "/api/judges") {
      const { bySource } = connectedTools(BRAIN);
      const since = Date.parse(query.get("since") ?? "");
      /** @type {import("./contract.d.ts").JudgesResponse} */
      const body = { judges: judgeCosts(BRAIN, Number.isFinite(since) ? new Date(since).toISOString() : "").map((j) => ({ ...j, tools: bySource.get(j.name) ?? [] })) };
      return sendJson(res, body, { noStore: true });
    }
    // What a judge never reads, and the answer to a judge that holds its pile:
    // the plugin does both (judges.mjs). A refusal is an answer like another,
    // with its code; only a judge the brain does not declare is a 404.
    if ((p === "/api/exclude" || p === "/api/catch-up") && req.method === "POST") {
      const name = query.get("source") ?? "";
      const answer = p === "/api/exclude"
        ? await exclude(PLUGIN, BRAIN, name, query.has("remove") ? "remove" : "add", query.get("remove") ?? query.get("add") ?? "")
        : await catchUp(PLUGIN, BRAIN, name, query.get("answer") ?? "", Number(query.get("n") ?? ""));
      if (answer.ok) broadcast("judges", { at: new Date().toISOString() });
      return sendJson(res, answer, { status: !answer.ok && answer.code === "unknown-judge" ? 404 : 200, noStore: true });
    }
    if (p === "/api/tools") {
      // What is connected, not a list kept by hand (tools.mjs).
      const { families, tools } = connectedTools(BRAIN);
      /** @type {import("./contract.d.ts").ToolsResponse} */
      const body = { families, tools };
      return sendJson(res, body, { noStore: true });
    }
    // Checking a connection again, or removing it: the plugin does it (health.mjs).
    if (p === "/api/health" && req.method === "POST") {
      const key = query.get("key") ?? "";
      // Only a connection the health check knows: never a made-up key
      // ("source:../x" would write outside the folder of the sources).
      let known = {};
      try { known = JSON.parse(readFileSync(join(INDEX, "health.json"), "utf8")); } catch { /* no health check: nothing is known */ }
      if (!known || typeof known !== "object" || !Object.hasOwn(known, key)) return sendJson(res, { ok: false, error: say.connectionUnknown }, { status: 404 });
      /** @type {import("./contract.d.ts").HealthAction} */
      const action = query.get("action") === "remove" ? "remove" : "check";
      const args = action === "remove" ? ["remove", key] : ["--only", key, "--json"];
      /** @type {string} */
      const answer = await new Promise((done) => {
        const child = spawn(process.execPath, [script("health.mjs"), ...args], { cwd: BRAIN, windowsHide: true });
        let out = "";
        child.stdout.on("data", (b) => (out += b));
        child.stderr.resume(); // never read: emptied, otherwise the child may hang
        child.on("error", () => done("{}"));
        child.on("close", () => done(out.trim().split("\n").pop() || "{}"));
      });
      return sendJson(res, answer, { noStore: true });
    }
    // Showing a watched folder in the file manager. Only a path the brain
    // already watches (tools.mjs), never a path that came with the request.
    if (p === "/api/open" && req.method === "POST") {
      const tool = connectedTools(BRAIN).tools.find((x) => x.id === query.get("id") && x.paths?.length);
      const target = tool?.paths?.[Number(query.get("index") ?? 0)] ?? null;
      /** @param {boolean} ok @returns {import("./contract.d.ts").OpenResponse} */
      const opened = (ok) => ({ ok });
      if (!target || !existsSync(target)) return sendJson(res, opened(false), { status: 404 });
      showInFileManager(target);
      return sendJson(res, opened(true));
    }
    // Showing a note's own file in the file manager (2026-11-21). The path is
    // the one the index holds for that note, inside the brain's vault: never
    // a path that came with the request.
    if (p === "/api/open-note" && req.method === "POST") {
      const slug = query.get("slug") ?? "";
      const rel = /^[\p{L}\p{N}._-]+$/u.test(slug) ? noteFile(BRAIN, slug) : null;
      const target = rel ? resolve(BRAIN, rel) : null;
      /** @type {import("./contract.d.ts").OpenNoteResponse} */
      const no = { ok: false };
      if (!target || !target.startsWith(VAULT + sep) || !existsSync(target)) return sendJson(res, no, { status: 404 });
      showInFileManager(target);
      /** @type {import("./contract.d.ts").OpenNoteResponse} */
      const yes = { ok: true };
      return sendJson(res, yes);
    }
    // The index brought up to date, asked for by a page that has just read a
    // note the index is behind of (the reading itself starts nothing).
    if (p === "/api/index/refresh" && req.method === "POST") {
      refreshIndexApart();
      /** @type {import("./contract.d.ts").RefreshResponse} */
      const body = { ok: true };
      return sendJson(res, body);
    }
    // VALIDATING A NOTE (2026-11-21). The person says a note the machine wrote
    // is right (or puts it back as a seed). The plugin does it (promote.mjs):
    // the write is journaled, and can be undone like the others.
    if (p === "/api/validate" && req.method === "POST") {
      // Several at once (the seeds the filters leave): their names in a JSON
      // body, `{ "notes": [...] }`, a list too long for an address.
      if (String(req.headers["content-type"] ?? "").includes("application/json")) {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 100_000) {
            res.writeHead(413);
            return void res.end();
          }
        }
        /** @type {unknown} */
        let notes = null;
        try {
          notes = JSON.parse(body || "{}")?.notes;
        } catch {
          notes = null;
        }
        return sendJson(res, await validateNotes(notes), { noStore: true });
      }
      const answer = await validateNote(query.get("note") ?? "", query.get("to") ?? "trusted");
      return sendJson(res, answer, { noStore: true });
    }
    if (p === "/api/tool") {
      const id = query.get("id") ?? "";
      /** @type {import("./contract.d.ts").ToolResponse} */
      const body = { ...toolDetail(BRAIN, id), history: history(BRAIN, id), next: nextRuns(BRAIN)[id] ?? null };
      return sendJson(res, body, { noStore: true });
    }
    // What changed in a note, at one write of the history.
    if (p === "/api/change") return sendJson(res, await change(BRAIN, query.get("note") ?? "", query.get("at") ?? ""), { noStore: true });
    // The full history of a tool (the window of the logs): thirty days.
    if (p === "/api/history") {
      const id = query.get("id") ?? "";
      const tool = connectedTools(BRAIN).tools.find((x) => x.id === id);
      /** @type {import("./contract.d.ts").HistoryResponse} */
      const body = { name: tool?.name ?? id, runs: history(BRAIN, id, 500) };
      return sendJson(res, body, { noStore: true });
    }
    // Taking back one write of the history (undoWrite, above). An id no
    // write carries is a 404; any other refusal is an answer like another,
    // with its code (as POST /api/settings says a setting was not saved).
    if (p === "/api/undo" && req.method === "POST") {
      const answer = await undoWrite(query.get("id") ?? "");
      return sendJson(res, answer, { status: !answer.ok && answer.code === "unknown" ? 404 : 200, noStore: true });
    }
    // The ring of each tool: when its sources will run.
    if (p === "/api/next") return sendJson(res, nextRuns(BRAIN), { noStore: true });
    // THE "NOW" BUTTON (2026-11-08): the sources of this tool run at the
    // hub's next beat (less than a minute), without waiting for their time,
    // the calm of their folder or the judge's gathering. A flag put where the
    // hub reads them; never a source started twice.
    if (p === "/api/now" && req.method === "POST") {
      const id = query.get("id") ?? "";
      const { bySource } = connectedTools(BRAIN);
      const own = [...bySource].filter(([, ids]) => ids.includes(id)).map(([n]) => n);
      /** @type {string[]} */
      const asked = [];
      for (const n of own) {
        /** @type {Record<string, any>} */
        let d = {};
        try { d = JSON.parse(readFileSync(join(BRAIN, "sources", n, "source.json"), "utf8")); } catch { continue; }
        if (!d || typeof d !== "object" || d.enabled === false) continue;
        // (Written whole: the hub reads these flags, and must never find one half written.)
        if (d.live) {
          writeFileAtomic(join(HUB, "judge", `${n}.now`), new Date().toISOString());
        } else if (d.kind === "script" || d.kind === "step") {
          const at = new Date().toISOString();
          writeFileAtomic(join(HUB, "due", n), `${JSON.stringify({ at, first: at, why: "now" })}\n`);
        } else continue;
        asked.push(n);
      }
      /** @type {import("./contract.d.ts").NowResponse} */
      const body = { ok: asked.length > 0, sources: asked };
      return sendJson(res, body);
    }
    if (p === "/api/written") return sendJson(res, writtenSince(query.get("since") ?? ""), { noStore: true });
    if (p === "/logos.json") {
      const { logos } = connectedTools(BRAIN);
      // (The image's place on the disk stays here.)
      const body = /** @type {import("./contract.d.ts").LogosResponse} */ (Object.fromEntries(Object.entries(logos).map(([k, { file, ...v }]) => [k, v])));
      return sendJson(res, body, { noStore: true });
    }
    if (p === "/api/logo") {
      const logo = connectedTools(BRAIN).logos[query.get("id") ?? ""];
      if (!logo?.file || !existsSync(logo.file)) {
        res.writeHead(404);
        return void res.end();
      }
      res.writeHead(200, { "content-type": MIME[extname(logo.file)] ?? "application/octet-stream" });
      return void res.end(readFileSync(logo.file));
    }
    if (p === "/api/note") return sendJson(res, await readNote(query.get("slug") ?? ""));
    if (p === "/api/stream") {
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
      res.write(message("reads", recentReads.map(withConversation)));
      res.write(message("writes", recentWrites));
      // The recent ends of answers: a page that reloads puts out at once the
      // traces of the answers already ended, instead of waiting for the
      // fallback minute.
      res.write(message("turns", recentTurns()));
      res.write(message("skills", recentSkills().map(withSessionTitle)));
      // Who serves the page: a page opened before a restart of the server
      // sees the identifier change when it reconnects, and reloads.
      res.write(message("version", { server: STARTED }));
      subscribers.add(res);
      const beat = setInterval(() => res.write(": .\n\n"), 25_000);
      req.on("close", () => {
        clearInterval(beat);
        subscribers.delete(res);
        lastWindowAt = Date.now();
      });
      return;
    }
    // The page.
    const file = join(HERE, "page", p === "/" ? "index.html" : p.slice(1));
    const body = file.startsWith(join(HERE, "page") + sep) ? pageFile(file) : null;
    if (!body) {
      res.writeHead(404);
      return void res.end();
    }
    // THE PAGE'S OWN DOCUMENT (see THE TOKEN). With a code that serves: the
    // cookie (no script reads it, no other site's request carries it), and
    // the same address without the code. With its cookie already: the page,
    // and the cookie for another year. With neither: how to open the view.
    if (DOCUMENTS.has(p)) {
      const code = query.get("code");
      const known = hasToken(req);
      if (code !== null) {
        const good = spendCode(code);
        if (good || known) {
          res.writeHead(302, { location: p, "cache-control": "no-store", ...(good ? { "set-cookie": tokenCookie() } : {}) });
          return void res.end();
        }
      }
      if (!known) {
        lastUnconnected = Date.now();
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return void res.end(notConnectedPage());
      }
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", ...(DOCUMENTS.has(p) ? { "set-cookie": tokenCookie() } : {}) });
    res.end(body);
  } catch (e) {
    // The detail stays in the server's log: an error message often carries a
    // path of the machine, which has no business in an answer.
    console.error(`${p}: ${e?.stack ?? e}`);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("error");
  }
});

// The mark of a successor: --restart (--relance until 2026-11-10: a server of
// before that date, restarting itself into this code, still passes the old one).
const RESTART_FLAGS = ["--restart", "--relance"];
let portTries = 0;
server.on("error", (/** @type {NodeJS.ErrnoException} */ e) => {
  // The successor of a restart: the former one frees the port, we try again
  // for ten seconds before giving up.
  if (e.code === "EADDRINUSE" && process.argv.some((a) => RESTART_FLAGS.includes(a)) && (portTries += 1) <= 40) {
    setTimeout(() => server.listen(PORT, "127.0.0.1"), 250);
    return;
  }
  // Already started: the other one serves, this one leaves.
  if (e.code === "EADDRINUSE") process.exit(0);
  console.error(e);
  process.exit(1);
});

// EVERYTHING IS REACTIVE (2026-11-08): nothing is reloaded by hand.
// - The page's code changes (page/): each open page reloads.
// - The server's code changes: it checks the syntax, restarts itself, and the
//   pages, when they reconnect, see another server and reload.
// - The plugin is updated (2026-11-17): its folder is replaced where it is, or
//   a newer copy appears elsewhere and the plugin's settings name it. Either
//   way this server hands the port over to the new code (watchCode).
// - The data (notes, map, tools, health) already comes through the stream.
const STARTED = `${process.pid}-${Date.now()}`;
/** The files whose change restarts the server: its own, and the plugin's version (an update always moves it, even one that leaves the view's files as they were). */
const SERVER_FILES = ["server.mjs", "forward.mjs", "tools.mjs", "activity.mjs", "journal.mjs", "judges.mjs", "brain.mjs", "territories.mjs", "i18n.mjs", "i18n/en.mjs", "i18n/fr.mjs", "../.claude-plugin/plugin.json"];
/** @param {string} a @param {string} b whether two paths name the same folder */
const samePath = (a, b) => resolve(String(a)).toLowerCase() === resolve(String(b)).toLowerCase();
/** @param {string} a @param {string} b whether version `a` is newer than version `b` */
function newer(a, b) {
  const parts = (/** @type {string} */ v) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
/** @type {() => void} the plugin's settings have just changed (set by watchCode) */
let onSettingsChange = () => {};
function watchCode() {
  // THE CODE IS LOOKED AT, NEVER HELD (2026-11-17). fs.watch keeps a handle on
  // what it watches, and on Windows a folder with an open handle inside cannot
  // be renamed: with the view inside the plugin, the plugin's update (which
  // swaps its folder) failed as long as the view ran. fs.watchFile only asks
  // for the date of each file, every two seconds, and holds nothing.
  /** @param {string} file @param {() => void} changed */
  const look = (file, changed) => watchFile(file, { interval: 2000, persistent: false }, (now, before) => {
    if (now.mtimeMs !== before.mtimeMs || now.size !== before.size) changed();
  });
  /** @type {NodeJS.Timeout | undefined} */
  let pageTimer;
  const pageChanged = () => {
    clearTimeout(pageTimer);
    pageTimer = setTimeout(() => broadcast("reload", { at: new Date().toISOString() }), 400);
  };
  try {
    for (const e of readdirSync(join(HERE, "page"), { recursive: true, withFileTypes: true })) if (e.isFile()) look(join(e.parentPath, e.name), pageChanged);
  } catch {
    // without the page being looked at: a reload by hand is enough
  }
  /** @returns {Promise<boolean>} whether a brain-live server answers on the port */
  const answers = async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/api/ping`, { signal: AbortSignal.timeout(800) });
      return (await r.text()).startsWith("brain-live");
    } catch {
      return false;
    }
  };
  /** @param {string} file @returns {boolean} whether a file of code can be started (its syntax; for a JSON file, that it reads) */
  const passes = (file) => {
    if (file.endsWith(".json")) {
      try {
        JSON.parse(readFileSync(file, "utf8"));
        return true;
      } catch {
        return false;
      }
    }
    return spawnSync(process.execPath, ["--check", file], { windowsHide: true, encoding: "utf8" }).status === 0;
  };
  let restarting = false;
  /**
   * Hands the port over to a successor, and only leaves once it answers.
   * @param {string} target the program the successor runs: a server.mjs, or the plugin's launcher
   * @param {string} why for the log
   */
  const handOver = (target, why) => {
    if (restarting) return;
    restarting = true;
    // The port is freed first, then the successor, marked --restart: it tries
    // the port again instead of believing another server already runs (seen
    // on 2026-11-08: a successor in too much of a hurry stopped, and nobody
    // served the page any more).
    for (const res of subscribers) res.end();
    server.closeAllConnections?.();
    server.close(async () => {
      const flags = process.argv.slice(2).filter((a) => !RESTART_FLAGS.includes(a));
      // What the successor says goes to the same log as a server the plugin starts (scripts/live.mjs).
      /** @type {number | "ignore"} */
      let log = "ignore";
      try {
        mkdirSync(join(HUB, "logs"), { recursive: true });
        log = openSync(join(HUB, "logs", "live-server.log"), "a");
      } catch {
        log = "ignore";
      }
      try {
        spawn(process.execPath, [target, ...flags, "--restart"], { cwd: HUB, detached: true, stdio: ["ignore", log, log], windowsHide: true }).on("error", (e) => console.error(`restart: ${e.message}`)).unref();
      } finally {
        if (typeof log === "number") closeSync(log);
      }
      // THE SUCCESSOR ONLY TAKES OVER ONCE IT ANSWERS (2026-11-10). The
      // syntax check does not see everything (a name that a module no longer
      // exports, an error at start): this process waits until the port
      // answers again before leaving, and takes the port back if nobody
      // answers within ten seconds. The page then keeps a server.
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 250));
        if (await answers()) process.exit(0);
      }
      console.error(`restart failed: the successor does not answer, this server goes on (${why})`);
      restarting = false;
      server.listen(PORT, "127.0.0.1");
    });
  };
  const self = join(HERE, "server.mjs");
  // Claude Code's own registry of plugins (an update through its commands
  // writes the new version's folder there). Looked at like the code: never held.
  const REGISTRY = join(process.env.HVBRAIN_HOME || homedir(), ".claude", "plugins", "installed_plugins.json");
  /** @param {string} root a copy of the plugin @returns {string} its version ("" when its manifest cannot be read) */
  const versionOf = (root) => {
    try {
      return String(JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")).version ?? "");
    } catch {
      return "";
    }
  };
  /**
   * The newest other copy of the plugin that carries the view: among the place
   * the plugin's settings name (`pluginRoot`) and those of Claude Code's registry.
   * @param {string} above only a version newer than this one ("" for any)
   * @returns {{ target: string, version: string, root: string } | null}
   */
  const otherCopy = (above) => {
    const places = [String(userSettings().pluginRoot ?? "")];
    try {
      const installed = JSON.parse(readFileSync(REGISTRY, "utf8")).plugins ?? {};
      for (const [key, entries] of Object.entries(installed)) if (key.startsWith("brain@")) for (const e of /** @type {any[]} */ ([]).concat(entries)) places.push(String(e?.installPath ?? ""));
    } catch {
      // no registry (the plugin was uploaded, or is a developer's copy): the settings alone say
    }
    /** @type {{ target: string, version: string, root: string } | null} */
    let best = null;
    for (const root of places) {
      if (!root || samePath(root, PLUGIN)) continue;
      const target = join(root, "live", "server.mjs");
      const version = versionOf(root);
      if (!existsSync(target) || (above && !newer(version, above)) || (best && !newer(version, best.version))) continue;
      best = { target, version, root };
    }
    return best;
  };
  /**
   * This copy of the view is gone (its folder was removed: an update that put
   * the new version elsewhere, then cleaned up). The successor is another copy
   * of the plugin, the newest; else whatever the plugin's launcher finds.
   */
  const moveOut = () => {
    const other = otherCopy("");
    const launcher = join(HUB, "live-launch.mjs");
    const target = other?.target ?? (existsSync(launcher) ? launcher : null);
    if (!target) return void console.error("the view's own files are gone and no other copy of the plugin was found: this server goes on as it is");
    handOver(target, "this copy of the plugin was removed");
  };
  /** @param {string} file the file of code that changed */
  const restart = (file) => {
    if (restarting) return;
    if (!existsSync(self)) {
      // A swap of the folder leaves it missing for an instant: looked at
      // again three seconds later, before concluding it is gone.
      return void setTimeout(() => { if (existsSync(self)) restart(self); else moveOut(); }, 3000);
    }
    if (!existsSync(file) || !passes(file) || !passes(self)) {
      // A file being written, or an error: the server that works is kept.
      console.error(`restart refused, ${file} does not pass the check`);
      return;
    }
    handOver(self, `changed: ${file}`);
  };
  /** @type {NodeJS.Timeout | undefined} */
  let serverTimer;
  for (const name of SERVER_FILES) {
    look(join(HERE, name), () => {
      clearTimeout(serverTimer);
      serverTimer = setTimeout(() => restart(join(HERE, name)), 800);
    });
  }
  // A NEWER COPY OF THE PLUGIN, ELSEWHERE (2026-11-17). An update through
  // Claude Code's own commands puts the new version in a new folder and
  // leaves this one as it is: nothing changes under this server. What tells
  // it is Claude Code's registry of plugins, and the plugin's settings, where
  // a copy writes its place (`pluginRoot`). Only a NEWER version takes over:
  // a developer's copy and the installed one that name themselves in turn
  // must not make the view jump at each of them.
  /** @type {NodeJS.Timeout | undefined} */
  let settingsTimer;
  onSettingsChange = () => {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      // THE BRAIN MOVED (2026-11-17, the plugin's move.mjs): the settings name
      // another folder. This server was started for the folder of before: it
      // starts again, and its successor reads the settings afresh. (Not when
      // HVBRAIN_DIR chose the brain: the settings then do not decide.)
      const brain = userSettings().brain;
      if (!process.env.HVBRAIN_DIR && brain && !samePath(brain, BRAIN) && existsSync(join(String(brain), "brain.json")) && existsSync(self)) return void handOver(self, `the brain is now in ${brain}`);
      const other = otherCopy(VERSION);
      if (other && passes(other.target)) handOver(other.target, `the plugin ${other.version} is in ${other.root}`);
    }, 1000);
  };
  look(REGISTRY, onSettingsChange);
}

prime();
watchBrain();
watchCode();
server.listen(PORT, "127.0.0.1", () => {
  console.log(`${new Date().toISOString()}  ${words().listening(`http://127.0.0.1:${PORT}`)} (plugin ${VERSION}, ${PLUGIN})`);
  readPageAhead();
  // The territories of a brain that has none yet, or that grew while no server ran: made now, by the server itself (a reading never cuts).
  setImmediate(() => keepTerritories({ tell: true }));
  // The plugin's own settings of a judge (its batch, its hours, its gathering), for the rings and the cards (activity.mjs).
  loadEngine().then(({ J }) => useJudgeSettings(J.judgeSettings)).catch((e) => console.error(`the plugin's engine was not loaded at start (${String(e?.message ?? e).slice(0, 200)}): the judges' defaults are the view's own until it is`));
});

// With no window open for three minutes, the server stops. Except in
// permanent mode (--permanent), the one the plugin starts at the opening of
// the session (scripts/live.mjs on): the installed app opens the page
// directly, and must find the server up.
if (!process.argv.includes("--permanent")) setInterval(() => {
  if (subscribers.size === 0 && Date.now() - lastWindowAt > IDLE_STOP_MS) process.exit(0);
}, 30_000).unref();
