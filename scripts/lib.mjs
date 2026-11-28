// lib.mjs - What every script of the brain shares: where things are, how a
// note (a "fiche") is read, and what makes it valid.
//
// Zero dependency on purpose: SQLite comes with Node (22.16+), the frontmatter
// is a small fixed format read below, and the MCP server speaks its protocol
// by hand. Nothing to install means nothing that breaks on a new computer.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// THE CODE LIVES IN THE PLUGIN, THE BRAIN IS ONLY DATA. A brain folder holds
// its notes, its founding documents and its vectors, never a script: an
// update of the plugin repairs every brain at once. The scripts find the
// brain through a small settings file, ~/.hypervibe-brain/config.json, written
// when the brain is created. HVBRAIN_HOME replaces the home folder (the
// test bench never touches the real one); HVBRAIN_DIR or --brain <dir>
// point at another brain for one command.
export const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const HOME = process.env.HVBRAIN_HOME || homedir();
// THE NAMES OF BEFORE. Until version 0.4 this plugin had another name: its
// settings lived in ~/.hyperbrain and a brain's own file was hyperbrain.json. A computer
// or a brain set up back then is carried over once, by a rename, the first
// time any script runs. Nothing is copied twice, nothing is deleted.
export const LEGACY_NAME = "hyperbrain";
try {
  const before = join(HOME, `.${LEGACY_NAME}`);
  const now = join(HOME, ".hypervibe-brain");
  if (existsSync(before) && !existsSync(now)) renameSync(before, now);
} catch {
  // another script is doing it right now, or the folder is in use: next time
}
export const CONFIG_FILE = join(HOME, ".hypervibe-brain", "config.json");

// READ ONCE PER VERSION OF THE FILE (2026-11-19). These settings are asked
// for everywhere, sometimes for each folder of a walk: the watch of the
// documents spent 52 of its 53 seconds reading this one file again, on a
// computer whose antivirus looks at every file opened. A file whose date and
// size did not move is not opened again (asking for those opens nothing).
// Each caller gets a copy of its own: what it changes in it changes nothing
// for the next one.
//
// THERE AND UNREADABLE IS NOT EMPTY (2026-11-21). A file that could not be
// read (a byte order mark, a comma left by an edit by hand) was taken for no
// settings at all, and the next script that kept one setting wrote a file
// holding that setting alone: the place of the brain, the roots, the routines
// and the lock of the memory were gone. A file that is not there still reads
// as {}; a file that is there and cannot be read reads as {} too (the scripts
// then say plainly that they cannot go on, userConfigProblem), but it is
// NEVER written over (setUserConfig).
/** @type {{ stamp: string, value: any, problem: string | null } | null} */
let keptConfig = null;
const plainObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
export function userConfig() {
  let stamp = "";
  try {
    const st = statSync(CONFIG_FILE);
    stamp = `${st.mtimeMs}:${st.size}`;
  } catch {
    keptConfig = null;
    return {};
  }
  if (keptConfig?.stamp !== stamp) {
    const r = readJsonFile(CONFIG_FILE, {});
    if (r.missing) {
      keptConfig = null;
      return {};
    }
    const good = r.ok && plainObject(r.value);
    keptConfig = { stamp, value: good ? r.value : {}, problem: good ? null : (r.error ?? "it does not hold a JSON object") };
  }
  return structuredClone(keptConfig.value);
}
/** Why this computer's settings cannot be read, or null when they can (or when there are none yet). */
export function userConfigProblem() {
  userConfig();
  return keptConfig?.problem ?? null;
}

/**
 * Keeps settings of this computer. `patch` is the keys to set, or a function
 * that makes them from the settings as they are AT THE WRITE (two programs
 * that each add a key to the same object, a root of sources for instance,
 * then never lose the other's). Throws when the file is there and cannot be
 * read: nothing is written over it, and a copy is kept beside it.
 * @param {Record<string, any> | ((current: Record<string, any>) => Record<string, any>)} patch
 */
export function setUserConfig(patch) {
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  // One writer at a time (read, merge, write): a lock held for an instant. A
  // writer that cannot get it in two seconds writes all the same, as before.
  const done = withFileLock(`${CONFIG_FILE}.lock`, () => {
    const r = readJsonFile(CONFIG_FILE, {});
    if (!r.missing && !(r.ok && plainObject(r.value))) {
      const copy = `${CONFIG_FILE}.bad`;
      try {
        copyFileSync(CONFIG_FILE, copy);
      } catch {
        // the copy is a comfort: the file itself is left as it is
      }
      throw new Error(`the settings of this computer (${CONFIG_FILE.replace(/\\/g, "/")}) are there and cannot be read (${r.error ?? "not a JSON object"}): nothing was written over them. Repair that file by hand (a copy is kept as config.json.bad), then run this again.`);
    }
    const current = r.missing ? {} : r.value;
    const next = { ...current, ...(typeof patch === "function" ? patch(structuredClone(current)) : patch) };
    // Written beside, then renamed (writeFileAtomic): never half a file, and a
    // rename refused for an instant on Windows is tried again.
    writeFileAtomic(CONFIG_FILE, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }, { wait: 2000, stale: 10_000, anyway: true });
  // What was kept of the file is the file of before.
  keptConfig = null;
  return done.value;
}

/**
 * ONE AT A TIME (2026-11-21). Runs `fn` while holding a lock: a file created
 * exclusively (it cannot be created twice), which names the process that
 * holds it. A lock whose process is gone, or older than `stale`, is taken
 * over: a computer switched off in the middle never blocks the next run.
 * Waits up to `wait` milliseconds for it. When it is not obtained: `fn` runs
 * all the same with `anyway`, otherwise it does not run (`held: false`).
 * @template T
 * @param {string} lock @param {() => T} fn
 * @param {{ wait?: number, stale?: number, anyway?: boolean }} [o]
 * @returns {{ held: boolean, value?: T }}
 */
export function withFileLock(lock, fn, { wait = 2000, stale = 60_000, anyway = false } = {}) {
  const until = Date.now() + wait;
  let held = false;
  for (;;) {
    try {
      mkdirSync(dirname(lock), { recursive: true });
      writeFileSync(lock, String(process.pid), { encoding: "utf8", flag: "wx" });
      held = true;
      break;
    } catch (e) {
      if (e.code !== "EEXIST" && e.code !== "EPERM" && e.code !== "EACCES" && e.code !== "EBUSY") break; // no lock can be made here: `anyway` decides
      let gone = false;
      try {
        const pid = Number(readFileSync(lock, "utf8"));
        if (Date.now() - statSync(lock).mtimeMs > stale) gone = true;
        else if (pid > 0 && pid !== process.pid) {
          try {
            process.kill(pid, 0);
          } catch (k) {
            if (k.code === "ESRCH") gone = true;
          }
        }
      } catch {
        // removed meanwhile, or being written: tried again
      }
      if (gone) rmSync(lock, { force: true });
      else if (Date.now() >= until) break;
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  if (!held && !anyway) return { held: false };
  try {
    return { held, value: fn() };
  } finally {
    if (held) rmSync(lock, { force: true });
  }
}

// ONE WAY TO WRITE A FILE OTHERS READ, ONE WAY TO READ IT (2026-11-21). The
// hub, the evening save, a session and the live view read and write the same
// small JSON files (a judge's pile, a source's state, what was seen). Written
// in place, a file read at the wrong instant, or cut by a full disk, came back
// empty; and a reader that takes "cannot be read" for "nothing there" then
// wrote one item over a pile of two hundred. So: a file is written beside and
// renamed (never half a file), and a reader knows a file that is NOT THERE
// from a file that CANNOT BE READ.
/**
 * Writes a file whole or not at all: beside it first, then renamed over it. On
 * Windows a rename over a file being read is refused for an instant: tried
 * again for half a second.
 * @param {string} file @param {string} text
 */
export function writeFileAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, "utf8");
  for (let tries = 0; ; tries++) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      if (tries >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
}
/** @param {string} file @param {unknown} value */
export const writeJsonAtomic = (file, value) => writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
/**
 * Reads a JSON file and says what happened: `missing` (no such file: the
 * fallback is right), or `unreadable` (it is there and cannot be parsed, or
 * cannot be opened: NEVER write over it from the fallback). A file caught
 * while another program renames it is tried again for a quarter of a second.
 * @param {string} file @param {any} [fallback]
 * @returns {{ ok: boolean, missing: boolean, unreadable: boolean, value: any, error?: string }}
 */
export function readJsonFile(file, fallback = null) {
  let last = "";
  for (let tries = 0; tries < 6; tries++) {
    try {
      const value = JSON.parse(readFileSync(file, "utf8").replace(/^﻿/, ""));
      return { ok: true, missing: false, unreadable: false, value };
    } catch (e) {
      if (e.code === "ENOENT") return { ok: false, missing: true, unreadable: false, value: fallback };
      last = String(e.message ?? e);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 40);
    }
  }
  return { ok: false, missing: false, unreadable: true, value: fallback, error: last.slice(0, 200) };
}

function resolveBrain() {
  const i = process.argv.indexOf("--brain");
  if (i >= 0 && process.argv[i + 1]) return resolve(process.argv[i + 1]);
  if (process.env.HVBRAIN_DIR) return resolve(process.env.HVBRAIN_DIR);
  const c = userConfig();
  return c.brain ? resolve(c.brain) : null;
}

/** The brain's folder, or null when no brain is set up on this computer. */
export const BRAIN = resolveBrain();
if (BRAIN) {
  try {
    const before = join(BRAIN, `${LEGACY_NAME}.json`);
    if (existsSync(before) && !existsSync(join(BRAIN, "brain.json"))) renameSync(before, join(BRAIN, "brain.json"));
  } catch {
    // read-only or in use: the brain is then reported as not set up, plainly
  }
}
export const hasBrain = () => Boolean(BRAIN && existsSync(join(BRAIN, "brain.json")));

/** For the command-line scripts: stop with a clear sentence when there is no brain. */
export function requireBrain() {
  if (hasBrain()) return;
  // Settings that are there and cannot be read are not "no brain yet": said as it is.
  const problem = BRAIN ? null : userConfigProblem();
  console.error(BRAIN ? `no brain in ${BRAIN} (no brain.json)` : problem ? `the settings of this computer (${CONFIG_FILE.replace(/\\/g, "/")}) cannot be read (${problem}): repair that file by hand, the brain it names is untouched` : "no brain set up on this computer yet: run /brain:create");
  process.exit(3);
}

export const ROOT = BRAIN ?? join(HOME, ".hypervibe-brain", "no-brain");
export const VAULT = join(ROOT, "vault");
export const INDEX = join(ROOT, "index");
/**
 * Which notes Claude read through the tools: a promotion signal, and the
 * brain's own record of what serves. One file per computer, written by it
 * alone (index/reads/<computer>.jsonl, index/mcp-journal/ for a French
 * brain): kept in git, so every copy has it and two computers never conflict.
 * The single file of before (index/reads.jsonl) is still read.
 */
const readsDir = (cfg = config()) => join(INDEX, cfg.format === "fr" ? "mcp-journal" : "reads");
const legacyReads = (cfg = config()) => join(INDEX, cfg.format === "fr" ? "mcp-journal.jsonl" : "reads.jsonl");
export const readsFile = (cfg = config()) => join(readsDir(cfg), `${computerName()}.jsonl`);
/**
 * Every read, from every computer: the brain's journal (journal.mjs) since
 * 2026-11-07, and the reads files of before, still read for their history
 * (index/reads/, index/mcp-journal/, the single files before them).
 */
export function readAllReads(cfg = config()) {
  const files = [join(INDEX, "reads.jsonl"), join(INDEX, "mcp-journal.jsonl")];
  for (const d of [join(INDEX, "reads"), join(INDEX, "mcp-journal")]) if (existsSync(d)) for (const n of readdirSync(d).filter((x) => x.endsWith(".jsonl"))) files.push(join(d, n));
  const out = [];
  for (const f of files) {
    if (!existsSync(f)) continue;
    for (const l of readFileSync(f, "utf8").split("\n")) {
      try {
        const e = JSON.parse(l);
        if (e.slug) out.push(e);
      } catch {
        // a damaged line does not count
      }
    }
  }
  for (const e of readEventsLater({ act: "read" })) {
    // The brain's own background work (the judge) is not a read that serves.
    if (e.background) continue;
    const conv = String(e.who ?? "").replace(/^ai:/, "");
    for (const slug of e.notes ?? []) out.push({ at: e.at, tool: e.tool, slug, client: e.client, conv: conv === "?" ? undefined : conv });
  }
  return out;
}
// journal.mjs imports this module: read through a late binding, set by journal.mjs.
let readEventsLater = () => [];
export const bindReadEvents = (f) => {
  readEventsLater = f;
};
// WHAT THE SOURCES JUST WROTE. The evening save holds back a note modified
// less than 30 minutes ago (a person may be editing it). A note a source wrote
// a minute ago is not being edited: the sources record what they wrote, with
// the file's date, and the save takes it at once if it has not changed since.
// Local to this computer (~/.hypervibe-brain/written.json), by brain.
const WRITTEN = () => join(HOME, ".hypervibe-brain", "written.json");
export function readWritten() {
  try {
    return JSON.parse(readFileSync(WRITTEN(), "utf8"))[ROOT.replace(/\\/g, "/")] ?? {};
  } catch {
    return {};
  }
}
export function setWritten(map) {
  let all = {};
  try {
    all = JSON.parse(readFileSync(WRITTEN(), "utf8"));
  } catch {
    // first time
  }
  all[ROOT.replace(/\\/g, "/")] = map;
  writeFileAtomic(WRITTEN(), `${JSON.stringify(all)}\n`);
}
/** Records notes a source has just written (paths relative to the brain). */
export function noteWritten(rels) {
  if (!rels.length) return;
  const m = readWritten();
  for (const rel of rels) {
    try {
      m[rel] = statSync(join(ROOT, rel)).mtimeMs;
    } catch {
      // gone meanwhile
    }
  }
  setWritten(m);
}
/** Every promotion, kept: which seed rose, when, and why. */
export const promotionsFile = () => join(INDEX, "promotions.jsonl");
// Where the index and the vectors live. A brain that already has files of
// its own there (another program's index...) places them elsewhere, in
// brain.json: "index": { "db": "index/x.sqlite", "embeddings": "index/y" }.
const PLACES = (() => {
  try {
    return JSON.parse(readFileSync(join(ROOT, "brain.json"), "utf8")).index ?? {};
  } catch {
    return {};
  }
})();
export const DB_PATH = join(ROOT, PLACES.db ?? "index/brain.sqlite");
export const EMB_DIR = join(ROOT, PLACES.embeddings ?? "index/embeddings");
const EMB_REL = `${String(PLACES.embeddings ?? "index/embeddings").replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "")}/`;

// THE FORMAT SPEAKS THE BRAIN'S LANGUAGE. A French brain writes `titre`,
// `domaines`, `statut: graine`; an English one `title`, `domains`,
// `status: seed`. Inside the scripts everything is read into one canonical
// shape (the English words below), so that no script cares which language a
// brain speaks. The French vocabulary is exactly the format of the brain this
// plugin grew from: such a brain passes as it is, not a letter changed.
export { VOCAB } from "./pure.mjs";
import { VOCAB } from "./pure.mjs";
export const STATUSES = ["seed", "trusted", "archived"];
export const VISIBILITIES = ["public", "internal", "private"];

// THE TYPES BELONG TO THE BRAIN, not to the plugin: they live in
// brain.json (`types`: type => folder, the folder IS the type), proposed
// from what the person's computer shows and validated with them at the
// creation. These are only what a brain gets when it has none.
export const DEFAULT_TYPES = {
  en: { note: "notes", idea: "ideas", concept: "concepts", project: "projects", person: "people", organization: "organizations", publication: "publications", event: "events", source: "sources" },
  fr: { note: "notes", idee: "idees", concept: "concepts", projet: "projets", personne: "personnes", organisation: "organisations", publication: "publications", evenement: "evenements", source: "sources" },
};
// The maturity of an idea is the person's call: the weekly review never
// promotes these types by itself.
export const DEFAULT_NEVER_PROMOTED = { en: ["idea"], fr: ["idee"] };

/** Never read, never indexed, never copied anywhere: the last resort. */
const SKIPPED_DIRS = new Set(["danger-zone"]);
const SKIPPED_FILES = new Set(["CLAUDE.md", "README.md"]);

export function config() {
  const cfg = JSON.parse(readFileSync(join(ROOT, "brain.json"), "utf8"));
  cfg.embeddings ??= {};
  cfg.embeddings.model ??= "text-embedding-3-small";
  cfg.embeddings.dims ??= 512;
  // A DOMAIN HAS AN ID AND A LABEL. The id (`literary`) is what notes carry
  // and machines read, the same in every brain; the label (`Littéraire`) and
  // the domain's own note (`litteraire`) speak the person's language, and are
  // all a person ever sees. brain.json says either a plain list of ids, or
  // { id: { label, note } }. Scripts read `cfg.domains` (the ids) and
  // `domainLabel(cfg, id)`.
  cfg.domains ??= [];
  if (!Array.isArray(cfg.domains)) {
    cfg.domainInfo = cfg.domains;
    cfg.domains = Object.keys(cfg.domains);
  }
  cfg.domainInfo ??= {};
  cfg.format = VOCAB[cfg.format] ? cfg.format : cfg.lang === "fr" ? "fr" : "en";
  cfg.types = cfg.types && Object.keys(cfg.types).length ? cfg.types : DEFAULT_TYPES[cfg.format];
  cfg.neverPromoted ??= DEFAULT_NEVER_PROMOTED[cfg.format];
  // Paths inside vault/ that are not notes (an inbox, a log...), as the brain declares them.
  cfg.exclude ??= [];
  return cfg;
}

/** config(), or null when there is no brain (listing a vault must not need one). */
function safeConfig() {
  try {
    return config();
  } catch {
    return null;
  }
}

/** The words of this brain's format. */
export const vocab = (cfg = safeConfig()) => VOCAB[cfg?.format] ?? VOCAB.en;
/** What a person sees of a domain: its label in their language, else its id. */
export const domainLabel = (cfg, id) => cfg?.domainInfo?.[id]?.label ?? id;
/** The language a person reads (`lang`), which is not the notes' format. */
export const isFrench = (cfg) => (cfg?.lang ?? cfg?.format) === "fr";

// ---------------------------------------------------------- two computers
// ONE COMPUTER RUNS THE BRAIN, the others only read and write notes. The
// "runner" (named in brain.json, so every computer knows it) runs what
// computes: the person's sources, the vectors, the directory, the reviews,
// the cold copy. What it computes is DERIVED, and only the runner commits
// it: two computers computing the same vector write two files that are
// equal in value but not in bytes, and git would see a conflict every night.
// A brain on a single computer has no runner named: that computer is it.

export const computerName = () => String(userConfig().computer ?? (process.env.HVBRAIN_COMPUTER || hostname())).trim().toLowerCase();

export function isRunner(cfg = config()) {
  return !cfg.runner || String(cfg.runner).toLowerCase() === computerName();
}

/** What only the runner writes and commits. Everything else in the brain is canon. */
export const DERIVED = [/^index\/embeddings\//, /^index\/(annuaire|directory)\.json$/, /^index\/promotions\.jsonl$/, /^index\/signals\.json$/, /^index\/health\.json$/, /^reviews\//, /^sources\/[^/]+\/(seen|state)\.json$/];
/** What the saves commit at all: anything else in the folder stays out of git. */
export const OWNED = [/^vault\//, /^catalogue\/[^/]+\.jsonl$/, /^journal\/[^/]+\.jsonl$/, /^index\/(reads|mcp-journal)\/[^/]+\.jsonl$/, /^index\/embeddings\//, /^reviews\//, /^sources\//, /^index\/(annuaire|directory)\.json$/, /^index\/promotions\.jsonl$/, /^index\/signals\.json$/, /^index\/health\.json$/, /^(BRAIN|SOURCES)\.md$/, /^brain\.json$/, /^hyperbrain\.json$/];

// A brain may add its own rules in brain.json, `ownership`:
//   "canon":   files any computer commits (settings kept by hand...)
//   "derived": files only the runner commits (what its own programs compute)
// A path ending with "/" is a folder. "{computer}" stands for this computer's
// name: "index/activity/{computer}.jsonl" is each computer's own journal,
// committed by it and by no other.
const rulesCache = new Map();
function ownRules(cfg) {
  const key = JSON.stringify([cfg.ownership ?? null, computerName()]);
  if (!rulesCache.has(key)) {
    const m = (list) => (list ?? []).map((p) => {
      const s = String(p).replace(/\\/g, "/").replace(/^\.?\//, "").replaceAll("{computer}", computerName());
      return s.endsWith("/") ? (r) => r.startsWith(s) : (r) => r === s;
    });
    rulesCache.set(key, { canon: m(cfg.ownership?.canon), derived: m(cfg.ownership?.derived) });
  }
  return rulesCache.get(key);
}
const norm = (rel) => String(rel).replace(/\\/g, "/");
export const isDerived = (rel, cfg = config()) => {
  const r = norm(rel);
  return DERIVED.some((re) => re.test(r)) || r.startsWith(EMB_REL) || ownRules(cfg).derived.some((f) => f(r));
};
export const isOwned = (rel, cfg = config()) => {
  const r = norm(rel);
  const o = ownRules(cfg);
  return OWNED.some((re) => re.test(r)) || r.startsWith(EMB_REL) || o.canon.some((f) => f(r)) || o.derived.some((f) => f(r));
};

/** For the scripts that compute: refuse clearly on a computer that is not the runner. */
export function requireRunner(cfg = config()) {
  if (isRunner(cfg)) return;
  console.log(JSON.stringify({ ok: false, error: `this computer (${computerName()}) is not the one that runs this brain's routines (${cfg.runner}): it reads and writes notes, the other one computes` }));
  process.exit(4);
}

/** Reads the brain's own .env into process.env (without overriding). */
export function loadEnv() {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const toPosix = (p) => p.split(sep).join("/");

// A name proposed by a source is kept whole (max = Infinity): cutting it would
// name a note differently from the source's own rules.
export function slugify(title, max = 60) {
  const s = String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= max) return s || "note";
  const cut = s.slice(0, max);
  return cut.slice(0, cut.lastIndexOf("-") > 30 ? cut.lastIndexOf("-") : max);
}

/** Every note of the vault, as absolute paths. */
export function listFiches() {
  const out = [];
  const excluded = new Set((safeConfig()?.exclude ?? []).map((x) => String(x).replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")));
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (excluded.has(toPosix(relative(VAULT, p)))) continue;
      if (e.isDirectory()) {
        if (!SKIPPED_DIRS.has(e.name)) walk(p);
      } else if (e.name.endsWith(".md") && !SKIPPED_FILES.has(e.name)) out.push(p);
    }
  };
  walk(VAULT);
  return out;
}

/** Latest modification of the vault, and its size: enough to know the index is stale. */
export function vaultFingerprint() {
  const fiches = listFiches();
  let latest = 0;
  for (const f of fiches) latest = Math.max(latest, statSync(f).mtimeMs);
  return { count: fiches.length, latest: Math.round(latest) };
}

// ------------------------------------------------------------ frontmatter
function unquote(v) {
  const s = v.trim();
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    try {
      return JSON.parse(s);
    } catch {
      return s.slice(1, -1);
    }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

function splitList(inner) {
  const items = [];
  let cur = "";
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (ch === ",") {
      items.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) items.push(cur);
  return items.map(unquote).map((x) => x.trim()).filter(Boolean);
}

function scalar(raw) {
  const v = raw.trim();
  if (v.startsWith("[") && v.endsWith("]")) return splitList(v.slice(1, -1));
  if (v === "true") return true;
  if (v === "false") return false;
  return unquote(v);
}

/**
 * The frontmatter of a note: `key: value`, inline lists `[a, b]` and block
 * lists (`- a` on the following lines). That is all the format allows, and
 * all a note needs.
 */
export function parseFrontmatter(text) {
  const fm = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) throw new Error(`frontmatter line not understood: "${line.trim()}"`);
    if (m[2].trim() === "") {
      const list = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) list.push(unquote(lines[++i].replace(/^\s*-\s+/, "")));
      fm[m[1]] = list.length ? list : "";
    } else fm[m[1]] = scalar(m[2]);
  }
  return fm;
}

export const sha256 = (s) => createHash("sha256").update(s).digest("hex");

/**
 * WHAT A PROGRAM SAID WENT WRONG, WITHOUT WHAT NODE SAYS WHEN ALL IS WELL
 * (2026-11-27). Node 22 writes two lines on the error stream of every program
 * that loads SQLite ("ExperimentalWarning: SQLite is an experimental
 * feature", then a line about --trace-warnings); Node 24 no longer does. So
 * the error stream of a program of the plugin is never empty there, and never
 * JSON: an answer is read from the standard output alone, and a message taken
 * from the error stream goes through here, or those two lines stand in the
 * place of what went wrong once the message is cut.
 * @param {unknown} stderr
 */
export const saidWrong = (stderr) => String(stderr ?? "").split("\n").filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();

/**
 * Reads one note. The text is normalised to LF BEFORE hashing: git on Windows
 * checks files out with CRLF, and a hash that depends on line endings makes a
 * fresh clone believe every note changed (and re-embed all of them).
 */
/**
 * The frontmatter as the brain wrote it, read into the canonical shape: the
 * scripts only ever see `title`, `status: seed`... whatever the brain's
 * language. The other fields the brain uses (a date of event, a url, roles...)
 * are kept as they are.
 */
function canonical(raw, voc) {
  const k = voc.keys;
  const back = (map, v) => Object.entries(map).find(([, word]) => word === v)?.[0] ?? v;
  return {
    ...raw,
    type: raw[k.type],
    title: raw[k.title],
    domains: raw[k.domains],
    status: back(voc.status, raw[k.status]),
    visibility: back(voc.visibility, raw[k.visibility]),
    created: raw[k.created],
    updated: raw[k.updated],
    source: raw[k.source],
    nature: raw[k.nature],
    data: raw[k.data],
  };
}

export function parseFiche(abs, voc = vocab()) {
  const raw = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(raw);
  const rel = toPosix(relative(ROOT, abs));
  if (!m) throw new Error(`${rel}: no frontmatter (the note must start with ---)`);
  const fm = canonical(parseFrontmatter(m[1]), voc);
  const body = (m[2] ?? "").trim();
  const links = [...body.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((x) => x[1].trim());
  const folder = toPosix(relative(VAULT, dirname(abs))).split("/")[0];
  return { slug: basename(abs, ".md"), rel, folder, fm, body, links: [...new Set(links)], hash: sha256(raw) };
}

// ------------------------------------------------------------- validation
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);
/** An address where data lives: a scheme, ://, then a path. */
export const DATA_ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/\S+$/;

/**
 * THE FORMS OF SOURCE A BRAIN ACCEPTS (brain.json, sourceSchemes: ["dropbox://",
 * "https://", "mail:"...]). A source is where a fact can be found again: a
 * sentence such as "Arnaud's email of 6 October" cannot be followed, nor can
 * the review tell when it disappeared or changed. Without the setting, any
 * source goes. A note whose source has another form is not saved (save.mjs)
 * and the evening says so; it does not stop the index of the rest.
 */
/**
 * WHAT A BRAIN NEVER WRITES (brain.json, neverWrite: a list of characters or
 * words; 2026-11-19). Some brains have rules of their own on what a note may
 * hold, checked by a hook of their own before each commit: one character of
 * the wrong kind, written by a judge that copied the name of a file, and no
 * save of the brain went through any more (seen on a real brain). The plugin
 * cannot know such a rule unless the brain says it: said here, it is refused
 * at the write, with words the one who writes can act on.
 */
export function textProblem(text, cfg = config()) {
  const never = cfg.neverWrite;
  if (!Array.isArray(never) || !never.length) return null;
  const s = String(text ?? "");
  const found = never.filter((x) => typeof x === "string" && x && s.includes(x));
  return found.length ? `this brain never writes ${found.map((x) => JSON.stringify(x)).join(" nor ")}: write it another way` : null;
}

export function sourceProblem(source, cfg = config()) {
  const schemes = cfg.sourceSchemes;
  if (!Array.isArray(schemes) || !schemes.length) return null;
  const s = String(source ?? "").trim();
  return schemes.some((p) => s.startsWith(p)) ? null : `source in a form this brain does not follow (expected: ${schemes.join(", ")}): ${s.slice(0, 120)}`;
}

/**
 * Errors block the build and the commit; warnings do not. The list is short
 * and every rule has cost something once: a note with no domain, an invented
 * type, a date nobody can sort.
 */
export function validate(fiches, cfg) {
  const errors = [];
  const warnings = [];
  const bySlug = new Map();
  const types = cfg.types;
  // Messages name the fields and values as this brain writes them.
  const v = VOCAB[cfg.format] ?? VOCAB.en;
  const k = v.keys;
  for (const f of fiches) {
    const e = (msg) => errors.push({ rel: f.rel, msg });
    const { fm } = f;
    if (!types[fm.type]) e(`unknown ${k.type} "${fm.type ?? ""}" (this brain's types: ${Object.keys(types).join(", ")})`);
    else if (types[fm.type] !== f.folder) e(`${k.type} "${fm.type}" must live in vault/${types[fm.type]}/, not vault/${f.folder}/`);
    if (!fm.title || typeof fm.title !== "string") e(`missing ${k.title}`);
    const domains = asList(fm.domains);
    if (!domains.length) e(`no ${k.domains} (at least one is required)`);
    for (const d of domains) if (cfg.domains.length && !cfg.domains.includes(d)) e(`${k.domains}: "${d}" is not one of this brain's domains (${cfg.domains.join(", ")})`);
    if (!STATUSES.includes(fm.status)) e(`${k.status} must be one of ${Object.values(v.status).join(", ")}`);
    if (!VISIBILITIES.includes(fm.visibility)) e(`${k.visibility} must be one of ${Object.values(v.visibility).join(", ")}`);
    for (const key of ["created", "updated"]) if (!DATE.test(String(fm[key] ?? ""))) e(`${k[key]} must be a date YYYY-MM-DD`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(f.slug)) e("file name must be lowercase words joined by dashes");
    if (!fm.source) warnings.push({ rel: f.rel, msg: "no source: where does this come from?" });
    else if (sourceProblem(fm.source, cfg)) warnings.push({ rel: f.rel, msg: sourceProblem(fm.source, cfg), source: true });
    if (!f.body) warnings.push({ rel: f.rel, msg: "empty body" });
    // NATURE: what kind of thing a note of this type is (brain.json, natures:
    // { "note": ["decision", "feedback"] }). A facet, not a type: the note keeps
    // its folder, and a brain without the setting accepts none.
    if (fm.nature !== undefined && fm.nature !== "") {
      const allowed = cfg.natures?.[fm.type] ?? [];
      if (!allowed.includes(fm.nature)) e(`${k.nature} "${fm.nature}" is not one this brain gives to a ${fm.type} (${allowed.join(", ") || "none"})`);
    }
    // DATA: where the data this note routes to lives, as addresses
    // (scheme://path). The note says what to know; the data stays in its tool.
    for (const a of asList(fm.data)) {
      if (!DATA_ADDRESS.test(String(a))) e(`${k.data}: "${a}" is not an address (scheme://path)`);
      else if (cfg.data && !cfg.data[String(a).split("://")[0]]) warnings.push({ rel: f.rel, msg: `${k.data}: no tool registered for "${String(a).split("://")[0]}://" (brain.json, data)` });
    }
    if (bySlug.has(f.slug)) e(`same file name as ${bySlug.get(f.slug)}: names must be unique across folders`);
    else bySlug.set(f.slug, f.rel);
  }
  for (const f of fiches) for (const l of f.links) if (!bySlug.has(l)) warnings.push({ rel: f.rel, msg: `link to a note that does not exist: [[${l}]]` });
  return { errors, warnings };
}

/** Reads the whole vault; a note that cannot even be parsed is an error. */
// The text sent for a note's vector: its title, then its type and domains,
// which say what kind of thing it is (search by meaning then groups an idea
// with ideas, a person with people), then its body. Cut at 8,000 characters:
// the beginning carries the meaning, and the API caps an input anyway.
export const embText = (f) => {
  const domains = asList(f.fm.domains);
  return `${f.fm.title ?? f.slug} (${f.fm.type}, ${domains.join(", ")})\n\n${f.body}`.slice(0, 8000);
};

/**
 * A key kept in the Hypervibe vault (Bitwarden, the plugin Hypervibe's own
 * tool), for a person who keeps their keys there rather than in the brain's
 * .env. Read silently, never printed nor written; null when there is no such
 * vault on this computer, when it is locked, or with HVBRAIN_VAULT=off.
 */
export function hypervibeVault(item, field) {
  for (const v of hypervibeVaultScripts()) {
    const r = spawnSync(process.execPath, [v, "get", item, field], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

/**
 * The vault.mjs of every Hypervibe vault installed on this computer (none with
 * HVBRAIN_VAULT=off).
 *
 * ONLY THE PLUGIN THE PLATFORM REGISTERED (2026-11-27, security audit). Every
 * folder under ~/.claude/plugins was walked, and any scripts/vault/vault.mjs
 * found there was run and believed: a file dropped in that folder by anything
 * (a download, another plugin's cache) was asked for the person's keys' names
 * and answered what it wanted in their place. A vault is now the one of a
 * Hypervibe plugin that Claude Code's own registry lists
 * (~/.claude/plugins/installed_plugins.json), at the place it lists it.
 */
export function hypervibeVaultScripts() {
  if (process.env.HVBRAIN_VAULT === "off") return [];
  const listed = readJsonFile(join(HOME, ".claude", "plugins", "installed_plugins.json"), {}).value ?? {};
  const vaults = [];
  for (const [key, installs] of Object.entries(listed.plugins ?? listed)) {
    // "hypervibe@<marketplace>", or one of its editions ("hypervibe-<edition>@..."); never this plugin ("brain@...").
    if (!/^hypervibe(-[a-z0-9-]+)?@/i.test(key)) continue;
    for (const install of [].concat(installs ?? [])) {
      const script = install?.installPath ? join(String(install.installPath), "scripts", "vault", "vault.mjs") : "";
      if (script && existsSync(script) && !vaults.includes(script)) vaults.push(script);
    }
  }
  return vaults;
}

/**
 * THE COMPUTER'S OWN JOURNALS KEEP NINETY DAYS (2026-11-27). What each call
 * to the brain cost (~/.hypervibe-brain/usage.jsonl) and which skill was used
 * when (skills-used.jsonl) are kept for the live view, on this computer only;
 * they grew for ever. At most once a day, the lines older than `days` leave,
 * and so does the start of the person's messages that the suggestion hook
 * wrote in the first one until 2026-11-27. A comfort: never throws.
 * @returns {Record<string, number> | null} lines taken out or rewritten per file; null when it was done less than a day ago
 */
export function purgeLocalJournals({ days = 90, now = Date.now() } = {}) {
  const dir = join(HOME, ".hypervibe-brain");
  const mark = join(dir, "journals-purged.json");
  try {
    if (now - statSync(mark).mtimeMs < 86_400_000) return null;
  } catch {
    // never done
  }
  const limit = new Date(now - days * 86_400_000).toISOString();
  /** @type {Record<string, number>} */
  const out = {};
  for (const name of ["usage.jsonl", "skills-used.jsonl"]) {
    try {
      const file = join(dir, name);
      const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
      let changed = 0;
      const kept = [];
      for (const line of lines) {
        const at = /"at":"([^"]+)"/.exec(line)?.[1];
        if (at && at < limit) {
          changed++;
          continue;
        }
        if (line.includes('"tool":"(suggestion)"') && line.includes('"what":')) {
          try {
            const { what: _text, ...rest } = JSON.parse(line);
            kept.push(JSON.stringify(rest));
            changed++;
            continue;
          } catch {
            // a damaged line: kept as it is
          }
        }
        kept.push(line);
      }
      if (changed) {
        writeFileAtomic(file, kept.length ? `${kept.join("\n")}\n` : "");
        out[name] = changed;
      }
    } catch {
      // no such journal on this computer
    }
  }
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(mark, `${JSON.stringify({ at: new Date(now).toISOString() })}\n`, "utf8");
  } catch {
    // tried again at the next start
  }
  return out;
}

/**
 * WHO ELSE MAY WRITE IN A FOLDER (2026-11-27). A brain holds what runs for
 * the person (its sources, its guards) and what their AI reads as theirs: a
 * folder another account of the computer may write in is a brain anybody
 * there may change. On macOS and Linux, the folder's mode: writable by its
 * group or by all. On Windows, its access list: an entry that allows writing
 * to a group that is everybody (Everyone, Authenticated Users, Users). The
 * groups are told by their identifiers, which the system's language does not
 * change (icacls prints their names, translated: the list is asked of the
 * system itself, through PowerShell, which gives the identifiers).
 * @param {string} folder
 * @returns {string | null} who else may write there, in a few words, or null (nobody, or it could not be read)
 */
export function writableByOthers(folder) {
  try {
    if (process.platform !== "win32") {
      const mode = statSync(folder).mode;
      if (mode & 0o002) return "every account of this computer";
      if (mode & 0o020) return "the accounts of its group";
      return null;
    }
    const script = "$a = (Get-Acl -LiteralPath $env:HVB_FOLDER).Access; foreach ($e in $a) { try { $s = $e.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch { $s = [string]$e.IdentityReference }; Write-Output ($s + '|' + [string]$e.AccessControlType + '|' + [string]$e.FileSystemRights) }";
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true, timeout: 20_000, env: { ...process.env, HVB_FOLDER: resolve(folder) } });
    if (r.status !== 0) return null;
    const everybody = { "S-1-1-0": "every account of this computer", "S-1-5-11": "the other accounts of this computer", "S-1-5-32-545": "the other accounts of this computer" };
    let found = null;
    for (const line of String(r.stdout).split(/\r?\n/)) {
      const [sid, kind, rights = ""] = line.trim().split("|");
      if (!everybody[sid] || kind !== "Allow") continue;
      // A right that writes, by its name, or as the number the system gives for a generic right (all, or write).
      const n = Number(rights);
      const writes = /FullControl|Modify|Write|CreateFiles|AppendData|Delete|ChangePermissions|TakeOwnership/.test(rights) || (Number.isInteger(n) && ((n >>> 0) & 0x50000000) !== 0);
      if (writes && (!found || sid === "S-1-1-0")) found = everybody[sid];
    }
    return found;
  } catch {
    return null;
  }
}

// A NOTE IS READ ONCE PER VERSION OF ITS FILE (2026-11-16). Reading the vault
// used to open and parse every note at every call, and to read brain.json
// again for each of them. Measured on a real brain of 1 946 notes: 139
// seconds, on a computer whose antivirus looks at every file opened. And the
// vault is read at each index rebuild, so a search asked right after a note
// was written waited for all of it: searches of 150 to 420 seconds in a
// week's journal, and a judge that timed out. Now a note whose file has
// neither moved nor changed size is taken from a cache kept on this computer
// (~/.hypervibe-brain/cache/, never in the brain: it is derived, and every
// computer has its own dates). One note written: one file read.
// HVBRAIN_NOTES_CACHE=off reads everything again, as before.
const PARSE_VERSION = 1;
const notesCacheFile = () => join(HOME, ".hypervibe-brain", "cache", `notes-${sha256(toPosix(ROOT)).slice(0, 12)}.json`);

export function readVault() {
  const fiches = [];
  const errors = [];
  const cfg = safeConfig();
  const voc = vocab(cfg);
  const useCache = process.env.HVBRAIN_NOTES_CACHE !== "off";
  // The cache holds notes as THIS reading shapes them: another format of the
  // brain, or another way of parsing, and it starts again.
  const key = `${PARSE_VERSION}|${cfg?.format ?? ""}`;
  let kept = {};
  if (useCache) {
    try {
      const c = JSON.parse(readFileSync(notesCacheFile(), "utf8"));
      if (c.key === key && c.notes && typeof c.notes === "object") kept = c.notes;
    } catch {
      // no cache yet, or an unreadable one: everything is read
    }
  }
  const next = {};
  let moved = false;
  for (const abs of listFiches()) {
    const rel = toPosix(relative(ROOT, abs));
    try {
      let stamp = "";
      if (useCache) {
        const st = statSync(abs);
        stamp = `${st.mtimeMs}:${st.size}`;
        if (kept[rel]?.s === stamp) {
          next[rel] = kept[rel];
          fiches.push(kept[rel].f);
          continue;
        }
      }
      const f = parseFiche(abs, voc);
      fiches.push(f);
      if (stamp) next[rel] = { s: stamp, f };
      moved = true;
    } catch (e) {
      // A note that cannot be read is never kept: it is read again until it is right.
      errors.push({ rel, msg: e.message });
    }
  }
  if (useCache && (moved || Object.keys(next).length !== Object.keys(kept).length)) {
    try {
      const f = notesCacheFile();
      mkdirSync(dirname(f), { recursive: true });
      // Written beside, then renamed: another process never reads half a file.
      const tmp = `${f}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ key, notes: next }), "utf8");
      renameSync(tmp, f);
    } catch {
      // a comfort, not a guarantee: the next reading parses what it must
    }
  }
  return { fiches, errors };
}
