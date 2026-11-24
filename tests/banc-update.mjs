#!/usr/bin/env node
// banc-update.mjs - The update of the plugin, without the network: a fake
// installed plugin, archives built here, and the swap checked both ways (what
// must be installed, and what must be refused without touching the plugin).
//
//   node tests/banc-update.mjs [--keep]

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32 } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const UPDATE = join(HERE, "..", "scripts", "update.mjs");
const BASE = join(tmpdir(), `brain-update-${process.pid}`);
const HOME = join(BASE, "home");
const PLUGIN = join(BASE, "uploads", "brain");
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${ok ? "" : `\n        ${String(detail).slice(0, 400)}`}`);
  if (!ok) failures++;
}

/** A zip with stored entries: enough for the reader of update.mjs. */
function zip(files) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text, "utf8");
    const n = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(n.length, 26);
    local.push(h, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, cd, end]);
}

const plugin = (version, extra = {}, name = "brain") => ({
  ".claude-plugin/plugin.json": JSON.stringify({ name, version }),
  "skills/update/SKILL.md": "update",
  "scripts/update.mjs": "// new",
  "templates/brain/BRAIN.md": "template",
  ...extra,
});

function installed(version) {
  rmSync(PLUGIN, { recursive: true, force: true });
  for (const [p, t] of Object.entries(plugin(version))) {
    mkdirSync(dirname(join(PLUGIN, p)), { recursive: true });
    writeFileSync(join(PLUGIN, p), t, "utf8");
  }
}

function install(files) {
  const file = join(BASE, "candidate.zip");
  writeFileSync(file, zip(files));
  const r = spawnSync(process.execPath, [UPDATE, "install", "--zip", file, "--plugin-dir", PLUGIN, "--force"], { encoding: "utf8", env: { ...process.env, HVBRAIN_HOME: HOME } });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: false, raw: `${r.stdout}${r.stderr}` };
  }
}
const versionThere = (dir) => JSON.parse(readFileSync(join(dir, ".claude-plugin", "plugin.json"), "utf8")).version;

/** A real install in a given place, without --force, the registry being the throwaway home's. */
function installAt(dir) {
  rmSync(dir, { recursive: true, force: true });
  for (const [p, t] of Object.entries(plugin("1.0.0"))) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), t, "utf8");
  }
  const file = join(BASE, "place.zip");
  writeFileSync(file, zip(plugin("1.1.0")));
  const r = spawnSync(process.execPath, [UPDATE, "install", "--zip", file, "--plugin-dir", dir], { encoding: "utf8", env: { ...process.env, HVBRAIN_HOME: HOME, HOME, USERPROFILE: HOME } });
  try {
    return JSON.parse(r.stdout);
  } catch {
    return { ok: false, raw: `${r.stdout}${r.stderr}` };
  }
}

try {
  mkdirSync(HOME, { recursive: true });
  console.log("The update of the plugin");

  installed("1.0.0");
  let r = install(plugin("1.1.0"));
  check("a whole new version takes the place of the installed one", r.ok && versionThere(PLUGIN) === "1.1.0", JSON.stringify(r));
  check("and the previous one is kept aside", existsSync(`${PLUGIN}-backup-1.0.0`) && versionThere(`${PLUGIN}-backup-1.0.0`) === "1.0.0", JSON.stringify(r));

  installed("1.0.0");
  const { "scripts/update.mjs": _, ...noScripts } = plugin("1.1.0");
  r = install(noScripts);
  check("a version without its scripts is refused, the installed one untouched", !r.ok && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  r = install(plugin("1.1.0", { "../outside.txt": "no" }));
  check("an archive that would write outside its folder is refused", !r.ok && !existsSync(join(BASE, "uploads", "outside.txt")) && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  r = install(plugin("1.1.0", {}, "someone-else"));
  check("another plugin's archive is refused", !r.ok && versionThere(PLUGIN) === "1.0.0", JSON.stringify(r));

  const refused = spawnSync(process.execPath, [UPDATE, "install", "--zip", join(BASE, "candidate.zip"), "--plugin-dir", PLUGIN], { encoding: "utf8", env: { ...process.env, HVBRAIN_HOME: HOME } });
  check("a copy that was not uploaded is left to its own update path", JSON.parse(refused.stdout).ok === false && versionThere(PLUGIN) === "1.0.0", refused.stdout);

  console.log("\nWhat the update promises, by where the plugin lives");
  const inMarket = join(HOME, ".claude", "plugins", "marketplaces", "local-desktop-app-uploads", "brain");
  r = installAt(inMarket);
  check("in a marketplace folder: installed, backup kept and said to be", r.ok && versionThere(inMarket) === "1.1.0" && r.backupKept === true && r.desktop === false && versionThere(r.backup) === "1.0.0", JSON.stringify(r));
  const inDesktop = join(BASE, "Claude-Data", "claude_pzs8sxrjxfjjc", "rpm", "a859f234", "c851960e", "plugin_01TESTdesktop");
  r = installAt(inDesktop);
  check("in Claude Desktop's registry: recognised as an upload, installed, no backup promised", r.ok && versionThere(inDesktop) === "1.1.0" && r.backupKept === false && r.desktop === true && r.place === "desktop", JSON.stringify(r));
  const elsewhere = join(BASE, "elsewhere", "brain");
  r = installAt(elsewhere);
  check("anywhere else: left to its own update path, nothing moved", r.ok === false && versionThere(elsewhere) === "1.0.0", JSON.stringify(r));

  const skill = readFileSync(join(HERE, "..", "skills", "update", "SKILL.md"), "utf8");
  const doc = readFileSync(join(HERE, "..", "skills", "update", "DOC.md"), "utf8");
  const docFr = readFileSync(join(HERE, "..", "skills", "update", "DOC.fr.md"), "utf8");
  const wrapUp = skill.slice(skill.indexOf("## Step 5"));
  check("the skill only promises the backup when backupKept is true", /`backupKept: true` → add: \*"The previous version is kept aside/.test(wrapUp) && /`backupKept: false` → \*\*never promise a backup\.\*\*/.test(wrapUp) && skill.split("\n").filter((l) => /kept aside|keeping the previous/.test(l)).every((l) => l.includes("backupKept: true")));
  check("on Desktop, the skill says the Plugins screen keeps the old number", /`desktop: true` → add one sentence: \*"Claude Desktop will keep showing the old number/.test(wrapUp));
  check("the skill's description promises no backup", !/backup|aside/i.test(/^description: (.*)$/m.exec(skill)?.[1] ?? "backup"));
  check("the DOC pages say Desktop deletes the copy", doc.includes("except on Claude Desktop") && docFr.includes("sauf sous Claude Desktop") && doc.includes("so Claude never promises it there") && docFr.includes("Claude ne vous la promet donc pas"));
} finally {
  if (!process.argv.includes("--keep")) rmSync(BASE, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) FAIL.` : "\nAll update checks pass.");
process.exitCode = failures ? 1 : 0;
