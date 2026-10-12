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
//   node scripts/build.mjs              build (incremental for the vectors)
//   node scripts/build.mjs --if-stale   do nothing if the vault has not moved
//   node scripts/build.mjs --quiet

import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DB_PATH, EMB_DIR, INDEX, config, embText, isRunner, loadEnv, readVault, requireBrain, sha256, validate, vaultFingerprint } from "./lib.mjs";
import { embed, embeddingsAvailable } from "./embeddings.mjs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fiche (slug TEXT PRIMARY KEY, rel TEXT, type TEXT, title TEXT, domains TEXT, status TEXT,
  visibility TEXT, created TEXT, updated TEXT, source TEXT, body TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS link (src TEXT, dst TEXT);
CREATE INDEX IF NOT EXISTS link_dst ON link(dst);
CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(slug UNINDEXED, title, body, tokenize = 'unicode61 remove_diacritics 2');
CREATE TABLE IF NOT EXISTS vec (slug TEXT PRIMARY KEY, hash TEXT, dims INTEGER, vec BLOB);
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
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

export function isStale(db) {
  const fp = vaultFingerprint();
  return meta(db, "vault") !== `${fp.count}:${fp.latest}`;
}

/**
 * @returns {Promise<{ok: boolean, errors: object[], warnings: object[], fiches: number, vectors: object}>}
 */
export async function buildIndex({ quiet = false, ifStale = false } = {}) {
  const say = quiet ? () => {} : (l) => console.log(l);
  loadEnv();
  const cfg = config();
  const db = openDb();
  try {
    if (ifStale && !isStale(db)) return { ok: true, skipped: true, errors: [], warnings: [] };
    const fp = vaultFingerprint();
    const { fiches, errors: parseErrors } = readVault();
    const { errors, warnings } = validate(fiches, cfg);
    const allErrors = [...parseErrors, ...errors];
    if (allErrors.length) {
      say(`\n${allErrors.length} error(s), the index was NOT rebuilt:`);
      for (const e of allErrors) say(`  ${e.rel}: ${e.msg}`);
      return { ok: false, errors: allErrors, warnings, fiches: fiches.length };
    }

    // The notes, the links and the full text: rebuilt whole, it takes a second.
    db.exec("BEGIN");
    try {
      db.exec("DELETE FROM fiche; DELETE FROM link; DELETE FROM fts;");
      const insF = db.prepare("INSERT INTO fiche VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
      const insL = db.prepare("INSERT INTO link VALUES (?, ?)");
      const insT = db.prepare("INSERT INTO fts (slug, title, body) VALUES (?, ?, ?)");
      for (const f of fiches) {
        const domains = Array.isArray(f.fm.domains) ? f.fm.domains : [f.fm.domains];
        insF.run(f.slug, f.rel, f.fm.type, f.fm.title, JSON.stringify(domains), f.fm.status, f.fm.visibility,
          String(f.fm.created), String(f.fm.updated), String(f.fm.source ?? ""), f.body, f.hash);
        for (const l of f.links) insL.run(f.slug, l);
        // A private note is FOUND by its title, never by its content.
        insT.run(f.slug, f.fm.title, f.fm.visibility === "private" ? "" : f.body);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }

    // The vectors: the index first, then the file in git, then the API.
    const vectors = { reused: 0, fromGit: 0, computed: 0, missing: 0, removed: 0 };
    const wanted = new Map(fiches.filter((f) => f.fm.visibility !== "private").map((f) => [f.slug, f]));
    const known = new Map(db.prepare("SELECT slug, hash FROM vec").all().map((r) => [r.slug, r.hash]));
    const upsert = db.prepare("INSERT INTO vec VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET hash = excluded.hash, dims = excluded.dims, vec = excluded.vec");
    const toCompute = [];
    // The vector files in git are the runner's: another computer reads them as a
    // cache, keeps what it computes in its own index, and never writes them.
    const writeGit = isRunner(cfg);
    if (writeGit) mkdirSync(EMB_DIR, { recursive: true });
    for (const [slug, f] of wanted) {
      const h = embHash(f, cfg);
      const file = readVectorFile(slug);
      if (known.get(slug) === h) {
        // In the index already. Its file in git, if lost, is written back from it.
        if (writeGit && file?.hash !== h) {
          const row = db.prepare("SELECT dims, vec FROM vec WHERE slug = ?").get(slug);
          writeFileSync(join(EMB_DIR, `${slug}.json`), `${JSON.stringify({ hash: h, model: cfg.embeddings.model, dims: row.dims, vec: Buffer.from(row.vec).toString("base64") })}\n`);
        }
        vectors.reused++;
        continue;
      }
      if (file?.hash === h) {
        // Same text, vector already paid for: the file in git wins.
        upsert.run(slug, h, file.dims, fromB64(file.vec));
        vectors.fromGit++;
      } else toCompute.push({ slug, f, h });
    }
    if (toCompute.length && embeddingsAvailable()) {
      try {
        const out = await embed(toCompute.map((x) => embText(x.f)), cfg);
        toCompute.forEach((x, i) => {
          const blob = toBlob(out[i]);
          upsert.run(x.slug, x.h, cfg.embeddings.dims, blob);
          if (writeGit) writeFileSync(join(EMB_DIR, `${x.slug}.json`), `${JSON.stringify({ hash: x.h, model: cfg.embeddings.model, dims: cfg.embeddings.dims, vec: blob.toString("base64") })}\n`);
        });
        vectors.computed = toCompute.length;
      } catch (e) {
        vectors.missing = toCompute.length;
        warnings.push({ rel: "index", msg: `vectors not computed (${String(e.message).slice(0, 160)}): search by meaning will miss ${toCompute.length} note(s) until the next build` });
      }
    } else vectors.missing = toCompute.length;
    // Notes gone, or turned private: their vector goes too, from the index and from git.
    for (const slug of known.keys()) if (!wanted.has(slug)) db.prepare("DELETE FROM vec WHERE slug = ?").run(slug);
    for (const name of writeGit && existsSync(EMB_DIR) ? readdirSync(EMB_DIR) : []) {
      if (name.endsWith(".json") && !wanted.has(name.slice(0, -5))) {
        unlinkSync(join(EMB_DIR, name));
        vectors.removed++;
      }
    }

    setMeta(db, "vault", `${fp.count}:${fp.latest}`);
    setMeta(db, "built", new Date().toISOString());
    say(`\n  ${fiches.length} note(s) indexed, ${db.prepare("SELECT COUNT(*) n FROM link").get().n} link(s)`);
    say(`  vectors: ${vectors.reused + vectors.fromGit + vectors.computed} ready (${vectors.fromGit} taken from git, ${vectors.computed} computed)` +
      (vectors.missing ? `, ${vectors.missing} missing${embeddingsAvailable() ? "" : " (no embeddings key: search by meaning is off)"}` : ""));
    if (warnings.length) {
      say(`  ${warnings.length} warning(s):`);
      for (const w of warnings.slice(0, 15)) say(`    ${w.rel}: ${w.msg}`);
      if (warnings.length > 15) say(`    ... and ${warnings.length - 15} more (pnpm lint)`);
    }
    return { ok: true, errors: [], warnings, fiches: fiches.length, vectors };
  } finally {
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
  const r = await buildIndex({ quiet: args.includes("--quiet"), ifStale: args.includes("--if-stale") });
  process.exitCode = r.ok ? 0 : 1;
}
