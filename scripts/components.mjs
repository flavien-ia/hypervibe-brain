#!/usr/bin/env node
// components.mjs - What feeds this brain (its SOURCES) and what it does beyond
// its notes (its MODULES), as the person chose them. Kept in brain.json.
//
// SOURCES, the heart of the brain: what builds and enriches it, week after week.
//   mail       the week's mail and calendar, read through the person's own
//              Claude connectors (Gmail, Google Calendar, Outlook...): new
//              people, meetings, decisions
//   journal    the work done with Claude: which projects, and their commits
//   watch      folders whose new and changed files are looked at every week
//              (and during the day, once the standard documents source is
//              installed: sources.mjs install documents). A watched folder
//              gets a name on this computer (roots.mjs), so that what is
//              found in it has an address that holds on every computer.
// (The person's existing writings are sources too, but they come in once,
// through /brain:ingest, and are listed in SOURCES.md.)
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
import { ensureRoot } from "./roots.mjs";
import { approveWatch } from "./trust.mjs";

requireBrain();
const FILE = join(ROOT, "brain.json");
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
let watchedRoot = null;
/** @type {{ included?: string, replaces?: string[] } | null} what adding a folder did to the others */
let watchNote = null;
if (command === "source") {
  if (!LIVE_SOURCES.includes(a1) || !["on", "off"].includes(a2)) fail(`usage: source <${LIVE_SOURCES.join("|")}> on|off`);
  src[a1] = a2 === "on";
  write();
} else if (command === "watch") {
  if (!["add", "remove"].includes(a1) || !a2) fail("usage: watch add|remove <folder>");
  const dir = fwd(a2);
  if (a1 === "add" && !existsSync(dir)) fail(`${dir} does not exist`);
  // NEVER THE BRAIN, THE PLUGIN'S SETTINGS, NOR A FOLDER OF KEYS (2026-11-27):
  // a watched folder is read by a background reader, and what it reads may end
  // in a note.
  if (a1 === "add") {
    const low = (p) => fwd(p).toLowerCase().replace(/\/+$/, "");
    const inside = (outer, inner) => low(inner) === low(outer) || low(inner).startsWith(`${low(outer)}/`);
    for (const kept of [ROOT, join(HOME, ".hypervibe-brain")]) if (inside(kept, dir) || inside(dir, kept)) fail(`${dir} holds, or is inside, the brain or the plugin's settings: it cannot be watched`);
    if (/(^|\/)\.(ssh|aws|gnupg|kube|docker|azure|config)(\/|$)/i.test(dir)) fail(`${dir} is a folder where keys are kept: it cannot be watched`);
  }
  // ONLY THE WIDEST FOLDERS (2026-11-20). A watched folder is read with all
  // that is under it: a folder inside one already watched adds nothing (it is
  // said, and the list does not change), and a folder that holds some already
  // watched takes their place.
  const key = (p) => {
    const k = fwd(p).replace(/\/+$/, "");
    return process.platform === "linux" ? k : k.toLowerCase();
  };
  const holds = (outer, inner) => key(inner).startsWith(`${key(outer)}/`);
  const others = (src.watch ?? []).filter((d) => key(d) !== key(dir));
  if (a1 === "remove") src.watch = others;
  else {
    const holder = others.find((d) => holds(d, dir));
    if (holder) watchNote = { included: holder };
    else {
      const taken = others.filter((d) => holds(dir, d));
      if (taken.length) watchNote = { replaces: taken };
      src.watch = [...others.filter((d) => !taken.includes(d)), dir];
    }
  }
  if (!src.watch.length) delete src.watch;
  write();
  // The folder the person has just asked to watch, on this computer, is
  // approved here (trust.mjs); the others keep what they had. One that
  // arrives with the brain on another computer waits for its approval there.
  approveWatch(a1 === "add" && !watchNote?.included ? [dir] : [], "watched");
  if (a1 === "add") watchedRoot = ensureRoot(dir);
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
  // The persistent app built with Hypervibe (/brain:viz): where its
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
  // The name the folder just watched has on this computer ("writing://...").
  ...(watchedRoot ? { root: watchedRoot } : {}),
  // The folder just named was already read (the watched folder that holds
  // it), or takes the place of the folders it holds.
  ...(watchNote ?? {}),
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
