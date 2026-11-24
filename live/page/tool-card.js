// tool-card.js: the card of a tool of the ring: what it is, when its sources
// run next, what links it to the brain, what it did this week, and its
// buttons (refresh now, open its folder, reconnect or remove a connection).

import { attempt, getTool, health, openFolder, runNow } from "./api.js";
import { arrange } from "./arrange.js";
import { glideTo } from "./camera.js";
import { loadNext, loadTools } from "./data.js";
import { closest } from "./dom.js";
import { clock, escapeHtml, outcome, runTime, shortDate, shortWhen, shorten, untilThen, wordWhy } from "./format.js";
import { t } from "./i18n.js";
import { confirmDialog } from "./modal.js";
import { paint, paintLive } from "./paint-live.js";
import { panel, panelContent, whenToolCardCloses } from "./panel.js";
import { hubNotice, tokenNotice } from "./setup.js";
import { SECTORS, state, toolById } from "./state.js";
import { colors, dataColor } from "./theme.js";

/** @typedef {import("../contract.d.ts").Run} Run */
/** @typedef {import("../contract.d.ts").SourceDetail} SourceDetail */

/**
 * One run of a source, as a line: when, which source, why, what it did, how
 * long it took, and the notes it wrote.
 * @param {Run} run
 * @returns {string}
 */
function runLine(run) {
  const done = outcome([run.created && t("countCreated", run.created), run.updated && t("countUpdated", run.updated), run.zones && t("countZones", run.zones), run.entries && t("countInCatalogue", run.entries), run.judged !== undefined && t("countJudged", run.judged)]);
  const status = run.interrupted ? t("runInterrupted") : run.end ? (run.ok === false ? t("runFailed") : done || t("nothingNew")) : t("runRunning");
  const seconds = run.end ? Math.round((Date.parse(run.end) - Date.parse(run.start)) / 1000) : null;
  const written = run.written ?? [];
  const notes = written.map((w) => `<a href="#" class="go-note" data-slug="${escapeHtml(w.note)}">${escapeHtml(shorten(state.noteById.get(w.note)?.title ?? w.note, 50))}</a>`).join(", ");
  return `<li><span class="run-when">${escapeHtml(shortWhen(run.start))}</span> <b>${escapeHtml(run.source)}</b>${run.why !== undefined && run.why !== "" ? ` · ${escapeHtml(wordWhy(run.why))}` : ""}<br><small>${escapeHtml(status)}${seconds !== null ? ` · ${runTime(seconds)}` : ""}</small>${notes ? `<br><small>${notes}${run.writtenCount > written.length ? ` ${t("andOthers", run.writtenCount - written.length)}` : ""}</small>` : ""}</li>`;
}

/**
 * One source of the tool: what it does, when it runs, its last run.
 * @param {SourceDetail} source
 * @returns {string}
 */
function sourceLine(source) {
  const b = source.outcome;
  const done = b ? outcome([b.created && t("countCreated", b.created), b.updated && t("countUpdated", b.updated), b.zones && t("countZones", b.zones), b.entries && t("countCatalogueEntries", b.entries), b.judged && t("countItemsJudged", b.judged)]) || t("nothingNew") : "";
  // A RUN THAT IS GOING ON IS NOT THE LAST RUN (2026-11-21): the card said
  // "Last run: today at 12:43, 5 items judged" while the run of 12:43 was
  // still going on. A run going on is said as such; the last run is the last
  // one that ended, with what IT did.
  const running = source.runningSince ? t("runningSince", clock(source.runningSince)) : "";
  const lastAt = source.runningSince ? source.lastEnd : source.lastEnd ?? source.lastRun;
  const last = lastAt || !running ? `${t("lastRun", shortDate(lastAt))}${done && lastAt ? `, ${done}` : ""}` : "";
  // A source that needs a key while the vault is closed waits: it is not broken.
  const vault = source.waitsForVault ? ` · <span class="waits-vault">${keyIcon()} ${escapeHtml(t("waitsForVault"))}</span>` : "";
  return `<li>${t("colon", `<strong>${escapeHtml(source.name)}</strong>`, escapeHtml(source.description))}<br><small>${escapeHtml(source.when.join(", "))}${source.key ? ` · ${escapeHtml(source.key)}` : ""}${vault}</small><br><small>${escapeHtml([running, last].filter(Boolean).join(" · "))}${source.lastError ? ` · <span class="error">${escapeHtml(String(source.lastError).slice(0, 160))}</span>` : ""} · ${escapeHtml(t("runsThisWeek", source.runs))}</small></li>`;
}

/** The small key drawn beside what waits for the vault (the same shape as on the ring). */
export const keyIcon = () => `<svg class="key-icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="8" r="3" /><path d="M8 8h6M11.5 8v2.6M14 8v2.6" /></svg>`;

// THE MAP GOES BACK WHERE IT WAS (2026-11-21). A tool with several databases
// unfolds its arc on a click, and the view slides to centre it; closing its
// card with Esc (or the cross, or a click beside) left the arc unfolded and
// the map pushed aside, the names of the sectors off centre. What the view
// was before the slide is kept here, and given back when the card closes.
/** @type {{ tool: string, camera: import("./state.js").Camera, moved: boolean } | null} */
let unfolded = null;
/**
 * Keeps the framing of before a tool unfolds (pointer.js, right before the slide).
 * @param {string} tool
 */
export function rememberViewBeforeUnfold(tool) {
  unfolded = { tool, camera: { ...state.camera }, moved: state.moved };
}
/** Folds back the tool that was unfolded with its card, and slides the view back. */
function restoreView() {
  const kept = unfolded;
  unfolded = null;
  if (!kept) return;
  if (state.openTools.delete(kept.tool)) arrange(true);
  state.moved = kept.moved;
  glideTo(kept.camera);
}

// THE CARD FOLLOWS WHAT ITS SOURCES DO (2026-11-21). Opened at 12:43, a card
// still said "149 left" minutes later: it was read once, at its opening. It is
// now read again when the stream says one of its sources started, ended or
// wrote (toolCardMoved), and at least every thirty seconds while it stays open
// (refreshToolCard, from the page's clock).
/** When the card on screen was last read, in ms. */
let shownAt = 0;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let movedTimer;
/** Reads the open card again, in place: the scroll stays, a button at work is not cut off. */
async function redrawToolCard() {
  const id = state.chosenTool;
  const tool = toolById(id);
  if (!id || !tool || panel.hidden) return;
  // (A button that is doing something says so: the card waits for it.)
  if (panelContent.querySelector("button:disabled")) return;
  const answer = await attempt(getTool(id));
  if (state.chosenTool !== id || panel.hidden || !answer || panelContent.querySelector("button:disabled")) return;
  const scroll = panel.scrollTop;
  drawTool(tool, answer);
  panel.scrollTop = scroll;
  shownAt = Date.now();
}
/** The page's clock (every thirty seconds): an open card that was not read again meanwhile is. */
export function refreshToolCard() {
  if (state.chosenTool && !panel.hidden && Date.now() - shownAt >= 25_000) redrawToolCard();
}
/**
 * Something happened to these tools (a run started or ended, a note was written): the open card of one of them is read again.
 * @param {(string | null | undefined)[]} ids
 */
export function toolCardMoved(ids) {
  if (!state.chosenTool || panel.hidden || !ids.includes(state.chosenTool)) return;
  // (Several signals for one run: read once, a moment later, when the journal has said what it did.)
  clearTimeout(movedTimer);
  movedTimer = setTimeout(redrawToolCard, 1500);
}

/**
 * Opens the card of a tool; null closes it.
 * @param {string | null} id
 */
export async function chooseTool(id) {
  state.chosenTool = id;
  state.selection = null;
  state.toolNotes = null;
  paint();
  const tool = toolById(id);
  if (!id || !tool) {
    panel.hidden = true;
    // The map goes back where it was before an unfolded tool slid it aside.
    restoreView();
    return;
  }
  panel.hidden = false;
  panelContent.innerHTML = `<h2>${escapeHtml(tool.name)}</h2><p class="meta">${t("loadingShort")}</p>`;
  const answer = await attempt(getTool(id));
  if (state.chosenTool !== id) return;
  drawTool(tool, answer);
  shownAt = Date.now();
}

/**
 * Writes the card of a tool from what the server said of it.
 * @param {import("./state.js").Tool} tool
 * @param {import("../contract.d.ts").ToolResponse | null} answer
 */
function drawTool(tool, answer) {
  const family = state.families[tool.family] ?? { name: tool.family, color: colors.unknown };
  // An unknown tool, or a server that does not answer: the card shows what the ring already knows.
  const detail = answer && "sources" in answer ? answer : null;
  const roles = (tool.roles?.length ? tool.roles : [tool.sector ?? "source"]).filter((r) => SECTORS[r]).map((r) => `<span class="dot role-dot" style="background:${SECTORS[r]?.color}"></span>${t("roleSentence", r)}`).join(" · ");
  // The tool's link comes from brain.json: malformed, or something other
  // than a web address, it is not shown and the card is displayed all the same.
  let host = "";
  try {
    const url = new URL(tool.link ?? "");
    if (url.protocol === "https:" || url.protocol === "http:") host = url.hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const paths = tool.paths ?? [];
  const children = tool.children ? state.tools.filter((x) => x.parent === tool.id) : [];
  const childList = children.length ? `<h3>${tool.id === "folders" ? t("itsFolders") : t("itsDatabases")}</h3><ul class="links">${children.map((x) => `<li><a href="#" class="go-tool" data-tool="${escapeHtml(x.id)}">${escapeHtml(t("shortDatabaseName", x.name))}</a>${x.disconnected ? ` · ${t("childDisconnected")}` : x.problems?.length ? ` · ${t("childToCheck")}` : ""}</li>`).join("")}</ul>` : "";
  const sources = (detail?.sources ?? []).map(sourceLine).join("");
  const week = detail?.week;
  const kinds = week ? Object.entries(week.byKind).map(([kind, n]) => t("countByKind", kind, n)).join(", ") : "";
  const next = answer?.next;
  state.toolNotes = new Set(week?.notes ?? []);
  panelContent.innerHTML = `
      <div class="tool-head"><h2>${escapeHtml(tool.name)}</h2>${detail?.sources?.length ? `<button class="now" data-tool="${escapeHtml(tool.id)}" data-tip="${escapeHtml(t("refreshTip"))}">${t("refresh")}</button>` : ""}</div>
      <p class="meta"><span class="dot" style="background:${dataColor(family.color, "family")}"></span> ${escapeHtml(family.name)}</p>
      ${detail?.sources?.length ? hubNotice() + detail.sources.map((source) => tokenNotice(source.name)).join("") : ""}
      ${next ? `<p class="next-run">${escapeHtml(t("colon", next.catchUp ? t("catchingUp", Math.round((100 * next.catchUp.done) / Math.max(1, next.catchUp.total))) : next.due ? t("nextRunIn", untilThen(next.due)) : t("waiting"), next.reason))}</p>` : ""}
      ${next?.vault && next.vaultSources?.length ? `<p class="waits-vault">${keyIcon()} ${escapeHtml(t("vaultWaiting", next.vaultSources))}</p>` : ""}
      <p class="tag">${roles}</p>
      ${tool.role ? `<p>${escapeHtml(tool.role)}</p>` : ""}
      ${host || paths.length ? `<p class="open-row">${host ? `<a href="${escapeHtml(tool.link)}" target="_blank" rel="noopener">${escapeHtml(t("openHost", host))}</a>` : ""}${paths.map((path, i) => `<button class="open-folder" data-tool="${escapeHtml(tool.id)}" data-index="${i}">${paths.length > 1 ? escapeHtml(t("openNamed", path.replace(/[\\/]+$/, "").split(/[\\/]/).slice(-2).join("/"))) : t("openInExplorer")}</button>`).join("")}</p>` : ""}
      ${childList}
      ${sources ? `<h3>${t("whatLinksIt")}</h3><ul class="links">${sources}</ul>` : ""}
      ${tool.problems?.length ? `<div class="box problem"><h3>${tool.disconnected ? t("disconnected") : t("whatIsWrong")}</h3><ul class="links">${tool.problems.map((pb) => `<li>${escapeHtml(t("colon", pb.label, pb.reason ?? ""))}<br><small>${escapeHtml(t("since", shortDate(pb.since)))}</small><br><button class="health-action" data-key="${escapeHtml(pb.key)}" data-action="check">${t("reconnect")}</button> <button class="health-action danger" data-key="${escapeHtml(pb.key)}" data-action="remove">${t("remove")}</button></li>`).join("")}</ul></div>` : ""}
      <h3>${t("thisWeek")}</h3>
      ${tool.level === "extends"
        ? `<p>${detail?.fetched ? escapeHtml(t("fetchedThisWeek", detail.fetched)) : t("notFetchedThisWeek")}</p>`
        : tool.side === "uses"
          ? `<p>${detail?.readByClaude ? escapeHtml(t("readsByConversations", detail.readByClaude)) : t("noReadsThisWeek")}</p>${week && week.writes ? `<p>${escapeHtml(t("andWrittenThisWeek", kinds, week.notes.length))}</p>` : ""}`
          : `<p>${week && week.writes ? escapeHtml(t("writtenThisWeek", kinds, week.notes.length)) : t("nothingEntered")}</p>`}
      ${tool.access ? `<h3>${t("howClaudeReaches")}</h3><p>${escapeHtml(tool.access)}</p>` : ""}
      ${answer?.history?.length ? `<h3><a href="history.html?id=${encodeURIComponent(tool.id)}" target="_blank" rel="noopener" class="history-link">${t("historyLink")}</a></h3><ul class="runs preview">${answer.history.slice(0, 3).map(runLine).join("")}</ul>` : ""}`;
  paintLive();
}

/** The click of a button of the card, when the event is on one. @param {Event} ev @param {string} selector */
const buttonOf = (ev, selector) => /** @type {HTMLButtonElement | null} */ (closest(ev, selector));

/** Wires the buttons of a tool's card: refresh, open a folder, a database of the list, reconnect or remove. */
export function setUpToolCard() {
  // The card closes (Esc, the cross, a click beside it): the map goes back where it was.
  whenToolCardCloses(restoreView);
  // The "Refresh" button: the tool's sources run at the hub's next beat, in
  // less than a minute.
  panelContent.addEventListener("click", async (ev) => {
    const button = buttonOf(ev, ".now");
    if (!button) return;
    ev.preventDefault();
    button.disabled = true;
    button.textContent = t("launched");
    try {
      const answer = await runNow(button.dataset.tool ?? "");
      button.textContent = answer.ok ? t("leavesSoon") : t("nothingToRun");
    } catch {
      button.textContent = t("failed");
    }
    loadNext();
    setTimeout(() => { button.disabled = false; button.textContent = t("refresh"); }, 60_000);
  });
  // A folder the brain follows: show it in the computer's file manager.
  panelContent.addEventListener("click", async (ev) => {
    const button = buttonOf(ev, ".open-folder");
    if (!button) return;
    ev.preventDefault();
    const before = button.textContent ?? "";
    button.disabled = true;
    try {
      const answer = await openFolder(button.dataset.tool ?? "", button.dataset.index ?? 0);
      button.textContent = answer.ok ? t("openedInExplorer") : t("folderNotFound");
    } catch {
      button.textContent = t("failed");
    }
    setTimeout(() => { button.disabled = false; button.textContent = before || t("openInExplorer"); }, 2500);
  });
  // A database in the list of a parent: its own card.
  panelContent.addEventListener("click", (ev) => {
    const link = closest(ev, ".go-tool");
    if (!link) return;
    ev.preventDefault();
    chooseTool(link.dataset.tool ?? null);
  });
  // Reconnect (test again) or remove a connection that is broken.
  panelContent.addEventListener("click", async (ev) => {
    const button = buttonOf(ev, ".health-action");
    if (!button) return;
    ev.stopPropagation();
    const remove = button.dataset.action === "remove";
    if (remove && !(await confirmDialog({ title: t("removeConnectionTitle"), text: t("removeConnectionText"), yes: t("remove"), no: t("cancel") }))) return;
    button.disabled = true;
    button.textContent = remove ? t("removing") : t("testing");
    try {
      // The plugin's health check answers in its own shape: `ok`, and what is still `disconnected`.
      const answer = /** @type {{ ok?: boolean, disconnected?: unknown[] }} */ (await health(button.dataset.key ?? "", remove ? "remove" : "check"));
      button.textContent = remove ? (answer.ok ? t("removed") : t("failed")) : answer.disconnected?.length ? t("stillDisconnected") : t("reconnected");
    } catch {
      button.textContent = t("failed");
    }
    try {
      await loadTools();
    } catch {
      return; // a silent server: the button already says the failure, the circle of before stays
    }
    arrange();
    paint();
  });
}
