#!/usr/bin/env node
// status.mjs - Where this brain stands, for the person and for the skill that
// guides its construction (/brain:create reads it to resume at the right
// stage). Reads only; changes nothing.
//
//   node scripts/status.mjs [--json]

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DB_PATH, EMB_DIR, HOME, ROOT, config, loadEnv, readVault, requireBrain, validate, writableByOthers } from "./lib.mjs";

requireBrain();
import { embeddingsAvailable } from "./embeddings.mjs";
import { hasRemote, repoState, tryGit } from "./git.mjs";
import { judgeHealth, liveSources, waiting } from "./judge.mjs";
import { readQueue } from "./vault-queue.mjs";
import { startState } from "./start.mjs";
import { pending } from "./trust.mjs";

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
// The last evening save on this computer, from its logs: the weekly review
// runs one first when it is more than a day old.
let lastSave = null;
try {
  const logs = join(HOME, ".hypervibe-brain", "logs");
  for (const f of readdirSync(logs).filter((n) => /^nightly-\d{4}-\d{2}-\d{2}\.log$/.test(n)).sort().reverse()) {
    const l = readFileSync(join(logs, f), "utf8").split("\n").filter((x) => x.includes("save.mjs exit")).at(-1);
    if (l) {
      lastSave = l.slice(0, 24);
      break;
    }
  }
} catch {
  // no routine yet
}
const sources = existsSync(join(ROOT, "SOURCES.md")) ? readFileSync(join(ROOT, "SOURCES.md"), "utf8") : "";
// THE JUDGES THAT FAIL (2026-11-17): said first, with the class of their error
// (judge-errors.mjs), since the alert mail may never have left. "down" from
// the second failure in a row; one failure alone is often a passing trouble.
const judges = liveSources()
  .map((j) => ({ name: j.name, waiting: waiting(j.name), ...judgeHealth(j.name) }))
  .filter((j) => j.failures > 0)
  .map(({ lastRun: _run, ...j }) => j);
// An alert about a judge that has worked since is a thing of the past: still
// shown for its week, and said as over.
if (lastAlert?.judge && !judges.some((j) => j.name === lastAlert.judge) && (judgeHealth(lastAlert.judge).lastSuccess ?? "") > lastAlert.date) lastAlert.resolved = true;
// THE SOURCES THAT WAIT FOR THE VAULT (2026-11-21, vault-queue.mjs). A source
// that takes a key in a closed vault is not a failure: it waits in the queue,
// and runs once the vault is open. Said here, for /brain:status to say it,
// since nothing else (no error, no alert) does. A name the queue still holds
// for a source that is gone or disabled is not one: the hub takes it out.
const waitingForVault = [];
const waitingForVaultSince = {};
for (const [n, q] of Object.entries(readQueue() ?? {})) {
  let d = null;
  try {
    d = JSON.parse(readFileSync(join(ROOT, "sources", n, "source.json"), "utf8"));
  } catch {
    d = null;
  }
  if (!d || d.enabled === false) continue;
  waitingForVault.push(n);
  if (typeof q?.at === "string") waitingForVaultSince[n] = q.at;
}
waitingForVault.sort();
// Where the start stands (start.mjs): nothing when it is finished.
let start = null;
try {
  const st = startState();
  if (st.phase !== "done") start = { phase: st.phase, part: st.part ?? null, next: st.next, todo: st.steps.filter((x) => x.state === "todo").map((x) => x.id), blocks: Object.fromEntries(st.session.blocks.map((b) => [b.id, b.state])), ...(st.session.resting ? { resting: true } : {}) };
} catch {
  start = null;
}
// WHAT WAITS FOR THE PERSON'S APPROVAL ON THIS COMPUTER (2026-11-27,
// trust.mjs): a guard, a skill, a program, a judge, a data source or a watched
// folder that arrived with the brain or changed since they approved it. It
// does not run meanwhile: said first, with how to approve.
let approvals = null;
try {
  const p = await pending();
  if (p.count) approvals = { count: p.count, guards: p.guards.map((g) => ({ file: g.file, why: g.why })), skills: p.skills.map((s) => ({ name: s.folder, why: s.why })), sources: p.sources.map((s) => ({ name: s.name, kind: s.kind, why: s.why })), data: p.data.map((d) => ({ scheme: d.scheme, why: d.why })), watch: p.watch, how: p.how };
} catch {
  approvals = null;
}
// WHO ELSE MAY WRITE IN THE BRAIN'S FOLDER (2026-11-27, lib.mjs): another
// account of the computer that may write there may change what runs for the
// person and what their AI reads as theirs.
const openTo = writableByOthers(ROOT);
// Asked once: each question runs git.
const repoInfo = repoState();
const repo = repoInfo.state === "yes";
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
  git: repo,
  // Git that FAILED is not "no repository" (git.mjs repoState, 2026-11-21):
  // a brain kept in git whose git cannot run (not found, a broken folder) was
  // said not to be in git at all. The reason is given as git said it.
  ...(repoInfo.state === "failed" ? { gitError: repoInfo.error } : {}),
  remote: repo && hasRemote(),
  autoPush: cfg.autoPush === true,
  lastCommit: repo ? tryGit(["log", "-1", "--format=%cs %s"]).out || null : null,
  uncommitted: repo ? tryGit(["status", "--porcelain"]).out.split("\n").filter(Boolean).length : null,
  sourcesDone: (sources.match(/^\s*- \[x\]/gim) ?? []).length,
  sourcesPlanned: (sources.match(/^\s*- \[[ x]\]/gim) ?? []).length,
  lastReview: reviews.at(-1)?.slice(0, 10) ?? null,
  lastAlert,
  lastSave,
  judgesFailing: judges,
  ...(approvals ? { approvals } : {}),
  ...(openTo ? { folderWritableBy: openTo } : {}),
  waitingForVault,
  ...(waitingForVault.length ? { waitingForVaultSince } : {}),
  start,
};

if (process.argv.includes("--json")) console.log(JSON.stringify(s, null, 2));
else {
  console.log("");
  // What needs the person comes first.
  if (s.lastAlert) console.log(`  ALERT of ${s.lastAlert.date.slice(0, 10)}: ${s.lastAlert.problems.join(" ; ")}`);
  for (const j of s.judgesFailing) console.log(`  JUDGE ${j.down ? "DOWN" : "failing"}: ${j.name}, ${j.failures} run(s) failed in a row since ${String(j.failingSince ?? "?").slice(0, 16)} (${j.cause}), ${j.waiting} item(s) waiting: ${j.lastError}`);
  if (s.approvals) console.log(`  WAITING FOR YOUR APPROVAL on this computer (not running meanwhile): ${[...s.approvals.guards.map((g) => `guard ${g.file}`), ...s.approvals.skills.map((k) => `skill ${k.name}`), ...s.approvals.sources.map((x) => `${x.kind} ${x.name}`), ...s.approvals.data.map((d) => `data ${d.scheme}://`), ...s.approvals.watch.map((w) => `folder ${w}`)].join(", ")}. In a terminal of yours: ${s.approvals.how?.byHand ?? "trust.mjs guide"}`);
  if (s.folderWritableBy) console.log(`  WARNING: the brain's folder can be changed by ${s.folderWritableBy}, not by you alone`);
  if (s.waitingForVault.length) console.log(`  waiting for the Hypervibe vault to be opened (not a failure): ${s.waitingForVault.join(", ")}`);
  console.log(`${s.name}: ${s.notes} note(s) ${JSON.stringify(s.byStatus)}, stage ${s.stage ?? "?"}`);
  console.log(`  domains: ${Object.entries(s.byDomain).map(([d, n]) => `${d} ${n}`).join(", ")}`);
  console.log(`  ${s.errors} error(s), ${s.warnings} warning(s); index ${s.indexBuilt ? "built" : "NOT built"}; search by meaning ${s.searchByMeaning ? `on (${s.vectorFiles} vectors)` : "off"}`);
  console.log(`  git: ${s.git ? `yes, ${s.remote ? "backed up online" : "local only"}${s.autoPush ? ", automatic push" : ""}; last commit ${s.lastCommit}; ${s.uncommitted} file(s) not committed` : s.gitError ? `FAILED: ${s.gitError}` : "no"}`);
  console.log(`  sources: ${s.sourcesDone}/${s.sourcesPlanned} ingested; last review: ${s.lastReview ?? "never"}`);
  if (s.start) console.log(`  start: ${s.start.part ? `part ${s.start.part}` : `phase ${s.start.phase}`}, next: ${s.start.next}${s.start.resting ? " (kept for later)" : ""}`);
  console.log("");
}
