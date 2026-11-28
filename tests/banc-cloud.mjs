#!/usr/bin/env node
// banc-cloud.mjs - The brain's cloud copy, without Cloudflare: a fake wrangler
// (D1 as a SQLite file, R2 as a folder), and the REAL Worker, run in Node on
// top of them. It proves the door, the rights, the update by difference, and
// above all that the Worker answers exactly what the computer answers.
// And what must NOT leave (2026-11-27): an address without the right to
// addresses, anything drawn from a private note's text, a skill nobody chose
// to send or one that holds a secret, a key towards a host that is not its own.
//
//   node tests/banc-cloud.mjs [--keep]

import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
const run = (script, a = [], input = "", more = {}) => {
  const r = spawnSync("node", [join(SCRIPTS, script), ...a], { env: { ...env, ...more }, input, encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: `${r.stdout}${r.status === 0 ? "" : err}` };
};
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const cap = (title, body, extra = []) => run("capture.mjs", ["--title", title, "--type", "note", "--domains", "work", "--no-commit", ...extra], body);
const calls = () => readFileSync(join(FAKE, "calls.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const secrets = () => JSON.parse(readFileSync(join(FAKE, "secrets-brain-sam.json"), "utf8"));
const WORK = join(HOME, ".hypervibe-brain", "cloud-work");
const bucket = join(FAKE, "r2-brain-sam");

// The Worker, run in Node on the fake D1 and R2, as Cloudflare would run it,
// with the very secrets the deployment sent.
const opened = [];
function workerEnv(tokensJson, more = {}) {
  const db = new DatabaseSync(join(FAKE, "d1-brain-sam.sqlite"));
  opened.push(db);
  const stmt = (sql, params = []) => ({
    bind: (...p) => stmt(sql, p),
    all: async () => ({ results: db.prepare(sql).all(...params) }),
    first: async () => db.prepare(sql).get(...params) ?? null,
  });
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
    EMBEDDINGS: secrets().EMBEDDINGS,
    ...more,
  };
}

try {
  console.log(`\nBanc de la copie Cloudflare, dans ${BASE}\n`);

  // ---- what reads a text for secrets (secret-scan.mjs), on its own
  {
    const { scanSecrets } = await import(pathToFileURL(join(SCRIPTS, "secret-scan.mjs")).href);
    // (Written in pieces, put together here: these samples must look like
    // secrets to the reader under test, not to the tools that keep real ones
    // out of this repository.)
    const k = (...parts) => parts.join("");
    const tail = k("abcdefghij", "0123456789", "abcd");
    const found = [
      k("the key sk", "-", "abcdefghijklmnopqrstuvwx1234"), k("GH=gh", "p_", "abcdefghijklmnopqrstuvwxyz0123456789"), k("xox", "b-", "1234567890-abcdefghij"), k("AKIA", "IOSFODNN7", "EXAMPLE"),
      k("ey", "JhbGciOiJIUzI1NiJ9", ".ey", "JzdWIiOiIxMjM0NTY3ODkwIn0", ".abcdefghijk"), k("-----BEGIN OPENSSH ", "PRIVATE KEY-----"), k("password", ": Soleil", "2024!"), k("mot de passe", " : hunter", "2x"), k("pwd", "=abcd"),
      k('the "password"', ': "s3cret', 'Value"'), k("git clone https://bob", ":tr0ub4dor", "@example.com/repo.git"), k("https://x-access-token", ":abc123def456", "@github.com/a/b.git"), k("https://abcdef0123", "456789abcd", "@github.com/a/b.git"),
      k("curl https://api.example.com/v1?to", "ken=abcdef", "123456"), k("ssh root", "@203.0.113.7"), k("api_", "key = ", tail), k("Authorization: Bea", "rer ", tail),
    ].filter((t) => !scanSecrets(t).length);
    check("a key, a token, a password in clear, a URL with credentials, a server's SSH account are all found", !found.length, `missed: ${found.join(" | ")}`);
    const wrong = [
      "password: the person types it in the window", "mot de passe : celui du coffre, jamais affiché", "pwd=$PWD and password=<password>", "Authorization: Bearer <key>", "Authorization: Bearer $TOKEN",
      "https://user:<password>@host/repo", "?key=$KEY&token=<token>", "write to marie@example.com", "ssh user@127.0.0.1", "sk-... is the shape of a key", "never the password: **never read that file**",
      "const password = credentials?.password as string | undefined;", "version 1.2.3.4 of the tool",
    ].filter((t) => scanSecrets(t).length);
    check("a placeholder and a sentence about a password are left alone", !wrong.length, `wrongly found: ${wrong.join(" | ")}`);
    const said = scanSecrets(k("line one\npassword", ": Soleil", "2024!\nline three"));
    check("what is found is said by its line and its kind, never by its value", said.length === 1 && said[0].line === 2 && said[0].kind === "a password" && !JSON.stringify(said).includes("Soleil"), JSON.stringify(said));
  }

  // ---- which wrangler runs, and what the one npx downloads may see
  {
    const { wranglerPlan, fetchWrangler, withoutCloudflare } = await import(pathToFileURL(join(SCRIPTS, "cloud-wrangler.mjs")).href);
    const plan = wranglerPlan({ fake: "", roots: [], platform: "linux" });
    check("without a wrangler installed, npx is asked for a precise major version", plan.npx && plan.cmd === "npx" && /^wrangler@\d+$/.test(plan.pre.at(-1)) && plan.fetch.includes("--yes") && /^wrangler@\d+$/.test(plan.fetch.at(-2)), JSON.stringify(plan));
    check("the commands that carry the token never download (npx --no)", plan.pre.includes("--no") && !plan.pre.includes("--yes"), JSON.stringify(plan));
    const seen = [];
    fetchWrangler(plan, { spawn: (cmd, a, o) => (seen.push({ cmd, a, env: o.env }), { status: 0 }), env: { PATH: "x", CLOUDFLARE_API_TOKEN: "secret-token", CLOUDFLARE_ACCOUNT_ID: "acc", CF_API_TOKEN: "other" } });
    check("the download runs without any Cloudflare access in its environment", seen.length === 1 && seen[0].env.PATH === "x" && !Object.keys(seen[0].env).some((k) => /CLOUDFLARE|CF_/.test(k)) && !Object.keys(withoutCloudflare({ CLOUDFLARE_API_TOKEN: "x" })).length, JSON.stringify(seen));
    const source = readFileSync(join(SCRIPTS, "cloud.mjs"), "utf8");
    check("cloud.mjs no longer puts the vault's token in its own environment, nor asks npx for the latest wrangler", !/process\.env\.CLOUDFLARE_API_TOKEN\s*=/.test(source) && !/"--yes", "wrangler"\]/.test(source));
  }

  // ---- a brain with a bit of everything
  run("init.mjs", ["--dir", BRAIN, "--name", "Sam", "--domains", "work,life", "--lang", "en"]);
  cap("Work moves", "Work does not vanish, it moves to what cannot be automated.");
  cap("Novel project", "A novel about a city that dreams. See [[work-moves]].");
  cap("Health file", "My blood results.", ["--visibility", "private"]);
  cap("Very long note", `Start of the long note. ${"lorem ipsum dolor sit amet ".repeat(1500)}The end of the long note.`);
  run("contacts.mjs", ["enable"]);
  run("contacts.mjs", ["upsert"], JSON.stringify({ address: "marie@horizon.fr", name: "Marie Durand", sent: 40, received: 20, summary: "Innovation, Studio Horizon" }));
  // A skill of the executive floor, and a guard before a step (2026-11-23).
  mkdirSync(join(BRAIN, "executive", "skills", "invoice", "scripts"), { recursive: true });
  writeFileSync(join(BRAIN, "executive", "skills", "invoice", "SKILL.md"), "---\nname: invoice\ndescription: Makes an invoice, sends nothing.\n---\n\nRun `node ${CLAUDE_SKILL_DIR}/scripts/invoice.mjs` with Bash, for: $ARGUMENTS\n", "utf8");
  writeFileSync(join(BRAIN, "executive", "skills", "invoice", "scripts", "invoice.mjs"), "console.log('invoice');\n", "utf8");
  mkdirSync(join(BRAIN, "executive", "guards"), { recursive: true });
  writeFileSync(join(BRAIN, "executive", "guards", "buy-guard.mjs"), "// buy-guard.mjs - Refuses any purchase from the host: a purchase is made by hand, by the person, in their own account.\n", "utf8");
  writeFileSync(join(BRAIN, "executive", "guards.json"), JSON.stringify({ "buy-guard.mjs": { hooks: [{ event: "PreToolUse", matcher: "Bash" }] } }), "utf8");
  let r = run("build.mjs");
  check("the brain is ready, with its vectors", r.ok && /4 computed/.test(r.out), r.out);

  // ---- setup: everything asked in the EU
  r = run("cloud.mjs", ["setup", "--include-private"]);
  const setup = json(r.out);
  check("the cloud copy is set up and recorded in the brain", r.ok && setup.cloud.database === "brain-sam" && setup.cloud.databaseId && setup.cloud.includePrivate === true, r.out);
  check("the skills are not part of the copy unless the person chose it", setup.cloud.skills === false, r.out);
  check("the database and the bucket are created IN THE EU jurisdiction", calls().filter((c) => /create/.test(c.call)).every((c) => c.jurisdiction === "eu") && calls().filter((c) => /create/.test(c.call)).length === 2, JSON.stringify(calls()));

  // ---- the first copy, then by difference
  r = run("cloud.mjs", ["sync"]);
  let s = json(r.out);
  check("the first copy sends every note, link and contact, and the vectors", r.ok && s.notes === 4 && s.links === 1 && s.contacts === 1 && s.matrix === true, r.out);
  const d1 = new DatabaseSync(join(FAKE, "d1-brain-sam.sqlite"));
  opened.push(d1);
  check("no skill and no rule of a guard leave without the person's choice", s.skills === 0 && d1.prepare("SELECT COUNT(*) n FROM skill").get().n === 0 && d1.prepare("SELECT v FROM meta WHERE k = 'guard_rules'").get().v === "[]", r.out);
  check("nothing of what was sent stays on the disk (no SQL file, no matrix)", existsSync(WORK) && !readdirSync(WORK).some((f) => /\.sql$|^matrix\./.test(f)), readdirSync(WORK).join(", "));
  check("the vectors go to the EU bucket, the binary before its list", (() => {
    const puts = calls().filter((c) => c.call === "r2 object put");
    return puts.length === 2 && puts.every((p) => p.jurisdiction === "eu" && p.remote) && puts[0].key === "matrix.f32" && puts[1].key === "matrix.json";
  })(), JSON.stringify(calls().filter((c) => c.call === "r2 object put")));
  // The person's choice (2026-11-27): what would go is shown first, then it goes.
  r = run("cloud.mjs", ["skills"]);
  check("before choosing, the person sees which skills would go", r.ok && json(r.out).skills === false && JSON.stringify(json(r.out).wouldSend) === '["invoice"]', r.out);
  r = run("cloud.mjs", ["skills", "on"]);
  check("the choice is written in the brain", r.ok && JSON.parse(readFileSync(join(BRAIN, "brain.json"), "utf8")).cloud.skills === true, r.out);
  r = run("cloud.mjs", ["sync"]);
  s = json(r.out);
  check("once chosen, the skill is sent, with the rule of the guard", s.skills === 1 && d1.prepare("SELECT v FROM meta WHERE k = 'guard_rules'").get().v.includes("Refuses any purchase"), r.out);
  check("a long text is cut in parts, none over what D1 accepts", d1.prepare("SELECT COUNT(*) n FROM note_more WHERE slug = 'very-long-note'").get().n >= 1 && Math.max(...calls().filter((c) => c.call === "d1 execute").map((c) => c.bytes)) > 0, "");
  check("a private note's text is copied only because the person chose it, and apart", d1.prepare("SELECT body FROM private_note WHERE slug = 'health-file'").get()?.body === "My blood results." && !d1.prepare("SELECT COUNT(*) n FROM note WHERE slug = 'health-file'").get().n);
  r = run("cloud.mjs", ["sync"]);
  s = json(r.out);
  check("a second copy the same evening sends nothing but its date", r.ok && s.notes === 0 && s.links === 0 && s.contacts === 0 && s.removed === 0 && s.matrix === false && s.skills === 0, r.out);
  {
    // A copy made before the skills has no table for them: the next sync makes it.
    d1.exec("DROP TABLE skill");
    const again = run("cloud.mjs", ["sync"]);
    check("a copy made before the skills gets their table, and the skill", again.ok && json(again.out).skills === 1 && d1.prepare("SELECT COUNT(*) n FROM skill").get().n === 1, again.out);
  }
  {
    // A SKILL THAT HOLDS A SECRET IS NOT SENT (2026-11-27): the sync goes on,
    // and says which skill and which lines, never the value. A skill whose
    // head says `cloud: false` stays on the computer.
    mkdirSync(join(BRAIN, "executive", "skills", "server"), { recursive: true });
    writeFileSync(join(BRAIN, "executive", "skills", "server", "SKILL.md"), ["---\nname: server\ndescription: Restarts the server.\n---\n\nConnect with `ssh deploy", "@203.0.113.7`.\nThe admin password", ": Tr0ub4dor", "!x\n"].join(""), "utf8");
    mkdirSync(join(BRAIN, "executive", "skills", "diary"), { recursive: true });
    writeFileSync(join(BRAIN, "executive", "skills", "diary", "SKILL.md"), "---\nname: diary\ndescription: The way of my diary.\ncloud: false\n---\n\nWrite gently.\n", "utf8");
    const held = run("cloud.mjs", ["sync"]);
    const h = json(held.out);
    const names = d1.prepare("SELECT name FROM skill ORDER BY name").all().map((x) => x.name);
    check("a skill that holds a secret is not sent, and the sync goes on", held.ok && h.ok === true && JSON.stringify(names) === '["invoice"]', held.out);
    check("the sync says which skill and which lines, never the value", h.skillsHeld?.length === 1 && h.skillsHeld[0].skill === "server" && JSON.stringify(h.skillsHeld[0].lines.map((l) => l.line)) === "[6,7]" && /server.*line 6.*line 7/.test(h.warning) && !held.out.includes("Tr0ub4dor") && !held.out.includes("203.0.113.7"), held.out);
    check("a skill marked `cloud: false` stays on the computer", JSON.stringify(h.skillsKeptHere) === '["diary"]' && !names.includes("diary"), held.out);
    const all = JSON.stringify(d1.prepare("SELECT * FROM skill").all()) + JSON.stringify(d1.prepare("SELECT * FROM meta").all());
    check("nothing of the held skill is in the cloud copy", !all.includes("Tr0ub4dor") && !all.includes("203.0.113.7") && !all.includes("Write gently"), all.slice(0, 300));
  }
  {
    // A SKILL THE PERSON SWITCHED OFF LEAVES THE CLOUD COPY (2026-11-27): the
    // brain keeps the switch (executive.mjs switch), the next sync removes
    // the skill online, and it comes back once it is switched on again.
    mkdirSync(join(BRAIN, "executive", "skills", "letters"), { recursive: true });
    writeFileSync(join(BRAIN, "executive", "skills", "letters", "SKILL.md"), "---\nname: letters\ndescription: Writes a letter.\n---\n\nWrite the letter kindly.\n", "utf8");
    const names = () => d1.prepare("SELECT name FROM skill ORDER BY name").all().map((x) => x.name);
    run("cloud.mjs", ["sync"]);
    check("a skill that is on is in the cloud copy", JSON.stringify(names()) === '["invoice","letters"]', JSON.stringify(names()));
    const off = run("executive.mjs", ["switch", "skill", "letters", "off"]);
    check("the person switches it off in the brain", off.ok && json(off.out).switch === "off", off.out);
    check("it is no longer among the skills that would go", !json(run("cloud.mjs", ["skills"]).out).sends.includes("letters"));
    const gone = run("cloud.mjs", ["sync"]);
    const text = JSON.stringify(d1.prepare("SELECT * FROM skill").all());
    check("the next sync removes it from the cloud copy, text and all", gone.ok && json(gone.out).skills === 1 && JSON.stringify(names()) === '["invoice"]' && !text.includes("Write the letter kindly"), gone.out);
    run("executive.mjs", ["switch", "skill", "letters", "on"]);
    check("switched on again, it is sent again", json(run("cloud.mjs", ["sync"]).out).skills === 1 && JSON.stringify(names()) === '["invoice","letters"]', JSON.stringify(names()));
    rmSync(join(BRAIN, "executive", "skills", "letters"), { recursive: true, force: true });
    run("cloud.mjs", ["sync"]);
    check("the copy is as before the essay", JSON.stringify(names()) === '["invoice"]', JSON.stringify(names()));
  }
  const p = join(BRAIN, "vault", "notes", "novel-project.md");
  writeFileSync(p, readFileSync(p, "utf8").replace("dreams.", "dreams of whales."), "utf8");
  // What an interrupted run left in the working folder goes at the next sync.
  writeFileSync(join(WORK, "q-old-run.sql"), "INSERT INTO note VALUES ('a note in clear');", "utf8");
  r = run("cloud.mjs", ["sync"]);
  s = json(r.out);
  check("a changed note: only it is sent (and its new vector)", r.ok && s.notes === 1 && s.matrix === true, r.out);
  check("the working folder is emptied at each sync, what an interrupted run left included", !readdirSync(WORK).some((f) => /\.sql$|^matrix\./.test(f)), readdirSync(WORK).join(", "));
  // A passing 502 from Cloudflare: the upload is tried again a little later,
  // and only a fault that lasts makes the night fail.
  {
    const withFault = (n) => {
      rmSync(join(FAKE, "faults"), { force: true });
      writeFileSync(p, readFileSync(p, "utf8").replace(/whales\.|seals\./, (m) => (m === "whales." ? "seals." : "whales.")), "utf8");
      // (Through `run`, as every other call: what the program answers is read
      // alone, and what it says beside only when it failed. Read together, the
      // answer was followed by the warning Node 22 writes when SQLite is
      // loaded, "ExperimentalWarning: SQLite is an experimental feature", and
      // was no longer JSON: the bench stopped there on Node 22.16, 2026-11-27.)
      const f = run("cloud.mjs", ["sync"], "", { FAKE_CF_FAIL: `r2 object put:${n}`, HVBRAIN_RETRY_WAITS: "10,10" });
      return { ok: f.ok, out: f.out, faults: calls().filter((c) => c.call === "fault").length };
    };
    const before = calls().filter((c) => c.call === "fault").length;
    const once = withFault(1);
    check("a passing 502 on the upload is tried again, and the copy goes through", once.ok && json(once.out).matrix === true && once.faults - before === 1, once.out);
    const lasting = withFault(5);
    check("a 502 that lasts is given up after three tries, and said", !lasting.ok && /502/.test(lasting.out) && lasting.faults - once.faults === 3, lasting.out);
    check("even then, the matrix does not stay on the disk", !readdirSync(WORK).some((f) => /^matrix\./.test(f)), readdirSync(WORK).join(", "));
    rmSync(join(FAKE, "faults"), { force: true });
    const back = run("cloud.mjs", ["sync"]);
    check("the next run sends what the lasting fault kept back", back.ok && json(back.out).matrix === true, back.out);
  }
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
  check("deployed with no token: the door is closed", JSON.parse(secrets().TOKENS).length === 0, JSON.stringify(secrets()));
  check("the key of search by meaning goes with the address it is for, in one secret", dep.meaning === true && JSON.stringify(JSON.parse(secrets().EMBEDDINGS)) === JSON.stringify({ key: "k", base: `http://127.0.0.1:${port}/v1` }) && !("OPENAI_API_KEY" in secrets()), JSON.stringify(secrets()));
  {
    // A KEY ONLY GOES TO ITS OWN HOST (2026-11-27): another service named for
    // the vectors, and only an OpenAI key in the brain: nothing is deployed.
    const other = run("cloud.mjs", ["deploy"], "", { EMBEDDINGS_API_KEY: "", OPENAI_API_KEY: "sk-test-of-the-bench", EMBEDDINGS_BASE_URL: "https://vectors.example/v1" });
    const o = json(other.out);
    check("an OpenAI key is not deployed towards another host: no key, and the reason", other.ok && o.meaning === false && /never sent to another host/.test(o.meaningRefused ?? "") && secrets().EMBEDDINGS === "{}" && !JSON.stringify(secrets()).includes("sk-test-of-the-bench"), other.out);
    const plain = run("cloud.mjs", ["deploy"], "", { EMBEDDINGS_BASE_URL: "http://vectors.example/v1" });
    check("nor any key towards an address that is not https", plain.ok && json(plain.out).meaning === false && secrets().EMBEDDINGS === "{}", plain.out);
    const openai = run("cloud.mjs", ["deploy"], "", { EMBEDDINGS_API_KEY: "", OPENAI_API_KEY: "sk-test-of-the-bench", EMBEDDINGS_BASE_URL: "" });
    check("an OpenAI key goes to OpenAI", openai.ok && json(openai.out).meaning === true && JSON.parse(secrets().EMBEDDINGS).base === "https://api.openai.com/v1", openai.out);
    run("cloud.mjs", ["deploy"]);
  }
  r = run("cloud.mjs", ["token", "create", "reader"]);
  const tok = json(r.out);
  const tokenFile = join(HOME, ".hypervibe-brain", "token-reader.txt");
  const readerValue = readFileSync(tokenFile, "utf8").trim();
  check("a token is created, its value handed over outside this output", r.ok && !r.out.includes(readerValue) && tok.value.includes("token-reader.txt") && tok.private === false && tok.addresses === false && tok.skills === false, r.out);
  check("its file is said to hold the key in clear, to be deleted", /delete the file/.test(tok.value) && /in clear/.test(tok.value), tok.value);
  check("the brain keeps its print only", readFileSync(join(BRAIN, "cloud", "tokens.json"), "utf8").includes('"hash"') && !readFileSync(join(BRAIN, "cloud", "tokens.json"), "utf8").includes(readerValue));
  r = run("cloud.mjs", ["token", "create", "trusted-agent", "--private", "--addresses", "--skills"]);
  const trustedValue = readFileSync(join(HOME, ".hypervibe-brain", "token-trusted-agent.txt"), "utf8").trim();
  check("the Worker knows both tokens, each with its rights", JSON.parse(secrets().TOKENS).length === 2 && JSON.parse(secrets().TOKENS).find((t) => t.name === "trusted-agent").skills === true && JSON.parse(secrets().TOKENS).find((t) => t.name === "reader").skills === false, secrets().TOKENS);

  // ---- the Worker itself
  const build = join(HOME, ".hypervibe-brain", "cloud", "brain-sam");
  const workerUrl = pathToFileURL(join(build, "worker.js")).href;
  const worker = (await import(workerUrl)).default;
  // (A second copy of the Worker, with its own memory: the first keeps the vectors it read for a minute.)
  const freshWorker = async (tag) => (await import(`${workerUrl}?${tag}`)).default;
  const wenv = workerEnv(secrets().TOKENS);
  const post = async (token, body, { w = worker, e = wenv } = {}) => {
    const res = await w.fetch(new Request("https://x/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: typeof body === "string" ? body : JSON.stringify(body) }), e);
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const ask = async (token, method, params = {}, id = 1, o = {}) => {
    const res = await post(token, { jsonrpc: "2.0", id, method, params }, o);
    return { status: res.status, body: res.status === 200 ? res.body : null };
  };
  const tool = async (token, name, args, o = {}) => JSON.parse((await ask(token, "tools/call", { name, arguments: args }, 1, o)).body.result.content[0].text);
  // What the computer answers, as the cloud answers a token that may read the
  // private notes (2026-11-23): the AI of the computer reads them whole
  // (engine.mjs, 2026-11-21), so parity is with that token; a reader without
  // the right is checked apart, under RIGHTS. One difference is wanted: the
  // reading of a long note in pieces (offset) is the computer's own for now
  // (tools.mjs, LOCAL).
  const asReader = (r) => {
    if (!r || typeof r !== "object" || Array.isArray(r)) return r;
    const o = { ...r };
    if (o.omitted?.body) {
      const { next, ...body } = o.omitted.body;
      o.omitted = { ...o.omitted, body: { ...body, more: "brain_get with full: true gives the whole text" } };
    }
    return o;
  };
  const local = (name, args) => {
    const o = spawnSync("node", [join(SCRIPTS, "tool.mjs"), name], { env, input: JSON.stringify(args), encoding: "utf8" });
    return asReader(JSON.parse(o.stdout.trim().split("\n").pop()).result);
  };
  check("without a token: 401", (await ask(null, "tools/list")).status === 401);
  check("with a false token: 401", (await ask("hb_nope", "tools/list")).status === 401);
  const closed = workerEnv("[]");
  check("with an empty token list: 401 for everyone", (await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { Authorization: `Bearer ${readerValue}` }, body: "{}" }), closed)).status === 401);
  const init = await ask(readerValue, "initialize", { protocolVersion: "2025-06-18" });
  check("with a token: the handshake, and the same instructions as the computer", init.body?.result?.instructions?.includes("Sam has a second brain"), JSON.stringify(init.body));
  {
    // THE SKILLS, ONLY WITH THE RIGHT (2026-11-27).
    const plainNames = (await ask(readerValue, "tools/list")).body.result.tools.map((t) => t.name);
    check("a token without the right to skills gets the six tools, and no brain_skill", plainNames.length === 6 && !plainNames.includes("brain_skill") && !plainNames.includes("brain_fetch"), JSON.stringify(plainNames));
    check("nor their names in the instructions, nor prompts", !init.body.result.instructions.includes("invoice") && !init.body.result.capabilities.prompts && (await ask(readerValue, "prompts/list")).body.result.prompts.length === 0, JSON.stringify(init.body.result));
    const refusedGet = await ask(readerValue, "prompts/get", { name: "invoice" });
    const refusedCall = (await ask(readerValue, "tools/call", { name: "brain_skill", arguments: { name: "invoice" } })).body.result;
    check("nor a skill asked for by its name", Boolean(refusedGet.body.error) && !JSON.stringify(refusedGet.body).includes("invoice.mjs") && refusedCall.isError === true && !refusedCall.content[0].text.includes("invoice.mjs"), JSON.stringify([refusedGet.body, refusedCall]));

    const initT = await ask(trustedValue, "initialize", { protocolVersion: "2025-06-18" });
    const names = (await ask(trustedValue, "tools/list")).body.result.tools.map((t) => t.name);
    check("with the right: the same six tools, and brain_skill since the copy holds a skill", names.length === 7 && names.includes("brain_skill") && !names.includes("brain_fetch"), JSON.stringify(names));
    check("the instructions name the skill, and prompts are offered", initT.body.result.instructions.includes("invoice") && Boolean(initT.body.result.capabilities.prompts), JSON.stringify(initT.body.result));
    const prompts = (await ask(trustedValue, "prompts/list")).body.result.prompts;
    check("one prompt per skill", prompts.length === 1 && prompts[0].name === "invoice" && prompts[0].description === "Makes an invoice, sends nothing.", JSON.stringify(prompts));
    const got = (await ask(trustedValue, "prompts/get", { name: "invoice", arguments: { request: "the March invoice" } })).body.result.messages[0].content.text;
    check("the skill comes translated, its folder named out of reach, the request in place", got.includes("Its folder is on the person's computer (it holds: scripts/)") && got.includes("for: the March invoice") && !got.includes("${CLAUDE_SKILL_DIR}") && got.includes("AskUserQuestion"), got);
    check("the guard comes as a rule", got.includes("Refuses any purchase from the host"), got);
    const text = (await ask(trustedValue, "tools/call", { name: "brain_skill", arguments: { name: "/invoice" } })).body.result.content[0].text;
    check("brain_skill gives the same text as the prompt", text === (await ask(trustedValue, "prompts/get", { name: "invoice", arguments: {} })).body.result.messages[0].content.text, text.slice(0, 300));
    const local = spawnSync("node", ["--input-type=module", "-e", `const m = await import(${JSON.stringify(pathToFileURL(join(SCRIPTS, "skills-mcp.mjs")).href)}); console.log(JSON.stringify(m.skillFor(${JSON.stringify(BRAIN)}, "invoice").text));`], { env, encoding: "utf8" });
    const here = JSON.parse(local.stdout.trim().split("\n").pop());
    // Where the folder is said apart, and what the skill names of it: the one difference between the two.
    const dir = `${BRAIN.replaceAll("\\", "/")}/executive/skills/invoice`;
    const plain = (t) => t.split("\n\n").filter((p) => !p.startsWith("Its folder")).join("\n\n").replaceAll(dir, "(the skill's folder, on the person's computer)");
    check("the computer and the cloud say the same skill, but for where its folder is", plain(here) === plain(text), `${here.slice(-200)}\n${text.slice(-200)}`);
    const missing = await ask(trustedValue, "prompts/get", { name: "nope" });
    check("an unknown skill is an error, with the list", missing.body.error?.message?.includes("invoice"), JSON.stringify(missing.body));
  }

  // PARITY: the Worker answers what the computer answers.
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const q of ["work", "city dreams", "automated", "health", "long note"]) {
    const w = await tool(trustedValue, "brain_search", { query: q });
    const l = local("brain_search", { query: q });
    check(`parity, search "${q}"`, same(w, l), `worker ${JSON.stringify(w)}\n        local  ${JSON.stringify(l)}`);
  }
  const wm = await tool(trustedValue, "brain_search", { query: "automation of work", meaning: true });
  const lm = local("brain_search", { query: "automation of work", meaning: true });
  check("parity, search by meaning", same(wm, lm), `worker ${JSON.stringify(wm)}\n        local  ${JSON.stringify(lm)}`);
  for (const slug of ["novel-project", "work-moves", "health-file", "very-long-note"]) {
    const w = await tool(trustedValue, "brain_get", { slug });
    const { file, ...l } = local("brain_get", { slug });
    check(`parity, note "${slug}"`, same(w, l), `worker ${JSON.stringify(w).slice(0, 300)}\n        local  ${JSON.stringify(l).slice(0, 300)}`);
  }
  const wn = await tool(trustedValue, "brain_neighbors", { slug: "novel-project" });
  const ln = local("brain_neighbors", { slug: "novel-project" });
  check("parity, neighbours (links and by meaning)", same(wn, ln), `worker ${JSON.stringify(wn)}\n        local  ${JSON.stringify(ln)}`);
  const wt = await tool(trustedValue, "brain_timeline", { limit: 10 });
  const lt = local("brain_timeline", { limit: 10 });
  check("parity, timeline", same(wt, lt), `worker ${JSON.stringify(wt)} / local ${JSON.stringify(lt)}`);
  const ws = await tool(trustedValue, "brain_stats", {});
  const ls = local("brain_stats", {});
  const pick = (o) => ({ notes: o.notes, types: o.types, format: o.format, byType: o.byType, byStatus: o.byStatus, byVisibility: o.byVisibility, byDomain: o.byDomain, links: o.links, vectors: o.vectors });
  check("parity, stats", same(pick(ws), pick(ls)), `worker ${JSON.stringify(pick(ws))}\n        local  ${JSON.stringify(pick(ls))}`);

  // PARITY WITH A NOTE HIDDEN FROM SEARCH (search.hidden): out of the search
  // and of the neighbours, back with everything, on both sides.
  {
    const bj = join(BRAIN, "brain.json");
    const before = JSON.parse(readFileSync(bj, "utf8"));
    writeFileSync(bj, JSON.stringify({ ...before, search: { hidden: ["notes/novel-project"] } }, null, 2), "utf8");
    run("cloud.mjs", ["sync"]);
    const cases = [["brain_search", { query: "city dreams" }], ["brain_search", { query: "city dreams", everything: true }], ["brain_search", { query: "automation of work", meaning: true }], ["brain_neighbors", { slug: "work-moves" }], ["brain_neighbors", { slug: "work-moves", everything: true }]];
    let hiddenOut = true;
    for (const [name, args] of cases) {
      const w = await tool(trustedValue, name, args);
      const l = local(name, args);
      check(`parity with a hidden note, ${name} ${JSON.stringify(args)}`, same(w, l), `worker ${JSON.stringify(w)}\n        local  ${JSON.stringify(l)}`);
      const list = Array.isArray(w) ? w : w.similar ?? [];
      if (!args.everything && list.some((x) => x.slug === "novel-project")) hiddenOut = false;
    }
    check("the hidden note stays out unless asked, and comes back with everything", hiddenOut && (await tool(readerValue, "brain_search", { query: "city dreams", everything: true })).some((x) => x.slug === "novel-project"));
    // (Only the hidden list is taken back: the sync has written its own date meanwhile.)
    const { search: _, ...now } = JSON.parse(readFileSync(bj, "utf8"));
    writeFileSync(bj, JSON.stringify(now, null, 2), "utf8");
    run("cloud.mjs", ["sync"]);
  }

  // RIGHTS.
  check("a private note's text never leaves without the right", (await tool(readerValue, "brain_get", { slug: "health-file" })).body.includes("never shown"));
  check("nor is it searchable by its text", !(await tool(readerValue, "brain_search", { query: "blood" })).some((x) => x.slug === "health-file"));
  check("with the right, it is", (await tool(trustedValue, "brain_get", { slug: "health-file" })).body === "My blood results." && (await tool(trustedValue, "brain_search", { query: "blood" })).some((x) => x.slug === "health-file"));
  const cNo = await tool(readerValue, "brain_contact", { query: "horizon" });
  const cYes = await tool(trustedValue, "brain_contact", { query: "horizon" });
  check("a contact comes without its address without the right, with it otherwise", cNo.found[0]?.name === "Marie Durand" && !("address" in cNo.found[0]) && cYes.found[0]?.address === "marie@horizon.fr", JSON.stringify([cNo, cYes]));
  {
    // ADDRESSES, WITHOUT THE RIGHT (2026-11-27): not searched, not shown, not
    // even inside a text. A second contact whose subjects and summary hold
    // addresses, and a field a source added.
    run("contacts.mjs", ["upsert"], JSON.stringify({ address: "paul.martin@secret-corp.example", name: "Paul Martin", sent: 12, received: 9, summary: "Buyer at Secret Corp, assistant: jane.doe@secret-corp.example. Site secret-corp.example", context: "Met through bob@elsewhere.example", phone: "+33 6 00 00 00 00" }));
    run("cloud.mjs", ["sync"]);
    const none = [];
    // The address used to come out letter by letter: each of these said yes or no.
    for (const q of ["marie@horizon", "marie@h", "@horizon.fr", "horizon.fr", "paul.martin@", "secret-corp.example", "jane.doe", "elsewhere", "+33"]) if ((await tool(readerValue, "brain_contact", { query: q })).found.length) none.push(q);
    check("without the right, the search looks neither into the address nor into the domain", !none.length, `answered: ${none.join(", ")}`);
    const paul = (await tool(readerValue, "brain_contact", { query: "paul buyer" })).found;
    const seen = JSON.stringify(paul);
    check("and what comes back holds no address: none in a text, no domain, no field a source added", paul.length === 1 && paul[0].name === "Paul Martin" && !("address" in paul[0]) && !("domain" in paul[0]) && !("phone" in paul[0]) && !seen.includes("@") && !seen.includes("secret-corp.example") && paul[0].summary.includes("[address hidden]") && paul[0].summary.includes("Buyer at Secret Corp"), seen);
    check("the mask is not a word to search by", (await tool(readerValue, "brain_contact", { query: "hidden" })).found.length === 0);
    const full = (await tool(trustedValue, "brain_contact", { query: "paul.martin@secret-corp.example" })).found;
    check("with the right, everything is searched and shown", full.length === 1 && full[0].address === "paul.martin@secret-corp.example" && full[0].domain === "secret-corp.example" && full[0].summary.includes("jane.doe@secret-corp.example") && (await tool(trustedValue, "brain_contact", { query: "horizon.fr" })).found.length === 1, JSON.stringify(full));
  }
  {
    // A PRIVATE NOTE, WITHOUT THE RIGHT (2026-11-27): nothing drawn from its
    // text. The copy holds its text here (--include-private): the Worker is
    // what keeps a token without the right away from it.
    cap("Secret plan", "Buy the house on Elm street, next to the bakery. See [[work-moves]].", ["--visibility", "private", "--source", "mail://thread/42"]);
    run("cloud.mjs", ["sync"]);
    const o = { w: await freshWorker("private"), e: workerEnv(secrets().TOKENS) };
    const gNo = await tool(readerValue, "brain_get", { slug: "secret-plan" }, o);
    const gYes = await tool(trustedValue, "brain_get", { slug: "secret-plan" }, o);
    check("without the right, a private note comes without its source and without the links it makes", gNo.title === "Secret plan" && gNo.body.includes("never shown") && !("source" in gNo) && gNo.links.length === 0, JSON.stringify(gNo));
    check("with the right, it comes whole", gYes.source === "mail://thread/42" && gYes.links.some((l) => l.slug === "work-moves") && gYes.body.includes("Elm street"), JSON.stringify(gYes));
    const nNo = await tool(readerValue, "brain_neighbors", { slug: "secret-plan" }, o);
    const nYes = await tool(trustedValue, "brain_neighbors", { slug: "secret-plan" }, o);
    check("without the right, a private note has no neighbours by meaning", nNo.similar.length === 0 && nNo.links.length === 0 && nYes.similar.length > 0, JSON.stringify([nNo, nYes]));
    const aroundNo = await tool(readerValue, "brain_neighbors", { slug: "work-moves", limit: 30 }, o);
    const aroundYes = await tool(trustedValue, "brain_neighbors", { slug: "work-moves", limit: 30 }, o);
    const privates = (n) => n.similar.filter((x) => ["secret-plan", "health-file"].includes(x.slug)).length;
    check("nor is a private note the neighbour of another, nor named among the notes that link to it", privates(aroundNo) === 0 && privates(aroundYes) === 2 && !aroundNo.backlinks.some((b) => b.slug === "secret-plan") && aroundYes.backlinks.some((b) => b.slug === "secret-plan"), JSON.stringify([aroundNo, aroundYes]));

    // WITHOUT --include-private: none of it leaves the computer at all.
    const bj = join(BRAIN, "brain.json");
    const cfgNow = JSON.parse(readFileSync(bj, "utf8"));
    cfgNow.cloud.includePrivate = false;
    writeFileSync(bj, JSON.stringify(cfgNow, null, 2), "utf8");
    const shut = run("cloud.mjs", ["sync"]);
    const row = d1.prepare("SELECT title, body, source FROM private_note WHERE slug = 'secret-plan'").get();
    check("a private note the person did not choose to copy leaves by its title only: no text, no source", shut.ok && row?.title === "Secret plan" && row.body === "" && row.source === null && d1.prepare("SELECT COUNT(*) n FROM private_fts").get().n === 0, JSON.stringify(row));
    check("nor the links it makes", d1.prepare("SELECT COUNT(*) n FROM link WHERE src IN ('secret-plan', 'health-file')").get().n === 0 && d1.prepare("SELECT COUNT(*) n FROM link WHERE src = 'novel-project'").get().n === 1, JSON.stringify(d1.prepare("SELECT * FROM link").all()));
    const head = JSON.parse(readFileSync(join(bucket, "matrix.json"), "utf8"));
    check("nor its vector", !head.slugs.includes("secret-plan") && !head.slugs.includes("health-file") && head.slugs.includes("work-moves") && readFileSync(join(bucket, "matrix.f32")).byteLength === head.slugs.length * head.dims * 4, JSON.stringify(head.slugs));
    const everything = JSON.stringify(d1.prepare("SELECT * FROM private_note").all()) + JSON.stringify(d1.prepare("SELECT * FROM fts").all());
    check("and nothing of its text is anywhere in the copy", !everything.includes("Elm street") && !everything.includes("blood") && !everything.includes("mail://thread/42"), everything.slice(0, 300));
    const o2 = { w: await freshWorker("shut"), e: workerEnv(secrets().TOKENS) };
    check("it is still found by its title", (await tool(readerValue, "brain_search", { query: "secret plan", words: true }, o2)).some((x) => x.slug === "secret-plan"));
  }

  // LIMITS (2026-11-27): one request cannot make the Worker work without end.
  {
    const o = { w: await freshWorker("limits"), e: workerEnv(secrets().TOKENS) };
    const many = Array.from({ length: 21 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "ping" }));
    check("a batch of more than 20 messages is refused", (await post(trustedValue, many, o)).status === 400 && (await post(trustedValue, many.slice(0, 20), o)).body.length === 20);
    const big = await post(trustedValue, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "brain_search", arguments: { query: "x".repeat(300 * 1024) } } }, o);
    check("a body over 256 KB is refused", big.status === 413, JSON.stringify(big));
    const searches = Array.from({ length: 8 }, (_, i) => ({ jsonrpc: "2.0", id: i + 1, method: "tools/call", params: { name: "brain_search", arguments: { query: `work ${i}`, meaning: true } } }));
    const answers = (await post(trustedValue, searches, o)).body;
    check("one request gets five calls to the embeddings service, no more", answers.length === 8 && answers.filter((x) => x.result.isError).length === 3 && answers.filter((x) => !x.result.isError).length === 5, JSON.stringify(answers).slice(0, 400));
    check("a list that is not a message is an error, not a crash", (await post(trustedValue, [null, 3], o)).status === 200);
    const elsewhere = workerEnv(secrets().TOKENS, { EMBEDDINGS: JSON.stringify({ key: "k", base: "http://vectors.example/v1" }) });
    const refused = (await ask(trustedValue, "tools/call", { name: "brain_search", arguments: { query: "work", meaning: true } }, 1, { ...o, e: elsewhere })).body.result;
    check("the Worker itself sends no key to an address that is not https", refused.isError === true && (await tool(trustedValue, "brain_stats", {}, { ...o, e: elsewhere })).searchByMeaning === false, JSON.stringify(refused));
  }

  // THE DOOR FOLLOWS THE BRAIN: the list of tokens goes again with each sync.
  {
    const sf = join(FAKE, "secrets-brain-sam.json");
    const all = JSON.parse(readFileSync(sf, "utf8"));
    all.TOKENS = JSON.stringify([...JSON.parse(all.TOKENS), { name: "ghost", hash: "00", private: true, addresses: true, skills: true }]);
    writeFileSync(sf, JSON.stringify(all), "utf8");
    const again = run("cloud.mjs", ["sync"]);
    check("a sync sends the brain's list of tokens again: a token the brain does not have is gone", again.ok && json(again.out).tokens === true && !secrets().TOKENS.includes("ghost") && JSON.parse(secrets().TOKENS).length === 2, again.out);
  }

  // THE SERVER IS A COPY OF THE PLUGIN'S CODE: an update of the plugin does
  // not reach it by itself, and a sync says when it is behind (2026-11-27).
  {
    const state = () => json(run("cloud.mjs", ["state"]).out);
    const st = state();
    check("the state of the copy is read from this computer: deployed, in step, what was chosen, who has a key", st.set === true && st.deployed === true && st.serverBehind === false && st.skills === true && st.includePrivate === false && st.tokens.length === 2 && !JSON.stringify(st).includes('"hash"'), JSON.stringify(st));
    const bj = join(BRAIN, "brain.json");
    const c = JSON.parse(readFileSync(bj, "utf8"));
    c.cloud.workerPrint = "of-an-earlier-version";
    writeFileSync(bj, JSON.stringify(c, null, 2), "utf8");
    const behind = json(run("cloud.mjs", ["sync"]).out);
    check("a server deployed by an earlier version of the plugin is said to be behind, with what to run", behind.ok === true && behind.serverBehind === true && /cloud\.mjs deploy/.test(behind.warning) && state().serverBehind === true, JSON.stringify(behind));
    run("cloud.mjs", ["deploy"]);
    const inStep = json(run("cloud.mjs", ["sync"]).out);
    check("deploying again brings it in step", inStep.ok === true && inStep.serverBehind === undefined && state().serverBehind === false && JSON.parse(secrets().TOKENS).length === 2, JSON.stringify(inStep));
  }

  // Revoking.
  {
    // A REVOCATION THAT DOES NOT REACH THE SERVER IS NOT ONE (2026-11-27).
    rmSync(join(FAKE, "faults"), { force: true });
    const failed = run("cloud.mjs", ["token", "revoke", "reader"], "", { FAKE_CF_FAIL: "secret put:1" });
    const f = json(failed.out);
    const still = workerEnv(secrets().TOKENS);
    check("a revocation the server did not receive answers ok: false, and says the key still opens", !failed.ok && f.ok === false && /NOT revoked/.test(f.error) && Array.isArray(f.next) && (await ask(readerValue, "tools/list", {}, 1, { e: still })).status === 200, failed.out);
    check("and the brain's list is untouched, so that it can be tried again", readFileSync(join(BRAIN, "cloud", "tokens.json"), "utf8").includes('"reader"') && existsSync(tokenFile));
    rmSync(join(FAKE, "faults"), { force: true });
    check("revoking a token that does not exist is an error", !run("cloud.mjs", ["token", "revoke", "nobody"]).ok);
  }
  r = run("cloud.mjs", ["token", "revoke", "reader"]);
  const after = workerEnv(secrets().TOKENS);
  check("a revoked token no longer enters", r.ok && json(r.out).ok === true && !readFileSync(join(BRAIN, "cloud", "tokens.json"), "utf8").includes('"reader"') && (await worker.fetch(new Request("https://x/mcp", { method: "POST", headers: { Authorization: `Bearer ${readerValue}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), after)).status === 401, r.out);
  check("and the file that held its value is removed", json(r.out).fileRemoved === true && !existsSync(tokenFile), r.out);

  // EVERY `limit` HAS A CEILING: a copy filled by hand with more rows than any ceiling.
  {
    const note = d1.prepare("INSERT INTO note (slug, hash, type, title, domains, status, visibility, created, updated, source, body) VALUES (?, 'h', 'note', ?, '[\"work\"]', 'seed', 'public', '2020-01-01', '2020-01-01', '', 'a zebra crossing')");
    const fts = d1.prepare("INSERT INTO fts (slug, title, body) VALUES (?, ?, 'a zebra crossing')");
    const contact = d1.prepare("INSERT INTO contact (address, hash, data) VALUES (?, 'h', ?)");
    d1.exec("BEGIN");
    for (let i = 0; i < 250; i++) {
      note.run(`bulk-${i}`, `Bulk ${i}`);
      fts.run(`bulk-${i}`, `Bulk ${i}`);
      if (i < 120) contact.run(`zed${i}@bulk.example`, JSON.stringify({ address: `zed${i}@bulk.example`, name: `Zed Person ${i}`, domain: "bulk.example", sent: i, received: 1 }));
    }
    d1.exec("COMMIT");
    const head = JSON.parse(readFileSync(join(bucket, "matrix.json"), "utf8"));
    const slugs = Array.from({ length: 40 }, (_, i) => `bulk-${i}`);
    const all = new Float32Array(slugs.length * head.dims);
    for (let i = 0; i < all.length; i++) all[i] = ((i * 7919) % 13) + 1;
    writeFileSync(join(bucket, "matrix.f32"), Buffer.from(all.buffer));
    writeFileSync(join(bucket, "matrix.json"), JSON.stringify({ model: head.model, dims: head.dims, slugs, norms: slugs.map(() => 1), md5: "bulk" }));
    const o = { w: await freshWorker("ceilings"), e: workerEnv(secrets().TOKENS) };
    const sizes = {
      search: (await tool(trustedValue, "brain_search", { query: "zebra", words: true, limit: 9999 }, o)).length,
      neighbors: (await tool(trustedValue, "brain_neighbors", { slug: "bulk-0", limit: 9999 }, o)).similar.length,
      timeline: (await tool(trustedValue, "brain_timeline", { limit: 9999 }, o)).length,
      contact: (await tool(trustedValue, "brain_contact", { query: "zed", limit: 9999 }, o)).found.length,
    };
    check("every limit has its ceiling (search 50, neighbours 30, timeline 200, contacts 100)", JSON.stringify(sizes) === JSON.stringify({ search: 50, neighbors: 30, timeline: 200, contact: 100 }), JSON.stringify(sizes));
    const odd = { timeline: (await tool(trustedValue, "brain_timeline", { limit: -5, type: "note" }, o)).length, contact: (await tool(trustedValue, "brain_contact", { query: "zed", limit: "many" }, o)).found.length };
    check("a limit that is not a number falls back on the default", odd.timeline === 30 && odd.contact === 15, JSON.stringify(odd));
  }

  // EMPTY, then RESUME: a copy nobody reads holds nothing, and its door stays.
  {
    const emptied = run("cloud.mjs", ["empty"]);
    const e = json(emptied.out);
    check("an emptied copy holds no row and no vector, and no evening sync fills it again", emptied.ok && e.rowsLeft === 0 && e.vectorsRemoved.length === 2 && !existsSync(join(bucket, "matrix.f32")) && !run("cloud.mjs", ["sync"]).ok, emptied.out);
    run("cloud.mjs", ["resume"]);
    const back = run("cloud.mjs", ["sync", "--all"]);
    check("resumed, everything goes again", back.ok && json(back.out).notes === 5 && d1.prepare("SELECT COUNT(*) n FROM skill").get().n === 1, back.out);
  }
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
