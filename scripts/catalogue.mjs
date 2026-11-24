// catalogue.mjs - THE CATALOGUE: what the brain knows how to find again, without
// keeping it. A post, a contact, an artwork, a meeting: data that lives in its
// own tool (a database, an agenda). The brain keeps, for each, its ADDRESS
// (scheme://path, the same form as a note's `data`), a title, a date, a short
// excerpt and its vector; the full text stays in the tool, read again through
// brain_fetch when it is needed.
//
// Where it lives:
//   catalogue/<source>.jsonl            one line per entry, in git (the brain's copies)
//   <embeddings>/catalogue/<key>.json   its vector, in git like the notes' vectors
//   index/catalogue-pending.jsonl       the full texts waiting for their vector
//                                       (out of git; emptied by the next build)
//
// A source feeds it with lines { "kind": "entry", "address", "title", "text",
// "date", "url", "domains", "tool" } (sources.mjs). Nothing here calls a
// network: the vectors are computed by the build, which is asynchronous.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_ADDRESS, EMB_DIR, INDEX, ROOT, sha256, writeFileAtomic } from "./lib.mjs";

export const CATALOGUE_DIR = join(ROOT, "catalogue");
export const CATALOGUE_VEC_DIR = join(EMB_DIR, "catalogue");
const PENDING = join(INDEX, "catalogue-pending.jsonl");
const EXCERPT = 300;

/** A file name for an address: its hash, since an address holds slashes. */
export const addressKey = (address) => createHash("sha1").update(String(address)).digest("hex");

/** The text a vector is computed from: the title, then the full text. */
export const entryText = (e) => `${e.title ?? ""}\n\n${e.text ?? ""}`.slice(0, 8000);

/** What a vector depends on: the model, its size and the text. */
export const entryHash = (e, cfg) => sha256(`${cfg.embeddings.model}|${cfg.embeddings.dims}|${entryText(e)}`);

const SOURCE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function readJsonl(file) {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a line cut by a crash: the next write rewrites the file whole
    }
  }
  return out;
}

/** Every entry of the catalogue, from every source. */
export function readCatalogue() {
  if (!existsSync(CATALOGUE_DIR)) return [];
  const out = [];
  for (const f of readdirSync(CATALOGUE_DIR).filter((n) => n.endsWith(".jsonl")).sort()) {
    const source = f.slice(0, -6);
    for (const e of readJsonl(join(CATALOGUE_DIR, f))) out.push({ ...e, source });
  }
  return out;
}

/** The catalogue's fingerprint, for the index to know it must be rebuilt. */
export function catalogueFingerprint() {
  if (!existsSync(CATALOGUE_DIR)) return "0";
  return readdirSync(CATALOGUE_DIR)
    .filter((n) => n.endsWith(".jsonl"))
    .sort()
    .map((n) => `${n}:${sha256(readFileSync(join(CATALOGUE_DIR, n), "utf8")).slice(0, 12)}`)
    .join(",");
}

/**
 * The catalogue's files as the disk dates them (2026-11-21). The fingerprint
 * above reads and hashes every file (3.3 MB on a real brain, 30 to 40 ms)
 * and was asked at every question: the build asks this first, which opens
 * nothing, and only hashes when a date or a size moved.
 */
export function catalogueStamp() {
  if (!existsSync(CATALOGUE_DIR)) return "0";
  return readdirSync(CATALOGUE_DIR)
    .filter((n) => n.endsWith(".jsonl"))
    .sort()
    .map((n) => {
      try {
        const st = statSync(join(CATALOGUE_DIR, n));
        return `${n}:${Math.round(st.mtimeMs)}:${st.size}`;
      } catch {
        return `${n}:gone`;
      }
    })
    .join(",");
}

/** Checks one entry as a source sent it; returns the problem, or null. */
export function entryProblem(item) {
  if (!item.address || !DATA_ADDRESS.test(String(item.address))) return "an entry needs an address (scheme://path)";
  if (!item.title) return "an entry needs a title";
  return null;
}

/**
 * Adds or refreshes a source's entries. With `replace`, the entries this
 * source no longer sends leave the catalogue (a source that sends its whole
 * list each time); otherwise they stay (a source that sends what changed).
 */
export function upsertEntries(source, items, cfg, { replace = false } = {}) {
  if (!SOURCE_NAME.test(source)) throw new Error(`"${source}" is not a source name`);
  mkdirSync(CATALOGUE_DIR, { recursive: true });
  const file = join(CATALOGUE_DIR, `${source}.jsonl`);
  const known = new Map(readJsonl(file).map((e) => [e.address, e]));
  const kept = replace ? new Map() : new Map(known);
  const res = { added: 0, updated: 0, unchanged: 0, removed: 0, pending: 0 };
  const pending = [];
  // ONE ENTRY PER ADDRESS, THE LAST ONE SENT (2026-11-21). A source that sent
  // two lines for one address (an agenda, an event and its update) kept only
  // the last in the file; at the next pass the first was compared with it,
  // counted "updated", and its text queued for a vector, again at every pass:
  // the catalogue looked moved, and the index was rebuilt for nothing, thirty
  // times a day on a real brain.
  for (const item of items) {
    const problem = entryProblem(item);
    if (problem) throw new Error(problem);
  }
  const last = new Map();
  for (const item of items) {
    last.delete(String(item.address));
    last.set(String(item.address), item);
  }
  // A text already waiting for its vector is not queued a second time.
  const waiting = new Set(readPending().map((p) => `${p.address}|${p.hash}`));
  // The same content, whatever the order its fields were written in.
  const same = (a, b) => JSON.stringify(Object.entries(a).sort(([x], [y]) => (x < y ? -1 : 1))) === JSON.stringify(Object.entries(b).sort(([x], [y]) => (x < y ? -1 : 1)));
  for (const item of last.values()) {
    const text = String(item.text ?? "").replace(/\r\n/g, "\n").trim();
    const e = {
      address: String(item.address),
      tool: String(item.tool ?? source),
      title: String(item.title).slice(0, 300),
      ...(item.date ? { date: String(item.date).slice(0, 10) } : {}),
      ...(item.url ? { url: String(item.url) } : {}),
      domains: [].concat(item.domains ?? []).map(String).filter(Boolean),
      excerpt: text.slice(0, EXCERPT),
      hash: entryHash({ title: item.title, text }, cfg),
    };
    const before = known.get(e.address);
    if (!before) res.added++;
    else if (!same(before, e)) res.updated++;
    else res.unchanged++;
    // An entry that did not change keeps the very line the file holds.
    kept.set(e.address, before && same(before, e) ? before : e);
    // The vector is computed later, from the full text, which never enters git.
    const vec = readVector(e.address);
    if (vec?.hash !== e.hash && !waiting.has(`${e.address}|${e.hash}`)) pending.push({ address: e.address, hash: e.hash, text: entryText({ title: item.title, text }) });
  }
  if (replace) res.removed = [...known.keys()].filter((a) => !kept.has(a)).length;
  const lines = [...kept.values()].sort((a, b) => a.address.localeCompare(b.address)).map((e) => JSON.stringify(e));
  const text = lines.length ? `${lines.join("\n")}\n` : "";
  // Written only when something changed, and whole or not at all (2026-11-21):
  // a source that sends the same list again left the file's date alone, so the
  // index is not rebuilt for nothing; and a build that read the file half
  // written took the missing entries for entries gone.
  let before = null;
  try {
    before = readFileSync(file, "utf8");
  } catch {
    before = null;
  }
  if (before !== text) writeFileAtomic(file, text);
  if (pending.length) {
    mkdirSync(INDEX, { recursive: true });
    appendFileSync(PENDING, `${pending.map((p) => JSON.stringify(p)).join("\n")}\n`, "utf8");
    res.pending = pending.length;
  }
  return res;
}

export function readVector(address) {
  try {
    return JSON.parse(readFileSync(join(CATALOGUE_VEC_DIR, `${addressKey(address)}.json`), "utf8"));
  } catch {
    return null;
  }
}

export function writeVector(address, hash, cfg, vec) {
  mkdirSync(CATALOGUE_VEC_DIR, { recursive: true });
  const buf = Buffer.from(new Float32Array(vec).buffer);
  writeFileSync(join(CATALOGUE_VEC_DIR, `${addressKey(address)}.json`), `${JSON.stringify({ address, hash, model: cfg.embeddings.model, dims: vec.length, vec: buf.toString("base64") })}\n`);
}

/** The texts waiting for their vector: the last one of each address wins. */
export function readPending() {
  const by = new Map();
  for (const p of readJsonl(PENDING)) by.set(p.address, p);
  return [...by.values()];
}

export function clearPending() {
  if (existsSync(PENDING)) unlinkSync(PENDING);
}

/** Keeps only these texts waiting: what a build could not have computed, when a part of them was. */
export function setPending(list) {
  if (!list.length) return clearPending();
  writeFileAtomic(PENDING, `${list.map((p) => JSON.stringify(p)).join("\n")}\n`);
}
