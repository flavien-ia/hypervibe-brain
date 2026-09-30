#!/usr/bin/env node
// capture.mjs - Writes ONE new note into the vault, classified, and commits it.
//
// It creates, it never modifies: a note that already exists is refused (the
// person decides whether to enrich it, and Claude then edits the file in
// front of them). That is the "post-veto" rule: the machine creates freely,
// in status "seed" by default, and never touches a validated note alone.
//
//   echo "the body" | node scripts/capture.mjs --title "A short title" --type idea \
//       --domains work,writing [--links slug-a,slug-b] [--source "where it comes from"] \
//       [--status seed|trusted] [--visibility internal|public|private] [--no-commit]
//
// The body comes from stdin (or --body-file). Prints the created path.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { ROOT, STATUSES, VISIBILITIES, VAULT, config, listFiches, parseFiche, requireBrain, slugify, toPosix, today, validate, vocab } from "./lib.mjs";
import { commitPaths, isRepo, pushIfAgreed } from "./git.mjs";
import { brainLang, t } from "./i18n.mjs";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const list = (v) => (v ? String(v).split(",").map((s) => s.trim()).filter(Boolean) : []);
const fail = (msg) => {
  console.error(`refused: ${msg}`);
  process.exit(1);
};

requireBrain();
const cfg = config();
const voc = vocab(cfg);
const TYPES = cfg.types;
// A status or a visibility may be given in the brain's words (graine, prive)
// or in the canonical ones (seed, private): both are understood.
const understand = (map, v) => Object.entries(map).find(([canon, word]) => v === canon || v === word)?.[0] ?? v;
const title = opt("--title");
const type = opt("--type");
const domains = list(opt("--domains"));
const links = list(opt("--links"));
const status = understand(voc.status, opt("--status", "seed"));
const visibility = understand(voc.visibility, opt("--visibility", "internal"));
const source = opt("--source", `claude://chat/${today()}`);

if (!title) fail("--title is required");
if (!TYPES[type]) fail(`--type must be one of this brain's types: ${Object.keys(TYPES).join(", ")}`);
if (!domains.length) fail(`--domains is required (this brain's domains: ${cfg.domains.join(", ")})`);
for (const d of domains) if (!cfg.domains.includes(d)) fail(`"${d}" is not a domain of this brain (${cfg.domains.join(", ")})`);
if (!STATUSES.includes(status)) fail(`--status must be one of ${Object.values(voc.status).join(", ")}`);
if (!VISIBILITIES.includes(visibility)) fail(`--visibility must be one of ${Object.values(voc.visibility).join(", ")}`);

let body = opt("--body-file") ? readFileSync(opt("--body-file"), "utf8") : readFileSync(0, "utf8");
body = body.replace(/\r\n/g, "\n").trim();
if (!body) fail("the body is empty (it comes from stdin)");

const slug = slugify(opt("--slug") ?? title);
const existing = listFiches().find((f) => f.replace(/\\/g, "/").endsWith(`/${slug}.md`));
if (existing) fail(`a note with this name already exists: ${toPosix(relative(ROOT, existing))}. Enrich it with the person's agreement, or choose another title.`);

const missing = links.filter((l) => !listFiches().some((f) => f.replace(/\\/g, "/").endsWith(`/${l}.md`)));
if (missing.length) fail(`these links point to no note: ${missing.join(", ")}`);

const q = (s) => JSON.stringify(String(s));
// Written in the brain's own words.
const k = voc.keys;
const text = [
  "---",
  `${k.type}: ${type}`,
  `${k.title}: ${q(title)}`,
  `${k.domains}: [${domains.join(", ")}]`,
  `${k.status}: ${voc.status[status]}`,
  `${k.visibility}: ${voc.visibility[visibility]}`,
  `${k.created}: ${today()}`,
  `${k.updated}: ${today()}`,
  `${k.source}: ${q(source)}`,
  "---",
  "",
  body,
  ...(links.length && !links.every((l) => body.includes(`[[${l}]]`)) ? ["", links.filter((l) => !body.includes(`[[${l}]]`)).map((l) => `[[${l}]]`).join(" ")] : []),
  "",
].join("\n");

const dir = join(VAULT, TYPES[type]);
mkdirSync(dir, { recursive: true });
const abs = join(dir, `${slug}.md`);
writeFileSync(abs, text, "utf8");

// Same judge as the build and the commit hook, on the note just written.
const { errors } = validate([parseFiche(abs)], cfg);
if (errors.length) {
  // Left on disk would break the next build: better not to exist at all.
  (await import("node:fs")).unlinkSync(abs);
  fail(errors.map((e) => e.msg).join("; "));
}

const rel = toPosix(relative(ROOT, abs));
console.log(`created: ${rel}`);
if (!args.includes("--no-commit") && isRepo()) {
  const c = commitPaths([rel], t(brainLang(ROOT)).commitCapture(title));
  if (!c.ok) console.log(`not committed (${c.err.split("\n")[0].slice(0, 160)}): the note is safe on disk, the next save will commit it`);
  else {
    const p = pushIfAgreed();
    console.log(p.pushed ? "committed and pushed" : `committed (${p.reason})`);
  }
}
// No build here: the next question to the brain rebuilds its index by itself.
