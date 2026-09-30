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
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..");
const SCRIPTS = join(PLUGIN, "scripts");
const BASE = join(tmpdir(), `hyperbrain-banc-${process.pid}`);
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
mkdirSync(HOME, { recursive: true });
// A git configuration of its own: the bench neither reads nor needs the
// person's (a fresh machine, like the CI's, has no git identity at all).
const GITCONFIG = join(BASE, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n\tname = banc\n\temail = banc@example.invalid\n[init]\n\tdefaultBranch = main\n", "utf8");

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
  ...process.env, HYPERBRAIN_HOME: HOME, HYPERBRAIN_DIR: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", HYPERBRAIN_TASK_SUFFIX: " banc", GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_NOSYSTEM: "1",
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
// The local date, as the scripts write it (not UTC: between midnight and 2 am in Paris they differ).
const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
  // As they are really named: OneDrive for business on Windows, CloudStorage and iCloud on macOS.
  for (const synced of [["OneDrive - Acme", "Documents"], ["Library", "CloudStorage", "GoogleDrive-x@y.z", "My Drive"], ["Library", "Mobile Documents", "com~apple~CloudDocs"]]) {
    r = node("init.mjs", ["--dir", join(HOME, ...synced, "brain"), "--name", "X", "--domains", "a,b"]);
    check(`init refuses ${synced.join("/")}`, !r.ok && r.out.includes("synchronised"), r.out);
  }
  r = node("init.mjs", ["--dir", BRAIN, "--name", "Camille", "--domains", "Travail,Écriture,famille", "--lang", "en"]);
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
  check("MCP lists six tools", list?.result?.tools?.length === 6, JSON.stringify(list));
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

  // ---- the components
  const WATCHED = join(BASE, "ecrits");
  mkdirSync(WATCHED, { recursive: true });
  writeFileSync(join(WATCHED, "chapitre-1.md"), "Il était une fois.\n", "utf8");
  const COLD = join(BASE, "disque-externe");
  mkdirSync(COLD, { recursive: true });
  r = node("components.mjs", ["source", "journal", "on"]);
  check("a living source is switched on", r.ok && json(r.out).sources.journal === true, r.out);
  r = node("components.mjs", ["source", "telepathy", "on"]);
  check("an unknown source is refused", !r.ok, r.out);
  r = node("components.mjs", ["set", "journal", "on"]);
  check("a source is not a module", !r.ok, r.out);
  r = node("components.mjs", ["watch", "add", WATCHED]);
  check("a folder is watched", r.ok && json(r.out).sources.watch.length === 1, r.out);
  r = node("components.mjs", ["cold-copy", join(BRAIN, "vault")]);
  check("the cold copy cannot live inside the brain", !r.ok, r.out);
  r = node("components.mjs", ["cold-copy", COLD]);
  check("the cold copy folder is recorded", r.ok && json(r.out).modules.coldCopy === COLD.replace(/\\/g, "/"), r.out);

  // ---- the work journal, the hook of the plugin
  const hook = (payload, extra = {}) => run("node", [join(SCRIPTS, "hook-journal.mjs")], { input: JSON.stringify(payload), env: extra });
  const JOURNAL = join(HOME, ".hyperbrain", "journal.jsonl");
  r = hook({ session_id: "s1", cwd: join(BASE, "projet-roman") });
  check("the hook is silent", r.ok && r.out.trim() === "", r.out);
  hook({ session_id: "s1", cwd: join(BASE, "projet-roman") });
  hook({ session_id: "s2", cwd: join(BASE, "site-web") });
  // A session in a real repository: its commits of the week come with it.
  hook({ session_id: "s3", cwd: BRAIN });
  const jl = readFileSync(JOURNAL, "utf8").trim().split("\n");
  check("one line per session, no duplicate, in the same format as the brain's own sensors", jl.length === 3 && jl[0].includes("projet-roman") && JSON.parse(jl[0]).type === "session", jl.join(" | "));
  r = hook("not json at all");
  check("the hook never fails, even on nonsense", r.ok);

  // A source that points to a file that is gone.
  r = cap("Tiré d'un brouillon disparu.", ["--title", "Brouillon perdu", "--type", "note", "--domains", "ecriture", "--source", join(BASE, "n-existe-plus.docx")]);
  check("capture with a local source", r.ok, r.out);

  // ---- the weekly review
  const idPath = join(BRAIN, "vault", "ideas", "le-travail-se-deplace.md");
  const notePath = join(BRAIN, "vault", "notes", "vieille-note.md");
  writeFileSync(notePath, "---\ntype: note\ntitle: \"Vieille note\"\ndomains: [travail]\nstatus: seed\nvisibility: internal\ncreated: 2026-01-01\nupdated: 2026-01-01\nsource: \"banc\"\n---\n\nUne note ancienne.\n", "utf8");
  writeFileSync(idPath, `${readFileSync(idPath, "utf8")}\n[[vieille-note]]\n`, "utf8");
  r = node("review.mjs", ["--apply"]);
  check("the review writes its report", r.ok && existsSync(join(BRAIN, "reviews", `${localDay()}.md`)), r.out);
  check("an old seed linked from another day is promoted", readFileSync(notePath, "utf8").includes("status: trusted"), readFileSync(notePath, "utf8"));
  check("an idea is never promoted by the machine", readFileSync(idPath, "utf8").includes("status: seed"));
  const report = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
  check("the report is in the brain's language", report.startsWith("# Review of Camille's brain"), report.slice(0, 80));
  check("the report lists the dead source", report.includes("[[brouillon-perdu]]") && report.includes("1 source(s) pointing to a file"), report);
  check("the report tells what was worked on", report.includes("projet-roman: 1 session(s)") && report.includes("site-web"), report);
  check("with the commits of the week, read from the project's own history", /- brain: 1 session\(s\), last on [0-9-]+, [0-9]+ commit\(s\)/.test(report) && report.includes("  - capture: "), report);
  check("the report lists what moved in the watched folders", report.includes("chapitre-1.md"), report);
  r = node("status.mjs", ["--json"]);
  const st = json(r.out);
  check("status reads the brain and its components", r.ok && st.notes === 5 && st.git === true && st.remote === false && st.dir === BRAIN.replace(/\\/g, "/") && st.sources.journal === true, r.out);

  // ---- the cold copy
  node("save.mjs", ["--now"]);
  r = node("cold-copy.mjs");
  const cold = json(r.out);
  check("the cold copy writes a verified archive", r.ok && cold.ok && existsSync(cold.archive ?? "") && cold.commits > 3, r.out);
  r = node("cold-copy.mjs");
  check("a second one the same week is skipped", r.ok && json(r.out).skipped?.includes("recent"), r.out);
  const RESTORED = join(BASE, "restaure");
  r = run("git", ["clone", "-q", cold.archive, RESTORED]);
  check("the archive restores the whole brain", r.ok && existsSync(join(RESTORED, "vault", "ideas", "le-travail-se-deplace.md")), r.out);

  // ---- seeing the brain
  r = node("viz.mjs", ["detect"]);
  check("no Hypervibe in the fake home", r.ok && json(r.out).hypervibe === false, r.out);
  const HV = join(HOME, ".claude", "plugins", "marketplaces", "x", "hypervibe", ".claude-plugin");
  mkdirSync(HV, { recursive: true });
  writeFileSync(join(HV, "plugin.json"), JSON.stringify({ name: "hypervibe", version: "9.9.9" }), "utf8");
  r = node("viz.mjs", ["detect"]);
  check("Hypervibe is detected where Claude installs plugins", r.ok && json(r.out).hypervibe === true, r.out);
  r = node("viz.mjs", ["build"]);
  const page = existsSync(join(BRAIN, "viz", "brain.html")) ? readFileSync(join(BRAIN, "viz", "brain.html"), "utf8") : "";
  check("the simple viewer is written", r.ok && page.includes("Projet de roman") && !page.includes("HYPERBRAIN_DATA*/null"), r.out);
  check("the viewer never holds a private note's content", page.includes("Dossier santé") && !page.includes("Mes notes de santé"));
  check("the viewer stays out of git", git("check-ignore", "viz/brain.html") === "viz/brain.html");
  const exported = json(node("viz.mjs", ["export"]).out);
  const privNode = exported.nodes.find((n) => n.id === "dossier-sante");
  check("the app's data: private notes without content, no local path", privNode?.excerpt === "" && privNode.private === true && exported.nodes.every((n) => !("file" in n)) && exported.nodes.find((n) => n.id === "brouillon-perdu")?.source === "", JSON.stringify(privNode));
  const APP = join(BASE, "app");
  mkdirSync(APP, { recursive: true });
  run("git", ["init", "-q", "-b", "main"], { cwd: APP });
  writeFileSync(join(APP, "README.md"), "app\n", "utf8");
  run("git", ["add", "README.md"], { cwd: APP });
  run("git", ["commit", "-q", "-m", "app"], { cwd: APP });
  r = node("components.mjs", ["viz-app", APP]);
  check("the app is recorded, without automatic push unless asked", r.ok && json(r.out).modules.vizApp.autoPush === false, r.out);
  r = node("viz.mjs", ["publish-app"]);
  check("the app's data is committed in the app, not pushed", r.ok && json(r.out).committed === true && json(r.out).pushed === false && existsSync(join(APP, "data", "brain-graph.json")), r.out);
  r = node("viz.mjs", ["publish-app"]);
  check("unchanged data is not committed again", r.ok && json(r.out).unchanged === true, r.out);

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
  check("the evening save runs through its launcher, all its steps", r.ok && ["save.mjs exit 0", "cold-copy.mjs exit 0", "viz.mjs exit 0"].every((s) => now.lastRun.some((l) => l.includes(s))), r.out);
  // Everything was saved just before the cold copy: nothing is left behind.
  check("and nothing is left unsaved in the brain", git("status", "--porcelain") === "", git("status", "--porcelain"));
  const logToday = join(HOME, ".hyperbrain", "logs", `nightly-${localDay()}.log`);
  const linesBefore = readFileSync(logToday, "utf8").trim().split("\n").length;
  r = run("node", [join(HOME, ".hyperbrain", "nightly.mjs")]);
  check("started again by the scheduler the same evening, the save does nothing", r.ok && readFileSync(logToday, "utf8").trim().split("\n").length === linesBefore, readFileSync(logToday, "utf8"));
  writeFileSync(join(HOME, ".hyperbrain", "nightly.lock"), String(process.pid), "utf8");
  r = run("node", [join(HOME, ".hyperbrain", "nightly.mjs"), "--force"]);
  check("two saves never run at once", r.ok && readFileSync(logToday, "utf8").includes("another save is running"), readFileSync(logToday, "utf8"));
  unlinkSync(join(HOME, ".hyperbrain", "nightly.lock"));
  r = node("routines.mjs", ["state", "--json"]);
  check("state reports the review and the last run", r.ok && json(r.out).review?.when === "dimanche 18:00" && json(r.out).lastLog, r.out);

  // ---- the person's own sources
  // A source program for the bench: it prints the items of data.json, and
  // fails when a file named "fail" is next to it.
  const SOURCE_PROGRAM = [
    'import { existsSync, readFileSync } from "node:fs";',
    'if (existsSync("fail")) { console.log(JSON.stringify({ id: "x", title: "partial" })); console.error("the feed is down"); process.exit(1); }',
    'for (const x of JSON.parse(readFileSync("data.json", "utf8"))) console.log(JSON.stringify(x));',
    "",
  ].join("\n");
  const notesCount = () => json(node("query.mjs", ["stats"]).out).notes;
  r = node("sources.mjs", ["add", "lectures", "--kind", "script", "--every", "day", "--type", "source", "--domains", "ecriture", "--description", "My reading list"]);
  const lectures = join(BRAIN, "sources", "lectures");
  check("a source of one's own is created, with its program and its contract", r.ok && existsSync(join(lectures, "run.mjs")) && readFileSync(join(lectures, "run.mjs"), "utf8").includes("ONE JSON OBJECT PER LINE"), r.out);
  r = node("sources.mjs", ["add", "lectures", "--kind", "script", "--type", "source", "--domains", "ecriture"]);
  check("never twice the same source", !r.ok, r.out);
  r = node("sources.mjs", ["add", "autre", "--kind", "script", "--type", "pensee", "--domains", "ecriture"]);
  check("a source must produce one of the brain's types", !r.ok, r.out);
  writeFileSync(join(lectures, "run.mjs"), SOURCE_PROGRAM, "utf8");
  writeFileSync(join(lectures, "data.json"), JSON.stringify([
    { id: "calvino", title: "Les Villes invisibles", body: "Calvino : chaque ville comme un état d'âme.", fields: { url: "https://example.org/calvino", auteur: "Italo Calvino" }, created: "2025-03-02" },
    { id: "perec", title: "Espèces d'espaces", body: "Perec : habiter, nommer, décrire." },
    { id: "bad", title: "Mal rangé", body: "x", type: "pensee" },
  ]), "utf8");
  const beforeSources = notesCount();
  r = node("sources.mjs", ["test", "lectures"]);
  const tested = json(r.out);
  check("its test runs it, checks every note, and says what it would do", r.ok && tested.items === 3 && tested.new === 2 && tested.refused.length === 1 && tested.sample[0].title === "Les Villes invisibles", r.out);
  check("and writes nothing", notesCount() === beforeSources);
  r = node("sources.mjs", ["run", "lectures"]);
  check("a program never approved on this computer does not run", r.ok && json(r.out).runs[0].skipped?.includes("not approved"), r.out);
  check("and nothing is written", notesCount() === beforeSources);
  node("sources.mjs", ["trust", "lectures"]);
  r = node("sources.mjs", ["run", "lectures"]);
  const run1 = json(r.out).runs[0];
  check("approved, it runs: two notes created, the wrong one refused and named", r.ok && run1.created === 2 && run1.refused.length === 1 && run1.refused[0].startsWith("bad:"), r.out);
  const calvino = readFileSync(join(BRAIN, "vault", "sources", "les-villes-invisibles.md"), "utf8");
  check("its notes carry their origin, their own date and their extra fields", calvino.includes('source: "source:lectures:calvino"') && calvino.includes("created: 2025-03-02") && calvino.includes('url: "https://example.org/calvino"') && calvino.includes("status: seed"), calvino);
  r = node("sources.mjs", ["run", "lectures"]);
  check("run again, nothing is created twice", r.ok && json(r.out).runs[0].created === 0 && json(r.out).runs[0].unchanged === 2, r.out);
  r = node("sources.mjs", ["run", "--due"]);
  check("a daily source that succeeded today is not due again", r.ok && !json(r.out).runs.some((x) => x.name === "lectures"), r.out);
  writeFileSync(join(lectures, "run.mjs"), `${SOURCE_PROGRAM}// changed\n`, "utf8");
  r = node("sources.mjs", ["run", "lectures"]);
  check("a program that changed must be approved again", r.ok && json(r.out).runs[0].skipped?.includes("not approved"), r.out);
  node("sources.mjs", ["trust", "lectures"]);
  writeFileSync(join(lectures, "fail"), "", "utf8");
  const beforeFail = notesCount();
  r = node("sources.mjs", ["run", "lectures"]);
  check("a source that fails writes nothing, even what it printed before failing", r.ok && json(r.out).runs[0].ok === false && json(r.out).runs[0].error.includes("the feed is down") && notesCount() === beforeFail, r.out);
  check("and keeps the date of its last success", JSON.parse(readFileSync(join(lectures, "state.json"), "utf8")).lastSuccess && JSON.parse(readFileSync(join(lectures, "state.json"), "utf8")).lastError.includes("the feed is down"));
  unlinkSync(join(lectures, "fail"));

  // A source allowed to refresh its own seeds, never a validated note.
  node("sources.mjs", ["add", "posts", "--kind", "script", "--every", "week", "--type", "publication", "--domains", "travail", "--updates"]);
  const posts = join(BRAIN, "sources", "posts");
  writeFileSync(join(posts, "run.mjs"), SOURCE_PROGRAM, "utf8");
  const postData = (likes) => writeFileSync(join(posts, "data.json"), JSON.stringify([{ id: "p1", title: "Mon post sur le travail", body: `Le post. ${likes} likes.`, fields: { likes } }]), "utf8");
  postData(10);
  node("sources.mjs", ["trust", "posts"]);
  node("sources.mjs", ["run", "posts"]);
  const postPath = join(BRAIN, "vault", "publications", "mon-post-sur-le-travail.md");
  postData(25);
  r = node("sources.mjs", ["run", "posts"]);
  check("a source refreshes its own seed", r.ok && json(r.out).runs[0].updated === 1 && readFileSync(postPath, "utf8").includes("25 likes") && readFileSync(postPath, "utf8").includes("likes: 25"), r.out);
  writeFileSync(postPath, readFileSync(postPath, "utf8").replace("status: seed", "status: trusted"), "utf8");
  postData(99);
  r = node("sources.mjs", ["run", "posts"]);
  check("but never a note the person validated", r.ok && json(r.out).runs[0].updated === 0 && readFileSync(postPath, "utf8").includes("25 likes"), r.out);

  // A source done by Claude.
  r = node("sources.mjs", ["add", "linkedin", "--kind", "claude", "--every", "week", "--type", "publication", "--domains", "travail"]);
  check("a source done by Claude gets its instructions", r.ok && existsSync(join(BRAIN, "sources", "linkedin", "instructions.md")), r.out);
  r = node("sources.mjs", ["run", "linkedin"]);
  check("it is never run as a program", r.ok && json(r.out).runs[0].skipped?.includes("Claude"), r.out);
  node("sources.mjs", ["mark", "linkedin", "--ok", "--created", "3"]);
  const listed = json(node("sources.mjs", ["list", "--json"]).out).sources;
  check("the list tells each source's kind, approval and state", listed.find((x) => x.name === "linkedin")?.lastSuccess && listed.find((x) => x.name === "lectures")?.trusted === true && listed.find((x) => x.name === "lectures")?.notes === 2, JSON.stringify(listed));
  node("review.mjs");
  const ownReport = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
  check("the weekly report tells what each source brought", ownReport.includes("## Your own sources (3)") && ownReport.includes("- linkedin (done by Claude): last success") && ownReport.includes("- posts (read automatically)"), ownReport);
  r = node("save.mjs", ["--now"]);
  check("the sources are saved with the brain (definitions, programs, what they saw)", git("ls-files", "sources").includes("sources/lectures/run.mjs") && git("ls-files", "sources").includes("sources/lectures/seen.json"), git("ls-files", "sources"));

  // ---- the contacts directory
  const upsertC = (lines, extra = []) => node("contacts.mjs", ["upsert", ...extra], { input: lines.map((l) => JSON.stringify(l)).join("\n") });
  r = node("contacts.mjs", ["enable", "--core", "20", "--matters", "4"]);
  check("the directory is switched on, with the brain's own thresholds", r.ok && json(r.out).contacts.core === 20, r.out);
  r = upsertC([
    { address: "Marie.Durand@Horizon.fr", name: "Marie Durand", sent: 12, received: 9, first: "2026-07-01", last: "2026-09-20", subjects: ["Atelier du jeudi"], summary: "Directrice de l'innovation, Studio Horizon" },
    { address: "news@shop.example", name: "Shop", sent: 0, received: 40, subjects: ["Promo"] },
    { address: "paul@editions.fr", name: "Paul Éditeur", sent: 2, received: 1, last: "2026-09-01" },
    { address: "pas-une-adresse", name: "?" },
  ]);
  check("contacts go in; an invalid address is ignored", r.ok && json(r.out).added === 3 && json(r.out).total === 3, r.out);
  r = upsertC([{ address: "marie.durand@horizon.fr", sent: 10, received: 4, last: "2026-09-29", subjects: ["Budget 2027"] }]);
  const dirFile = JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8"));
  const marie = dirFile.contacts.find((c) => c.address === "marie.durand@horizon.fr");
  check("a week observed adds to the counts, widens the dates, joins the subjects", marie.sent === 22 && marie.received === 13 && marie.first === "2026-07-01" && marie.last === "2026-09-29" && marie.subjects.includes("Budget 2027") && marie.subjects.includes("Atelier du jeudi"), JSON.stringify(marie));
  check("tiers: the core by the brain's threshold, a one-way sender never rises", marie.tier === 2 && dirFile.contacts.find((c) => c.address === "news@shop.example").tier === 0 && dirFile.contacts.find((c) => c.address === "paul@editions.fr").tier === 0, JSON.stringify(dirFile.contacts.map((c) => [c.address, c.tier])));
  check("an English brain writes directory.json with English fields", "address" in marie && "tier" in marie && !existsSync(join(BRAIN, "index", "annuaire.json")));
  r = upsertC([{ address: "paul@editions.fr", sent: 3, received: 2 }], ["--set-counts"]);
  const paul = JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8")).contacts.find((c) => c.address === "paul@editions.fr");
  check("a full recount replaces the counts", paul.sent === 3 && paul.received === 2 && paul.tier === 1, JSON.stringify(paul));
  r = node("contacts.mjs", ["search", "innovation horizon", "--json"]);
  check("search: every word, anywhere in what is known", r.ok && json(r.out).found[0]?.name === "Marie Durand", r.out);
  r = node("contacts.mjs", ["search", "editeur", "--json"]);
  check("search: accents ignored", r.ok && json(r.out).found[0]?.name === "Paul Éditeur", r.out);
  r = node("contacts.mjs", ["promote", "marie.durand@horizon.fr", "--domains", "travail"]);
  const marieNote = existsSync(join(BRAIN, "vault", "people", "marie-durand.md")) ? readFileSync(join(BRAIN, "vault", "people", "marie-durand.md"), "utf8") : "";
  check("a contact becomes a note, in the brain's type for people", r.ok && marieNote.includes("type: person") && marieNote.includes("Directrice de l'innovation"), r.out);
  check("its address stays in the source, never in the text", marieNote.includes('source: "contact:marie.durand@horizon.fr"') && marieNote.split("---").slice(2).join("---").indexOf("@") === -1, marieNote);
  check("and the directory points to it", JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8")).contacts.find((c) => c.address === "marie.durand@horizon.fr").note === "marie-durand");
  r = node("contacts.mjs", ["promote", "marie.durand@horizon.fr", "--domains", "travail"]);
  check("never two notes for the same person", !r.ok, r.out);
  // A source of one's own may feed the directory.
  node("sources.mjs", ["add", "carnet", "--kind", "script", "--every", "week", "--type", "person", "--domains", "travail"]);
  const carnet = join(BRAIN, "sources", "carnet");
  writeFileSync(join(carnet, "run.mjs"), SOURCE_PROGRAM, "utf8");
  writeFileSync(join(carnet, "data.json"), JSON.stringify([{ kind: "contact", address: "lea@atelier.fr", name: "Léa Atelier", sent: 30, received: 25 }, { kind: "contact", name: "sans adresse" }]), "utf8");
  node("sources.mjs", ["trust", "carnet"]);
  r = node("sources.mjs", ["run", "carnet"]);
  check("a source feeds the directory; a contact without address is refused", r.ok && json(r.out).runs[0].contacts === 1 && json(r.out).runs[0].refused.length === 1 && JSON.parse(readFileSync(join(BRAIN, "index", "directory.json"), "utf8")).contacts.some((c) => c.address === "lea@atelier.fr" && c.tier === 2), r.out);
  {
    // A tier from a source: only if it declares setsTier, and as a floor.
    const { upsert } = await import(pathToFileURL(join(SCRIPTS, "directory.mjs")).href);
    const rulesCfg = { format: "en", contacts: { core: 30, matters: 3 } };
    const d = { contacts: [] };
    const quiet = { kind: "contact", address: "client@crm.fr", sent: 1, received: 0, tier: 2 };
    upsert(d, [quiet], {}, rulesCfg);
    const ignored = d.contacts[0].tier === 0 && d.contacts[0].tierFloor === undefined;
    upsert(d, [quiet], { tiers: true }, rulesCfg);
    const floored = d.contacts[0].tier === 2 && d.contacts[0].tierFloor === 2;
    upsert(d, [{ kind: "contact", address: "client@crm.fr", sent: 40, received: 5 }], {}, rulesCfg);
    const kept = d.contacts[0].tier === 2;
    upsert(d, [{ ...quiet, tier: 0 }], { tiers: true, counts: "set" }, rulesCfg);
    const cleared = d.contacts[0].tierFloor === undefined && d.contacts[0].tier === 0;
    check("a source's tier counts only when it declares setsTier, as a floor, and 0 removes it", ignored && floored && kept && cleared, JSON.stringify(d.contacts));
  }
  {
    // A brain's own ownership rules (hyperbrain.json, `ownership`).
    const { isOwned, isDerived, computerName } = await import(pathToFileURL(join(SCRIPTS, "lib.mjs")).href);
    const own = { ownership: { canon: ["index/contacts-alias.json", "index/activity/{computer}.jsonl"], derived: ["vault/log.md", "index/graph.json", "index/digests/"] } };
    const me = computerName();
    const okRules = isOwned("index/contacts-alias.json", own) && !isDerived("index/contacts-alias.json", own)
      && isOwned(`index/activity/${me}.jsonl`, own) && !isOwned("index/activity/another-computer.jsonl", own)
      && isOwned("vault/log.md", own) && isDerived("vault/log.md", own) && isDerived("index/digests/2026.json", own)
      && !isOwned("index/brain.sqlite", own) && isOwned("vault/notes/a.md", {}) && !isDerived("vault/notes/a.md", own);
    check("a brain's own ownership rules: settings kept by hand, each computer's journal, its own derived files", okRules);
  }
  const mc = await mcpSession();
  await mc.ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "banc", version: "1" } });
  const toolsNow = await mc.ask("tools/list", {});
  call = await mc.ask("tools/call", { name: "brain_contact", arguments: { query: "atelier" } });
  check("Claude searches the directory through brain_contact", toolsNow?.result?.tools?.length === 6 && mc.text(call).includes("Léa Atelier"), mc.text(call));
  mc.close();
  node("review.mjs");
  const peopleReport = readFileSync(join(BRAIN, "reviews", `${localDay()}.md`), "utf8");
  check("the weekly report tells the directory, and who in the core has no note", peopleReport.includes("## Contacts (4 in the directory, 2 in the core)") && peopleReport.includes("- Léa Atelier (30 / 25)"), peopleReport);
  node("save.mjs", ["--now"]);
  check("the directory is saved with the brain", git("ls-files", "index").includes("index/directory.json"));

  // ---- the weekly letter (never really sent: a fake mail service answers)
  const LETTER = [
    "# The review of September 30",
    "A calm week. Three notes came in.",
    "---",
    "## The new seeds",
    "1. `les-villes-invisibles`: Calvino, each city a state of mind.",
    "2. `especes-d-espaces`: Perec, living and naming.",
    "> These notes are already in your brain, as seeds.",
    "## The proposals",
    "1. Link **Perec** to [[projet-de-roman]].",
    ">> **Oh, by the way...!**",
    ">> A year ago, the idea of the dreaming city.",
    "^ 🟢 All is well.",
  ].join("\n");
  const letter = (a, extraEnv = {}) => node("letter.mjs", ["send", ...a], { input: LETTER, env: extraEnv });
  r = node("letter.mjs", ["setup", "--channel", "connector"]);
  check("a letter needs the person's own address", !r.ok, r.out);
  r = node("letter.mjs", ["setup", "--channel", "connector", "--to", "camille@exemple.fr"]);
  check("the letter is set up with the person's channel and address", r.ok && json(r.out).letter.channel === "connector", r.out);
  r = letter(["--dry"]);
  const dry = json(r.out);
  check("a dry run renders it, without sending", r.ok && dry.dry === true && /Camille's brain review, week \d+/.test(dry.subject), r.out);
  const letterHtml = readFileSync(dry.html, "utf8");
  check("it renders for mail and phones: header, numbered badges, light and dark boxes, health at the foot", letterHtml.includes("The review of September 30") && letterHtml.includes("border-radius:12px;background:#2f7d5b") && letterHtml.includes("background:#1f2430;border-radius:12px") && letterHtml.includes("🟢 All is well.") && !letterHtml.includes("<style"), letterHtml.slice(0, 300));
  check("and escapes what could be HTML", !letterHtml.includes("<Perec>") && letterHtml.includes("<strong"));
  check("it is always kept in the brain, for the answers to find its numbers", readFileSync(join(BRAIN, "reviews", `${localDay()}-letter.md`), "utf8") === LETTER);
  r = letter([]);
  check("through the connector, Claude sends it: the script says so and gives the file", r.ok && json(r.out).sendWithConnector === true && json(r.out).to === "camille@exemple.fr", r.out);
  r = node("letter.mjs", ["setup", "--channel", "brevo", "--to", "camille@exemple.fr"]);
  check("Brevo needs a verified sender", !r.ok, r.out);
  node("letter.mjs", ["setup", "--channel", "brevo", "--to", "camille@exemple.fr", "--from", "brain@exemple.fr"]);
  r = letter([]);
  check("without its key in the brain's .env, nothing leaves", !r.ok && r.out.includes("BREVO_API_KEY"), r.out);
  r = letter([], { BREVO_API_KEY: "test-brevo", HYPERBRAIN_BREVO_URL: `http://127.0.0.1:${port}/v3` });
  const brevoMail = await (await fetch(`http://127.0.0.1:${port}/mail`)).json();
  check("with it, the letter goes to the person, from the verified sender", r.ok && json(r.out).sent === true && brevoMail?.headers["api-key"] === "test-brevo" && brevoMail.body.to[0].email === "camille@exemple.fr" && brevoMail.body.sender.email === "brain@exemple.fr" && brevoMail.body.htmlContent.includes("Oh, by the way") && brevoMail.body.textContent === LETTER, JSON.stringify(brevoMail).slice(0, 400));
  node("letter.mjs", ["setup", "--channel", "resend", "--to", "camille@exemple.fr", "--from", "brain@exemple.fr"]);
  r = letter([], { RESEND_API_KEY: "test-resend", HYPERBRAIN_RESEND_URL: `http://127.0.0.1:${port}` });
  const resendMail = await (await fetch(`http://127.0.0.1:${port}/mail`)).json();
  check("Resend works the same way", r.ok && json(r.out).sent === true && resendMail?.headers.authorization === "Bearer test-resend" && resendMail.body.to[0] === "camille@exemple.fr", JSON.stringify(resendMail).slice(0, 300));
  node("letter.mjs", ["setup", "--channel", "none"]);
  r = letter([]);
  check("with no channel, the letter stays in the brain", r.ok && json(r.out).sent === false, r.out);

  // ---- a brain in French: what the person reads is in their language
  r = node("init.mjs", ["--dir", "~/cerveau-tilde", "--name", "T", "--domains", "a,b", "--switch", "--no-git"], { env: { LANG: "fr_FR.UTF-8", LC_ALL: "", LC_MESSAGES: "" } });
  check("a quoted ~ is the home folder, not a folder named ~", r.ok && json(r.out).dir === join(HOME, "cerveau-tilde").replace(/\\/g, "/"), r.out);
  check("the language comes from LANG when it is set", json(r.out).lang === "fr", r.out);
  r = node("init.mjs", ["--dir", join(BASE, "cerveau-c"), "--name", "T", "--domains", "a,b", "--switch", "--no-git"], { env: { LANG: "C.UTF-8", LC_ALL: "", LC_MESSAGES: "" } });
  check("LANG=C is ignored, not taken for a language", r.ok, r.out);
  const FR = join(BASE, "cerveau");
  // What the discovery shows before the types are chosen: folders and kinds of files, never a content.
  mkdirSync(join(HOME, "Documents", "Conférences", "2026"), { recursive: true });
  for (const n of ["lyon.pptx", "paris.pptx", "nantes.key"]) writeFileSync(join(HOME, "Documents", "Conférences", "2026", n), "x", "utf8");
  mkdirSync(join(HOME, "Documents", "Manuscrits"), { recursive: true });
  writeFileSync(join(HOME, "Documents", "Manuscrits", "roman.docx"), "x", "utf8");
  r = node("discover.mjs", ["--json"]);
  const disc = json(r.out);
  const docs = disc.places?.find((pl) => pl.root.endsWith("/Documents"));
  const confs = docs?.folders.find((f) => f.name === "Conférences");
  check("the discovery sees the person's folders and their kinds of files", r.ok && confs?.kinds.slides === 3 && confs.children.includes("2026") && docs.folders.some((f) => f.name === "Manuscrits"), r.out.slice(0, 600));

  // A French brain, with the types validated with the person.
  r = node("init.mjs", ["--dir", FR, "--name", "Léa", "--domains", "travail,famille", "--lang", "fr", "--types", "note:notes,idee:idees,personne:personnes,conference:conferences,livre", "--switch"]);
  const frInit = json(r.out);
  check("a French brain is created with its own types (and becomes the active one on --switch)", r.ok && frInit.lang === "fr" && frInit.format === "fr" && frInit.types.livre === "livres" && frInit.types.conference === "conferences", r.out);
  check("its format document lists its own types", readFileSync(join(FR, "vault", "CLAUDE.md"), "utf8").includes("| `conference` | `conferences/` |"));
  r = node("init.mjs", ["--dir", join(BASE, "mauvais"), "--name", "X", "--domains", "a,b", "--types", "Conférence:conf,note", "--switch", "--no-git"]);
  check("a type with capitals or accents is refused", !r.ok, r.out);
  check("its documents are in French", readFileSync(join(FR, "BRAIN.md"), "utf8").startsWith("# Le brain de Léa") && readFileSync(join(FR, "SOURCES.md"), "utf8").includes("Une source à la fois"));
  check("its history speaks French", run("git", ["log", "-1", "--format=%s"], { cwd: FR }).out.trim() === "Création du brain de Léa");
  r = cap("Une pensée.", ["--title", "Première pensée", "--type", "idea", "--domains", "travail"]);
  check("a type the brain does not have is refused, with the brain's own list", !r.ok && r.out.includes("idee, personne, conference, livre"), r.out);
  r = cap("Une pensée.", ["--title", "Première pensée", "--type", "idee", "--domains", "travail", "--status", "graine"]);
  check("its captures speak French", r.ok && run("git", ["log", "-1", "--format=%s"], { cwd: FR }).out.trim() === "capture : Première pensée", r.out);
  const frNote = readFileSync(join(FR, "vault", "idees", "premiere-pensee.md"), "utf8");
  check("and are written in the French format", /^titre: "Première pensée"$/m.test(frNote) && /^statut: graine$/m.test(frNote) && /^visibilite: interne$/m.test(frNote) && /^cree: /m.test(frNote) && /^touche: /m.test(frNote) && !/^title:/m.test(frNote), frNote);
  r = cap("Une conférence à Lyon sur le travail.", ["--title", "Conférence de Lyon", "--type", "conference", "--domains", "travail", "--visibility", "prive"]);
  check("a custom type and a visibility in French are understood", r.ok && existsSync(join(FR, "vault", "conferences", "conference-de-lyon.md")) && readFileSync(join(FR, "vault", "conferences", "conference-de-lyon.md"), "utf8").includes("visibilite: prive"), r.out);
  const frGet = json(node("query.mjs", ["get", "premiere-pensee", "--json"]).out);
  check("the brain answers in its own words (graine, interne)", frGet.status === "graine" && frGet.visibility === "interne", JSON.stringify(frGet));
  check("its private note stays masked, in French too", json(node("query.mjs", ["get", "conference-de-lyon", "--json"]).out).body.includes("never shown"));
  const frStats = json(node("query.mjs", ["stats"]).out);
  check("its stats give its types and format, and speak its words", frStats.format === "fr" && frStats.types.livre === "livres" && frStats.byStatus.graine === 2, JSON.stringify(frStats));
  r = node("types.mjs", ["add", "oeuvre", "oeuvres"]);
  check("a type is added later", r.ok && json(r.out).types.oeuvre === "oeuvres" && existsSync(join(FR, "vault", "oeuvres")), r.out);
  r = node("types.mjs", ["add", "oeuvre"]);
  check("but never twice", !r.ok, r.out);
  r = cap("Une toile.", ["--title", "La Ville qui rêve", "--type", "oeuvre", "--domains", "famille", "--status", "fiable"]);
  check("and used right away", r.ok, r.out);
  // The promotion in French: an old graine, linked from another day, becomes fiable; an idee never.
  const oldFr = join(FR, "vault", "notes", "vieille.md");
  mkdirSync(join(FR, "vault", "notes"), { recursive: true });
  writeFileSync(oldFr, "---\ntype: note\ntitre: \"Vieille\"\ndomaines: [travail]\nstatut: graine\nvisibilite: interne\ncree: 2026-01-01\ntouche: 2026-01-01\nsource: \"banc\"\n---\n\nAncienne.\n", "utf8");
  const ideeFr = join(FR, "vault", "idees", "vieille-idee.md");
  writeFileSync(ideeFr, "---\ntype: idee\ntitre: \"Vieille idée\"\ndomaines: [travail]\nstatut: graine\nvisibilite: interne\ncree: 2026-01-01\ntouche: 2026-01-01\nsource: \"banc\"\n---\n\nAncienne.\n", "utf8");
  const pp = join(FR, "vault", "idees", "premiere-pensee.md");
  writeFileSync(pp, `${readFileSync(pp, "utf8")}\n[[vieille]] [[vieille-idee]]\n`, "utf8");
  r = node("lint.mjs");
  check("the French brain passes its own validation", r.ok, r.out);
  node("review.mjs", ["--apply"]);
  check("its promotion speaks French: statut: fiable, touche today", /^statut: fiable$/m.test(readFileSync(oldFr, "utf8")) && new RegExp(`^touche: ${localDay()}$`, "m").test(readFileSync(oldFr, "utf8")), readFileSync(oldFr, "utf8"));
  check("and an idee is never promoted by the machine", /^statut: graine$/m.test(readFileSync(ideeFr, "utf8")));
  node("contacts.mjs", ["enable"]);
  node("contacts.mjs", ["upsert"], { input: JSON.stringify({ address: "tom@exemple.fr", name: "Tom", sent: 5, received: 5 }) });
  const annu = JSON.parse(readFileSync(join(FR, "index", "annuaire.json"), "utf8"));
  check("a French brain keeps its directory in annuaire.json, in French", Array.isArray(annu.contacts) && annu.contacts[0].adresse === "tom@exemple.fr" && annu.contacts[0].envoyes === 5 && "etage" in annu.contacts[0] && "genere" in annu, JSON.stringify(annu).slice(0, 300));
  r = node("letter.mjs", ["send", "--dry"], { input: "# La revue du 30 septembre\n\n## Les nouvelles graines\n1. Une." });
  check("its letter speaks French too", r.ok && /Revue du brain de Léa, semaine \d+/.test(json(r.out).subject) && readFileSync(json(r.out).html, "utf8").includes("Le brain &#183; semaine"), r.out);
  check("its weekly report is in French", readFileSync(join(FR, "reviews", `${localDay()}.md`), "utf8").startsWith("# Revue du brain de Léa"));

  // ---- an existing brain made active again (restored, cloned, or built before the plugin)
  r = node("adopt.mjs", ["--dir", CLONE]);
  check("adopting refuses to replace the active brain silently", !r.ok && r.out.includes("--switch"), r.out);
  r = node("adopt.mjs", ["--dir", join(BASE, "rien")]);
  check("adopting refuses a folder that is not a brain", !r.ok, r.out);
  r = node("adopt.mjs", ["--dir", CLONE, "--switch"]);
  check("adopting a clone makes it the brain of this computer", r.ok && JSON.parse(readFileSync(join(HOME, ".hyperbrain", "config.json"), "utf8")).brain === CLONE.replace(/\\/g, "/"), r.out);
  check("and it answers at once", json(node("query.mjs", ["search", "roman", "--json"]).out).some((x) => x.slug === "projet-de-roman"));
} finally {
  fake.kill();
  if (process.argv.includes("--keep")) console.log(`\n  (--keep: ${BASE} left in place)`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures}/${total} FAILED\n` : `\nAll ${total} checks pass.\n`);
process.exitCode = failures ? 1 : 0;
