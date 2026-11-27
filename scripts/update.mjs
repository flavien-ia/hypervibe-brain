#!/usr/bin/env node
// update.mjs - Brings this plugin up to the latest published version.
//
// The plugin is published on hypervibe.fr (2026-11-24, as the Hypervibe
// plugin): the site serves the zip of each version (hypervibe-brain-<version>.zip)
// and the SHA-256 of the current one, and the public repository carries the
// same zip as a release, the fallback when the site does not answer.
//
// WHAT IS INSTALLED IS WHAT THE AUTHOR SIGNED (2026-11-27). The fingerprint
// came from the same place as the zip: a site taken over served both. Each
// archive is now signed by the author, and nothing is installed unless that
// signature holds against the public key this plugin carries
// (update-verify.mjs). The signature travels next to the zip (the release
// file hypervibe-brain-<version>.zip.sig on the public repository, or the
// field `signature` of the site's manifest: either will do): the site and
// GitHub only carry files. On top of that:
//   - no archive without a matching fingerprint (it used to go on without one);
//   - no version that is not strictly above the installed one, unless the
//     person themselves asks with --force (the skill never offers it);
//   - a version number is three numbers (1.2.3) before it names any file;
//   - `install` checks the signature again by itself: a zip handed to it
//     directly is no more trusted than a download;
//   - an archive that unpacks to more than 50 MB or 5,000 files is refused.
// THE TRANSITION: a plugin installed before this version does not know
// signatures and reaches this one by the old path, the fingerprint alone.
// From this version on, every update is checked against the author's key.
//
// It is installed in one of three ways, read from
// Claude Code's own registry, never guessed:
//   - "marketplace": a marketplace that Claude Code follows on GitHub
//     (/plugin marketplace add flavien-ia/hypervibe-brain). Claude Code updates
//     it with its own commands; replacing files behind its back would put it at
//     odds with its registry. This script gives the commands.
//   - "upload": the zip uploaded in the Claude app (Customize > Plugins). Nobody
//     tells the person a new version came out: this script downloads it,
//     checks it, and swaps the folder. The previous one goes aside as a backup,
//     which only lasts in a marketplace folder (see plugin-place.mjs).
//   - "folder": a marketplace pointing at a folder of this computer (a clone,
//     a developer's copy). The folder is the person's own: nothing is written.
//
//   node scripts/update.mjs check
//   node scripts/update.mjs download
//   node scripts/update.mjs install --zip <file> [--sig <file>] [--sha256 <fingerprint>] [--force]
//   node scripts/update.mjs verify --zip <file> [--sig <file>]
//        is this archive signed by the author? Nothing is installed: for the
//        release that has just signed one, and for a zip fetched by hand
//
// One JSON object on stdout. Exit codes: 0 done, 1 error, 2 network unreachable.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { pluginPlace } from "./plugin-place.mjs";
import { armour, releaseKeyFor, verifyRelease } from "./update-verify.mjs";

const REPO = "flavien-ia/hypervibe-brain";
// Where the versions are read and fetched from. A bench points both elsewhere:
// since the signature, they are only the roads the files travel on.
const API = (process.env.HVBRAIN_UPDATE_API || "https://api.github.com").replace(/\/+$/, "");
const LATEST = `${API}/repos/${REPO}/releases/latest`;
const BY_TAG = (version) => `${API}/repos/${REPO}/releases/tags/v${version}`;
// The site that serves the plugin (2026-11-24).
const SITE = (process.env.HVBRAIN_UPDATE_SITE || "https://hypervibe.fr").replace(/\/+$/, "");
const SITE_CURRENT = `${SITE}/api/brain/current`;
const SITE_DOWNLOAD = `${SITE}/api/brain/download-public`;
const NAME = "brain";
const WORK = join(process.env.HVBRAIN_HOME ?? homedir(), ".hypervibe-brain", "updates");
const PLUGINS = join(homedir(), ".claude", "plugins");
// A version is three numbers. Checked before it is compared, shown, or used in the name of a file.
const VERSION = /^\d+\.\d+\.\d+$/;
// What an archive of this plugin may unpack to: it weighs a few megabytes.
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FILES = 5000;
const SELF = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

const args = process.argv.slice(2);
const command = args[0];
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

// Never process.exit() right after a fetch: on Windows it can abort Node with
// an assertion instead of the real exit code.
const out = (o, code = 0) => {
  process.stdout.write(`${JSON.stringify(o, null, 2)}\n`);
  process.exitCode = code;
};
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();

function newer(a, b) {
  const x = String(a).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const y = String(b).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

// This file lives in scripts/: the plugin is one level up.
const pluginDir = () => resolve(opt("--plugin-dir") ?? SELF);

/**
 * The key an archive must be signed with: the author's, but for the plugin's
 * own test bench, under the conditions update-verify.mjs gives (releaseKeyFor).
 * @param {string[]} targets the folders about to be written in
 */
const releaseKey = (targets = []) => releaseKeyFor({ override: process.env.HVBRAIN_UPDATE_PUBKEY, home: process.env.HVBRAIN_HOME, tmp: tmpdir(), targets, self: SELF });

/** How this copy of the plugin was installed, from Claude Code's registry. */
function installMode(dir) {
  let market = null;
  try {
    const installed = readJson(join(PLUGINS, "installed_plugins.json")).plugins ?? {};
    for (const [key, entries] of Object.entries(installed)) {
      if (!key.startsWith(`${NAME}@`)) continue;
      if ([].concat(entries).some((e) => e?.installPath && same(e.installPath, dir))) market = key.slice(NAME.length + 1);
    }
  } catch {
    market = null;
  }
  let source = null;
  try {
    source = market ? readJson(join(PLUGINS, "known_marketplaces.json"))[market]?.source ?? null : null;
  } catch {
    source = null;
  }
  const commands = market ? [`claude plugin marketplace update ${market}`, `claude plugin update ${NAME}@${market}`] : [];
  if (source?.source === "github" || source?.source === "git") return { mode: "marketplace", marketplace: market, commands };
  if (market === "local-desktop-app-uploads") return { mode: "upload", marketplace: market, commands: [] };
  if (source?.source === "directory") return { mode: "folder", marketplace: market, folder: source.path, commands };
  // Not in the registry: the only case where swapping files would help is the
  // uploaded one, and it is recognised by its place: the folder of uploads, or
  // the registry of Claude Desktop, which Claude Code's registry does not list.
  const uploaded = same(dirname(dir), join(PLUGINS, "marketplaces", "local-desktop-app-uploads")) || pluginPlace(dir, NAME).desktop;
  return { mode: uploaded ? "upload" : "unknown", marketplace: market, commands: [] };
}

/**
 * The latest published version: its number, where to download its zip, the
 * fingerprint of that zip, and its signature when the manifest carries it.
 * FROM THE SITE FIRST (2026-11-24), as the Hypervibe plugin does: hypervibe.fr
 * keeps the zip of each version and a manifest of the current one
 * ({ version, sha256, signature, size, date, notes }), and serves the zip
 * itself. The public repository's releases are the fallback, for a site that
 * does not answer: the same zip, with GitHub's own digest and the signature
 * as a file of the release.
 */
async function latest() {
  try {
    const r = await fetch(SITE_CURRENT, { headers: { "User-Agent": "hypervibe-brain-update", Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (r.ok) {
      const m = await r.json();
      if (VERSION.test(String(m?.version ?? "")) && /^[a-f0-9]{64}$/.test(String(m?.sha256 ?? ""))) {
        return { version: m.version, url: `${SITE_DOWNLOAD}?version=${m.version}`, sha256: m.sha256, signature: typeof m.signature === "string" && m.signature ? m.signature : null, sigUrl: null, notes: m.notes ?? `https://github.com/${REPO}/releases/tag/v${m.version}`, from: "site" };
      }
    }
  } catch {
    // the site is out of reach: the repository's releases say the same
  }
  return latestFromGitHub();
}

/** A release of the public repository: its zip, GitHub's own fingerprint of it, and its signature file. */
function readRelease(rel) {
  const version = String(rel?.tag_name ?? "").replace(/^v/, "");
  const zipName = `hypervibe-brain-${version}.zip`;
  const asset = (rel?.assets ?? []).find((a) => a.name === zipName);
  const sig = (rel?.assets ?? []).find((a) => a.name === `${zipName}.sig`);
  // GitHub computes the digest of every release file itself; the release notes
  // carry it too, for the person who wants to check by hand.
  const fromNotes = /\b[a-f0-9]{64}\b/.exec(String(rel?.body ?? ""))?.[0] ?? null;
  const digest = String(asset?.digest ?? "").replace(/^sha256:/, "") || fromNotes;
  return { version, url: asset?.browser_download_url ?? null, sha256: digest || null, signature: null, sigUrl: sig?.browser_download_url ?? null, notes: rel?.html_url ?? null, from: "github" };
}
async function release(url) {
  const r = await fetch(url, { headers: { "User-Agent": "hypervibe-brain-update", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw Object.assign(new Error(`the public repository answered ${r.status}`), { http: r.status });
  return readRelease(await r.json());
}
const latestFromGitHub = () => release(LATEST);

/**
 * The signature of a published version, from wherever it is: the site's
 * manifest, the release it was read from, or the release of the same number
 * on the public repository. Null when there is none to be found.
 */
async function signatureOf(pub) {
  if (pub.signature) return pub.signature;
  let url = pub.sigUrl;
  if (!url) {
    try {
      url = (await release(BY_TAG(pub.version))).sigUrl;
    } catch {
      url = null;
    }
  }
  if (!url) return null;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "hypervibe-brain-update" }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const text = await r.text();
    return text.length < 10_000 ? text : null;
  } catch {
    return null;
  }
}

// --- Reading a zip, without any dependency ----------------------------------
function entries(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("unreadable archive (no end of directory)");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  if (p === 0xffffffff) throw new Error("zip64 archive, not handled");
  // AN ARCHIVE CANNOT FILL THE DISK (2026-11-27): no more files and no more
  // bytes than a plugin can be, by what it declares, then by what really
  // comes out (a few kilobytes of zeros unpack to gigabytes).
  if (count > MAX_FILES) throw new Error(`too many files in the archive (${count}, ${MAX_FILES} at most)`);
  const list = [];
  let declared = 0;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt archive directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    declared += buf.readUInt32LE(p + 24);
    const lName = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComment = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    list.push({ name: buf.toString("utf8", p + 46, p + 46 + lName), method, size, offset });
    p += 46 + lName + lExtra + lComment;
  }
  const tooLarge = () => new Error(`the archive unpacks to more than ${MAX_BYTES / 1024 / 1024} MB`);
  if (declared > MAX_BYTES) throw tooLarge();
  let left = MAX_BYTES;
  return list
    .filter((e) => !e.name.endsWith("/"))
    .map((e) => {
      if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error(`unreadable entry: ${e.name}`);
      const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
      const raw = buf.subarray(start, start + e.size);
      let data;
      if (e.method === 0) data = raw;
      else if (e.method === 8) {
        try {
          data = inflateRawSync(raw, { maxOutputLength: left + 1 });
        } catch (err) {
          throw err?.code === "ERR_BUFFER_TOO_LARGE" ? tooLarge() : err;
        }
      } else throw new Error(`compression ${e.method} not handled: ${e.name}`);
      left -= data.length;
      if (left < 0) throw tooLarge();
      return { name: e.name, data };
    });
}

function extract(list, dest) {
  for (const e of list) {
    // An archive must never write outside its destination.
    if (e.name.split(/[\\/]/).includes("..") || isAbsolute(e.name) || /^[A-Za-z]:/.test(e.name) || e.name.includes("\u0000")) throw new Error(`path refused in the archive: ${e.name}`);
    const target = join(dest, e.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data);
  }
}

/** The plugin an archive holds: its name and its version, a version being three numbers and nothing else. */
function manifestOf(list) {
  const m = list.find((e) => e.name === ".claude-plugin/plugin.json");
  if (!m) throw new Error("no plugin manifest");
  const j = JSON.parse(m.data.toString("utf8"));
  if (j.name !== NAME) throw new Error(`this is the plugin "${String(j.name).slice(0, 60)}", not "${NAME}"`);
  if (!VERSION.test(String(j.version ?? ""))) throw new Error("its version is not a version number (1.2.3)");
  return { name: j.name, version: j.version };
}

// --- Commands ----------------------------------------------------------------
async function check() {
  const dir = pluginDir();
  const manifest = join(dir, ".claude-plugin", "plugin.json");
  if (!existsSync(manifest)) return out({ ok: false, reason: "not-found", pluginDir: dir, message: `No plugin in ${dir}.` }, 1);
  const local = readJson(manifest).version;
  const mode = installMode(dir);
  let pub;
  try {
    pub = await latest();
  } catch (e) {
    return out({ ok: false, offline: !e.http, ...mode, pluginDir: dir, localVersion: local, message: `Cannot read the published version: ${e.message}` }, e.http ? 1 : 2);
  }
  if (!VERSION.test(pub.version)) return out({ ok: false, ...mode, pluginDir: dir, localVersion: local, message: "The published version does not carry a version number: nothing to compare with." }, 1);
  out({ ok: true, ...mode, pluginDir: dir, localVersion: local, publishedVersion: pub.version, updateAvailable: newer(pub.version, local), releaseNotes: pub.notes });
}

async function download() {
  let pub;
  try {
    pub = await latest();
  } catch (e) {
    return out({ ok: false, offline: !e.http, message: `Cannot read the published version: ${e.message}` }, e.http ? 1 : 2);
  }
  if (!VERSION.test(pub.version)) return out({ ok: false, reason: "bad-version", message: "The published version does not carry a version number. Nothing was downloaded." }, 1);
  if (!pub.url) return out({ ok: false, message: `The release ${pub.version} carries no plugin archive.` }, 1);
  let buf;
  try {
    const r = await fetch(pub.url, { headers: { "User-Agent": "hypervibe-brain-update" }, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return out({ ok: false, message: `The download answered ${r.status}.` }, 1);
    if (Number(r.headers.get("content-length")) > MAX_BYTES) return out({ ok: false, reason: "too-large", message: "The archive is far larger than this plugin can be. Nothing was installed." }, 1);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return out({ ok: false, offline: true, message: `Download unreachable: ${e.message}` }, 2);
  }
  if (buf.length > MAX_BYTES) return out({ ok: false, reason: "too-large", message: "The archive is far larger than this plugin can be. Nothing was installed." }, 1);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  // The fingerprint: that the download is whole. No fingerprint is a refusal
  // too (2026-11-27): it used to go on without one.
  if (!pub.sha256) return out({ ok: false, reason: "sha256-missing", message: "The published version carries no fingerprint to check the download against. Nothing was installed." }, 1);
  if (pub.sha256 !== sha256) {
    return out({ ok: false, reason: "sha256-mismatch", expected: pub.sha256, got: sha256, message: "The downloaded archive does not match the published fingerprint. Nothing was installed." }, 1);
  }
  // The signature: that the file is the author's. The fingerprint came from
  // the same place as the file; the key to check this against did not.
  const signature = await signatureOf(pub);
  if (!signature) return out({ ok: false, reason: "signature-missing", version: pub.version, message: "This version carries no signature of the author. Nothing was installed: tell the author, and do not install it by another way." }, 1);
  const expected = releaseKey([WORK]);
  const signed = verifyRelease(buf, signature, { publicKey: expected.key });
  if (!signed.ok) return out({ ok: false, reason: "signature-invalid", version: pub.version, why: signed.reason, message: "The downloaded archive is not signed by the author of this plugin. Nothing was installed: tell the author, and do not install it by another way." }, 1);
  let version;
  try {
    version = manifestOf(entries(buf)).version;
  } catch (e) {
    return out({ ok: false, message: `Unusable archive: ${e.message}` }, 1);
  }
  // The archive is the author's, but is it the version announced? An older
  // one, signed in its time, must not pass for the new one.
  if (version !== pub.version) return out({ ok: false, reason: "version-mismatch", announced: pub.version, got: version, message: "The archive is not the version that was announced. Nothing was installed." }, 1);
  mkdirSync(WORK, { recursive: true });
  const file = join(WORK, `hypervibe-brain-${version}.zip`);
  writeFileSync(file, buf);
  // The signature next to it: `install` checks it again by itself.
  writeFileSync(`${file}.sig`, armour(signature), "utf8");
  out({ ok: true, file, signature: `${file}.sig`, version, sizeBytes: buf.length, sha256, sha256Verified: true, signatureVerified: true, from: pub.from, ...(expected.test ? { testKey: true } : {}) });
}

/** Is this archive signed by the author? Reads two files, writes nothing. */
function verifyOnly() {
  const zip = opt("--zip");
  if (!zip || !existsSync(zip)) return out({ ok: false, message: "No archive: pass --zip <file>." }, 1);
  const sigFile = opt("--sig") ?? `${zip}.sig`;
  const buf = readFileSync(zip);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  if (!existsSync(sigFile)) return out({ ok: false, reason: "signature-missing", sha256, message: `No signature for this archive (${sigFile} is not there).` }, 1);
  // The author's key, always: this command takes no word to the contrary.
  const signed = verifyRelease(buf, readFileSync(sigFile, "utf8"));
  if (!signed.ok) return out({ ok: false, reason: "signature-invalid", why: signed.reason, sha256, message: "This archive is not signed by the author of this plugin." }, 1);
  let version = null;
  try {
    version = manifestOf(entries(buf)).version;
  } catch (e) {
    return out({ ok: false, reason: "not-a-plugin", sha256, message: `Signed by the author, but not an archive of this plugin: ${e.message}` }, 1);
  }
  out({ ok: true, signedByAuthor: true, version, sha256, sizeBytes: buf.length });
}

function install() {
  const zip = opt("--zip");
  if (!zip || !existsSync(zip)) return out({ ok: false, message: "No archive: pass --zip <file>." }, 1);
  const dir = pluginDir();
  const mode = installMode(dir);
  const force = args.includes("--force");
  if (mode.mode !== "upload" && !force) {
    return out({ ok: false, reason: `managed-${mode.mode}`, ...mode, message: "This copy of the plugin is not an uploaded one: its own update path applies (see commands)." }, 1);
  }
  // THE ARCHIVE IS CHECKED AGAIN HERE (2026-11-27), whatever `download` said:
  // this command takes any file, and a file can change between two commands.
  const buf = readFileSync(zip);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const wanted = opt("--sha256");
  if (wanted && String(wanted).toLowerCase() !== sha256) {
    return out({ ok: false, reason: "sha256-mismatch", expected: wanted, got: sha256, message: "This archive is not the one that was downloaded and checked. Nothing was replaced." }, 1);
  }
  const sigFile = opt("--sig") ?? `${zip}.sig`;
  if (!existsSync(sigFile)) {
    return out({ ok: false, reason: "signature-missing", message: `No signature for this archive (${sigFile} is not there). Nothing was replaced: an update is only installed with the author's signature, which \`update.mjs download\` fetches with the archive.` }, 1);
  }
  const expected = releaseKey([dir]);
  const signed = verifyRelease(buf, readFileSync(sigFile, "utf8"), { publicKey: expected.key });
  if (!signed.ok) return out({ ok: false, reason: "signature-invalid", why: signed.reason, message: "This archive is not signed by the author of this plugin. Nothing was replaced." }, 1);

  let old = "unknown";
  try {
    const v = readJson(join(dir, ".claude-plugin", "plugin.json")).version;
    if (VERSION.test(String(v ?? ""))) old = v;
  } catch {
    old = "unknown";
  }
  // Unpack and check BEFORE touching the plugin in place: until the new
  // version is proven whole, the installed one does not move.
  const tmp = join(WORK, `unpack-${process.pid}`);
  let version;
  try {
    const list = entries(buf);
    version = manifestOf(list).version;
    // Never backwards, never sideways: an older version signed in its time
    // (with a flaw since corrected) is not an update. --force is the
    // person's own word, never the skill's.
    if (old !== "unknown" && !newer(version, old) && !force) {
      return out({ ok: false, reason: "not-newer", installed: old, offered: version, message: `The archive holds version ${version}, which is not above the installed one (${old}). Nothing was replaced.` }, 1);
    }
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(tmp, { recursive: true });
    extract(list, tmp);
    for (const need of ["skills", "scripts", "templates"]) {
      if (!existsSync(join(tmp, need)) || !readdirSync(join(tmp, need)).length) throw new Error(`folder ${need} missing or empty`);
    }
    if (!existsSync(join(tmp, "scripts", "update.mjs"))) throw new Error("the new version cannot update itself (scripts/update.mjs missing)");
  } catch (e) {
    rmSync(tmp, { recursive: true, force: true });
    return out({ ok: false, message: `Incomplete new version, nothing was replaced: ${e.message}` }, 1);
  }
  const backup = `${dir}-backup-${old}`;
  rmSync(backup, { recursive: true, force: true });
  try {
    renameSync(dir, backup);
    renameSync(tmp, dir);
  } catch (e) {
    // A failed swap: the previous version goes back rather than leaving a hole.
    if (!existsSync(dir) && existsSync(backup)) renameSync(backup, dir);
    rmSync(tmp, { recursive: true, force: true });
    return out({ ok: false, message: `Could not replace the plugin, previous version restored: ${e.message}` }, 1);
  }
  // The local catalogue of uploaded plugins: by NAME, never by position.
  let catalogue = false;
  const cat = join(dirname(dir), ".claude-plugin", "marketplace.json");
  try {
    const j = readJson(cat);
    const entry = (j.plugins ?? []).find((p) => p.name === NAME);
    if (entry) {
      entry.version = version;
      writeFileSync(cat, `${JSON.stringify(j, null, 2)}\n`);
      catalogue = true;
    }
  } catch {
    catalogue = false;
  }
  // The backup is only promised in a marketplace folder: the registry of uploaded
  // plugins of Claude Desktop deletes it within minutes (see plugin-place.mjs).
  const { place, backupKept, desktop } = pluginPlace(dir, NAME);
  out({ ok: true, oldVersion: old, version, pluginDir: dir, backup, backupKept, desktop, place, catalogue, sha256, signatureVerified: true, ...(expected.test ? { testKey: true } : {}) });
}

try {
  if (command === "check") await check();
  else if (command === "download") await download();
  else if (command === "install") install();
  else if (command === "verify") verifyOnly();
  else out({ ok: false, message: "usage: update.mjs check | download | install --zip <file> [--sig <file>] [--sha256 <fingerprint>] [--force] | verify --zip <file> [--sig <file>]" }, 1);
} catch (e) {
  out({ ok: false, message: e?.message ?? String(e) }, 1);
}
