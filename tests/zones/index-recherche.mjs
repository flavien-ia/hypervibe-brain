#!/usr/bin/env node
// tests/zones/index-recherche.mjs - The checks of one zone of the plugin: the
// index, the search, the MCP tools and the hooks (2026-11-21, after the audit
// of version 0.8.2). One check per repair that matters, in a throwaway brain
// under the system's temporary folder, with a fake home (HVBRAIN_HOME) and a
// fake embeddings API (tests/faux-embeddings.mjs). Nothing here touches the
// real brain, the real ~/.hypervibe-brain, the live view of the person (the
// hook is pointed at a port nobody listens on) nor a paid API.
//
//   node tests/zones/index-recherche.mjs [--keep]
//
// Prints one line per check (ok / FAIL), and exits 1 when one failed.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..", "..");
const SCRIPTS = join(PLUGIN, "scripts");
const BASE = join(tmpdir(), `brain-zone-index-${process.pid}`);
const HOME = join(BASE, "home");
const BRAIN = join(BASE, "brain");
const DOCS = join(BASE, "docs");
const HB = join(HOME, ".hypervibe-brain");
const DB = join(BRAIN, "index", "brain.sqlite");
const fwd = (p) => p.replace(/\\/g, "/");
rmSync(BASE, { recursive: true, force: true });
mkdirSync(HOME, { recursive: true });

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 700)}` : ""}`);
  }
};
const section = (name) => console.log(`\n${name}`);

/** A port nobody listens on: the hook must never reach the person's own live view. */
const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const DEAD_PORT = await freePort();

const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", EMBEDDINGS_BASE_URL: "", HVBRAIN_NO_WINDOW: "1", HVBRAIN_RULES_BLOCK: "off",
  HVBRAIN_VAULT: "off", HVBRAIN_WHO: "", CLAUDE_CODE_OAUTH_TOKEN: "", BRAIN_LIVE_PORT: String(DEAD_PORT),
};
const run = (cmd, a, o = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, a, { cwd: BASE, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, stdout: r.stdout ?? "", err, ms: Date.now() - t0, pid: r.pid };
};
const node = (script, a = [], o = {}) => run("node", [join(SCRIPTS, script), ...a], o);
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const U = (f) => pathToFileURL(join(SCRIPTS, f)).href;
/** Runs a few lines that import the plugin's modules, in a program of their own; gives back what they print as JSON. */
const mod = (code, o = {}) => {
  const r = run("node", ["--input-type=module", "-e", code], o);
  try {
    return { ...r, value: json(r.stdout) };
  } catch {
    return { ...r, value: null };
  }
};
const build = (opts = {}, o = {}) => mod(`const m = await import(${JSON.stringify(U("build.mjs"))}); const r = await m.buildIndex({ quiet: true, ...${JSON.stringify(opts)} }); console.log(JSON.stringify(r));`, o).value;
/** One question to a tool, as the MCP server asks it in a fresh program. */
const tool = (name, args = {}, o = {}) => {
  const r = node("tool.mjs", [name], { ...o, input: JSON.stringify(args) });
  try {
    return { ...JSON.parse(r.stdout.trim().split("\n").pop()), ms: r.ms };
  } catch {
    return { ok: false, error: `no answer: ${r.out}`, ms: r.ms };
  }
};
const search = (q, extra = [], o = {}) => json(node("query.mjs", ["search", q, "--json", ...extra], o).out);
/** A question to the index itself, read only, closed at once. */
const sql = (query, ...params) => {
  const db = new DatabaseSync(DB, { readOnly: true });
  try {
    return db.prepare(query).all(...params);
  } finally {
    db.close();
  }
};
const meta = (k) => sql("SELECT v FROM meta WHERE k = ?", k)[0]?.v;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const until = (what, ms = 15_000) => {
  const end = Date.now() + ms;
  for (;;) {
    try {
      if (what()) return true;
    } catch {
      // the index is being written: asked again
    }
    if (Date.now() > end) return false;
    sleep(200);
  }
};
const noLock = () => until(() => !existsSync(`${DB}.build.lock`), 20_000);

const notePath = (slug, folder = "notes") => join(BRAIN, "vault", folder, `${slug}.md`);
const writeNote = (slug, { title = slug, body = "x", type = "note", folder = "notes", domains = "[a]", status = "seed", visibility = "internal", extra = "", created = "2026-03-01" } = {}) => {
  mkdirSync(join(BRAIN, "vault", folder), { recursive: true });
  writeFileSync(notePath(slug, folder), `---\ntype: ${type}\ntitle: "${title}"\ndomains: ${domains}\nstatus: ${status}\nvisibility: ${visibility}\ncreated: ${created}\nupdated: 2026-10-01\nsource: "zone"\n${extra}---\n\n${body}\n`, "utf8");
};
const brainJson = () => JSON.parse(readFileSync(join(BRAIN, "brain.json"), "utf8"));
const setBrainJson = (patch) => writeFileSync(join(BRAIN, "brain.json"), `${JSON.stringify({ ...brainJson(), ...patch }, null, 2)}\n`, "utf8");

const fake = spawn("node", [join(HERE, "..", "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const EMB = { EMBEDDINGS_API_KEY: "test-key", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1` };
const embedCalls = () => Number(run("node", ["-e", `fetch("http://127.0.0.1:${port}/count").then((r) => r.text()).then((t) => console.log(t))`]).stdout.trim());
// An embeddings API that takes the question and never answers.
const silent = createServer(() => {});
await new Promise((res) => silent.listen(0, "127.0.0.1", res));
const SLOW = { EMBEDDINGS_API_KEY: "test-key", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${silent.address().port}/v1` };

try {
  console.log(`\nZone index-recherche, in ${BASE}\n`);

  // ---------------------------------------------------------------- a brain
  let r = node("init.mjs", ["--dir", BRAIN, "--name", "Zoe", "--domains", "a,b", "--lang", "en", "--switch", "--no-git"]);
  if (!r.ok) throw new Error(`the throwaway brain could not be created: ${r.out}`);
  setBrainJson({ natures: { note: ["decision", "lesson"] } });
  const WORDS = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega".split(" ");
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const soup = (n) => Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(" ");
  const FILL = 240;
  for (let i = 0; i < FILL; i++) writeNote(`fond-${String(i).padStart(3, "0")}`, { title: `Fond ${i}`, body: `${soup(60)}\n\n${soup(60)}${i > 1 ? `\n\nSee [[fond-${String(i - 1).padStart(3, "0")}]].` : ""}`, domains: "[a]", created: `2026-0${1 + (i % 9)}-1${i % 9}` });
  writeNote("ville-qui-reve", { title: "Une ville qui rêve", body: "Un roman sur une ville qui rêve de baleines." });
  writeNote("dossier-secret", { title: "Dossier secret", body: "MOT-DE-PASSE-TRES-PRIVE dans le corps de la fiche.", visibility: "private" });

  // ---------------------------------------------------------------- the build
  section("The build writes only what changed (constats 4, 10, 12)");
  let b = build();
  const count = () => sql("SELECT COUNT(*) n FROM fiche")[0].n;
  check("a first build indexes every note and says which version of the index it wrote", b?.ok && b.fiches === FILL + 2 && count() === FILL + 2 && meta("schema") === "3|en", JSON.stringify(b)?.slice(0, 300));
  const rowBefore = sql("SELECT rowid AS id FROM fiche WHERE slug = 'fond-100'")[0].id;
  writeFileSync(notePath("ville-qui-reve"), readFileSync(notePath("ville-qui-reve"), "utf8").replace("de baleines", "de cachalots"), "utf8");
  b = build({ vectors: false });
  check("one note edited: one note written, the others left as they were", b?.text?.written === 1 && b.text.kept === FILL + 1 && b.text.removed === 0 && sql("SELECT rowid AS id FROM fiche WHERE slug = 'fond-100'")[0].id === rowBefore, JSON.stringify(b?.text));
  check("its new words are found, its old ones are gone", search("cachalots", ["--words"]).some((x) => x.slug === "ville-qui-reve") && search("baleines", ["--words"]).length === 0);
  b = build({ ifStale: true, vectors: false });
  check("nothing moved: nothing is built", b?.skipped === true && b.ok === true, JSON.stringify(b));
  unlinkSync(notePath("fond-239"));
  b = build({ vectors: false });
  check("a note deleted leaves the index, alone", b?.text?.removed === 1 && b.text.written === 0 && count() === FILL + 1 && sql("SELECT COUNT(*) n FROM fts WHERE slug = 'fond-239'")[0].n === 0, JSON.stringify(b?.text));
  // A rename keeps the number of notes and the latest date: the fingerprint of before saw nothing.
  renameSync(notePath("fond-238"), notePath("fond-renomme"));
  r = node("query.mjs", ["get", "fond-renomme", "--json"]);
  check("a note renamed is found under its new name at the next question, and not under the old one", r.ok && json(r.out).slug === "fond-renomme" && !node("query.mjs", ["get", "fond-238", "--json"]).ok, r.out);

  // One note that is not valid: the others are indexed, it is left out, and said.
  writeNote("cassee", { title: "Cassée", body: "x", domains: "[]" });
  writeNote("arrivee-en-meme-temps", { title: "Arrivée en même temps", body: "Un mot rare : ornithorynque." });
  writeFileSync(notePath("ville-qui-reve"), readFileSync(notePath("ville-qui-reve"), "utf8").replace("domains: [a]", "domains: []").replace("de cachalots", "de narvals"), "utf8");
  r = node("build.mjs");
  check("a build with a note that is not valid still fails, and says which", !r.ok && r.out.includes("no domain") && r.out.includes("cassee"), r.out);
  check("but the valid notes written at the same moment are indexed", search("ornithorynque", ["--words"]).some((x) => x.slug === "arrivee-en-meme-temps"));
  check("a note the index knew, and that is not valid any more, keeps what the index knew of it", search("cachalots", ["--words"]).some((x) => x.slug === "ville-qui-reve") && search("narvals", ["--words"]).length === 0);
  check("a note that was never valid is not in the index", sql("SELECT COUNT(*) n FROM fiche WHERE slug = 'cassee'")[0].n === 0);
  b = build({ ifStale: true, vectors: false });
  check("while nothing moves, the vault is not read and checked again, and the notes left out are still said", b?.skipped === true && b.ok === false && b.errors?.length === 2, JSON.stringify(b));
  r = node("query.mjs", ["search", "ornithorynque", "--json"]);
  check("a question still answers, with a warning that names the note", r.ok && r.err.includes("could not be refreshed") && r.err.includes("cassee") && r.out.includes("arrivee-en-meme-temps"), `${r.err} | ${r.out}`);
  unlinkSync(notePath("cassee"));
  writeFileSync(notePath("ville-qui-reve"), readFileSync(notePath("ville-qui-reve"), "utf8").replace("domains: []", "domains: [a]"), "utf8");
  b = build({ vectors: false });
  check("repaired, the note comes back as it is now and the warning stops", b?.ok === true && search("narvals", ["--words"]).some((x) => x.slug === "ville-qui-reve") && !node("query.mjs", ["search", "narvals", "--json"]).err.includes("could not be refreshed"), JSON.stringify(b)?.slice(0, 300));

  // An index written by another version is written again whole, once.
  {
    const db = new DatabaseSync(DB);
    db.prepare("UPDATE meta SET v = '1|en' WHERE k = 'schema'").run();
    db.close();
  }
  b = build({ vectors: false });
  check("an index of another version is written again whole, once", b?.text?.written === count() && meta("schema") === "3|en" && build({ vectors: false })?.text?.written === 0, JSON.stringify(b?.text));
  check("and its full text still answers", search("ornithorynque", ["--words"]).length === 1 && sql("SELECT COUNT(*) n FROM fts")[0].n === count());

  // The catalogue is skipped when it did not move.
  mkdirSync(join(BRAIN, "catalogue"), { recursive: true });
  const catFile = join(BRAIN, "catalogue", "posts.jsonl");
  const catLines = Array.from({ length: 30 }, (_, i) => JSON.stringify({ address: `base://posts/${i}`, tool: "posts", title: `Post ${i} sur les abeilles`, date: "2026-01-02", domains: ["a"], excerpt: "Les abeilles dansent pour indiquer le pollen.", hash: `h${i}` })).join("\n");
  writeFileSync(catFile, `${catLines}\n`, "utf8");
  b = build({ vectors: false });
  check("a catalogue that moved is taken", b?.catalogue?.skipped === false && b.catalogue.entries === 30, JSON.stringify(b?.catalogue));
  writeNote("apres-le-catalogue", { title: "Après le catalogue", body: "Une note de plus." });
  b = build({ vectors: false });
  check("a note edited does not write the catalogue again", b?.catalogue?.skipped === true && b.catalogue.entries === 30 && b.text.written === 1, JSON.stringify(b?.catalogue));
  writeFileSync(catFile, `${catLines}\n`, "utf8"); // the same lines, a new date
  b = build({ ifStale: true, vectors: false });
  check("a catalogue file written again with the same lines is not a change", b?.skipped === true, JSON.stringify(b)?.slice(0, 200));
  check("the catalogue still answers", search("abeilles", ["--words"]).some((x) => x.catalogue && x.address === "base://posts/0"));

  // A source that sends two lines for one address (an event, then its update).
  {
    const upsert = () => mod(`const L = await import(${JSON.stringify(U("lib.mjs"))}); const C = await import(${JSON.stringify(U("catalogue.mjs"))}); console.log(JSON.stringify(C.upsertEntries("agenda", [{ address: "agenda://e/1", title: "Rendez-vous", text: "premier" }, { address: "agenda://e/2", title: "Autre", text: "rien" }, { address: "agenda://e/1", title: "Rendez-vous déplacé", text: "second" }], L.config(), { replace: true })));`).value;
    const agenda = join(BRAIN, "catalogue", "agenda.jsonl");
    const first = upsert();
    const lines = readFileSync(agenda, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const at = statSync(agenda).mtimeMs;
    sleep(50);
    const again = upsert();
    check("two lines for one address: the last one is kept, and sent again it is not a change", first?.added === 2 && lines.length === 2 && lines.find((e) => e.address === "agenda://e/1")?.title === "Rendez-vous déplacé" && again?.updated === 0 && again.unchanged === 2 && again.pending === 0 && statSync(agenda).mtimeMs === at, JSON.stringify({ first, again }));
    rmSync(agenda, { force: true });
    rmSync(join(BRAIN, "index", "catalogue-pending.jsonl"), { force: true });
  }

  // ---------------------------------------------------------------- one builder at a time
  section("One program builds at a time, and a build that fails never fails the answer (constats 4, 5)");
  const LOCK = `${DB}.build.lock`;
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), "utf8");
  writeNote("pendant-le-verrou", { title: "Pendant le verrou", body: "Un mot rare : tamanoir." });
  b = build({ ifStale: true, vectors: false });
  check("while another program builds, a question's build steps aside", b?.busy === true && b.skipped === true, JSON.stringify(b));
  r = node("query.mjs", ["search", "ornithorynque", "--words", "--json"]);
  check("and the question is answered from the index as it is", r.ok && json(r.out).length === 1 && search("tamanoir", ["--words"]).length === 0, r.out);
  check("the lock of a living builder is left alone", existsSync(LOCK));
  const gone = run("node", ["-e", "0"]).pid;
  writeFileSync(LOCK, JSON.stringify({ pid: gone, at: new Date().toISOString() }), "utf8");
  b = build({ ifStale: true, vectors: false });
  check("a dead builder does not keep the lock: the next one takes it over, builds, and leaves no lock", b?.busy !== true && b?.text?.written === 1 && !existsSync(LOCK) && search("tamanoir", ["--words"]).length === 1, JSON.stringify(b)?.slice(0, 300));
  writeFileSync(LOCK, JSON.stringify({ pid: process.pid, at: new Date(Date.now() - 2 * 3600_000).toISOString() }), "utf8");
  writeNote("apres-le-vieux-verrou", { title: "Après le vieux verrou", body: "Un mot rare : fourmilier." });
  b = build({ ifStale: true, vectors: false });
  check("a lock two hours old is taken over too", b?.busy !== true && !existsSync(LOCK) && search("fourmilier", ["--words"]).length === 1, JSON.stringify(b)?.slice(0, 300));

  // A build that throws (here: the catalogue's folder turned into a file).
  rmSync(join(BRAIN, "catalogue"), { recursive: true, force: true });
  writeFileSync(join(BRAIN, "catalogue"), "not a folder", "utf8");
  r = node("query.mjs", ["search", "ornithorynque", "--words", "--json"]);
  check("a build that fails does not fail the question: the previous index answers, with a warning", r.ok && json(r.out).length === 1 && r.err.includes("could not be refreshed"), `${r.err} | ${r.out}`);
  let t = tool("brain_search", { query: "ornithorynque", words: true });
  check("the tool answers too, with the warning for the AI and the cause for the usage journal", t.ok && t.result?.warning?.includes("could not be refreshed") && t.result.result?.length === 1 && typeof t.how?.buildError === "string" && t.how.buildError.length > 0, JSON.stringify(t).slice(0, 400));
  unlinkSync(join(BRAIN, "catalogue"));
  mkdirSync(join(BRAIN, "catalogue"), { recursive: true });
  writeFileSync(catFile, `${catLines}\n`, "utf8");
  build({ vectors: false });

  // ---------------------------------------------------------------- brain_fetch
  section("brain_fetch never reads the brain's own folder nor a hidden file (constat 1)");
  mkdirSync(join(DOCS, "sub", ".git"), { recursive: true });
  writeFileSync(join(DOCS, "lisible.md"), "Un document lisible.", "utf8");
  writeFileSync(join(DOCS, ".env"), "SECRET=cle-secrete", "utf8");
  writeFileSync(join(DOCS, "sub", ".git", "config"), "[remote] url = secret", "utf8");
  let linked = false;
  try {
    symlinkSync(BRAIN, join(DOCS, "lien"), "junction");
    linked = true;
  } catch {
    linked = false;
  }
  setBrainJson({ data: { dev: { adapter: "files", root: fwd(BASE) }, docs: { adapter: "files", root: fwd(DOCS) } } });
  // An entry of the registry is read only once approved on this computer (trust.mjs, 2026-11-27).
  const waiting = json(node("query.mjs", ["fetch", "docs://ordinaire.txt"]).out);
  check("a data entry that was never approved on this computer is not read, and the tool says why", /not approved|never approved/.test(String(waiting?.error ?? "")), JSON.stringify(waiting).slice(0, 300));
  node("trust.mjs", ["approve", "data", "--all"]);
  const fetchAt = (address) => {
    const x = node("query.mjs", ["fetch", address]);
    let v = null;
    try {
      v = json(x.out);
    } catch {
      v = null;
    }
    return { v, raw: `${x.out}${x.err}` };
  };
  const SECRET = "MOT-DE-PASSE-TRES-PRIVE";
  // A private note is read like any other (the person's decision, 2026-11-21).
  const got = tool("brain_get", { slug: "dossier-secret" });
  check("brain_get gives a private note's text, like any other", got.ok && String(got.result?.body).includes(SECRET) && !String(got.result?.body).includes("never shown"), JSON.stringify(got).slice(0, 300));
  t = tool("brain_search", { query: "corps fiche", words: true, entries: false });
  check("a private note is found by the words of its text, with its excerpt", t.ok && t.result.some((x) => x.slug === "dossier-secret" && x.excerpt.includes(SECRET)), JSON.stringify(t).slice(0, 300));
  r = node("query.mjs", ["get", "dossier-secret", "--local", "--json"]);
  check("the command line's --local of before is still accepted", r.ok && json(r.out).body.includes(SECRET), r.out);
  // Refused: an error, said by the tool or by the data, and nothing of what is there.
  const refusedAll = (addresses) => addresses.map((a) => [a, fetchAt(a)]).filter(([, x]) => !(x.v?.error || x.v?.data?.error) || x.v?.data?.text !== undefined || x.v?.data?.items !== undefined || x.raw.includes(SECRET) || x.raw.includes("cle-secrete") || x.raw.includes("url = secret"));
  let leaks = refusedAll([
    "dev://brain/vault/notes/dossier-secret.md",
    "dev://BRAIN/VAULT/notes/dossier-secret.md",
    "dev://brain%5Cvault%5Cnotes%5Cdossier-secret.md",
    "dev://docs/../brain/vault/notes/dossier-secret.md",
    "dev://brain/brain.json",
    "dev://brain/index/brain.sqlite",
    "dev://brain",
    "dev://home/.hypervibe-brain/config.json",
    ...(process.platform === "win32" ? ["dev://brain./vault/notes/dossier-secret.md", "dev://brain/vault/notes/dossier-secret.md::$DATA"] : []),
  ]);
  check("a file of the brain is refused through a wider root, however its path is spelled", leaks.length === 0, JSON.stringify(leaks).slice(0, 600));
  check("the refusal says where to read a note instead", fetchAt("dev://brain/vault/notes/dossier-secret.md").v?.error?.includes("brain_get"));
  leaks = refusedAll(["docs://.env", "docs://sub/.git/config", "docs://sub/.git", "docs://.ENV"]);
  check("a file or a folder whose name starts with a dot is refused", leaks.length === 0, JSON.stringify(leaks).slice(0, 600));
  if (linked) {
    leaks = refusedAll(["docs://lien/vault/notes/dossier-secret.md", "docs://lien", "docs://lien/brain.json"]);
    check("a link that leads into the brain is refused", leaks.length === 0, JSON.stringify(leaks).slice(0, 600));
  } else console.log("  (no link could be made on this computer: the check of a link into the brain is skipped)");
  // (A root has no address of its own: it is reached from a folder below it.)
  const listed = fetchAt("dev://docs/..").v?.data;
  check("the brain's folder and the fake home's settings are not listed either", listed?.kind === "folder" && listed.items.some((i) => i.name === "docs") && !listed.items.some((i) => i.name === "brain"), JSON.stringify(listed));
  const docsListed = fetchAt("docs://sub/..").v?.data;
  check("nor a hidden file, nor a link into the brain", docsListed?.items?.map((i) => i.name).sort().join() === "lisible.md,sub", JSON.stringify(docsListed));
  check("an ordinary document is still read", fetchAt("docs://lisible.md").v?.data?.text === "Un document lisible." && fetchAt("docs://sub").v?.data?.kind === "folder");

  // ---------------------------------------------------------------- the search
  section("The filters come before the limit; the words (constats 6, 14)");
  setBrainJson({ types: { ...brainJson().types }, search: { hidden: ["notes/annuaire/"] } });
  const personFolder = brainJson().types.person;
  for (let i = 0; i < 45; i++) writeNote(`conf-${i}`, { title: `Conference ${i} conference`, body: "conference conference conference conference. ".repeat(6), domains: "[a]" });
  for (let i = 0; i < 3; i++) writeNote(`personne-${i}`, { title: `Personne ${i}`, type: "person", folder: personFolder, body: `${soup(150)} conference ${soup(150)}`, domains: "[b]" });
  for (let i = 0; i < 40; i++) writeNote(`contact-${i}`, { title: `Zebre ${i} zebre`, folder: "notes/annuaire", body: "zebre zebre zebre zebre zebre." });
  writeNote("un-zebre-visible", { title: "Un animal", body: `${soup(100)} zebre ${soup(100)}` });
  writeNote("grande-oeuvre", { title: "Une grande œuvre", body: "Le cœur d'une œuvre, écrit avec ses ligatures." });
  writeNote("petite-oeuvre", { title: "Une petite oeuvre", body: "Un coeur ecrit sans ligature." });
  for (let i = 0; i < 12; i++) writeNote(`decision-${i}`, { title: `Decision ${i}`, body: `On garde le jardin potager ${soup(8)}.`, extra: "nature: decision\n" });
  for (let i = 0; i < 3; i++) writeNote(`lecon-${i}`, { title: `Lecon ${i}`, body: `Toujours arroser le jardin potager le soir ${soup(4)}.`, extra: "nature: lesson\n" });
  for (let i = 0; i < 30; i++) writeNote(`jardin-${i}`, { title: `Jardin ${i}`, body: "jardin potager tomates jardin potager tomates jardin potager tomates." });
  b = build({ vectors: false });
  if (!b?.ok) throw new Error(`the notes of the search checks are not valid: ${JSON.stringify(b?.errors)}`);
  t = tool("brain_search", { query: "conference", type: "person", words: true, limit: 5 });
  check("by words, a type asked for is found even when 45 other notes hold the word better", t.ok && t.result.length === 3 && t.result.every((x) => x.type === "person"), JSON.stringify(t).slice(0, 400));
  t = tool("brain_search", { query: "conference", domain: "b", words: true, limit: 5, entries: false });
  check("the same for a domain", t.ok && t.result.length === 3 && t.result.every((x) => x.slug.startsWith("personne-")), JSON.stringify(t).slice(0, 400));
  t = tool("brain_search", { query: "zebre", words: true, limit: 3, entries: false });
  check("a folder kept out of search does not take the places of what is in it", t.ok && t.result.length === 1 && t.result[0].slug === "un-zebre-visible", JSON.stringify(t).slice(0, 400));
  t = tool("brain_search", { query: "zebre", words: true, limit: 3, entries: false, everything: true });
  check("and comes back when everything is asked for", t.ok && t.result.length === 3, JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "potager", nature: "decision", words: true, limit: 10 });
  check("the same for a nature", t.ok && t.result.length === 10 && t.result.every((x) => x.slug.startsWith("decision-")), JSON.stringify(t).slice(0, 300));
  check("each result says its status, in the brain's words, and when it was last touched", t.result?.every((x) => x.status === "seed" && x.updated === "2026-10-01"), JSON.stringify(t.result?.[0]));
  check("\"oeuvre\" finds \"œuvre\", and \"œuvre\" finds \"oeuvre\"", ["oeuvre", "œuvre", "OEUVRE", "coeur", "cœur"].every((q) => { const s = search(q, ["--words"]).map((x) => x.slug); return s.includes("grande-oeuvre") && s.includes("petite-oeuvre"); }), JSON.stringify(["oeuvre", "œuvre", "coeur", "cœur"].map((q) => search(q, ["--words"]).map((x) => x.slug))));
  // (2026-11-22) "lecon" now means "lesson" (tests/zones/usage.mjs): a nature no language has is asked.
  t = tool("brain_search", { query: "potager", nature: "souvenir" });
  check("a nature this brain does not have answers with the natures it has", t.ok && String(t.result?.error).includes("souvenir") && t.result.known?.includes("lesson") && t.result.known.includes("decision"), JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "potager", type: "personne" });
  check("the same for a type and a domain", t.ok && t.result?.known?.includes("person") && tool("brain_search", { query: "x", domain: "zz" }).result?.known?.join() === "a,b", JSON.stringify(t).slice(0, 300));
  r = node("query.mjs", ["search", "potager", "--nature", "souvenir", "--json"]);
  check("and so does the command line", !r.ok && r.out.includes("lesson"), r.out);

  section("No answer without an end (constat 11)");
  t = tool("brain_timeline", { limit: 5000 });
  check("a timeline of 5,000 gives 200 notes and says how to go on", t.ok && t.result?.result?.length === 200 && String(t.result.cut?.more).includes("since"), JSON.stringify(t).slice(0, 300));
  t = tool("brain_timeline", { limit: -1 });
  check("a negative limit is the usual one, not the whole brain", t.ok && Array.isArray(t.result) && t.result.length === 30, JSON.stringify(t).slice(0, 200));
  t = tool("brain_timeline", { type: "person", limit: 10 });
  check("a timeline of one type", t.ok && t.result.length === 3 && t.result.every((x) => x.type === "person"), JSON.stringify(t).slice(0, 200));
  const paragraphs = Array.from({ length: 900 }, (_, i) => `Paragraphe ${i} ${soup(18)}.`);
  const LONG = paragraphs.join("\n\n");
  writeNote("tres-longue", { title: "Très longue", body: LONG });
  build({ vectors: false });
  t = tool("brain_get", { slug: "tres-longue" });
  check("a long note comes cut, and says where the next piece starts", t.ok && t.result.body.length < 8000 && t.result.omitted?.body?.next > 5000 && t.result.omitted.body.total === LONG.length, JSON.stringify(t.result?.omitted));
  {
    // (2026-11-23) The brain's own background work reads a note short; the person's AI keeps the whole default.
    const bg = tool("brain_get", { slug: "tres-longue" }, { env: { HVBRAIN_WHO: "ai:conversations" } });
    check("the background reads a note short, and is told where to go on", bg.ok && bg.result.body.length <= 2600 && bg.result.omitted?.body?.next >= 2000 && bg.result.omitted.body.next < 3000 && !bg.result.next, JSON.stringify(bg.result?.omitted));
    const bgFull = tool("brain_get", { slug: "tres-longue", full: true }, { env: { HVBRAIN_WHO: "ai:conversations" } });
    check("the background still reads it long when it asks for it", bgFull.ok && bgFull.result.body.length > 20_000, String(bgFull.result?.body?.length));
  }
  t = tool("brain_get", { slug: "tres-longue", full: true });
  check("even in full, one answer has an end", t.ok && t.result.body.length < 40_000 && t.result.omitted?.body?.next > 20_000, `${t.result?.body?.length} ${JSON.stringify(t.result?.omitted)}`);
  {
    let at = 0;
    let read = "";
    let calls = 0;
    for (; calls < 12; calls++) {
      const p = tool("brain_get", { slug: "tres-longue", full: true, offset: at });
      read += p.result.body.replace(/\n\n\[\.\.\.\]$/, "");
      const next = p.result.omitted?.body?.next;
      if (!next) break;
      if (next <= at) {
        read = "the offset did not move";
        break;
      }
      at = next;
    }
    const squeeze = (s) => s.replace(/\s+/g, " ").trim();
    check("read in pieces by its offset, the whole text is there, in a few calls", calls < 8 && squeeze(read) === squeeze(LONG), `${calls} calls, ${read.length} of ${LONG.length}`);
  }
  t = tool("brain_get", { slug: "dossier-secret", full: true, offset: 3 });
  check("an offset reads a private note like any other", t.ok && t.result.body.startsWith(SECRET.slice(3)) && t.result.bodyFrom === 3, JSON.stringify(t).slice(0, 300));
  {
    const { TOOLS, LOCAL_TOOLS } = await import(U("tools.mjs"));
    const local = LOCAL_TOOLS.find((x) => x.name === "brain_get").inputSchema.properties;
    const shared = TOOLS.find((x) => x.name === "brain_get").inputSchema.properties;
    check("the tools' descriptions are shorter than before (5,327 characters), and only this computer's server offers the offset", JSON.stringify(TOOLS).length < 4800 && "offset" in local && !("offset" in shared), String(JSON.stringify(TOOLS).length));
  }

  // ---------------------------------------------------------------- the contacts
  section("The core of the directory can be listed (constat 15, and the skills' audit)");
  node("contacts.mjs", ["enable"]);
  node("contacts.mjs", ["upsert"], { input: [{ address: "marie@exemple.fr", name: "Marie", sent: 40, received: 12 }, { address: "tom@exemple.fr", name: "Tom", sent: 5, received: 5 }, { address: "lettre@exemple.fr", name: "Une lettre", sent: 0, received: 80 }].map((c) => JSON.stringify(c)).join("\n") });
  r = node("contacts.mjs", ["list", "--tier", "2", "--json"]);
  const core = r.ok ? json(r.out) : null;
  check("contacts.mjs list --tier 2 lists the core", core?.ok && core.total === 1 && core.contacts[0].address === "marie@exemple.fr" && core.contacts[0].sent === 40, r.out);
  r = node("contacts.mjs", ["list", "--json"]);
  check("the core is the default, and the other tiers are listed the same way", json(r.out).contacts?.[0]?.name === "Marie" && json(node("contacts.mjs", ["list", "--tier", "1", "--json"]).out).contacts?.[0]?.name === "Tom" && json(node("contacts.mjs", ["list", "--tier", "0", "--json"]).out).total === 1, r.out);

  // ---------------------------------------------------------------- with vectors
  section("By meaning: the filters, the catalogue's share, the vectors apart (constats 2, 6, 8, 9, 13)");
  b = build({}, { env: EMB });
  check("the vectors are computed", b?.ok && b.vectors?.computed > 300 && b.vectors.missing === 0, JSON.stringify(b?.vectors));
  check("a private note has its vector, like any other", sql("SELECT COUNT(*) n FROM vec WHERE slug = 'dossier-secret'")[0].n === 1 && existsSync(join(BRAIN, "index", "embeddings", "dossier-secret.json")));
  t = tool("brain_search", { query: "jardin potager tomates", meaning: true, nature: "decision", limit: 10, entries: false }, { env: EMB });
  check("by meaning, a nature asked for fills the answer even when 30 other notes are closer", t.ok && t.result.length === 10 && t.result.every((x) => x.slug.startsWith("decision-")), JSON.stringify(t).slice(0, 400));
  t = tool("brain_search", { query: "abeilles pollen", limit: 1 }, { env: EMB });
  writeNote("les-abeilles", { title: "Les abeilles", body: "Les abeilles et le pollen, une note du brain." });
  build({}, { env: EMB });
  t = tool("brain_search", { query: "abeilles pollen", limit: 1 }, { env: EMB });
  check("a search of one result gives a note when a note answers, not a catalogue entry", t.ok && t.result.length === 1 && t.result[0].slug === "les-abeilles", JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "abeilles pollen", limit: 6 }, { env: EMB });
  check("the catalogue takes the places the notes leave", t.ok && t.result[0].slug === "les-abeilles" && t.result.some((x) => x.catalogue), JSON.stringify(t.result?.map((x) => x.slug ?? x.address)));
  const cacheFile = join(HB, "query-vectors.json");
  const cacheKeys = () => Object.keys(JSON.parse(readFileSync(cacheFile, "utf8")));
  check("the cache of questions keeps them under a hash, never in words", existsSync(cacheFile) && cacheKeys().length > 0 && cacheKeys().every((k) => /^[0-9a-f]{64}$/.test(k)), existsSync(cacheFile) ? cacheKeys().join(" ").slice(0, 200) : "no file");

  // One note edited, then a question: the answer does not wait for the API,
  // and the vector follows by itself, computed by a program of its own.
  noLock();
  const hashBefore = sql("SELECT hash FROM vec WHERE slug = 'les-abeilles'")[0].hash;
  const callsBefore = embedCalls();
  writeNote("les-abeilles", { title: "Les abeilles", body: "Les abeilles, le pollen et les frelons : une note changée." });
  t = tool("brain_search", { query: "frelons", words: true }, { env: EMB });
  check("after an edit, the question is answered with the new text", t.ok && t.result.some((x) => x.slug === "les-abeilles"), JSON.stringify(t).slice(0, 300));
  const caughtUp = until(() => sql("SELECT hash FROM vec WHERE slug = 'les-abeilles'")[0].hash !== hashBefore && meta("vectors_owed") === "0");
  check("and its vector is computed right after, by a program of its own, without another question", caughtUp && embedCalls() > callsBefore, `owed ${meta("vectors_owed")}, calls ${embedCalls() - callsBefore}`);
  noLock();

  // A vector whose note is not in the index (an index of before, read between two writes).
  {
    const db = new DatabaseSync(DB);
    db.prepare("INSERT INTO vec (slug, hash, dims, vec) SELECT 'fantome', hash, dims, vec FROM vec WHERE slug = 'les-abeilles'").run();
    db.prepare("UPDATE meta SET v = 'changed-by-the-test' WHERE k = 'rev_vec'").run();
    db.close();
  }
  t = tool("brain_search", { query: "abeilles pollen frelons", meaning: true, limit: 5 }, { env: EMB });
  check("a vector without its note no longer breaks a search by meaning", t.ok && t.result.some((x) => x.slug === "les-abeilles") && !t.result.some((x) => x.slug === "fantome"), JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "abeilles pollen frelons", limit: 5 }, { env: EMB });
  check("nor a search by words and meaning", t.ok && t.result.some((x) => x.slug === "les-abeilles"), JSON.stringify(t).slice(0, 300));

  // ---------------------------------------------------------------- the hook
  section("The hook reads the index as it is, within its budget (constats 3, 7, 9)");
  noLock();
  const hook = (prompt, extraEnv = {}) => run("node", [join(SCRIPTS, "hook-suggest.mjs")], { input: JSON.stringify({ prompt, session_id: `zone-${Math.random()}` }), env: extraEnv });
  const lastUsage = () => JSON.parse(readFileSync(join(HB, "usage.jsonl"), "utf8").trim().split("\n").pop());
  const builtBefore = meta("built");
  const keysBefore = cacheKeys().length;
  writeNote("ecrite-avant-le-hook", { title: "Écrite avant le hook", body: "Une note que l'index ne connaît pas encore." });
  // (2026-11-22) "Toujours arroser..." reads like a rule now (reminders.mjs):
  // these checks are about the suggestions, so the reminder is off here.
  setBrainJson({ reminders: { corrections: false } });
  const PROMPT = "Toujours arroser le jardin potager le soir, et garder le jardin potager";
  r = hook(PROMPT, EMB);
  const said = r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? "" : "";
  check("the hook suggests the notes closest to the message, and its lessons apart", r.ok && /^The second brain may have something on this request[^\n]*\n- [^\n]+ \[[a-z0-9-]+\]/.test(said) && /Lessons that may apply:\n- Lecon \d+ \[lecon-\d+\]/.test(said), `${r.out} ${r.err}`);
  check("it built nothing: the index is the one of before, and no lock was taken", meta("built") === builtBefore && !existsSync(LOCK) && sql("SELECT COUNT(*) n FROM fiche WHERE slug = 'ecrite-avant-le-hook'")[0].n === 0);
  check("it stayed within a second and a half, by its own count", lastUsage().tool === "(suggestion)" && lastUsage().by === "here" && lastUsage().ms <= 1500, JSON.stringify(lastUsage()));
  check("its message did not enter the cache of questions", cacheKeys().length === keysBefore && !readFileSync(cacheFile, "utf8").includes("arroser"));
  let t0 = Date.now();
  r = hook(PROMPT, SLOW);
  check("an embeddings API that does not answer: the hook says nothing and leaves within its budget", r.ok && r.stdout.trim() === "" && Date.now() - t0 < 3000 && lastUsage().ms <= 1600, `${Date.now() - t0} ms, ${JSON.stringify(lastUsage())}`);
  check("and its own short patience says nothing of the API's health to the others", !existsSync(join(HB, "embeddings-down.json")));

  // The vector of a question: three seconds, then the words; and nobody asks again for a minute.
  build({ vectors: false });
  t0 = Date.now();
  t = tool("brain_search", { query: "une question jamais posee sur le jardin potager" }, { env: SLOW });
  const first = Date.now() - t0;
  check("a search whose question gets no vector answers by words, in a few seconds and not ninety", t.ok && t.result.length > 0 && t.how?.by === "words" && first < 8000, `${first} ms ${JSON.stringify(t.how)}`);
  t0 = Date.now();
  t = tool("brain_search", { query: "une autre question sur le jardin potager" }, { env: SLOW });
  check("the search after it does not wait at all: the API is left alone for a minute", t.ok && t.how?.by === "words" && Date.now() - t0 < first - 1500 && existsSync(join(HB, "embeddings-down.json")), `${Date.now() - t0} ms after ${first} ms`);
  rmSync(join(HB, "embeddings-down.json"), { force: true });

  // The end of an answer: a skill called, then more than a megabyte of results.
  {
    mkdirSync(join(BRAIN, "sources", "apres-skill"), { recursive: true });
    writeFileSync(join(BRAIN, "sources", "apres-skill", "source.json"), JSON.stringify({ kind: "script", after: ["skill:ma-skill"] }), "utf8");
    const transcript = join(BASE, "transcript.jsonl");
    const lines = [
      { type: "user", message: { content: "fais-le" } },
      { type: "assistant", message: { content: [{ type: "tool_use", name: "Skill", input: { skill: "ma-skill" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", content: "x".repeat(1_600_000) }] } },
      { type: "assistant", message: { content: [{ type: "text", text: "fait" }] } },
    ];
    writeFileSync(transcript, `${lines.map((l) => JSON.stringify(l)).join("\n")}\n`, "utf8");
    r = run("node", [join(SCRIPTS, "hook-journal.mjs")], { input: JSON.stringify({ session_id: "zone", transcript_path: transcript, cwd: BASE }) });
    check("a skill followed by more than a megabyte of results still gives its signal", r.ok && existsSync(join(HB, "due", "apres-skill")), `${r.out} ${existsSync(join(HB, "due")) ? readdirSync(join(HB, "due")).join() : "no due folder"}`);
  }

  // ---------------------------------------------------------------- the speed
  section("How long a question takes (measured here, not a check)");
  noLock();
  build({ vectors: false });
  const timed = (code) => mod(`const E = await import(${JSON.stringify(U("engine.mjs"))}); const t0 = performance.now(); ${code} console.log(JSON.stringify({ ms: Math.round(performance.now() - t0) }));`).value?.ms;
  const still = timed("const { db } = await E.freshDb({ vectors: false }); db.close();");
  utimesSync(notePath("un-zebre-visible"), new Date(), new Date());
  writeNote("fond-000", { title: "Fond 0", body: `${soup(60)} modifiee` });
  const moved = timed("const { db } = await E.freshDb({ vectors: false }); db.close();");
  console.log(`  ${count()} notes: the index made ready for a question in ${still} ms when nothing moved, ${moved} ms after one note was edited`);
} catch (e) {
  failures++;
  console.log(`\n  FAIL  the checks stopped: ${e?.stack ?? e}`);
} finally {
  fake.kill();
  silent.close();
  // A build started apart may still hold the index for an instant.
  until(() => !existsSync(`${DB}.build.lock`), 10_000);
  if (!process.argv.includes("--keep")) {
    for (let tries = 0; tries < 10; tries++) {
      try {
        rmSync(BASE, { recursive: true, force: true });
        break;
      } catch {
        sleep(300);
      }
    }
  }
}

// WHAT IS NOBODY (2026-11-22): a platform relay, a mass mailing, a service
// box never enter the directory; a person, even never written to, does.
section("The directory keeps out what is nobody");
{
  const { notAPerson, upsert } = await import(pathToFileURL(join(PLUGIN, "scripts", "directory.mjs")).href);
  const cases = [
    [{ address: "7ccm99mv77xjlkd6@messagerie.leboncoin.fr", name: "Lucas via leboncoin", sent: 2 }, true, "a Leboncoin relay, even answered"],
    [{ address: "livraison@notification.colisprive.com", name: "Colis Prive" }, true, "a mass-mail subdomain"],
    [{ address: "confirmation-commande@amazon.fr", name: "Amazon.fr" }, true, "an order box never written to"],
    [{ address: "h0418@hotel-exemple.com", name: "" }, true, "no person's name, never written to"],
    [{ address: "paul.garnier@m2.care", name: "Paul Garnier" }, false, "m2.care is a domain, not a mass subdomain"],
    [{ address: "marc.lefevre@salesforce.com", name: "Marc Lefèvre" }, false, "someone working at a platform"],
    [{ address: "anne.morel@institut-exemple.org", name: "" }, false, "a name-like address, never written to"],
    [{ address: "service-client@studio-exemple.com", name: "Hugo Bernard", sent: 48 }, false, "a service box the person writes to"],
    [{ address: "contact@lumen.fr", name: "", note: "lumen" }, false, "an address with a note"],
  ];
  for (const [c, nobody, why] of cases) check(`${nobody ? "kept out" : "kept"}: ${why}`, notAPerson(c) === nobody, c.address);
  const dir = { contacts: [{ address: "x1@messagerie.leboncoin.fr", domain: "messagerie.leboncoin.fr", sent: 0, received: 3 }] };
  const r = upsert(dir, [{ address: "x1@messagerie.leboncoin.fr", received: 1 }, { address: "jeanne.martin@lumen.fr", name: "Jeanne Martin", sent: 1, received: 1 }], {}, { contacts: {} });
  check("an upsert skips nobody and drops an old entry of the kind", r.skipped === 1 && dir.contacts.length === 1 && dir.contacts[0].address === "jeanne.martin@lumen.fr", JSON.stringify(r));
}

console.log(`\n${total - failures} ok, ${failures} FAIL (${total} checks)\n`);
process.exit(failures ? 1 : 0);
