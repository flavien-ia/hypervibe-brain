#!/usr/bin/env node
// banc.mjs - The whole journey of a new brain, in a throwaway folder, with a
// fake home (HYPERBRAIN_HOME) and a fake embeddings server: nothing here
// touches the real ~/.claude, git remotes, or any paid API.
//
//   node tests/banc.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = join(HERE, "..", "outils");
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
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 500)}` : ""}`);
  }
};
const env = { ...process.env, HYPERBRAIN_HOME: HOME, OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", GIT_AUTHOR_NAME: "banc", GIT_AUTHOR_EMAIL: "banc@example.invalid", GIT_COMMITTER_NAME: "banc", GIT_COMMITTER_EMAIL: "banc@example.invalid" };
const run = (cmd, a, o = {}) => {
  try {
    const r = spawnSync(cmd, a, { cwd: o.cwd ?? BRAIN, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
    const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
    return { ok: r.status === 0, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, err };
  } catch (e) {
    return { ok: false, out: String(e.message), err: "" };
  }
};
const node = (script, a = [], o = {}) => run("node", [join(BRAIN, "scripts", script), ...a], o);
// The JSON a script printed: from its first line that opens an object or an array.
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const git = (...a) => run("git", a).out.trim();

// The fake embeddings API, in its own process (see faux-embeddings.mjs).
const fake = spawn("node", [join(HERE, "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const EMB = { EMBEDDINGS_API_KEY: "test-key", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1` };
const embedCalls = async () => Number(await (await fetch(`http://127.0.0.1:${port}/count`)).text());

try {
  console.log(`\nBanc de create-hyperbrain, dans ${BASE}\n`);

  // ---- creation
  let r = run("node", [join(TOOLS, "init.mjs"), "--dir", BRAIN, "--name", "Camille", "--domains", "Travail,Écriture,famille"], { cwd: BASE });
  const init = json(r.out);
  check("init creates the brain", r.ok && init.ok, r.out);
  check("domains are normalised (accents, case)", JSON.stringify(init.domains) === JSON.stringify(["travail", "ecriture", "famille"]), init.domains);
  check("init commits the template", init.commit === true && git("log", "--oneline").split("\n").length === 1, r.out);
  check("the tree is clean after init", git("status", "--porcelain") === "", git("status", "--porcelain"));
  check("placeholders are filled", !readFileSync(join(BRAIN, "CLAUDE.md"), "utf8").includes("{{NAME}}") && readFileSync(join(BRAIN, "CLAUDE.md"), "utf8").includes("Camille"));
  r = run("node", [join(TOOLS, "init.mjs"), "--dir", BRAIN, "--name", "X", "--domains", "a,b"], { cwd: BASE });
  check("init refuses a folder that is not empty", !r.ok && json(r.out).ok === false);

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
  const search = (q, extra = []) => json(node("query.mjs", ["search", q, "--json", ...extra]).out);
  check("several words, anywhere, accents ignored", search("deplace automatise").some((x) => x.slug === "le-travail-se-deplace"));
  check("a private note is found by its title", search("sante").some((x) => x.slug === "dossier-sante"));
  check("a private note's content is never searched", !search("notes").some((x) => x.slug === "dossier-sante"));
  const got = json(node("query.mjs", ["get", "dossier-sante", "--json"]).out);
  check("a private note's content is masked", got.body.includes("never shown to an AI"), got.body);
  check("--local shows it on this computer", json(node("query.mjs", ["get", "dossier-sante", "--json", "--local"]).out).body === "Mes notes de santé.");
  const idea = json(node("query.mjs", ["get", "le-travail-se-deplace", "--json"]).out);
  check("backlinks", idea.backlinks.some((b) => b.slug === "projet-de-roman"), JSON.stringify(idea.backlinks));
  check("the build leaves git clean (no vectors without a key)", git("status", "--porcelain") === "", git("status", "--porcelain"));

  // ---- a hand edit is picked up without asking for a build
  const p = join(BRAIN, "vault", "projects", "projet-de-roman.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("une ville qui rêve", "une ville qui rêve de baleines"), "utf8");
  check("queries rebuild a stale index by themselves", search("baleines").length === 1);

  // ---- a broken note: build refuses, queries keep answering
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
  // A fresh clone: the vectors come back from git, not from the API.
  const CLONE = join(BASE, "clone");
  run("git", ["clone", "-q", BRAIN, CLONE], { cwd: BASE });
  const before = await embedCalls();
  r = run("node", [join(CLONE, "scripts", "build.mjs")], { cwd: CLONE, env: EMB });
  check("a clone gets its vectors from git, with no API call", r.ok && r.out.includes("2 taken from git") && (await embedCalls()) === before, `${r.out} calls ${(await embedCalls()) - before}`);
  check("and its tree stays clean", run("git", ["status", "--porcelain"], { cwd: CLONE }).out.trim() === "");

  // ---- the MCP server, through its real protocol
  const mcp = spawn("node", [join(BRAIN, "scripts", "mcp.mjs")], { cwd: BASE, env: { ...env, ...EMB }, windowsHide: true });
  const lines = [];
  let buffer = "";
  mcp.stdout.on("data", (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
  });
  const ask = async (id, method, params) => {
    mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (let t = 0; t < 200; t++) {
      const hit = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
      if (hit) return hit;
      await new Promise((res) => setTimeout(res, 50));
    }
    return null;
  };
  const initR = await ask(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  check("MCP initialize", initR?.result?.serverInfo?.name === "Camille-brain", JSON.stringify(initR));
  mcp.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const list = await ask(2, "tools/list", {});
  check("MCP lists five tools", list?.result?.tools?.length === 5, JSON.stringify(list));
  const call = await ask(3, "tools/call", { name: "brain_search", arguments: { query: "roman" } });
  check("MCP search", call?.result?.content?.[0]?.text?.includes("projet-de-roman"), JSON.stringify(call));
  const priv = await ask(4, "tools/call", { name: "brain_get", arguments: { slug: "dossier-sante" } });
  check("MCP never returns a private note's content", !priv?.result?.content?.[0]?.text?.includes("Mes notes"), JSON.stringify(priv));
  const unknown = await ask(5, "nope", {});
  check("MCP answers an unknown method with an error", unknown?.error?.code === -32601);
  check("MCP prints nothing but protocol on stdout", lines.every((l) => l.startsWith("{")), lines.find((l) => !l.startsWith("{")));
  mcp.kill();

  // ---- plugging into Claude, in a fake home that already has a foreign "brain"
  mkdirSync(join(HOME, ".claude", "skills", "brain"), { recursive: true });
  writeFileSync(join(HOME, ".claude", "skills", "brain", "SKILL.md"), "someone else's skill\n", "utf8");
  writeFileSync(join(HOME, ".claude.json"), JSON.stringify({ numStartups: 7, mcpServers: { brain: { type: "stdio", command: "node", args: ["C:/elsewhere/serveur.mjs"] } } }), "utf8");
  writeFileSync(join(HOME, ".claude", "CLAUDE.md"), "# My rules\n\nKeep this.\n", "utf8");
  r = run("node", [join(TOOLS, "connect.mjs"), "--dir", BRAIN, "--check"], { cwd: BASE });
  check("check before connecting says what is missing", !r.ok && json(r.out).missing.length === 3, r.out);
  r = run("node", [join(TOOLS, "connect.mjs"), "--dir", BRAIN], { cwd: BASE });
  const c = json(r.out);
  check("connect takes other names when brain is taken", c.ok && c.mcp === "hyperbrain" && c.skill === "hyperbrain", r.out);
  const cj = JSON.parse(readFileSync(join(HOME, ".claude.json"), "utf8"));
  check("the foreign MCP server and the rest of .claude.json are untouched", cj.mcpServers.brain.args[0] === "C:/elsewhere/serveur.mjs" && cj.numStartups === 7);
  check(".claude.json is backed up once", existsSync(join(HOME, ".claude.json.bak-hyperbrain")));
  check("the foreign skill is untouched", readFileSync(join(HOME, ".claude", "skills", "brain", "SKILL.md"), "utf8") === "someone else's skill\n");
  const md = readFileSync(join(HOME, ".claude", "CLAUDE.md"), "utf8");
  check("the global CLAUDE.md keeps its content and gains the block", md.startsWith("# My rules\n\nKeep this.") && md.includes("`/hyperbrain`") && md.includes("MCP `hyperbrain`"), md);
  r = run("node", [join(TOOLS, "connect.mjs"), "--dir", BRAIN], { cwd: BASE });
  check("connect is idempotent", json(r.out).changed.length === 0, r.out);
  check("the block is not duplicated", readFileSync(join(HOME, ".claude", "CLAUDE.md"), "utf8").split("hyperbrain:start").length === 2);
  r = run("node", [join(TOOLS, "connect.mjs"), "--dir", BRAIN, "--check"], { cwd: BASE });
  check("check after connecting is green", r.ok && json(r.out).ok, r.out);
  r = run("node", [join(TOOLS, "connect.mjs"), "--dir", BRAIN, "--remove"], { cwd: BASE });
  const cj2 = JSON.parse(readFileSync(join(HOME, ".claude.json"), "utf8"));
  check("remove takes back only what is this brain's", r.ok && !cj2.mcpServers.hyperbrain && cj2.mcpServers.brain && !existsSync(join(HOME, ".claude", "skills", "hyperbrain")) && existsSync(join(HOME, ".claude", "skills", "brain", "SKILL.md")) && readFileSync(join(HOME, ".claude", "CLAUDE.md"), "utf8").trim() === "# My rules\n\nKeep this.", r.out);
  run("node", [join(TOOLS, "connect.mjs"), "--dir", BRAIN], { cwd: BASE });

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
  const st = json(r.out.slice(r.out.indexOf("{")));
  check("status reads the brain", r.ok && st.notes === 4 && st.git === true && st.remote === false, r.out);
} finally {
  fake.kill();
  if (process.argv.includes("--keep")) console.log(`\n  (--keep: ${BASE} left in place)`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures}/${total} FAILED\n` : `\nAll ${total} checks pass.\n`);
process.exitCode = failures ? 1 : 0;
