#!/usr/bin/env node
// banc-cloud.mjs - The brain's cloud copy, without Cloudflare: a fake wrangler
// (D1 as a SQLite file, R2 as a folder), and the REAL Worker, run in Node on
// top of them. It proves the door, the rights, the update by difference, and
// above all that the Worker answers exactly what the computer answers.
//
//   node tests/banc-cloud.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, "..", "scripts");
const BASE = join(tmpdir(), `hypervibe-brain-cloud-${process.pid}`);
const BRAIN = join(BASE, "brain");
const HOME = join(BASE, "home");
const FAKE = join(BASE, "cloudflare");
mkdirSync(HOME, { recursive: true });
const GITCONFIG = join(BASE, "gitconfig");
writeFileSync(GITCONFIG, "[user]\n\tname = banc\n\temail = banc@example.invalid\n[init]\n\tdefaultBranch = main\n", "utf8");

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
const fake = spawn("node", [join(HERE, "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", GIT_CONFIG_GLOBAL: GITCONFIG, GIT_CONFIG_NOSYSTEM: "1",
  HVBRAIN_WRANGLER: join(HERE, "faux-wrangler.mjs"), FAKE_CF_DIR: FAKE, HVBRAIN_NO_CLIPBOARD: "1",
  EMBEDDINGS_API_KEY: "k", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1`, OPENAI_API_KEY: "",
};
const run = (script, a = [], input = "") => {
  const r = spawnSync("node", [join(SCRIPTS, script), ...a], { env, input, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: `${r.stdout}${r.status === 0 ? "" : err}` };
};
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const cap = (title, body, extra = []) => run("capture.mjs", ["--title", title, "--type", "note", "--domains", "work", "--no-commit", ...extra], body);
const calls = () => readFileSync(join(FAKE, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));

// The Worker, run in Node on the fake D1 and R2, as Cloudflare would run it.
const opened = [];
function workerEnv(tokensJson) {
  const db = new DatabaseSync(join(FAKE, "d1-brain-sam.sqlite"));
  opened.push(db);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    first: async () => db.prepare(sql).get(...params) ?? null,
  });
  const bucket = join(FAKE, "r2-brain-sam");
  return {
    DB: { prepare: (sql) => stmt(sql) },
    BRAIN: {
      get: async (key) => {
        const f = join(bucket, key);
        if (!existsSync(f)) return null;
        const buf = readFileSync(f);
        return { json: async () => JSON.parse(buf.toString("utf8")), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
      },
    },
    TOKENS: tokensJson,
    OPENAI_API_KEY: "k",
    EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1`,
  };
}

try {
  console.log(`\nBanc de la copie Cloudflare, dans ${BASE}\n`);

  // ---- a brain with a bit of everything
  run("init.mjs", ["--dir", BRAIN, "--name", "Sam", "--domains", "work,life", "--lang", "en"]);
  cap("Work moves", "Work does not vanish, it moves to what cannot be automated.");
  cap("Novel project", "A novel about a city that dreams. See [[work-moves]].");
  cap("Health file", "My blood results.", ["--visibility", "private"]);
  cap("Very long note", `Start of the long note. ${"lorem ipsum dolor sit amet ".repeat(1500)}The end of the long note.`);
  run("contacts.mjs", ["enable"]);
  run("contacts.mjs", ["upsert"], JSON.stringify({ address: "marie@horizon.fr", name: "Marie Durand", sent: 40, received: 20, summary: "Innovation, Studio Horizon" }));
  let r = run("build.mjs");
  check("the brain is ready, with its vectors", r.ok && /2 computed|3 computed/.test(r.out), r.out);

  // ---- setup: everything asked in the EU
  r = run("cloud.mjs", ["setup", "--include-private"]);
  const setup = json(r.out);
  check("the cloud copy is set up and recorded in the brain", r.ok && setup.cloud.database === "brain-sam" && setup.cloud.databaseId && setup.cloud.includePrivate === true, r.out);
  check("the database and the bucket are created IN THE EU jurisdiction", calls().filter((c) => /create/.test(c.call)).every((c) => c.jurisdiction === "eu") && calls().filter((c) => /create/.test(c.call)).length === 2, JSON.stringify(calls()));

  // ---- the first copy, then by difference
  r = run("cloud.mjs", ["sync"]);
  let s = json(r.out);
  check("the first copy sends every note, link and contact, and the vectors", r.ok && s.notes === 4 && s.links === 1 && s.contacts === 1 && s.matrix === true, r.out);
  check("the vectors go to the EU bucket, the binary before its list", (() => {
    const puts = calls().filter((c) => c.call === "r2 object put");
    return puts.length === 2 && puts.every((p) => p.jurisdiction === "eu" && p.remote) && puts[0].key === "matrix.f32" && puts[1].key === "matrix.json";
  })(), JSON.stringify(calls().filter((c) => c.call === "r2 object put")));
  const d1 = new DatabaseSync(join(FAKE, "d1-brain-sam.sqlite"));
  opened.push(d1);
  check("a long text is cut in parts, none over what D1 accepts", d1.prepare("SELECT COUNT(*) n FROM note_more WHERE slug = 'very-long-note'").get().n >= 1 && Math.max(...calls().filter((c) => c.call === "d1 execute").map((c) => c.bytes)) > 0, "");
  check("a private note's text is copied only because the person chose it, and apart", d1.prepare("SELECT body FROM private_note WHERE slug = 'health-file'").get()?.body === "My blood results." && !d1.prepare("SELECT COUNT(*) n FROM note WHERE slug = 'health-file'").get().n);
  r = run("cloud.mjs", ["sync"]);
  s = json(r.out);
  check("a second copy the same evening sends nothing but its date", r.ok && s.notes === 0 && s.links === 0 && s.contacts === 0 && s.removed === 0 && s.matrix === false, r.out);
  const p = join(BRAIN, "vault", "notes", "novel-project.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("dreams.", "dreams of whales."), "utf8");
  r = run("cloud.mjs", ["sync"]);
  s = json(r.out);
  check("a changed note: only it is sent (and its new vector)", r.ok && s.notes === 1 && s.matrix === true, r.out);
  rmSync(join(BRAIN, "vault", "notes", "very-long-note.md"));
  r = run("cloud.mjs", ["sync"]);
  s = json(r.out);
  check("a removed note is removed from the cloud, with its parts", r.ok && s.removed === 1 && d1.prepare("SELECT COUNT(*) n FROM note_more WHERE slug = 'very-long-note'").get().n === 0, r.out);
  cap("Very long note", `Start of the long note. ${"lorem ipsum dolor sit amet ".repeat(1500)}The end of the long note.`);
  run("cloud.mjs", ["sync"]);

  // ---- deploy, tokens
  r = run("cloud.mjs", ["deploy"]);
  const dep = json(r.out);
  check("the Worker is deployed, its bucket bound in the EU jurisdiction", r.ok && dep.url === "https://brain-sam.fake-account.workers.dev/mcp" && calls().some((c) => c.call === "deploy" && c.r2Jurisdiction), r.out);
  const secrets = () => JSON.parse(readFileSync(join(FAKE, "secrets-brain-sam.json"), "utf8"));
  check("deployed with no token: the door is closed", JSON.parse(secrets().TOKENS).length === 0 && secrets().OPENAI_API_KEY === "k", JSON.stringify(secrets()));
  r = run("cloud.mjs", ["token", "create", "reader"]);
  const tok = json(r.out);
  const tokenFile = join(HOME, ".hypervibe-brain", "token-reader.txt");
  const readerValue = readFileSync(tokenFile, "utf8").trim();
  check("a token is created, its value handed over outside this output", r.ok && !r.out.includes(readerValue) && tok.value.includes("token-reader.txt") && tok.private === false && tok.addresses === false, r.out);
  check("the brain keeps its print only", readFileSync(join(BRAIN, "cloud", "tokens.json"), "utf8").includes('"hash"') && !readFileSync(join(BRAIN, "cloud", "tokens.json"), "utf8").includes(readerValue));
  r = run("cloud.mjs", ["token", "create", "trusted-agent", "--private", "--addresses"]);
  const trustedValue = readFileSync(join(HOME, ".hypervibe-brain", "token-trusted-agent.txt"), "utf8").trim();
  check("the Worker knows both tokens", JSON.parse(secrets().TOKENS).length === 2);

  // ---- the Worker itself
  const build = join(HOME, ".hypervibe-brain", "cloud", "brain-sam");
  const worker = (await import(pathToFileURL(join(build, "worker.js")).href)).default;
  const wenv = workerEnv(secrets().TOKENS);
  const ask = async (token, method, params = {}, id = 1) => {
    const res = await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id, method, params }) }), wenv);
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  };
  const tool = async (token, name, args) => JSON.parse((await ask(token, "tools/call", { name, arguments: args })).body.result.content[0].text);
  const local = (name, args) => {
    const o = spawnSync("node", [join(SCRIPTS, "tool.mjs"), name], { env, input: JSON.stringify(args), encoding: "utf8" });
    return JSON.parse(o.stdout.trim().split("\n").pop()).result;
  };
  check("without a token: 401", (await ask(null, "tools/list")).status === 401);
  check("with a false token: 401", (await ask("hb_nope", "tools/list")).status === 401);
  const closed = workerEnv("[]");
  check("with an empty token list: 401 for everyone", (await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { Authorization: `Bearer ${readerValue}` }, body: "{}" }), closed)).status === 401);
  const init = await ask(readerValue, "initialize", { protocolVersion: "2025-06-18" });
  check("with a token: the handshake, and the same instructions as the computer", init.body?.result?.instructions?.includes("Sam has a second brain"), JSON.stringify(init.body));
  check("the same six tools", (await ask(readerValue, "tools/list")).body.result.tools.length === 6);

  // PARITY: the Worker answers what the computer answers.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const q of ["work", "city dreams", "automated", "health", "long note"]) {
    const w = await tool(readerValue, "brain_search", { query: q });
    const l = local("brain_search", { query: q });
    check(`parity, search "${q}"`, same(w, l), `worker ${JSON.stringify(w)}\n        local  ${JSON.stringify(l)}`);
  }
  const wm = await tool(readerValue, "brain_search", { query: "automation of work", meaning: true });
  const lm = local("brain_search", { query: "automation of work", meaning: true });
  check("parity, search by meaning", same(wm, lm), `worker ${JSON.stringify(wm)}\n        local  ${JSON.stringify(lm)}`);
  for (const slug of ["novel-project", "work-moves", "health-file", "very-long-note"]) {
    const w = await tool(readerValue, "brain_get", { slug });
    const { file, ...l } = local("brain_get", { slug });
    check(`parity, note "${slug}"`, same(w, l), `worker ${JSON.stringify(w).slice(0, 300)}\n        local  ${JSON.stringify(l).slice(0, 300)}`);
  }
  const wn = await tool(readerValue, "brain_neighbors", { slug: "novel-project" });
  const ln = local("brain_neighbors", { slug: "novel-project" });
  check("parity, neighbours (links and by meaning)", same(wn, ln), `worker ${JSON.stringify(wn)}\n        local  ${JSON.stringify(ln)}`);
  const wt = await tool(readerValue, "brain_timeline", { limit: 10 });
  const lt = local("brain_timeline", { limit: 10 });
  check("parity, timeline", same(wt, lt), `worker ${JSON.stringify(wt)} / local ${JSON.stringify(lt)}`);
  const ws = await tool(readerValue, "brain_stats", {});
  const ls = local("brain_stats", {});
  const pick = (o) => ({ notes: o.notes, types: o.types, format: o.format, byType: o.byType, byStatus: o.byStatus, byVisibility: o.byVisibility, byDomain: o.byDomain, links: o.links, vectors: o.vectors });
  check("parity, stats", same(pick(ws), pick(ls)), `worker ${JSON.stringify(pick(ws))}\n        local  ${JSON.stringify(pick(ls))}`);

  // RIGHTS.
  check("a private note's text never leaves without the right", (await tool(readerValue, "brain_get", { slug: "health-file" })).body.includes("never shown"));
  check("nor is it searchable by its text", !(await tool(readerValue, "brain_search", { query: "blood" })).some((x) => x.slug === "health-file"));
  check("with the right, it is", (await tool(trustedValue, "brain_get", { slug: "health-file" })).body === "My blood results." && (await tool(trustedValue, "brain_search", { query: "blood" })).some((x) => x.slug === "health-file"));
  const cNo = await tool(readerValue, "brain_contact", { query: "horizon" });
  const cYes = await tool(trustedValue, "brain_contact", { query: "horizon" });
  check("a contact comes without its address without the right, with it otherwise", cNo.found[0]?.name === "Marie Durand" && !("address" in cNo.found[0]) && cYes.found[0]?.address === "marie@horizon.fr", JSON.stringify([cNo, cYes]));

  // Revoking.
  r = run("cloud.mjs", ["token", "revoke", "reader"]);
  const after = workerEnv(secrets().TOKENS);
  check("a revoked token no longer enters", r.ok && (await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { Authorization: `Bearer ${readerValue}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), after)).status === 401);
} finally {
  fake.kill();
  for (const db of opened) {
    try {
      db.close();
    } catch {
      // already closed
    }
  }
  if (process.argv.includes("--keep")) console.log(`\n  (--keep: ${BASE} left in place)`);
  else rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
console.log(failures ? `\n${failures}/${total} FAILED\n` : `\nAll ${total} checks pass.\n`);
process.exitCode = failures ? 1 : 0;
