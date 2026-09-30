#!/usr/bin/env node
// connect.mjs - Plugs a brain into Claude, for every session on this computer:
//
//   1. the MCP server, declared in ~/.claude.json (user scope), so that Claude
//      can READ the brain from any folder;
//   2. a capture skill in ~/.claude/skills/, so that Claude can WRITE to it
//      the right way (search first, classify, one note, commit);
//   3. a short block in ~/.claude/CLAUDE.md telling every session that the
//      brain exists and when to ask it, without being asked.
//
// Nothing that already belongs to someone else is overwritten: if a "brain"
// server or skill exists and is not this brain's, another name is taken.
// ~/.claude.json is backed up once before the first change (it holds the
// whole Claude configuration: a broken JSON would lose it).
//
//   node outils/connect.mjs --dir <brain folder>            plug in (idempotent)
//   node outils/connect.mjs --dir <brain folder> --check    say what is missing, change nothing (exit 1 if something is)
//   node outils/connect.mjs --dir <brain folder> --remove   unplug (only what is this brain's)
//
// HYPERBRAIN_HOME replaces the home folder: the test bench plugs a brain into
// a fake home, never into the real one.

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const CHECK = args.includes("--check");
const REMOVE = args.includes("--remove");

const HOME = process.env.HYPERBRAIN_HOME || homedir();
const CLAUDE_JSON = join(HOME, ".claude.json");
const CLAUDE_DIR = join(HOME, ".claude");
const GLOBAL_MD = join(CLAUDE_DIR, "CLAUDE.md");
const START = "<!-- hyperbrain:start -->";
const END = "<!-- hyperbrain:end -->";
const MARK = "<!-- create-hyperbrain: managed -->";

const dir = resolve(opt("--dir") ?? ".").replace(/\\/g, "/");
if (!existsSync(join(dir, "hyperbrain.json"))) {
  console.log(JSON.stringify({ ok: false, error: `${dir} is not a brain (no hyperbrain.json)` }));
  process.exit(1);
}
const cfgPath = join(dir, "hyperbrain.json");
const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
const serverPath = `${dir}/scripts/mcp.mjs`;

const writeJsonSafely = (p, obj) => {
  const tmp = `${p}.hyperbrain-tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
  JSON.parse(readFileSync(tmp, "utf8")); // never replace the real file with something unreadable
  renameSync(tmp, p);
};

// ------------------------------------------------------------ 1. MCP server
const claudeJson = existsSync(CLAUDE_JSON) ? JSON.parse(readFileSync(CLAUDE_JSON, "utf8")) : {};
claudeJson.mcpServers ??= {};
const isOurs = (entry) => Array.isArray(entry?.args) && entry.args.some((a) => String(a).replace(/\\/g, "/") === serverPath);
function pickName(taken, isMine, candidates) {
  for (const c of candidates) if (!taken(c) || isMine(c)) return c;
  for (let i = 2; ; i++) if (!taken(`${candidates.at(-1)}-${i}`) || isMine(`${candidates.at(-1)}-${i}`)) return `${candidates.at(-1)}-${i}`;
}
const existingMcp = Object.keys(claudeJson.mcpServers).find((k) => isOurs(claudeJson.mcpServers[k]));
const mcpName = existingMcp ?? cfg.connect?.mcp ?? pickName((n) => n in claudeJson.mcpServers, (n) => isOurs(claudeJson.mcpServers[n]), ["brain", "hyperbrain"]);

// ------------------------------------------------------------ 2. capture skill
const skillFile = (n) => join(CLAUDE_DIR, "skills", n, "SKILL.md");
const skillIsOurs = (n) => existsSync(skillFile(n)) && readFileSync(skillFile(n), "utf8").includes(MARK) && readFileSync(skillFile(n), "utf8").includes(dir);
const skillName = cfg.connect?.skill && (skillIsOurs(cfg.connect.skill) || !existsSync(skillFile(cfg.connect.skill)))
  ? cfg.connect.skill
  : pickName((n) => existsSync(skillFile(n)), skillIsOurs, ["brain", "hyperbrain"]);
const skillText = readFileSync(join(HERE, "modeles", "capture-SKILL.md"), "utf8")
  .replaceAll("{{SKILL}}", skillName).replaceAll("{{DIR}}", dir).replaceAll("{{NAME}}", cfg.name).replaceAll("{{DOMAINS}}", cfg.domains.join(", "));

// ------------------------------------------------------------ 3. global block
const block = readFileSync(join(HERE, "modeles", "bloc-claude-md.md"), "utf8")
  .replaceAll("{{DIR}}", dir).replaceAll("{{NAME}}", cfg.name).replaceAll("{{MCP}}", mcpName).replaceAll("{{SKILL}}", skillName).trim();
const globalMd = existsSync(GLOBAL_MD) ? readFileSync(GLOBAL_MD, "utf8") : "";
const blockRe = new RegExp(`${START}[\\s\\S]*?${END}\\n?`);
const wantedBlock = `${START}\n${block}\n${END}\n`;

const state = {
  mcp: isOurs(claudeJson.mcpServers[mcpName]),
  skill: existsSync(skillFile(skillName)) && readFileSync(skillFile(skillName), "utf8") === skillText,
  claudeMd: globalMd.includes(wantedBlock.trim()),
};

if (CHECK) {
  const missing = Object.entries(state).filter(([, v]) => !v).map(([k]) => k);
  console.log(JSON.stringify({ ok: !missing.length, mcp: mcpName, skill: skillName, ...state, missing }));
  process.exit(missing.length ? 1 : 0);
}

if (REMOVE) {
  if (existingMcp) {
    delete claudeJson.mcpServers[existingMcp];
    writeJsonSafely(CLAUDE_JSON, claudeJson);
  }
  if (skillIsOurs(skillName)) rmSync(dirname(skillFile(skillName)), { recursive: true, force: true });
  if (blockRe.test(globalMd)) writeFileSync(GLOBAL_MD, globalMd.replace(blockRe, ""), "utf8");
  delete cfg.connect;
  writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, removed: { mcp: existingMcp ?? null, skill: skillName } }));
  process.exit(0);
}

const done = [];
if (!state.mcp) {
  if (existsSync(CLAUDE_JSON) && !existsSync(`${CLAUDE_JSON}.bak-hyperbrain`)) copyFileSync(CLAUDE_JSON, `${CLAUDE_JSON}.bak-hyperbrain`);
  claudeJson.mcpServers[mcpName] = { type: "stdio", command: "node", args: [serverPath] };
  writeJsonSafely(CLAUDE_JSON, claudeJson);
  done.push("mcp");
}
if (!state.skill) {
  mkdirSync(dirname(skillFile(skillName)), { recursive: true });
  writeFileSync(skillFile(skillName), skillText, "utf8");
  done.push("skill");
}
if (!state.claudeMd) {
  mkdirSync(CLAUDE_DIR, { recursive: true });
  const next = blockRe.test(globalMd) ? globalMd.replace(blockRe, wantedBlock) : `${globalMd}${globalMd && !globalMd.endsWith("\n") ? "\n" : ""}${globalMd ? "\n" : ""}${wantedBlock}`;
  writeFileSync(GLOBAL_MD, next, "utf8");
  done.push("claudeMd");
}
cfg.connect = { mcp: mcpName, skill: skillName };
if (cfg.stage < 3) cfg.stage = 3;
writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, mcp: mcpName, skill: skillName, changed: done, restartNeeded: done.length > 0 }));
