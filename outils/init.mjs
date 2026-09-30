#!/usr/bin/env node
// init.mjs - Creates a new brain from the template (gabarit/), in its own
// folder and its own git repository. Refuses to write into a folder that is
// not empty: a brain is never created on top of something.
//
//   node outils/init.mjs --dir <folder> --name "<Name>" --domains work,writing,family [--auto-push] [--no-git]
//
// Prints one JSON line: { ok, dir, domains, git, commit, identity }.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GABARIT = join(HERE, "..", "gabarit");
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

const dir = resolve(dirArg);
if (existsSync(dir) && readdirSync(dir).length) fail(`${dir} exists and is not empty: choose another folder, a brain is never created on top of something`);
mkdirSync(dir, { recursive: true });

cpSync(GABARIT, dir, { recursive: true });
renameSync(join(dir, "gitignore"), join(dir, ".gitignore"));
renameSync(join(dir, "gitattributes"), join(dir, ".gitattributes"));
const today = new Date().toISOString().slice(0, 10);
for (const f of ["CLAUDE.md", "BRAIN.md", "SOURCES.md", "vault/CLAUDE.md", "routines/revue-hebdo.md"]) {
  const p = join(dir, f);
  writeFileSync(p, readFileSync(p, "utf8").replaceAll("{{NAME}}", name).replaceAll("{{DATE}}", today).replaceAll("{{DIR}}", dir.replace(/\\/g, "/")), "utf8");
}
mkdirSync(join(dir, "vault"), { recursive: true });
writeFileSync(join(dir, "hyperbrain.json"), `${JSON.stringify({
  name,
  domains,
  autoPush: args.includes("--auto-push"),
  stage: 1,
  created: today,
  embeddings: { model: "text-embedding-3-small", dims: 512 },
}, null, 2)}\n`, "utf8");

const result = { ok: true, dir: dir.replace(/\\/g, "/"), domains, git: false, commit: false, identity: null };
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
    const files = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && !e.parentPath?.includes(`${dir}${process.platform === "win32" ? "\\" : "/"}.git`))
      .map((e) => join(e.parentPath ?? e.path, e.name).slice(dir.length + 1).replace(/\\/g, "/"))
      .filter((p) => !p.startsWith(".git/"));
    git(["add", "--", ...files]);
    if (result.identity) {
      git(["commit", "-q", "-m", `Création du brain de ${name}`]);
      result.commit = true;
    }
  } catch (e) {
    result.gitError = String(e.stderr ?? e.message).split("\n")[0].slice(0, 200);
  }
}
out(result);
