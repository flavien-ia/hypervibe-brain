#!/usr/bin/env node
// start.mjs - Where the START of a brain stands (2026-11-17).
//
// /brain:start builds a brain PART AFTER PART (2026-11-23), each part set up
// then filled before the next one opens, and it must resume where the person
// left off, in another conversation, another day:
//
//   0 PREFLIGHT    is there a brain already, here, in a folder of this
//                  computer, on the person's GitHub? (preflight.mjs: one
//                  never ends up with a second, empty brain beside the first)
//   1 COMPUTER     this computer has what a brain needs
//   2 CONTAINER    the brain itself (/brain:create: where it lives, its
//                  domains, its types), then the live view, opened once, that
//                  stays open beside the rest of the start
//   3 TOOLS        what feeds the brain, before any knowledge comes in: its
//                  sources, the live reading with its judge's token, a cap
//   4 KNOWLEDGE    what already exists comes in, block by block, each counted
//                  first and its cost said and agreed before it starts: the
//                  person's writings, what their AI remembers of them
//                  (memory.mjs), their conversations of the last days, the
//                  documents of their watched folders, the people of their mail
//   5 EXECUTIVE    the skills and guards left in Claude Code's own folders,
//                  brought into the brain (executive.mjs)
//   6 LIFE         the alert channel, the routines: the evening save, the
//                  weekly review
//
// Until 2026-11-23 the start had two phases: set everything up, then fill.
// The steps and the blocks keep their names of then (a start begun under
// them resumes without losing a mark); the parts are a layer above them.
// `phase` is still given, for whoever read it (status.mjs): 1 while a part
// before the knowledge has something to do, 2 after, "done" at the end.
//
// WHAT IS KEPT, AND WHERE. Almost everything is READ from what is really
// there (is a judge installed? is a token found? is the evening save armed?),
// so the start never trusts a note of its own over the facts. Only what no
// fact can say is kept: a step the person declined, a block they keep for
// later or never want, what they agreed to, and what the knowledge counted
// before anything was read. It lives in THIS COMPUTER's settings
// (~/.hypervibe-brain/config.json, "start"), written through lib.mjs's own
// helper, never in the brain's shared files: on a second computer the start
// is another story (and a shorter one: what only the computer that runs the
// brain does, the judges' token, their cap, the background program, the
// blocks a judge reads, does not apply there, see startState). It is filed
// under the brain's name and the day it was created, NOT under its folder:
// the one place that says where a brain is stays `brain` in config.json, a
// brain that is moved keeps its start, and another brain made active starts
// from nothing.
//
//   node scripts/start.mjs state [--json]
//   node scripts/start.mjs preflight [--no-github]          is there a brain already, here or elsewhere (reads only)
//   node scripts/start.mjs mark <step|block> <done|declined|later|never|todo> [--note "<why>"]
//   node scripts/start.mjs count [--days N]                what already exists, with an estimate per block (its totals are kept)
//   node scripts/start.mjs catch-up <conversations|documents> [--days N] [--latest <n>]
//                                                          puts the block on its judge's pile, as agreed
//   node scripts/start.mjs page [--doing "<what is being done, in a line>"] [--open]
//                                                          writes the page of the start again (start-page.mjs)
//   node scripts/start.mjs pause [--note "<where it was stopped, in the person's words>"]
//
// STOPPED AND TAKEN UP AGAIN (2026-11-20). The start is read from the facts,
// so a session cut short (the plan's limit reached, the person leaving) loses
// nothing: the next /brain:start reads the state and goes on. Two things no
// fact can say are kept beside it, for the page and for the next session:
// what was being done (`page --doing`, written BEFORE each step, so that it
// survives a session that ends without warning), and a pause the person
// asked for, with their words. They live in this computer's settings
// ("startNow"), brain or no brain: the first part comes before the brain.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { HOME, ROOT, config, hasBrain, isRunner, setUserConfig, userConfig, userConfigProblem, writeFileAtomic } from "./lib.mjs";
import { brainLang, osLang } from "./i18n.mjs";
import { startPage } from "./start-page.mjs";
import { PER_ITEM, catchUp, judgeSettings, liveSources, perItem, pileOf, waiting } from "./judge.mjs";
import { tokenOutsideVault, tokenState } from "./judge-token.mjs";
import { conversationsBacklog, documentsBacklog } from "./watch.mjs";
import { readDirectory } from "./directory.mjs";
import { ledgers, namedSources, notesNaming, written } from "./ledger.mjs";
import { LEDGER as MEMORY_LEDGER, PER_FILE, archivePending, find as findMemory } from "./memory.mjs";
import { candidates as executiveLeft, state as executiveFloor } from "./executive.mjs";
import { preflight } from "./preflight.mjs";

export const STEPS = ["computer", "brain", "view", "sources", "live", "token", "cap", "executive", "alert", "routines"];
export const BLOCKS = ["writings", "memory", "conversations", "documents", "contacts"];
/**
 * The parts of the start, in their order: each holds steps, or the blocks of
 * the knowledge. The preflight holds neither: it is done once a brain is
 * active on this computer.
 */
export const PARTS = [
  { id: "preflight", steps: [] },
  { id: "computer", steps: ["computer"] },
  { id: "container", steps: ["brain", "view"] },
  { id: "tools", steps: ["sources", "live", "token", "cap"] },
  { id: "knowledge", blocks: BLOCKS },
  { id: "executive", steps: ["executive"] },
  { id: "life", steps: ["alert", "routines"] },
];
// What a person may say of a step or of a block, beyond what the facts say.
// NO STEP HOLDS THE START BACK (2026-11-21). The token had no mark at all, and
// the routines could only be declined by a command no skill gave: a person who
// could not create the token right now, or who wanted no evening save, was
// asked again at every /brain:start and never reached the first big session.
// Both can be declined, or kept for "later": a step kept for later lets the
// start go on, and comes back once nothing else is left to do.
// (The executive floor, 2026-11-23: "done" when the person brought in what
// they wanted and leaves the rest where it is.)
const STEP_MARKS = { sources: ["done", "declined"], live: ["declined"], token: ["later", "declined"], cap: ["done"], alert: ["done", "declined"], routines: ["later", "declined"], view: ["done", "declined"], executive: ["done", "later", "declined"] };
const BLOCK_MARKS = ["done", "later", "never"];
// What leaves a part done: nothing in it is left to do now.
const SETTLED = ["done", "declined", "na", "never"];
const fwd = (p) => String(p).replace(/\\/g, "/");
const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};

/** What was kept of this brain's start on this computer (nothing for another brain). */
function record() {
  const r = userConfig().start;
  return r && hasBrain() && r.of === which() ? r : { steps: {}, blocks: {} };
}
/** Which brain a record is about: its name and the day it was created, never a path. */
function which() {
  const cfg = config();
  return `${cfg.name ?? ""}|${cfg.created ?? ""}`;
}
function keep(patch) {
  const r = record();
  // (What the record holds besides, the totals counted among them, is kept.)
  const next = { ...r, of: which(), began: r.began ?? new Date().toISOString(), steps: r.steps ?? {}, blocks: r.blocks ?? {}, ...patch };
  setUserConfig({ start: next });
  return next;
}

/**
 * WHAT A BLOCK READ BY A JUDGE WAS GIVEN (2026-11-23): the references put on
 * its pile when the person agreed, kept beside the record (a list too long
 * for the settings), so that what the block read and what it wrote is told
 * apart from the live reading of the same days.
 */
const agreedFile = (name) => join(HOME, ".hypervibe-brain", "start", `${name}.json`);
function agreedRefs(name) {
  const f = readJson(agreedFile(name), null);
  return f && f.of === which() && Array.isArray(f.refs) ? f.refs.map(String) : null;
}

/** The writings listed in SOURCES.md: each line of its checklist, ticked or not. */
function writings() {
  let text = "";
  try {
    text = readFileSync(join(ROOT, "SOURCES.md"), "utf8");
  } catch {
    return [];
  }
  return [...text.matchAll(/^\s*- \[([ xX])\]\s+(.+)$/gm)].map((m) => ({ done: m[1] !== " ", line: m[2].trim() }));
}

/** A place of the disk, written one way (for two ways of writing the same folder). */
const placeKey = (p) => fwd(resolve(p)).replace(/\/+$/, "").toLowerCase();

/**
 * THE EXECUTIVE FLOOR, read from the facts (2026-11-23): "todo" while skills
 * or hooks are left in Claude Code's own folders, or a piece of the floor is
 * not placed where Claude Code looks; "done" when the floor holds something
 * and nothing is left; "na" when there is nothing at all, in the brain or out
 * of it.
 */
function executiveFacts() {
  let left = { skills: [], hooks: [] };
  let floor = { skills: [], shared: [], guards: [] };
  try {
    left = executiveLeft();
  } catch {
    left = { skills: [], hooks: [] };
  }
  try {
    floor = executiveFloor({ harnesses: false });
  } catch {
    floor = { skills: [], shared: [], guards: [] };
  }
  // (A skill the person switched off is not "not placed": it has no link on purpose, executive.mjs switch, 2026-11-27.)
  const unplaced = [...(floor.skills ?? []), ...(floor.shared ?? [])].filter((s) => s.placed !== "linked" && s.on !== false).length + (floor.guards ?? []).filter((g) => !g.placed).length;
  const held = (floor.skills ?? []).length + (floor.guards ?? []).length;
  const out = (left.skills ?? []).length + (left.hooks ?? []).length;
  return { state: out || unplaced ? "todo" : held ? "done" : "na", skills: (floor.skills ?? []).length, guards: (floor.guards ?? []).length, left: { skills: (left.skills ?? []).length, hooks: (left.hooks ?? []).length }, ...(unplaced ? { unplaced } : {}) };
}

/** Where a part stands, from what it holds. */
function partState(states) {
  if (states.every((s) => s === "na")) return "na";
  if (states.every((s) => SETTLED.includes(s))) return "done";
  if (states.includes("todo")) return "todo";
  if (states.includes("running")) return "running";
  return "later";
}

/**
 * Where the start stands. `parts` in their order, each with its state and
 * what it holds; `part` is the part where `next` lies. `steps` and
 * `session.blocks` give each step and each block its state: "done", "todo",
 * "declined", "later" (kept for later: the start goes on and comes back to
 * it), "na" (does not apply: no judge, so no token to give; or a computer that
 * does not run the brain), and for a block "never" or "running" (agreed, its
 * judge is reading). Each block of the knowledge has its `progress` (see
 * progressOf). `next` is the first thing to do.
 */
export function startState() {
  // (What was being done when the last session ended, and a pause asked for.)
  const leftOff = () => {
    const k = nowKept();
    return { ...(k.doing ? { doing: k.doing } : {}), ...(k.paused ? { paused: k.paused } : {}) };
  };
  // No brain yet: the preflight first (is there one elsewhere?), then the
  // computer is checked by the skill itself, and the place of the brain is
  // still a question. The default is said in full, never assumed.
  if (!hasBrain()) {
    // (Settings that cannot be read are not "no brain yet": the brain they name is there, untouched.)
    const problem = userConfigProblem();
    if (problem) return { ok: false, brain: null, error: `the settings of this computer (${fwd(join(HOME, ".hypervibe-brain", "config.json"))}) cannot be read (${problem}): repair that file by hand (nothing was written over it), then run /brain:start again`, ...leftOff() };
    const first = ["preflight", "computer", "container"];
    return {
      ok: true,
      brain: null,
      proposedPlace: `${fwd(HOME)}/brain`,
      phase: 1,
      part: "preflight",
      next: "preflight",
      parts: PARTS.map((p) => ({ id: p.id, state: first.includes(p.id) ? "todo" : "waiting", ...(p.blocks ? { blocks: p.blocks } : { steps: p.steps }) })),
      steps: STEPS.map((id) => ({ id, state: id === "computer" || id === "brain" ? "todo" : "waiting" })),
      session: { blocks: BLOCKS.map((id) => ({ id, state: "waiting" })), finished: false },
      underway: lively(null),
      ...leftOff(),
    };
  }
  const cfg = config();
  const user = userConfig();
  const rec = record();
  const mark = (id) => rec.steps?.[id]?.state;
  const allowed = (id) => (STEP_MARKS[id] ?? []).includes(mark(id));
  const judges = liveSources();
  const names = judges.map((j) => j.name);
  // A brain made before the stages existed has none: it is built.
  const stage = cfg.stage ?? 6;
  const living = cfg.sources?.mail === true || cfg.sources?.journal === true || (cfg.sources?.watch ?? []).length > 0;
  const save = Boolean(user.routines?.save);
  const hub = Boolean(user.routines?.hub);
  // THE COMPUTER THAT RUNS THE BRAIN, AND THE OTHERS (2026-11-21, lib.mjs
  // isRunner). A second computer only reads and writes notes: the judges came
  // with the clone but never run there, so it was asked for a token, a cap,
  // the background program and a first big session that are not its own. What
  // only the runner does "does not apply" (na) on the others.
  const runner = isRunner(cfg);
  const token = names.length && runner ? tokenOutsideVault() || Boolean(tokenState().found) : false;
  const executive = executiveFacts();
  // (A cap of its own: the key is in the judge's source.json, whatever its value; 0 there is a choice, its absence the default.)
  const capped = judges.filter((j) => j.def && Object.hasOwn(j.def, "dailyTokens")).map((j) => j.name);
  const uncapped = names.filter((n) => !capped.includes(n));
  const facts = {
    computer: { state: "done" },
    // THE CONTAINER (2026-11-23): the brain exists with its first notes once
    // /brain:create has passed its second gate (stage 3). What it does after
    // that (the sources, the modules) has its own part in the start; `built`
    // says whether the creation went to its end (stage 6), its last modules
    // (an online copy, the search by meaning) offered at the end of the start.
    brain: stage >= 3 ? { state: "done", stage, built: stage >= 6 } : { state: "todo", stage },
    // READ FROM THE FACTS TOO (2026-11-23, a brain built before the
    // start): the live view, the cap and the alert only read the start's own
    // marks, and a brain whose view runs with the session, whose judges have
    // their cap and whose alert has a channel was told they were to do. The
    // facts say done; a mark (declined, later) says the rest.
    // The live view: it starts with the session (live.mjs on).
    view: { state: user.routines?.live ? "done" : allowed("view") ? mark("view") : "todo", ...(user.routines?.live ? { installed: true } : {}) },
    sources: { state: living || stage >= 4 || mark("sources") === "done" ? "done" : allowed("sources") ? mark("sources") : "todo", mail: cfg.sources?.mail === true, journal: cfg.sources?.journal === true, watch: (cfg.sources?.watch ?? []).length },
    live: { state: names.length ? "done" : allowed("live") ? "declined" : "todo", judges: names },
    token: { state: !names.length || !runner ? "na" : token ? "done" : allowed("token") ? mark("token") : "todo" },
    // The cap: settled once a judge carries a cap of its own in its
    // source.json (the standard judges come with one; the person moves it
    // with /brain:_limits). A judge without one reads with no cap, the
    // default: it is named in `uncapped`, for the skill to say it.
    cap: { state: !names.length || !runner ? "na" : capped.length || mark("cap") === "done" ? "done" : "todo", caps: Object.fromEntries(judges.map((j) => [j.name, judgeSettings(j.def).dailyTokens])), ...(uncapped.length && capped.length ? { uncapped } : {}) },
    // (What the person said of the floor is kept over the facts: they may leave a skill where it is.)
    executive: { ...executive, state: allowed("executive") ? mark("executive") : executive.state },
    // The alert: a real channel is chosen (letter.mjs setup).
    alert: { state: cfg.letter?.channel && cfg.letter.channel !== "none" ? "done" : allowed("alert") ? mark("alert") : "todo", channel: cfg.letter?.channel ?? "none" },
    // (The background program runs the judges: without them, or on a computer that is not the runner, the evening save is the whole of it.)
    routines: { state: save && (hub || !names.length || !runner) ? "done" : allowed("routines") ? mark("routines") : "todo", save, hub, review: Boolean(user.routines?.review) },
  };
  const steps = STEPS.map((id) => ({ id, ...facts[id], ...(rec.steps?.[id]?.note ? { note: rec.steps[id].note } : {}) }));

  const list = writings();
  const kept = (id) => rec.blocks?.[id] ?? {};
  const said = (id) => (BLOCK_MARKS.includes(kept(id).state) ? kept(id).state : null);
  // A block read by a judge: agreed, it is "running" while its pile holds something.
  const judged = (id) => {
    if (!names.includes(id) || !runner) return { state: "na" };
    if (said(id)) return { state: said(id) };
    if (kept(id).state === "agreed") return waiting(id) > 0 ? { state: "running", waiting: waiting(id), ...(kept(id).items ? { items: kept(id).items } : {}) } : { state: "done" };
    return { state: "todo" };
  };
  let people = 0;
  // The months of the directory's first fill, and those not in yet (contacts.mjs months).
  let monthsLeft = 0;
  let months = 0;
  try {
    const dir = cfg.contacts?.enabled === true ? readDirectory(cfg) : null;
    people = dir ? dir.contacts.length : 0;
    const fill = dir?.extra?.fill;
    if (fill?.from && fill?.to) {
      const covered = new Set(dir.extra.covered ?? []);
      let [y, m] = String(fill.from).split("-").map(Number);
      for (let k = 0; k < 120; k++) {
        const month = `${y}-${String(m).padStart(2, "0")}`;
        if (month > fill.to) break;
        months++;
        if (!covered.has(month)) monthsLeft++;
        m++;
        if (m > 12) {
          m = 1;
          y++;
        }
      }
    }
  } catch {
    people = 0;
  }
  // (The ledgers of the AI's memory are the memory block's, not a writing's.)
  const allLedgers = ledgers();
  const writingLedgers = allLedgers.filter((l) => !l.name.startsWith(MEMORY_LEDGER));
  const openLedgers = writingLedgers.filter((l) => !l.closed);
  const leftInLedgers = openLedgers.reduce((n, l) => n + l.left, 0);
  // THE MEMORY OF THEIR AI: read from the facts. Files still in a memory
  // folder, or a ledger still open, are to do; nothing found and nothing ever
  // brought in, the block does not apply; everything archived and every ledger
  // closed, it is done. What the person said of it (later, never, done: a
  // memory brought in before this block existed) is kept over the facts.
  const memoryLedgers = allLedgers.filter((l) => l.name.startsWith(MEMORY_LEDGER));
  const memoryOpen = memoryLedgers.filter((l) => !l.closed);
  const memoryLeft = memoryOpen.reduce((n, l) => n + l.left, 0);
  let memoryFiles = 0;
  try {
    memoryFiles = findMemory().files;
  } catch {
    memoryFiles = 0;
  }
  // (A run of `memory.mjs archive` cut short left files moved and not listed yet: to do, never "done".)
  let memoryCut = false;
  try {
    memoryCut = archivePending();
  } catch {
    memoryCut = false;
  }
  const memoryToDo = memoryFiles > 0 || memoryOpen.length > 0 || memoryCut;
  const blockFacts = {
    // A source whose ledger still holds items is not in, ticked or not (ledger.mjs).
    writings: { state: list.length && list.every((w) => w.done) && !leftInLedgers ? "done" : said("writings") ?? "todo", listed: list.length, ingested: list.filter((w) => w.done).length, ...(openLedgers.length ? { left: leftInLedgers, ledgers: openLedgers } : {}) },
    memory: { state: said("memory") ?? (memoryToDo ? "todo" : memoryLedgers.length ? "done" : "na"), files: memoryFiles, ...(memoryOpen.length ? { left: memoryLeft, ledgers: memoryOpen } : {}), ...(memoryCut ? { pending: true } : {}) },
    conversations: judged("conversations"),
    documents: judged("documents"),
    // (The directory is computed by the computer that runs the brain: elsewhere, it comes with the brain or does not apply.)
    contacts: { state: people > 0 && !monthsLeft ? "done" : said("contacts") ?? (runner ? "todo" : "na"), people, ...(monthsLeft ? { monthsLeft } : {}) },
  };
  const progress = progressOf({ rec, list, writingLedgers, memoryLedgers, memoryFiles, months, monthsLeft, people, blockFacts });
  const blocks = BLOCKS.map((id) => ({ id, ...blockFacts[id], ...(progress[id] && blockFacts[id].state !== "na" ? { progress: progress[id] } : {}), ...(kept(id).at ? { at: kept(id).at } : {}), ...(kept(id).note ? { note: kept(id).note } : {}) }));

  // THE PARTS, IN THEIR ORDER (2026-11-23). The first thing to do is the
  // first "todo" of the parts in their order; then a block being read in the
  // background; then a step kept for later, then a block kept for later: what
  // was kept for later never holds the start back, and comes back once
  // nothing else is left to do. The start is not "done" while one waits.
  const stateOf = (id) => (steps.find((s) => s.id === id) ?? blocks.find((b) => b.id === id))?.state;
  const parts = PARTS.map((p) => {
    const ids = p.blocks ?? p.steps;
    return { id: p.id, state: p.id === "preflight" ? "done" : partState(ids.map(stateOf)), ...(p.blocks ? { blocks: ids } : { steps: ids }) };
  });
  const order = PARTS.flatMap((p) => (p.blocks ?? p.steps).map((id) => ({ id, part: p.id, block: Boolean(p.blocks) })));
  const first = (fn) => order.find((x) => fn(x, stateOf(x.id)));
  const nextOne = first((_, s) => s === "todo") ?? first((x, s) => x.block && s === "running") ?? first((x, s) => !x.block && s === "later") ?? first((x, s) => x.block && s === "later") ?? null;
  const postponed = steps.find((s) => s.state === "later");
  const finished = blocks.every((b) => ["done", "never", "na"].includes(b.state));
  // "resting": nothing left to decide now in the knowledge, but something was kept for later.
  const resting = !finished && blocks.every((b) => b.state !== "todo");
  const knowledgeAt = PARTS.findIndex((p) => p.id === "knowledge");
  const before = PARTS.slice(0, knowledgeAt).flatMap((p) => p.steps ?? []);
  const done = finished && !postponed && steps.every((s) => s.state !== "todo");
  const phase = done ? "done" : steps.some((s) => before.includes(s.id) && s.state === "todo") ? 1 : 2;
  return {
    ok: true,
    brain: fwd(ROOT),
    ...(runner ? {} : { runner: false, runs: String(cfg.runner) }),
    proposedPlace: `${fwd(HOME)}/brain`,
    phase,
    part: done ? null : nextOne?.part ?? null,
    next: done ? null : nextOne?.id ?? null,
    parts,
    steps,
    session: { blocks, finished, ...(resting ? { resting: true } : {}), ...(rec.began ? { began: rec.began } : {}), ...(rec.counted?.at ? { counted: rec.counted.at } : {}) },
    // Begun and not finished: the live view shows its panel of the building.
    underway: !done && lively(cfg),
    ...leftOff(),
  };
}

/**
 * THE PROGRESS OF EACH BLOCK OF THE KNOWLEDGE (2026-11-23): first its total,
 * counted before anything is read (`start.mjs count`, kept in the record),
 * then, element after element, what is in, what is left, and how many notes
 * it added to the brain (the notes that name one of its elements as their
 * source, ledger.mjs namedSources). Each block says what it measures:
 *
 *   { total, done, left, notes, unit, counted?, uncounted?, unmeasured? }
 *
 * `total` is null while nothing counted the block; `notes` is null where it
 * is not measured. What is and is not measured:
 *
 *   writings       the items of every ledger opened (a folder, a file, a list),
 *                  plus the files counted in the lines of SOURCES.md not opened
 *                  yet; done = with a note or set aside; notes measured.
 *                  NOT measured: a line that names something no program can
 *                  count from here (a website: `uncounted`), and a line ticked
 *                  before the ledgers existed, which has no ledger
 *                  (`unmeasured`: how many such lines)
 *   memory         the files left in the AI's own memory folders, plus the
 *                  items of the memory's ledgers; notes measured
 *   conversations  the items put on the judge's pile when the person agreed
 *   documents      (their references are kept, start/<block>.json); done =
 *                  no longer on the pile (a document whose newer version
 *                  replaced it there still counts as left); notes measured.
 *                  A block agreed before 2026-11-23 kept only its number: its
 *                  pile is then the whole pile, and its notes are not measured
 *   contacts       in months of mail, the period chosen for the directory;
 *                  `people` beside. Its notes are NOT measured: a person
 *                  becomes a note on the person's yes, and names no message
 *                  of their mail as its source
 */
function progressOf({ rec, list, writingLedgers, memoryLedgers, memoryFiles, months, monthsLeft, people, blockFacts }) {
  const counted = rec.counted?.blocks ?? {};
  let seen = null;
  const named = () => (seen ??= namedSources());
  const sum = (ls, k) => ls.reduce((n, l) => n + (Number(l[k]) || 0), 0);
  const out = {};

  // The writings: every ledger, then the lines counted and not opened yet.
  {
    const from = new Set(writingLedgers.filter((l) => l.from).map((l) => placeKey(l.from)));
    const lines = Array.isArray(counted.writings?.list) ? counted.writings.list : [];
    let waitingFiles = 0;
    let uncounted = 0;
    for (const w of list.filter((x) => !x.done)) {
      const c = lines.find((x) => x.line === w.line);
      if (c?.place && from.has(placeKey(c.place))) continue;
      if (c && Number.isInteger(c.files)) waitingFiles += c.files;
      else uncounted++;
    }
    // (A ticked line whose folder no ledger names was brought in before the ledgers, or by hand: its elements are not known.)
    const unmeasured = list.filter((w) => w.done && !(placeOf(w.line) && from.has(placeKey(placeOf(w.line))))).length;
    const done = sum(writingLedgers, "notes") + sum(writingLedgers, "skipped");
    const left = sum(writingLedgers, "left") + waitingFiles;
    const anything = writingLedgers.length > 0 || Boolean(counted.writings);
    out.writings = { total: anything ? done + left : null, done, left, notes: sum(writingLedgers, "fiches"), unit: "files", counted: Boolean(counted.writings), ...(uncounted ? { uncounted } : {}), ...(unmeasured ? { unmeasured } : {}) };
  }
  // What their AI remembers: the files still in its folders, and the ledgers.
  {
    const done = sum(memoryLedgers, "notes") + sum(memoryLedgers, "skipped");
    const left = sum(memoryLedgers, "left") + memoryFiles;
    out.memory = { total: done + left, done, left, notes: sum(memoryLedgers, "fiches"), unit: "files", counted: true };
  }
  // The blocks a judge reads.
  for (const id of ["conversations", "documents"]) {
    const k = rec.blocks?.[id] ?? {};
    if (k.state === "agreed") {
      const refs = agreedRefs(id);
      const base = (r) => String(r).replace(/#[^/]*$/, "");
      if (refs) {
        const pile = new Set(pileOf(id).map((i) => base(i.ref)));
        const left = refs.filter((r) => pile.has(base(r))).length;
        out[id] = { total: refs.length, done: refs.length - left, left, notes: notesNaming(refs, named()), unit: id, counted: true };
      } else {
        const total = Number(k.items) || 0;
        const left = Math.min(total, waiting(id));
        out[id] = { total, done: total - left, left, notes: null, unit: id, counted: true, unmeasured: ["notes"] };
      }
    } else if (blockFacts[id].state === "done") {
      out[id] = { total: 0, done: 0, left: 0, notes: null, unit: id, counted: true, unmeasured: ["notes"] };
    } else {
      const total = Number.isInteger(counted[id]?.items) ? counted[id].items : null;
      out[id] = { total, done: 0, left: total ?? 0, notes: total === null ? null : 0, unit: id, counted: total !== null };
    }
  }
  // The people of their mail: in months.
  out.contacts = months ? { total: months, done: months - monthsLeft, left: monthsLeft, notes: null, unit: "months", counted: true, people, unmeasured: ["notes"] } : { total: null, done: 0, left: 0, notes: null, unit: "months", counted: false, people, unmeasured: ["notes"] };
  return out;
}

/** What was being done, and a pause asked for: kept beside the facts (see the top). */
const nowKept = () => userConfig().startNow ?? {};
/**
 * A START THAT IS REALLY GOING ON (2026-11-23). A brain built before the start
 * (or whose start was left aside for months) is never finished in its eyes:
 * the live view showed its panel of the building for good. The panel shows
 * only while the start served lately: something was being done, or a pause
 * asked for, within the last seven days, or the brain was created less than
 * fourteen days ago.
 */
const DAY = 86_400_000;
const within = (iso, days) => {
  const t = Date.parse(String(iso ?? ""));
  return Number.isFinite(t) && Date.now() - t < days * DAY;
};
function lively(cfg) {
  const k = nowKept();
  return within(k.doing?.at, 7) || within(k.paused?.at, 7) || within(cfg?.created, 14);
}
export const PAGE_FILE = () => join(HOME, ".hypervibe-brain", "start.html");

/**
 * THE PAGE OF THE START, written again from the state. `doing` replaces what
 * was being done and ends a pause; `open` shows the page in the browser (once
 * per session is enough: the page reads itself again).
 */
export function writePage({ doing, open = false } = {}) {
  let kept = nowKept();
  if (doing !== undefined) {
    const { paused: _paused, ...rest } = kept;
    kept = { ...rest, doing: { text: String(doing).slice(0, 300), at: new Date().toISOString() } };
    setUserConfig({ startNow: kept });
  }
  const state = startState();
  const lang = hasBrain() ? brainLang(ROOT) : osLang();
  const file = PAGE_FILE();
  // (Beside, then renamed: the page reads itself again every five seconds, never half a page.)
  writeFileAtomic(file, startPage(state, { lang, doing: kept.doing ?? null, paused: kept.paused ?? null }));
  let opened = false;
  if (open && process.env.HVBRAIN_NO_OPEN !== "1") {
    const [cmd, args] = process.platform === "win32" ? ["cmd", ["/c", "start", "", file]] : process.platform === "darwin" ? ["open", [file]] : ["xdg-open", [file]];
    try {
      spawn(cmd, args, { detached: true, stdio: "ignore", windowsHide: true }).on("error", () => {}).unref();
      opened = true;
    } catch {
      opened = false;
    }
  }
  return { ok: true, file: fwd(file), opened, phase: state.phase, part: state.part ?? null, next: state.next };
}

/** A pause the person asked for: said on the page, and to the next session. */
export function pause(note = "") {
  const kept = nowKept();
  setUserConfig({ startNow: { ...kept, paused: { at: new Date().toISOString(), ...(note ? { note: String(note).slice(0, 300) } : {}) } } });
  const page = writePage();
  return { ok: true, paused: true, next: page.next, file: page.file };
}

/** The folder or file a line of SOURCES.md names, when it is on this computer. */
function placeOf(line) {
  const after = line.includes(": ") ? line.slice(line.indexOf(": ") + 2) : line;
  for (const raw of [after, /(~[\\/][^()]+|[A-Za-z]:[\\/][^()]+|\/[^()]+)/.exec(after)?.[1] ?? ""]) {
    const p = raw.trim().replace(/^[`"']|[`"'.]$/g, "").replace(/^~(?=[\\/]|$)/, HOME);
    if (p && existsSync(p)) return p;
  }
  return null;
}

/**
 * WHAT ALREADY EXISTS, COUNTED, before anything is read. Each block: how many
 * items, and an estimate in tokens (items x the size of one item judged: the
 * median of this judge's own runs when it has some, 150 000 otherwise, the
 * order measured on a real brain). An estimate, said as one. For a block read
 * by a judge, `daysAtCap` says over how many days its cap for the day spreads it.
 * THE TOTALS ARE KEPT (2026-11-23), in this computer's record of the start:
 * the progress of each block (startState) is measured against them.
 */
export function count({ days = 30 } = {}) {
  const cfg = config();
  const judges = new Map(liveSources().map((j) => [j.name, j]));
  const block = (name, backlog) => {
    const j = judges.get(name);
    const per = j ? perItem(name) : PER_ITEM;
    const cap = j ? judgeSettings(j.def).dailyTokens : 0;
    const estimate = backlog.items * per;
    return { ...backlog, judge: Boolean(j), perItem: per, estimate, ...(cap ? { cap, daysAtCap: Math.max(1, Math.ceil(estimate / cap)) } : {}) };
  };
  const list = writings().filter((w) => !w.done).map((w) => {
    const place = placeOf(w.line);
    let files = null;
    try {
      files = place ? (statSync(place).isDirectory() ? written(place).length : 1) : null;
    } catch {
      files = null;
    }
    return { line: w.line, ...(place ? { place: fwd(place) } : {}), files, estimate: files === null ? null : files * PER_ITEM };
  });
  const known = list.filter((w) => w.files !== null);
  const watcher = readJson(join(ROOT, "sources", "documents-watch", "source.json"), {});
  let people = 0;
  try {
    people = cfg.contacts?.enabled === true ? readDirectory(cfg).contacts.length : 0;
  } catch {
    people = 0;
  }
  const blocks = {
    // Brought in by Claude in the conversation (/brain:ingest), not by a judge:
    // the same order of size per text is used, for want of a measure of its own.
    writings: { by: "conversation", listed: list.length, items: known.reduce((n, w) => n + w.files, 0), perItem: PER_ITEM, estimate: known.reduce((n, w) => n + w.estimate, 0), uncounted: list.length - known.length, list },
    // What their AI remembers of them (memory.mjs): counted from the names
    // and the sizes, never the text. Brought in through the conversation.
    memory: (() => {
      const m = findMemory();
      return { by: "conversation", items: m.files, projects: m.projects.length, bytes: m.bytes, perItem: PER_FILE, estimate: m.estimate };
    })(),
    conversations: block("conversations", conversationsBacklog({ days: Math.min(30, days), calm: readJson(join(ROOT, "sources", "conversations-watch", "source.json"), {}).calm })),
    documents: block("documents", documentsBacklog({ days, settle: watcher.settle, extensions: watcher.extensions, depth: watcher.depth })),
    // Read through the mail connector, in the conversation: no script can
    // count it, and nothing was measured. Claude counts with the connector.
    contacts: { by: "conversation", measured: false, enabled: cfg.contacts?.enabled === true, people },
  };
  keep({ counted: { at: new Date().toISOString(), days, blocks: { writings: { items: blocks.writings.items, list: list.map((w) => ({ line: w.line, ...(w.place ? { place: w.place } : {}), files: w.files })) }, memory: { items: blocks.memory.items }, conversations: { items: blocks.conversations.items }, documents: { items: blocks.documents.items } } } });
  return { ok: true, estimate: true, blocks };
}

/**
 * A block read by a judge, started as agreed: what exists is put on the
 * judge's pile, and the person's answer is recorded with it ("read them
 * all", or "only the n latest"), so the judge does not ask again. The judge
 * then reads at its rhythm, under its cap for the day; pausing it stops the
 * session, resuming it goes on.
 */
export function startBlock(name, { days = 30, latest } = {}) {
  const j = liveSources().find((x) => x.name === name);
  if (!["conversations", "documents"].includes(name)) return { ok: false, error: "catch-up conversations | documents: the blocks a judge reads (the writings and the contacts come in through the conversation)" };
  if (!j) return { ok: false, error: `the live reading of the ${name} is not on (sources.mjs install ${name}): there is no judge to read them` };
  const watcher = readJson(join(ROOT, "sources", `${name}-watch`, "source.json"), {});
  const put = name === "conversations" ? conversationsBacklog({ days, calm: watcher.calm, put: true }) : documentsBacklog({ days, settle: watcher.settle, extensions: watcher.extensions, depth: watcher.depth, put: true });
  const answer = latest === undefined ? catchUp(name, "all") : catchUp(name, "latest", Number(latest));
  if (!answer.ok) return answer;
  const per = perItem(name);
  const cap = judgeSettings(j.def).dailyTokens;
  const estimate = answer.kept * per;
  // What the block was given, item by item, for its progress (see agreedFile).
  try {
    mkdirSync(join(HOME, ".hypervibe-brain", "start"), { recursive: true });
    writeFileAtomic(agreedFile(name), `${JSON.stringify({ of: which(), at: new Date().toISOString(), refs: pileOf(name).map((i) => i.ref) })}\n`);
  } catch {
    // without it, the block's progress says its number only
  }
  const rec = record();
  keep({ blocks: { ...(rec.blocks ?? {}), [name]: { state: "agreed", at: new Date().toISOString(), days: put.days, items: answer.kept, estimate } } });
  return { ok: true, block: name, put: put.put ?? 0, kept: answer.kept, dropped: answer.dropped, perItem: per, estimate, ...(cap ? { cap, daysAtCap: Math.max(1, Math.ceil(estimate / cap)) } : {}), hub: Boolean(userConfig().routines?.hub), ...(j.def.paused === true ? { paused: true } : {}) };
}

const isMain = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/start.mjs");
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  const out = (o) => console.log(JSON.stringify(o, null, a.includes("--json") ? 2 : 0));
  const fail = (error) => {
    out({ ok: false, error });
    process.exit(1);
  };
  const days = () => {
    const d = Number(opt("--days") ?? 30);
    return Number.isFinite(d) && d >= 1 ? d : 30;
  };
  // (Settings that are there and cannot be read stop a write with their reason, lib.mjs: said as one line of JSON, not as a stack.)
  process.on("uncaughtException", (e) => fail(String(e?.message ?? e)));
  if (a[0] === "state" || a[0] === undefined) {
    const s = startState();
    out(s);
    if (!s.ok) process.exitCode = 1;
  }
  else if (a[0] === "preflight") {
    const r = preflight({ github: !a.includes("--no-github") });
    out(r);
    if (!r.ok) process.exitCode = 1;
  }
  else if (a[0] === "page") out(writePage({ doing: opt("--doing"), open: a.includes("--open") }));
  else if (a[0] === "pause") out(pause(opt("--note") ?? ""));
  else if (!hasBrain()) fail(userConfigProblem() ? `the settings of this computer cannot be read (${userConfigProblem()}): repair ~/.hypervibe-brain/config.json by hand, the brain it names is untouched` : "no brain set up on this computer yet: the start begins with /brain:start");
  else if (a[0] === "mark") {
    const [, id, state] = a;
    const step = STEPS.includes(id);
    if (!step && !BLOCKS.includes(id)) fail(`mark <${[...STEPS, ...BLOCKS].join("|")}> <state>`);
    const states = step ? STEP_MARKS[id] ?? [] : BLOCK_MARKS;
    // (A step that is done when the facts say so cannot be SAID done: only declined, or kept for later.)
    if (state !== "todo" && !states.includes(state)) fail(!states.length ? `"${id}" is read from the facts: nothing to mark` : state === "done" ? `"${id}" is read from the facts: it is done when they say so, and can only be marked ${[...states, "todo"].join(", ")}` : `"${id}" can be marked: ${[...states, "todo"].join(", ")}`);
    const rec = record();
    const key = step ? "steps" : "blocks";
    const { [id]: _before, ...rest } = rec[key] ?? {};
    keep({ [key]: state === "todo" ? rest : { ...rest, [id]: { state, at: new Date().toISOString(), ...(opt("--note") ? { note: String(opt("--note")).slice(0, 300) } : {}) } } });
    const now = startState();
    out({ ok: true, marked: id, state, part: now.part, next: now.next });
  } else if (a[0] === "count") out(count({ days: days() }));
  else if (a[0] === "catch-up") {
    const latest = opt("--latest");
    if (latest !== undefined && (!Number.isInteger(Number(latest)) || Number(latest) < 0)) fail("--latest <n>: how many of the most recent items to keep");
    const r = startBlock(a[1], { days: days(), latest });
    out(r);
    if (!r.ok) process.exitCode = 1;
  } else {
    console.log('usage: start.mjs state | preflight [--no-github] | page [--doing "<line>"] [--open] | pause [--note "<words>"] | mark <step|block> <state> | count [--days N] | catch-up <conversations|documents> [--days N] [--latest n] (see the top of scripts/start.mjs)');
    process.exitCode = 2;
  }
}
