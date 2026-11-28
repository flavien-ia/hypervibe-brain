// lock-paths.mjs - What the plugin's locks share (hook-locks.mjs): how a path
// is read, whatever the way it is written, and how a terminal command is read.
//
// WHY (2026-11-27, security audit). The locks compared texts: a path was a
// guard's when it STARTED with the guards' folder, and a command wrote when it
// held a word of a list. Seventeen ways around were shown: a path with a
// segment that says nothing (executive/./guards, executive/skills/../guards),
// a redirection of another shape (>|, &>, 2>), a `cd` into the folder and then
// a bare name, a writer the list did not know (python, dd, node -e), a folder
// renamed from above, a path put together from a variable, a tool of another
// server, MultiEdit. So:
//   - A PATH IS RESOLVED BEFORE IT IS COMPARED: its segments worked out, then
//     as the disk knows it (a link or a junction followed), without regard to
//     case where the disk has none. Both spellings are checked.
//   - A COMMAND IS READ THE OTHER WAY ROUND. It is no longer "refused when it
//     holds a word that writes": a command that NAMES a locked place is
//     refused unless it is one plain reading (cat, grep, ls, git diff... with
//     nothing chained to it, and no redirection but one that sends what it
//     shows to a file outside every lock). What is not known to be a reading
//     is not let near a lock.
// What still escapes is said in docs/executive.md: a name that no text of the
// command holds (built at run time by a program the command starts), and the
// platform's own settings.
//
// It imports nothing of the plugin, to start fast.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const HOME = process.env.HVBRAIN_HOME || homedir();
/** The plugin's folder on this computer: its settings, and the launcher of the guards. */
export const SETTINGS_DIR = join(HOME, ".hypervibe-brain");
const WINDOWS = process.platform === "win32";
const CASELESS = WINDOWS || process.platform === "darwin";

/** The computer's settings of the brain, or {}. (A byte order mark at their head must not open a lock.) */
export function readSettings() {
  let raw = "";
  try {
    raw = readFileSync(join(SETTINGS_DIR, "config.json"), "utf8");
  } catch {
    return {};
  }
  try {
    const o = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (o && typeof o === "object" && !Array.isArray(o)) return o;
  } catch {
    // below
  }
  // THERE AND UNREADABLE IS NOT "NO LOCK" (2026-11-27): the memory's lock is
  // taken as on until the file is repaired (it is where the lock is written).
  return { memory: { lock: true }, unreadable: true };
}

/** The answer of a PreToolUse hook that refuses. @param {string} reason */
export const deny = (reason) => JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } });

/** What Claude Code hands the hook, or null when it cannot be read. */
export function readInput() {
  try {
    const o = JSON.parse(readFileSync(0, "utf8") || "null");
    return o && typeof o === "object" ? o : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ paths

const fwd = (p) => String(p).replaceAll("\\", "/");
/** A path as a shell of this computer may write it, made one Node resolves: ~, $HOME, a drive written the POSIX way. */
function plain(p) {
  let s = String(p).trim().replace(/^file:\/\//i, "");
  s = s.replace(/^~(?=[\\/]|$)/, HOME).replace(/^(\$HOME|\$\{HOME\}|\$env:USERPROFILE|\$\{env:USERPROFILE\}|%USERPROFILE%|\$env:HOME)(?=[\\/]|$)/i, HOME);
  if (WINDOWS) {
    // /c/Users/x (Git Bash), /mnt/c/Users/x (WSL), /cygdrive/c/Users/x.
    s = s.replace(/^\/(?:mnt\/|cygdrive\/)?([a-zA-Z])(?=\/|$)/, (_, d) => `${d}:`);
    s = s.replace(/^\\\\\?\\/, "");
  }
  return s;
}
/**
 * A path as it is written, worked out: its segments resolved from `cwd`, and
 * on Windows what the system itself drops from a name (a trailing dot or
 * space, a stream after a colon). Lower case where the disk has no case.
 * @param {string} p @param {string} [cwd]
 */
export function spelled(p, cwd) {
  let s = fwd(resolve(cwd || process.cwd(), plain(p)));
  if (WINDOWS) s = s.split("/").map((seg, i) => (i === 0 ? seg : seg.replace(/:.*$/, "").replace(/[. ]+$/, "") || seg)).join("/");
  s = s.replace(/\/+$/, "");
  return CASELESS ? s.toLowerCase() : s;
}
/**
 * The same path as the disk knows it: what exists of it read through its
 * links and junctions, what does not exist yet added as it is written.
 * @param {string} p @param {string} [cwd]
 */
export function onDisk(p, cwd) {
  let at = resolve(cwd || process.cwd(), plain(p));
  const rest = [];
  for (let i = 0; i < 64; i++) {
    try {
      return spelled(join(realpathSync.native(at), ...rest));
    } catch {
      const up = dirname(at);
      if (up === at) break;
      rest.unshift(basename(at));
      at = up;
    }
  }
  return spelled(p, cwd);
}
/**
 * A path written with backslashes, on a system whose own separator is the
 * slash, read with slashes; null when there is nothing to read another way.
 * PowerShell takes both separators on every system (`Rename-Item \tmp\brain\executive`
 * renames /tmp/brain/executive on Linux and on a Mac), and Node there reads a
 * backslash as a letter of the name (2026-11-27, the bench on Linux).
 * @param {string} p
 */
const slashed = (p) => (!WINDOWS && String(p).includes("\\") ? String(p).replaceAll("\\", "/") : null);
/**
 * The spellings of a path: as written and as the disk knows it, and both
 * again with its backslashes read as separators where they are not (see
 * `slashed`).
 * @returns {string[]}
 */
export const spellings = (p, cwd) => {
  const out = new Set([spelled(p, cwd), onDisk(p, cwd)]);
  const other = slashed(p);
  if (other !== null) for (const s of [spelled(other, cwd), onDisk(other, cwd)]) out.add(s);
  return [...out];
};
/** Whether `p` is `dir` or lies under it (both spelled the same way). */
export const under = (dir, p) => p === dir || p.startsWith(`${dir}/`);

// ------------------------------------------------------------------ tools

/** The tools that write a file, by their own name. */
export const FILE_TOOL = /^(Write|Edit|MultiEdit|NotebookEdit)$/;
/** What renames, moves or removes a folder, in the shells and in the code handed to an interpreter. */
export const MOVES = /\b(mv|move|ren|rename|rm|rmdir|rd|del|erase|robocopy|xcopy|move-item|rename-item|remove-item|renamesync|rmsync|rmdirsync|unlink|rmtree)\b|os\.rename|shutil\.move|fs\.rename|fs\.rm/i;
/** The command a tool is about to run, when it is one that runs commands (a shell, or a tool of another server that takes one). */
export function commandOf(input) {
  const tool = String(input?.tool_name ?? "");
  if (!isShell(tool) && FILE_TOOL.test(tool)) return undefined;
  const args = input?.tool_input ?? {};
  return ["command", "cmd", "script"].map((k) => args?.[k]).find((v) => typeof v === "string" && v);
}
/** The tools that run a command: the shells, and the terminal of the desktop app. */
export function isShell(tool) {
  return /^(Bash|PowerShell)$/.test(tool) || /run_in_terminal$/.test(tool);
}

/**
 * The paths a tool that is not a shell is about to touch: `file_path`, `path`
 * or `notebook_path` of any tool, and for a tool of another server (MCP) every
 * short text of its input that could be a path (a destination, a source, a
 * list of files): what such a tool calls its arguments is not known here.
 * @param {{ tool_name?: string, tool_input?: any }} input
 * @returns {string[]}
 */
export function pathsOf(input) {
  const tool = String(input?.tool_name ?? "");
  const args = input?.tool_input ?? {};
  const out = [];
  for (const k of ["file_path", "path", "notebook_path"]) if (typeof args?.[k] === "string" && args[k]) out.push(args[k]);
  if (/^mcp__/.test(tool)) {
    const walk = (v, depth) => {
      if (typeof v === "string") {
        if (v.length <= 400 && !/[\r\n]/.test(v) && /[\\/~]|^\.{1,2}$|\.\w{1,6}$/.test(v)) out.push(v);
      } else if (v && typeof v === "object" && depth < 6) for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
    };
    walk(args, 0);
  }
  return [...new Set(out)];
}

// ------------------------------------------------------------------ commands

/** The words of a piece of command, their quotes taken off. */
function wordsOf(piece) {
  const out = [];
  for (const m of String(piece).matchAll(/"((?:\\.|[^"\\])*)"|'([^']*)'|([^\s"']+)/g)) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
const CD = /^(cd|chdir|pushd|set-location|sl|push-location)$/i;

/**
 * Everything in a command that could be a path, resolved: each word (and what
 * follows a `=`, a redirection or a comma in it), read from the folder the
 * command is in at that point (a `cd` moves it for what follows), and every
 * piece of text that holds a separator, wherever it stands (inside the code
 * handed to node or python, for instance).
 * @param {string} command @param {string} [cwd]
 * @returns {{ paths: string[][], folders: string[][] }} the spellings of each candidate, and of each folder the command stands in
 */
export function commandPaths(command, cwd) {
  // Read once for all the locks of one start (each asks for the same command).
  const key = `${cwd ?? ""}\n${command}`;
  if (readCommand?.key === key) return readCommand.value;
  const paths = [];
  const folders = [];
  let at = cwd || process.cwd();
  // FAST (2026-11-27): the disk is asked only for a word that is written as a
  // path. A bare word (most of a command: its name, its options, a file of the
  // folder it stands in) is read from the folder the command stands in, as
  // written and as the disk knows that folder, without one more question.
  /** @type {Map<string, string>} */
  const real = new Map();
  const realOf = (dir) => {
    if (!real.has(dir)) real.set(dir, onDisk(dir));
    return /** @type {string} */ (real.get(dir));
  };
  const read = (p, from) => {
    if (/[\\/~]|^\.{1,2}$|^[A-Za-z]:/.test(p) || /^(\$|%)/.test(p)) return spellings(p, from);
    const name = spelled(join(from, p)).slice(spelled(from).length);
    return [...new Set([spelled(p, from), `${realOf(from)}${name}`])];
  };
  for (const piece of String(command).split(/&&|\|\||[;\n|&]|\$\(|[`(){}]/)) {
    const words = wordsOf(piece);
    if (!words.length) continue;
    if (CD.test(words[0])) {
      const to = words.slice(1).find((w) => !/^[-/][A-Za-z]+$/.test(w) || /[\\/]/.test(w.slice(1)));
      if (to) {
        const from = at;
        at = resolve(from, plain(to));
        // (Written with backslashes where they are no separator: the folder that exists is the one meant.)
        const other = slashed(to);
        if (other !== null && !existsSync(at) && existsSync(resolve(from, plain(other)))) at = resolve(from, plain(other));
        folders.push(spellings(at));
      }
    }
    for (const word of words) {
      for (const part of word.split(/[=,<>]|^\d?>+\|?|^&>+/)) {
        const p = part.replace(/^[0-9]*[<>]+[|&]?/, "").trim();
        if (!p || p.length > 600 || /^-{1,2}[\w-]+$/.test(p)) continue;
        paths.push(read(p, at));
        // A piece of text that holds a path further in (code in quotes: open('/x/y','w')).
        for (const m of p.matchAll(/[A-Za-z0-9_.~$%{}:@+-]*[\\/][^\s"'`;|&<>()*?,]+/g)) if (m[0] !== p) paths.push(spellings(m[0], at));
      }
    }
  }
  readCommand = { key, value: { paths, folders } };
  return readCommand.value;
}
/** @type {{ key: string, value: { paths: string[][], folders: string[][] } } | null} */
let readCommand = null;

// THE READINGS A LOCK LETS NEAR IT: one command that only shows something,
// alone or piped into other commands that only show something.
// (No pager: `less` and `more` can write a file of their own. No `sort`, for its -o.)
const READERS = /^(cat|type|gc|get-content|head|tail|wc|grep|egrep|fgrep|rg|findstr|select-string|sls|ls|ll|dir|gci|get-childitem|gi|get-item|stat|file|sha256sum|sha1sum|md5sum|get-filehash|test-path|realpath|readlink|basename|dirname|tree|diff|cmp|select-object|measure-object|format-list|format-table|out-string|jq)$/i;
const GIT_READS = /^git(\s+(-C\s+("[^"]*"|'[^']*'|\S+)|--no-pager|-c\s+core\.quotepath=\w+))*\s+(diff|log|show|status|blame|ls-files|ls-tree|cat-file|rev-parse|grep)(\s|$)/i;
// AN OPTION THAT MAKES A READER WRITE OR RUN SOMETHING takes it out of the
// readings: git's --output (a file), --ext-diff and -O/--open-files-in-pager
// (a program), ripgrep's --pre (a program), tree's -o and file's -C (a file).
const NOT_A_READING = { git: /^(--output($|=)|--ext-diff$|--open-files-in-pager($|=)|-O)/, rg: /^--(pre|pre-glob|hostname-bin)($|=)/, tree: /^-o/, file: /^(-C|--compile)/ };
// The plugin's own commands that only read (the state of the floor, of the
// memory, of the approvals, of the brain): THIS plugin's files, by their real
// place (a file of the same name anywhere else is any program).
const PLUGIN_SCRIPTS = dirname(fileURLToPath(import.meta.url));
const PLUGIN_READS = { "executive.mjs": /^(state|candidates)$/, "trust.mjs": /^(state|window)$/, "memory.mjs": /^(find|state)$/, "status.mjs": /^(--json)?$/, "sources.mjs": /^list$/ };
/** Whether the words of one stage are a reading command of this plugin: `node <this plugin>/scripts/<script> <a reading>`. */
function pluginRead(words, cwd) {
  if (words[0] !== "node" || !words[1]) return false;
  const script = words[1].replace(/^"|"$/g, "");
  const reads = PLUGIN_READS[basename(script.replaceAll("\\", "/"))];
  if (!reads || !reads.test(words[2] ?? "")) return false;
  const here = spellings(join(PLUGIN_SCRIPTS, basename(script.replaceAll("\\", "/"))));
  return spellings(script, cwd).some((p) => here.includes(p));
}
/**
 * A command cut into what a shell would see: words (their quotes taken off,
 * `quoted` when they had some) and operators (a pipe, a chaining, a
 * redirection with its number). Only what stands outside quotes is an operator.
 * @param {string} command
 * @returns {{ word?: string, quoted?: boolean, op?: string }[]}
 */
function lex(command) {
  const out = [];
  let word = "";
  let quoted = false;
  let started = false;
  const end = () => {
    if (started) out.push({ word, quoted });
    word = "";
    quoted = false;
    started = false;
  };
  const c = String(command);
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === '"' || ch === "'") {
      const close = (() => {
        for (let j = i + 1; j < c.length; j++) {
          if (c[j] === "\\" && ch === '"') j++;
          else if (c[j] === ch) return j;
        }
        return c.length;
      })();
      word += c.slice(i + 1, close);
      quoted = true;
      started = true;
      i = close;
    } else if (/\s/.test(ch)) end();
    else if ("|&;<>".includes(ch)) {
      // A number right before a redirection is its stream ("2>"), not a word.
      let fd = "";
      if ((ch === ">" || ch === "<") && started && !quoted && /^\d$/.test(word)) {
        fd = word;
        word = "";
        started = false;
      }
      end();
      let op = ch;
      while (i + 1 < c.length && "|&<>".includes(c[i + 1]) && op.length < 3) op += c[++i];
      out.push({ op: fd + op });
    } else {
      word += ch;
      started = true;
    }
  }
  end();
  return out;
}

/**
 * Whether a command is one plain reading: no chaining, no substitution, every
 * stage of its pipe a command that only shows, and no redirection but one
 * that sends what it shows to nowhere, to the other stream, or to a file
 * `safeTarget` accepts (a place that is no lock's: the caller says).
 * @param {string} command
 * @param {(target: string) => boolean} [safeTarget]
 * @param {string} [cwd] the folder the command stands in
 */
export function plainRead(command, safeTarget = () => false, cwd = undefined) {
  const c = String(command).trim();
  if (!c || /[\r\n`]|\$\(|[<>]\(/.test(c)) return false;
  /** @type {string[][]} the words of each stage of the pipe */
  const stages = [[]];
  const tokens = lex(c);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.op === undefined) {
      stages.at(-1)?.push(t.quoted && /\s/.test(t.word ?? "") ? `"${t.word}"` : String(t.word));
      continue;
    }
    if (t.op === "|") {
      stages.push([]);
      continue;
    }
    // A redirection of what the command shows: its target is the next word ("2>&1" is its own).
    const out = /^(\d?)(>>?|>\||&>>?)(&?)$/.exec(t.op);
    if (!out) return false; // a chaining (&&, ||, ;, &), an input taken from a file (<)
    if (out[3]) {
      const stream = tokens[i + 1];
      if (stream?.op !== undefined || !/^[12]$/.test(stream?.word ?? "")) return false;
      i++;
      continue;
    }
    const target = tokens[i + 1];
    if (!target || target.op !== undefined) return false;
    i++;
    const where = String(target.word);
    if (/^(\/dev\/null|\$null|nul)$/i.test(where)) continue;
    // A target a variable or a pattern makes cannot be told: refused. (A tilde
    // is one only at the head of the word, where a shell reads a home folder:
    // further in it is a letter of a name, and Windows writes its short names
    // with one, C:/Users/RUNNER~1/... 2026-11-27, the bench on a computer whose
    // temporary folder is named that way: a plain reading sent to a file
    // there was refused.)
    if (/[$%*?`{}]|^~/.test(where) || !safeTarget(where)) return false;
  }
  return stages.every((words) => {
    if (!words.length) return false;
    const first = words[0].replace(/^"|"$/g, "").toLowerCase();
    const never = NOT_A_READING[first];
    if (never && words.slice(1).some((w) => never.test(w))) return false;
    if (first === "git") return GIT_READS.test(words.join(" "));
    if (first === "node") return pluginRead(words, cwd);
    return READERS.test(first);
  });
}

// THE GESTURES THAT ARE THE PERSON'S OWN (2026-11-27): lifting a lock, and
// approving what runs on this computer. Asked by the AI, they would undo what
// a lock or an approval is for; the skills have the person make them, in a
// terminal of their own (trust.mjs window opens one).
const BRAIN_OPTION = String.raw`(\s+--brain\s+("[^"]*"|'[^']*'|\S+))?`;
const GESTURES = [
  [new RegExp(String.raw`\bmemory\.mjs["']?${BRAIN_OPTION}\s+(lock\s+off|restore)\b`, "i"), "lifting the lock of the memory (memory.mjs lock off, restore)"],
  [new RegExp(String.raw`\bexecutive\.mjs["']?${BRAIN_OPTION}\s+trust\b`, "i"), "approving a guard or a skill (executive.mjs trust)"],
  [new RegExp(String.raw`\bsources\.mjs["']?${BRAIN_OPTION}\s+trust\b`, "i"), "approving a source (sources.mjs trust)"],
  [new RegExp(String.raw`\btrust\.mjs["']?${BRAIN_OPTION}\s+(approve|guide)\b`, "i"), "approving what runs on this computer (trust.mjs approve, guide)"],
];
/**
 * The refusal for a command that makes one of the person's own gestures, or null.
 * @param {{ tool_name?: string, tool_input?: any }} input
 * @returns {string | null}
 */
export function gestureRefusal(input) {
  const command = commandOf(input);
  if (!command) return null;
  const hit = GESTURES.find(([re]) => re.test(command));
  if (!hit) return null;
  return (
    `Refused: ${hit[1]} is the person's own gesture, never the AI's: it is what a lock or an approval is there for. ` +
    "Tell the person what it would do and why, then let them do it in a terminal of their own: `trust.mjs window` opens one that shows what waits for their approval; for the memory's lock, give them the line to paste. Do not look for another way."
  );
}

// THE KEYS BESIDE THE SETTINGS (2026-11-28): the key of the live view
// (live-token.json), the background readers' access (judge-token.json) and an
// online agent's key to the cloud copy (token-<name>.txt). The plugin's own
// programs read them; the AI never does, not even to look: whoever holds the
// view's key acts on the view as the person does (validates a note, pauses a
// source, switches a plugin). A vault would not keep them better: the view
// and the readers need them with nobody there to open it, and an AI reads an
// open vault as it reads a file.
const KEY_FILE = /^(live-token\.json|judge-token\.json|token-[\w.-]+\.txt)$/i;
const KEY_NAME = /(live-token\.json|judge-token\.json|token-[\w.-]+\.txt)/i;
/** What reads a whole folder: a pattern, or a reader told to go down. */
const WHOLE_FOLDER = /[*?]|(^|\s)(-[a-z]*r[a-z]*|-R|--recursive|-recurse)(\s|$)/i;
/** The tools that only read, which the lock of the keys alone looks at. */
export const READ_TOOL = /^(Read|Grep|Glob)$/;
/**
 * The refusal for a tool or a command that would read one of the keys kept
 * beside the plugin's settings (or the whole folder they are in), or null.
 * @param {{ tool_name?: string, tool_input?: any, cwd?: string }} input
 * @returns {string | null}
 */
export function keyRefusal(input) {
  const tool = String(input?.tool_name ?? "");
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : undefined;
  const folder = spellings(SETTINGS_DIR);
  const isKey = (p) => folder.some((f) => p.startsWith(`${f}/`) && KEY_FILE.test(p.slice(f.length + 1)));
  const inFolder = (p) => folder.some((f) => under(f, p));
  let aimed = false;
  if (!isShell(tool)) {
    const paths = pathsOf(input).map((p) => spellings(p, cwd));
    aimed = paths.some((list) => list.some(isKey));
    // A search through the folder reads what is in its files (Grep), a list of it only their names (Glob).
    if (!aimed && tool === "Grep") aimed = paths.some((list) => list.some(inFolder)) || (!paths.length && folder.some((f) => under(f, spelled(cwd ?? process.cwd()))));
  }
  const command = commandOf(input);
  if (!aimed && command) {
    if (KEY_NAME.test(command)) aimed = true;
    else {
      const { paths, folders } = commandPaths(command, cwd);
      const there = paths.some((list) => list.some(isKey));
      const whole = WHOLE_FOLDER.test(command) && (paths.some((list) => list.some(inFolder)) || folders.some((list) => list.some(inFolder)));
      aimed = there || whole;
    }
  }
  if (!aimed) return null;
  return (
    "Refused: this would read one of the keys the brain plugin keeps beside its settings (the live view's key, the background readers' access, an online agent's key), or the whole folder they are in. " +
    "The plugin's own programs read them; the AI never does, not even to look or to check one: with the view's key, anything acts on the view as the person does. " +
    "What you need from them, a plugin command gives (judge-token.mjs state, /brain:live, cloud.mjs). Do not look for another way."
  );
}

/**
 * The refusal for a write into the plugin's own settings on this computer
 * (~/.hypervibe-brain/config.json: the brain's place, the locks, the
 * approvals) or into the launcher of the guards beside them, or null. Reading
 * them stays free.
 * @param {{ tool_name?: string, tool_input?: any, cwd?: string }} input
 * @returns {string | null}
 */
export function settingsRefusal(input) {
  const tool = String(input?.tool_name ?? "");
  const cwd = typeof input?.cwd === "string" && input.cwd ? input.cwd : undefined;
  const locked = ["config.json", "guard.mjs"].flatMap((f) => spellings(join(SETTINGS_DIR, f)));
  const folder = spellings(SETTINGS_DIR);
  const aims = (list) => list.some((p) => locked.includes(p));
  const command = commandOf(input);
  let aimed = pathsOf(isShell(tool) ? {} : input).some((p) => aims(spellings(p, cwd)));
  if (!aimed && command) {
    const { paths, folders } = commandPaths(command, cwd);
    const named = paths.some(aims) || (/\.hypervibe-brain/i.test(command) && /(config\.json|guard\.mjs)/i.test(command)) || (folders.some((f) => f.some((p) => folder.includes(p))) && /(config\.json|guard\.mjs)/i.test(command));
    aimed = named && !plainRead(command, (target) => !aims(spellings(target, cwd)), cwd);
    // The folder itself renamed, moved or removed: the locks and the approvals would go with it.
    if (!aimed) aimed = MOVES.test(command) && paths.some((list) => list.some((p) => folder.includes(p)));
  }
  if (!aimed) return null;
  return (
    "Refused: this is the plugin's own settings file on this computer (~/.hypervibe-brain/config.json: where the brain is, its locks, what the person approved to run) or the launcher of the guards beside it. The AI reads it, and never writes it: a write there could lift a lock or approve a program. " +
    "The plugin's commands change it themselves; what only the person may change (a lock, an approval) they change in a terminal of their own. Do not look for another way to write this file."
  );
}
