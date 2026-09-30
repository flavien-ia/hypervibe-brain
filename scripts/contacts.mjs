#!/usr/bin/env node
// contacts.mjs - The contacts directory from the command line.
//
//   node scripts/contacts.mjs search "<words>" [--json] [--limit N]
//   node scripts/contacts.mjs upsert [--set-counts]      JSON lines on stdin, one contact each:
//        { "address", "name", "sent", "received", "first", "last", "subjects", "summary", "context", "themes", ... }
//        (by default the counts are ADDED: a week observed; --set-counts replaces them: a full recount)
//   node scripts/contacts.mjs promote <address> --domains a,b [--type <person type>]
//        makes a contact a note, by the person's decision; the entry points to it
//   node scripts/contacts.mjs stats [--json]
//   node scripts/contacts.mjs enable|disable [--core N] [--matters N]

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, requireBrain } from "./lib.mjs";
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

if (command === "search") {
  const found = searchDirectory(readDirectory(cfg), args.filter((a, i) => i > 0 && !a.startsWith("--") && args[i - 1] !== "--limit").join(" "), { limit: Number(opt("--limit") ?? 20) });
  if (args.includes("--json")) out({ ok: true, found });
  else for (const c of found) console.log(`  [${c.tier}] ${c.name ?? "?"} <${c.address}>  ${c.sent ?? 0} sent / ${c.received ?? 0} received, ${c.first ?? "?"} to ${c.last ?? "?"}${c.note ? `  note: ${c.note}` : ""}${c.summary ? `\n      ${c.summary}` : ""}`);
} else if (command === "upsert") {
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
  const r = upsert(dir, items, { counts: args.includes("--set-counts") ? "set" : "add" }, cfg);
  writeDirectory(dir, cfg);
  out({ ok: true, ...r, total: dir.contacts.length });
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
  out({ ok: true, enabled: cfg.contacts?.enabled === true, file: directoryPath(cfg).replace(/\\/g, "/"), total: dir.contacts.length, byTier, withNote: dir.contacts.filter((c) => c.note).length, generated: dir.generated, rules: rules(cfg) });
} else if (command === "enable" || command === "disable") {
  const file = join(ROOT, "hyperbrain.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.contacts = { ...(raw.contacts ?? {}), enabled: command === "enable" };
  if (opt("--core")) raw.contacts.core = Number(opt("--core"));
  if (opt("--matters")) raw.contacts.matters = Number(opt("--matters"));
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  out({ ok: true, contacts: raw.contacts });
} else {
  console.log("usage: contacts.mjs search | upsert | promote | stats | enable | disable (see the top of scripts/contacts.mjs)");
  process.exitCode = 2;
}
