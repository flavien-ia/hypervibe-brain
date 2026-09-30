#!/usr/bin/env node
// components.mjs - What this brain does beyond its notes, as the person chose
// it (/hyperbrain:create-brain asks, and it can change at any time). Kept in
// hyperbrain.json, under "components".
//
//   meaning    search by meaning (needs an embeddings key in the brain's .env)
//   backup     an online, private copy on GitHub (the brain's git remote)
//   save       the evening save, armed in the computer's scheduler
//   review     the weekly review by Claude, as a scheduled task of Claude
//   journal    the work journal: which projects were worked on with Claude
//   mail       the weekly review also reads the week's mail and calendar,
//              through the person's own Claude connectors (Gmail, Google
//              Calendar, Outlook...): new people, meetings, decisions
//   watch      folders whose moved files the weekly review lists
//   coldCopy   a weekly archive of the brain's whole history, in a folder
//              the person chooses (an external drive, a synced folder...)
//
//   node scripts/components.mjs show [--json]
//   node scripts/components.mjs set <meaning|backup|save|review|journal|mail> on|off
//   node scripts/components.mjs watch add|remove <folder>
//   node scripts/components.mjs cold-copy <folder> | off

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HOME, ROOT, requireBrain } from "./lib.mjs";

requireBrain();
const FILE = join(ROOT, "hyperbrain.json");
const SWITCHES = ["meaning", "backup", "save", "review", "journal", "mail"];
const args = process.argv.slice(2);
const cfg = JSON.parse(readFileSync(FILE, "utf8"));
cfg.components ??= {};
const c = cfg.components;
const write = () => writeFileSync(FILE, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
const fail = (error) => {
  console.log(JSON.stringify({ ok: false, error }));
  process.exit(1);
};
// "~/folder" in quotes reaches us unexpanded: expand it ourselves.
const fwd = (p) => resolve(String(p).replace(/^~(?=[\\/]|$)/, HOME)).replace(/\\/g, "/");

const [command, a1, a2] = args;
if (command === "set") {
  if (!SWITCHES.includes(a1) || !["on", "off"].includes(a2)) fail(`usage: set <${SWITCHES.join("|")}> on|off`);
  c[a1] = a2 === "on";
  write();
} else if (command === "watch") {
  if (!["add", "remove"].includes(a1) || !a2) fail("usage: watch add|remove <folder>");
  const dir = fwd(a2);
  if (a1 === "add" && !existsSync(dir)) fail(`${dir} does not exist`);
  c.watch = [...new Set([...(c.watch ?? []).filter((d) => d !== dir), ...(a1 === "add" ? [dir] : [])])];
  if (!c.watch.length) delete c.watch;
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
} else if (command !== "show") fail("usage: show | set | watch | cold-copy | viz-app (see the top of scripts/components.mjs)");

const state = Object.fromEntries(SWITCHES.map((s) => [s, c[s] === true]));
const result = { ok: true, ...state, watch: c.watch ?? [], coldCopy: c.coldCopy?.dir ?? null, vizApp: c.viz?.app ?? null };
if (args.includes("--json") || command !== "show") console.log(JSON.stringify(result));
else {
  for (const s of SWITCHES) console.log(`  ${state[s] ? "on " : "off"}  ${s}`);
  console.log(`  watch: ${result.watch.length ? result.watch.join(", ") : "none"}`);
  console.log(`  cold copy: ${result.coldCopy ?? "none"}`);
}
