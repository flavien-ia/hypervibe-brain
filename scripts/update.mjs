#!/usr/bin/env node
// update.mjs - Brings this plugin up to the latest published version.
//
// The plugin is published as releases of its public repository: each release
// carries the plugin as a zip (hypervibe-brain-<version>.zip) and GitHub keeps
// the SHA-256 of that file. It is installed in one of three ways, read from
// Claude Code's own registry, never guessed:
//   - "marketplace": a marketplace that Claude Code follows on GitHub
//     (/plugin marketplace add flavien-ia/hypervibe-brain). Claude Code updates
//     it with its own commands; replacing files behind its back would put it at
//     odds with its registry. This script gives the commands.
//   - "upload": the zip uploaded in the Claude app (Customize > Plugins). Nobody
//     tells the person a new version came out: this script downloads it,
//     checks it, and swaps the folder, keeping the previous one as a backup.
//   - "folder": a marketplace pointing at a folder of this computer (a clone,
//     a developer's copy). The folder is the person's own: nothing is written.
//
//   node scripts/update.mjs check
//   node scripts/update.mjs download
//   node scripts/update.mjs install --zip <file>
//
// One JSON object on stdout. Exit codes: 0 done, 1 error, 2 network unreachable.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const REPO = "flavien-ia/hypervibe-brain";
const LATEST = `https://api.github.com/repos/${REPO}/releases/latest`;
const NAME = "brain";
const WORK = join(process.env.HVBRAIN_HOME ?? homedir(), ".hypervibe-brain", "updates");
const PLUGINS = join(homedir(), ".claude", "plugins");

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
const pluginDir = () => resolve(opt("--plugin-dir") ?? join(dirname(fileURLToPath(import.meta.url)), ".."));

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
  // Not in the registry (an unusual install): the only case where swapping
  // files would help is the uploaded one, and it is recognised by its place.
  return { mode: same(dirname(dir), join(PLUGINS, "marketplaces", "local-desktop-app-uploads")) ? "upload" : "unknown", marketplace: market, commands: [] };
}

/** The latest release: its version, and the plugin's zip with GitHub's own fingerprint of it. */
async function latest() {
  const r = await fetch(LATEST, { headers: { "User-Agent": "hypervibe-brain-update", Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw Object.assign(new Error(`the public repository answered ${r.status}`), { http: r.status });
  const rel = await r.json();
  const asset = (rel.assets ?? []).find((a) => /^hypervibe-brain-.*\.zip$/.test(a.name));
  // GitHub computes the digest of every release file itself; the release notes
  // carry it too, for the person who wants to check by hand.
  const fromNotes = /\b[a-f0-9]{64}\b/.exec(String(rel.body ?? ""))?.[0] ?? null;
  const digest = String(asset?.digest ?? "").replace(/^sha256:/, "") || fromNotes;
  return { version: String(rel.tag_name ?? "").replace(/^v/, ""), url: asset?.browser_download_url ?? null, sha256: digest || null, notes: rel.html_url };
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
  const list = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt archive directory");
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const lName = buf.readUInt16LE(p + 28);
    const lExtra = buf.readUInt16LE(p + 30);
    const lComment = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    list.push({ name: buf.toString("utf8", p + 46, p + 46 + lName), method, size, offset });
    p += 46 + lName + lExtra + lComment;
  }
  return list
    .filter((e) => !e.name.endsWith("/"))
    .map((e) => {
      if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw new Error(`unreadable entry: ${e.name}`);
      const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
      const raw = buf.subarray(start, start + e.size);
      if (e.method === 0) return { name: e.name, data: raw };
      if (e.method === 8) return { name: e.name, data: inflateRawSync(raw) };
      throw new Error(`compression ${e.method} not handled: ${e.name}`);
    });
}

function extract(list, dest) {
  for (const e of list) {
    // An archive must never write outside its destination.
    if (e.name.split(/[\\/]/).includes("..") || isAbsolute(e.name) || /^[A-Za-z]:/.test(e.name)) throw new Error(`path refused in the archive: ${e.name}`);
    const target = join(dest, e.name);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, e.data);
  }
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
  out({ ok: true, ...mode, pluginDir: dir, localVersion: local, publishedVersion: pub.version, updateAvailable: newer(pub.version, local), releaseNotes: pub.notes });
}

async function download() {
  let pub;
  try {
    pub = await latest();
  } catch (e) {
    return out({ ok: false, offline: !e.http, message: `Cannot read the published version: ${e.message}` }, e.http ? 1 : 2);
  }
  if (!pub.url) return out({ ok: false, message: `The release ${pub.version} carries no plugin archive.` }, 1);
  let buf;
  try {
    const r = await fetch(pub.url, { headers: { "User-Agent": "hypervibe-brain-update" }, signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return out({ ok: false, message: `The download answered ${r.status}.` }, 1);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    return out({ ok: false, offline: true, message: `Download unreachable: ${e.message}` }, 2);
  }
  const sha256 = createHash("sha256").update(buf).digest("hex");
  // The fingerprint comes from GitHub, which computed it when the file was
  // published: a difference means this is not the file that was published.
  if (pub.sha256 && pub.sha256 !== sha256) {
    return out({ ok: false, reason: "sha256-mismatch", expected: pub.sha256, got: sha256, message: "The downloaded archive does not match the published fingerprint. Nothing was installed." }, 1);
  }
  let version;
  try {
    const m = entries(buf).find((e) => e.name === ".claude-plugin/plugin.json");
    if (!m) throw new Error("no plugin manifest");
    const j = JSON.parse(m.data.toString("utf8"));
    if (j.name !== NAME) throw new Error(`this is the plugin "${j.name}", not "${NAME}"`);
    version = j.version;
  } catch (e) {
    return out({ ok: false, message: `Unusable archive: ${e.message}` }, 1);
  }
  mkdirSync(WORK, { recursive: true });
  const file = join(WORK, `hypervibe-brain-${version}.zip`);
  writeFileSync(file, buf);
  out({ ok: true, file, version, sizeBytes: buf.length, sha256, sha256Verified: Boolean(pub.sha256) });
}

function install() {
  const zip = opt("--zip");
  if (!zip || !existsSync(zip)) return out({ ok: false, message: "No archive: pass --zip <file>." }, 1);
  const dir = pluginDir();
  const mode = installMode(dir);
  if (mode.mode !== "upload" && !args.includes("--force")) {
    return out({ ok: false, reason: `managed-${mode.mode}`, ...mode, message: "This copy of the plugin is not an uploaded one: its own update path applies (see commands)." }, 1);
  }
  const old = existsSync(join(dir, ".claude-plugin", "plugin.json")) ? readJson(join(dir, ".claude-plugin", "plugin.json")).version : "unknown";
  // Unpack and check BEFORE touching the plugin in place: until the new
  // version is proven whole, the installed one does not move.
  const tmp = join(WORK, `unpack-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let version;
  try {
    const list = entries(readFileSync(zip));
    extract(list, tmp);
    const j = readJson(join(tmp, ".claude-plugin", "plugin.json"));
    if (j.name !== NAME) throw new Error(`this is the plugin "${j.name}"`);
    version = j.version;
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
  out({ ok: true, oldVersion: old, version, pluginDir: dir, backup, catalogue });
}

try {
  if (command === "check") await check();
  else if (command === "download") await download();
  else if (command === "install") install();
  else out({ ok: false, message: "usage: update.mjs check | download | install --zip <file>" }, 1);
} catch (e) {
  out({ ok: false, message: e?.message ?? String(e) }, 1);
}
