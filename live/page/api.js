// api.js: everything the page asks the server, one function per route, typed
// with contract.d.ts.
//
// Each function throws when the server does not answer or answers something
// that is not JSON; attempt() turns that into null for a caller that says the
// failure where the answer was expected. Everything that has an effect is a
// POST, with its parameters in the query string.

/** @typedef {import("../contract.d.ts").MapResponse} MapResponse */
/** @typedef {import("../contract.d.ts").TerritoriesResponse} TerritoriesResponse */
/** @typedef {import("../contract.d.ts").TerritoryRenamed} TerritoryRenamed */
/** @typedef {import("../contract.d.ts").ToolsResponse} ToolsResponse */
/** @typedef {import("../contract.d.ts").LogosResponse} LogosResponse */
/** @typedef {import("../contract.d.ts").NextResponse} NextResponse */
/** @typedef {import("../contract.d.ts").CatalogueResponse} CatalogueResponse */
/** @typedef {import("../contract.d.ts").ContactsResponse} ContactsResponse */
/** @typedef {import("../contract.d.ts").WeightsResponse} WeightsResponse */
/** @typedef {import("../contract.d.ts").WrittenResponse} WrittenResponse */
/** @typedef {import("../contract.d.ts").NoteResponse} NoteResponse */
/** @typedef {import("../contract.d.ts").FetchResponse} FetchResponse */
/** @typedef {import("../contract.d.ts").ToolResponse} ToolResponse */
/** @typedef {import("../contract.d.ts").HistoryResponse} HistoryResponse */
/** @typedef {import("../contract.d.ts").ChangeResponse} ChangeResponse */
/** @typedef {import("../contract.d.ts").UndoResponse} UndoResponse */
/** @typedef {import("../contract.d.ts").SettingsResponse} SettingsResponse */
/** @typedef {import("../contract.d.ts").SettingsQuery} SettingsQuery */
/** @typedef {import("../contract.d.ts").SettingsSaved} SettingsSaved */
/** @typedef {import("../contract.d.ts").HealthAction} HealthAction */
/** @typedef {import("../contract.d.ts").HealthResponse} HealthResponse */
/** @typedef {import("../contract.d.ts").OpenResponse} OpenResponse */
/** @typedef {import("../contract.d.ts").ValidateResponse} ValidateResponse */
/** @typedef {import("../contract.d.ts").NowResponse} NowResponse */
/** @typedef {import("../contract.d.ts").UsageResponse} UsageResponse */
/** @typedef {import("../contract.d.ts").JudgesResponse} JudgesResponse */
/** @typedef {import("../contract.d.ts").SetupResponse} SetupResponse */
/** @typedef {import("../contract.d.ts").ExcludeResponse} ExcludeResponse */
/** @typedef {import("../contract.d.ts").CatchUpAnswer} CatchUpAnswer */
/** @typedef {import("../contract.d.ts").CatchUpResponse} CatchUpResponse */
/** @typedef {import("../contract.d.ts").StreamEvents} StreamEvents */

/**
 * A route and its query, as an address.
 * @param {string} route
 * @param {Record<string, string | number | undefined>} [query] the absent values are left out
 * @returns {string}
 */
function address(route, query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  const text = params.toString();
  return text ? `${route}?${text}` : route;
}

// THE TOKEN (2026-11-21). Everything under /api/ asks for the view's token,
// which the page carries in a cookie the server gave with the page itself: the
// browser sends it, nothing here reads it. A page whose cookie was not kept is
// answered 401: said apart from a server that does not answer (accessRefused).
let refused = false;
/** Whether the server last refused this page for lack of its token. */
export const accessRefused = () => refused;

/**
 * What a route answered, as JSON. Throws when the page was refused.
 * @param {Response} answer
 * @returns {Promise<any>}
 */
function read(answer) {
  refused = answer.status === 401;
  if (refused) throw new Error("no access");
  return answer.json();
}

/**
 * Reads a route: its JSON answer.
 * @param {string} route
 * @param {Record<string, string | number | undefined>} [query]
 * @returns {Promise<any>}
 */
const get = async (route, query) => read(await fetch(address(route, query)));

/**
 * Asks for an effect: its JSON answer.
 * @param {string} route
 * @param {Record<string, string | number | undefined>} [query]
 * @returns {Promise<any>}
 */
const post = async (route, query) => read(await fetch(address(route, query), { method: "POST" }));

/**
 * An answer, or null when the server did not give one.
 * @template T
 * @param {Promise<T>} asked
 * @returns {Promise<T | null>}
 */
export async function attempt(asked) {
  try {
    return await asked;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ the brain

/** @returns {Promise<MapResponse>} */
export const getMap = () => get("/api/map");
/** @returns {Promise<TerritoriesResponse>} */
export const getTerritories = () => get("/api/territories");
/** A new cutting of the territories. @returns {Promise<TerritoriesResponse>} */
export const redoTerritories = () => post("/api/territories/redo");
/** @param {string} id @param {string} name "" to go back to the proposed name @returns {Promise<TerritoryRenamed>} */
export const renameTerritory = (id, name) => post("/api/territories/rename", { id, name });
/** @returns {Promise<CatalogueResponse>} */
export const getCatalogue = () => get("/api/catalogue");
/** @returns {Promise<ContactsResponse>} */
export const getContacts = () => get("/api/contacts");
/** The executive floor: the person's skills and guards. @returns {Promise<import("../contract.d.ts").ExecutiveResponse>} */
export const getExecutive = () => get("/api/executive");
/** The skills the AI started since a date. @param {string} since an ISO date @returns {Promise<import("../contract.d.ts").SkillUse[]>} */
export const getSkillsUsed = (since) => get("/api/skills-used", { since });
/** A skill's text, to read it whole. @param {string} file @returns {Promise<{ ok: boolean, text?: string, error?: string }>} */
export const readSkillText = (file) => get("/api/executive/skill", { file });
/** A skill's description in a language, translated once and kept. @param {string} file @param {string} lang @returns {Promise<{ ok: boolean, text?: string, error?: string }>} */
export const translateSkill = (file, lang) => post("/api/executive/translate", { file, lang });
/**
 * One of the person's own skills, or a whole harness, switched off or on.
 * @param {"skill" | "harness"} kind @param {string} name the skill's folder, or <plugin>@<marketplace>
 * @param {"on" | "off"} to @param {boolean} [confirmed] the person said yes to the question (a harness that checks before an action)
 * @returns {Promise<import("../contract.d.ts").SwitchResponse>}
 */
export const switchPiece = (kind, name, to, confirmed) => post("/api/executive/switch", { kind, name, to, confirmed: confirmed ? 1 : undefined });
/** @returns {Promise<WeightsResponse>} */
export const getWeights = () => get("/api/weights");
/** @param {string} since an ISO date @returns {Promise<WrittenResponse>} */
export const getWritten = (since) => get("/api/written", { since });
/** @param {string} slug @returns {Promise<NoteResponse>} */
export const getNote = (slug) => get("/api/note", { slug });
/** The data at an address, read where it lives. @param {string} at @returns {Promise<FetchResponse>} */
export const fetchData = (at) => post("/api/fetch", { address: at });
/** The person validates a note, or puts it back as a seed. @param {string} note its slug @param {"trusted" | "seed"} to @returns {Promise<ValidateResponse>} */
export const validateNote = (note, to) => post("/api/validate", { note, to });
/**
 * The person validates several seeds at once (300 at most). Their names go in
 * a JSON body: a list too long for an address.
 * @param {string[]} notes @returns {Promise<import("../contract.d.ts").ValidateBatchResponse>}
 */
export const validateNotes = async (notes) => {
  /** @type {import("../contract.d.ts").ValidateBatchBody} */
  const body = { notes };
  return read(await fetch("/api/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
};
/** Shows a note's file in the file manager. @param {string} slug @returns {Promise<OpenResponse>} */
export const openNoteFile = (slug) => post("/api/open-note", { slug });
/** Asks for the index to be brought up to date (a note was read that the index is behind of). @returns {Promise<import("../contract.d.ts").RefreshResponse>} */
export const refreshIndex = () => post("/api/index/refresh");

// ------------------------------------------------------------ the tools

/** @returns {Promise<ToolsResponse>} */
export const getTools = () => get("/api/tools");
/** The logos of the tools; none when the server has no file of them. @returns {Promise<LogosResponse>} */
export async function getLogos() {
  const answer = await fetch("logos.json");
  if (answer.status === 401) refused = true;
  return answer.ok ? answer.json() : {};
}
/** @returns {Promise<NextResponse>} */
export const getNext = () => get("/api/next");
/** @param {string} id @returns {Promise<ToolResponse>} */
export const getTool = (id) => get("/api/tool", { id });
/** @param {string} id @returns {Promise<HistoryResponse>} */
export const getHistory = (id) => get("/api/history", { id });
/** What one write changed in a note. @param {string} note @param {string} at @returns {Promise<ChangeResponse>} */
export const getChange = (note, at) => get("/api/change", { note, at });
/** Takes back one write of the machine. @param {string} id the id of the write's event @returns {Promise<UndoResponse>} */
export const undoWrite = (id) => post("/api/undo", { id });
/** The sources of a tool run at the hub's next beat. @param {string} id @returns {Promise<NowResponse>} */
export const runNow = (id) => post("/api/now", { id });
/** Shows a tool's folder in the file manager. @param {string} id @param {number | string} index @returns {Promise<OpenResponse>} */
export const openFolder = (id, index) => post("/api/open", { id, index });
/** Checks a broken connection again, or removes it. @param {string} key @param {HealthAction} action @returns {Promise<HealthResponse>} */
export const health = (key, action) => post("/api/health", { key, action });

// ------------------------------------------------------------ settings, usage

/** @returns {Promise<SettingsResponse>} */
export const getSettings = () => get("/api/settings");
/** @param {SettingsQuery} query @returns {Promise<SettingsSaved>} */
export const saveSettings = (query) => post("/api/settings", { ...query });
/** The usage journal, whole or since a date. @param {string} [since] an ISO date @returns {Promise<UsageResponse>} */
export const getUsage = (since) => get("/api/usage", { since });

// ------------------------------------------------------------ the judges

/** The judges, where each stands today, and their runs (all of them, or since a date). @param {string} [since] an ISO date @returns {Promise<JudgesResponse>} */
export const getJudges = (since) => get("/api/judges", { since });
/** What this brain still lacks (no source, the hub off...), for the empty states. @returns {Promise<SetupResponse>} */
export const getSetup = () => get("/api/setup");
/** Where the building of the brain stands, while /brain:start goes on. @returns {Promise<import("../contract.d.ts").StartResponse>} */
export const getStart = () => get("/api/start");
/** Adds or removes one pattern of what a judge never reads. @param {string} source the judge @param {"add" | "remove"} action @param {string} pattern @returns {Promise<ExcludeResponse>} */
export const excludePattern = (source, action, pattern) => post("/api/exclude", { source, [action]: pattern });
/** Answers a judge that holds its pile. @param {string} source the judge @param {CatchUpAnswer} answer @param {number} [n] with "latest": how many @returns {Promise<CatchUpResponse>} */
export const answerCatchUp = (source, answer, n) => post("/api/catch-up", { source, answer, n });

// ------------------------------------------------------------ the stream

/**
 * Listens to the live stream (Server-Sent Events). No light for the link:
 * when it is cut, it comes back by itself (EventSource).
 * @param {{ [K in keyof StreamEvents]?: (data: StreamEvents[K]) => void }} handlers one function per event
 * @returns {EventSource}
 */
export function openStream(handlers) {
  const stream = new EventSource("/api/stream");
  for (const [name, handle] of Object.entries(handlers)) {
    stream.addEventListener(name, (ev) => /** @type {(data: unknown) => void} */ (handle)(JSON.parse(ev.data)));
  }
  return stream;
}
