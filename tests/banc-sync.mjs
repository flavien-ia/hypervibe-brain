#!/usr/bin/env node
// banc-sync.mjs - Two computers, one brain, GitHub in the middle: the
// scenarios that made the synchronisation of the brain this plugin grew from
// safe, replayed on the plugin. Two fake homes (each its own settings and its
// own computer name), a LOCAL bare repository as GitHub: nothing goes online.
//
//   node tests/banc-sync.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..", "scripts");
const BASE = join(tmpdir(), `hyperbrain-sync-${process.pid}`);
const PIVOT = join(BASE, "github.git");
const A = join(BASE, "alpha-brain");
const B = join(BASE, "beta-brain");
mkdirSync(BASE, { recursive: true });
const GITCONFIG = join(BASE, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n\tname = banc\n\temail = banc@example.invalid\n[init]\n\tdefaultBranch = main\n[core]\n\tautocrlf = false\n", "utf8");

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 600)}` : ""}`);
  }
};
const baseEnv = { ...process.env, OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_NOSYSTEM: "1", HYPERBRAIN_DIR: "", HYPERBRAIN_TASK_SUFFIX: " banc-sync" };
const computer = (name) => ({ HYPERBRAIN_HOME: join(BASE, `home-${name}`), HYPERBRAIN_COMPUTER: name });
const ALPHA = computer("alpha");
const BETA = computer("beta");
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { cwd: o.cwd ?? BASE, env: { ...baseEnv, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: `${r.stdout}${r.status === 0 ? "" : err}`, err };
};
const on = (who, script, a = [], o = {}) => run("node", [join(SCRIPTS, script), ...a], { ...o, env: { ...who, ...o.env } });
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const git = (dir, ...a) => run("git", a, { cwd: dir }).out.trim();
const head = (dir) => git(dir, "rev-parse", "HEAD");
const note = (dir, slug) => join(dir, "vault", "notes", `${slug}.md`);
const capture = (who, title, body) => on(who, "capture.mjs", ["--title", title, "--type", "note", "--domains", "work", "--no-commit"], { input: body });
const sync = (who) => json(on(who, "sync.mjs", ["--json"]).out);
const old = (p) => {
  const t = new Date(Date.now() - 3 * 3600_000);
  utimesSync(p, t, t);
};

const fake = spawn("node", [join(HERE, "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const EMB = { EMBEDDINGS_API_KEY: "k", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1` };

try {
  console.log(`\nBanc des deux postes, dans ${BASE}\n`);

  // ---- setting up: alpha has the brain and its online copy, then becomes the runner
  run("git", ["init", "-q", "--bare", "-b", "main", PIVOT]);
  on(ALPHA, "init.mjs", ["--dir", A, "--name", "Sam", "--domains", "work,life", "--lang", "en"]);
  git(A, "remote", "add", "origin", PIVOT);
  git(A, "push", "-q", "-u", "origin", "main");
  let r = on(ALPHA, "computers.mjs", ["make-runner"]);
  check("alpha becomes the runner, written in the brain for the other computer to know", r.ok && json(r.out).runner === "alpha" && JSON.parse(readFileSync(join(A, "hyperbrain.json"), "utf8")).runner === "alpha", r.out);
  r = json(on(ALPHA, "sync.mjs", ["--json"]).out);
  check("without the person's agreement on this computer, nothing is synchronised", r.result === "off", JSON.stringify(r));
  on(ALPHA, "computers.mjs", ["allow-sync", "on"]);
  r = sync(ALPHA);
  check("allowed, alpha sends what it has", r.result === "ok" && r.pushed >= 1, JSON.stringify(r));
  r = on(BETA, "computers.mjs", ["clone", "--url", PIVOT, "--dir", B]);
  check("beta gets the brain from GitHub, made its active brain", r.ok && json(r.out).runner === "alpha" && JSON.parse(readFileSync(join(BASE, "home-beta", ".hyperbrain", "config.json"), "utf8")).brain === B.replace(/\\/g, "/"), r.out);
  on(BETA, "computers.mjs", ["allow-sync", "on"]);
  r = json(on(BETA, "computers.mjs", ["state"]).out);
  check("beta knows it is not the runner", r.isRunner === false && r.runner === "alpha" && r.computer === "beta", JSON.stringify(r));
  r = on(BETA, "computers.mjs", ["make-runner"]);
  check("taking the runner's place is never silent", !r.ok && r.out.includes("take-over"), r.out);

  // ---- 1. a capture on beta arrives on alpha
  capture(BETA, "Idea from beta", "Written on the second computer.");
  r = sync(BETA);
  check("1. beta commits and sends its capture", r.result === "ok" && r.pushed === 1, JSON.stringify(r));
  r = sync(ALPHA);
  check("   and alpha takes it", r.took.includes("vault/notes/idea-from-beta.md") && existsSync(note(A, "idea-from-beta")) && head(A) === head(B), JSON.stringify(r));

  // ---- 2. two different notes on both sides: everything arrives, a straight history
  capture(ALPHA, "From alpha", "A.");
  capture(BETA, "From beta", "B.");
  sync(ALPHA);
  sync(BETA);
  sync(ALPHA);
  check("2. both notes on both computers, no merge commit", existsSync(note(A, "from-beta")) && existsSync(note(B, "from-alpha")) && head(A) === head(B) && git(A, "rev-list", "--merges", "--count", "HEAD") === "0");

  // ---- 3. the same note: sent by alpha, being written on beta: beta stops, touching nothing
  writeFileSync(note(A, "from-alpha"), readFileSync(note(A, "from-alpha"), "utf8").replace("A.", "A, corrected on alpha."), "utf8");
  old(note(A, "from-alpha"));
  sync(ALPHA);
  writeFileSync(note(B, "from-alpha"), readFileSync(note(B, "from-alpha"), "utf8").replace("A.", "A, being written on beta."), "utf8");
  const before3 = readFileSync(note(B, "from-alpha"));
  const head3 = head(B);
  r = sync(BETA);
  check("3. the overlap check stops beta before taking anything", r.result === "conflict" && r.alerts.length === 1 && readFileSync(note(B, "from-alpha")).equals(before3) && head(B) === head3, JSON.stringify(r));
  r = sync(BETA);
  check("   and says it once, not at every run", r.result === "conflict" && r.alerts.length === 0, JSON.stringify(r));
  // The person decides (here: keep alpha's version), then all goes on.
  git(B, "checkout", "--", "vault/notes/from-alpha.md");
  r = sync(BETA);
  check("   once solved, it goes on", r.result === "ok" && readFileSync(note(B, "from-alpha"), "utf8").includes("corrected on alpha"), JSON.stringify(r));

  // ---- 4. the same note committed on both sides: the rebase is undone, all is as before
  writeFileSync(note(A, "from-beta"), readFileSync(note(A, "from-beta"), "utf8").replace("B.", "B, per alpha."), "utf8");
  old(note(A, "from-beta"));
  sync(ALPHA);
  writeFileSync(note(B, "from-beta"), readFileSync(note(B, "from-beta"), "utf8").replace("B.", "B, per beta."), "utf8");
  old(note(B, "from-beta"));
  r = sync(BETA);
  check("4. same note committed on both: conflict, rebase undone, nothing pushed", r.result === "conflict" && r.conflict?.nature === "rebase" && r.conflict.intact === true && r.pushed === 0, JSON.stringify(r));
  const gd = join(B, ".git");
  check("   no rebase left half done, beta keeps its version, its tree is clean", !existsSync(join(gd, "rebase-merge")) && !existsSync(join(gd, "rebase-apply")) && readFileSync(note(B, "from-beta"), "utf8").includes("per beta") && git(B, "status", "--porcelain") === "", git(B, "status", "--porcelain"));
  // Solved with the person: beta takes alpha's version.
  git(B, "reset", "-q", "--hard", "origin/main");
  sync(BETA);

  // ---- 5. what the runner computes never leaves the other computer
  mkdirSync(join(B, "index", "embeddings"), { recursive: true });
  writeFileSync(join(B, "index", "embeddings", "stray.json"), "{}", "utf8");
  mkdirSync(join(B, "reviews"), { recursive: true });
  writeFileSync(join(B, "reviews", "stray.md"), "x", "utf8");
  r = sync(BETA);
  check("5. the derived is never committed on the other computer", !git(B, "ls-files").includes("stray") && git(B, "status", "--porcelain", "--untracked-files=all").includes("stray"), git(B, "ls-files"));
  r = on(BETA, "review.mjs");
  check("   the review, the runner's work, refuses to run there", r.status === 4 && r.out.includes("not the one that runs"), r.out);
  r = on(BETA, "sources.mjs", ["run"]);
  check("   and so do the sources", r.status === 4, r.out);
  r = on(BETA, "build.mjs", [], { env: EMB });
  check("   its build keeps its vectors to itself: no file written for git", r.ok && !existsSync(join(B, "index", "embeddings", "idea-from-beta.json")), r.out);
  r = on(ALPHA, "build.mjs", [], { env: EMB });
  sync(ALPHA);
  sync(BETA);
  r = on(BETA, "build.mjs", [], { env: EMB });
  check("   the runner's vectors arrive, and the other computer takes them from git", existsSync(join(B, "index", "embeddings", "idea-from-beta.json")) && /taken from git/.test(r.out), r.out);

  // ---- 6. the index of another session survives a fast-forward
  const foreign = (dir) => {
    writeFileSync(join(dir, "draft-of-another-session.txt"), "staged\n", "utf8");
    git(dir, "add", "draft-of-another-session.txt");
    writeFileSync(join(dir, "draft-of-another-session.txt"), "staged, then changed\n", "utf8");
  };
  const photo = (dir) => [run("git", ["status", "--porcelain"], { cwd: dir }).out, git(dir, "show", ":draft-of-another-session.txt")].join("|");
  foreign(B);
  const staged = photo(B);
  capture(ALPHA, "Six", "6.");
  sync(ALPHA);
  r = sync(BETA);
  check("6. another session's staged file survives the fast-forward, staged and unstaged parts intact", r.result === "ok" && r.took.includes("vault/notes/six.md") && photo(B) === staged && git(B, "stash", "list") === "", `${photo(B)} vs ${staged}`);

  // ---- 7. and a rebase with commits to replay (the stash comes back with --index)
  capture(ALPHA, "Seven alpha", "7a.");
  sync(ALPHA);
  capture(BETA, "Seven beta", "7b.");
  r = sync(BETA);
  check("7. with commits to replay too", r.result === "ok" && r.pushed === 1 && photo(B) === staged && git(B, "stash", "list") === "" && git(B, "rev-list", "--merges", "--count", "HEAD") === "0", `${JSON.stringify(r)} ${photo(B)}`);

  // ---- 8. a stash that did not come back stops everything, named
  git(B, "stash", "push", "-q", "-m", "left by a failed sync");
  const stash = git(B, "rev-parse", "refs/stash");
  const stateFile = run("node", ["-e", `const {createHash}=require("crypto");console.log(createHash("sha256").update(${JSON.stringify(B.replace(/\\/g, "/").toLowerCase())}).digest("hex").slice(0,12))`]).out.trim();
  const statePath = join(BASE, "home-beta", ".hyperbrain", `sync-${stateFile}.json`);
  writeFileSync(statePath, JSON.stringify({ ...JSON.parse(readFileSync(statePath, "utf8")), stash }), "utf8");
  const head8 = head(B);
  r = sync(BETA);
  check("8. a stash waiting to be given back: nothing runs, and it is named", r.result === "busy" && head(B) === head8 && r.alerts.some((a) => a.includes(stash.slice(0, 10))), JSON.stringify(r));
  git(B, "stash", "pop", "--index", "-q");
  r = sync(BETA);
  check("   given back, all goes on", ["ok", "nothing"].includes(r.result) && photo(B) === staged, JSON.stringify(r));

  // ---- 9. another synchronisation running, and GitHub unreachable
  writeFileSync(join(B, "index", "sync.lock"), String(process.pid), "utf8");
  r = sync(BETA);
  check("9. a synchronisation already running: this one waits its turn", r.result === "busy", JSON.stringify(r));
  rmSync(join(B, "index", "sync.lock"), { force: true });
  git(B, "remote", "set-url", "origin", join(BASE, "nowhere.git"));
  capture(BETA, "Offline", "written offline");
  r = sync(BETA);
  check("   GitHub unreachable: the note is committed, no alarm, it will leave next time", r.result === "offline" && r.alerts.length === 0 && git(B, "log", "-1", "--format=%s").includes("save"), JSON.stringify(r));
  git(B, "remote", "set-url", "origin", PIVOT);
  r = sync(BETA);
  check("   back online, it leaves", r.result === "ok" && r.pushed >= 1, JSON.stringify(r));

  // ---- 10. the evening on the other computer: save and sync, nothing of the runner's
  on(BETA, "routines.mjs", ["run-now"]);
  const logDir = join(BASE, "home-beta", ".hyperbrain", "logs");
  const log = existsSync(logDir) ? readFileSync(join(logDir, readdirSync(logDir).filter((n) => n.startsWith("nightly-")).sort().at(-1)), "utf8") : "";
  check("10. beta's evening: save and sync; sources, cold copy and app left to the runner", log.includes("not the runner (alpha)") && log.includes("sync.mjs exit 0") && !log.includes("sources.mjs") && !log.includes("cold-copy.mjs"), log);
} finally {
  fake.kill();
  if (process.argv.includes("--keep")) console.log(`\n  (--keep: ${BASE} left in place)`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures}/${total} FAILED\n` : `\nAll ${total} checks pass.\n`);
process.exitCode = failures ? 1 : 0;

