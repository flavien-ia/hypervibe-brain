// history.js: the history window of a tool (history.html?id=<tool>).
//
// THE HISTORY OF A TOOL (2026-11-08): every run of its sources over the last
// thirty days, grouped by day, with why each ran, what it did and the notes
// it wrote. Each write of the machine can be taken back from here.

import { attempt, getChange, getHistory, openStream, undoWrite } from "./api.js";
import { $, $all, closest } from "./dom.js";
import { FIGURES, FULL_DAY, clock, escapeHtml, formatDate, outcome, runTime, wordUndone, wordWhy } from "./format.js";
import { startLanguage, t } from "./i18n.js";
import { startIcons } from "./icones-hypervibe.js";
import { confirmDialog } from "./modal.js";
import { closeTooltip } from "./tooltip.js";

/** @typedef {import("../contract.d.ts").Run} Run */
/** @typedef {import("../contract.d.ts").WrittenNote} WrittenNote */

const toolId = new URLSearchParams(location.search).get("id") ?? "";
/** @type {Run[]} every run, the most recent first */
let runs = [];
/** The source the list is narrowed to; "" for all. */
let chosenSource = "";
/** @type {Set<string>} the writes being taken back, by id: shown as undone at once, before the brain has answered */
const pending = new Set();
/** @type {Map<string, string>} the id of a write that was not taken back -> why, worded */
const refusals = new Map();

/** @param {Run} run @returns {string} what tells a run from the others in the list */
const runKey = (run) => `${run.source}|${run.start}`;

/**
 * One note a run wrote: its name (a click unfolds the change), the kind of
 * write, then what can still be done about it: the Undo button for a write of
 * the machine, or when it was taken back. An edit by hand, or a kind that is
 * not undone, shows neither.
 * @param {WrittenNote} write
 * @param {Run} run
 */
function writeItem(write, run) {
  const id = write.id ?? "";
  const state = id && pending.has(id) ? ` · ${escapeHtml(t("undone"))}`
    : write.undone ? ` · ${escapeHtml(wordUndone(write.undone))}`
    : id && write.undoable ? ` <button class="undo" data-id="${escapeHtml(id)}" data-tip="${escapeHtml(t("undoTip", write.what))}">${escapeHtml(t("undo"))}</button>`
    : "";
  return `<span class="write"${id ? ` data-id="${escapeHtml(id)}"` : ""}><button class="see-change" data-note="${escapeHtml(write.note)}" data-at="${escapeHtml(write.at ?? run.start)}" data-tip="${escapeHtml(t("seeChange"))}">${escapeHtml(write.note)}</button> (${escapeHtml(t("writeWord", write.what))})${state}</span>`;
}

/** @param {Run} run */
function runItem(run) {
  const done = outcome([run.created && t("countCreated", run.created), run.updated && t("countUpdated", run.updated), run.zones && t("countZones", run.zones), run.entries && t("countInCatalogue", run.entries), run.contacts && t("countContacts", run.contacts), run.judged !== undefined && t("countItemsJudged", run.judged)]);
  const status = run.interrupted ? t("runInterrupted") : !run.end ? t("runRunning") : run.ok === false ? t("runFailed") : done || t("nothingNew");
  const seconds = run.end ? Math.round((Date.parse(run.end) - Date.parse(run.start)) / 1000) : null;
  // The colour of the edge: green when it did something, red when it failed, grey when there was nothing new.
  const kind = !run.end ? "" : run.ok === false ? "failed" : done ? "" : "nothing";
  const written = run.written ?? [];
  const notes = written.map((write) => writeItem(write, run)).join(", ");
  // A write that was not taken back says why, under the notes of its run.
  const refused = written.map((write) => { const why = refusals.get(write.id ?? ""); return why ? `<p class="refusal" role="status">${escapeHtml(write.note)} · ${escapeHtml(why)}</p>` : ""; }).join("");
  return `<li class="${kind}" data-run="${escapeHtml(runKey(run))}"><div class="line"><span class="time">${clock(run.start)}</span><span class="source">${escapeHtml(run.source)}</span>${run.why ? `<span class="why">${escapeHtml(wordWhy(run.why))}</span>` : ""}</div>`
    + `<div class="detail">${escapeHtml(status)}${seconds !== null ? ` · ${runTime(seconds)}` : ""}${run.items ? ` · ${escapeHtml(t("itemsRead", run.items))}` : ""}</div>`
    + (notes ? `<div class="notes">${notes}${run.writtenCount > written.length ? ` ${t("andOthers", run.writtenCount - written.length)}` : ""}</div>` : "")
    + refused
    + "</li>";
}

/**
 * Writes one run again where it stands in the list, its unfolded changes
 * kept. A run the source filter hides is written by the next render().
 * @param {Run} run
 * @param {string} [focusId] the write to give the keyboard back to
 */
function refreshRun(run, focusId = "") {
  const item = $all("#runs li").find((li) => li.dataset.run === runKey(run));
  if (!item) return;
  const holder = document.createElement("template");
  holder.innerHTML = runItem(run);
  const fresh = /** @type {HTMLElement} */ (holder.content.firstElementChild);
  fresh.append(...item.querySelectorAll(":scope > .change"));
  item.replaceWith(fresh);
  if (!focusId) return;
  const write = fresh.querySelector(`.write[data-id="${CSS.escape(focusId)}"]`);
  /** @type {HTMLElement | null | undefined} */ (write?.querySelector(".undo") ?? write?.querySelector("button"))?.focus();
}

/** Writes the list: the runs of the chosen source (or all), a heading per day. */
function render() {
  const shown = chosenSource ? runs.filter((run) => run.source === chosenSource) : runs;
  if (!shown.length) { $("#runs").innerHTML = `<p class="empty">${t("noRunInThirtyDays")}</p>`; return; }
  let day = "";
  let html = "";
  for (const run of shown) {
    const runDay = formatDate(run.start, FULL_DAY);
    if (runDay !== day) { if (day) html += "</ol>"; html += `<p class="day">${escapeHtml(runDay)}</p><ol>`; day = runDay; }
    html += runItem(run);
  }
  $("#runs").innerHTML = `${html}</ol>`;
}

// WHAT CHANGED (2026-11-09): a click on a note unfolds its change, read in
// git; a second click folds it back.
document.addEventListener("click", async (ev) => {
  const button = closest(ev, ".see-change");
  const item = button?.closest("li");
  if (!button || !item) return;
  const note = button.dataset.note ?? "";
  const already = item.querySelector(`.change[data-note="${CSS.escape(note)}"]`);
  if (already) { already.remove(); return; }
  const block = document.createElement("div");
  block.className = "change";
  block.dataset.note = note;
  block.innerHTML = `<p class="diff-head">${t("loadingShort")}</p>`;
  item.append(block);
  try {
    const change = await getChange(note, button.dataset.at ?? "");
    if ("error" in change) { block.innerHTML = `<p class="diff-head">${escapeHtml(change.error)}</p>`; return; }
    const lines = String(change.diff || "").split("\n").filter((l) => !/^(diff --git|index |--- a\/|\+\+\+ b\/)/.test(l));
    const html = lines.map((l) => l.startsWith("+") ? `<span class="plus">${escapeHtml(l)}</span>` : l.startsWith("-") ? `<span class="minus">${escapeHtml(l)}</span>` : l.startsWith("@@") ? `<span class="hunk">${escapeHtml(l)}</span>` : `${escapeHtml(l)}\n`).join("");
    block.innerHTML = `<p class="diff-head">${escapeHtml(change.rel)} · ${change.commit ? escapeHtml(t("changeSaved", change.commit, formatDate(change.when ?? "", FIGURES))) : t("changeNotSaved")}</p>${html ? `<pre class="diff">${html}</pre>` : `<p class="diff-head">${t("noVisibleChange")}</p>`}`;
  } catch {
    block.innerHTML = `<p class="diff-head">${t("changeUnreadable")}</p>`;
  }
});

// UNDO (2026-11-16): one write of the machine is taken back, after a
// confirmation that says what will happen to the note. The line says "Undone"
// at once, then the brain is asked (the plugin's undo, through the server);
// when it refuses, the line comes back as it was, with the reason under it.
/**
 * @param {Run} run
 * @param {WrittenNote} write
 * @param {boolean} byKeyboard the button was pressed from the keyboard: the focus goes back to the line
 */
async function undo(run, write, byKeyboard) {
  const id = write.id ?? "";
  if (!id || pending.has(id)) return;
  closeTooltip();
  const agreed = await confirmDialog({ title: t("undoTitle"), text: t("undoText", write.what, write.title ?? write.note), yes: t("undoYes"), no: t("undoKeep") });
  if (!agreed) return;
  const focusId = byKeyboard ? id : "";
  pending.add(id);
  refusals.delete(id);
  refreshRun(run, focusId);
  const answer = await attempt(undoWrite(id));
  pending.delete(id);
  if (answer?.ok) Object.assign(write, { undone: answer.at, undoable: false });
  else if (!write.undone) {
    // (A line the stream marked meanwhile is undone, whatever this answer says.)
    // Taken back elsewhere (another window, the weekly letter): the line is
    // undone all the same, at the date the journal gives.
    const when = answer?.code === "already-undone" ? (await attempt(getHistory(toolId)))?.runs.flatMap((other) => other.written).find((other) => other.id === id)?.undone : null;
    if (when) Object.assign(write, { undone: when, undoable: false });
    else refusals.set(id, !answer ? t("undoNoServer") : t("undoRefusal", answer.code) ?? t("undoRefused"));
  }
  refreshRun(run, focusId);
}

document.addEventListener("click", (ev) => {
  const button = closest(ev, ".undo");
  if (!button) return;
  const run = runs.find((one) => runKey(one) === button.closest("li")?.dataset.run);
  const write = run?.written.find((one) => one.id === button.dataset.id);
  // (A click made with the keyboard carries no count of clicks.)
  if (run && write) undo(run, write, /** @type {MouseEvent} */ (ev).detail === 0);
});

/**
 * A write taken back from another window: its line says so here too.
 * @param {string} id
 * @param {string} at
 */
function markUndone(id, at) {
  for (const run of runs) {
    const write = run.written.find((one) => one.id === id);
    if (!write) continue;
    if (!write.undone) {
      Object.assign(write, { undone: at, undoable: false });
      refusals.delete(id);
      // (This window's own undo writes the line when its answer comes.)
      if (!pending.has(id)) refreshRun(run);
    }
    return;
  }
}

// Esc closes the tooltip (the modal keeps its own Esc; here, there is no other layer to close).
addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeTooltip(); });

await startLanguage({ fresh: true });
// The icons of the design system (2026-11-24).
startIcons();
try {
  const answer = await getHistory(toolId);
  runs = answer.runs ?? [];
  document.title = t("historyTitle", answer.name);
  $("#title").textContent = t("historyOf", answer.name);
  const sources = [...new Set(runs.map((run) => run.source))];
  $("#meta").textContent = t("runsOverThirtyDays", runs.length, sources.length);
  if (sources.length > 1) {
    const filter = $("#sources");
    filter.innerHTML = [`<button data-s="" class="active">${t("allSources")}</button>`, ...sources.map((s) => `<button data-s="${escapeHtml(s)}">${escapeHtml(s)}</button>`)].join("");
    filter.addEventListener("click", (ev) => {
      const button = closest(ev, "button");
      if (!button) return;
      chosenSource = button.dataset.s ?? "";
      for (const other of $all("button", filter)) other.classList.toggle("active", other === button);
      render();
    });
  }
  render();
  // The stream, for the writes taken back elsewhere. A window that listens
  // also counts as open for the server, which then stays up for its undo.
  openStream({ undone: ({ id, at }) => markUndone(id, at) });
} catch {
  $("#meta").textContent = t("historyUnreadable");
}
