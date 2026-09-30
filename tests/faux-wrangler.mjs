// faux-wrangler.mjs - A fake `wrangler` for the cloud bench: D1 is a real
// SQLite file, R2 a folder, secrets and deployments are files. Nothing goes
// to Cloudflare. It records the jurisdiction asked at each creation and each
// upload: the bench checks that everything is asked in the EU.
//
// State in FAKE_CF_DIR. Only what cloud.mjs uses is understood.

import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.FAKE_CF_DIR;
mkdirSync(DIR, { recursive: true });
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const logFile = join(DIR, "calls.jsonl");
const note = (o) => writeFileSync(logFile, `${JSON.stringify(o)}\n`, { flag: "a" });
const tomlName = () => /name\s*=\s*"([^"]+)"/.exec(readFileSync(join(process.cwd(), "wrangler.toml"), "utf8"))?.[1];
const [a0, a1, a2] = args;

if (a0 === "d1" && a1 === "create") {
  note({ call: "d1 create", name: a2, jurisdiction: opt("--jurisdiction") ?? null });
  console.log(`✅ Successfully created DB '${a2}'\n\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "${a2}"\ndatabase_id = "0f0f0f0f-1111-2222-3333-444455556666"`);
} else if (a0 === "r2" && a1 === "bucket" && a2 === "create") {
  note({ call: "r2 bucket create", name: args[3], jurisdiction: opt("--jurisdiction") ?? null });
  mkdirSync(join(DIR, `r2-${args[3]}`), { recursive: true });
  console.log(`Created bucket '${args[3]}'`);
} else if (a0 === "d1" && a1 === "execute") {
  if (!args.includes("--remote")) {
    console.error("fake: only --remote is used by the plugin");
    process.exit(1);
  }
  const db = new DatabaseSync(join(DIR, `d1-${a2}.sqlite`));
  // Like the real one: a command answers with its rows, an import from a file
  // only with statistics (and a warning on stderr), even for a SELECT.
  const fromFile = args.includes("--file");
  const sql = fromFile ? readFileSync(opt("--file"), "utf8") : opt("--command");
  try {
    if (!fromFile && /^\s*select/i.test(sql)) {
      console.log(JSON.stringify([{ results: db.prepare(sql.trim().replace(/;\s*$/, "")).all(), success: true }]));
    } else {
      db.exec(sql);
      if (fromFile) console.error("▲ [WARNING] This process may take some time, during which your D1 database will be unavailable to serve queries.");
      console.log(args.includes("--json") ? JSON.stringify([{ results: [{ "Total queries executed": 1 }], success: true }]) : "executed");
    }
  } catch (e) {
    console.error(`✘ [ERROR] ${e.message}`);
    process.exit(1);
  }
  note({ call: "d1 execute", db: a2, bytes: sql.length });
} else if (a0 === "r2" && a1 === "object" && a2 === "put") {
  const [bucket, ...key] = args[3].split("/");
  note({ call: "r2 object put", bucket, key: key.join("/"), jurisdiction: opt("--jurisdiction") ?? null, remote: args.includes("--remote") });
  mkdirSync(join(DIR, `r2-${bucket}`), { recursive: true });
  copyFileSync(opt("--file"), join(DIR, `r2-${bucket}`, key.join("/")));
  console.log("Upload complete.");
} else if (a0 === "secret" && a1 === "put") {
  const value = readFileSync(0, "utf8");
  const f = join(DIR, `secrets-${tomlName()}.json`);
  const all = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  all[a2] = value;
  writeFileSync(f, JSON.stringify(all), "utf8");
  note({ call: "secret put", name: a2 });
  console.log(`✨ Success! Uploaded secret ${a2}`);
} else if (a0 === "deploy") {
  const toml = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");
  note({ call: "deploy", name: tomlName(), r2Jurisdiction: /jurisdiction\s*=\s*"eu"/.test(toml) });
  writeFileSync(join(DIR, `deployed-${tomlName()}.toml`), toml, "utf8");
  console.log(`Uploaded ${tomlName()}\nDeployed ${tomlName()} triggers\n  https://${tomlName()}.fake-account.workers.dev`);
} else {
  console.error(`fake wrangler: not understood: ${args.join(" ")}`);
  process.exit(1);
}
