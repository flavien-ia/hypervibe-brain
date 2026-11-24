#!/usr/bin/env node
// build.mjs - Turns the vault into a searchable index (index/brain.sqlite).
//
// The notes are the only truth; the index is rebuilt from them in a second
// and can be deleted at any time. The one expensive part, the vectors that
// power "search by meaning", is kept in git as one small file per note under
// index/embeddings/: a clone of the brain gets its semantic search back
// without a single API call, and a vector is only recomputed when its note's
// text changed.
//
//   node scripts/build.mjs              build (only what changed: notes, catalogue, vectors)
//   node scripts/build.mjs --if-stale   do nothing if the vault has not moved
//   node scripts/build.mjs --full       write every note again, whatever the index holds
//   node scripts/build.mjs --quiet
//
// ONLY WHAT CHANGED (2026-11-21). Every note was written again each time one
// of them moved, by each program that asked a question (1.2 seconds of notes
// and 0.5 to 0.7 of catalogue on a brain of 2,300 notes, measured), and two
// programs could do it at the same moment. Now a build compares each note's
// hash with the one the index keeps and writes the notes that differ, removes
// those that left, and skips the catalogue when its files did not move. One
// program builds at a time (a lock file beside the index, with the builder's
// number and a date): a question that finds it taken answers from the index
// as it is. A note that is not valid no longer stops the others: it is left
// out (the index keeps what it knew of it), and the build says so.

import { DatabaseSync } from "node:sqlite";
import { closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, statSync, unlinkSync, writeFileSync, writeSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PATH, EMB_DIR, INDEX, ROOT, config, embText, isRunner, listFiches, loadEnv, readVault, requireBrain, sha256, toPosix, validate } from "./lib.mjs";
import { embed, embeddingsAvailable } from "./embeddings.mjs";
import { computeWeights } from "./weights.mjs";
import { CATALOGUE_VEC_DIR, addressKey, catalogueFingerprint, catalogueStamp, readCatalogue, readPending, readVector, setPending, writeVector } from "./catalogue.mjs";
import { unligature } from "./pure.mjs";

// THE VERSION OF WHAT THE INDEX HOLDS. An index written by another version
// (or in the other language of the format) is written again whole, once.
//   2 (2026-11-21): the full text stores œ and æ written out (pure.mjs), and
//     its rows carry the number of their note's row, to be removed one by one.
//   3 (2026-11-21): a private note's text is in the full text and has a
//     vector, like any other (see below): an index of before held them empty.
const SCHEMA_VERSION = 3;
const schemaKey = (cfg) => `${SCHEMA_VERSION}|${cfg.format}`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fiche (slug TEXT PRIMARY KEY, rel TEXT, type TEXT, title TEXT, domains TEXT, status TEXT,
  visibility TEXT, created TEXT, updated TEXT, source TEXT, body TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS link (src TEXT, dst TEXT);
CREATE INDEX IF NOT EXISTS link_dst ON link(dst);
CREATE INDEX IF NOT EXISTS link_src ON link(src);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(slug UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS vec (slug TEXT PRIMARY KEY, hash TEXT, dims INTEGER, vec BLOB);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS facet (slug TEXT PRIMARY KEY, nature TEXT, data TEXT);
CREATE TABLE IF NOT EXISTS entry (address TEXT PRIMARY KEY, tool TEXT, title TEXT, date TEXT, url TEXT, domains TEXT, excerpt TEXT, source TEXT);
CREATE VIRTUAL TABLE IF NOT EXISTS entry_fts USING fts5(address UNINDEXED, title, excerpt, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS entry_vec (address TEXT PRIMARY KEY, dims INTEGER, vec BLOB);
CREATE TABLE IF NOT EXISTS entry_vec_hash (address TEXT PRIMARY KEY, hash TEXT);
`;

export function openDb({ readonly = false } = {}) {
  if (!readonly) mkdirSync(INDEX, { recursive: true });
  if (readonly && !existsSync(DB_PATH)) return null;
  const db = new DatabaseSync(DB_PATH, { readOnly: readonly });
  db.exec("PRAGMA busy_timeout = 5000");
  if (!readonly) {
    db.exec("PRAGMA journal_mode = WAL");
    db.exec(SCHEMA);
  }
  return db;
}

const meta = (db, k) => db.prepare("SELECT v FROM meta WHERE k = ?").get(k)?.v;
const setMeta = (db, k, v) => db.prepare("INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, String(v));

/** What a vector depends on: the model, its size, and the text. Nothing else. */
const embHash = (f, cfg) => sha256(`${cfg.embeddings.model}|${cfg.embeddings.dims}|${embText(f)}`);

const toBlob = (arr) => Buffer.from(new Float32Array(arr).buffer);
const fromB64 = (b64) => Buffer.from(b64, "base64");

function readVectorFile(slug) {
  try {
    return JSON.parse(readFileSync(join(EMB_DIR, `${slug}.json`), "utf8"));
  } catch {
    return null;
  }
}

/**
 * THE VAULT AS THE DISK SHOWS IT (2026-11-21): the path, the date and the size
 * of every note, hashed. The fingerprint of before (lib.mjs: how many notes,
 * and the latest date) did not see a note renamed or moved to another folder,
 * nor an edit that kept the file's date: the index kept the old name until
 * another note moved. A note that leaves during the walk is simply not there.
 * `maxAge` (milliseconds): a program that stays up may reuse the look it took
 * a moment ago, so that a burst of questions walks the vault once.
 */
let lastLook = { at: 0, stamp: "" };
export function vaultStamp({ maxAge = 0 } = {}) {
  if (maxAge > 0 && lastLook.stamp && Date.now() - lastLook.at < maxAge) return lastLook.stamp;
  const lines = [];
  for (const abs of listFiches()) {
    try {
      const st = statSync(abs);
      lines.push(`${toPosix(relative(ROOT, abs))}|${Math.round(st.mtimeMs)}|${st.size}`);
    } catch {
      // moved or deleted during the walk: the next look sees where it went
    }
  }
  lines.sort();
  lastLook = { at: Date.now(), stamp: `${lines.length}:${sha256(lines.join("\n")).slice(0, 24)}` };
  return lastLook.stamp;
}

/**
 * Whether the catalogue moved since the index took it. The files' dates and
 * sizes first, which open nothing; their content only when one of those moved
 * (a file written again with the same lines is then remembered as seen).
 */
function catalogueMoved(db) {
  const stamp = catalogueStamp();
  if (meta(db, "catalogue_stamp") === stamp) return false;
  if (meta(db, "catalogue") !== catalogueFingerprint()) return true;
  try {
    setMeta(db, "catalogue_stamp", stamp);
  } catch {
    // another program is writing the index: asked again at the next question
  }
  return false;
}

/**
 * Whether the index must be rebuilt. `text: true` asks only about the text
 * (the notes, the catalogue): the vectors still owed do not count, they are
 * computed apart (vectorsOwed).
 */
export function isStale(db, { text = false, maxAge = 0 } = {}) {
  const moved = meta(db, "schema") !== schemaKey(config()) || meta(db, "vault") !== vaultStamp({ maxAge }) || catalogueMoved(db);
  return text ? moved : moved || readPending().length > 0 || vectorsOwed(db);
}

/** Vectors left for later by a build of the text alone (vectors: false). */
export const vectorsOwed = (db) => meta(db, "vectors_owed") === "1";

/** The notes the last build left out because they were not valid: [{ rel, msg }]. */
export function leftOut(db) {
  try {
    const list = JSON.parse(meta(db, "errors") || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// ONE PROGRAM BUILDS AT A TIME (2026-11-21). Up to sixteen programs an hour
// (each conversation's server, the judges', the hub, the live view) saw the
// same note move and each rebuilt the index for itself, queueing behind one
// another's transactions until SQLite gave up (SQLITE_BUSY). The builder now
// holds a file beside the index, with its process number and the date. A dead
// builder does not keep it: a number no program has any more, or a date older
// than half an hour (a long build dates it again at each batch of vectors),
// and the next one takes it over.
const LOCK = `${DB_PATH}.build.lock`;
const LOCK_MAX_AGE = 30 * 60_000;
let building = false;
function lockIsDead() {
  let held;
  try {
    held = JSON.parse(readFileSync(LOCK, "utf8"));
  } catch {
    // Being written this very instant, or cut by a crash: its age decides.
    try {
      return Date.now() - statSync(LOCK).mtimeMs > 10_000;
    } catch {
      return false; // gone meanwhile: the next try takes it
    }
  }
  if (!Number.isInteger(held?.pid) || !(Date.now() - Date.parse(held.at) < LOCK_MAX_AGE)) return true;
  // This program's own number, while it is not building: a number given again
  // by the system to a new program.
  if (held.pid === process.pid) return true;
  try {
    process.kill(held.pid, 0);
    return false;
  } catch (e) {
    return e.code !== "EPERM"; // EPERM: it exists, under another account
  }
}
function takeLock() {
  if (building) return false;
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = openSync(LOCK, "wx");
      try {
        writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      } finally {
        closeSync(fd);
      }
      building = true;
      return true;
    } catch (e) {
      // EPERM: on Windows, a file another program is deleting this instant.
      if (e.code !== "EEXIST" && e.code !== "EPERM") throw e;
      if (!lockIsDead()) return false;
      try {
        unlinkSync(LOCK);
      } catch {
        // taken over by another program meanwhile
      }
    }
  }
  return false;
}
/** A long build (vectors asked batch after batch) dates its lock again, so that its age does not hand it over while it works. */
function keepLock() {
  if (!building) return;
  try {
    writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
  } catch {
    // held for an instant by another program reading it: dated at the next batch
  }
}
function releaseLock() {
  building = false;
  try {
    if (JSON.parse(readFileSync(LOCK, "utf8")).pid === process.pid) unlinkSync(LOCK);
  } catch {
    // already gone
  }
}
/** A build asked for by name (not `ifStale`) waits its turn: two minutes at most. */
async function waitLock() {
  const until = Date.now() + 120_000;
  for (;;) {
    if (takeLock()) return true;
    if (Date.now() > until) return false;
    await new Promise((res) => setTimeout(res, 250));
  }
}

/** Several writes, all or none: a reader never sees a half of them. */
function atomic(db, work) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const out = work();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // nothing was open any more
    }
    throw e;
  }
}

/**
 * @returns {Promise<{ok: boolean, errors: object[], warnings: object[], fiches?: number, vectors?: object, skipped?: boolean, busy?: boolean, owed?: boolean}>}
 */
// `vectors: false` rebuilds the text only: what a question waits for. The
// vectors owed (notes whose text changed, catalogue entries waiting) are
// noted in the index and computed by the next build with vectors, which the
// one that answered starts right after, in a program of its own (engine.mjs,
// refreshVectors). Without it, a question asked after an edit waited for the
// embeddings API: 25 seconds measured on 2026-11-05.
// `full`: every note is written again, whatever the index holds.
// `maxAge`: see vaultStamp.
// `ok: false` with `errors`: notes that are not valid were left out, the
// others are indexed. `busy`: another program is building, nothing was done.
export async function buildIndex({ quiet = false, ifStale = false, vectors: withVectors = true, full = false, maxAge = 0 } = {}) {
  const say = quiet ? () => {} : (l) => console.log(l);
  loadEnv();
  const cfg = config();
  const db = openDb();
  let locked = false;
  try {
    if (ifStale && !isStale(db, { text: !withVectors, maxAge })) {
      // Nothing moved since a build that left notes out: they are still out,
      // and nothing is read again to say so (2026-11-21: one invalid note had
      // every question read and check the whole vault again, a second each).
      const errors = leftOut(db);
      return { ok: !errors.length, skipped: true, errors, warnings: [], owed: vectorsOwed(db) };
    }
    // A question never waits for another program's build: it reads the index
    // as it is. A build asked for by name waits its turn.
    locked = ifStale ? takeLock() : await waitLock();
    if (!locked) {
      say("\n  another program is building the index: left to it");
      return { ok: true, skipped: true, busy: true, errors: [], warnings: [], owed: false };
    }
    // The look is taken BEFORE the notes are read: a note written while this
    // build runs makes the next look differ, and the next build takes it.
    const startedAt = new Date().toISOString();
    const stamp = vaultStamp();
    const { fiches: read, errors: parseErrors } = readVault();
    const { errors, warnings } = validate(read, cfg);
    const allErrors = [...parseErrors, ...errors];
    // A NOTE THAT IS NOT VALID IS LEFT OUT, THE OTHERS ARE INDEXED (2026-11-21).
    // One note written in the wrong folder or without a domain used to stop the
    // whole build: no new note could be found until someone repaired it (seen
    // twice in a real hub's log). What the index knew of such a note stays, a
    // version late; a note it never knew is simply not in it yet.
    const badRels = new Set(allErrors.map((e) => e.rel));
    const fiches = read.filter((f) => !badRels.has(f.rel));
    const validSlugs = new Set(fiches.map((f) => f.slug));
    const badSlugs = new Set([...badRels].map((rel) => basename(String(rel), ".md")).filter((s) => !validSlugs.has(s)));
    if (allErrors.length) {
      say(`\n${allErrors.length} error(s): what follows is left out of the index (the other notes are indexed):`);
      for (const e of allErrors) say(`  ${e.rel}: ${e.msg}`);
    }

    // THE NOTES, THEIR LINKS AND THE FULL TEXT: only what changed. A note whose
    // hash and place are those the index keeps is not touched.
    const fullMode = full || meta(db, "schema") !== schemaKey(cfg);
    // EVERY NOTE IS SEARCHED, PRIVATE ONES TOO (2026-11-21, the person's
    // decision): the brain is there to be read by their AI, and a private
    // note found by its title alone, without a vector, was a note the AI could
    // not use. `visibility` now says only what may leave this computer (the
    // cloud copy, a brain served to others), which is decided where it leaves.
    const wanted = new Map(fiches.map((f) => [f.slug, f]));
    const text = { written: 0, removed: 0, kept: 0 };
    let vecMoved = false;
    atomic(db, () => {
      const known = new Map(db.prepare("SELECT rowid AS id, slug, rel, hash FROM fiche").all().map((r) => [r.slug, r]));
      // The facets (nature, data) in their own table: an index built before
      // them keeps working, the table is simply added.
      const insX = db.prepare("INSERT INTO facet (slug, nature, data) VALUES (?, ?, ?)");
      const insF = db.prepare("INSERT INTO fiche (slug, rel, type, title, domains, status, visibility, created, updated, source, body, hash) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
      const insL = db.prepare("INSERT INTO link (src, dst) VALUES (?, ?)");
      // The full text's row carries the number of the note's row: its slug is
      // not indexed there, and removing by slug would read the whole table.
      const insT = db.prepare("INSERT INTO fts (rowid, slug, title, body) VALUES (?, ?, ?, ?)");
      const delT = db.prepare("DELETE FROM fts WHERE rowid = ?");
      const delF = db.prepare("DELETE FROM fiche WHERE slug = ?");
      const delL = db.prepare("DELETE FROM link WHERE src = ?");
      const delX = db.prepare("DELETE FROM facet WHERE slug = ?");
      const delV = db.prepare("DELETE FROM vec WHERE slug = ?");
      // An index of another version numbered its full text otherwise: emptied whole.
      if (fullMode) db.exec("DELETE FROM fts");
      const drop = (old) => {
        if (!fullMode) delT.run(old.id);
        delF.run(old.slug);
        delL.run(old.slug);
        delX.run(old.slug);
      };
      for (const f of fiches) {
        const old = known.get(f.slug);
        if (old && !fullMode && old.hash === f.hash && old.rel === f.rel) {
          text.kept++;
          continue;
        }
        if (old) drop(old);
        const domains = Array.isArray(f.fm.domains) ? f.fm.domains : [f.fm.domains];
        const { lastInsertRowid } = insF.run(f.slug, f.rel, f.fm.type, f.fm.title, JSON.stringify(domains), f.fm.status, f.fm.visibility,
          String(f.fm.created), String(f.fm.updated), String(f.fm.source ?? ""), f.body, f.hash);
        for (const l of f.links) insL.run(f.slug, l);
        const data = Array.isArray(f.fm.data) ? f.fm.data : f.fm.data ? [f.fm.data] : [];
        if (f.fm.nature || data.length) insX.run(f.slug, f.fm.nature ? String(f.fm.nature) : null, JSON.stringify(data.map(String)));
        insT.run(lastInsertRowid, f.slug, unligature(f.fm.title), unligature(f.body));
        text.written++;
      }
      const again = db.prepare("SELECT rowid AS id, slug, title, body FROM fiche WHERE slug = ?");
      for (const old of known.values()) {
        if (validSlugs.has(old.slug)) continue;
        if (badSlugs.has(old.slug)) {
          // Not valid any more: what the index knew of it stays as it was.
          if (fullMode) {
            const r = again.get(old.slug);
            insT.run(r.id, r.slug, unligature(r.title), unligature(r.body));
          }
          continue;
        }
        drop(old);
        text.removed++;
      }
      // Notes gone: their vector leaves WITH them, in the
      // same transaction. Removed later, after the wait for the API, it left
      // a vector without its note, on which a search by meaning read at that
      // moment broke (2026-11-21).
      for (const r of db.prepare("SELECT slug FROM vec").all()) {
        if (wanted.has(r.slug) || badSlugs.has(r.slug)) continue;
        delV.run(r.slug);
        vecMoved = true;
      }
    });

    // The vectors: the index first, then the file in git, then the API.
    const vectors = { reused: 0, fromGit: 0, computed: 0, missing: 0, removed: 0 };
    const known = new Map(db.prepare("SELECT slug, hash FROM vec").all().map((r) => [r.slug, r.hash]));
    const upsert = db.prepare("INSERT INTO vec (slug, hash, dims, vec) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET hash = excluded.hash, dims = excluded.dims, vec = excluded.vec");
    const toCompute = [];
    // The vector files in git are the runner's: another computer reads them as a
    // cache, keeps what it computes in its own index, and never writes them.
    const writeGit = isRunner(cfg);
    if (writeGit) mkdirSync(EMB_DIR, { recursive: true });
    // A vector's file that cannot be written (held by an antivirus for an
    // instant) is a warning, never the end of the build: the next one writes it.
    let unwritten = 0;
    const writeFile = (slug, h, dims, blob) => {
      try {
        writeFileSync(join(EMB_DIR, `${slug}.json`), `${JSON.stringify({ hash: h, model: cfg.embeddings.model, dims, vec: Buffer.from(blob).toString("base64") })}\n`);
      } catch {
        unwritten++;
      }
    };
    const fromGit = [];
    for (const [slug, f] of wanted) {
      const h = embHash(f, cfg);
      // Reading 1,700 small files costs seconds on Windows: a vector already in
      // the index needs its file only to repair a lost one, which a build with
      // vectors does (the evening, or the one started after a question).
      const inIndex = known.get(slug) === h;
      const file = inIndex && !withVectors ? null : readVectorFile(slug);
      if (inIndex) {
        // In the index already. Its file in git, if lost, is written back from it.
        if (writeGit && withVectors && file?.hash !== h) {
          const row = db.prepare("SELECT dims, vec FROM vec WHERE slug = ?").get(slug);
          writeFile(slug, h, row.dims, row.vec);
        }
        vectors.reused++;
        continue;
      }
      // Same text, vector already paid for: the file in git wins.
      if (file?.hash === h && file.vec) fromGit.push({ slug, h, file });
      else toCompute.push({ slug, f, h });
    }
    if (fromGit.length) {
      atomic(db, () => {
        for (const x of fromGit) upsert.run(x.slug, x.h, x.file.dims, fromB64(x.file.vec));
      });
      vectors.fromGit = fromGit.length;
      vecMoved = true;
    }
    if (toCompute.length && embeddingsAvailable() && withVectors) {
      // Each batch is kept as it comes back: a batch refused later no longer
      // throws away the vectors already paid for in this call.
      let done = 0;
      try {
        await embed(toCompute.map((x) => embText(x.f)), cfg, {
          onBatch: (start, batch) => {
            atomic(db, () => {
              batch.forEach((v, j) => upsert.run(toCompute[start + j].slug, toCompute[start + j].h, cfg.embeddings.dims, toBlob(v)));
            });
            if (writeGit) batch.forEach((v, j) => writeFile(toCompute[start + j].slug, toCompute[start + j].h, cfg.embeddings.dims, toBlob(v)));
            done = start + batch.length;
            vecMoved = true;
            keepLock();
          },
        });
      } catch (e) {
        warnings.push({ rel: "index", msg: `vectors not computed (${String(e.message).slice(0, 160)}): search by meaning will miss ${toCompute.length - done} note(s) until the next build` });
      }
      vectors.computed = done;
      vectors.missing = toCompute.length - done;
    } else vectors.missing = toCompute.length;
    // Notes gone: their vector's file in git goes too.
    for (const name of writeGit && existsSync(EMB_DIR) ? readdirSync(EMB_DIR) : []) {
      if (name.endsWith(".json") && !wanted.has(name.slice(0, -5)) && !badSlugs.has(name.slice(0, -5))) {
        try {
          unlinkSync(join(EMB_DIR, name));
          vectors.removed++;
        } catch {
          unwritten++;
        }
      }
    }
    if (unwritten) warnings.push({ rel: "index", msg: `${unwritten} vector file(s) could not be written or removed (in use by another program): the next build does it` });

    // THE CATALOGUE (catalogue.mjs): first the vectors waiting for their full
    // text, which leaves the computer as soon as they are paid for; then the
    // entries and their vectors, rebuilt whole when the catalogue moved.
    const cat = { entries: 0, vectors: 0, computed: 0, skipped: false };
    const pending = readPending();
    if (pending.length && embeddingsAvailable() && withVectors) {
      const done = new Set();
      try {
        await embed(pending.map((p) => p.text), cfg, {
          onBatch: (start, batch) => {
            batch.forEach((v, j) => {
              const p = pending[start + j];
              writeVector(p.address, p.hash, cfg, v);
              done.add(`${p.address}|${p.hash}`);
            });
            keepLock();
          },
        });
      } catch (e) {
        warnings.push({ rel: "catalogue", msg: `catalogue vectors not computed (${String(e.message).slice(0, 160)}): they will be at the next build` });
      }
      cat.computed = done.size;
      // What is still waiting stays: the texts no batch brought back, and those
      // a source added while the API was answering.
      if (done.size) setPending(readPending().filter((p) => !done.has(`${p.address}|${p.hash}`)));
    }
    // THE CATALOGUE IS SKIPPED WHEN IT DID NOT MOVE (2026-11-21): its entries
    // and their 15 MB of vectors were written again at every note edited.
    const catPrint = catalogueFingerprint();
    const catStamp = catalogueStamp();
    const catMoved = fullMode || meta(db, "catalogue") !== catPrint || cat.computed > 0;
    if (!catMoved) {
      cat.skipped = true;
      cat.entries = db.prepare("SELECT COUNT(*) n FROM entry").get().n;
      cat.vectors = db.prepare("SELECT COUNT(*) n FROM entry_vec").get().n;
    } else {
      const entries = readCatalogue();
      // THE CATALOGUE'S VECTORS ALREADY IN THE INDEX are kept when their entry
      // did not change: only a new or changed entry has its file read. Reading
      // the 7,300 files every time took 20 seconds, at every edit of a note.
      const kept = new Map();
      try {
        for (const r of db.prepare("SELECT v.address, v.dims, v.vec, h.hash FROM entry_vec v JOIN entry_vec_hash h ON h.address = v.address").all()) kept.set(r.address, r);
      } catch {
        // an index built before: every file is read once
      }
      // The files are read before the transaction opens, to keep it short.
      const vecs = new Map();
      for (const e of entries) {
        const old = kept.get(e.address);
        if (old && old.hash === e.hash) vecs.set(e.address, { dims: old.dims, vec: old.vec });
        else {
          const v = readVector(e.address);
          if (v && v.hash === e.hash && v.vec) vecs.set(e.address, { dims: v.dims, vec: fromB64(v.vec) });
        }
      }
      atomic(db, () => {
        db.exec("DELETE FROM entry; DELETE FROM entry_fts; DELETE FROM entry_vec; DELETE FROM entry_vec_hash;");
        const insEH = db.prepare("INSERT OR REPLACE INTO entry_vec_hash (address, hash) VALUES (?, ?)");
        const insE = db.prepare("INSERT OR REPLACE INTO entry (address, tool, title, date, url, domains, excerpt, source) VALUES (?,?,?,?,?,?,?,?)");
        const insEF = db.prepare("INSERT INTO entry_fts (address, title, excerpt) VALUES (?, ?, ?)");
        const insEV = db.prepare("INSERT OR REPLACE INTO entry_vec (address, dims, vec) VALUES (?, ?, ?)");
        for (const e of entries) {
          insE.run(e.address, e.tool ?? "", e.title ?? "", e.date ?? "", e.url ?? "", JSON.stringify(e.domains ?? []), e.excerpt ?? "", e.source ?? "");
          insEF.run(e.address, unligature(e.title ?? ""), unligature(e.excerpt ?? ""));
          const v = vecs.get(e.address);
          if (!v) continue;
          insEV.run(e.address, v.dims, v.vec);
          insEH.run(e.address, e.hash);
          cat.vectors++;
        }
      });
      cat.entries = entries.length;
      // THE VECTORS OF ENTRIES THAT LEFT THE CATALOGUE were never removed from
      // git (7,739 files for 7,542 entries on a real brain, 2026-11-21). Only
      // the runner removes them, in a build with vectors, and never more than a
      // tenth of the files at once: a catalogue read wrongly for an instant
      // must not cost the vectors already paid for.
      if (writeGit && withVectors && entries.length && existsSync(CATALOGUE_VEC_DIR)) {
        const wantedKeys = new Set(entries.map((e) => `${addressKey(e.address)}.json`));
        const files = readdirSync(CATALOGUE_VEC_DIR).filter((n) => n.endsWith(".json"));
        const orphans = files.filter((n) => !wantedKeys.has(n));
        if (orphans.length && orphans.length <= Math.max(20, Math.floor(files.length / 10))) {
          for (const n of orphans) {
            try {
              unlinkSync(join(CATALOGUE_VEC_DIR, n));
              cat.removed = (cat.removed ?? 0) + 1;
            } catch {
              // in use: the next build removes it
            }
          }
        }
      }
    }

    // How much each note counts (weights.mjs): connections, criticality, recent
    // use. Computed by every build with vectors (the evening's, the hub's, the
    // one that follows a question) and, for a build of the text alone, when the
    // weights are more than an hour old: they read every journal and every
    // vector, which a question does not have to wait for each time.
    const changed = text.written > 0 || text.removed > 0 || vecMoved || !cat.skipped;
    const weighedAt = Date.parse(meta(db, "weights_at") ?? "") || 0;
    let weighed = false;
    if (withVectors || fullMode || Date.now() - weighedAt > 3600_000) {
      try {
        // The dated notes (an intervention, a publication) date the activity around a note.
        const dates = new Map(fiches.map((f) => [f.slug, String(f.fm.event_date ?? f.fm.date_evenement ?? f.fm.date ?? "").slice(0, 10)]).filter(([, d]) => /^\d{4}/.test(d)));
        computeWeights(db, cfg, { dates });
        weighed = true;
      } catch (e) {
        warnings.push({ rel: "index", msg: `weights not computed (${String(e.message).slice(0, 160)})` });
      }
    }
    // Owed: what this build left for later on purpose. A build with vectors
    // that could not reach the API owes nothing: its warning says so, the
    // evening retries.
    const owed = !withVectors && embeddingsAvailable() && (toCompute.length > 0 || pending.length > 0);
    atomic(db, () => {
      setMeta(db, "schema", schemaKey(cfg));
      setMeta(db, "vault", stamp);
      setMeta(db, "catalogue", catPrint);
      setMeta(db, "catalogue_stamp", catStamp);
      setMeta(db, "errors", JSON.stringify(allErrors.slice(0, 50).map((e) => ({ rel: e.rel, msg: String(e.msg).slice(0, 300) }))));
      // `built`: the moment the notes were read. A note changed since then is
      // ahead of the index (engine.mjs, getNow).
      setMeta(db, "built", startedAt);
      setMeta(db, "vectors_owed", owed ? "1" : "0");
      // What a program that stays up keeps in memory (the vectors, the
      // weights) is read again only when ITS part of the index moved.
      const rev = `${startedAt}.${process.pid}`;
      if (vecMoved || meta(db, "rev_vec") === undefined) setMeta(db, "rev_vec", rev);
      if (!cat.skipped || meta(db, "rev_cat") === undefined) setMeta(db, "rev_cat", rev);
      if (weighed) {
        setMeta(db, "rev_weight", rev);
        setMeta(db, "weights_at", startedAt);
      }
    });
    say(`\n  ${fiches.length} note(s) indexed, ${db.prepare("SELECT COUNT(*) n FROM link").get().n} link(s)`);
    if (cat.entries) say(`  catalogue: ${cat.entries} entr${cat.entries > 1 ? "ies" : "y"}, ${cat.vectors} with a vector${cat.computed ? ` (${cat.computed} computed)` : ""}`);
    say(`  vectors: ${vectors.reused + vectors.fromGit + vectors.computed} ready (${vectors.fromGit} taken from git, ${vectors.computed} computed)` +
      (vectors.missing ? `, ${vectors.missing} missing${embeddingsAvailable() ? "" : " (no embeddings key: search by meaning is off)"}` : ""));
    if (warnings.length) {
      say(`  ${warnings.length} warning(s):`);
      for (const w of warnings.slice(0, 15)) say(`    ${w.rel}: ${w.msg}`);
      if (warnings.length > 15) say(`    ... and ${warnings.length - 15} more (pnpm lint)`);
    }
    return { ok: !allErrors.length, errors: allErrors, warnings, fiches: fiches.length, vectors, catalogue: cat, owed, text, changed };
  } finally {
    if (locked) releaseLock();
    db.close();
  }
}

// Compared on real paths: through a symlinked folder (a linked ~/.claude,
// /tmp and /var on macOS) the two spellings differ and the build did nothing.
const real = (p) => {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
};
if (process.argv[1] && real(process.argv[1]) === real(fileURLToPath(import.meta.url))) {
  requireBrain();
  const args = process.argv.slice(2);
  const r = await buildIndex({ quiet: args.includes("--quiet"), ifStale: args.includes("--if-stale"), full: args.includes("--full") });
  process.exitCode = r.ok ? 0 : 1;
}
