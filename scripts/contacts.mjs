#!/usr/bin/env node
// contacts.mjs - The contacts directory from the command line.
//
//   node scripts/contacts.mjs search "<words>" [--json] [--limit N]
//   node scripts/contacts.mjs list [--tier 2|1|0] [--limit N] [--json]   the contacts of one tier, the most
//        written to first (default: tier 2, the core, 100 at most): who to show when asking who deserves a note
//   node scripts/contacts.mjs months [--back N]          the months of the first fill, and which are in
//        (--back N decides the period: this month and the N before it)
//   node scripts/contacts.mjs upsert [--set-counts] [--month YYYY-MM]   JSON lines on stdin, one contact each:
//        { "address", "name", "sent", "received", "first", "last", "subjects", "summary", "context", "themes", ... }
//        (by default the counts are ADDED: a week observed; --set-counts replaces them: a full recount)
//        (--month: these lines are that month of the first fill; a month already in is refused,
//         its messages would be counted twice)
//   node scripts/contacts.mjs promote <address> --domains a,b [--type <person type>]
//        makes a contact a note, by the person's decision; the entry points to it
//   node scripts/contacts.mjs stats [--json]
//   node scripts/contacts.mjs enable|disable [--core N] [--matters N]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, requireBrain, requireRunner } from "./lib.mjs";
import { directoryPath, readDirectory, rules, searchDirectory, upsert, writeDirectory } from "./directory.mjs";
import { createNote } from "./notes.mjs";

requireBrain();
const args = process.argv.slice(2);
const [command, arg] = args;
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const cfg = config();

// THE FIRST FILL, MONTH BY MONTH (2026-11-17). Read in one go, three months of
// mail were "done" when the model had had enough, and nothing said what was
// left. The period is decided once (months --back N), each month is brought in
// and recorded (upsert --month), and the fill is over when no month is left.
// Kept with the directory itself, beside its contacts.
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const monthsBetween = (from, to) => {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= to && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
};
/** The months of the first fill, the most recent first, each with whether it is in. */
const fillOf = (dir) => {
  const fill = dir.extra?.fill;
  const covered = new Set(dir.extra?.covered ?? []);
  if (!fill || !MONTH.test(fill.from ?? "") || !MONTH.test(fill.to ?? "")) return { decided: false, months: [], left: 0, covered: [...covered].sort() };
  const months = monthsBetween(fill.from, fill.to).reverse().map((month) => ({ month, in: covered.has(month) }));
  return { decided: true, from: fill.from, to: fill.to, months, left: months.filter((x) => !x.in).length, next: months.find((x) => !x.in)?.month ?? null };
};

if (command === "search") {
  const found = searchDirectory(readDirectory(cfg), args.filter((a, i) => i > 0 && !a.startsWith("--") && args[i - 1] !== "--limit").join(" "), { limit: Number(opt("--limit") ?? 20) });
  if (args.includes("--json")) out({ ok: true, found });
  else for (const c of found) console.log(`  [${c.tier}] ${c.name ?? "?"} <${c.address}>  ${c.sent ?? 0} sent / ${c.received ?? 0} received, ${c.first ?? "?"} to ${c.last ?? "?"}${c.note ? `  note: ${c.note}` : ""}${c.summary ? `\n      ${c.summary}` : ""}`);
} else if (command === "list") {
  // THE CONTACTS OF ONE TIER (2026-11-21). The skill is told to show "the
  // core" before asking who deserves a note, and no command gave it: `stats`
  // has totals only, and a search without a word finds nobody.
  const tier = Number(opt("--tier") ?? 2);
  if (![0, 1, 2].includes(tier)) fail("--tier 2 (the core), 1 (who matters) or 0 (everyone else)");
  const asked = Math.floor(Number(opt("--limit")));
  const limit = Number.isFinite(asked) && asked >= 1 ? asked : 100;
  const all = readDirectory(cfg).contacts.filter((c) => (c.tier ?? 0) === tier).sort((a, b) => Number(b.sent ?? 0) - Number(a.sent ?? 0) || Number(b.received ?? 0) - Number(a.received ?? 0));
  const shown = all.slice(0, limit);
  if (args.includes("--json")) out({ ok: true, tier, total: all.length, shown: shown.length, contacts: shown.map((c) => ({ name: c.name, address: c.address, sent: c.sent ?? 0, received: c.received ?? 0, first: c.first, last: c.last, note: c.note, summary: c.summary })) });
  else {
    console.log(`  tier ${tier}: ${all.length} contact${all.length === 1 ? "" : "s"}${all.length > shown.length ? ` (the ${shown.length} most written to are shown: --limit N for more)` : ""}`);
    for (const c of shown) console.log(`  ${c.name ?? "?"} <${c.address}>  ${c.sent ?? 0} sent / ${c.received ?? 0} received, ${c.first ?? "?"} to ${c.last ?? "?"}${c.note ? `  note: ${c.note}` : ""}${c.summary ? `\n      ${c.summary}` : ""}`);
  }
} else if (command === "upsert") {
  // The directory is computed on the runner only.
  requireRunner(cfg);
  const items = [];
  for (const line of readFileSync(0, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      items.push(JSON.parse(line));
    } catch {
      // an unreadable line is skipped, and counted
    }
  }
  const dir = readDirectory(cfg);
  const month = opt("--month");
  if (month !== undefined) {
    if (!MONTH.test(month)) fail("--month YYYY-MM: the month of the first fill these lines are");
    if ((dir.extra?.covered ?? []).includes(month) && !args.includes("--set-counts")) fail(`the month ${month} is already in the directory: its messages would be counted twice (contacts.mjs months says what is left)`);
  }
  const r = upsert(dir, items, { counts: args.includes("--set-counts") ? "set" : "add" }, cfg);
  if (month !== undefined) dir.extra = { ...dir.extra, covered: [...new Set([...(dir.extra?.covered ?? []), month])].sort() };
  writeDirectory(dir, cfg);
  out({ ok: true, ...r, total: dir.contacts.length, ...(month !== undefined ? { month, fill: fillOf(dir) } : {}) });
} else if (command === "months") {
  const dir = readDirectory(cfg);
  if (opt("--back") !== undefined) {
    requireRunner(cfg);
    const back = Math.min(24, Math.max(0, Number(opt("--back")) || 0));
    const now = new Date();
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const start = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const from = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
    // A period decided again only ever grows backwards: what is in stays in.
    const before = dir.extra?.fill;
    dir.extra = { ...dir.extra, fill: { from: before && MONTH.test(before.from ?? "") && before.from < from ? before.from : from, to } };
    writeDirectory(dir, cfg);
  }
  out({ ok: true, ...fillOf(dir) });
} else if (command === "promote") {
  const dir = readDirectory(cfg);
  const c = dir.contacts.find((x) => String(x.address).toLowerCase() === String(arg ?? "").toLowerCase());
  if (!c) fail(`no contact ${arg} in the directory`);
  if (c.note) fail(`this contact already has a note: ${c.note}`);
  // The person type: given, or the brain's own (person, personne...).
  const type = opt("--type") ?? cfg.contacts?.personType ?? ["person", "personne", "people", "personnes"].find((t) => cfg.types[t]);
  if (!type || !cfg.types[type]) fail(`which of this brain's types holds people? (--type; its types: ${Object.keys(cfg.types).join(", ")})`);
  const body = [c.context ?? c.summary ?? "", c.themes?.length ? `\n\n${c.themes.join(", ")}` : ""].join("").trim() || c.name;
  try {
    // The address stays in the source only: never in a note's text.
    const note = createNote({ title: c.name ?? c.address, type, domains: String(opt("--domains") ?? "").split(",").filter(Boolean), body, source: `contact:${c.address}` }, cfg);
    c.note = note.slug;
    upsert(dir, [], {}, cfg);
    writeDirectory(dir, cfg);
    out({ ok: true, note: note.rel });
  } catch (e) {
    fail(e.message);
  }
} else if (command === "stats") {
  const dir = readDirectory(cfg);
  const byTier = {};
  for (const c of dir.contacts) byTier[c.tier ?? 0] = (byTier[c.tier ?? 0] ?? 0) + 1;
  out({ ok: true, enabled: cfg.contacts?.enabled === true, file: directoryPath(cfg).replace(/\\/g, "/"), total: dir.contacts.length, byTier, withNote: dir.contacts.filter((c) => c.note).length, generated: dir.generated, rules: rules(cfg), fill: fillOf(dir) });
} else if (command === "enable" || command === "disable") {
  const file = join(ROOT, "brain.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.contacts = { ...(raw.contacts ?? {}), enabled: command === "enable" };
  if (opt("--core")) raw.contacts.core = Number(opt("--core"));
  if (opt("--matters")) raw.contacts.matters = Number(opt("--matters"));
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  out({ ok: true, contacts: raw.contacts });
} else {
  console.log("usage: contacts.mjs search | list | months | upsert | promote | stats | enable | disable (see the top of scripts/contacts.mjs)");
  process.exitCode = 2;
}
