// i18n/en.mjs: every text the server words for the person, in English.
//
// English is the reference: a key missing from another language falls back
// to this one (i18n.mjs). A text that takes values is a function.

/** "3 items", "1 item". */
const items = (n) => `${n} item${n === 1 ? "" : "s"}`;

const en = {
  /** The name of the window, and of the shortcut an installed app gets. */
  appName: "Second Brain",

  // ---- the server (server.mjs)
  noBrain: "No brain found (the `brain` setting of ~/.hypervibe-brain/config.json).",
  listening: (url) => `brain-live on ${url}`,
  refused: (why) => `refused (${why})`,
  conversationOf: (client, conv) => `${client}, conversation ${conv}`,
  conversation: (conv) => `Conversation ${conv}`,
  noteNameInvalid: "invalid note name",
  noteNotFound: "note not found",
  noteUnreadable: "the note could not be read",
  addressInvalid: "invalid address",
  answerUnreadable: "unreadable answer",
  sourceUnknown: "unknown source",
  pluginSilent: "the plugin did not answer",
  /** The plugin answered that it could not do it; what it said is in the server's log. */
  pluginFailed: "the plugin could not do it",
  sourceUnreadable: "the settings of this source cannot be read right now",
  connectionUnknown: "unknown connection",
  wholeNumbers: "the hours and the items per run are whole numbers",
  judgeFollowsSources: "a judge follows the rhythm of its sources",
  rhythmNotAllowed: "rhythm not allowed for this source",
  judgeUnknown: "unknown judge",
  modelUnknown: "unknown model",
  hoursOrder: "the end hour must come after the start hour",
  capInvalid: "this cap is not a number of tokens",

  // ---- the rhythm of a source
  rhythmDay: "every evening",
  rhythmWeek: "every week",
  rhythmHour: "every hour",
  everyMinutes: (n) => `every ${n} minutes`,

  // ---- the tools around the brain (tools.mjs)
  familyCode: "Code and AI",
  familyFiles: "Files",
  claudeCodeRole: "The working conversations, the memory and the skills.",
  claudeCodeAccess: "The brain MCP server (reading), the /brain skill (writing).",
  claudeCodeToday: "Both ways: Claude reads the brain through the MCP server, and the brain receives the titles of the sessions, the /brain captures and the facts the machine adds.",
  afterSkillOrSource: "after a skill or another source",
  /** One source that reads a tool: its name, when it runs, what it does. */
  reader: (name, when, description) => `${name} (${when}): ${description}`,
  /** Between two readers of the same tool. */
  readerSeparator: "; ",
  foldersName: "Folders",
  foldersRole: "The folders of this computer that the brain follows, each with all it holds: at their own rhythm, its sources pick up what moved there.",
  foldersAccess: "The folders are read locally, sub-folders included; a file is read on demand (dropbox://...).",
  folderRole: (paths) => (paths.length > 1 ? `The folders ${paths.join(" and ")}.` : `The folder ${paths[0]}.`),
  folderAccess: (sources) => `Read, sub-folders included, by: ${sources.join(", ")}.`,
  folderToday: (sources) => `What moves there is picked up at the next pass of: ${sources.join(", ")}.`,
  /** The name of one database of a registry entry with several projects. */
  databaseName: (project) => `${project} database`,
  databaseRole: (project, scheme) => `The database of the ${project} project, read on demand (${scheme}://${project}/...).`,

  // ---- what a tool did, and when it runs next (activity.mjs)
  toolUnknown: "unknown tool",
  liveAtOnce: "live, as soon as an item arrives",
  liveAfter: (delay) => `live, ${delay} after an item arrives`,
  foldersAfterCalm: "in the folders it collects from, what has been there for a quarter of an hour",
  after: (names) => `after ${names.join(", ")}`,
  vaultKey: (names) => `vault key: ${names.join(", ")}`,
  waitsForVault: "waits for the vault to open",
  paused: "paused",
  pausedWaiting: (n) => `paused, ${items(n)} waiting`,
  fileMoved: "a file moved: once the folder is calm",
  askedNow: "asked now",
  nextBeat: "at the hub's next beat",
  /** What is left of a catch-up (the page says "Catching up" before it). */
  catchingUp: (left, total, batch) => `${items(left)} left out of ${total}, ${batch} per run`,
  pausedAfterFailure: (n) => `paused after a failed run, ${items(n)} waiting`,
  inJudgePile: (n) => `${items(n)} in the judge's pile`,
  /** A judge that holds its pile until the person says what to do with it. */
  heldForAnswer: (n) => `${items(n)} ${n === 1 ? "waits" : "wait"} for your answer`,
  /** A judge that spent its tokens of the day. */
  cappedToday: (n) => `the day's cap is reached, ${items(n)} waiting until tomorrow`,
  atEveningSave: "at the evening save",
  atSundayReview: "at the Sunday review",
  atNextTick: "reads at the next tick, if something came in",

  // ---- what changed in a note (activity.mjs)
  noteUnknown: "unknown note",
  noteGone: "the note no longer exists",
  noHistory: "this brain has no history (git is missing, or the repository was never created)",
  notSavedYet: "not saved yet",

  // ---- the launcher (open.mjs)
  portTaken: (port, brain) => `Port ${port} already serves another brain (${brain}). Choose another port: BRAIN_LIVE_PORT=<port>.`,
  serverNotStarted: "The local server did not start. Try: node server.mjs, to see the error.",
  serverReady: (url) => `Server ready: ${url}`,
  openedInstalled: (url) => `Second Brain (installed app): ${url}`,
  openInBrowser: (url) => `Open ${url} in a browser.`,
  opened: (url) => `Second Brain: ${url}`,
};

/** @typedef {typeof en} Dictionary */

export default en;
