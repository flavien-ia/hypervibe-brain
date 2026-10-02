#!/usr/bin/env node
// adopt.mjs - Makes an EXISTING brain the active brain of this computer: one
// restored from its cold copy, cloned on a second computer, or one that was
// built before the plugin. It only writes ~/.hypervibe-brain/config.json: the
// brain itself is not touched.
//
//   node scripts/adopt.mjs --dir <brain folder> [--switch]
//
// Refuses a folder without brain.json, and replacing another active
// brain without --switch.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HOME, setUserConfig, userConfig } from "./lib.mjs";

const args = process.argv.slice(2);
const out = (o) => console.log(JSON.stringify(o));
const i = args.indexOf("--dir");
if (i < 0 || !args[i + 1]) {
  out({ ok: false, error: "--dir is required" });
  process.exit(1);
}
const dir = resolve(args[i + 1].replace(/^~(?=[\\/]|$)/, HOME)).replace(/\\/g, "/");
if (!existsSync(join(dir, "brain.json"))) {
  out({ ok: false, error: `${dir} is not a brain (no brain.json)` });
  process.exit(1);
}
const current = userConfig().brain;
if (current && resolve(current) !== resolve(dir) && existsSync(join(current, "brain.json")) && !args.includes("--switch")) {
  out({ ok: false, error: `another brain is active on this computer (${current}): repeat with --switch if that is what the person wants` });
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(join(dir, "brain.json"), "utf8"));
setUserConfig({ brain: dir });
out({ ok: true, dir, name: cfg.name, lang: cfg.lang ?? null, stage: cfg.stage ?? null });
