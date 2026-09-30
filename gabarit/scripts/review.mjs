#!/usr/bin/env node
// review.mjs - The weekly look at the brain, written as a report the person
// reads (reviews/YYYY-MM-DD.md). Deterministic: it counts and it lists; the
// thinking (which links to add, what to merge) is Claude's, in the routine
// that runs this script.
//
// PROMOTION. A seed becomes "trusted" when it has taken root: at least two
// weeks old, and linked FROM a note born another day. Only with --apply, and
// never for ideas, whose maturity is the person's call. Every promotion is
// listed in the report: the person can send a note back to seed in one word.
//
//   node scripts/review.mjs [--apply] [--days 7]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, readVault, today, validate } from "./lib.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DAYS = Number(args.includes("--days") ? args[args.indexOf("--days") + 1] : 7);
const ROOT_DAYS = 14;

const dayOffset = (n) => {
  const d = new Date(Date.now() - n * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const since = dayOffset(DAYS);
const rootLimit = dayOffset(ROOT_DAYS);

const cfg = config();
const { fiches, errors: parseErrors } = readVault();
const { errors, warnings } = validate(fiches, cfg);
const bySlug = new Map(fiches.map((f) => [f.slug, f]));
const incoming = new Map();
for (const f of fiches) for (const l of f.links) if (bySlug.has(l)) (incoming.get(l) ?? incoming.set(l, []).get(l)).push(f);

const fresh = fiches.filter((f) => String(f.fm.created) >= since).sort((a, b) => String(b.fm.created).localeCompare(String(a.fm.created)));
const promotable = fiches.filter(
  (f) => f.fm.status === "seed" && f.fm.type !== "idea" && String(f.fm.created) <= rootLimit &&
    (incoming.get(f.slug) ?? []).some((src) => String(src.fm.created) !== String(f.fm.created)),
);
const orphans = fiches.filter((f) => f.fm.status !== "archived" && !f.links.length && !(incoming.get(f.slug) ?? []).length);
const noSource = fiches.filter((f) => !f.fm.source);
const broken = warnings.filter((w) => w.msg.startsWith("link to a note"));

const promoted = [];
if (APPLY && !errors.length && !parseErrors.length) {
  for (const f of promotable) {
    const abs = join(ROOT, f.rel);
    const raw = readFileSync(abs, "utf8");
    const nl = raw.includes("\r\n") ? "\r\n" : "\n";
    const next = raw
      .replace(/^status:\s*seed\s*$/m, "status: trusted")
      .replace(/^updated:\s*\S+\s*$/m, `updated: ${today()}`);
    if (next !== raw) {
      writeFileSync(abs, next.replace(/\r?\n/g, nl), "utf8");
      promoted.push(f);
    }
  }
}

const count = (arr, key) => {
  const o = {};
  for (const f of arr) for (const k of [].concat(key(f))) o[k] = (o[k] ?? 0) + 1;
  return o;
};
const byDomain = count(fiches, (f) => f.fm.domains);
const line = (f) => `- [[${f.slug}]] (${f.fm.type}, ${f.fm.created}) ${f.fm.title}`;
const L = [];
L.push(`# Review of ${cfg.name || "the brain"}, ${today()}`, "");
L.push(`${fiches.length} notes. ${fresh.length} new in the last ${DAYS} days.`, "");
L.push("## Health", "");
L.push(errors.length + parseErrors.length ? `- **${errors.length + parseErrors.length} error(s)**: the index cannot be rebuilt until they are fixed (pnpm lint).` : "- No error.");
L.push(`- ${broken.length} link(s) to a note that does not exist.`, `- ${noSource.length} note(s) without a source.`, `- ${orphans.length} orphan note(s) (no link in or out).`, "");
L.push("## Domains", "", ...cfg.domains.map((d) => `- ${d}: ${byDomain[d] ?? 0}`), "");
L.push(`## New this week (${fresh.length})`, "", ...(fresh.length ? fresh.slice(0, 60).map(line) : ["- Nothing new."]), "");
L.push(APPLY ? `## Promoted to trusted (${promoted.length})` : `## Could be promoted to trusted (${promotable.length})`, "");
L.push(...((APPLY ? promoted : promotable).length ? (APPLY ? promoted : promotable).map(line) : ["- None."]));
if (APPLY && promoted.length) L.push("", "A promotion you disagree with: say so, the note goes back to seed.");
L.push("", `## Orphans (${orphans.length})`, "", ...(orphans.length ? orphans.slice(0, 40).map(line) : ["- None."]));
if (broken.length) L.push("", "## Broken links", "", ...broken.slice(0, 40).map((w) => `- ${w.rel}: ${w.msg}`));
L.push("");

mkdirSync(join(ROOT, "reviews"), { recursive: true });
const out = join(ROOT, "reviews", `${today()}.md`);
writeFileSync(out, L.join("\n"), "utf8");
console.log(`review written: reviews/${today()}.md (${fresh.length} new, ${APPLY ? `${promoted.length} promoted` : `${promotable.length} promotable`}, ${orphans.length} orphans, ${errors.length + parseErrors.length} errors)`);
