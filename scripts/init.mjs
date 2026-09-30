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
//   node scripts/init.mjs --dir <folder> --name "<Name>" --domains work,writing,family [--types note:notes,idee:idees,...] [--lang fr|en] [--auto-push] [--no-git] [--switch]
//
// --types: the types validated with the person (type:folder, or type alone
// for type + "s"). Without it, the default types of the brain's language.
//
// --lang: the language of the documents the person will read (their brain's
// documents, the weekly report, the names of the saves). By default, the
// computer's. French and English exist; any other falls back to English and
// Claude translates the documents when it fills them.
//
// Prints one JSON line: { ok, dir, domains, git, commit, identity }.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DEFAULT_TYPES, HOME, PLUGIN_ROOT, setUserConfig, today as localToday, userConfig } from "./lib.mjs";
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
// The format speaks the brain's language: a French brain writes titre, statut: graine...
const format = lang;
const SLUG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const types = opt("--types")
  ? Object.fromEntries(String(opt("--types")).split(",").map((x) => x.trim()).filter(Boolean).map((x) => {
    const [t, f] = x.split(":").map((y) => y.trim().toLowerCase());
    return [t, f || `${t}s`];
  }))
  : DEFAULT_TYPES[format];
for (const [t, f] of Object.entries(types)) if (!SLUG.test(t) || !SLUG.test(f)) fail(`type "${t}" or folder "${f}": lowercase words without accents, joined by dashes`);
if (new Set(Object.values(types)).size !== Object.keys(types).length) fail("two types cannot share a folder");
if (Object.keys(types).length < 3) fail("choose at least three types");
// "~/hyperbrain" in quotes reaches us unexpanded: expand it ourselves.
const dir = resolve(dirArg.replace(/^~(?=[\\/]|$)/, HOME));
const current = userConfig().brain;
if (current && resolve(current) !== dir && existsSync(join(current, "hyperbrain.json")) && !args.includes("--switch")) {
  fail(`a brain is already set up on this computer (${current}). Creating another one would make it the active brain: repeat with --switch if that is what the person wants`);
}
// Windows: Dropbox, OneDrive (also "OneDrive - Company", where Documents and
// Desktop are often redirected), Google Drive. macOS: everything under
// ~/Library/CloudStorage (Dropbox, OneDrive, Google Drive since 2022) and
// iCloud's "Mobile Documents" (Desktop and Documents when iCloud syncs them).
const SYNCED = /[\\/](Dropbox|OneDrive[^\\/]*|iCloud ?Drive|Google ?Drive|My Drive|CloudStorage|Mobile Documents)([\\/]|$)/i;
// The check runs on the REAL path of the nearest existing folder: a symlink
// into a synced folder must not slip through.
let real = dir;
for (let p = dir; ; p = dirname(p)) {
  if (existsSync(p)) {
    real = join(realpathSync(p), dir.slice(p.length));
    break;
  }
  if (dirname(p) === p) break;
}
// macOS: with "Desktop and Documents Folders" ticked in iCloud, ~/Desktop and
// ~/Documents keep their usual path but live in iCloud.
const icloudDocs = process.platform === "darwin" && ["Desktop", "Documents"].some((f) => {
  const home = process.env.HYPERBRAIN_HOME || homedir();
  const inside = (p) => real === p || real.startsWith(`${p}/`);
  return existsSync(join(home, "Library", "Mobile Documents", "com~apple~CloudDocs", f)) && inside(join(home, f));
});
if (SYNCED.test(dir) || SYNCED.test(real) || icloudDocs) {
  fail(`${dir} is inside a synchronised folder: these tools damage git repositories and databases. Choose a folder outside it`);
}
if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} exists and is not empty: choose another folder, a brain is never created on top of something`);
mkdirSync(dir, { recursive: true });

cpSync(TEMPLATE, dir, { recursive: true });
renameSync(join(dir, "gitignore"), join(dir, ".gitignore"));
renameSync(join(dir, "gitattributes"), join(dir, ".gitattributes"));
const today = localToday();
// The table of this brain's own types, written into its format document.
const HELP = {
  fr: { note: "un fait, une observation, une décision et sa raison", idee: "une intuition, une hypothèse, quelque chose à creuser", concept: "une notion qu'on définit et qu'on réutilise", projet: "un projet, en cours ou fini", personne: "quelqu'un qui compte", organisation: "une entreprise, une institution, un collectif", publication: "ce qui a été publié", evenement: "un moment daté", source: "une œuvre ou une lecture qui nourrit la pensée" },
  en: { note: "a fact, an observation, a decision and its reason", idea: "an intuition, a hypothesis, something to dig into", concept: "a notion one defines and reuses", project: "a project, ongoing or finished", person: "someone who matters", organization: "a company, an institution, a group", publication: "something published", event: "a dated moment", source: "a work or a reading that feeds the thinking" },
};
const head = lang === "fr" ? "| type | dossier | pour |\n|---|---|---|" : "| type | folder | for |\n|---|---|---|";
const table = `${head}\n${Object.entries(types).map(([t, f]) => `| \`${t}\` | \`${f}/\` | ${HELP[lang]?.[t] ?? ""} |`).join("\n")}`;
for (const f of ["CLAUDE.md", "BRAIN.md", "SOURCES.md", "vault/CLAUDE.md"]) {
  const p = join(dir, f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("{{NAME}}", name).replaceAll("{{DATE}}", today).replaceAll("{{DIR}}", dir.replace(/\\/g, "/")).replaceAll("{{TYPES}}", table), "utf8");
}
writeFileSync(join(dir, "hyperbrain.json"), `${JSON.stringify({
  name,
  lang,
  format,
  domains,
  types,
  components: {},
  autoPush: args.includes("--auto-push"),
  stage: 2,
  created: today,
  embeddings: { model: "text-embedding-3-small", dims: 512 },
}, null, 2)}\n`, "utf8");
setUserConfig({ brain: dir.replace(/\\/g, "/") });

const result = { ok: true, dir: dir.replace(/\\/g, "/"), lang, format, domains, types, git: false, commit: false, identity: null };
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
