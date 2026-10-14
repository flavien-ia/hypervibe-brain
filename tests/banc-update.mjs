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
} finally {
  if (!process.argv.includes("--keep")) rmSync(BASE, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) FAIL.` : "\nAll update checks pass.");
process.exitCode = failures ? 1 : 0;
