// lib.mjs - What every script of the brain shares: where things are, how a
// note (a "fiche") is read, and what makes it valid.
//
// Zero dependency on purpose: SQLite comes with Node (22.13+), the frontmatter
// is a small fixed format read below, and the MCP server speaks its protocol
// by hand. Nothing to install means nothing that breaks on a new computer.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const VAULT = join(ROOT, "vault");
export const INDEX = join(ROOT, "index");
export const DB_PATH = join(INDEX, "brain.sqlite");
export const EMB_DIR = join(INDEX, "embeddings");

/** The nine types, and the folder each one lives in. The folder IS the type. */
export const TYPES = {
  idea: "ideas",
  concept: "concepts",
  note: "notes",
  project: "projects",
  person: "people",
  organization: "organizations",
  publication: "publications",
  event: "events",
  source: "sources",
};
export const FOLDER_TO_TYPE = Object.fromEntries(Object.entries(TYPES).map(([t, f]) => [f, t]));
export const STATUSES = ["seed", "trusted", "archived"];
export const VISIBILITIES = ["public", "internal", "private"];
/** Never read, never indexed, never copied anywhere: the last resort. */
const SKIPPED_DIRS = new Set(["danger-zone"]);
const SKIPPED_FILES = new Set(["CLAUDE.md", "README.md"]);

export function config() {
  const cfg = JSON.parse(readFileSync(join(ROOT, "hyperbrain.json"), "utf8"));
  cfg.embeddings ??= {};
  cfg.embeddings.model ??= "text-embedding-3-small";
  cfg.embeddings.dims ??= 512;
  cfg.domains ??= [];
  return cfg;
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

export function slugify(title) {
  const s = String(title)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (s.length <= 60) return s || "note";
  const cut = s.slice(0, 60);
  return cut.slice(0, cut.lastIndexOf("-") > 30 ? cut.lastIndexOf("-") : 60);
}

/** Every note of the vault, as absolute paths. */
export function listFiches() {
  const out = [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
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
export function parseFiche(abs) {
  const raw = readFileSync(abs, "utf8").replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(raw);
  const rel = toPosix(relative(ROOT, abs));
  if (!m) throw new Error(`${rel}: no frontmatter (the note must start with ---)`);
  const fm = parseFrontmatter(m[1]);
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
  for (const f of fiches) {
    const e = (msg) => errors.push({ rel: f.rel, msg });
    const { fm } = f;
    if (!TYPES[fm.type]) e(`unknown type "${fm.type ?? ""}" (allowed: ${Object.keys(TYPES).join(", ")})`);
    else if (TYPES[fm.type] !== f.folder) e(`type "${fm.type}" must live in vault/${TYPES[fm.type]}/, not vault/${f.folder}/`);
    if (!fm.title || typeof fm.title !== "string") e("missing title");
    const domains = asList(fm.domains);
    if (!domains.length) e("no domain (at least one is required)");
    for (const d of domains) if (cfg.domains.length && !cfg.domains.includes(d)) e(`domain "${d}" is not one of this brain's domains (${cfg.domains.join(", ")})`);
    if (!STATUSES.includes(fm.status)) e(`status must be one of ${STATUSES.join(", ")}`);
    if (!VISIBILITIES.includes(fm.visibility)) e(`visibility must be one of ${VISIBILITIES.join(", ")}`);
    for (const k of ["created", "updated"]) if (!DATE.test(String(fm[k] ?? ""))) e(`${k} must be a date YYYY-MM-DD`);
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
