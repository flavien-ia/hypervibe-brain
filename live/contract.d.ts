// contract.d.ts: what the server (server.mjs) and the page (page/) say to each
// other. Types only, no code: the server is checked against them by
// `pnpm check`, the page imports the same ones. page/api.js has one function
// per route, with the type it answers with.
//
// Three kinds of things travel:
//   - what brain-live makes itself: typed fully here, keys in English;
//   - what the plugin makes and the server only passes on (a note, a fetched
//     piece of data, a suggestion, a health check, a line of usage): the
//     plugin's own shape, typed loosely;
//   - identifiers (note slugs, source names, type, domain and status ids):
//     always as the brain carries them, never translated.
// A text the server words for the person (marked "worded") comes in the
// brain's language (i18n/).

// ------------------------------------------------------------------ shared

export type Lang = "fr" | "en";

/** A refusal or a failure, worded. */
export interface ErrorResponse {
  error: string;
}

/** The moment something happened (an ISO date). */
export interface Stamp {
  at: string;
}

export interface Domain {
  id: string;
  label: string;
  color: string;
}

export interface NoteType {
  id: string;
  folder: string;
}

/** GET /api/vocabulary, and `vocabulary` in the map: the words of this brain. */
export interface Vocabulary {
  /** The language of everything the person reads. */
  lang: Lang;
  /** The name of the brain's owner, "" when brain.json has none. */
  name: string;
  domains: Domain[];
  types: NoteType[];
  /** The type id of a person's note (kept off the map of ideas). */
  personType: string;
  natures: string[];
  memoryPrefixes: string[];
}

// ------------------------------------------------------------------ the map

/** One note on the map; `MapResponse.fields` names the columns. */
export type MapNode = [
  id: string,
  title: string,
  type: string,
  domains: string[],
  degree: number,
  status: string,
  pos: [number, number, number] | null,
  date: string,
  nature: string,
];

/** GET /api/map */
export interface MapResponse {
  builtAt: string | null;
  vocabulary: Vocabulary;
  fields: ["id", "title", "type", "domains", "degree", "status", "pos", "date", "nature"];
  nodes: MapNode[];
  links: [string, string][];
}

/** GET /api/weights: note slug -> how much it counts. */
export type WeightsResponse = Record<string, number>;

/** GET /api/written?since=<ISO date>: the slugs of the notes written since. */
export type WrittenResponse = string[];

/** One contact: its notes' neighbours place it, a colleague's client is a guess. */
export type ContactRow = [address: string, name: string, client: string, tier: number, note: string, neighbours: string[], guessedClient: string, organization?: string, volume?: number, last?: string];

/** GET /api/contacts */
export type ContactsResponse = ContactRow[];

/** The executive floor of the brain (scripts/executive.mjs, 2026-11-22): the person's skills and guards. */
/** What in a skill's files looks like a secret (2026-11-27): how many, and the first ones by file, line and kind, never by value. */
export interface SkillSecrets { count: number; lines: { file: string; line: number; kind: string }[] }
/**
 * A skill. One of the person's own says whether it is on (`on`, the brain's
 * switch, 2026-11-27), where it stands for Claude Code (`placed`), why it
 * waits for the person's approval on this computer (`pending`) and what in it
 * looks like a secret (`secrets`). A skill of a plugin has none of these: it
 * follows its harness.
 */
export interface ExecutiveSkill { name: string; description: string; folder: string; on?: boolean; placed?: "linked" | "missing" | "other"; pending?: string | null; secrets?: SkillSecrets; file?: string; uses?: string[] }
/**
 * A plugin installed on this computer, and its skills (not moved into the
 * brain). `key` is its name in the platform (<plugin>@<marketplace>); `on`
 * the brain's switch and `enabledHere` what this computer's platform settings
 * say (2026-11-27); `own` for the brain's own plugin, which is never switched
 * off from the brain; `protects`, how many of its hooks run before an action.
 */
export interface ExecutiveHarness { name: string; key?: string; version: string; on?: boolean; enabledHere?: boolean; own?: boolean; protects?: number; skills: ExecutiveSkill[]; hooks?: { event: string; matcher: string; script: string; file?: string; what?: string }[] }
export interface ExecutiveGuard { file: string; what: string; present: boolean; placed: boolean; hooks: { event: string; matcher?: string; timeout?: number; placed: boolean }[] }
export interface ExecutiveResponse { ok: boolean; floor?: string; skills: ExecutiveSkill[]; guards: ExecutiveGuard[]; harnesses?: ExecutiveHarness[]; /** What the brain keeps switched off: the skills by folder, the harnesses by key. */ switches?: { skills: string[]; harnesses: string[] }; error?: string }

/**
 * POST /api/executive/switch?kind=skill|harness&name=<folder | plugin@marketplace>&to=on|off[&confirmed=1]:
 * one of the person's own skills, or a whole harness, switched off or on
 * (2026-11-27). `here` says what happened on this computer: "unlinked",
 * "linked", "pending" (on in the brain, waiting for the person's approval
 * before Claude Code is shown it), "left" (another folder holds its place),
 * "disabled", "enabled", "not installed". A refusal carries a code: "confirm"
 * (the harness checks before an action: the person's yes is asked, `protects`
 * names its hooks), "own" (the brain's own plugin), "guard" (a guard has no
 * switch), "unknown", "failed", "silent".
 */
export type SwitchResponse =
  | { ok: true; to: "on" | "off"; here: string; how?: string }
  | { ok: false; code: "confirm" | "own" | "guard" | "unknown" | "failed" | "silent"; protects?: string[] };

export type CatalogueRow = [address: string, tool: string, title: string, date: string];

/** GET /api/catalogue */
export type CatalogueResponse = CatalogueRow[];

// ------------------------------------------------------------------ territories

export interface Territory {
  id: string;
  /** The name the person gave, else a rule's, an AI's, or the keywords. */
  name: string;
  /** Where the name comes from. */
  origin: "given" | "rule" | "ai" | "keywords";
  keywords: string[];
  /** How many notes. */
  size: number;
}

/** GET /api/territories, POST /api/territories/redo */
export interface TerritoriesResponse {
  computedAt: string | null;
  territories: Territory[];
  /** Note slug -> territory id. */
  assignment: Record<string, string>;
}

/**
 * POST /api/territories/rename?id=&name=. A refusal carries a code the page
 * words: "unknown" (no such territory any more: they were cut again since),
 * "unreadable" (the cutting kept cannot be read right now).
 */
export type TerritoryRenamed = { ok: true; id: string; name: string | null } | { ok: false; code: "unknown" | "unreadable"; error: string };

// ------------------------------------------------------------------ the tools

export interface Family {
  /** Worded for the two built-in families, else as brain.json names it. */
  name: string;
  color: string;
}

/** "live": declared by a source that feeds the brain. "extends": a piece of the data registry, read on demand. */
export type ToolLevel = "live" | "extends";
/** Which side of the brain: what feeds it, or what uses it. */
export type ToolSide = "feeds" | "uses";
/** "source": it feeds the brain. "base": the brain reads it on demand. */
export type ToolRole = "source" | "base";

/** One connection of a tool that the plugin's health check found broken. */
export interface ToolProblem {
  /** The key of the connection in the health check ("source:<name>", "data:<scheme>", "data:<scheme>/<project>"): what POST /api/health takes. */
  key: string;
  label: string;
  reason: string;
  since: string;
}

export interface Tool {
  /** As declared; "folders" and "folder-<slug>" for the folders the sources collect from; "<scheme>-<project>" for one database of a registry entry. */
  id: string;
  name: string;
  family: string;
  level: ToolLevel;
  side: ToolSide;
  /** Data comes in from it. */
  in: boolean;
  /** Data goes out to it. */
  out: boolean;
  /** Where its catalogue entries sit on the map, as its declaration says (the plugin's keys). */
  targets: Record<string, string>[];
  /** The first one makes its sector. */
  roles: ToolRole[];
  sector: ToolRole;
  /** What it is for (as declared; worded for the built-in tools and the folders). */
  role: string;
  /** How the brain reaches it (as declared, or worded). */
  access: string;
  /** What happens with it today (as declared, or worded from its sources). */
  today: string;
  idea?: string;
  /** The addresses it serves ("pennylane://", "neon://<project>/"). */
  prefixes?: string[];
  /** The ids of the tools gathered under this one. */
  children?: string[];
  parent?: string;
  /** Where it is on this computer: what POST /api/open opens, by position. */
  paths?: string[];
  /** For a folder: the addresses collected from. */
  addresses?: string[];
  /** Where to open it in a browser. */
  link?: string;
  problems?: ToolProblem[];
  /** Everything that ties it to the brain is broken. */
  disconnected?: true;
}

/** GET /api/tools */
export interface ToolsResponse {
  families: Record<string, Family>;
  tools: Tool[];
}

/** A drawn logo (an SVG path and its colour), or an image served by GET /api/logo?id=. */
export type Logo = { path: string; hex: string } | { image: string; round: boolean };

/** GET /logos.json: tool id -> its logo. */
export type LogosResponse = Record<string, Logo>;

// ------------------------------------------------------------------ what a tool did

/** What the last run of a source did (the plugin's counts). */
export interface RunOutcome {
  created: number;
  updated: number;
  zones: number;
  entries: number;
  judged: number;
  report: string;
}

/** One source of a tool. */
export interface SourceDetail {
  name: string;
  description: string;
  /** When it runs, worded: one phrase per reason. */
  when: string[];
  /** The vault keys it needs, worded; "" when none. */
  key: string;
  /** What the source's own state says of its last run: the moment it STARTED (a run going on has already moved it). */
  lastRun: string | null;
  /** When its last finished run ended, from the journal of the week; null when none ended this week. */
  lastEnd: string | null;
  /** Since when a run is going on (the journal says it started, not that it ended); null otherwise. */
  runningSince: string | null;
  /** It needs a key and the vault is closed: it waits for the vault to be opened (never a judge). */
  waitsForVault: boolean;
  lastSuccess: string | null;
  lastError: string | null;
  outcome: RunOutcome | null;
  /** How many runs this week. */
  runs: number;
}

export interface ToolDetail {
  id: string;
  name: string;
  side: ToolSide;
  level: ToolLevel;
  role: string;
  access: string;
  sources: SourceDetail[];
  week: {
    /** How many writes this week. */
    writes: number;
    /** Kind of write (the journal's `what`) -> how many. */
    byKind: Record<string, number>;
    /** The slugs of the notes written. */
    notes: string[];
  };
  /** How many times its data was read on demand this week. */
  fetched: number;
  /** For Claude Code: how many reads of the brain this week. */
  readByClaude: number;
}

/** One note a run wrote. */
export interface WrittenNote {
  note: string;
  /** The kind of write, as the journal says it ("created", "updated", "fact"...). */
  what: string;
  at: string;
  /** The id of this write's event in the brain's journal: what POST /api/undo takes. Absent for a line of the journal that carries none. */
  id?: string;
  /** The note's title, when the index knows the note. */
  title?: string;
  /** Whether it can be taken back: a write of the machine (never an edit by hand), of a kind the plugin undoes, not taken back yet. */
  undoable: boolean;
  /** When it was taken back (an ISO date); null when it was not. */
  undone: string | null;
}

/** One run of a source, from the journal. */
export interface Run {
  source: string;
  start: string;
  /** Why it ran, as the journal says it. */
  why?: string;
  /** How many items it had to treat. */
  items?: number | null;
  /** The first twelve notes it wrote. */
  written: WrittenNote[];
  /** How many notes it wrote in all. */
  writtenCount: number;
  /** The next run began before this one ended. */
  interrupted?: true;
  end?: string;
  ok?: boolean;
  created?: number;
  updated?: number;
  zones?: number;
  entries?: number;
  contacts?: number;
  judged?: number;
  minutes?: number;
}

/** When a source runs next, for the ring around its tool. */
export interface NextRun {
  /** Since when it has been waiting (milliseconds). */
  start: number;
  /** When it runs (milliseconds); null when it waits for something else. */
  due: number | null;
  /** Why then, worded. */
  reason: string;
  /** The folders that moved, when that is the reason. */
  addresses?: string[] | null;
  paused?: true;
  /** A judge working through a backlog: its progress instead of a time. `total` is the size of THIS catch-up (the pile when it began, plus what arrived since), `done` what has left the pile since. */
  catchUp?: { done: number; total: number };
  /** A judge that holds its pile until the person answers (GET /api/judges says how much waits). */
  held?: true;
  /** A source of the tool waits for the vault to be opened: a small key is drawn beside the tool. */
  vault?: true;
  /** Those sources, by name (with `vault`). */
  vaultSources?: string[];
  /** The source this is about. */
  source: string;
}

/** GET /api/next: tool id -> the nearest next run of its sources. */
export type NextResponse = Record<string, NextRun>;

/** GET /api/tool?id= */
export type ToolResponse = (ToolDetail | ErrorResponse) & { history: Run[]; next: NextRun | null };

/** GET /api/history?id=: thirty days of runs, each write with what can still be done about it (`undoable`, `undone`). */
export interface HistoryResponse {
  name: string;
  runs: Run[];
}

/** GET /api/change?note=&at=: what one write changed in a note, from git. */
export type ChangeResponse =
  | {
      slug: string;
      /** The note's path inside the brain. */
      rel: string;
      /** Null when the change is not saved yet. */
      commit: string | null;
      when: string | null;
      /** The commit's subject, or a worded "not saved yet". */
      subject: string;
      diff: string;
    }
  | ErrorResponse;

// ------------------------------------------------------------------ settings

/** A source and its rhythm. */
export interface SourceSettings {
  name: string;
  /** The ids of the tools it reads. */
  tools: string[];
  paused: boolean;
  /** "30m", "hour", "day", "week" (the plugin's values; "15m" for a source set so before the clock beat at the half hour). */
  every: string;
  /** The values `every` may take for this source (its own first, when it is no longer offered). */
  choices: string[];
  description: string;
  /** `every`, worded; "" when it is none of the known ones. */
  rhythm: string;
}

/** A judge (a live source read by an AI) and its settings, with where it stands today. */
export interface JudgeSettings extends JudgeState {
  name: string;
  tools: string[];
  paused: boolean;
  model: string;
  /** How many items per run. */
  batch: number;
  /** Its working hours: [from, to]. */
  hours: [number, number];
  /** What it never reads (its `exclude`): the patterns as the person wrote them. */
  exclude: string[];
}

/** GET /api/settings */
export interface SettingsResponse {
  sources: SourceSettings[];
  judges: JudgeSettings[];
  /** The models a judge may use (the plugin's list). */
  models: string[];
}

/**
 * POST /api/settings, in the query: `source`, and one of
 *   - `paused` ("1" or "0"): pause or resume a source or a judge;
 *   - `every`: the rhythm of a source;
 *   - `model`, `batch`, `from` and `to` (hours, both or neither), `dailyTokens`
 *     (its cap per day, in tokens; "0" for none): a judge.
 */
export interface SettingsQuery {
  source: string;
  paused?: "1" | "0";
  every?: string;
  model?: string;
  batch?: string;
  from?: string;
  to?: string;
  dailyTokens?: string;
}

/**
 * What POST /api/settings answers. `paused` only after a pause or a resume;
 * after a judge's setting, what was really kept (`model`, `batch`, `hours`: a
 * batch out of bounds is brought back inside them), for the page to show it.
 * A refusal is worded.
 */
export type SettingsSaved = { ok: true; paused?: boolean; model?: string; batch?: number; hours?: [number, number] } | { ok: false; error: string };

// ------------------------------------------------------------------ effects (POST only)

/** POST /api/suggest: the body (JSON). The plugin's hook is the caller. */
export interface SuggestBody {
  prompt: string;
  /** The slugs already suggested in this conversation. */
  seen?: string[];
}

/** What the plugin's engine answers, with its rendering in `text`. */
export type SuggestResponse = (Record<string, unknown> & { text: string }) | ErrorResponse;

/** POST /api/fetch?address=: the data at an address, as the plugin reads it. */
export type FetchResponse = Record<string, unknown> | ErrorResponse;

/**
 * GET /api/note?slug=: a note as the plugin's engine gives it (slug, title,
 * type, domains, status, body, links, backlinks...). `stale: true` when the
 * index is behind this note: the page then asks for it to be brought up to
 * date (POST /api/index/refresh; a reading starts nothing by itself).
 */
export type NoteResponse = (Record<string, unknown> & { stale?: true }) | ErrorResponse;

/** POST /api/index/refresh: the index is brought up to date apart, by a program of its own (one at a time). */
export interface RefreshResponse {
  ok: true;
}

/** POST /api/open-note?slug=: shows a note's file in the file manager (its path comes from the index, never from the request). */
export type OpenNoteResponse = OpenResponse;

/**
 * POST /api/validate?note=<slug>&to=trusted|seed: the person validates a note
 * the machine wrote (or puts it back as a seed). The plugin does it
 * (scripts/promote.mjs): the write is journaled and can be undone like the
 * others. A refusal carries a code (as for the judges: "not-available" when
 * the plugin installed has no such script yet, "no-answer", "invalid", and
 * "refused" with the plugin's own words in `error`).
 */
export type ValidateResponse =
  | {
      ok: true;
      note: string;
      /** The status the note now has. */
      status: "trusted" | "seed";
      /** The id of the write's event in the journal ("" when the plugin did not say). */
      event: string;
    }
  | { ok: false; code: "invalid" | "not-available" | "no-answer" | "refused"; error: string };

/** The body of POST /api/validate for several notes at once (content-type application/json): 300 at most. */
export interface ValidateBatchBody {
  notes: string[];
}

/**
 * POST /api/validate with a ValidateBatchBody: the seeds the filters leave,
 * validated by the person in one go (scripts/promote.mjs --notes). `done`: now
 * trusted; `unchanged`: they already were; `refused`: each with the plugin's
 * own words. A refusal of the whole request carries a code, as for one note.
 */
export type ValidateBatchResponse =
  | { ok: true; done: string[]; unchanged: string[]; refused: { note: string; error: string }[] }
  | { ok: false; code: "invalid" | "not-available" | "no-answer" | "refused"; error: string };

/** POST /api/health?key=&action=: "check" a connection again, or "remove" it. Answers what the plugin's health check says. */
export type HealthAction = "check" | "remove";
export type HealthResponse = Record<string, unknown> | { ok: false; error: string };

/** POST /api/open?id=&index=: shows a tool's folder in the file manager. */
export interface OpenResponse {
  ok: boolean;
}

/** POST /api/now?id=: the sources of a tool run at the hub's next beat. */
export interface NowResponse {
  ok: boolean;
  /** The sources that were asked to run. */
  sources: string[];
}

/**
 * Why a write was not taken back. A stable code, from the server's own checks
 * and from what the plugin's undo.mjs refuses (it words its refusals in
 * English free text; the server maps the ones it knows):
 *   - "unknown": no write with this id in the brain's journal;
 *   - "by-hand": an edit by hand, the person's own;
 *   - "not-undoable": a kind of write the plugin does not take back;
 *   - "already-undone": taken back already;
 *   - "gone": the note no longer exists;
 *   - "changed-since": the fact, or the lines of the change, were changed since;
 *   - "not-saved": the write (or the note to remove) is not in git yet;
 *   - "nothing-left": the save that carried the write holds no change of the note;
 *   - "no-answer": the plugin's script did not answer (or took too long);
 *   - "other": a refusal of the plugin the server does not know: read `error`.
 */
export type UndoCode = "unknown" | "by-hand" | "not-undoable" | "already-undone" | "gone" | "changed-since" | "not-saved" | "nothing-left" | "no-answer" | "other";

/**
 * POST /api/undo?id=<the id of a write's event>: takes back one write of the
 * machine (the plugin's undo.mjs). A refusal carries its code and `error`,
 * the plugin's own words (English, not worded): the page words the code, and
 * shows `error` only for a code it does not know.
 */
export type UndoResponse =
  | {
      ok: true;
      /** The id of the write taken back. */
      id: string;
      note: string;
      /** The kind of write it was ("fact", "created", "updated"...). */
      what: string;
      /** When it was taken back. */
      at: string;
    }
  | { ok: false; code: UndoCode; error: string };

// ------------------------------------------------------------------ the judges

/** A judge that holds its pile: more arrived at once than it reads without asking (the plugin's judge/<name>.hold). */
export interface JudgeHold {
  /** Since when it waits (an ISO date; "" when the plugin did not say). */
  at: string;
  /** How many items wait. */
  items: number;
  /** About how many tokens reading them all would take; 0 when the plugin did not say. */
  estimate: number;
}

/** Where a judge stands today. */
export interface JudgeState {
  /** Its cap per local day, in tokens (the judge's `dailyTokens`); 0 for none. */
  dailyTokens: number;
  /** What its runs of the local day used, as the cap counts it: in + out + cacheRead + cacheWrite. */
  spentToday: number;
  /** It reached its cap: it runs again tomorrow. */
  capped: boolean;
  /** It waits for the person's answer (POST /api/catch-up); null otherwise. */
  held: JudgeHold | null;
  /** How many items wait in its pile. */
  waiting: number;
}

/** One run of a judge, from the brain's journal. */
export interface JudgeRun {
  /** When it ended. */
  at: string;
  ok: boolean;
  /** How many items it judged. */
  judged: number;
  minutes: number;
  model: string;
  turns: number | null;
  /** Whether the journal carries the tokens of this run (not before 10 November 2026, nor for a run that failed before Claude answered). */
  counted: boolean;
  /** The tokens read for the first time or written: in + out + cacheWrite. */
  fresh: number;
  /** The tokens read again from the cache, the context taken up at each turn: cacheRead. */
  reread: number;
  /** What the same tokens would cost by the API, in dollars (an order of size: nothing is billed under a subscription); null when the journal does not say. */
  apiUsd: number | null;
  /** How many writes it made in the brain. */
  writes: number;
}

/** A judge and what it cost. */
export interface JudgeCost extends JudgeState {
  name: string;
  /** The ids of the tools it reads. */
  tools: string[];
  paused: boolean;
  /** The model its source.json names ("" for the plugin's default). */
  model: string;
  /** No longer declared by the brain: only its past runs are known. */
  removed?: true;
  /** Its runs, oldest first. */
  runs: JudgeRun[];
}

/**
 * GET /api/setup: what this brain still lacks, for the empty states of the
 * page (a brain just created has no source, no judge, and its hub is off).
 */
export interface SetupResponse {
  /** The sources the brain declares, judges aside. */
  sources: number;
  /** Its judges (the live sources read by an AI). */
  judges: number;
  /** The plugin's hub: the program that runs the sources during the day. */
  hub: {
    /** The person turned it on (it starts with their session). */
    on: boolean;
    /** It runs right now. */
    running: boolean;
    /** Something this brain declares only runs through it (a judge, a rhythm shorter than the evening, a source that follows another). */
    needed: boolean;
    /** This computer is the one that runs the brain's sources (false on the second computer of a brain that lives on two). */
    here: boolean;
  };
  /** The judges whose last run stopped because Claude's lasting token was not found. */
  noToken: string[];
}

/**
 * The progress of one block of the knowledge, as the plugin's start.mjs
 * measures it: its total counted first (null while nothing counted it), then
 * what is in, what is left, and the notes it added (null where that is not
 * measured: the contacts, a block agreed before 2026-11-23).
 */
export interface StartProgress {
  total: number | null;
  done: number;
  left: number;
  notes: number | null;
  /** What is counted: files, conversations, documents, months. */
  unit: string;
  counted?: boolean;
  /** Lines of the writings that no program can count from here (a website). */
  uncounted?: number;
  /** What this block does not measure, or lines ticked before the ledgers existed. */
  unmeasured?: string[] | number;
  people?: number;
}

/** One block of the knowledge, in the panel of the building. */
export interface StartBlock {
  id: string;
  /** done, todo, running, later, never, na, waiting */
  state: string;
  progress?: StartProgress;
}

/**
 * GET /api/start: where the building of the brain stands while /brain:start
 * goes on (the plugin's start.mjs state, trimmed). `underway` false: no start
 * was begun on this computer, it is finished, or it has not served lately (nothing
 * done in it for seven days, and a brain older than fourteen); the panel is not shown.
 */
export interface StartResponse {
  ok: boolean;
  underway: boolean;
  /** The part where the next thing to do lies: preflight, computer, container, tools, knowledge, executive, life. */
  part: string | null;
  /** The step or the block to do next. */
  next: string | null;
  parts: { id: string; state: string }[];
  blocks: StartBlock[];
  /** What the start was doing when it last wrote it, in the person's language. */
  doing: string | null;
  /** A pause the person asked for, with their words. */
  paused: { at: string; note?: string } | null;
  /** When this start began on this computer: the page hides the panel of this start only, when the person asks. */
  began: string | null;
  error?: string;
}

/** GET /api/judges?since=<ISO date>: every judge with where it stands today, and its runs (all of them, or since a date). */
export interface JudgesResponse {
  judges: JudgeCost[];
}

/**
 * Why something asked to a judge was not done. A stable code:
 *   - "unknown-judge": the brain declares no judge of that name;
 *   - "invalid": the request itself is wrong (an empty pattern, an answer that is none of the three);
 *   - "not-held": the judge is not waiting for an answer (any more);
 *   - "not-available": the plugin installed does not know this command yet;
 *   - "no-answer": the plugin's script did not answer (or took too long);
 *   - "refused": the plugin refused: read `error`, its own words (English).
 */
export type JudgeCode = "unknown-judge" | "invalid" | "not-held" | "not-available" | "no-answer" | "refused";
export type JudgeRefusal = { ok: false; code: JudgeCode; error: string };

/**
 * POST /api/exclude?source=<judge>&add=<pattern> (or &remove=<pattern>): what
 * a judge never reads (the plugin's `sources.mjs exclude`). A pattern without
 * a slash is a folder or file name anywhere in a path (`*` allowed); with a
 * slash, the start of a path or of an address.
 */
export type ExcludeResponse =
  | {
      ok: true;
      /** The whole list, after the change. */
      exclude: string[];
      /** How many waiting items left the judge's pile because of it. */
      removed: number;
    }
  | JudgeRefusal;

/** What the person answers to a judge that holds its pile: read everything, only the most recent ones, or none. */
export type CatchUpAnswer = "all" | "latest" | "drop";

/** POST /api/catch-up?source=<judge>&answer=<CatchUpAnswer>&n=<how many, with "latest">: the plugin's `judge.mjs catch-up`. */
export type CatchUpResponse =
  | {
      ok: true;
      /** How many items stay to be read. */
      kept: number;
      /** How many left the pile. */
      dropped: number;
    }
  | JudgeRefusal;

// ------------------------------------------------------------------ usage

/**
 * GET /api/usage?since=: the lines of the plugin's usage journal (its own
 * keys: at, client, conv, who, tool, what, in, out, tokIn, tokOut, ms, ok...).
 * `inferred` marks a `who` the server worked out for a line of before the
 * plugin signed them.
 */
export type UsageLine = Record<string, any> & { at: string; who?: string; inferred?: true };
export type UsageResponse = UsageLine[];

// ------------------------------------------------------------------ the stream

/** One note read by an AI. */
export interface ReadEvent {
  at: string;
  /** The brain tool that read ("brain_get", "brain_search"...). */
  tool: string;
  slug: string;
  client: string;
  /** The conversation: a Claude Code session id, "pid-<n>", or "". */
  conv: string;
  /** Its title: the conversation's own, else worded. */
  convTitle: string;
}

/** One note that has just been written in the vault. */
export interface WriteEvent {
  at: string;
  slug: string;
  title: string;
  type: string;
  domains: string[];
  /** The id of the tool that wrote it; "" when nobody announced it. */
  tool: string;
  /** Never seen before by this server. */
  isNew: boolean;
}

/** The end of an answer of Claude, in one conversation. */
export interface TurnEnd {
  session: string;
  at: string;
}

/** A source starting or ending a run: the flow to light up between its tools and the brain. */
export type RunSignal =
  | {
      at: string;
      source: string;
      tools: string[];
      state: "start";
      /** What the source does, as its declaration says. */
      description: string;
      /** Why it runs, as the journal says it. */
      why: string;
      items: number | null;
      /** For a judge: the titles of what it is reading (eight at most). */
      titles: string[];
    }
  | {
      at: string;
      source: string;
      tools: string[];
      state: "end";
      ok: boolean;
      judged?: number;
    };

/**
 * GET /api/stream (Server-Sent Events): the name of each event and its data.
 * On connection the server sends `reads`, `writes` (the last two minutes),
 * `turns` (the last two hours) and `version`.
 */
/** A skill the AI starts using (scripts/hook-skill.mjs, 2026-11-23): "devis", "brain:capture"... */
export interface SkillUse { at: string; session: string; skill: string; /** The title of its conversation, when its transcript is found. */ convTitle?: string }

export interface StreamEvents {
  skills: SkillUse[];
  reads: ReadEvent[];
  writes: WriteEvent[];
  turns: TurnEnd[];
  runs: RunSignal[];
  /** Who serves the page: a page that sees it change reloads. */
  version: { server: string };
  /** The page's code changed. */
  reload: Stamp;
  /** The tools changed: read GET /api/tools again. */
  tools: Stamp;
  /** The map changed: read GET /api/map again. */
  map: Stamp;
  /** A territory was named: read GET /api/territories again. */
  territories: Stamp;
  /** A write was taken back (POST /api/undo): its id, its note, and when. */
  undone: { id: string; note: string; at: string };
  /** A judge's state changed (held, capped, answered, a cap set): read GET /api/judges again. */
  judges: Stamp;
}
