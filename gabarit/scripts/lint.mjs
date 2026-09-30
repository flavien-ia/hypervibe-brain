#!/usr/bin/env node
// lint.mjs - Checks the whole vault without building anything. Exit 1 on an
// error: it is what the commit hook runs, so a broken note never enters git.
//
//   node scripts/lint.mjs [--quiet] [--json]

import { config, readVault, validate } from "./lib.mjs";

const args = process.argv.slice(2);
const { fiches, errors: parseErrors } = readVault();
const { errors, warnings } = validate(fiches, config());
const all = [...parseErrors, ...errors];

if (args.includes("--json")) console.log(JSON.stringify({ notes: fiches.length, errors: all, warnings }, null, 2));
else {
  for (const e of all) console.log(`  ERROR    ${e.rel}: ${e.msg}`);
  if (!args.includes("--quiet")) for (const w of warnings) console.log(`  warning  ${w.rel}: ${w.msg}`);
  console.log(`${fiches.length} note(s), ${all.length} error(s), ${warnings.length} warning(s)`);
}
process.exitCode = all.length ? 1 : 0;
