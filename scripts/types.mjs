#!/usr/bin/env node
// types.mjs - The types of notes of THIS brain, and the folder of each (the
// folder IS the type). Chosen with the person at the creation, from what
// their computer shows; a type can be added later, when a new kind of thing
// enters their life or a new source brings one.
//
//   node scripts/types.mjs list [--json]
//   node scripts/types.mjs add <type> [<folder>]
//
// A type is never renamed nor removed here: its notes would have to move, and
// that is a decision to take with the person, note by note.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, requireBrain } from "./lib.mjs";

requireBrain();
const args = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const [command, type, folderArg] = args;
const cfg = config();

if (command === "add") {
  const folder = folderArg ?? `${type}s`;
  if (!type || !SLUG.test(type) || !SLUG.test(folder)) {
    out({ ok: false, error: "a type and its folder are lowercase words without accents, joined by dashes" });
    process.exit(1);
  }
  if (cfg.types[type]) {
    out({ ok: false, error: `the type "${type}" already exists (folder ${cfg.types[type]})` });
    process.exit(1);
  }
  if (Object.values(cfg.types).includes(folder)) {
    out({ ok: false, error: `the folder "${folder}" already belongs to another type` });
    process.exit(1);
  }
  // Written in the file itself, with the default types made explicit.
  const file = join(ROOT, "brain.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.types = { ...cfg.types, [type]: folder };
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  mkdirSync(join(ROOT, "vault", folder), { recursive: true });
  out({ ok: true, type, folder, types: raw.types });
} else if (command === "list") {
  if (args.includes("--json")) out({ ok: true, format: cfg.format, types: cfg.types, neverPromoted: cfg.neverPromoted });
  else for (const [t, f] of Object.entries(cfg.types)) console.log(`  ${t}  (vault/${f}/)`);
} else {
  console.log("usage: types.mjs list | add <type> [<folder>]");
  process.exitCode = 2;
}
