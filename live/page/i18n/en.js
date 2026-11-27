// i18n/en.js: every text the page words itself, in English.
//
// English is the reference: a key missing from another language falls back
// to this one (i18n.js). A text that takes values or a plural is a function.
// A key ending in "Html" returns markup: it is placed as HTML, and the values
// it receives are already escaped by the caller. The texts of the legend
// (legend...Text) carry a few tags of ours (<b>, <kbd>, a button-like span).

import { locale, number } from "../lang.js";

/** "3 notes", "1 note": the number as it is, then the word in the singular or the plural. */
const count = (n, one, many = `${one}s`) => `${n} ${Number(n) === 1 ? one : many}`;
/** The same, with the number written the English way ("12,345 calls"). */
const countOf = (n, one, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;

/** The words of the usual types of notes, by id: singular, plural. */
const TYPE_WORDS = {
  concept: ["concept", "concepts"], talk: ["talk", "talks"], publication: ["publication", "publications"],
  organization: ["organization", "organizations"], source: ["source", "sources"], note: ["note", "notes"],
  project: ["project", "projects"], person: ["person", "contacts"], intervention: ["engagement", "engagements"],
  event: ["event", "events"], idea: ["idea", "ideas"], book: ["book", "books"], work: ["work", "works"],
  domain: ["domain", "domains"],
};
const NATURES = { decision: "decision", feedback: "feedback", lesson: "lesson", retour: "feedback", lecon: "lesson" };
// The degree of trust of a note, in the words of the notes' format.
const STATUSES = { seed: "seed", trusted: "trusted", archived: "archived", graine: "seed", fiable: "trusted", archive: "archived" };
const SECTORS = { source: "Sources", base: "Data" };
const ROLES = { source: "feeds the brain", base: "read on demand by the brain" };
const GESTURES = { brain_get: "open", brain_search: "search", brain_neighbors: "neighbours", brain_fetch: "data" };
const BRAIN_TOOLS = { "(connection)": "Connection", "(suggestion)": "Suggestion on each message", brain_search: "Search", brain_get: "Reading a note", brain_fetch: "Reading data", brain_neighbors: "Neighbours", brain_timeline: "Timeline", brain_contact: "Contacts", brain_stats: "State of the brain" };
const SEARCH_MODES = { both: "words + meaning", words: "words", meaning: "meaning" };
const RHYTHMS = { "15m": "every 15 minutes", "30m": "every 30 minutes", hour: "every hour", day: "every evening", week: "every week" };
const MODEL_NOTES = {
  haiku: "economical: several times lighter, a rougher judgement",
  sonnet: "the default: a fine judgement, a medium cost",
  opus: "the finest, the heaviest",
};
const PERIODS = { 1: "today", 7: "over the last 7 days", 30: "over the last 30 days", 0: "since the journal began" };
const PERIODS_BEFORE = { 1: "yesterday at the same time", 7: "the 7 days before", 30: "the 30 days before" };
const WRITE_KINDS = { created: ["note created", "notes created"], fact: ["fact added", "facts added"], zone: ["zone updated", "zones updated"], updated: ["note refreshed", "notes refreshed"], deleted: ["note deleted", "notes deleted"], edited: ["edit", "edits"] };
const WRITE_WORDS = { created: "created", fact: "fact", zone: "zone", updated: "refreshed", edited: "edited", rewritten: "rewritten", condensed: "condensed" };
// What undoing a write does, by kind (the journal's `what`): a fact, a note
// the machine created, and under "change" every write that changed a note.
const UNDO_TIPS = {
  fact: "Takes this fact out of the note. The rest of the note stays as it is.",
  created: "Removes the note the machine created. It stays in the history of saves.",
  change: "Reverses this change: the lines it changed get back the text they had before. If they were changed again since, nothing is touched.",
};
// Why a write was not taken back, by the server's code (contract.d.ts, UndoCode).
const UNDO_REFUSALS = {
  "already-undone": "This write had already been undone.",
  "changed-since": "The note has changed at that place since: nothing was touched. To take this write back, the note has to be edited by hand.",
  "by-hand": "This is an edit made by hand: it is not undone here.",
  gone: "The note no longer exists: there is nothing left to undo.",
  unknown: "This write cannot be found in the brain's journal.",
  "not-saved": "This write is not saved yet. You can undo it after the next save.",
  "nothing-left": "Nothing of this write is left in the note: there is nothing to undo.",
  "not-undoable": "This kind of write cannot be undone here.",
  "no-answer": "The brain did not answer. Reload the page in a moment to see where this write stands.",
};
// Why something asked to a judge was not done, by the server's code
// (contract.d.ts, JudgeCode). "refused" has no text here: the plugin's own
// words are shown.
const JUDGE_REFUSALS = {
  "not-available": "Your brain's plugin cannot do this yet: update it, then try again.",
  "no-answer": "The brain did not answer. Try again in a moment.",
  "not-held": "This judge is no longer waiting for an answer.",
  "unknown-judge": "This judge no longer exists in the brain.",
  invalid: "This cannot be asked that way.",
};
// What waits in the pile of a judge, by the judge's name (the plugin's two
// standard judges); "items" for any other.
const HELD_NOUNS = { conversations: ["conversation", "conversations"], documents: ["document", "documents"] };
const heldNoun = (name) => /** @type {Record<string, string[] | undefined>} */ (HELD_NOUNS)[name] ?? ["item", "items"];

/** A number with one decimal at most ("3.2"). */
const decimal = (n) => n.toLocaleString(locale(), { maximumFractionDigits: 1 });
/** A number of tokens in round words, without the word: "6 million", "3.2 million", "850,000". */
const amount = (n) => (n >= 1e6 ? `${n >= 1e7 ? number(n / 1e6) : decimal(Math.round(n / 1e5) / 10)} million` : number(n >= 10_000 ? Math.round(n / 1000) * 1000 : n));
/** The same, with the word: "6 million tokens", "1 token", "no tokens". */
const tokensWords = (n) => (n ? `${amount(n)} ${Math.round(n) === 1 ? "token" : "tokens"}` : "no tokens");
/** What a judge holds, in a few words: "42 conversations, about 6 million tokens". */
const heldWhat = (name, items, estimate) => `${countOf(items, ...heldNoun(name))}${estimate ? `, about ${tokensWords(estimate)}` : ""}`;

const en = {
  // ---- the page
  /** The name of the window (the server's dictionaries have the same one). */
  appName: "Second Brain",
  loading: "The brain is waking up",
  loadFailed: "The brain does not answer. Trying again in a few seconds.",
  /** The server refused this page for lack of its token (the cookie it gives with the page was not kept). */
  accessRefused: "This window was not given its access to the brain. Reload the page; if nothing changes, allow cookies for this address.",
  back: "← Back to the brain",
  backTip: "Back to the view of the brain (Esc)",
  close: "Close",
  cancel: "Cancel",
  confirm: "Confirm",
  validate: "OK",
  failed: "Failed",
  loadingShort: "Loading…",
  unreadable: "could not be read",
  /** A label and what it introduces. */
  colon: (label, text) => `${label}: ${text}`,
  percent: (n) => `${n}%`,

  // ---- the words of the brain
  /** The singular and the plural of a usual type of note; nothing for another type. */
  typeWords: (id) => /** @type {Record<string, string[] | undefined>} */ (TYPE_WORDS)[id],
  /** The sub-bubble of the types too small to have their own. */
  miscTypes: "other",
  /** A territory without a name: what it mostly holds. */
  variousOf: (plural) => `Various ${plural}`,
  otherDomain: "Other",
  natureName: (id) => /** @type {Record<string, string | undefined>} */ (NATURES)[id] ?? id,
  statusName: (id) => /** @type {Record<string, string | undefined>} */ (STATUSES)[id] ?? id,
  sectorName: (role) => /** @type {Record<string, string | undefined>} */ (SECTORS)[role] ?? role,
  roleSentence: (role) => /** @type {Record<string, string | undefined>} */ (ROLES)[role] ?? role,
  /** What a brain tool did to a note, in one word; nothing for a tool without a word. */
  gesture: (tool) => /** @type {Record<string, string | undefined>} */ (GESTURES)[tool],
  unknownConversation: "Unknown conversation",
  /**
   * A database's name without the word the server added around it ("X
   * database", i18n/en.mjs `databaseName`), for the small circles of an
   * unfolded tool and the list of its databases.
   */
  shortDatabaseName: (name) => String(name).replace(/ database$/, ""),

  // ---- why a source ran (the journal's `why`)
  whyTime: "its time has come",
  whyVault: "the vault has just opened, it was waiting for a key",
  whyNow: "refreshed by hand",
  whyFile: (path) => `a file moved: ${path}`,
  whyFilesMoved: "files moved while the hub was stopped",
  whySkill: (name) => `after the /${name} skill`,
  whySource: (name) => `after the ${name} source`,

  // ---- durations and dates
  seconds: (n) => `${n} s`,
  minutes: (n) => `${n} min`,
  minutesSeconds: (minutes, seconds) => `${minutes} min ${seconds}`,
  never: "never",
  today: "today",
  todayAt: (time) => `today at ${time}`,
  inLessThanAMinute: "in less than a minute",
  inMinutes: (minutes) => `in ${minutes} min`,
  inHours: (hours, minutes) => `in ${hours} h ${minutes}`,
  onDayAt: (weekday, time) => `on ${weekday} at ${time}`,
  hour: (h) => `${h}:00`,
  hourRange: (h) => `from ${h}:00 to ${h + 1}:00`,
  hourBetween: (h) => `between ${h}:00 and ${h + 1}:00`,

  // ---- what the pointer is over, on the map
  clickToRename: "Click to rename",
  contactWord: "contact",
  inCatalogue: "in the catalogue",
  directoryWord: "directory",
  pathFollowed: "Followed link: the next note is linked to the one before",
  pathJump: "Jump: no link between the two notes",

  // ---- a source at work (the box over its tool)
  activitySourceHtml: (name, description) => `Source <b>${name}</b>${description ? `: ${description}` : ""}`,
  activityWhy: (why) => `Why: ${why}`,
  activityReads: (n) => `Reading ${count(n, "item")}`,
  activityReadsList: (n) => `Reading ${count(n, "item")}:`,
  activityFailed: "Ended in failure",
  activityDone: (judged) => `Done${judged !== undefined ? `, ${judged} judged` : ""}`,
  activityRunning: (name, time) => `${name} running for ${time}`,
  activityFinished: (name, time) => `${name} finished (${time})`,
  activityNothing: "Something has just come into the brain.",

  // ---- the territories of the Semantic view
  renameTerritoryTitle: "Rename this territory",
  renameTerritoryText: "Your name replaces the one the AI proposed, and the brain no longer touches it. Leave the field empty to go back to the proposed name.",
  renameTerritoryPlaceholder: "The proposed name",
  rename: "Rename",
  /** Why a territory's name was not kept (the server's codes "unknown", and no answer). */
  territoryGone: "This territory no longer exists: the territories were cut again since. The name was not saved.",
  renameNotSaved: "The name was not saved. Try again in a moment.",
  redoTerritories: "Redo the territories",
  redoTerritoriesTitle: "Redo the territories?",
  redoTerritoriesText: [
    "The brain cuts its territories again, from what all its notes mean today.",
    "A new territory very close to a former one keeps its name, including the one you gave it. A territory that changed too much gets a new name: if you had named it, that name is lost.",
  ],
  redo: "Redo",
  cutting: "Cutting…",

  // ---- the views and the filters
  viewDomains: "Domains",
  viewDomainsTip: "One bubble per domain, one per type of note",
  viewSemantic: "Semantic",
  viewSemanticTip: "Territories of meaning",
  viewExecutive: "Executive",
  viewExecutiveTip: "The executive floor: your skills and the guards that frame them",
  floorsReset: "Reset the turn",
  floorsPadTip: "Drag in the circle: across to turn, up and down to tilt. Shift + drag on the map does the same",
  execRead: "Read the skill",
  execFloorForward: "Click to bring this floor forward",
  execFloorBoth: "Click to see both floors again",
  execFloorTools: "Tools",
  floorsToolsFloor: "The tools have a floor of their own, under the knowledge. Click to set them on each floor",
  floorsToolsRings: "The tools stand on each floor. Click to give them a floor of their own",
  execHook: "Hook",
  execHookWhen_PreToolUse: "Run before each call of a tool it aims at: it may let it through, ask or refuse.",
  execHookWhen_PostToolUse: "Run after a call of a tool it aims at.",
  execHookWhen_UserPromptSubmit: "Run at each message you send, before the AI reads it.",
  execHookWhen_Stop: "Run at the end of each answer of the AI.",
  execHookWhen_SessionStart: "Run when a session opens.",
  execWhen: "When it runs",
  execHookNoWords: "Its script does not say what it does.",
  execHookPluginWrite: "part of the plugin: it is changed in its repository",
  aConversation: "a conversation",
  skillStartedBy: (who) => `Skill started by “${who}”`,
  todaySkills: (n) => `${n} skill${n > 1 ? "s" : ""} started.`,
  execOwn: "my skills",
  execInPlugin: "Lives in the plugin",
  execTools: "Tools it names",
  execNoTool: "no tool of the ring",
  execPluginWrite: "part of the plugin: it is changed in its repository",
  execFloorUp: "Executive",
  execFloorDown: "Knowledge",
  execPersonalSkills: "My skills",
  execSkill: "Skill",
  execGuard: "Guard",
  execSkillHover: "A skill of the executive floor: click for its card",
  execGuardHover: "A guard of the executive floor: click for its card",
  execLivesIn: "Lives in the brain",
  execPlaced: "For Claude Code",
  execPlaced_linked: "placed: a link in ~/.claude/skills leads to the brain, it is called as before",
  execPlaced_missing: "not placed: Claude Code does not see it (executive.mjs place puts it back)",
  execPlaced_other: "another skill of the same name holds the place, left as it is",
  execWrite: "Writing",
  execSkillWrite: "the AI may improve it, like a note",
  execGuardWrite: "locked: the AI can neither change nor move it, only you change it",
  execWired: "Wired on",
  execOnTools: "for the tools",
  execNotWired: "not wired",
  execInFront: "In front of the tool",
  filters: "Filters",
  filtersToggleTip: "Open or close the filters",
  layers: "Layers",
  layerTools: "Sources and data",
  layerToolsTip: "The ring around the brain: its sources (what feeds it) and its data (what it reads on demand), with the live flows",
  layerCatalogue: "Catalogue",
  layerCatalogueTip: "What the brain can find again without keeping a note of it: posts, events, records kept in another tool",
  layerContacts: "Contacts",
  layerHarnesses: "Harnesses",
  layerHarnessesTip: "Your skills and your plugins, as a crown around the tools: each harness is an arc, turned towards the tools it uses",
  layerContactsTip: "The directory: each contact near the notes that mention it, else around the brain, in clusters by organization",
  filter: "Filter",
  written: "Written or modified",
  writtenTip: "The notes written or modified since that moment: by a source, by the machine, by a capture or by hand. The rest fades.",
  periodLabel: "Period",
  periodAll: "All",
  periodHour: "1 h",
  periodToday: "Today",
  period7Short: "7 d",
  period30Short: "30 d",
  notesCount: (n) => count(n, "note"),
  /** Beside the period, when the notes written since could not be read. */
  writtenFailed: "could not be read",
  seeds: "Only seeds",
  seedsTip: "The notes the machine wrote that you have not validated yet. The rest fades. Open one to validate it (V), then go to the next (N).",
  memory: "AI memory",
  memoryTip: "What the AI learned while working with you: the lessons and the memory notes. The rest fades.",
  decisions: "Decisions",
  decisionsTip: "What you settled: a price, a rule, something you gave up. The rest fades.",
  importance: "Importance",
  importanceTip: "Each dot shines according to its weight: its links, what it is (a decision or a lesson weighs more) and how much the AIs read it. What matters most stands out.",
  legend: "Legend",
  legendTip: "What each element of the map stands for",
  searchLabel: "Search for a note",
  searchPlaceholder: "Search for a note (/)",
  index: "Index",
  indexTip: "Index: the whole brain as a list, notes, catalogue and contacts",
  install: "Install the app",
  installTip: "Install Second Brain as an app: its icon stays its own, even pinned to the taskbar",
  settingsTip: "Settings of the brain",
  recenter: "Recentre the brain",

  // ---- the card of a note
  readingNote: "Reading the note…",
  noteUnreadable: "The note could not be read: the brain's server does not answer.",
  noteCreated: (created, updated) => `Created on ${created}${updated ? `, edited on ${updated}` : ""}`,
  seedTag: "Seed: written by the machine, not validated yet",
  // ---- validating a note (the person says a note of the machine is right)
  validateNote: "Validate",
  validateNoteTip: "Say this note is right: it is no longer a seed (V)",
  validatedTag: "Validated",
  backToSeed: "Back to seed",
  nextSeed: "Next seed",
  nextSeedTip: "Open the seed the other notes link to the most, among those left (N)",
  noSeedLeft: "No seed is left to validate.",
  validateRefused: "The brain refused to change this note.",
  validateNoServer: "The brain's server does not answer: the note was not changed.",
  validateNotAvailable: "The plugin installed cannot validate a note yet: update it.",
  openNoteFile: "Open the file",
  displayTitle: "Display",
  // The switch of the design, under Display (theme.js, 2026-11-23).
  designTitle: "Design",
  designLabel: "Design of the page",
  designNight: "Night",
  designNightTip: "The view's own design: night blue, made to watch the brain live",
  designHypervibe: "Hypervibe",
  designHypervibeTip: "The design system of Hypervibe on its own night, a warm black: cream text, the colours of its rainbow, its icons and its own fonts. The page remembers the choice.",
  justNow: "just now",
  secondsAgo: (n) => `${n} s ago`,
  minutesAgo: (n) => `${n} min ago`,
  liveMark_opened: (who, when) => (who ? `Opened by the conversation “${who}”, ${when}` : `Opened by an AI, ${when}`),
  liveMark_found: (who, when) => (who ? `Found by a search of the conversation “${who}”, ${when}` : `Found by a search, ${when}`),
  liveMark_written: (who, when) => (who ? `Written by ${who}, ${when}` : `Written ${when}`),
  noteFileOpened: "Opened in the file manager",
  noteFileNotFound: "File not found on this computer",
  dataElsewhere: "The data lives elsewhere",
  noteSource: (source) => `Source: ${source}`,
  linkedNotes: (n) => `Linked notes (${n})`,

  // ---- the card of a catalogue entry, of a contact
  entryAddressHtml: (address) => `Address: ${address}`,
  entryLivesIn: (tool) => `The brain can find this data again without keeping it: it lives in ${tool}.`,
  readingData: "Reading the data…",
  dataUnreadable: "The data could not be read: the brain's server does not answer.",
  dataReadIn: (tool) => `The data, read in ${tool}`,
  readingDirectory: "Reading the directory…",
  directoryUnreadable: "The directory could not be read: the brain's server does not answer.",
  contactSummary: "Summary",
  contactContext: "Context",
  contactRole: "Role",
  contactOrganisation: "Organization",
  contactExchanges: "Exchanges",
  contactTopics: "Subjects",
  exchanges: (sent, received, first, last) => `${sent} sent, ${received} received, from ${first} to ${last}`,

  // ---- the card of a tool
  refresh: "Refresh",
  refreshTip: "Run its sources right away, without waiting for their time, for their folder to be calm or for the judge's batch",
  catchingUp: (percent) => `Catching up (${percent}%)`,
  nextRunIn: (when) => `Next run ${when}`,
  waiting: "Waiting",
  openHost: (host) => `Open ${host} ↗`,
  openNamed: (path) => `Open ${path}`,
  openInExplorer: "Open in the file manager",
  itsFolders: "Its folders",
  itsDatabases: "Its databases",
  childDisconnected: "disconnected",
  childToCheck: "to check",
  whatLinksIt: "What links it to the brain",
  lastRun: (when) => `Last run: ${when}`,
  /** A run that started and has not ended: said before the last finished one. */
  runningSince: (time) => `A run has been going on since ${time}`,
  runsThisWeek: (n) => `${count(n, "run")} this week`,
  /** The sources of the tool that need a key while the vault is closed. */
  vaultWaiting: (sources) => `${sources.join(", ")} ${sources.length > 1 ? "are" : "is"} waiting for the vault to be opened`,
  waitsForVault: "waiting for the vault to be opened",
  disconnected: "Disconnected",
  whatIsWrong: "What is wrong",
  since: (when) => `since ${when}`,
  reconnect: "Reconnect",
  remove: "Remove",
  thisWeek: "This week",
  fetchedThisWeek: (n) => `Read on demand ${Number(n) === 1 ? "once" : `${n} times`} this week.`,
  notFetchedThisWeek: "Not read this week: the brain asks it when a conversation needs it.",
  readsByConversations: (n) => `${count(n, "read")} of the brain by the conversations this week.`,
  noReadsThisWeek: "No read of the brain this week.",
  writtenThisWeek: (kinds, notes) => `${kinds}, over ${count(notes, "note")}: they light up on the map.`,
  andWrittenThisWeek: (kinds, notes) => `And ${kinds}, over ${count(notes, "note")}: they light up on the map.`,
  nothingEntered: "Nothing new came into the brain this week.",
  howClaudeReaches: "How Claude reaches it",
  historyLink: "History ↗",
  launched: "Started…",
  leavesSoon: "Leaves within a minute",
  nothingToRun: "Nothing to run",
  openedInExplorer: "Opened in the file manager",
  folderNotFound: "Folder not found on this computer",
  removeConnectionTitle: "Remove this connection?",
  removeConnectionText: "The brain will no longer read it nor draw it. The removal is noted in the journal, and git keeps what is needed to go back.",
  removing: "Removing…",
  testing: "Testing…",
  removed: "Removed",
  stillDisconnected: "Still disconnected",
  reconnected: "Reconnected",

  // ---- the runs of a source (the tool's card, the history window)
  countCreated: (n) => `${count(n, "note")} created`,
  countUpdated: (n) => `${n} refreshed`,
  countZones: (n) => count(n, "zone"),
  countInCatalogue: (n) => `${n} in the catalogue`,
  countCatalogueEntries: (n) => count(n, "catalogue entry", "catalogue entries"),
  countContacts: (n) => count(n, "contact"),
  countJudged: (n) => `${n} judged`,
  countItemsJudged: (n) => `${count(n, "item")} judged`,
  /** How many writes of one kind (the journal's `what`): "3 notes created". */
  countByKind: (kind, n) => {
    const words = /** @type {Record<string, string[] | undefined>} */ (WRITE_KINDS)[kind];
    return `${n} ${words ? words[Number(n) === 1 ? 0 : 1] : kind}`;
  },
  /** One write of a kind, in a word: "created", "fact". */
  writeWord: (kind) => /** @type {Record<string, string | undefined>} */ (WRITE_WORDS)[kind] ?? kind,
  runInterrupted: "interrupted",
  runFailed: "failed",
  runRunning: "running",
  nothingNew: "nothing new",
  andOthers: (n) => `and ${count(n, "other")}`,

  // ---- the activity panel
  activityLabel: "Activity of the brain",
  activityTip: "The activity of the brain: what the AIs read and write in it, and what it costs",
  noneRead: "No note read in the last two minutes",
  readCount: (notes, conversations) => `${count(notes, "note")} read in the last two minutes, by ${count(conversations, "conversation")}`,
  lastActivity: "Latest activity",
  nothingYet: "Nothing for now.",
  todayTitle: "Today",
  openUsage: "See all the usage of the brain →",
  arrivedBy: (tool) => `Came in through ${tool}`,
  writeWithoutTool: "A write without a tool behind it",
  newNote: "new",
  updatedNote: "updated",
  todayCalls: (calls, conversations, tokens) => `${countOf(calls, "call")} to the brain, ${count(conversations, "conversation")}, about ${tokensWords(tokens)} read by the AIs.`,
  noCallsToday: "No call to the brain since midnight.",
  usageUnavailable: "Usage unavailable.",

  // ---- the usage page
  usageTitle: "Usage of the brain",
  usageHelp: "What using the brain costs: each time an AI asks it something, what it sends back, which the AI has to read. The tokens are estimated from the number of characters (about 3.5 per token): an order of magnitude, not a bill. The connection counts once per conversation the instructions and the description of the tools; the suggestions are the notes the brain proposes on each of your messages. The judge is the AI that reads in the background what arrives in the brain: its reads are kept apart from those of your conversations since 9 November 2026; before, they count with yours.",
  period7: "7 days",
  period30: "30 days",
  reload: "Refresh",
  reloadTip: "Read the journal again",
  answerUnreadable: "unreadable answer",
  usageUnreadable: (detail) => `Could not be read: ${detail}`,
  you: "Your conversations",
  judge: "The judge",
  youAndJudge: "You and the judge",
  nothingInPeriod: "Nothing over this period.",
  unitTokensRead: "tokens read",
  unitCalls: "calls",
  /** The tooltip of one column of a chart: the total, when, and each reader's part. */
  stackTip: (total, unit, when, you, judge) => `${number(total)} ${unit} · ${when}. Your conversations ${number(you)}, the judge ${number(judge)}.`,
  noCallsInPeriod: "No call to the brain over this period.",
  journalEmpty: "The journal is still empty: it fills up as soon as a conversation asks the brain something.",
  /** The period of the dashboard, in words (1, 7, 30 days; 0 for everything). */
  period: (days) => /** @type {Record<string, string>} */ (PERIODS)[days],
  periodBefore: (days) => /** @type {Record<string, string>} */ (PERIODS_BEFORE)[days],
  tokensRead: (period) => `Tokens read by the AI, ${period}`,
  usageDelta: (sign, percent, before) => `${sign} ${percent}% compared with ${before}`,
  noComparison: "No comparison: the journal does not cover the period before yet.",
  heroLabel: (you, judge) => `Your conversations ${number(you)} tokens, the judge ${number(judge)} tokens`,
  sharePerConversation: (percent, average) => `${percent}% · about ${number(average)} per conversation`,
  sharePerRun: (percent, average) => `${percent}% · about ${number(average)} per run`,
  kpiCalls: "Calls to the brain",
  kpiCallsNote: (conversations, runs) => `${countOf(conversations, "conversation")}, ${countOf(runs, "run")} of the judge`,
  kpiTokensPerCall: "Tokens per call",
  kpiTokensPerCallNote: "connection aside",
  kpiMedian: "Median duration",
  kpiMedianNote: "of a call",
  kpiMeaning: "Searches by meaning",
  kpiMeaningNote: (searches) => `out of ${countOf(searches, "search", "searches")}`,
  kpiSuggestions: "Suggestions",
  kpiSuggestionsNote: (tokens) => `${tokens} tokens read`,
  kpiConnection: "Connection",
  kpiConnectionNote: "tokens, once per conversation",
  kpiFailures: "Failures",
  kpiFailuresNote: "calls that did not go through",
  tokensPerDay: "Tokens read by the AI, per day",
  tokensByHour: "Tokens read by the AI, hour by hour",
  tokensByDay: "Tokens read by the AI, day by day",
  hoursTitle: "At what time the brain is called",
  hoursSubtitle: "calls, over the whole period",
  byTool: "By tool",
  sortedByTokens: "sorted by tokens read",
  heaviest: "The heaviest calls",
  heaviestTen: "the ten that made the AI read the most",
  heaviestCount: (n) => `the ${n} that made the AI read the most`,
  thTool: "Tool",
  thCalls: "Calls",
  thTokensReadHtml: "Tokens<br>read",
  thShare: "Share of the tokens",
  thPerCallHtml: "Per<br>call",
  thMedianHtml: "Median<br>duration",
  thWhen: "When",
  thObject: "Subject",
  thTime: "Time",
  thTokensRead: "Tokens read",
  thDuration: "Duration",
  toolShareTip: (tool, you, judge) => `${tool}: your conversations ${you}%, the judge ${judge}%`,
  brainToolName: (id) => /** @type {Record<string, string | undefined>} */ (BRAIN_TOOLS)[id] ?? id,
  searchMode: (id) => /** @type {Record<string, string | undefined>} */ (SEARCH_MODES)[id],
  searchModeCached: (mode) => `${mode}, already seen`,
  callLog: "Log of the calls",
  logFilterLabel: "Filter the log of the calls",
  logFilterPlaceholder: "Filter: a question, a tool, a note",
  whoRead: "Who read",
  allTools: "All the tools",
  callsInPeriod: (n) => `${countOf(n, "call")} over the period`,
  shownOfTotal: (shown, total) => `${number(shown)} out of ${number(total)}`,
  callsCount: (n) => countOf(n, "call"),
  judgeMarkHtml: (who) => `the judge${who ? ` (${who})` : ""}`,
  failedWord: "failed",
  showMore: "Show more",
  showMoreLeft: (left) => `Show more (${number(left)} left)`,

  // ---- what the judges cost (the usage page)
  judgesCost: "What the judges cost",
  judgesCostHelp: "A judge is an AI that reads in the background what arrives (conversations, documents, mail) and writes what matters into the brain. Each of its runs uses tokens, counted by Claude itself: the new ones (what it reads for the first time and what it writes) and the re-read ones (its context, read again at each step of a run, which weighs about ten times less). This covers the whole work of the judges: what the brain sends back to them, counted below, is only one part of it. The API equivalent is what the same tokens would cost paid one by one: an order of magnitude. Under a subscription, nothing is billed.",
  /** The two parts of a judge's tokens, in the key of the charts. */
  tokensNew: "new",
  tokensReread: "re-read",
  thJudge: "Judge",
  thRuns: "Runs",
  thJudgedHtml: "Items<br>judged",
  thTokens: "Tokens",
  thNewAndReread: "New and re-read",
  thPerItemHtml: "Tokens<br>per item",
  thNothingHtml: "Runs that<br>wrote nothing",
  thApiHtml: "API<br>equivalent",
  allJudges: "All the judges",
  /** Beside the name of a judge the brain no longer declares. */
  judgeRemoved: "removed",
  judgeRunsTip: (runs, failed) => `${countOf(runs, "run")}${failed ? `, ${number(failed)} of them failed` : ""}`,
  judgeTokensTip: (fresh, reread) => `${number(fresh)} new tokens: read for the first time, or written. ${number(reread)} re-read tokens: the context, read again at each step of a run.`,
  judgeNothingTip: (nothing, runs) => `${number(nothing)} of ${countOf(runs, "run")} wrote nothing in the brain.`,
  judgeApiTip: "What the same tokens would cost through the API. An order of magnitude: under a subscription, nothing is billed.",
  judgesNote: "The API equivalent is an order of magnitude: under a subscription, nothing is billed.",
  /** The runs whose tokens the journal does not carry. */
  judgesUncounted: (n) => `${countOf(n, "run")} without counted tokens (a failure, or a run from before 10 November 2026).`,
  judgeTokensByDay: "Tokens per day",
  judgeTokensByHour: "Tokens per hour",
  /** The tooltip of one column of a judge's chart; the three amounts come already written short. */
  judgeColumnTip: (when, total, fresh, reread, runs, judged) => `${when} · ${total} tokens (${fresh} new, ${reread} re-read) · ${countOf(runs, "run")}, ${countOf(judged, "item")} judged`,
  judgeToday: "Today",
  /** What a judge used today, against its cap or without one. */
  spentOfCap: (spent, cap) => `${amount(spent)} of ${tokensWords(cap)}`,
  spentNoCap: (spent) => `${tokensWords(spent)}, no cap`,
  capReached: "Cap reached, back tomorrow",
  heldWaiting: "Waiting for your answer",
  /** A number of tokens in round words: "6 million tokens". */
  tokensWords,

  // ---- a judge that holds its pile until the person answers (activity panel, settings, usage page)
  /** How much waits, and about how many tokens reading it all would take (0: not said). */
  heldLine: (name, items, estimate) => `${countOf(items, ...heldNoun(name))} ${items === 1 ? "is" : "are"} waiting${estimate ? `, about ${tokensWords(estimate)}` : ""}`,
  heldAsks: (name) => `The ${name} judge waits for your answer before reading.`,
  /** On the folded activity panel: one judge waits, or several. */
  heldShort: (name, items) => `${countOf(items, ...heldNoun(name))} ${items === 1 ? "waits" : "wait"} for your answer`,
  heldShortMany: (judges) => `${judges} judges wait for your answer`,
  heldAll: "Read everything",
  heldLatest: (name) => "The most recent",
  heldDrop: "Read none",
  heldAllTitle: "Read everything?",
  /** `cap`: the judge's cap per day, 0 for none. */
  heldAllText: (name, items, estimate, cap) => [
    `The judge will read everything that is waiting: ${heldWhat(name, items, estimate)}. It goes through it run after run, at its own pace.`,
    cap ? `Its cap of ${tokensWords(cap)} per day still holds: it stops when it reaches it and goes on the next day.` : "",
  ],
  heldLatestTitle: (name) => "Read the most recent",
  heldLatestText: (name) => `How many ${heldNoun(name)[1]} should the judge read, starting from the most recent? The others leave its pile: it will not read them.`,
  heldLatestYes: "Read them",
  heldDropTitle: "Read none?",
  heldDropText: (name, items, estimate) => `Everything that is waiting (${heldWhat(name, items, estimate)}) leaves the pile: the judge will not read it. What arrives afterwards will be read as usual.`,
  /** What was done, from the plugin's answer: how many stay to be read, how many left the pile. */
  heldDone: (answer, kept, dropped) =>
    answer === "all" ? "Noted: the judge will read everything."
    : answer === "drop" ? "Noted: the judge will read none of what was waiting."
    : `Noted: the judge will read ${number(kept)}, ${number(dropped)} left its pile.`,
  /** Why something asked to a judge was not done, for a code of the server; nothing for a code without a text. */
  judgeRefusal: (code) => /** @type {Record<string, string | undefined>} */ (JUDGE_REFUSALS)[code],
  notDone: (reason) => `Not done${reason ? `: ${reason}` : ""}`,

  // ---- what the brain still lacks (setup.js): one or two sentences, then what to say to Claude
  /** The line that gives the words to say; `phrase` is one of the "...Say" texts below. */
  sayToClaudeHtml: (phrase) => `Say to Claude: <b>“${phrase}”</b>`,
  emptyBrain: "Your brain has no note yet. The first one will light up here as soon as it is written.",
  emptyBrainSay: "note this in my brain",
  noSource: "No source feeds your brain yet. A source brings in by itself what you do elsewhere, such as your conversations with Claude.",
  noSourceSay: "turn on the reading of my conversations",
  noJudgeYet: "No judge reads for your brain yet. A judge is an AI that reads in the background what arrives and writes what matters into your brain.",
  hubOff: "The program that runs your sources is off. Until it is on, nothing enters your brain during the day.",
  hubOffSay: "turn on the program that runs my sources",
  hubStopped: "The program that runs your sources has stopped. It starts again by itself when you open your session.",
  hubStoppedSay: "restart the program that runs my sources",
  noToken: (judge) => `The ${judge} judge cannot read. It lacks the key that lets it call Claude without you.`,
  noTokenSay: "repair my judge",
  journalEmptySay: "what does my brain say about my projects?",
  indexEmpty: "The index is empty. It will list your notes, your catalogue and your contacts as they come in.",
  noMeaning: "The Semantic view groups your notes by what they are about. It needs the search by meaning, which is not on yet.",
  noMeaningSay: "turn on the search by meaning in my brain",

  // ---- the settings page
  settings: "Settings",
  settingsIntro: "Choose a source to see and set how it works. A setting is taken at the next run.",
  settingsUnreadable: "The settings could not be read.",
  rhythm: (every) => /** @type {Record<string, string | undefined>} */ (RHYTHMS)[every] ?? every,
  rhythmOf: (name) => `Rhythm of ${name}`,
  collectorsIntro: "What collects it, and at what rhythm.",
  pause: "Pause",
  resume: "Resume",
  pauseTip: "Stop it without removing anything: no run at all for as long as the pause lasts.",
  pausedTip: "Paused: it no longer runs by itself. What arrives meanwhile waits.",
  /** Written before "Resume" on the button of a paused source (style.css). */
  pausedPrefix: "Paused · ",
  saved: "Saved",
  savedNextRun: "Saved: taken at the next run",
  notSaved: (reason) => `Not saved${reason ? `: ${reason}` : ""}`,
  itsJudge: "Its judge",
  judgeTip: "The judge is the AI that reads in the background what this source brings, and writes it into the brain when it matters. A lighter model costs less, at the price of a rougher judgement.",
  judgeAlso: (names) => `It also judges: ${names}. A setting here holds for them too.`,
  model: "Model",
  modelNote: (id) => /** @type {Record<string, string | undefined>} */ (MODEL_NOTES)[id] ?? "",
  workingHours: "Working hours",
  workingHoursHtml: (from, to) => `from ${from} h to ${to} h`,
  workingHoursStart: "Start of the working hours",
  workingHoursEnd: "End of the working hours",
  itemsPerRun: "Items per run",
  itemsPerRunNote: "the larger it is, the longer a run takes; too large, it may be cut short",
  dailyCap: "Daily cap",
  capNone: "None",
  capMillions: (n) => `${number(n)} million tokens`,
  /** What a cap does, and what the judge used today (0: nothing yet). */
  capTip: (spent) => `Once the judge has used this many tokens in a day, it stops until the next day. What arrives meanwhile waits in its pile: nothing is lost. ${spent ? `Today it has used ${tokensWords(spent)}.` : "Today it has used nothing yet."}`,
  capSpent: (spent) => (spent ? `${tokensWords(spent)} used today` : "nothing used today"),
  neverRead: "Never read",
  neverReadTip: "What this judge never reads. A name without a slash stands for any folder or file of that name, wherever it is, and a star stands for anything: “0. OLD”, “client-*”. With a slash, it is the start of a path or of an address: “C:/Work/Secret/”, “dropbox://Clients/X/”.",
  excludeNone: "Nothing is excluded for now.",
  excludePlaceholder: "A folder name, or the start of a path",
  excludeAddLabel: "What this judge must never read",
  add: "Add",
  excludeRemoveTip: (pattern) => `Stop excluding ${pattern}`,
  /** After an exclusion was added: how many waiting items left the pile because of it. */
  excludeAdded: (removed) => (removed ? `Added. ${countOf(removed, "waiting item")} left the pile.` : "Added. Nothing that was waiting matched it."),
  excludeRemoved: "Removed: the judge may read it again.",
  excludeAlready: "Already in the list.",
  noJudge: "No judge for this source: what it brings comes into the brain without being judged by an AI.",

  // ---- the index page
  indexIntro: "The notes, the catalogue and the contacts, to filter by a word or by source.",
  indexFilterLabel: "Filter the index",
  indexFilterPlaceholder: "Filter the index: a title, a name, an address",
  readingIndex: "Reading the index…",
  indexNotes: (types) => `Notes · ${types}`,
  indexCatalogue: (tool) => `Catalogue · ${tool}`,
  indexContacts: "Contacts",
  missingCatalogue: "the catalogue",
  missingContacts: "the contacts",
  /** How many lines are shown, out of how many, and what could not be read. */
  indexCount: (shown, total, missing) =>
    `${countOf(shown, "item")} out of ${number(total)}${missing.length ? ` · ${missing.join(" and ")}: could not be read, another try at the next opening` : ""}`,

  // ---- the history window
  history: "History",
  historyTitle: (name) => `History · ${name}`,
  historyOf: (name) => `History of ${name}`,
  runsOverThirtyDays: (n, sources) => `${count(n, "run")} over the last thirty days${sources > 1 ? `, by ${sources} sources` : ""}.`,
  noRunInThirtyDays: "No run over the last thirty days.",
  allSources: "All",
  historyUnreadable: "The history could not be read (is the brain's server running?).",
  itemsRead: (n) => `${count(n, "item")} read`,
  seeChange: "See what changed",
  changeSaved: (commit, when) => `save ${commit} of ${when}`,
  changeNotSaved: "not saved yet",
  noVisibleChange: "No visible difference (the note was rewritten as it was, or the change has been undone since).",
  changeUnreadable: "The change could not be read.",

  // ---- taking back a write (the history window)
  undo: "Undo",
  /** What undoing does, for a kind of write (the journal's `what`): the tooltip of the button. */
  undoTip: (kind) => /** @type {Record<string, string | undefined>} */ (UNDO_TIPS)[kind] ?? UNDO_TIPS.change,
  undoTitle: "Undo this write?",
  /** What is about to happen, for a kind of write, with the title of the note. */
  undoText: (kind, title) =>
    kind === "fact" ? `The fact added to “${title}” will be taken out of the note. The rest of the note stays as it is.`
    : kind === "created" ? `The note “${title}”, created by the machine, will be removed. It stays in the history of saves.`
    : `The change made to “${title}” will be reversed: the lines it changed get back the text they had before.`,
  undoYes: "Undo it",
  undoKeep: "Keep it",
  /** Shown at once on the line, before the brain has answered. */
  undone: "Undone",
  undoneToday: (time) => `Undone today at ${time}`,
  undoneOn: (date) => `Undone on ${date}`,
  /** Why a write was not taken back, by the server's code; nothing for a code the page does not know. */
  undoRefusal: (code) => /** @type {Record<string, string | undefined>} */ (UNDO_REFUSALS)[code],
  /** The same for a code the page does not know (what the brain said, in its own words, stays in the server's log). */
  undoRefused: "Not undone: the brain refused to undo this write.",
  undoNoServer: "The brain's server does not answer. Reload the page to see whether this write was undone.",

  // ---- the legend
  legendTitle: "Legend of the map",
  legendIntro: "What each element of the page stands for. In the centre, what the brain knows; around it, where it learns it from; and the movements show what is happening right now.",
  legendBrain: "The brain in the centre",
  legendBubblesTitle: "One bubble per domain and one dot per note",
  legendBubblesText: "The <span class=\"button-like\">Domains</span> view: each bubble is a domain of the brain, with its notes grouped by type inside, and each dot has the colour of its domain. The names <b>in white bold capitals</b> are the domains, followed by their number of notes; the <b>smaller grey</b> names are the types of notes inside a domain, with their number, shown when their bubble is large enough. Hovering over a dot gives its title, its type and its domain; a click opens it. A click inside a bubble zooms into it.",
  legendTerritoriesTitle: "The territories of the Semantic view",
  legendTerritoriesText: "The <span class=\"button-like\">Semantic</span> view arranges the same notes by what they talk about rather than by domain. The territories are stable: computed once from the meaning of the notes and kept; a new note joins the closest one. A territory's name is the one you gave it (click the name to change it), else one an AI proposed once, else its most distinctive words. The round <span class=\"button-like\">↻</span> button next to the views cuts the territories again, on request only. Without the search by meaning, the view says so in the middle of the map.",
  legendDustTitle: "The dust around the notes",
  legendDustText: "The catalogue: what the brain can find again without keeping a note of it (posts, events, records kept in another tool). Each tiny dot has the colour of the tool its data lives in and sits around the bubble it extends; a click opens its card and reads its data where it lives. With the <b>Contacts</b> layer, the directory too, as lavender dots: each contact near the notes that mention it, else near its organization, else in a ring around the brain. A contact that has a note of its own opens that note.",
  legendMoveTitle: "Moving around",
  legendMoveText: "The wheel zooms, dragging moves the map; on a touch screen, two fingers zoom and move. From close enough, the titles of the notes appear. The target button, bottom right, brings the whole brain back into view.",
  legendRing: "The ring of sources and data",
  legendToolTitle: "One circle per tool",
  legendToolText: "The tool's logo (its initials when it has none), circled in the colour of its family, its name written beyond it. Two sectors, named in large letters: <b>Sources</b> in turquoise, what feeds the brain, and <b>Data</b> in violet, what it reads on demand. Hovering over a circle gives its name and its family; a click on the circle or on its name opens its card.",
  legendRolesTitle: "A tool that is both a source and data",
  legendRolesText: "It is drawn in both sectors: among the sources with a violet dot, among the data with a turquoise dot. The dot recalls its other role. It is one tool: the same card opens from either circle, and hovering over it or choosing it circles both.",
  legendClusterTitle: "The cluster of a tool that holds several",
  legendClusterText: "Small circles set against it, on the side of the brain: for instance one database per project, or each folder the brain watches. A click unfolds them on a second arc behind it, tied to it by a discreet thread, and opens its card, which lists them; the view slides to centre them. A second click, or closing its card, folds them back and puts the view back where it was.",
  legendStruckTitle: "The red stroke of a disconnected tool",
  legendStruckText: "Struck through in red and paler: the health check can no longer reach it. Its card says why, with <span class=\"button-like\">Reconnect</span> to test again and <span class=\"button-like\">Remove</span> to take the connection away.",
  legendTime: "Time",
  legendNextRunTitle: "The thin ring of the next run",
  legendNextRunText: "A thin ring that fills up until the next run of the tool's sources, at the rhythm set for each (every 30 minutes, every hour, every evening, every week). It follows the brain's clock, which beats at the half hour: two sources of the same rhythm show the same arc. A judge has no rhythm of its own: it reads what its sources bring, in the same beat of the clock. A folder that moved fills the ring until it is calm again. While a source works, the ring gives way to its breathing; while a source <b>catches up</b> on a backlog, the ring shows its progress instead. <b>Dotted</b>: the source is waiting for something other than a time (the vault to open, the end of a pause, your answer to a judge). No ring: nothing is scheduled, the tool is read when a conversation needs it.",
  legendVaultTitle: "The small amber key",
  legendVaultText: "Beside the circle, along the ring: one of the tool's sources needs a key and waits for the vault to be opened. It is a wait, not a failure: the source runs again as soon as the vault opens. The same key is on the tool's card, which says which sources wait, and in the settings, beside the collection concerned.",
  legendChosenTitle: "The yellow ring of the chosen tool",
  legendChosenText: "Its card is open on the right and its name is written in yellow. The notes it wrote this week light up in the brain, in its colour. Hovered, a tool is circled in yellow too.",
  legendNow: "What is happening right now",
  legendBreathingTitle: "A source that breathes while it works",
  legendBreathingText: "It is reading its tool right now, and it breathes on for five seconds after the end. Hover over it: the box says which source is running, since when, why (its time, a file that moved, a skill, the vault, a refresh by hand) and, for a judge, what it is reading.",
  legendWriteTitle: "A coloured pulse towards a note just written",
  legendWriteText: "It leaves the tool the note has just been written through (created, completed with a fact, or updated), in the colour of its family, then a ring widens around the note. A brand new note the map does not place yet gets the pulse in its bubble.",
  legendOrphanTitle: "A white pulse for a write without a tool",
  legendOrphanText: "It leaves the top of the brain: the file changed on the disk without going through a tool of the brain, usually an edit by hand in an editor.",
  legendReadTitle: "The path of a read from note to note",
  legendReadText: "A conversation is reading the brain, each in its own colour, and the titles of the notes it opens are written in white. The path follows the order of its reads: a solid line when the next note is linked to the one before, a dotted one for a jump. Hovering over a line says where it starts, where it ends, whether it follows a link and which conversation drew it; a click opens the note it ends at. It stays lit until the end of the answer (a minute without a new read when the AI does not say it has finished), then fades in three seconds.",
  legendOpenedTitle: "A note opened or only found",
  legendOpenedText: "A <b>full disc edged in white</b>: the note was opened and read in full. A <b>plain circle</b>: it came out of a search, and the AI only saw its title and an extract. The circle stays lit while the conversation answers, then fades in three seconds; while it is there, the open note shows the same circle and says which conversation, and how long ago.",
  legendFetchTitle: "Data read on demand in a tool",
  legendFetchText: "Dots go to the tool the data lives in and come back: the question leaves from the last note opened, the answer comes back, and the tool is circled in the conversation's colour meanwhile. A dot of the catalogue that was read, or came out of a search, lights up in that colour.",
  legendActivityTitle: "The activity panel",
  legendActivityText: "Bottom left. Folded, it is a round icon that turns green while an AI reads the brain. Open, it lists the conversations at work, the latest reads (a round dot, in the conversation's colour) and writes (a square, in the tool's colour), where a click flies to the note, and what the day has cost; a link opens the whole usage. When a judge has more to read at once than it reads without asking, it says so here in amber, even folded, and waits for your answer: read everything, only the most recent, or none.",
  legendFilters: "The filters",
  legendHarnesses: "The harnesses",
  legendHarnessArcTitle: "One arc per harness",
  legendHarnessArcText: "Around the ring of tools, the crown of what your AI knows how to do: one arc for your own skills (they live in your brain), one arc per plugin installed. Each dot is a skill. Each arc is turned towards the tools its skills use. A click on a skill draws its links to its tools and opens its card: what it does, in your language, and a button to read it whole. The Harnesses layer shows or hides it.",
  legendSkillLitTitle: "A skill that lights up",
  legendSkillLitText: "When the AI starts a skill, or you type its /command, its dot lights up, its name shows and its links to its tools light, then everything fades in a minute. The activity panel notes it too, with the conversation that started it.",
  legendOwnGuardTitle: "Your guards",
  legendOwnGuardText: "The orange shields with a padlock are your guards: they live in your brain and frame what the AI may do (send a mail, buy, read Signal...). They stand in front of the tool they guard, or along your skills. The AI can neither change nor move them: only you change them.",
  legendPluginHookTitle: "The hooks of the plugins",
  legendPluginHookText: "The small shields, in their plugin's colour, are its hooks: what the plugin checks or does by itself around the AI's work. Their card says what they do and when they run. They live in the plugin and are changed in its repository.",
  legendLayersTitle: "Layers",
  legendLayersText: "<b>Sources and data</b> shows or hides the whole ring and its flows; <b>Catalogue</b> and <b>Contacts</b>, the dust around the notes. <b>Harnesses</b> shows around the ring of tools the crown of your skills and plugins: one arc per harness, turned towards the tools it uses, a skill lighting up when the AI uses it. A contact stands near the notes that mention it; else around the brain, with the people of its organization (those of a Gmail or Outlook address, each alone): the more is exchanged with an organization, the nearer its cluster to the brain, and the more with someone, the bigger their dot. Zoomed in, the biggest clusters carry their name. The <b>Filters</b> title folds or unfolds the box.",
  legendFilterTitle: "Filter",
  legendFilterText: "<b>Written or modified</b>: the notes written since the chosen moment (1 h, today, 7 days, 30 days) keep their colour, with their number; the others nearly vanish. <b>AI memory</b>, in pink: what the AI learned while working with you. <b>Decisions</b>, in yellow: what you settled. <b>Only seeds</b>, in mint: among what is shown, what a machine wrote that you have not validated yet (with Decisions ticked: the decisions not validated yet). <b>Importance</b>: each dot shines and grows according to its weight (its links, what it is, how much the AIs read it). The page remembers what was ticked.",
  legendSeedsTitle: "The Seeds filter",
  legendSeedsText: "In mint green: the notes the machine wrote that you have not validated yet, with their number; the rest fades. With other filters ticked, only the seeds they leave lit count, for instance the decisions written this week. A seed is validated on its card, one at a time, once read.",
  legendDesignTitle: "The design of the page",
  legendDesignText: "Under <b>Display</b>, <b>Night</b> or <b>Hypervibe</b> switches the design of the whole page at once, without reloading, and the page remembers it. Night is the view's own design, in night blue. Hypervibe lays its design system on its own night, a warm black: cream text, the colours of its rainbow at full strength, a rainbow band at the top of every page, its icons, and its fonts, Archivo for the titles and Geist for the text, carried by the view itself (no network needed). Each colour keeps its meaning: what is white on the night is cream there, and what is chosen stays yellow.",
  // The panel of the building, while /brain:start goes on (build.js, 2026-11-23).
  buildTitle: "Building the brain",
  buildCount: (done, all) => `${done} of ${all}`,
  buildFold: "Fold this panel",
  buildHide: "Hide this panel until the next start",
  buildUnfold: "Where the building of your brain stands",
  buildDoing: "Now:",
  buildPaused: "Paused.",
  buildPart: (id) => /** @type {Record<string, string | undefined>} */ ({ preflight: "Before anything", computer: "The computer", container: "The brain", tools: "The tools", knowledge: "The knowledge", executive: "The executive floor", life: "The life of the brain" })[id] ?? id,
  buildBlock: (id) => /** @type {Record<string, string | undefined>} */ ({ writings: "Your writings", memory: "What Claude remembers of you", conversations: "Your conversations with Claude", documents: "The documents of your folders", contacts: "The people of your mail" })[id] ?? id,
  buildState: (s) => /** @type {Record<string, string | undefined>} */ ({ done: "done", now: "now", todo: "to do", declined: "set aside", na: "does not apply", waiting: "next", later: "later", never: "never", running: "being read" })[s] ?? s,
  buildNotCounted: "not counted yet",
  buildFigures: (done, total, left, notes, unit) => {
    const words = /** @type {Record<string, string[] | undefined>} */ ({ files: ["file", "files"], conversations: ["conversation", "conversations"], documents: ["document", "documents"], months: ["month", "months"] })[unit] ?? [unit, unit];
    return `${number(done)} of ${countOf(total, words[0], words[1])} in, ${number(left)} left${notes === null ? "" : `, ${countOf(notes, "note")} added`}`;
  },
  legendNote: "A note's card",
  legendChosenNoteTitle: "The chosen note",
  legendChosenNoteText: "Its card is open on the right. On the map, the note has a yellow halo and its title in yellow, and white lines tie it to the notes it is linked to. The card gives its type, its domains, its status, its nature, what it holds, where it comes from, where its data lives when it lives elsewhere, and its linked notes: a click on one of them flies to it.",
  legendStatusTitle: "Validating a seed",
  legendStatusText: "A note the machine wrote carries the label <b>Seed</b>. <span class=\"button-like\">Validate</span> (or <kbd>V</kbd>) says it is right: it becomes <b>Validated</b> on the screen at once; if the brain refuses, it goes back as it was and the page says why. On a validated note, <b>Back to seed</b> gives it its state of before. <span class=\"button-like\">Next seed</span> (or <kbd>N</kbd>) opens the seed the other notes link to the most, among those left.",
  legendOpenFileTitle: "Opening the file",
  legendOpenFileText: "The button at the bottom of the card shows the note's file in the computer's file manager, to edit it by hand. It says so when the file is not on this computer.",
  legendCard: "A tool's card",
  legendRefreshTitle: "Refresh and what the card says",
  legendRefreshText: "When the tool has sources, <span class=\"button-like\">Refresh</span> runs them right away, without waiting for their time, the calm of their folder or the judge's gathering (they leave within a minute). Below: when the next run is and why, and the small key when a source waits for the vault. Then its roles, what the tool is for, a button to open its site or its folder, the list of its databases or its folders when it holds several, each of its sources with its rhythm and its last run, what it brought into the brain this week (for data, how many times it was read) and how Claude reaches it.",
  legendHistoryTitle: "History",
  legendHistoryText: "The last three runs are shown on the card. <b>History ↗</b> opens every run of the last thirty days in a new window, day by day: when, why, what it did; it can show one source only. There, a click on a note shows what the run changed in it, and <span class=\"button-like\">Undo</span> takes that write back: a fact leaves its note, a note the machine created is removed, a change is reversed.",
  legendPages: "The pages",
  legendSettingsTitle: "Settings",
  legendSettingsText: "The gear, bottom left, just above the activity panel. The settings open on the tool whose card is open, else on the first one. Choose a source: you set the rhythm of each thing that collects it (the small key says which one waits for the vault), and you can pause one without removing anything (what arrives meanwhile waits). When a judge reads what the source brings, you choose its model (Haiku, Sonnet or Opus), its working hours and how many items it takes per run, and you can pause it too. You can also give it a cap of tokens per day (past it, the judge stops until the next day) and tell it what it must never read. A judge that waits for your answer asks for it here too.",
  legendUsageTitle: "Usage",
  legendUsageText: "What using the brain costs, opened from the activity panel: the tokens the AIs read, your conversations and the judge apart, over today, 7 days, 30 days or everything. Two charts, the detail by tool, the heaviest calls, then the whole log, which can be filtered. Above, what the judges cost for the whole of their work: their runs, the tokens they used (new and re-read), and where each one stands today against its cap.",
  legendIndexTitle: "Index",
  legendIndexText: "The list button next to the search: the whole brain as a list, notes, catalogue and contacts, to filter by a word or by source. A click opens the item as on the map.",
  legendNoticesTitle: "What the brain still lacks",
  legendNoticesText: "A box in the middle of the map while the brain has neither a note nor a source yet; a line at the bottom when something that was set up does not work (the program that runs the sources has stopped, a judge lacks the key to call Claude). Each ends with the words to say to Claude: the view shows, Claude acts.",
  legendInstallTitle: "Installing the app",
  legendInstallText: "The yellow button at the top, when the browser offers it: the view becomes an application of its own, with its own icon, which stays its own once pinned to the taskbar.",
  legendKeysTitle: "Search and keyboard",
  legendKeysText: "The search, at the top, finds a note by its title; <kbd>/</kbd> goes to it. The arrows choose a result, <kbd>Enter</kbd> opens it and flies to it. <kbd>Esc</kbd> closes the layer on top, and only that one: in the search, its results; elsewhere a tooltip, then the legend or the settings, then the open card, then the index or the usage page. On an open note, <kbd>V</kbd> validates a seed and <kbd>N</kbd> opens the next seed.",
};

/** @typedef {typeof en} Dictionary */

export default en;
