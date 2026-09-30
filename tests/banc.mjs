#!/usr/bin/env node
// banc.mjs - The whole journey of a brain through the plugin's scripts, in a
// throwaway folder, with a fake home (HYPERBRAIN_HOME), a fake embeddings API
// in its own process, and the evening routine only ever armed in --dry-run.
// Nothing here touches the real ~/.claude, ~/.hyperbrain, a git remote, a
// scheduler or a paid API. To run after any change to the plugin.
//
//   node tests/banc.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");
const SCRIPTS = join(PLUGIN, "scripts");
const BASE = join(tmpdir(), `hyperbrain-banc-${process.pid}`);
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
mkdirSync(HOME, { recursive: true });

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
const env = {
  ...process.env, HYPERBRAIN_HOME: HOME, HYPERBRAIN_DIR: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", HYPERBRAIN_TASK_SUFFIX: " banc",
  GIT_AUTHOR_NAME: "banc", GIT_AUTHOR_EMAIL: "banc@example.invalid", GIT_COMMITTER_NAME: "banc", GIT_COMMITTER_EMAIL: "banc@example.invalid",
};
const run = (cmd, a, o = {}) => {
  const r = spawnSync(cmd, a, { cwd: o.cwd ?? BASE, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, err };
};
const node = (script, a = [], o = {}) => run("node", [join(SCRIPTS, script), ...a], o);
// The JSON a script printed: from its first line that opens an object or an array.
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const git = (...a) => run("git", a, { cwd: BRAIN }).out.trim();

const fake = spawn("node", [join(HERE, "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const EMB = { EMBEDDINGS_API_KEY: "test-key", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1` };
const embedCalls = async () => Number(await (await fetch(`http://127.0.0.1:${port}/count`)).text());

/** Talks to the MCP server through its real protocol. */
async function mcpSession(extraEnv = {}) {
  const child = spawn("node", [join(SCRIPTS, "mcp.mjs")], { cwd: BASE, env: { ...env, ...extraEnv }, windowsHide: true });
  const lines = [];
  let buffer = "";
  child.stdout.on("data", (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
  });
  let n = 0;
  const ask = async (method, params) => {
    const id = ++n;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (let t = 0; t < 300; t++) {
      const hit = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
      if (hit) return hit;
      await new Promise((res) => setTimeout(res, 50));
    }
    return null;
  };
  const text = (r) => r?.result?.content?.[0]?.text ?? JSON.stringify(r);
  return { ask, text, lines, close: () => child.kill() };
}

try {
  console.log(`\nBanc du plugin Hyperbrain, dans ${BASE}\n`);

  // ---- before any brain
  let r = node("prereqs.mjs", ["--json"]);
  const pre = json(r.out);
  check("the audit runs and sees Node and git", r.ok && pre.node.ok && pre.git.installed && pre.brain === null, r.out);
  check("the audit records where the plugin lives", JSON.parse(readFileSync(join(HOME, ".hyperbrain", "config.json"), "utf8")).pluginRoot === PLUGIN.replace(/\\/g, "/"));
  r = node("status.mjs");
  check("a script without a brain says so and stops", r.status === 3 && r.err.includes("create-brain"), r.out);
  let m = await mcpSession();
  let init = await m.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  check("without a brain, the MCP instructions point to start-hyperbrain", init?.result?.instructions?.includes("start-hyperbrain"), JSON.stringify(init));
  let call = await m.ask("tools/call", { name: "brain_stats", arguments: {} });
  check("without a brain, a tool answers with the way to create one", m.text(call).includes("create-brain"), m.text(call));

  // ---- creation
  r = node("init.mjs", ["--dir", join(HOME, "Dropbox", "brain"), "--name", "X", "--domains", "a,b"]);
  check("init refuses a synchronised folder", !r.ok && r.out.includes("synchronised"), r.out);
  r = node("init.mjs", ["--dir", BRAIN, "--name", "Camille", "--domains", "Travail,Écriture,famille"]);
  const created = json(r.out);
  check("init creates the brain", r.ok && created.ok, r.out);
  check("domains are normalised (accents, case)", JSON.stringify(created.domains) === JSON.stringify(["travail", "ecriture", "famille"]), created.domains);
  check("init commits the template, and nothing else", created.commit === true && git("log", "--oneline").split("\n").length === 1 && git("status", "--porcelain") === "", git("status", "--porcelain"));
  check("the brain holds data only, no script", !existsSync(join(BRAIN, "scripts")) && !existsSync(join(BRAIN, "package.json")));
  check("init registers the brain for this computer", JSON.parse(readFileSync(join(HOME, ".hyperbrain", "config.json"), "utf8")).brain === BRAIN.replace(/\\/g, "/"));
  check("placeholders are filled", readFileSync(join(BRAIN, "CLAUDE.md"), "utf8").includes("Camille's second brain"));
  r = node("init.mjs", ["--dir", join(BASE, "autre"), "--name", "X", "--domains", "a,b"]);
  check("a second brain is refused without --switch", !r.ok && r.out.includes("--switch"), r.out);
  call = await m.ask("tools/call", { name: "brain_stats", arguments: {} });
  check("the MCP server started before the brain sees it at once", m.text(call).includes('"notes": 0'), m.text(call));
  m.close();

  // ---- captures
  const cap = (body, a) => node("capture.mjs", a, { input: body });
  r = cap("Le travail ne disparaît pas, il se déplace vers ce qui ne s'automatise pas.", ["--title", "Le travail se déplace", "--type", "idea", "--domains", "travail"]);
  check("capture an idea", r.ok && r.out.includes("created: vault/ideas/le-travail-se-deplace.md"), r.out);
  r = cap("Un roman sur une ville qui rêve. Voir [[le-travail-se-deplace]].", ["--title", "Projet de roman", "--type", "project", "--domains", "ecriture", "--status", "trusted"]);
  check("capture a project with a link in the body", r.ok, r.out);
  r = cap("Mes notes de santé.", ["--title", "Dossier santé", "--type", "note", "--domains", "famille", "--visibility", "private"]);
  check("capture a private note", r.ok, r.out);
  r = cap("x", ["--title", "Le travail se déplace", "--type", "idea", "--domains", "travail"]);
  check("capture refuses a name already taken", !r.ok && r.out.includes("already exists"), r.out);
  r = cap("x", ["--title", "Autre", "--type", "idea", "--domains", "sport"]);
  check("capture refuses an unknown domain", !r.ok && r.out.includes("not a domain"), r.out);
  r = cap("x", ["--title", "Autre", "--type", "idea", "--domains", "travail", "--links", "n-existe-pas"]);
  check("capture refuses a link to nothing", !r.ok && r.out.includes("point to no note"), r.out);
  r = cap("x", ["--title", "Autre", "--type", "pensee", "--domains", "travail"]);
  check("capture refuses an invented type", !r.ok, r.out);
  check("each capture is its own commit", git("log", "--oneline").split("\n").length === 4, git("log", "--oneline"));
  check("refused captures leave nothing behind", git("status", "--porcelain") === "", git("status", "--porcelain"));

  // ---- index and search (no key: text only)
  r = node("build.mjs");
  check("build without a key", r.ok && r.out.includes("3 note(s) indexed") && r.out.includes("search by meaning is off"), r.out);
  check("the index lives in the brain, out of git", existsSync(join(BRAIN, "index", "brain.sqlite")) && git("status", "--porcelain") === "", git("status", "--porcelain"));
  const search = (q, extra = []) => json(node("query.mjs", ["search", q, "--json", ...extra]).out);
  check("several words, anywhere, accents ignored", search("deplace automatise").some((x) => x.slug === "le-travail-se-deplace"));
  check("a private note is found by its title", search("sante").some((x) => x.slug === "dossier-sante"));
  check("a private note's content is never searched", !search("notes").some((x) => x.slug === "dossier-sante"));
  const got = json(node("query.mjs", ["get", "dossier-sante", "--json"]).out);
  check("a private note's content is masked", got.body.includes("never shown to an AI"), got.body);
  check("--local shows it on this computer", json(node("query.mjs", ["get", "dossier-sante", "--json", "--local"]).out).body === "Mes notes de santé.");
  const idea = json(node("query.mjs", ["get", "le-travail-se-deplace", "--json"]).out);
  check("backlinks", idea.backlinks.some((b) => b.slug === "projet-de-roman"), JSON.stringify(idea.backlinks));
  const stats = json(node("query.mjs", ["stats"]).out);
  check("stats list every domain, even empty ones", Object.keys(stats.byDomain).join() === "travail,ecriture,famille", JSON.stringify(stats.byDomain));

  // ---- a hand edit is picked up without asking for a build
  const p = join(BRAIN, "vault", "projects", "projet-de-roman.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("une ville qui rêve", "une ville qui rêve de baleines"), "utf8");
  check("queries rebuild a stale index by themselves", search("baleines").length === 1);

  // ---- a broken note: build refuses, queries keep answering, save keeps it out
  const broken = join(BRAIN, "vault", "notes", "cassee.md");
  writeFileSync(broken, "---\ntype: note\ntitle: \"Cassée\"\ndomains: []\nstatus: seed\nvisibility: internal\ncreated: 2026-09-30\nupdated: 2026-09-30\n---\n\nx\n", "utf8");
  r = node("build.mjs");
  check("the build refuses a note without a domain", !r.ok && r.out.includes("no domain"), r.out);
  r = node("query.mjs", ["search", "baleines", "--json"]);
  check("queries still answer from the previous index, with a warning", r.ok && r.err.includes("could not be refreshed") && r.out.includes("baleines"), r.err);
  r = node("save.mjs", ["--now"]);
  check("save refuses to commit the broken note", r.out.includes("NOT saved, invalid: vault/notes/cassee.md"), r.out);
  check("but it saves the valid edit next to it", git("status", "--porcelain").trim() === "?? vault/notes/cassee.md", `${git("status", "--porcelain")} | ${r.out}`);
  unlinkSync(broken);

  // ---- save waits for a note at rest
  writeFileSync(p, readFileSync(p, "utf8").replace("baleines", "baleines bleues"), "utf8");
  r = node("save.mjs");
  check("a note edited a minute ago waits", r.out.includes("still being edited"), r.out);
  const old = new Date(Date.now() - 3600_000);
  utimesSync(p, old, old);
  r = node("save.mjs");
  check("the same note, at rest, is saved", r.out.startsWith("saved: 1"), r.out);

  // ---- semantic search, and vectors in git
  r = node("build.mjs", [], { env: EMB });
  check("build computes the vectors with a key", r.ok && r.out.includes("2 computed"), r.out);
  check("the private note has no vector", !existsSync(join(BRAIN, "index", "embeddings", "dossier-sante.json")));
  r = node("query.mjs", ["search", "--meaning", "travail automatise", "--json"], { env: EMB });
  check("search by meaning", r.ok && json(r.out)[0]?.slug === "le-travail-se-deplace", r.out);
  const nb = json(node("query.mjs", ["neighbors", "projet-de-roman"], { env: EMB }).out);
  check("neighbors by meaning", nb.similar.some((s) => s.slug === "le-travail-se-deplace"), JSON.stringify(nb));
  node("save.mjs", ["--now"]);
  check("the vectors are committed", git("ls-files", "index/embeddings").split("\n").filter(Boolean).length === 2, git("ls-files"));
  const CLONE = join(BASE, "clone");
  run("git", ["clone", "-q", BRAIN, CLONE]);
  const before = await embedCalls();
  r = node("build.mjs", [], { env: { ...EMB, HYPERBRAIN_DIR: CLONE } });
  check("a clone gets its vectors from git, with no API call", r.ok && r.out.includes("2 taken from git") && (await embedCalls()) === before, `${r.out} calls ${(await embedCalls()) - before}`);
  check("and its tree stays clean", run("git", ["status", "--porcelain"], { cwd: CLONE }).out.trim() === "");

  // ---- the MCP server with a brain
  m = await mcpSession(EMB);
  init = await m.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  check("the MCP instructions name the person and the capture skill", init?.result?.instructions?.includes("Camille has a second brain") && init.result.instructions.includes("/hyperbrain:brain"), init?.result?.instructions);
  const list = await m.ask("tools/list", {});
  check("MCP lists five tools", list?.result?.tools?.length === 5, JSON.stringify(list));
  call = await m.ask("tools/call", { name: "brain_search", arguments: { query: "roman" } });
  check("MCP search", m.text(call).includes("projet-de-roman"), m.text(call));
  call = await m.ask("tools/call", { name: "brain_search", arguments: { query: "automatise travail", meaning: true } });
  check("MCP search by meaning", m.text(call).includes("le-travail-se-deplace"), m.text(call));
  call = await m.ask("tools/call", { name: "brain_get", arguments: { slug: "dossier-sante" } });
  check("MCP never returns a private note's content", !m.text(call).includes("Mes notes"), m.text(call));
  call = await m.ask("nope", {});
  check("MCP answers an unknown method with an error", call?.error?.code === -32601);
  check("MCP prints nothing but protocol on stdout", m.lines.every((l) => l.startsWith("{")), m.lines.find((l) => !l.startsWith("{")));
  m.close();

  // ---- the weekly review
  const idPath = join(BRAIN, "vault", "ideas", "le-travail-se-deplace.md");
  const notePath = join(BRAIN, "vault", "notes", "vieille-note.md");
  writeFileSync(notePath, "---\ntype: note\ntitle: \"Vieille note\"\ndomains: [travail]\nstatus: seed\nvisibility: internal\ncreated: 2026-01-01\nupdated: 2026-01-01\nsource: \"banc\"\n---\n\nUne note ancienne.\n", "utf8");
  writeFileSync(idPath, `${readFileSync(idPath, "utf8")}\n[[vieille-note]]\n`, "utf8");
  r = node("review.mjs", ["--apply"]);
  check("the review writes its report", r.ok && existsSync(join(BRAIN, "reviews", `${new Date().toISOString().slice(0, 10)}.md`)), r.out);
  check("an old seed linked from another day is promoted", readFileSync(notePath, "utf8").includes("status: trusted"), readFileSync(notePath, "utf8"));
  check("an idea is never promoted by the machine", readFileSync(idPath, "utf8").includes("status: seed"));
  r = node("status.mjs", ["--json"]);
  const st = json(r.out);
  check("status reads the brain", r.ok && st.notes === 4 && st.git === true && st.remote === false && st.dir === BRAIN.replace(/\\/g, "/"), r.out);

  // ---- the routines, never armed for real here
  r = node("routines.mjs", ["arm", "--time", "21:30", "--dry-run"]);
  const armed = json(r.out);
  check("arming the evening save (dry run) names its own test task", r.ok && armed.ok && armed.armed.endsWith(" banc") && armed.time === "21:30", r.out);
  r = node("routines.mjs", ["arm", "--time", "25:00", "--dry-run"]);
  check("a wrong time is refused", !r.ok, r.out);
  r = node("routines.mjs", ["note-review", "--when", "dimanche 18:00", "--id", "hyperbrain-weekly-review"]);
  check("the weekly review is recorded", r.ok && json(r.out).review.when === "dimanche 18:00", r.out);
  r = node("routines.mjs", ["run-now"]);
  const now = json(r.out);
  check("the evening save runs through its launcher", r.ok && now.lastRun.some((l) => l.includes("build.mjs exit 0")) && now.lastRun.some((l) => l.includes("save.mjs exit 0")), r.out);
  // The idea was edited a minute ago: it waits for its rest, the rest is saved.
  check("and it saved the review and the promotion, not the note edited a minute ago", git("status", "--porcelain") === "M vault/ideas/le-travail-se-deplace.md", git("status", "--porcelain"));
  r = node("routines.mjs", ["state", "--json"]);
  check("state reports the review and the last run", r.ok && json(r.out).review?.when === "dimanche 18:00" && json(r.out).lastLog, r.out);
} finally {
  fake.kill();
  if (process.argv.includes("--keep")) console.log(`\n  (--keep: ${BASE} left in place)`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures}/${total} FAILED\n` : `\nAll ${total} checks pass.\n`);
process.exitCode = failures ? 1 : 0;
