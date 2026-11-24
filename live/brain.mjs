// brain.mjs: the brain as the plugin's own index gives it.
//
// The live view reads ONE thing to know the notes: the SQLite index that the
// plugin builds (brain.json, "index": { "db" }, `index/brain.sqlite` unless
// said otherwise). Nothing here depends on a file that only one person's
// brain produces (until 2026-11-10 the map read `index/graph.json` and
// `index/embeddings/fiches/`, both written by the build scripts of the brain this plugin was first made for).
//
// Everything is in the plugin's canonical vocabulary: the type, domain and
// status identifiers as the notes carry them. The page turns them into words.

import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

/** @typedef {import("./contract.d.ts").Domain} Domain */
/** @typedef {import("./contract.d.ts").NoteType} NoteType */
/** @typedef {import("./contract.d.ts").Vocabulary} Vocabulary */
/** @typedef {Record<string, any>} BrainSettings brain.json, as the plugin and the person write it */
/**
 * @typedef {object} Note One note of the brain, as the map needs it.
 * @property {string} id        its slug
 * @property {string} title
 * @property {string} type      canonical type id ("person", "idea"...)
 * @property {string[]} domains canonical domain ids
 * @property {string} status    "seed" | "trusted" | "archived" (or the brain's own)
 * @property {boolean} contact  a contact's note: kept off the map of ideas
 * @property {string} created   YYYY-MM-DD
 * @property {string} updated   YYYY-MM-DD
 * @property {string} source    where it comes from (a portable pointer)
 * @property {string} nature    "decision" | "feedback" | "lesson" | ""
 * @property {number} degree    how many links touch it
 */

// The colours of the domains, in the order brain.json lists them. A brain may
// set its own ("domains": { "<id>": { "color": "#rrggbb" } }); beyond the
// palette, a colour is derived from the identifier, the same on every computer.
const PALETTE = ["#e0559b", "#3fb984", "#4aa3ff", "#b98cff", "#ff8a3d", "#3fd4d4", "#c9a227", "#8a94a6", "#e66767", "#7bd389", "#9085e9", "#d98f3f"];
/** @param {string} id */
function derivedColor(id) {
  let h = 0;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 62%)`;
}

const cache = new Map(); // file -> { stamp, value }
/**
 * A file read once per version of it (its date and size).
 * @template T
 * @param {string} file
 * @param {() => T} read
 * @returns {T}
 */
function once(file, read) {
  let stamp = "";
  try {
    const s = statSync(file);
    stamp = `${s.mtimeMs}:${s.size}`;
  } catch {
    stamp = "absent";
  }
  const kept = cache.get(file);
  if (kept?.stamp === stamp) return kept.value;
  const value = read();
  cache.set(file, { stamp, value });
  return value;
}

/**
 * brain.json, or {} when the brain has none yet.
 * @param {string} brain the brain's folder
 * @returns {BrainSettings}
 */
export function settings(brain) {
  const file = join(brain, "brain.json");
  return once(file, () => {
    try {
      return JSON.parse(readFileSync(file, "utf8"));
    } catch {
      return {};
    }
  });
}

/**
 * Where the plugin keeps its index for this brain.
 * @param {string} brain
 * @returns {string}
 */
export const indexPath = (brain) => join(brain, settings(brain).index?.db ?? "index/brain.sqlite");

/**
 * The brain's language: French or English, anything else is English.
 * @param {string} brain
 * @returns {"fr" | "en"}
 */
export const language = (brain) => (settings(brain).lang === "fr" ? "fr" : "en");

/**
 * The words the page needs: language, domains with their colours, types.
 * @param {string} brain
 * @returns {Vocabulary}
 */
export function vocabulary(brain) {
  const s = settings(brain);
  // brain.json says its domains either as a plain list of ids (what the
  // plugin writes for a new brain) or as { id: { label, color } }. Read as an
  // object only, a list gave domains named "0", "1"... (seen 2026-11-16 on a
  // brain just created).
  const declared = /** @type {[string, any][]} */ (Array.isArray(s.domains) ? s.domains.map((id) => [String(id), null]) : Object.entries(s.domains ?? {}));
  const domains = declared.map(([id, d], i) => ({
    id,
    label: (d && typeof d === "object" ? d.label : d) || id,
    color: (d && typeof d === "object" && /^#[0-9a-f]{6}$/i.test(d.color ?? "") ? d.color : null) ?? PALETTE[i] ?? derivedColor(id),
  }));
  const types = Object.entries(s.types ?? {}).map(([id, folder]) => ({ id, folder: String(folder) }));
  return {
    lang: language(brain),
    name: typeof s.name === "string" ? s.name : "",
    domains,
    types,
    personType: s.contacts?.personType ?? "person",
    natures: [...new Set(Object.values(s.natures ?? {}).flat())],
    // Notes a brain files under a name prefix as its AI's memory (viz.memoryPrefixes).
    memoryPrefixes: Array.isArray(s.viz?.memoryPrefixes) ? s.viz.memoryPrefixes.map(String) : [],
  };
}

/**
 * Runs `use(db)` on the index, read only; `fallback` when there is no index yet.
 * @template T
 * @param {string} brain
 * @param {T} fallback
 * @param {(db: DatabaseSync) => T} use
 * @returns {T}
 */
function withIndex(brain, fallback, use) {
  const file = indexPath(brain);
  if (!existsSync(file)) return fallback;
  /** @type {DatabaseSync | null} */
  let db = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return use(db);
  } catch {
    // an index being rebuilt, or of an older shape: the next reading has it
    return fallback;
  } finally {
    try {
      db?.close();
    } catch {
      // closed already
    }
  }
}

/**
 * The rows of a query. The index is the plugin's: its columns are text and
 * numbers, taken here as they come.
 * @param {DatabaseSync} db
 * @param {string} sql
 * @param {...(string | number)} values
 * @returns {Record<string, any>[]}
 */
const rows = (db, sql, ...values) => db.prepare(sql).all(...values);

/**
 * The date the index was built, as the index says it.
 * @param {DatabaseSync} db
 * @returns {string | null}
 */
const built = (db) => rows(db, "SELECT v FROM meta WHERE k = 'built'")[0]?.v ?? null;

/** @param {string | null | undefined} json a JSON list kept as text in the index */
const list = (json) => {
  try {
    const v = JSON.parse(json || "[]");
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
};

/**
 * When the index was last built (an ISO date), or null.
 * @param {string} brain
 * @returns {string | null}
 */
export const builtAt = (brain) => withIndex(brain, /** @type {string | null} */ (null), built);

/** @typedef {{ builtAt: string | null, notes: Note[], links: [string, string][] }} Graph */

/**
 * Every note and every link.
 * @param {string} brain
 * @returns {Graph}
 */
export function graph(brain) {
  /** @type {string[]} */
  const hidden = (settings(brain).search?.hidden ?? []).map((p) => String(p).replace(/\\/g, "/").replace(/^\/+/, ""));
  /** @param {string | null} rel */
  const isContact = (rel) => {
    const r = String(rel ?? "").replace(/\\/g, "/").replace(/^vault\//, "");
    return hidden.some((p) => r.startsWith(p));
  };
  /** @type {Graph} */
  const empty = { builtAt: null, notes: [], links: [] };
  return withIndex(brain, empty, (db) => {
    const natures = new Map(rows(db, "SELECT slug, nature FROM facet WHERE nature IS NOT NULL").map((r) => [r.slug, r.nature]));
    const all = rows(db, "SELECT slug, rel, type, title, domains, status, visibility, created, updated, source FROM fiche");
    const known = new Set(all.map((r) => r.slug));
    const degree = new Map();
    /** @type {[string, string][]} */
    const links = [];
    for (const { src, dst } of rows(db, "SELECT DISTINCT src, dst FROM link")) {
      if (src === dst || !known.has(src) || !known.has(dst)) continue;
      links.push([src, dst]);
      degree.set(src, (degree.get(src) ?? 0) + 1);
      degree.set(dst, (degree.get(dst) ?? 0) + 1);
    }
    const notes = all.map((r) => ({
      id: r.slug,
      title: r.title || r.slug,
      type: r.type || "",
      domains: list(r.domains),
      status: r.status || "",
      contact: isContact(r.rel),
      created: r.created || "",
      updated: r.updated || "",
      source: r.source || "",
      nature: natures.get(r.slug) ?? "",
      degree: degree.get(r.slug) ?? 0,
    }));
    return { builtAt: built(db), notes, links };
  });
}

/**
 * The title of each note the index knows: slug -> title.
 * @param {string} brain
 * @returns {Map<string, string>}
 */
export function titles(brain) {
  // (Read once per version of the index's file: every card of a tool asked
  // for all of them again, audit 14 of 2026-11-21.)
  const file = indexPath(brain);
  let stamp = "absent";
  try {
    const s = statSync(file);
    stamp = `${s.mtimeMs}:${s.size}`;
  } catch {
    stamp = "absent";
  }
  if (keptTitles?.file === file && keptTitles.stamp === stamp) return keptTitles.value;
  const value = withIndex(brain, /** @type {Map<string, string>} */ (new Map()), (db) => new Map(rows(db, "SELECT slug, title FROM fiche").map((r) => [r.slug, r.title || r.slug])));
  keptTitles = { file, stamp, value };
  return value;
}
/** @type {{ file: string, stamp: string, value: Map<string, string> } | null} */
let keptTitles = null;

/**
 * Where a note is in the brain, as the index knows it: its path from the
 * brain's folder ("vault/ideas/x.md"), or null for a note the index does not know.
 * @param {string} brain
 * @param {string} slug
 * @returns {string | null}
 */
export const noteFile = (brain, slug) =>
  withIndex(brain, /** @type {string | null} */ (null), (db) => {
    const rel = rows(db, "SELECT rel FROM fiche WHERE slug = ?", slug)[0]?.rel;
    return rel ? String(rel).replaceAll("\\", "/") : null;
  });

/**
 * The vector of each note that has one, normalised: slug -> Float32Array.
 * @param {string} brain
 * @returns {Map<string, Float32Array>}
 */
export function vectors(brain) {
  return withIndex(brain, new Map(), (db) => {
    const out = new Map();
    for (const r of rows(db, "SELECT slug, dims, vec FROM vec")) {
      const bytes = r.vec;
      if (!bytes || bytes.byteLength !== r.dims * 4) continue;
      const v = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      let n = 0;
      for (let i = 0; i < v.length; i++) n += v[i] * v[i];
      n = Math.sqrt(n) || 1;
      for (let i = 0; i < v.length; i++) v[i] /= n;
      out.set(r.slug, v);
    }
    return out;
  });
}

/**
 * How much each note counts (the plugin's weights), slug -> number.
 * @param {string} brain
 * @returns {Record<string, number>}
 */
export const weights = (brain) =>
  withIndex(brain, {}, (db) => Object.fromEntries(rows(db, "SELECT slug, w FROM weight").map((r) => [r.slug, r.w])));

/**
 * The notes updated since a local day (YYYY-MM-DD), by the index's own date.
 * @param {string} brain
 * @param {string} day
 * @returns {string[]}
 */
export const updatedSince = (brain, day) => withIndex(brain, /** @type {string[]} */ ([]), (db) => rows(db, "SELECT slug FROM fiche WHERE updated >= ?", day).map((r) => r.slug));
