#!/usr/bin/env node
// installer.mjs - Installs the /create-hyperbrain skill for Claude Code on
// this computer, by copying this folder into ~/.claude/skills/create-hyperbrain.
// Run it again to update: the previous copy is replaced, and nothing else of
// ~/.claude is touched. Brains already created are not affected.
//
//   node installer.mjs

import { cpSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = join(process.env.HYPERBRAIN_HOME || homedir(), ".claude", "skills", "create-hyperbrain");

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) {
  console.log(`Node ${process.versions.node} est trop ancien : il faut Node 22.13 ou plus récent (nodejs.org).`);
  process.exit(1);
}
if (HERE.replace(/\\/g, "/") === TARGET.replace(/\\/g, "/")) {
  console.log("La skill est déjà installée à cet endroit.");
  process.exit(0);
}
const update = existsSync(TARGET);
if (update) rmSync(TARGET, { recursive: true, force: true });
cpSync(HERE, TARGET, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src) });
console.log(`${update ? "Mise à jour" : "Installation"} faite : ${TARGET}`);
console.log("Ouvre une nouvelle session Claude Code et tape /create-hyperbrain.");
