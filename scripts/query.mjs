#!/usr/bin/env node
// query.mjs - Ask the brain from the command line.
//
//   query.mjs search "several words"          every word, anywhere, accents ignored
//   query.mjs search --meaning "an idea"      by meaning (needs an embeddings key)
//   query.mjs get <slug>                      one note, its links and backlinks
//   query.mjs neighbors <slug>                what surrounds a note
//   query.mjs timeline [--since 2026-09]      in the order of time
//   query.mjs stats                           the state of the brain
//   options: --json, --limit N, --type T, --domain D, --local (shows private notes: this computer only)

import { freshDb, get, neighbors, search, stats, timeline } from "./engine.mjs";
import { requireBrain } from "./lib.mjs";

requireBrain();

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const valued = new Set(["--limit", "--type", "--domain", "--since", "--until", "--brain"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const [command, ...rest] = positional;
const text = rest.join(" ");

const { db, warning } = await freshDb();
if (warning) console.error(`warning: ${warning}`);
const json = (x) => console.log(JSON.stringify(x, null, 2));
const limit = opt("--limit") ? Number(opt("--limit")) : undefined;

try {
  if (command === "search") {
    const r = await search(db, text, { semantic: flag("--meaning") || flag("--semantic"), limit, type: opt("--type"), domain: opt("--domain"), includePrivate: flag("--local") });
    if (flag("--json")) json(r);
    else {
      console.log(`\n${r.length} result(s) for "${text}"\n`);
      for (const x of r) console.log(`  ${x.score !== undefined ? `${x.score.toFixed(3)}  ` : ""}${x.slug}  [${x.type}]  ${x.title}\n      ${x.excerpt}`);
    }
  } else if (command === "get") {
    const r = get(db, text, { includePrivate: flag("--local") });
    if (!r) throw new Error(`no note named "${text}" (search for it first)`);
    if (flag("--json")) json(r);
    else {
      console.log(`\n${r.title}  [${r.type}]\n${r.domains.join(", ")} | ${r.status} | ${r.visibility} | created ${r.created}\nsource: ${r.source || "(none)"}\nfile: ${r.file}\n\n${r.body}\n`);
      if (r.links.length) console.log(`links: ${r.links.map((l) => l.slug + (l.missing ? " (missing)" : "")).join(", ")}`);
      if (r.backlinks.length) console.log(`linked from: ${r.backlinks.map((l) => l.slug).join(", ")}`);
    }
  } else if (command === "neighbors") {
    const r = neighbors(db, text, { limit });
    if (!r) throw new Error(`no note named "${text}"`);
    json(r);
  } else if (command === "timeline") {
    const r = timeline(db, { since: opt("--since"), until: opt("--until"), limit, type: opt("--type") });
    if (flag("--json")) json(r);
    else for (const x of r) console.log(`  ${x.created}  ${x.slug}  [${x.type}, ${x.status}]  ${x.title}`);
  } else if (command === "stats") json(stats(db));
  else {
    console.log("usage: query.mjs search|get|neighbors|timeline|stats ...   (see the top of scripts/query.mjs)");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
