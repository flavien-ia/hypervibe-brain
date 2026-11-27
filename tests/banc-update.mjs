#!/usr/bin/env node
// banc-update.mjs - The update of the plugin, without the network: a fake
// installed plugin, archives built here, a fake site and a fake public
// repository on this computer, and the swap checked both ways (what must be
// installed, and what must be refused without touching the plugin).
//
// The archives are signed here with a key made for the run (2026-11-27): the
// author's own is not on this computer and must not be. The bench names its
// key in HVBRAIN_UPDATE_PUBKEY, which update.mjs only obeys in a throwaway
// home of the temporary folder (update-verify.mjs, releaseKeyFor): that rule
// is checked here too.
//
//   node tests/banc-update.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir, tmpdir } from "node:os";
import { dirname, join, parse } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const UPDATE = join(HERE, "..", "scripts", "update.mjs");
const BASE = join(tmpdir(), `brain-update-${process.pid}`);
const HOME = join(BASE, "home");
// An uploaded copy: the folder of uploads, in the throwaway home's registry.
const PLUGIN = join(HOME, ".claude", "plugins", "marketplaces", "local-desktop-app-uploads", "brain");
const WORK = join(HOME, ".hypervibe-brain", "updates");
// A home that is NOT in the temporary folder, never created: its name is this run's own.
const OUTSIDE = join(parse(tmpdir()).root, `hvbrain-bench-outside-${process.pid}`);
let failures = 0;
let total = 0;

function check(label, ok, detail = "") {
  total++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n        ${String(detail).slice(0, 500)}`}`);
  if (!ok) failures++;
}

/** A zip: stored entries, or deflated ones ({ data, deflate: true }). Enough for the reader of update.mjs. */
function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const data = Buffer.isBuffer(content?.data) ? content.data : Buffer.from(String(content), "utf8");
    const packed = content?.deflate ? deflateRawSync(data) : data;
    const method = content?.deflate ? 8 : 0;
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt16LE(method, 8);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(packed.length, 18);
    h.writeUInt32LE(content?.declared ?? data.length, 22);
    h.writeUInt16LE(n.length, 26);
    local.push(h, n, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(method, 10);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(content?.declared ?? data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const plugin = (version, extra = {}, name = "brain") => ({
  ".claude-plugin/plugin.json": JSON.stringify({ name, version }),
  "skills/update/SKILL.md": "update",
  "scripts/update.mjs": "// new",
  "templates/brain/BRAIN.md": "template",
  ...extra,
});

// ---- the bench's own key, and a signature as OpenSSH writes it
const field = (b) => {
  const data = Buffer.isBuffer(b) ? b : Buffer.from(String(b), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, data]);
};
function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const blob = Buffer.concat([field("ssh-ed25519"), field(publicKey.export({ format: "der", type: "spki" }).subarray(-32))]);
  return { privateKey, blob, line: `ssh-ed25519 ${blob.toString("base64")} bench` };
}
const KEY = keyPair();
const OTHER = keyPair();
/** The `.sig` of a file, made as `ssh-keygen -Y sign` makes it. `claims`: the public key written in the envelope. */
function sshsig(data, { key = KEY, claims = key, namespace = "hypervibe-brain-release", hash = "sha512" } = {}) {
  const signed = Buffer.concat([Buffer.from("SSHSIG"), field(namespace), field(""), field(hash), field(createHash(hash).update(data).digest())]);
  const version = Buffer.alloc(4);
  version.writeUInt32BE(1, 0);
  const envelope = Buffer.concat([Buffer.from("SSHSIG"), version, field(claims.blob), field(namespace), field(""), field(hash), field(Buffer.concat([field("ssh-ed25519"), field(sign(null, signed, key.privateKey))]))]);
  return `-----BEGIN SSH SIGNATURE-----\n${envelope.toString("base64").match(/.{1,70}/g).join("\n")}\n-----END SSH SIGNATURE-----\n`;
}

const ENV = { ...process.env, HVBRAIN_HOME: HOME, HOME, USERPROFILE: HOME, HVBRAIN_UPDATE_PUBKEY: KEY.line, HVBRAIN_UPDATE_SITE: "http://127.0.0.1:9", HVBRAIN_UPDATE_API: "http://127.0.0.1:9" };
const answer = (r) => {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: false, raw: `${r.stdout}${r.stderr}` };
  }
};

function installed(version, dir = PLUGIN) {
  rmSync(dir, { recursive: true, force: true });
  for (const [p, t] of Object.entries(plugin(version))) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), t, "utf8");
  }
}

/**
 * An install of an archive built here. `sig`: its signature (the bench's by
 * default), false for none. `more`: other arguments; `env`: what changes in
 * the environment.
 */
function install(files, { sig, more = [], env = {}, dir = PLUGIN, raw } = {}) {
  const file = join(BASE, "candidate.zip");
  const data = raw ?? zip(files);
  writeFileSync(file, data);
  rmSync(`${file}.sig`, { force: true });
  if (sig !== false) writeFileSync(`${file}.sig`, sig ?? sshsig(data), "utf8");
  return answer(spawnSync(process.execPath, [UPDATE, "install", "--zip", file, "--plugin-dir", dir, ...more], { encoding: "utf8", env: { ...ENV, ...env } }));
}
const versionThere = (dir) => JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8")).version;

/** A real install in a given place, the registry being the throwaway home's. */
function installAt(dir) {
  installed("1.0.0", dir);
  return install(plugin("1.1.0"), { dir });
}

/** update.mjs without blocking this process: the fake site lives in it. */
const runAsync = (a, env = {}) =>
  new Promise((res) => {
    const child = spawn(process.execPath, [UPDATE, ...a], { env: { ...ENV, ...env }, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (status) => res({ status, ...answer({ stdout, stderr }) }));
  });

let server = null;
try {
  mkdirSync(HOME, { recursive: true });

  console.log("The signature of an archive (update-verify.mjs)");
  const V = await import(pathToFileURL(join(HERE, "..", "scripts", "update-verify.mjs")).href);
  {
    const data = zip(plugin("1.1.0"));
    const good = sshsig(data);
    const withKey = { publicKey: KEY.line };
    check("an archive signed by the key expected is accepted", V.verifyRelease(data, good, withKey).ok === true, JSON.stringify(V.verifyRelease(data, good, withKey)));
    check("with sha256 as its hash too, and whatever form the signature travels in (text, base64 of it, the envelope alone)", V.verifyRelease(data, sshsig(data, { hash: "sha256" }), withKey).ok && V.verifyRelease(data, Buffer.from(good).toString("base64"), withKey).ok && V.verifyRelease(data, good.replace(/-----[A-Z ]+-----|\s/g, ""), withKey).ok && V.armour(Buffer.from(good).toString("base64")) === good);
    check("the same archive with one byte changed is refused", V.verifyRelease(Buffer.concat([data, Buffer.from("x")]), good, withKey).ok === false);
    const byOther = V.verifyRelease(data, sshsig(data, { key: OTHER }), withKey);
    check("an archive signed by another key is refused, however valid that signature is", byOther.ok === false && /author's key/.test(byOther.reason), JSON.stringify(byOther));
    const forged = V.verifyRelease(data, sshsig(data, { key: OTHER, claims: KEY }), withKey);
    check("a signature that only claims the expected key is refused", forged.ok === false && /does not match/.test(forged.reason), JSON.stringify(forged));
    const elsewhere = V.verifyRelease(data, sshsig(data, { namespace: "git" }), withKey);
    check("a signature the same key made for something else (a git tag) is refused", elsewhere.ok === false && /something else/.test(elsewhere.reason), JSON.stringify(elsewhere));
    check("an odd hash, a cut signature, anything that is not one: refused, never an exception", [sshsig(data, { hash: "md5" }), good.slice(0, 120), "hello", "", Buffer.alloc(0)].every((s) => V.verifyRelease(data, s, withKey).ok === false));
    check("the plugin carries the author's public key, and without a word to the contrary that is the one expected", V.readPublicKey(V.RELEASE_KEY).raw.length === 32 && V.verifyRelease(data, good).ok === false && V.RELEASE_NAMESPACE === "hypervibe-brain-release");

    // With the real ssh-keygen, when this computer has one: what the author's
    // release makes is what this plugin reads, and the other way round.
    const sshKeygen = [process.platform === "win32" ? "C:/Windows/System32/OpenSSH/ssh-keygen.exe" : "", "ssh-keygen"].filter(Boolean).find((c) => spawnSync(c, ["-Y", "check-novalidate", "-n", "x", "-s", "nowhere"], { encoding: "utf8", input: "" }).error === undefined);
    const dir = join(BASE, "ssh");
    mkdirSync(dir, { recursive: true });
    const made = sshKeygen ? spawnSync(sshKeygen, ["-q", "-t", "ed25519", "-N", "", "-C", "bench", "-f", join(dir, "key")], { encoding: "utf8" }) : { status: 1 };
    if (made.status === 0 && existsSync(join(dir, "key.pub"))) {
      const file = join(dir, "hypervibe-brain-1.1.0.zip");
      writeFileSync(file, data);
      const signed = spawnSync(sshKeygen, ["-Y", "sign", "-n", "hypervibe-brain-release", "-f", join(dir, "key"), file], { encoding: "utf8" });
      const pub = readFileSync(join(dir, "key.pub"), "utf8").trim();
      const real = existsSync(`${file}.sig`) ? readFileSync(`${file}.sig`, "utf8") : "";
      check("a signature made by the real ssh-keygen (the release's command) is read and accepted", signed.status === 0 && V.verifyRelease(data, real, { publicKey: pub }).ok === true && V.verifyRelease(data, real, withKey).ok === false, `${signed.stderr} ${JSON.stringify(V.verifyRelease(data, real, { publicKey: pub }))}`);
      writeFileSync(join(dir, "allowed"), `bench ${KEY.line}\n`, "utf8");
      writeFileSync(join(dir, "bench.sig"), good, "utf8");
      const back = spawnSync(sshKeygen, ["-Y", "verify", "-f", join(dir, "allowed"), "-I", "bench", "-n", "hypervibe-brain-release", "-s", join(dir, "bench.sig")], { input: data, encoding: "utf8" });
      check("and the real ssh-keygen accepts the signatures this bench makes", back.status === 0, `${back.stdout}${back.stderr}`);
    } else console.log("  skip  no ssh-keygen on this computer: the signatures of this bench are made with node:crypto alone");
  }

  console.log("\nThe key of the bench is no back door (releaseKeyFor)");
  {
    const tmp = tmpdir();
    const outside = OUTSIDE;
    const k = (o) => V.releaseKeyFor({ override: KEY.line, tmp, self: join(HERE, ".."), ...o });
    check("in a throwaway home, for a throwaway plugin: the bench's key", k({ home: HOME, targets: [PLUGIN] }).test === true && k({ home: HOME, targets: [PLUGIN] }).key === KEY.line);
    check("without a throwaway home, or with a real one: the author's key, and the variable is said to be ignored", [k({ targets: [PLUGIN] }), k({ home: outside, targets: [PLUGIN] }), k({ home: homedir(), targets: [PLUGIN] })].every((x) => x.key === V.RELEASE_KEY && x.test === false && x.ignored === true));
    check("for a plugin that is not in the temporary folder: the author's key", k({ home: HOME, targets: [join(outside, "brain")] }).key === V.RELEASE_KEY);
    check("for the plugin that is running (an update of itself): the author's key, wherever it lives", V.releaseKeyFor({ override: KEY.line, tmp, home: HOME, targets: [PLUGIN], self: PLUGIN }).key === V.RELEASE_KEY);
    check("a variable that is not a key changes nothing", k({ home: HOME, targets: [PLUGIN], override: "anything" }).key === V.RELEASE_KEY && V.releaseKeyFor({ tmp, home: HOME, targets: [PLUGIN] }).ignored === undefined);
  }

  console.log("\nThe update of the plugin");
  installed("1.0.0");
  let r = install(plugin("1.1.0"));
  check("a whole new version, signed, takes the place of the installed one", r.ok && r.signatureVerified === true && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));
  check("and the previous one is kept aside", existsSync(`${PLUGIN}-backup-1.0.0`) && versionThere(`${PLUGIN}-backup-1.0.0`) === "1.0.0", JSON.stringify(r));
  check("an install made with the bench's key says so: a real one never does", r.testKey === true, JSON.stringify(r));

  installed("1.0.0");
  r = install(plugin("1.1.0"), { sig: false });
  check("an archive without a signature is refused, the installed version untouched", !r.ok && r.reason === "signature-missing" && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));
  r = install(plugin("1.1.0"), { sig: sshsig(zip(plugin("1.1.0")), { key: OTHER }) });
  check("an archive signed by someone else is refused", !r.ok && r.reason === "signature-invalid" && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));
  r = install(plugin("1.1.0"), { sig: sshsig(zip(plugin("1.0.5"))) });
  check("a signature of another archive is refused", !r.ok && r.reason === "signature-invalid" && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));
  r = install(plugin("1.1.0"), { env: { HVBRAIN_UPDATE_PUBKEY: "" } });
  check("without the bench's variable, the bench's signature is nobody's: only the author's key counts", !r.ok && r.reason === "signature-invalid" && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));
  r = install(plugin("1.1.0"), { env: { HVBRAIN_HOME: OUTSIDE } });
  check("nor does the variable count outside a throwaway home", !r.ok && r.reason === "signature-invalid" && versionThere(PLUGIN) === "1.0.0" && !existsSync(OUTSIDE), JSON.stringify(r));
  r = install(plugin("1.1.0"), { more: ["--sha256", "0".repeat(64)] });
  check("an archive that is not the one checked at download (its fingerprint differs) is refused", !r.ok && r.reason === "sha256-mismatch" && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));
  r = install(plugin("1.1.0"), { more: ["--sha256", createHash("sha256").update(zip(plugin("1.1.0"))).digest("hex")] });
  check("with the right fingerprint and the right signature, it is installed", r.ok && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));

  // `verify`: the signature alone, for the release and for a zip fetched by hand. The author's key, always.
  r = answer(spawnSync(process.execPath, [UPDATE, "verify", "--zip", join(BASE, "candidate.zip")], { encoding: "utf8", env: ENV }));
  check("verify knows only the author's key: an archive signed by the bench is not the author's, whatever the variable says", r.ok === false && r.reason === "signature-invalid" && !("testKey" in r), JSON.stringify(r));
  rmSync(join(BASE, "candidate.zip.sig"), { force: true });
  r = answer(spawnSync(process.execPath, [UPDATE, "verify", "--zip", join(BASE, "candidate.zip")], { encoding: "utf8", env: ENV }));
  check("and an archive without its signature is said to have none", r.ok === false && r.reason === "signature-missing" && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));

  // Never backwards.
  r = install(plugin("1.0.0"));
  check("an older version, signed in its time, is refused: an update never goes backwards", !r.ok && r.reason === "not-newer" && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));
  r = install(plugin("1.1.0"));
  check("the same version is not an update either", !r.ok && r.reason === "not-newer" && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));
  r = install(plugin("1.0.0"), { more: ["--force"] });
  check("with --force, the person's own word, an older signed version goes in", r.ok && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));
  r = install(plugin("1.0.0"), { more: ["--force"], sig: false });
  check("--force never replaces the signature", !r.ok && r.reason === "signature-missing", JSON.stringify(r));

  installed("1.0.0");
  const { "scripts/update.mjs": _, ...noScripts } = plugin("1.1.0");
  r = install(noScripts);
  check("a version without its scripts is refused, the installed one untouched", !r.ok && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  r = install(plugin("1.1.0", { "../outside.txt": "no" }));
  check("an archive that would write outside its folder is refused", !r.ok && !existsSync(join(dirname(PLUGIN), "outside.txt")) && !existsSync(join(WORK, "outside.txt")) && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  r = install(plugin("1.1.0", {}, "someone-else"));
  check("another plugin's archive is refused", !r.ok && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  r = install(plugin("1.1.0/../../../../escaped"));
  check("a version that is not a version number is refused", !r.ok && /version number/.test(r.message) && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  // An archive cannot fill the disk.
  r = install(plugin("1.1.0", { "templates/zeros.bin": { data: Buffer.alloc(60 * 1024 * 1024), deflate: true } }));
  check("an archive that unpacks to more than 50 MB is refused", !r.ok && /50 MB/.test(r.message) && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r).slice(0, 300));
  r = install(plugin("1.1.0", { "templates/liar.bin": { data: Buffer.alloc(60 * 1024 * 1024), deflate: true, declared: 10 } }));
  check("even when it declares a small size", !r.ok && /50 MB/.test(r.message) && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r).slice(0, 300));
  r = install(plugin("1.1.0", Object.fromEntries(Array.from({ length: 5001 }, (_, i) => [`templates/f${i}.txt`, "x"]))));
  check("and one with more than 5,000 files", !r.ok && /too many files/.test(r.message) && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r).slice(0, 300));

  const elsewhereDir = join(BASE, "elsewhere", "brain");
  installed("1.0.0", elsewhereDir);
  r = install(plugin("1.1.0"), { dir: elsewhereDir });
  check("a copy that was not uploaded is left to its own update path", r.ok === false && /^managed-/.test(r.reason) && versionThere(elsewhereDir) === "1.0.0", JSON.stringify(r));

  console.log("\nWhat the update promises, by where the plugin lives");
  const inMarket = PLUGIN;
  r = installAt(inMarket);
  check("in a marketplace folder: installed, backup kept and said to be", r.ok && versionThere(inMarket) === "1.1.0" && r.backupKept === true && r.desktop === false && versionThere(r.backup) === "1.0.0", JSON.stringify(r));
  const inDesktop = join(BASE, "Claude-Data", "claude_pzs8sxrjxfjjc", "rpm", "a859f234", "c851960e", "plugin_01TESTdesktop");
  r = installAt(inDesktop);
  check("in Claude Desktop's registry: recognised as an upload, installed, no backup promised", r.ok && versionThere(inDesktop) === "1.1.0" && r.backupKept === false && r.desktop === true && r.place === "desktop", JSON.stringify(r));
  r = installAt(elsewhereDir);
  check("anywhere else: left to its own update path, nothing moved", r.ok === false && versionThere(elsewhereDir) === "1.0.0", JSON.stringify(r));

  console.log("\nThe download: the site and the public repository only carry files");
  {
    // A fake site and a fake public repository. What each serves is set by the checks below.
    const state = { site: null, zip: null, release: null, files: {} };
    server = createServer((req, res) => {
      const url = new URL(req.url, "http://x");
      const send = (status, body, type = "application/json") => {
        res.writeHead(status, { "Content-Type": type });
        res.end(body);
      };
      if (url.pathname === "/api/brain/current") return state.site ? send(200, JSON.stringify(state.site)) : send(503, "{}");
      if (url.pathname === "/api/brain/download-public") return state.zip ? send(200, state.zip, "application/zip") : send(404, "");
      if (/\/releases\/(latest|tags\/v[\w.]+)$/.test(url.pathname)) return state.release ? send(200, JSON.stringify(state.release)) : send(404, "{}");
      if (url.pathname.startsWith("/files/") && state.files[url.pathname.slice(7)]) return send(200, state.files[url.pathname.slice(7)], "application/octet-stream");
      return send(404, "");
    });
    await new Promise((res) => server.listen(0, "127.0.0.1", res));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const net = { HVBRAIN_UPDATE_SITE: origin, HVBRAIN_UPDATE_API: origin };
    const good = zip(plugin("1.2.0"));
    const sha = (b) => createHash("sha256").update(b).digest("hex");
    const release = (version, { digest = true, sig = true } = {}) => ({
      tag_name: `v${version}`,
      html_url: `${origin}/notes`,
      assets: [
        { name: `hypervibe-brain-${version}.zip`, browser_download_url: `${origin}/files/zip`, ...(digest ? { digest: `sha256:${sha(state.files.zip)}` } : {}) },
        ...(sig ? [{ name: `hypervibe-brain-${version}.zip.sig`, browser_download_url: `${origin}/files/sig` }] : []),
      ],
    });
    const clean = () => rmSync(WORK, { recursive: true, force: true });
    const nothing = () => !existsSync(join(WORK, "hypervibe-brain-1.2.0.zip"));

    // 1. The site carries the signature in its manifest.
    Object.assign(state, { site: { version: "1.2.0", sha256: sha(good), signature: sshsig(good) }, zip: good, release: null, files: {} });
    clean();
    let d = await runAsync(["download"], net);
    check("the site's manifest carries the signature: downloaded, checked, the signature kept next to the archive", d.ok && d.signatureVerified === true && d.sha256Verified === true && d.version === "1.2.0" && d.from === "site" && existsSync(d.file) && readFileSync(d.signature, "utf8").includes("BEGIN SSH SIGNATURE"), JSON.stringify(d));
    installed("1.1.0");
    r = answer(spawnSync(process.execPath, [UPDATE, "install", "--zip", d.file, "--sha256", d.sha256, "--plugin-dir", PLUGIN], { encoding: "utf8", env: ENV }));
    check("and what was downloaded installs, its signature checked again", r.ok && r.signatureVerified === true && versionThere(PLUGIN) === "1.2.0", JSON.stringify(r));
    installed("1.1.0");
    writeFileSync(d.file, zip(plugin("1.2.0", { "scripts/extra.mjs": "// slipped in after the download" })));
    r = answer(spawnSync(process.execPath, [UPDATE, "install", "--zip", d.file, "--plugin-dir", PLUGIN], { encoding: "utf8", env: ENV }));
    check("an archive changed on the disk between the download and the install is refused", !r.ok && r.reason === "signature-invalid" && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));

    // 2. The site has no signature: the release of the same number on the public repository has it.
    Object.assign(state, { site: { version: "1.2.0", sha256: sha(good) }, zip: good, files: { zip: good, sig: sshsig(good) } });
    state.release = release("1.2.0");
    clean();
    d = await runAsync(["download"], net);
    check("the signature is also taken from the release of the public repository", d.ok && d.signatureVerified === true && d.from === "site", JSON.stringify(d));

    // 3. No signature anywhere.
    state.release = release("1.2.0", { sig: false });
    clean();
    d = await runAsync(["download"], net);
    check("a version without a signature is not installed, and nothing is kept of it", d.ok === false && d.reason === "signature-missing" && nothing(), JSON.stringify(d));

    // 4. A SITE TAKEN OVER serves its own archive with its own fingerprint: what the fingerprint alone let through.
    const evil = zip(plugin("1.2.0", { "scripts/evil.mjs": "// not the author's" }));
    Object.assign(state, { site: { version: "1.2.0", sha256: sha(evil), signature: sshsig(good) }, zip: evil, release: null, files: {} });
    clean();
    d = await runAsync(["download"], net);
    check("a site that serves another archive with a matching fingerprint is refused: the signature is not its to make", d.ok === false && d.reason === "signature-invalid" && nothing(), JSON.stringify(d));
    state.site.signature = sshsig(evil, { key: OTHER });
    d = await runAsync(["download"], net);
    check("and signing it with its own key changes nothing", d.ok === false && d.reason === "signature-invalid" && nothing(), JSON.stringify(d));
    state.site = { version: "1.2.0", sha256: sha(good), signature: sshsig(good) };
    d = await runAsync(["download"], net);
    check("an archive that does not match its fingerprint is refused as before", d.ok === false && d.reason === "sha256-mismatch" && nothing(), JSON.stringify(d));

    // 5. An older archive, signed in its time, announced as the new version.
    const old = zip(plugin("1.0.0"));
    Object.assign(state, { site: { version: "1.2.0", sha256: sha(old), signature: sshsig(old) }, zip: old });
    d = await runAsync(["download"], net);
    check("an older signed archive served as the new version is refused", d.ok === false && d.reason === "version-mismatch" && nothing(), JSON.stringify(d));

    // 6. The site is down: the public repository alone.
    Object.assign(state, { site: null, zip: null, files: { zip: good, sig: sshsig(good) } });
    state.release = release("1.2.0", { digest: false });
    clean();
    d = await runAsync(["download"], net);
    check("from the public repository, a file without a fingerprint is refused (it used to go on)", d.ok === false && d.reason === "sha256-missing" && nothing(), JSON.stringify(d));
    state.release = release("1.2.0");
    d = await runAsync(["download"], net);
    check("with its fingerprint and its signature, the public repository alone is enough", d.ok && d.from === "github" && d.signatureVerified === true && existsSync(d.file), JSON.stringify(d));

    // 7. A version that would name a file elsewhere.
    const sly = zip(plugin("9.9.9/../../../escaped"));
    Object.assign(state, { site: { version: "1.2.0", sha256: sha(sly), signature: sshsig(sly) }, zip: sly, release: null, files: {} });
    clean();
    d = await runAsync(["download"], net);
    check("an archive whose version would climb out of the folder writes nothing anywhere", d.ok === false && /version number/.test(d.message) && !existsSync(join(HOME, "escaped.zip")) && !existsSync(join(BASE, "escaped.zip")) && !existsSync(WORK), JSON.stringify(d));
    state.release = { tag_name: "v1.2.0/../../x", assets: [] };
    state.site = null;
    d = await runAsync(["download"], net);
    check("nor a version announced that is not a number", d.ok === false && d.reason === "bad-version", JSON.stringify(d));
    const c = await runAsync(["check", "--plugin-dir", PLUGIN], net);
    check("and the check does not compare with it", c.ok === false && !("updateAvailable" in c), JSON.stringify(c));
  }

  console.log("\nWhat the skill says");
  const skill = readFileSync(join(HERE, "..", "skills", "update", "SKILL.md"), "utf8");
  const doc = readFileSync(join(HERE, "..", "skills", "update", "DOC.md"), "utf8");
  const docFr = readFileSync(join(HERE, "..", "skills", "update", "DOC.fr.md"), "utf8");
  const wrapUp = skill.slice(skill.indexOf("## Step 5"));
  check("the skill only promises the backup when backupKept is true", /`backupKept: true` → add: \*"The previous version is kept aside/.test(wrapUp) && /`backupKept: false` → \*\*never promise a backup\.\*\*/.test(wrapUp) && skill.split("\n").filter((l) => /kept aside|keeping the previous/.test(l)).every((l) => l.includes("backupKept: true")));
  check("on Desktop, the skill says the Plugins screen keeps the old number", /`desktop: true` → add one sentence: \*"Claude Desktop will keep showing the old number/.test(wrapUp));
  check("the skill's description promises no backup", !/backup|aside/i.test(/^description: (.*)$/m.exec(skill)?.[1] ?? "backup"));
  check("the DOC pages say Desktop deletes the copy", doc.includes("except on Claude Desktop") && docFr.includes("sauf sous Claude Desktop") && doc.includes("so Claude never promises it there") && docFr.includes("Claude ne vous la promet donc pas"));
  check("the skill stops on a missing or refused signature, never offers --force, and refuses an answer made with a test key", /signature-missing/.test(skill) && /signature-invalid/.test(skill) && /not-newer/.test(skill) && /testKey/.test(skill) && /never (offer|propose|suggest)[^.]*--force/i.test(skill) && /--sha256/.test(skill));
  check("the DOC pages say the update checks the author's signature, and what to do when it is refused", /signature/i.test(doc) && /signature/i.test(docFr) && /install nothing|installs nothing/i.test(doc) && /n'installe rien/i.test(docFr));
} finally {
  if (server) server.close();
  if (!process.argv.includes("--keep")) rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(failures ? `\n${failures}/${total} check(s) FAIL.` : `\nAll ${total} update checks pass.`);
process.exitCode = failures ? 1 : 0;
