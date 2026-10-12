// lib.mjs - What every script of the brain shares: where things are, how a
// note (a "fiche") is read, and what makes it valid.
//
// Zero dependency on purpose: SQLite comes with Node (22.13+), the frontmatter
// is a small fixed format read below, and the MCP server speaks its protocol
// by hand. Nothing to install means nothing that breaks on a new computer.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
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

export function userConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return {};
  }
}

export function setUserConfig(patch) {
  const next = { ...userConfig(), ...patch };
  mkdirSync(dirname(CONFIG_FILE), { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, CONFIG_FILE);
  return next;
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
  console.error(BRAIN ? `no brain in ${BRAIN} (no brain.json)` : "no brain set up on this computer yet: run /brain:create");
  process.exit(3);
}

export const ROOT = BRAIN ?? join(HOME, ".hypervibe-brain", "no-brain");
export const VAULT = join(ROOT, "vault");
export const INDEX = join(ROOT, "index");
/** Which notes Claude read through the tools: a promotion signal, local to each computer, never in git. */
export const readsFile = (cfg = config()) => join(INDEX, cfg.format === "fr" ? "mcp-journal.jsonl" : "reads.jsonl");
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
  mkdirSync(join(HOME, ".hypervibe-brain"), { recursive: true });
  writeFileSync(WRITTEN(), `${JSON.stringify(all)}\n`, "utf8");
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
  cfg.domains ??= [];
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
export const DERIVED = [/^index\/embeddings\//, /^index\/(annuaire|directory)\.json$/, /^index\/promotions\.jsonl$/, /^reviews\//, /^sources\/[^/]+\/(seen|state)\.json$/];
/** What the saves commit at all: anything else in the folder stays out of git. */
export const OWNED = [/^vault\//, /^journal\/[^/]+\.jsonl$/, /^index\/embeddings\//, /^reviews\//, /^sources\//, /^index\/(annuaire|directory)\.json$/, /^index\/promotions\.jsonl$/, /^(BRAIN|SOURCES)\.md$/, /^brain\.json$/, /^hyperbrain\.json$/];

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
    if (!f.body) warnings.push({ rel: f.rel, msg: "empty body" });
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

export function readVault() {
  const fiches = [];
  const errors = [];
  for (const abs of listFiches()) {
    try {
      fiches.push(parseFiche(abs));
    } catch (e) {
      errors.push({ rel: toPosix(relative(ROOT, abs)), msg: e.message });
    }
  }
  return { fiches, errors };
}
