#!/usr/bin/env node
// init.mjs - Creates a new brain: a folder of DATA (notes, founding documents,
// vectors), its own git repository, and its entry in ~/.hyperbrain/config.json
// so that every script and the MCP server find it. No script is copied into
// the brain: the code stays in the plugin.
//
// Refuses to write into a folder that is not empty, and refuses to replace a
// brain already set up on this computer unless --switch is given: a brain is
// never created on top of something.
//
//   node scripts/init.mjs --dir <folder> --name "<Name>" --domains work,writing,family [--lang fr|en] [--auto-push] [--no-git] [--switch]
//
// --lang: the language of the documents the person will read (their brain's
// documents, the weekly report, the names of the saves). By default, the
// computer's. French and English exist; any other falls back to English and
// Claude translates the documents when it fills them.
//
// Prints one JSON line: { ok, dir, domains, git, commit, identity }.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PLUGIN_ROOT, setUserConfig, userConfig } from "./lib.mjs";
import { LANGS, osLang, t } from "./i18n.mjs";
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};

const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 13)) fail(`Node ${process.versions.node} is too old: the brain needs Node 22.13 or later (its database comes with Node from that version)`);

const dirArg = opt("--dir");
const name = opt("--name");
if (!dirArg || !name) fail("--dir and --name are required");
const domains = [...new Set(String(opt("--domains") ?? "").split(",").map((d) =>
  d.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")).filter(Boolean))];
if (domains.length < 2 || domains.length > 10) fail("choose between 2 and 10 domains (--domains a,b,c)");

const lang = LANGS.includes(opt("--lang")) ? opt("--lang") : osLang();
const TEMPLATE = join(PLUGIN_ROOT, "templates", "brain", lang);
const dir = resolve(dirArg);
const current = userConfig().brain;
if (current && resolve(current) !== dir && existsSync(join(current, "hyperbrain.json")) && !args.includes("--switch")) {
  fail(`a brain is already set up on this computer (${current}). Creating another one would make it the active brain: repeat with --switch if that is what the person wants`);
}
// Windows: Dropbox, OneDrive (also "OneDrive - Company", where Documents and
// Desktop are often redirected), Google Drive. macOS: everything under
// ~/Library/CloudStorage (Dropbox, OneDrive, Google Drive since 2022) and
// iCloud's "Mobile Documents" (Desktop and Documents when iCloud syncs them).
const SYNCED = /[\\/](Dropbox|OneDrive[^\\/]*|iCloud ?Drive|Google ?Drive|My Drive|CloudStorage|Mobile Documents)([\\/]|$)/i;
if (SYNCED.test(dir)) {
  fail(`${dir} is inside a synchronised folder: these tools damage git repositories and databases. Choose a folder outside it`);
}
if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} exists and is not empty: choose another folder, a brain is never created on top of something`);
mkdirSync(dir, { recursive: true });

cpSync(TEMPLATE, dir, { recursive: true });
renameSync(join(dir, "gitignore"), join(dir, ".gitignore"));
renameSync(join(dir, "gitattributes"), join(dir, ".gitattributes"));
const today = new Date().toISOString().slice(0, 10);
for (const f of ["CLAUDE.md", "BRAIN.md", "SOURCES.md", "vault/CLAUDE.md"]) {
  const p = join(dir, f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("{{NAME}}", name).replaceAll("{{DATE}}", today).replaceAll("{{DIR}}", dir.replace(/\\/g, "/")), "utf8");
}
writeFileSync(join(dir, "hyperbrain.json"), `${JSON.stringify({
  name,
  lang,
  domains,
  components: {},
  autoPush: args.includes("--auto-push"),
  stage: 2,
  created: today,
  embeddings: { model: "text-embedding-3-small", dims: 512 },
}, null, 2)}\n`, "utf8");
setUserConfig({ brain: dir.replace(/\\/g, "/") });

const result = { ok: true, dir: dir.replace(/\\/g, "/"), lang, domains, git: false, commit: false, identity: null };
if (!args.includes("--no-git")) {
  const git = (a) => execFileSync("git", a, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }).trim();
  try {
    git(["init", "-q", "-b", "main"]);
    result.git = true;
    try {
      result.identity = `${git(["config", "user.name"])} <${git(["config", "user.email"])}>`;
    } catch {
      result.identity = null;
    }
    git(["add", "--", ".gitignore", ".gitattributes", "CLAUDE.md", "BRAIN.md", "SOURCES.md", "hyperbrain.json", "vault/CLAUDE.md"]);
    if (result.identity) {
      git(["commit", "-q", "-m", t(lang).commitCreate(name)]);
      result.commit = true;
    }
  } catch (e) {
    result.gitError = String(e.stderr ?? e.message).split("\n")[0].slice(0, 200);
  }
}
out(result);
