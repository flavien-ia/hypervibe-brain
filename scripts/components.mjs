#!/usr/bin/env node
// components.mjs - What feeds this brain (its SOURCES) and what it does beyond
// its notes (its MODULES), as the person chose them. Kept in hyperbrain.json.
//
// SOURCES, the heart of the brain: what builds and enriches it, week after week.
//   mail       the week's mail and calendar, read through the person's own
//              Claude connectors (Gmail, Google Calendar, Outlook...): new
//              people, meetings, decisions
//   journal    the work done with Claude: which projects, and their commits
//   watch      folders whose new and changed files are looked at every week
// (The person's existing writings are sources too, but they come in once,
// through /hyperbrain:brain-ingest, and are listed in SOURCES.md.)
//
// MODULES, added by the add-* skills:
//   backup     an online, private copy on GitHub (the brain's git remote)
//   coldCopy   a weekly archive of the whole history, in a chosen folder
//   save       the evening save, in the computer's scheduler
//   review     the weekly review by Claude
//   meaning    search by meaning (an embeddings key in the brain's .env)
//   viz        the persistent app built with Hypervibe
//
//   node scripts/components.mjs show [--json]
//   node scripts/components.mjs source <mail|journal> on|off
//   node scripts/components.mjs watch add|remove <folder>
//   node scripts/components.mjs set <backup|save|review|meaning> on|off
//   node scripts/components.mjs cold-copy <folder> | off
//   node scripts/components.mjs viz-app <folder> [--auto-push] | off

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HOME, ROOT, requireBrain } from "./lib.mjs";

requireBrain();
const FILE = join(ROOT, "hyperbrain.json");
const LIVE_SOURCES = ["mail", "journal"];
const MODULES = ["backup", "save", "review", "meaning"];
const args = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(FILE, "utf8"));
cfg.sources ??= {};
cfg.components ??= {};
const src = cfg.sources;
const c = cfg.components;
const write = () => writeFileSync(FILE, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
const fail = (error) => {
  console.log(JSON.stringify({ ok: false, error }));
  process.exit(1);
};
// "~/folder" in quotes reaches us unexpanded: expand it ourselves.
const fwd = (p) => resolve(String(p).replace(/^~(?=[\\/]|$)/, HOME)).replace(/\\/g, "/");

const [command, a1, a2] = args;
if (command === "source") {
  if (!LIVE_SOURCES.includes(a1) || !["on", "off"].includes(a2)) fail(`usage: source <${LIVE_SOURCES.join("|")}> on|off`);
  src[a1] = a2 === "on";
  write();
} else if (command === "watch") {
  if (!["add", "remove"].includes(a1) || !a2) fail("usage: watch add|remove <folder>");
  const dir = fwd(a2);
  if (a1 === "add" && !existsSync(dir)) fail(`${dir} does not exist`);
  src.watch = [...new Set([...(src.watch ?? []).filter((d) => d !== dir), ...(a1 === "add" ? [dir] : [])])];
  if (!src.watch.length) delete src.watch;
  write();
} else if (command === "set") {
  if (!MODULES.includes(a1) || !["on", "off"].includes(a2)) fail(`usage: set <${MODULES.join("|")}> on|off`);
  c[a1] = a2 === "on";
  write();
} else if (command === "cold-copy") {
  if (!a1) fail("usage: cold-copy <folder> | off");
  if (a1 === "off") delete c.coldCopy;
  else {
    const dir = fwd(a1);
    if (dir.startsWith(`${fwd(ROOT)}/`) || dir === fwd(ROOT)) fail("the cold copy cannot live inside the brain itself");
    c.coldCopy = { dir };
  }
  write();
} else if (command === "viz-app") {
  // The persistent app built with Hypervibe (/hyperbrain:brain-viz): where its
  // repository is, and whether the evening save may push its data (each push
  // redeploys the app online: a permission, asked explicitly).
  if (!a1) fail("usage: viz-app <app folder> [--auto-push] | off");
  if (a1 === "off") delete c.viz;
  else {
    const dir = fwd(a1);
    if (!existsSync(join(dir, ".git"))) fail(`${dir} is not a git repository`);
    c.viz = { app: { dir, dataFile: "data/brain-graph.json", autoPush: args.includes("--auto-push") } };
  }
  write();
} else if (command !== "show") fail("usage: show | source | watch | set | cold-copy | viz-app (see the top of scripts/components.mjs)");

const result = {
  ok: true,
  sources: { ...Object.fromEntries(LIVE_SOURCES.map((s) => [s, src[s] === true])), watch: src.watch ?? [] },
  modules: { ...Object.fromEntries(MODULES.map((m) => [m, c[m] === true])), coldCopy: c.coldCopy?.dir ?? null, vizApp: c.viz?.app ?? null },
};
if (args.includes("--json") || command !== "show") console.log(JSON.stringify(result));
else {
  console.log("  sources:");
  for (const s of LIVE_SOURCES) console.log(`    ${result.sources[s] ? "on " : "off"}  ${s}`);
  console.log(`    watch: ${result.sources.watch.length ? result.sources.watch.join(", ") : "none"}`);
  console.log("  modules:");
  for (const m of MODULES) console.log(`    ${result.modules[m] ? "on " : "off"}  ${m}`);
  console.log(`    cold copy: ${result.modules.coldCopy ?? "none"}`);
}
