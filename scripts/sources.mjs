#!/usr/bin/env node
// sources.mjs - The person's OWN sources: what feeds their brain beyond the
// living sources every brain has (mail and calendar, folders, work with
// Claude). Each person has different ones: their posts in some database, the
// talks of their agenda, a reading list, an export of an app...
//
// A source lives in the brain, in sources/<name>/:
//   source.json     what it is: { name, description, kind, every, type,
//                   domains, updates, enabled, timeoutMin }
//   run.mjs         kind "script": a small program that READS and prints the
//                   notes to create, one JSON per line (the contract is at the
//                   top of the template). It never writes a note itself: the
//                   plugin does, through notes.mjs, with every check.
//   instructions.md kind "claude": what Claude does during the weekly review,
//                   for what needs judgment or a browser.
//   seen.json       which item became which note (never twice the same)
//   state.json      its last success, its last error: a source that failed
//                   for three days catches up by itself from its last success
//
// TRUST. A script that arrives with a clone (a second computer, a restored
// copy) must not run by itself: it runs only once the person approved it ON
// THIS COMPUTER, and a script that changed since is not run again until it is
// approved again. The approvals live in ~/.hyperbrain/config.json, never in
// the brain.
//
//   node scripts/sources.mjs list [--json]
//   node scripts/sources.mjs add <name> --kind script|claude --every day|week --type <type> --domains a,b [--description "..."] [--updates]
//   node scripts/sources.mjs test <name>        run it, check its notes, write nothing
//   node scripts/sources.mjs trust <name>       approve its script on this computer
//   node scripts/sources.mjs run [<name>] [--due]
//   node scripts/sources.mjs mark <name> --ok [--created N] | --error "<what>"   (for "claude" sources)
//   node scripts/sources.mjs enable|disable <name>

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, config, requireBrain, requireRunner, setUserConfig, sha256, today, userConfig } from "./lib.mjs";
import { checkNote, createNote, refreshSeed, slugIndex } from "./notes.mjs";
import { readDirectory, upsert, writeDirectory } from "./directory.mjs";

requireBrain();
const args = process.argv.slice(2);
const [command, name] = args;
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o, null, args.includes("--json") ? 2 : 0));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const DIR = join(ROOT, "sources");
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const cfg = config();

const readJson = (p, d) => {
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return d;
  }
};
const writeJson = (p, o) => writeFileSync(p, `${JSON.stringify(o, null, 2)}\n`, "utf8");
const def = (n) => readJson(join(DIR, n, "source.json"), null);
const state = (n) => readJson(join(DIR, n, "state.json"), {});
const all = () => (existsSync(DIR) ? readdirSync(DIR).filter((n) => def(n)) : []);
const trustKey = (n) => `${ROOT.replace(/\\/g, "/")}::${n}`;
const scriptHash = (n) => (existsSync(join(DIR, n, "run.mjs")) ? sha256(readFileSync(join(DIR, n, "run.mjs"), "utf8").replace(/\r\n/g, "\n")) : null);
const trusted = (n) => scriptHash(n) !== null && userConfig().trustedSources?.[trustKey(n)] === scriptHash(n);

function due(n) {
  const d = def(n);
  const last = state(n).lastSuccess;
  if (!last) return true;
  // An hour of slack: a source run at 21:02 last week is due at 21:00 this week.
  if (d.every === "week") return Date.now() - Date.parse(last) >= 7 * 86400_000 - 3600_000;
  // Daily: not yet succeeded today, in local time.
  const l = new Date(last);
  const localDay = `${l.getFullYear()}-${String(l.getMonth() + 1).padStart(2, "0")}-${String(l.getDate()).padStart(2, "0")}`;
  return localDay < today();
}

/** Runs the script and reads its notes. Nothing is written here. */
function execute(n) {
  const d = def(n);
  const r = spawnSync(process.execPath, [join(DIR, n, "run.mjs")], {
    cwd: join(DIR, n),
    encoding: "utf8",
    windowsHide: true,
    timeout: (d.timeoutMin ?? 5) * 60_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, HYPERBRAIN_BRAIN_DIR: ROOT, HYPERBRAIN_SOURCE_SINCE: state(n).lastSuccess ?? "", HYPERBRAIN_SOURCE_NAME: n },
  });
  const err = String(r.stderr ?? "").split("\n").filter((l) => l.trim() && !/ExperimentalWarning|trace-warnings/.test(l)).slice(-3).join(" | ");
  if (r.error || r.status !== 0) return { ok: false, error: r.error?.code === "ETIMEDOUT" ? `stopped after ${d.timeoutMin ?? 5} min` : `exit ${r.status}${err ? `: ${err}` : ""}`.slice(0, 400) };
  const items = [];
  const bad = [];
  for (const [i, line] of String(r.stdout ?? "").split("\n").entries()) {
    if (!line.trim()) continue;
    try {
      const o = JSON.parse(line);
      if (o.kind === "contact") {
        if (!o.address) throw new Error("a contact needs an address");
      } else if (!o.id || !o.title) throw new Error("each note needs an id and a title");
      items.push(o);
    } catch (e) {
      bad.push(`line ${i + 1}: ${e.message}`);
    }
  }
  return { ok: true, items, bad };
}

/** One note from an item: the source's defaults filled in. */
const noteOf = (n, item) => {
  const d = def(n);
  return {
    title: item.title,
    type: item.type ?? d.type,
    domains: item.domains ?? d.domains,
    body: item.body,
    links: item.links,
    status: item.status ?? "seed",
    visibility: item.visibility,
    source: item.source ?? `source:${n}:${item.id}`,
    created: item.created,
    slug: item.slug,
    fields: item.fields,
  };
};

function runOne(n) {
  const d = def(n);
  const st = state(n);
  const now = new Date().toISOString();
  if (d.kind !== "script") return { name: n, skipped: "done by Claude during the weekly review" };
  if (!trusted(n)) {
    writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastError: "not approved on this computer (sources.mjs trust)" });
    return { name: n, skipped: "not approved on this computer" };
  }
  const x = execute(n);
  if (!x.ok) {
    // A failed run writes nothing: partial output cannot be trusted. The next
    // run starts again from the last success.
    writeJson(join(DIR, n, "state.json"), { ...st, lastRun: now, lastError: x.error });
    return { name: n, ok: false, error: x.error };
  }
  const seen = readJson(join(DIR, n, "seen.json"), {});
  const slugs = slugIndex();
  const res = { name: n, ok: true, created: 0, updated: 0, unchanged: 0, contacts: 0, refused: [...x.bad] };
  // A source may also feed the contacts directory: lines { "kind": "contact", "address", ... }.
  // Its counts are added (a period observed) or, with "contactCounts": "set" in its
  // definition, replace the old ones (a harvest that recounts everything).
  const contactItems = x.items.filter((i) => i.kind === "contact");
  if (contactItems.length) {
    const dir = readDirectory(cfg);
    upsert(dir, contactItems, { counts: d.contactCounts === "set" ? "set" : "add", tiers: d.setsTier === true }, cfg);
    writeDirectory(dir, cfg);
    res.contacts = contactItems.length;
  }
  for (const item of x.items.filter((i) => i.kind !== "contact")) {
    const id = String(item.id);
    try {
      if (seen[id]) {
        if (!d.updates) {
          res.unchanged++;
          continue;
        }
        const u = refreshSeed(seen[id], noteOf(n, item), cfg, slugs);
        if (u.updated) res.updated++;
        else res.unchanged++;
      } else {
        const c = createNote(noteOf(n, item), cfg, slugs);
        seen[id] = c.slug;
        res.created++;
      }
    } catch (e) {
      res.refused.push(`${id}: ${e.message}`);
    }
  }
  writeJson(join(DIR, n, "seen.json"), seen);
  writeJson(join(DIR, n, "state.json"), {
    ...st,
    lastRun: now,
    lastSuccess: now,
    lastError: res.refused.length ? `${res.refused.length} item(s) refused, first: ${res.refused[0]}`.slice(0, 400) : null,
    lastCreated: res.created,
    lastUpdated: res.updated,
  });
  return res;
}

const TEMPLATE_SCRIPT = (n, d) => `// ${n}: ${d.description ?? "a source of this brain"}
//
// THE CONTRACT. This program READS its source and prints, on its standard
// output, ONE JSON OBJECT PER LINE, one per note to create. It writes nothing
// itself: Hyperbrain writes the notes, with every check, and never twice the
// same (the "id").
//
//   { "id": "a stable identifier of the item (an url, a database id...)",
//     "title": "...", "body": "...",
//     "type": "(optional, default ${d.type})", "domains": ["(optional, default ${(d.domains ?? []).join(", ")})"],
//     "created": "YYYY-MM-DD (optional: the date of the item itself)",
//     "source": "(optional: where to check it, default source:${n}:<id>)",
//     "links": ["(optional) slugs of existing notes"],
//     "fields": { "(optional) extra fields": "kept in the note" } }
//
// It may also feed the contacts directory, one line per person:
//   { "kind": "contact", "address": "...", "name": "...", "sent": 3, "received": 2,
//     "first": "YYYY-MM-DD", "last": "YYYY-MM-DD", "subjects": ["..."] }
// and, only if source.json says "setsTier": true, "tier": 0, 1 or 2 (kept as a
// floor under the brain's own rules; 0 removes it).
//
// What it receives: HYPERBRAIN_SOURCE_SINCE (the date of its last success, empty
// the first time: read only what is newer), HYPERBRAIN_BRAIN_DIR, and it runs
// in its own folder. A key it needs goes in the brain's .env, never here.
// Anything printed on the error output is kept as its error; exit with a
// non-zero code when something went wrong: nothing will be written.

const since = process.env.HYPERBRAIN_SOURCE_SINCE || "";

// ... read the source here, then for each new item:
// console.log(JSON.stringify({ id, title, body }));
`;

const TEMPLATE_CLAUDE = (n, d) => `# ${n}

${d.description ?? ""}

What Claude does for this source during the weekly review, in the brain's language: where to look, what deserves a note, which type and domain, what to never take. Written with the person.

1. ...

Every note goes through the capture skill, as a seed, with \`--source "source:${n}:<identifier>"\`, and is searched first: never twice the same.
`;

if (command === "list") {
  const rows = all().map((n) => {
    const d = def(n);
    const st = state(n);
    return { name: n, kind: d.kind, every: d.every, type: d.type, enabled: d.enabled !== false, trusted: d.kind === "script" ? trusted(n) : null, due: d.enabled !== false && due(n), lastSuccess: st.lastSuccess ?? null, lastError: st.lastError ?? null, notes: Object.keys(readJson(join(DIR, n, "seen.json"), {})).length, description: d.description ?? "" };
  });
  if (args.includes("--json")) out({ ok: true, sources: rows });
  else if (!rows.length) console.log("no source of its own yet");
  else for (const s of rows) console.log(`  ${s.enabled ? "on " : "off"}  ${s.name} (${s.kind}, every ${s.every})${s.trusted === false ? " NOT APPROVED HERE" : ""}  ${s.notes} note(s), last success ${s.lastSuccess?.slice(0, 10) ?? "never"}${s.lastError ? `, error: ${s.lastError}` : ""}`);
} else if (command === "add") {
  if (!name || !SLUG.test(name)) fail("the name of a source: lowercase words without accents, joined by dashes");
  if (existsSync(join(DIR, name))) fail(`the source "${name}" already exists`);
  const kind = opt("--kind");
  const every = opt("--every") ?? "week";
  const type = opt("--type");
  const domains = String(opt("--domains") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!["script", "claude"].includes(kind)) fail("--kind script (it reads by itself) or claude (Claude does it during the review)");
  if (!["day", "week"].includes(every)) fail("--every day or week");
  if (!cfg.types[type]) fail(`--type must be one of this brain's types: ${Object.keys(cfg.types).join(", ")}`);
  if (!domains.length || domains.some((x) => !cfg.domains.includes(x))) fail(`--domains among this brain's domains: ${cfg.domains.join(", ")}`);
  const d = { name, description: opt("--description") ?? "", kind, every, type, domains, updates: args.includes("--updates"), enabled: true, timeoutMin: 5 };
  mkdirSync(join(DIR, name), { recursive: true });
  writeJson(join(DIR, name, "source.json"), d);
  if (kind === "script") writeFileSync(join(DIR, name, "run.mjs"), TEMPLATE_SCRIPT(name, d), "utf8");
  else writeFileSync(join(DIR, name, "instructions.md"), TEMPLATE_CLAUDE(name, d), "utf8");
  out({ ok: true, name, kind, folder: join(DIR, name).replace(/\\/g, "/"), file: kind === "script" ? "run.mjs" : "instructions.md" });
} else if (command === "test") {
  if (!def(name)) fail(`no source named "${name}"`);
  if (def(name).kind !== "script") fail("a source done by Claude is tested by doing it once, together");
  const x = execute(name);
  if (!x.ok) fail(x.error);
  const seen = readJson(join(DIR, name, "seen.json"), {});
  const slugs = slugIndex();
  const checked = x.items.filter((i) => i.kind !== "contact").map((item) => {
    try {
      const c = checkNote(noteOf(name, item), cfg, slugs);
      return { id: item.id, title: item.title, ...c, already: Boolean(seen[String(item.id)]) };
    } catch (e) {
      return { id: item.id, title: item.title, refused: e.message };
    }
  });
  out({
    ok: true,
    items: x.items.length,
    contacts: x.items.filter((i) => i.kind === "contact").length,
    new: checked.filter((c) => !c.refused && !c.already).length,
    refused: [...x.bad, ...checked.filter((c) => c.refused).map((c) => `${c.id}: ${c.refused}`)],
    sample: x.items.slice(0, 3).map((i) => ({ id: i.id, title: i.title, type: i.type ?? def(name).type, body: String(i.body ?? "").slice(0, 300) })),
  });
} else if (command === "trust") {
  if (!def(name) || def(name).kind !== "script") fail(`no script source named "${name}"`);
  setUserConfig({ trustedSources: { ...(userConfig().trustedSources ?? {}), [trustKey(name)]: scriptHash(name) } });
  out({ ok: true, name, trusted: true });
} else if (command === "run") {
  // Running a source writes notes and state: the runner's work.
  requireRunner(cfg);
  const names = name && !name.startsWith("--") ? [name] : all().filter((n) => def(n).enabled !== false && def(n).kind === "script" && (!args.includes("--due") || due(n)));
  if (name && !name.startsWith("--") && !def(name)) fail(`no source named "${name}"`);
  out({ ok: true, runs: names.map(runOne) });
} else if (command === "mark") {
  if (!def(name)) fail(`no source named "${name}"`);
  const st = state(name);
  const now = new Date().toISOString();
  if (args.includes("--ok")) writeJson(join(DIR, name, "state.json"), { ...st, lastRun: now, lastSuccess: now, lastError: null, lastCreated: Number(opt("--created") ?? 0) });
  else writeJson(join(DIR, name, "state.json"), { ...st, lastRun: now, lastError: String(opt("--error") ?? "failed").slice(0, 400) });
  out({ ok: true, name });
} else if (command === "enable" || command === "disable") {
  if (!def(name)) fail(`no source named "${name}"`);
  writeJson(join(DIR, name, "source.json"), { ...def(name), enabled: command === "enable" });
  out({ ok: true, name, enabled: command === "enable" });
} else {
  console.log("usage: sources.mjs list | add | test | trust | run | mark | enable | disable (see the top of scripts/sources.mjs)");
  process.exitCode = 2;
}
