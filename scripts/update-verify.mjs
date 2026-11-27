// update-verify.mjs - Is this archive the one the author published?
//
// WHY (2026-11-27). The update used to trust a fingerprint read from the same
// place as the archive: the site said "here is the zip, and here is its
// SHA-256". A site that is taken over serves both, and the check passes. A
// fingerprint proves a download was not damaged; it says nothing of who made
// the file.
//
// So each published archive is SIGNED, with a key that never leaves the
// author's computer, and this plugin carries the public half of that key
// (RELEASE_KEY, below: the same key that signs the tags of the public
// repository). An update is installed only if the signature of the archive
// was made by that key. The site and GitHub then only carry files: whoever
// controls them can refuse to serve an update, never make one.
//
// THE FORMAT is OpenSSH's own ("SSH signature", made by
// `ssh-keygen -Y sign -n hypervibe-brain-release -f <key> <zip>`), read here
// with node:crypto alone, no dependency:
//
//   -----BEGIN SSH SIGNATURE-----          the envelope, in base64:
//     "SSHSIG"  version (1)                  what it is
//     public key                             who signed
//     namespace                              what the signature is for
//     reserved  hash algorithm               sha512 (or sha256)
//     signature                              ed25519, over:
//   -----END SSH SIGNATURE-----                "SSHSIG" namespace reserved
//                                              hash-algorithm H(the archive)
//
// Four things are checked, each of which alone refuses the archive: the key
// in the envelope is EXACTLY the one carried here (not "a valid key": that
// one); the namespace is this plugin's releases (a signature the author made
// for something else, a git tag, cannot be replayed as a release); the hash
// is a known one; and the signature itself holds.
//
// Pure but for node:crypto: no file, no network, no environment read here
// (releaseKeyFor is given what it needs).

import { createHash, createPublicKey, verify } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

/** The public key of the releases. Changing it is changing who may publish this plugin. */
export const RELEASE_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAqVH7FUXHPiorT/puz89VLIE9MvFuYIINFqIBG+erLm";
export const RELEASE_NAMESPACE = "hypervibe-brain-release";

const MAGIC = Buffer.from("SSHSIG");
const KEY_TYPE = "ssh-ed25519";
// The fixed head of an ed25519 public key in the form node:crypto reads (SPKI).
const SPKI_HEAD = Buffer.from("302a300506032b6570032100", "hex");

/** Reads the fields of an SSH structure: each string is its length on 4 bytes, then its bytes. */
class Fields {
  /** @param {Buffer} buf */
  constructor(buf) {
    this.buf = buf;
    this.at = 0;
  }
  /** @param {number} n */
  take(n) {
    if (n < 0 || this.at + n > this.buf.length) throw new Error("the signature is cut short");
    const out = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  u32() {
    return this.take(4).readUInt32BE(0);
  }
  string() {
    return this.take(this.u32());
  }
  get done() {
    return this.at === this.buf.length;
  }
}
const field = (b) => {
  const data = Buffer.isBuffer(b) ? b : Buffer.from(String(b), "utf8");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, data]);
};

/**
 * A public key as OpenSSH writes it on one line ("ssh-ed25519 AAAA... [comment]"):
 * its structure (`blob`, what an envelope carries) and its 32 bytes (`raw`).
 * @param {string} line
 */
export function readPublicKey(line) {
  const [type, b64] = String(line ?? "").trim().split(/\s+/);
  if (type !== KEY_TYPE || !b64) throw new Error("not an ed25519 public key");
  const blob = Buffer.from(b64, "base64");
  const f = new Fields(blob);
  if (f.string().toString("utf8") !== KEY_TYPE) throw new Error("not an ed25519 public key");
  const raw = f.string();
  if (raw.length !== 32 || !f.done) throw new Error("not an ed25519 public key");
  return { blob, raw };
}

/**
 * The envelope of a signature, from what was received: the armoured text of a
 * `.sig` file, that text in base64 (a manifest's field), or the envelope
 * itself in base64.
 * @param {string | Buffer} signature
 * @returns {Buffer}
 */
export function readEnvelope(signature) {
  let text = Buffer.isBuffer(signature) ? signature.toString("utf8") : String(signature ?? "");
  if (!text.includes("BEGIN SSH SIGNATURE")) {
    const decoded = Buffer.from(text.replace(/\s+/g, ""), "base64");
    if (decoded.subarray(0, 6).equals(MAGIC)) return decoded;
    text = decoded.toString("utf8");
  }
  const m = /-----BEGIN SSH SIGNATURE-----([\s\S]*?)-----END SSH SIGNATURE-----/.exec(text);
  if (!m) throw new Error("no SSH signature in what was received");
  return Buffer.from(m[1].replace(/\s+/g, ""), "base64");
}

/** The same signature as the text of a `.sig` file, whatever form it came in. @param {string | Buffer} signature */
export function armour(signature) {
  const b64 = readEnvelope(signature).toString("base64");
  return `-----BEGIN SSH SIGNATURE-----\n${(b64.match(/.{1,70}/g) ?? []).join("\n")}\n-----END SSH SIGNATURE-----\n`;
}

/**
 * Was `data` signed, for this plugin's releases, by the key expected?
 * Never throws: an answer, with the reason of a refusal in plain words.
 * @param {Buffer} data the archive, whole
 * @param {string | Buffer} signature see readEnvelope
 * @param {{ publicKey?: string, namespace?: string }} [o]
 * @returns {{ ok: true, hash: string } | { ok: false, reason: string }}
 */
export function verifyRelease(data, signature, { publicKey = RELEASE_KEY, namespace = RELEASE_NAMESPACE } = {}) {
  try {
    const expected = readPublicKey(publicKey);
    const f = new Fields(readEnvelope(signature));
    if (!f.take(6).equals(MAGIC)) return { ok: false, reason: "this is not an SSH signature" };
    if (f.u32() !== 1) return { ok: false, reason: "a version of SSH signature this plugin does not read" };
    const signer = f.string();
    const ns = f.string().toString("utf8");
    const reserved = f.string();
    const hash = f.string().toString("utf8");
    const sig = new Fields(f.string());
    if (!f.done) return { ok: false, reason: "the signature carries more than a signature" };
    // The key that signed is the author's, to the byte: any other key, however valid, is nobody.
    if (!signer.equals(expected.blob)) return { ok: false, reason: "the archive was not signed with the author's key" };
    if (ns !== namespace) return { ok: false, reason: `the signature was made for something else ("${ns.slice(0, 60)}"), not for a release of this plugin` };
    if (hash !== "sha512" && hash !== "sha256") return { ok: false, reason: `a hash this plugin does not accept (${hash.slice(0, 20)})` };
    if (sig.string().toString("utf8") !== KEY_TYPE) return { ok: false, reason: "not an ed25519 signature" };
    const raw = sig.string();
    if (raw.length !== 64 || !sig.done) return { ok: false, reason: "not an ed25519 signature" };
    const signed = Buffer.concat([MAGIC, field(ns), field(reserved), field(hash), field(createHash(hash).update(data).digest())]);
    const key = createPublicKey({ key: Buffer.concat([SPKI_HEAD, expected.raw]), format: "der", type: "spki" });
    if (!verify(null, signed, key, raw)) return { ok: false, reason: "the signature does not match this archive: it was changed, or it is another file" };
    return { ok: true, hash };
  } catch (e) {
    return { ok: false, reason: `unreadable signature (${e?.message ?? e})` };
  }
}

/** Is `child` inside `parent`, links resolved as far as the path exists? */
function inside(parent, child) {
  const real = (p) => {
    let at = resolve(String(p));
    const tail = [];
    while (!existsSync(at) && dirname(at) !== at) {
      tail.unshift(at.slice(dirname(at).length));
      at = dirname(at);
    }
    try {
      return realpathSync.native(at) + tail.join("");
    } catch {
      return at + tail.join("");
    }
  };
  const rel = relative(real(parent), real(child));
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

/**
 * THE KEY AN ARCHIVE MUST BE SIGNED WITH: the author's, always, except for
 * the plugin's own test bench.
 *
 * The bench cannot sign with the author's key (it is not there, and must not
 * be), so it names its own in HVBRAIN_UPDATE_PUBKEY. A variable that replaces
 * the key would be a back door if it were simply obeyed: anyone able to slip
 * one word into a command ("set this variable and update") would install what
 * they want. It is obeyed only when ALL of this holds, which a real update
 * never meets:
 *   - HVBRAIN_HOME is set and is a folder of the system's temporary folder
 *     (a bench's throwaway home; a real install has none, or a real one);
 *   - every folder the command is about to write in (`targets`: the plugin to
 *     replace) is in the temporary folder too;
 *   - the plugin to replace is not the one that is running (`self`): a plugin
 *     updating itself, which is what the update skill does, always expects
 *     the author's key.
 * Otherwise the variable is ignored, and the answer says so (`ignored`).
 * When it is obeyed, the answer of the command carries `testKey: true`, and
 * the skill treats that as a refusal: a real update never shows it.
 *
 * What this does not claim: someone who can already run any command on the
 * computer can replace the plugin's files without asking this script. No
 * check inside the plugin protects from that.
 *
 * @param {{ override?: string, home?: string, tmp: string, targets?: string[], self?: string }} o
 * @returns {{ key: string, test: boolean, ignored?: boolean }}
 */
export function releaseKeyFor({ override, home, tmp, targets = [], self = "" }) {
  if (!override) return { key: RELEASE_KEY, test: false };
  const same = (a, b) => resolve(a).toLowerCase() === resolve(b).toLowerCase();
  const bench = Boolean(home) && inside(tmp, home) && targets.every((t) => inside(tmp, t) && !(self && same(t, self)));
  if (!bench) return { key: RELEASE_KEY, test: false, ignored: true };
  try {
    readPublicKey(override);
  } catch {
    return { key: RELEASE_KEY, test: false, ignored: true };
  }
  return { key: override, test: true };
}
