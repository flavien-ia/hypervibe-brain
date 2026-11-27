#!/usr/bin/env node
// readers/document.mjs - The text of a document, for a judge.
//
//   node scripts/readers/document.mjs <address or path>
//
// The address is the one of a judge's pile (`dropbox://Work/x/doc.docx#2026-...`:
// a root of this computer, config "sourceRoots"; the version after `#` is
// ignored) or a path of the disk. Word, PowerPoint and Excel by reading their
// own XML (they are zip files: no dependency), text, markdown and csv as they
// are. A PDF: the judge reads it with its Read tool, this script says so and
// gives the path to open.
//
// Reads only. The text is cut at 60 000 characters: a judge looks for what is
// new and lasting, it does not copy.
//
// WHAT A JUDGE NEVER READS THIS WAY (2026-11-27, security audit). A root is
// often wide (a whole synchronised folder, a folder of projects): a judge
// turned by what it reads could ask for the brain's own files, a key kept
// under the root, a recovery code, and then write it in the brain, which
// leaves with the next save. So, whatever the root an address goes through
// (the same refusals as brain_fetch, fetch.mjs, and a few more):
//   - nothing inside the brain's folder, nor inside the plugin's settings on
//     this computer (~/.hypervibe-brain);
//   - nothing whose path has a name that starts with a dot (.env, .git, .ssh,
//     .aws, .gnupg, .config/gcloud), nor a folder named danger-zone;
//   - no file whose name says it holds a secret: a recovery code, a password,
//     a key (*.pem, *.key, id_*);
//   - nothing a link leads to outside the root.
// Both the path as it is written and the path as the disk knows it are
// checked, without regard to case where the disk has none.
//
// Born in the brain this plugin grew from (2026-11-08, with two libraries of
// that brain's app), moved here without them on 2026-11-10.

import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";
import { opened } from "./opened.mjs";

const LIMIT = 60_000;
const arg = process.argv[2];
if (!arg) {
  console.error("usage: document.mjs <address scheme://... or path>");
  process.exit(1);
}

const HOME = process.env.HVBRAIN_HOME || homedir();
const CASELESS = process.platform === "win32" || process.platform === "darwin";
const spelled = (p) => (CASELESS ? resolve(p).toLowerCase() : resolve(p));
/** A path as the disk knows it; as it is written when nothing is there. */
const onDisk = (p) => {
  try {
    return spelled(realpathSync.native(resolve(p)));
  } catch {
    return spelled(p);
  }
};
/** The path from a folder down to what it holds: null when it is not inside. */
const under = (dir, p) => {
  const rel = relative(dir, p);
  return /^\.\.([\\/]|$)/.test(rel) || isAbsolute(rel) ? null : rel;
};
// A name that says a secret: a recovery code, a password, a key.
const SECRET_NAME = /(^|[^a-z])(recovery|r[eé]cup[eé]ration|passwords?|passwd|mots?[-_ ]de[-_ ]passe|secrets?|credentials?|private[-_ ]?key|api[-_ ]?keys?)([^a-z]|$)|\.(pem|key|pfx|p12|ppk|kdbx|keystore|jks)$|^id_[a-z0-9]+(\.pub)?$|^\.?env(\.|$)/i;
const SECRET_FOLDER = /[\\/]\.(ssh|aws|gnupg|kube|docker|azure)([\\/]|$)|[\\/]\.config[\\/]gcloud([\\/]|$)/i;
/**
 * Why a path under a root is never read by a judge, or null. `base` and `p`
 * spelled the same way (both as written, or both as the disk knows them).
 * @param {string} base @param {string} p @param {string[]} kept the folders that are never read (the brain, the plugin's settings)
 */
function refusal(base, p, kept) {
  const rel = under(base, p);
  if (rel === null) return "an address cannot leave its root";
  const names = rel.split(/[\\/]/).filter(Boolean);
  if (names.some((s) => s.startsWith("."))) return "a file or a folder whose name starts with a dot is never read this way";
  if (names.some((s) => /^danger-zone$/i.test(s))) return "a folder named danger-zone is never read";
  if (SECRET_FOLDER.test(p)) return "a folder where keys are kept is never read this way";
  if (kept.some((d) => under(d, p) !== null)) return "the brain's own folder and the plugin's settings are never read this way: a note is read with brain_get";
  if (SECRET_NAME.test(basename(p))) return "a file whose name says it holds a secret (a key, a password, a recovery code) is never read this way";
  return null;
}

/** An address of the brain (dropbox://, dev://) as a path of this computer. */
function pathOf(address) {
  const bare = address.replace(/#[^/\\]*$/, "");
  const m = /^([a-z][a-z0-9+.-]+):\/\/(.*)$/i.exec(bare);
  // A JUDGE READS ONLY UNDER A ROOT OF THIS COMPUTER (2026-11-16). Its rule
  // allows this script with any argument: given a plain path, it could have
  // read any text or Office file of the disk, on the word of a document that
  // asked for it. A judge names a document by its address, and the address
  // cannot climb out of its root. A person, in a conversation, reads what they want.
  const judge = /^ai:/.test(process.env.HVBRAIN_WHO ?? "");
  if (!m) {
    if (judge) throw new Error("a judge reads a document by its address (scheme://path), never by a path of the disk");
    return bare;
  }
  const raw = readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8");
  const conf = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  const root = conf.sourceRoots?.[m[1]];
  if (!root) throw new Error(`no root named ${m[1]}:// on this computer`);
  const path = resolve(root, decodeURIComponent(m[2]));
  const inside = relative(resolve(root), path);
  if (inside.startsWith("..") || isAbsolute(inside)) throw new Error("an address cannot leave its root");
  if (judge) {
    // As written first (nothing is touched on the disk for a path refused by
    // its words alone), then as the disk knows it.
    const brain = process.env.HVBRAIN_DIR || conf.brain;
    const kept = [...(brain ? [brain] : []), join(HOME, ".hypervibe-brain")];
    const written = refusal(spelled(root), spelled(path), kept.map(spelled));
    if (written) throw new Error(written);
    if (existsSync(path)) {
      const real = refusal(onDisk(root), onDisk(path), kept.map(onDisk));
      if (real) throw new Error(real);
    }
  }
  return path;
}

/**
 * The files of a zip archive: name -> its bytes. The central directory at the
 * end of the file says where each one is; stored (0) and deflated (8) entries,
 * which is all an Office document holds.
 * @param {Buffer} buf
 * @returns {Map<string, () => Buffer>}
 */
function unzip(buf) {
  /** @type {Map<string, () => Buffer>} */
  const files = new Map();
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("not a zip archive");
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  for (let k = 0; k < count && p + 46 <= buf.length; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    files.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return inflateRawSync(data);
      throw new Error(`compression ${method} not read`);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decode = (s) =>
  s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/**
 * The text of an Office XML part: what its runs hold (<x:t>), joined as they
 * are written, one line per paragraph (<x:p>). A word that the editor split
 * over two runs (a spelling mark, a change of style in the middle) stays one
 * word: turning every tag into a space cut it in two. Deleted text (tracked
 * changes) is not in <x:t> and stays out.
 * @param {string} xml
 * @param {string} x the namespace prefix: "w" (Word), "a" (PowerPoint)
 */
function runs(xml, x) {
  const token = new RegExp(`<${x}:t(?: [^>]*)?>([\\s\\S]*?)</${x}:t>|<${x}:tab\\b[^>]*>|<${x}:br\\b[^>]*>|</${x}:p>`, "g");
  let out = "";
  for (const m of xml.matchAll(token)) {
    if (m[1] !== undefined) out += m[1];
    else if (m[0].startsWith(`<${x}:tab`)) out += "\t";
    else out += "\n";
  }
  return decode(out).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The shared strings of a workbook, one per line. */
function strings(xml) {
  let out = "";
  for (const m of xml.matchAll(/<t(?: [^>]*)?>([\s\S]*?)<\/t>|<\/si>/g)) out += m[1] !== undefined ? m[1] : "\n";
  return decode(out).replace(/\n{2,}/g, "\n").trim();
}

const number = (name) => Number(/\d+/.exec(name.split("/").pop() ?? "")?.[0] ?? 0);

function read(p) {
  const ext = extname(p).toLowerCase();
  if (ext === ".pdf") {
    // The REAL path, with forward slashes (2026-11-17): a judge's Read rule
    // names each watched folder by its real path (judge.mjs, {watch}), and a
    // path typed in another case, or through a link, would not match it.
    let real = p;
    try {
      real = realpathSync.native(p);
    } catch {
      real = p;
    }
    return `PDF: read it with the Read tool, path ${real.replaceAll("\\", "/")}`;
  }
  if ([".txt", ".md", ".csv"].includes(ext)) return readFileSync(p, "utf8");
  if (![".docx", ".pptx", ".xlsx"].includes(ext)) return `Format not read (${ext || "no extension"}): only the file's name counts.`;
  const zip = unzip(readFileSync(p));
  const text = (name) => zip.get(name)?.().toString("utf8") ?? "";
  if (ext === ".docx") {
    // The body, then the notes: what a person reads when they read the document.
    return ["word/document.xml", "word/footnotes.xml", "word/endnotes.xml"].map((n) => runs(text(n), "w")).filter(Boolean).join("\n\n") || "(document without text)";
  }
  if (ext === ".pptx") {
    const slides = [...zip.keys()].filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => number(a) - number(b));
    return slides.map((n, i) => `--- slide ${i + 1}\n${runs(text(n), "a")}`).join("\n") || "(presentation without text)";
  }
  // Excel: the texts of the workbook (numbers alone are not there, and a judge
  // never writes an amount that is data anyway).
  return strings(text("xl/sharedStrings.xml")) || "(workbook without text)";
}

try {
  const p = pathOf(arg);
  if (!existsSync(p)) {
    console.log(`The document no longer exists: ${p}`);
    opened(arg);
    process.exit(0);
  }
  const out = String(read(p));
  // A judge's opening is kept (opened.mjs): judge.mjs counts as read what was opened.
  opened(arg);
  console.log(out.length > LIMIT ? `${out.slice(0, LIMIT)}\n\n[... cut at ${LIMIT} characters out of ${out.length}]` : out);
} catch (e) {
  console.error(`cannot read: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
