// judges.mjs: the judges of a brain: what they cost, where each one stands
// today (its cap, a pile it holds until the person answers), and the two
// things the person tells them through the plugin (what never to read, what
// to do with a pile that grew too big).
//
// A judge is a live source read by an AI (source.json: kind "claude", live).
// Each of its runs is one line of the brain's journal, with the tokens Claude
// counted: { act: "run", who: "source:<name>", ok, judged, minutes, model,
// turns, tokens: { in, out, cacheRead, cacheWrite }, apiUsd }. What it writes
// in the brain is signed "ai:<name>".
//
// The plugin's side of the contract (2026-11-17):
//   - source.json: "dailyTokens" (a cap per local day, absent or 0 for none),
//     "exclude" (the patterns never read);
//   - ~/.hypervibe-brain/judge/<name>.hold ({ at, items, estimate }) exists
//     while a judge waits for the person;
//   - sources.mjs exclude <judge> add|remove "<pattern>" and
//     judge.mjs catch-up <name> all | latest <n> | drop answer one JSON line.

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { eventsSince, hubDir, journalReader, readJsonOnce } from "./journal.mjs";

/** @typedef {import("./contract.d.ts").JudgeRun} JudgeRun */
/** @typedef {import("./contract.d.ts").JudgeState} JudgeState */
/** @typedef {import("./contract.d.ts").JudgeCode} JudgeCode */
/** @typedef {import("./contract.d.ts").ExcludeResponse} ExcludeResponse */
/** @typedef {import("./contract.d.ts").CatchUpResponse} CatchUpResponse */
/** @typedef {import("./contract.d.ts").CatchUpAnswer} CatchUpAnswer */
/** @typedef {import("./journal.mjs").JournalEvent} JournalEvent */
/** @typedef {{ ok: false, code: JudgeCode, error: string, said?: Record<string, any> }} Refusal `said`: the plugin's whole answer, when it refused in its own words (a batch says what it did before what it refused) */

// The runs of the judges and their own writes, kept for as long as the
// journal goes back (a run is one short line): "since the journal began" then
// means the same on the usage page for the reads and for the judges.
const readJudgeEvents = journalReader(() => (e) => {
  const who = String(e.who ?? "");
  if (e.act === "run") return who.startsWith("source:") && (e.tokens !== undefined || e.judged !== undefined);
  return e.act === "write" && who.startsWith("ai:") && e.what !== "undone";
});

/**
 * The judges a brain declares, with their declaration.
 * @param {string} brain
 * @returns {{ name: string, def: Record<string, any> }[]}
 */
export function declaredJudges(brain) {
  const folder = join(brain, "sources");
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .map((name) => ({ name, def: readJsonOnce(join(folder, name, "source.json"), null) }))
    .filter((x) => x.def && x.def.kind === "claude" && x.def.live === true && x.def.enabled !== false);
}

/**
 * A cap as a source.json may carry it: a whole number of tokens, 0 for none.
 * @param {unknown} value
 * @returns {number}
 */
export const capOf = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

/**
 * Every run of every judge, oldest first, each with the writes it made.
 * @param {string} brain
 * @returns {Map<string, JudgeRun[]>} judge -> its runs
 */
export function judgeRuns(brain) {
  // READ ONCE FOR THE QUESTIONS OF THE SAME MOMENT (2026-11-18). The whole
  // journal is read to know what the judges did; the page asks three things at
  // once that need it, and the next runs asked it again for each judge: 1.8
  // second during which the server answered nothing else, every thirty
  // seconds, on a real brain. What was read less than five seconds ago is good.
  if (lastRuns && lastRuns.brain === brain && Date.now() - lastRuns.at < 5000) return lastRuns.runs;
  const runs = readJudgeRuns(brain);
  lastRuns = { brain, at: Date.now(), runs };
  return runs;
}
/** @type {{ brain: string, at: number, runs: Map<string, JudgeRun[]> } | null} */
let lastRuns = null;

/** @param {string} brain @returns {Map<string, JudgeRun[]>} */
function readJudgeRuns(brain) {
  /** @type {Map<string, JudgeRun[]>} */
  const runs = new Map();
  /** @type {Map<string, number>} judge -> its writes since its last run ended */
  const written = new Map();
  for (const e of eventsSince(brain, "", readJudgeEvents)) {
    const who = String(e.who);
    // A judge only writes while it runs, and the journal notes a run when it
    // ends: the writes met since the run before belong to this one.
    if (e.act === "write") {
      written.set(who.slice(3), (written.get(who.slice(3)) ?? 0) + 1);
      continue;
    }
    const name = who.slice(7);
    const tokens = e.tokens && typeof e.tokens === "object" ? e.tokens : null;
    /** @param {unknown} n */
    const count = (n) => Number(n) || 0;
    let list = runs.get(name);
    if (!list) runs.set(name, (list = []));
    list.push({
      at: String(e.at),
      ok: e.ok !== false,
      judged: count(e.judged),
      minutes: count(e.minutes),
      model: String(e.model ?? ""),
      turns: Number.isFinite(e.turns) ? e.turns : null,
      counted: tokens !== null,
      fresh: tokens ? count(tokens.in) + count(tokens.out) + count(tokens.cacheWrite) : 0,
      reread: tokens ? count(tokens.cacheRead) : 0,
      apiUsd: Number.isFinite(e.apiUsd) ? e.apiUsd : null,
      writes: written.get(name) ?? 0,
    });
    written.delete(name);
  }
  return runs;
}

/**
 * Where a judge stands today: what it spent against its cap, and whether it
 * holds its pile until the person answers.
 * @param {string} brain
 * @param {string} name
 * @param {Record<string, any> | null} def its source.json (null for a judge that is no longer declared)
 * @param {JudgeRun[]} [runs] its runs, when the caller already has them
 * @returns {JudgeState}
 */
export function judgeState(brain, name, def, runs = judgeRuns(brain).get(name) ?? []) {
  // What counts against the cap, as the plugin counts it: everything the runs
  // of the local day used, re-read tokens included.
  const midnight = new Date().setHours(0, 0, 0, 0);
  let spentToday = 0;
  for (let i = runs.length - 1; i >= 0 && Date.parse(runs[i].at) >= midnight; i--) spentToday += runs[i].fresh + runs[i].reread;
  const dailyTokens = capOf(def?.dailyTokens);
  const waiting = readJsonOnce(join(hubDir(), "judge", `${name}.json`), { items: [] })?.items?.length ?? 0;
  const holdFile = join(hubDir(), "judge", `${name}.hold`);
  /** @type {JudgeState["held"]} */
  let held = null;
  if (existsSync(holdFile)) {
    // (A hold file that cannot be read still holds: the pile says how many.)
    const hold = readJsonOnce(holdFile, {}) ?? {};
    held = { at: String(hold.at ?? ""), items: Number(hold.items) || waiting, estimate: Number(hold.estimate) || 0 };
  }
  return { dailyTokens, spentToday, capped: dailyTokens > 0 && spentToday >= dailyTokens, held, waiting };
}

/**
 * The judges and what they cost: those the brain declares, then those the
 * journal still remembers (a judge removed since has cost something too).
 * @param {string} brain
 * @param {string} [since] an ISO date: only the runs from then on
 * @returns {(JudgeState & { name: string, paused: boolean, model: string, removed?: true, runs: JudgeRun[] })[]}
 */
export function judgeCosts(brain, since = "") {
  const runs = judgeRuns(brain);
  const declared = declaredJudges(brain);
  const names = new Set(declared.map((x) => x.name));
  /** @param {string} name */
  const from = (name) => (runs.get(name) ?? []).filter((r) => r.at >= since);
  return [
    ...declared.map(({ name, def }) => ({ name, paused: def.paused === true, model: String(def.model ?? ""), ...judgeState(brain, name, def, runs.get(name) ?? []), runs: from(name) })),
    ...[...runs.keys()].filter((name) => !names.has(name)).map((name) => ({ name, paused: false, model: "", ...judgeState(brain, name, null, runs.get(name) ?? []), removed: /** @type {const} */ (true), runs: from(name) })),
  ];
}

// ------------------------------------------------------------ through the plugin

/** @type {Promise<unknown>} the command before this one: two never run together (a double click, two windows) */
let last = Promise.resolve();

/**
 * Runs one command of the plugin and reads the JSON line it answers with.
 *
 * A plugin of before these commands does not refuse them, it does not know
 * them: sources.mjs prints its usage, judge.mjs answers its state. Neither
 * says `ok`, and that is told apart ("not-available") from a script that
 * failed or took too long ("no-answer").
 * @param {string} plugin the plugin's folder
 * @param {string} brain
 * @param {string} script a file of the plugin's scripts/
 * @param {string[]} args
 * @param {Record<string, string>} [env] what the script is told beside the brain (who asks, for a click of the person)
 * @returns {Promise<{ ok: true, said: Record<string, any> } | Refusal>}
 */
export function askPlugin(plugin, brain, script, args, env = {}) {
  const mine = last.then(
    () =>
      new Promise((done) => {
        const file = join(plugin, "scripts", script);
        /** @param {JudgeCode} code @param {string} error */
        const refuse = (code, error) => done({ ok: false, code, error });
        if (!existsSync(file)) return refuse("not-available", `the plugin has no ${script}`);
        let child;
        try {
          child = spawn(process.execPath, [file, ...args], { cwd: brain, windowsHide: true, timeout: 30_000, env: { ...process.env, HVBRAIN_DIR: brain, ...env } });
        } catch {
          return refuse("no-answer", "the plugin could not be started");
        }
        let out = "";
        let err = "";
        child.stdout.on("data", (b) => (out += b));
        child.stderr.on("data", (b) => (err += b));
        child.on("error", () => refuse("no-answer", "the plugin could not be started"));
        child.on("close", (status) => {
          const line = out.trim().split("\n").pop() ?? "";
          /** @type {Record<string, any> | null} what it answered, when that is a JSON object */
          let said = null;
          try {
            const parsed = JSON.parse(line);
            if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) said = parsed;
          } catch {
            said = null;
          }
          if (said?.ok === true) return done({ ok: true, said });
          if (said?.ok === false) return done({ ok: false, code: "refused", error: String(said.error ?? "").slice(0, 300), said });
          if (said || /^usage:/i.test(line) || status === 2) return refuse("not-available", `the plugin does not know "${script.replace(/\.mjs$/, "")} ${args[0]}" yet`);
          // (What it said instead stays in the server's log: it may carry a path of the machine.)
          if (err.trim()) console.error(`${script} ${args[0]}: ${err.trim().slice(0, 400)}`);
          refuse("no-answer", "the plugin did not answer");
        });
      }),
  );
  last = mine.catch(() => {});
  return /** @type {Promise<{ ok: true, said: Record<string, any> } | Refusal>} */ (mine);
}

/**
 * The judge a request names, or why it is refused before anything is started.
 * (The name becomes an argument of the plugin's script: only one the brain declares.)
 * @param {string} brain
 * @param {string} name
 * @returns {{ name: string, def: Record<string, any> } | null}
 */
const judgeNamed = (brain, name) => declaredJudges(brain).find((x) => x.name === name) ?? null;

/** @type {Refusal} */
const UNKNOWN_JUDGE = { ok: false, code: "unknown-judge", error: "no such judge in this brain" };

/**
 * Adds or removes one pattern of what a judge never reads (the plugin's
 * `sources.mjs exclude <judge> add|remove "<pattern>"`).
 * @param {string} plugin
 * @param {string} brain
 * @param {string} name the judge
 * @param {"add" | "remove"} action
 * @param {string} pattern a folder or file name (`*` allowed), or with a slash the start of a path or of an address
 * @returns {Promise<ExcludeResponse>}
 */
export async function exclude(plugin, brain, name, action, pattern) {
  if (!judgeNamed(brain, name)) return UNKNOWN_JUDGE;
  const text = pattern.trim();
  // One line of a human size, nothing a file name cannot carry.
  if (!text || text.length > 300 || /[\x00-\x1f]/.test(text)) return { ok: false, code: "invalid", error: "a pattern is one short line" };
  const answer = await askPlugin(plugin, brain, "sources.mjs", ["exclude", name, action, text]);
  if (!answer.ok) return { ok: false, code: answer.code, error: answer.error };
  const list = Array.isArray(answer.said.exclude) ? answer.said.exclude.map(String) : readJsonOnce(join(brain, "sources", name, "source.json"), {})?.exclude ?? [];
  return { ok: true, exclude: list, removed: Number(answer.said.removed) || 0 };
}

/**
 * The person's answer to a judge that holds its pile (the plugin's
 * `judge.mjs catch-up <name> all | latest <n> | drop`).
 * @param {string} plugin
 * @param {string} brain
 * @param {string} name the judge
 * @param {string} answer "all", "latest" or "drop"
 * @param {number} n with "latest": how many of the most recent items are read
 * @returns {Promise<CatchUpResponse>}
 */
export async function catchUp(plugin, brain, name, answer, n) {
  if (!judgeNamed(brain, name)) return UNKNOWN_JUDGE;
  if (answer !== "all" && answer !== "latest" && answer !== "drop") return { ok: false, code: "invalid", error: "the answer is all, latest or drop" };
  if (answer === "latest" && !(Number.isInteger(n) && n >= 1 && n <= 100_000)) return { ok: false, code: "invalid", error: "latest takes a whole number of items, one at least" };
  // Refused before anything is started: a judge that waits for nothing (answered already, in another window or by hand).
  if (!existsSync(join(hubDir(), "judge", `${name}.hold`))) return { ok: false, code: "not-held", error: "this judge is not waiting for an answer" };
  const said = await askPlugin(plugin, brain, "judge.mjs", ["catch-up", name, answer, ...(answer === "latest" ? [String(n)] : [])]);
  if (!said.ok) return { ok: false, code: said.code, error: said.error };
  return { ok: true, kept: Number(said.said.kept) || 0, dropped: Number(said.said.dropped) || 0 };
}
