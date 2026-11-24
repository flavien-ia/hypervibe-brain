#!/usr/bin/env node
// query.mjs - Ask the brain from the command line.
//
//   query.mjs search "a question"            by words and by meaning, fused (meaning needs an embeddings key)
//   query.mjs search --words "exact name"    by words only: every word, anywhere, accents ignored
//   query.mjs search --meaning "an idea"      by meaning only
//   query.mjs search ... --everything         also the folders hidden from search (search.hidden in brain.json)
//   query.mjs get <slug>                      one note, its links and backlinks
//   query.mjs neighbors <slug>                what surrounds a note
//   query.mjs timeline [--since 2026-09] [--until 2026-10]   in the order of time
//   query.mjs stats                           the state of the brain
//   query.mjs fetch <address>                 the data at an address (scheme://path), read where it lives
//   options: --json, --limit N, --type T, --domain D, --nature N
//   (--local, of before, is accepted and changes nothing: every note is read, a private one too)

import { filterProblem, freshDb, get, neighbors, search, stats, timeline } from "./engine.mjs";
import { fetchAddress } from "./fetch.mjs";
import { requireBrain } from "./lib.mjs";

requireBrain();

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const valued = new Set(["--limit", "--type", "--domain", "--nature", "--since", "--until", "--brain"]);
const positional = args.filter((a, i) => !a.startsWith("--") && !valued.has(args[i - 1]));
const [command, ...rest] = positional;
const text = rest.join(" ");

const { db, warning } = await freshDb();
if (warning) console.error(`warning: ${warning}`);
const json = (x) => console.log(JSON.stringify(x, null, 2));
const limit = opt("--limit") ? Number(opt("--limit")) : undefined;

try {
  if (command === "search") {
    // A filter this brain does not have: say which it has, rather than "0 result".
    const problem = filterProblem(db, { type: opt("--type"), domain: opt("--domain"), nature: opt("--nature") });
    if (problem) throw new Error(problem.error);
    const r = await search(db, text, { by: flag("--words") ? "words" : flag("--meaning") || flag("--semantic") ? "meaning" : "both", limit, type: opt("--type"), domain: opt("--domain"), nature: opt("--nature"), everything: flag("--everything") });
    if (flag("--json")) json(r);
    else {
      console.log(`\n${r.length} result(s) for "${text}"\n`);
      for (const x of r) console.log(`  ${x.score !== undefined ? `${x.score.toFixed(3)}  ` : ""}${x.slug}  [${x.type}]  ${x.title}\n      ${x.excerpt}`);
    }
  } else if (command === "get") {
    const r = get(db, text, { everything: flag("--everything") });
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
  else if (command === "fetch") json(await fetchAddress(text));
  else {
    console.log("usage: query.mjs search|get|neighbors|timeline|stats|fetch ...   (see the top of scripts/query.mjs)");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  db.close();
}
