// notes.mjs - The ONE way a note is written, by a capture or by a source.
//
// Same checks, same format (the brain's own words), same judge afterwards: a
// source written by a person's script cannot produce a note that a capture
// would refuse, nor touch what a capture could not.
//
// THE POST-VETO RULE, enforced here and not left to the callers: a note is
// created; an existing note is only ever rewritten if it is still a seed AND
// was written by the very source that asks (a source refreshing its own
// drafts: the stats of a post, the date of an event). A validated note, or a
// note of someone else, is never touched.
// One exception, as narrow as it can be: a source of FINISHED objects (a post,
// an article, a talk given: records, not thoughts) may keep its records up to
// date, but only a file nobody has touched since it wrote it (it keeps each
// one's fingerprint). A single edit by hand, and the record is the person's.
// And one place where a program may write INSIDE any note, validated or not:
// a MACHINE ZONE, between `<!-- name:auto -->` and `<!-- /name:auto -->`, that
// a source declared as its own (a count, a figure kept up to date). Only what
// is between the two marks is ever rewritten; not a character outside them.

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { DATA_ADDRESS, ROOT, STATUSES, VAULT, VISIBILITIES, listFiches, parseFiche, parseFrontmatter, sha256, slugify, sourceProblem, textProblem, toPosix, today, validate, vocab, writeFileAtomic } from "./lib.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const q = (s) => JSON.stringify(String(s));
const understand = (map, v) => Object.entries(map).find(([canon, word]) => v === canon || v === word)?.[0] ?? v;

/** The paths of the vault's notes, by slug: built once per batch. */
export function slugIndex() {
  const m = new Map();
  for (const f of listFiches()) m.set(f.replace(/\\/g, "/").split("/").pop().slice(0, -3), f);
  return m;
}

/** The fingerprint of a note's file, line endings aside. */
export const fileHash = (abs) => sha256(readFileSync(abs, "utf8").replace(/\r\n/g, "\n"));

/** Same frontmatter (the date of the last change aside, in any order) and same body. */
export function sameContent(a, b, cfg) {
  const split = (t) => {
    const m = /^---\n([\s\S]*?)\n---[ \t]*(?:\n([\s\S]*))?$/.exec(String(t).replace(/\r\n/g, "\n").replace(/^﻿/, ""));
    if (!m) return null;
    const fm = parseFrontmatter(m[1]);
    delete fm[vocab(cfg).keys.updated];
    const sorted = Object.fromEntries(Object.keys(fm).sort().map((k) => [k, Array.isArray(fm[k]) ? fm[k].map(String) : String(fm[k])]));
    return JSON.stringify([sorted, String(m[2] ?? "").trim()]);
  };
  const x = split(a);
  return x !== null && x === split(b);
}

/** A subfolder inside the type's folder (publications/linkedin): plain names only. */
function subfolder(folder) {
  if (!folder) return [];
  const parts = String(folder).replace(/\\/g, "/").split("/").filter(Boolean);
  for (const p of parts) if (p === "." || p === ".." || !/^[\p{L}\p{N}_. -]+$/u.test(p)) throw new Error(`"${folder}" is not a plain subfolder`);
  return parts;
}

/** A value of an extra field, written the way the frontmatter reader reads it back. */
function fieldValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (/^[\w-]+$/.test(String(x)) ? String(x) : q(x))).join(", ")}]`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  // A date stays a bare date, as every other date of the frontmatter.
  if (DATE.test(String(v))) return String(v);
  return q(v);
}

/**
 * Checks and renders a note. Throws an Error with a sentence the person can
 * read. Returns { slug, dir, text }.
 */
function render(n, cfg, slugs, { keepCreated } = {}) {
  const voc = vocab(cfg);
  const k = voc.keys;
  const type = n.type;
  const domains = [].concat(n.domains ?? []).map(String).filter(Boolean);
  const links = [].concat(n.links ?? []).map(String).filter(Boolean);
  const status = understand(voc.status, n.status ?? "seed");
  const visibility = understand(voc.visibility, n.visibility ?? "internal");
  const body = String(n.body ?? "").replace(/\r\n/g, "\n").trim();
  if (!n.title) throw new Error("a title is required");
  if (!cfg.types[type]) throw new Error(`the type "${type ?? ""}" is not one of this brain's types: ${Object.keys(cfg.types).join(", ")}`);
  if (!domains.length) throw new Error(`a domain is required (this brain's domains: ${cfg.domains.join(", ")})`);
  for (const d of domains) if (!cfg.domains.includes(d)) throw new Error(`"${d}" is not a domain of this brain (${cfg.domains.join(", ")})`);
  if (!STATUSES.includes(status)) throw new Error(`the status must be one of ${Object.values(voc.status).join(", ")}`);
  if (!VISIBILITIES.includes(visibility)) throw new Error(`the visibility must be one of ${Object.values(voc.visibility).join(", ")}`);
  // A record of something done may have no text (a video published without a
  // word): it still exists. A thought without text is nothing.
  if (!body && !n.allowEmpty) throw new Error("the body is empty");
  const sp = sourceProblem(n.source ?? `claude://chat/${today()}`, cfg);
  if (sp) throw new Error(sp);
  const reserved = new Set(Object.values(k));
  const extra = Object.entries(n.fields ?? {}).filter(([key, v]) => /^[A-Za-z_][\w-]*$/.test(key) && !reserved.has(key) && v !== undefined && v !== null && v !== "");
  // What this brain never writes is refused in everything that is text: the
  // title, the body, and the fields a source adds (2026-11-21: a video's title
  // came in through a field). Not in the source nor in the addresses of data:
  // an address names a thing as it is named where it lives, it cannot be
  // "written another way" (the save sets such a note aside if a hook refuses it).
  const tp = textProblem([n.title, body, ...extra.flatMap(([, v]) => [].concat(v))].map(String).join("\n"), cfg);
  if (tp) throw new Error(tp);
  const created = keepCreated ?? (n.created && DATE.test(String(n.created)) ? String(n.created) : today());
  const missing = links.filter((l) => !slugs.has(l));
  if (missing.length) throw new Error(`these links point to no note: ${missing.join(", ")}`);
  // A nature (decision, feedback, lesson...) and the addresses of the data the
  // note routes to: checked here as the index will check them.
  const nature = n.nature ? String(n.nature) : "";
  if (nature && !(cfg.natures?.[type] ?? []).includes(nature)) throw new Error(`"${nature}" is not a nature this brain gives to a ${type} (${(cfg.natures?.[type] ?? []).join(", ") || "none"})`);
  const data = [].concat(n.data ?? []).map(String).filter(Boolean);
  for (const a of data) if (!DATA_ADDRESS.test(a)) throw new Error(`"${a}" is not an address of data (scheme://path)`);

  // (An address that holds a comma or a quote is written between quotes: bare,
  // two addresses were read back as one, and the note was refused.)
  const address = (a) => (/[,'"[\]]/.test(a) ? q(a) : a);
  const text = [
    "---",
    `${k.type}: ${type}`,
    `${k.title}: ${q(n.title)}`,
    `${k.domains}: [${domains.join(", ")}]`,
    `${k.status}: ${voc.status[status]}`,
    `${k.visibility}: ${voc.visibility[visibility]}`,
    `${k.created}: ${created}`,
    `${k.updated}: ${today()}`,
    `${k.source}: ${q(n.source ?? `claude://chat/${today()}`)}`,
    ...(nature ? [`${k.nature}: ${nature}`] : []),
    ...(data.length ? [`${k.data}: [${data.map(address).join(", ")}]`] : []),
    ...extra.map(([key, v]) => `${key}: ${fieldValue(v)}`),
    "---",
    "",
    body,
    ...(links.length && !links.every((l) => body.includes(`[[${l}]]`)) ? ["", links.filter((l) => !body.includes(`[[${l}]]`)).map((l) => `[[${l}]]`).join(" ")] : []),
    "",
  ].join("\n");
  return { slug: n.slug ? slugify(n.slug, Infinity) : slugify(n.title), dir: join(VAULT, cfg.types[type], ...subfolder(n.folder)), text };
}

/** Checks a note without writing anything: what a source's test shows. */
export function checkNote(n, cfg, slugs = slugIndex()) {
  const r = render(n, cfg, slugs);
  return { slug: r.slug, folder: cfg.types[n.type], taken: slugs.has(r.slug) };
}

/**
 * Writes, then judges with the same judge as the build: a note that fails it
 * does not stay. `previous` is the note's text before (undefined for a note
 * being created).
 *
 * A NEW NOTE NEVER TAKES THE PLACE OF A FILE (2026-11-21). The name was
 * checked against the list of the vault's notes, then the file was written
 * whatever was there: two captures of the same title at the same moment (two
 * judges on the same news), a note created since a source's list was built,
 * or a title "Claude" on a disk that makes no difference between claude.md and
 * a folder's CLAUDE.md, and the second write erased the first file. A new note
 * is now created exclusively: a file already there is a refusal. An existing
 * note is written beside and renamed, never half a file.
 */
export function writeJudged(abs, text, cfg, previous) {
  if (previous === undefined) {
    try {
      writeFileSync(abs, text, { encoding: "utf8", flag: "wx" });
    } catch (e) {
      if (e.code === "EEXIST") throw new Error(`a note with this name already exists: ${toPosix(relative(ROOT, abs))}`);
      throw e;
    }
  } else writeFileAtomic(abs, text);
  let errors = [];
  try {
    errors = validate([parseFiche(abs, vocab(cfg))], cfg).errors;
  } catch (e) {
    errors = [{ msg: e.message }];
  }
  if (errors.length) {
    // (Its own file, created just above: removing it takes nobody's note.)
    if (previous === undefined) unlinkSync(abs);
    else writeFileAtomic(abs, previous);
    throw new Error(errors.map((e) => e.msg).join("; "));
  }
}

/**
 * Creates a new note. `slugs` (from slugIndex) is updated with it. Refuses a
 * name already taken: the person decides whether to enrich the existing one.
 * @returns {{ slug: string, rel: string }}
 */
export function createNote(n, cfg, slugs = slugIndex()) {
  const r = render(n, cfg, slugs);
  if (slugs.has(r.slug)) throw new Error(`a note with this name already exists: ${toPosix(relative(ROOT, slugs.get(r.slug)))}`);
  mkdirSync(r.dir, { recursive: true });
  const abs = join(r.dir, `${r.slug}.md`);
  writeJudged(abs, r.text, cfg);
  slugs.set(r.slug, abs);
  return { slug: r.slug, rel: toPosix(relative(ROOT, abs)) };
}

/**
 * Rewrites a note ONLY if it is still a seed (see the post-veto rule above).
 * The caller proves the note is its own; this proves it is still a seed.
 * @returns {{ slug: string, rel: string, updated: boolean, reason?: string }}
 */
export function refreshSeed(slug, n, cfg, slugs = slugIndex()) {
  const abs = slugs.get(slug);
  if (!abs || !existsSync(abs)) return { slug, rel: null, updated: false, reason: "gone" };
  const current = parseFiche(abs, vocab(cfg));
  if (current.fm.status !== "seed") return { slug, rel: toPosix(relative(ROOT, abs)), updated: false, reason: "validated" };
  const r = render({ ...n, slug, type: current.fm.type }, cfg, slugs, { keepCreated: String(current.fm.created) });
  const previous = readFileSync(abs, "utf8");
  if (sameContent(previous, r.text, cfg)) return { slug, rel: toPosix(relative(ROOT, abs)), updated: false, reason: "unchanged" };
  writeJudged(abs, r.text, cfg, previous);
  return { slug, rel: toPosix(relative(ROOT, abs)), updated: true };
}

/**
 * Writes a machine zone of a note: only what is between `<!-- name:auto -->`
 * and `<!-- /name:auto -->`. If the note has no such zone yet, it is added at
 * the end. Nothing else in the file changes, not even its dates.
 * @returns {{ slug: string, rel: string|null, updated: boolean, reason?: string }}
 */
export function writeZone(slug, name, content, cfg, slugs = slugIndex()) {
  if (!/^[a-z][a-z0-9-]*$/.test(String(name))) throw new Error(`"${name}" is not a zone name (lowercase letters, digits, dashes)`);
  const abs = slugs.get(slug);
  if (!abs || !existsSync(abs)) return { slug, rel: null, updated: false, reason: "gone" };
  const rel = toPosix(relative(ROOT, abs));
  const start = `<!-- ${name}:auto -->`;
  const end = `<!-- /${name}:auto -->`;
  // What this brain never writes is refused in a zone as in any other text.
  const tp = textProblem(content, cfg);
  if (tp) throw new Error(tp);
  const zone = `${start}\n${String(content ?? "").replace(/\r\n/g, "\n").trim()}\n${end}`;
  const previous = readFileSync(abs, "utf8");
  const nl = previous.includes("\r\n") ? "\r\n" : "\n";
  const text = previous.replace(/\r\n/g, "\n");
  const i = text.indexOf(start);
  const j = text.indexOf(end);
  if (i >= 0 && j < i) throw new Error(`the zone ${name} of ${rel} has no closing mark: left as it is`);
  const next = i >= 0 ? text.slice(0, i) + zone + text.slice(j + end.length) : `${text.trimEnd()}\n\n${zone}\n`;
  if (next === text) return { slug, rel, updated: false, reason: "unchanged" };
  writeJudged(abs, next.replace(/\n/g, nl), cfg, previous);
  return { slug, rel, updated: true };
}

/**
 * Rewrites a finished object's record ONLY if nobody touched its file since
 * the source wrote it: `lastHash` is the fingerprint the source kept.
 * @returns {{ slug: string, rel: string, updated: boolean, hash?: string, reason?: string }}
 */
export function refreshOwn(slug, n, cfg, slugs, lastHash) {
  const abs = slugs.get(slug);
  if (!abs || !existsSync(abs)) return { slug, rel: null, updated: false, reason: "gone" };
  const rel = toPosix(relative(ROOT, abs));
  if (!lastHash || fileHash(abs) !== lastHash) return { slug, rel, updated: false, reason: "touched" };
  const current = parseFiche(abs, vocab(cfg));
  const r = render({ ...n, slug, type: current.fm.type }, cfg, slugs, { keepCreated: String(current.fm.created) });
  const previous = readFileSync(abs, "utf8");
  if (sameContent(previous, r.text, cfg)) return { slug, rel, updated: false, reason: "unchanged", hash: lastHash };
  writeJudged(abs, r.text, cfg, previous);
  return { slug, rel, updated: true, hash: fileHash(abs) };
}

// THE MACHINE KEEPS THE BRAIN LIVE (P7, the brain's writing rule 7). On any
// note, a validated one included, the machine may ADD a fact that names where
// it comes from. It never removes or rewrites the person's text, never changes
// the meaning of what is their thinking (a decision, a lesson, a concept, an
// idea: there it proposes, in the weekly letter), never validates nor deletes
// a note. The rule lives here, in the code, not only in the instructions.
const THINKING_TYPES = new Set(["concept", "idea", "idee"]);
const THINKING_NATURES = new Set(["decision", "lesson", "lecon"]);

/** Why the machine may not add a fact to this note, or null when it may. */
export function factRefusal(fm) {
  const trusted = fm.status === "trusted";
  if (trusted && THINKING_TYPES.has(fm.type)) return `a validated ${fm.type} is the person's thinking: propose the change in the weekly letter`;
  if (trusted && THINKING_NATURES.has(fm.nature)) return `a validated ${fm.nature} is the person's thinking: propose the change in the weekly letter`;
  if (fm.status === "archived") return "an archived note is history: it takes no new fact";
  return null;
}

/** Nothing of the old text outside the machine zones is gone from the new one. */
export function keepsText(before, after) {
  const outside = (t) => t.replace(/\r\n/g, "\n").replace(/<!-- ([a-z][a-z0-9-]*):auto -->[\s\S]*?<!-- \/\1:auto -->/g, "").split("\n").map((l) => l.trim()).filter(Boolean);
  const kept = new Map();
  for (const l of outside(after)) kept.set(l, (kept.get(l) ?? 0) + 1);
  for (const l of outside(before)) {
    // The date of the last change is the one line the machine rewrites.
    if (/^(updated|touche):/.test(l)) continue;
    const n = kept.get(l) ?? 0;
    if (!n) return false;
    kept.set(l, n - 1);
  }
  return true;
}

/**
 * Adds a fact to a note: one paragraph at the end of its text (before its
 * machine zones), which says where it comes from, and the date of the note's
 * last change set to today. `from` is the address of the origin (a mail, a
 * file...), kept by the journal.
 * @returns {{ slug: string, rel: string }}
 */
export function addFact(slug, text, cfg, slugs = slugIndex()) {
  return addFactChecked(slug, text, cfg, slugs);
}

/**
 * A NEAR TWIN: a paragraph of the note that says nearly the same thing in
 * other words. Seen on 2026-11-08: the judge read the same news in two mail
 * threads twenty minutes apart and wrote it twice on the same note. Measured
 * on the words of four letters or more: if seven words out of ten of THE FACT
 * are in a paragraph of the note, it says nothing new. (Counted on the shorter
 * of the two until 2026-11-21: a short paragraph of the note taken up in a
 * longer fact that brought something new made that fact refused.)
 */
const wordsOf = (x) => new Set(String(x).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
export function nearTwin(fact, noteText) {
  const a = wordsOf(fact);
  if (a.size < 5) return null;
  const body = noteText.replace(/^---[\s\S]*?\n---/, "");
  for (const para of body.split(/\n\s*\n/)) {
    const b = wordsOf(para);
    if (b.size < 5) continue;
    let common = 0;
    for (const w of a) if (b.has(w)) common++;
    if (common / a.size >= 0.7) return para.trim();
  }
  return null;
}

function addFactChecked(slug, text, cfg, slugs) {
  const fact = String(text ?? "").replace(/\s+/g, " ").trim();
  if (fact.length < 12) throw new Error("a fact is a sentence, with where it comes from");
  if (/\[\[|<!--/.test(fact)) throw new Error("a fact is plain text: no machine zone, and links are added as links");
  const tp = textProblem(fact, cfg);
  if (tp) throw new Error(tp);
  const abs = slugs.get(slug);
  if (!abs || !existsSync(abs)) throw new Error(`no note named ${slug}`);
  const current = parseFiche(abs, vocab(cfg));
  const refusal = factRefusal(current.fm);
  if (refusal) throw new Error(refusal);
  const previous = readFileSync(abs, "utf8");
  const nl = previous.includes("\r\n") ? "\r\n" : "\n";
  let t = previous.replace(/\r\n/g, "\n");
  if (t.includes(fact)) throw new Error("this fact is already in the note");
  const twin = nearTwin(fact, t);
  if (twin) throw new Error(`a fact saying nearly the same is already in the note: "${twin.slice(0, 120)}"`);
  // Before the first machine zone, so that the person's text and the facts stay together.
  const z = t.search(/\n<!-- [a-z][a-z0-9-]*:auto -->/);
  const head = z > t.indexOf("\n---", 4) ? t.slice(0, z).trimEnd() : t.trimEnd();
  const tail = z > t.indexOf("\n---", 4) ? t.slice(z) : "\n";
  t = `${head}\n\n${fact}\n${tail.startsWith("\n") ? tail : `\n${tail}`}`;
  const k = vocab(cfg).keys.updated;
  t = t.replace(new RegExp(`^${k}:.*$`, "m"), `${k}: ${today()}`);
  if (!keepsText(previous, t)) throw new Error("this change would remove some of the note's text: refused");
  writeJudged(abs, t.replace(/\n/g, nl), cfg, previous);
  return { slug, rel: toPosix(relative(ROOT, abs)) };
}
