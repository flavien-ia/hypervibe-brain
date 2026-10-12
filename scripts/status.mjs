#!/usr/bin/env node
// status.mjs - Where this brain stands, for the person and for the skill that
// guides its construction (/brain:create reads it to resume at the right
// stage). Reads only; changes nothing.
//
//   node scripts/status.mjs [--json]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DB_PATH, EMB_DIR, HOME, ROOT, config, loadEnv, readVault, requireBrain, validate } from "./lib.mjs";

requireBrain();
import { embeddingsAvailable } from "./embeddings.mjs";
import { hasRemote, isRepo, tryGit } from "./git.mjs";

loadEnv();
const cfg = config();
const { fiches, errors: parseErrors } = readVault();
const { errors, warnings } = validate(fiches, cfg);
const byStatus = {};
const byDomain = Object.fromEntries(cfg.domains.map((d) => [d, 0]));
for (const f of fiches) {
  byStatus[f.fm.status] = (byStatus[f.fm.status] ?? 0) + 1;
  for (const d of [].concat(f.fm.domains)) byDomain[d] = (byDomain[d] ?? 0) + 1;
}
const reviews = existsSync(join(ROOT, "reviews")) ? readdirSync(join(ROOT, "reviews")).filter((n) => /^\d{4}-\d{2}-\d{2}\.md$/.test(n)).sort() : [];
// The last alert of an evening save on this computer, if it is less than a week old.
let lastAlert = null;
try {
  const a = JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "alert.json"), "utf8"));
  if (Date.now() - Date.parse(a.date) < 7 * 86400_000) lastAlert = a;
} catch {
  // no alert
}
const sources = existsSync(join(ROOT, "SOURCES.md")) ? readFileSync(join(ROOT, "SOURCES.md"), "utf8") : "";
const s = {
  name: cfg.name,
  dir: ROOT.replace(/\\/g, "/"),
  domains: cfg.domains,
  stage: cfg.stage ?? null,
  lang: cfg.lang ?? null,
  sources: cfg.sources ?? {},
  components: cfg.components ?? {},
  notes: fiches.length,
  byStatus,
  byDomain,
  errors: errors.length + parseErrors.length,
  warnings: warnings.length,
  indexBuilt: existsSync(DB_PATH),
  searchByMeaning: embeddingsAvailable(),
  vectorFiles: existsSync(EMB_DIR) ? readdirSync(EMB_DIR).filter((n) => n.endsWith(".json")).length : 0,
  git: isRepo(),
  remote: isRepo() && hasRemote(),
  autoPush: cfg.autoPush === true,
  lastCommit: isRepo() ? tryGit(["log", "-1", "--format=%cs %s"]).out || null : null,
  uncommitted: isRepo() ? tryGit(["status", "--porcelain"]).out.split("\n").filter(Boolean).length : null,
  sourcesDone: (sources.match(/^\s*- \[x\]/gim) ?? []).length,
  sourcesPlanned: (sources.match(/^\s*- \[[ x]\]/gim) ?? []).length,
  lastReview: reviews.at(-1)?.slice(0, 10) ?? null,
  lastAlert,
};

if (process.argv.includes("--json")) console.log(JSON.stringify(s, null, 2));
else {
  console.log(`\n${s.name}: ${s.notes} note(s) ${JSON.stringify(s.byStatus)}, stage ${s.stage ?? "?"}`);
  console.log(`  domains: ${Object.entries(s.byDomain).map(([d, n]) => `${d} ${n}`).join(", ")}`);
  console.log(`  ${s.errors} error(s), ${s.warnings} warning(s); index ${s.indexBuilt ? "built" : "NOT built"}; search by meaning ${s.searchByMeaning ? `on (${s.vectorFiles} vectors)` : "off"}`);
  console.log(`  git: ${s.git ? `yes, ${s.remote ? "backed up online" : "local only"}${s.autoPush ? ", automatic push" : ""}; last commit ${s.lastCommit}; ${s.uncommitted} file(s) not committed` : "no"}`);
  console.log(`  sources: ${s.sourcesDone}/${s.sourcesPlanned} ingested; last review: ${s.lastReview ?? "never"}`);
  if (s.lastAlert) console.log(`  ALERT of ${s.lastAlert.date.slice(0, 10)}: ${s.lastAlert.problems.join(" ; ")}`);
  console.log("");
}
