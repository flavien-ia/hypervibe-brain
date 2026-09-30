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

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, STATUSES, VAULT, VISIBILITIES, listFiches, parseFiche, slugify, toPosix, today, validate, vocab } from "./lib.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const q = (s) => JSON.stringify(String(s));
const understand = (map, v) => Object.entries(map).find(([canon, word]) => v === canon || v === word)?.[0] ?? v;

/** The paths of the vault's notes, by slug: built once per batch. */
export function slugIndex() {
  const m = new Map();
  for (const f of listFiches()) m.set(f.replace(/\\/g, "/").split("/").pop().slice(0, -3), f);
  return m;
}

/** A value of an extra field, written the way the frontmatter reader reads it back. */
function fieldValue(v) {
  if (Array.isArray(v)) return `[${v.map((x) => (/^[\w-]+$/.test(String(x)) ? String(x) : q(x))).join(", ")}]`;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
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
  if (!body) throw new Error("the body is empty");
  const created = keepCreated ?? (n.created && DATE.test(String(n.created)) ? String(n.created) : today());
  const missing = links.filter((l) => !slugs.has(l));
  if (missing.length) throw new Error(`these links point to no note: ${missing.join(", ")}`);

  const reserved = new Set(Object.values(k));
  const extra = Object.entries(n.fields ?? {}).filter(([key, v]) => /^[A-Za-z_][\w-]*$/.test(key) && !reserved.has(key) && v !== undefined && v !== null && v !== "");
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
    ...extra.map(([key, v]) => `${key}: ${fieldValue(v)}`),
    "---",
    "",
    body,
    ...(links.length && !links.every((l) => body.includes(`[[${l}]]`)) ? ["", links.filter((l) => !body.includes(`[[${l}]]`)).map((l) => `[[${l}]]`).join(" ")] : []),
    "",
  ].join("\n");
  return { slug: slugify(n.slug ?? n.title), dir: join(VAULT, cfg.types[type]), text };
}

/** Checks a note without writing anything: what a source's test shows. */
export function checkNote(n, cfg, slugs = slugIndex()) {
  const r = render(n, cfg, slugs);
  return { slug: r.slug, folder: cfg.types[n.type], taken: slugs.has(r.slug) };
}

/** Writes, then judges with the same judge as the build: a note that fails it does not stay. */
function writeJudged(abs, text, cfg, previous) {
  writeFileSync(abs, text, "utf8");
  const { errors } = validate([parseFiche(abs, vocab(cfg))], cfg);
  if (errors.length) {
    if (previous === undefined) unlinkSync(abs);
    else writeFileSync(abs, previous, "utf8");
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
  if (previous.replace(/\r\n/g, "\n").replace(/^(touche|updated): .*$/m, "") === r.text.replace(/^(touche|updated): .*$/m, "")) {
    return { slug, rel: toPosix(relative(ROOT, abs)), updated: false, reason: "unchanged" };
  }
  writeJudged(abs, r.text, cfg, previous);
  return { slug, rel: toPosix(relative(ROOT, abs)), updated: true };
}
