// filters.js: the box at the top left: the two views of the map, the layers
// (sources and bases, catalogue, contacts) and the filters (written or
// modified, AI memory, decisions, seeds, importance). What is ticked is remembered
// from one visit to the next.

import { getWeights, getWritten, redoTerritories } from "./api.js";
import { arrange } from "./arrange.js";
import { glideTo, overview } from "./camera.js";
import { loadContacts } from "./data.js";
import { applyFocus, loadExecutive } from "./executive.js";
import { $, $all, $input, $select } from "./dom.js";
import { t } from "./i18n.js";
import { confirmDialog, toast } from "./modal.js";
import { paintBackground } from "./paint-background.js";
import { paint, paintLive } from "./paint-live.js";
import { closePanel } from "./panel.js";
import { state } from "./state.js";
import { recall, remember } from "./storage.js";
import { onStatusChange, visibleSeeds } from "./validate.js";

/**
 * The background dims when a filter brings some notes forward in a colour of
 * its own. Not for the period ("Written or modified", 2026-11-22): the notes of
 * the period keep their own colours and the others nearly vanish (paint-background.js),
 * where a green over everything lost the colours of the domains.
 */
const dim = () => document.body.classList.toggle("dimmed", state.natureFilters.size > 0 || state.seedFilter);

// ------------------------------------------------------------ the views

function setUpViews() {
  for (const button of $all("#views button")) {
    button.addEventListener("click", () => {
      const view = /** @type {import("./state.js").View} */ (button.dataset.view);
      for (const other of $all("#views button")) other.classList.toggle("active", other === button);
      $("#redo-territories").hidden = view !== "semantic";
      if (state.view === view) return;
      state.view = view;
      arrange();
      paint();
    });
  }
  // Redo the territories: a new cutting, on request only.
  $("#redo-territories").addEventListener("click", async (ev) => {
    const button = /** @type {HTMLButtonElement} */ (ev.currentTarget);
    const ok = await confirmDialog({ title: t("redoTerritoriesTitle"), text: t("redoTerritoriesText"), yes: t("redo"), no: t("cancel") });
    if (!ok) return;
    button.disabled = true;
    button.classList.add("spinning");
    button.dataset.tip = t("cutting");
    try {
      state.territories = await redoTerritories();
      arrange();
      paint();
    } catch {
      // the cutting of before stays
    }
    button.disabled = false;
    button.classList.remove("spinning");
    button.dataset.tip = t("redoTerritories");
  });
}

// ------------------------------------------------------------ the layers

/**
 * A layer that does not load: the box is unticked and says so for a few
 * seconds, next to its name. What is remembered does not change.
 * @param {HTMLInputElement} box
 */
function refuseTick(box) {
  box.checked = false;
  const label = box.closest("label");
  if (!label || label.querySelector(".check-error")) return;
  const word = document.createElement("span");
  word.className = "check-error";
  word.textContent = t("unreadable");
  label.append(word);
  setTimeout(() => word.remove(), 4000);
}

/** The layers touch neither the zoom nor the framing. */
function setUpLayers() {
  $input("#layer-tools").addEventListener("change", (ev) => {
    state.showTools = /** @type {HTMLInputElement} */ (ev.target).checked;
    if (state.chosenTool) closePanel();
    arrange();
    paint();
  });
  $input("#layer-catalogue").addEventListener("change", (ev) => {
    state.showCatalogue = /** @type {HTMLInputElement} */ (ev.target).checked;
    arrange();
    paint();
  });
  // THE HARNESSES (2026-11-23): the crown of the person's skills and plugins
  // around the ring of tools, in either view (executive.js). It changes the
  // size of the map: the framing follows.
  $input("#layer-harnesses").addEventListener("change", async (ev) => {
    const box = /** @type {HTMLInputElement} */ (ev.target);
    state.showHarnesses = box.checked;
    if (state.showHarnesses) await loadExecutive();
    applyFocus();
    arrange();
    state.baseScale = overview().k;
    state.moved = false;
    glideTo(overview());
    paint();
  });
  $input("#layer-contacts").addEventListener("change", async (ev) => {
    const box = /** @type {HTMLInputElement} */ (ev.target);
    state.showContacts = box.checked;
    if (state.showContacts && !(await loadContacts())) {
      state.showContacts = false;
      refuseTick(box);
    }
    arrange();
    paint();
  });
  $input("#layer-importance").addEventListener("change", async (ev) => {
    const box = /** @type {HTMLInputElement} */ (ev.target);
    if (!box.checked) {
      state.weights = null;
      return void paintBackground();
    }
    try {
      const weights = await getWeights();
      const sorted = state.notes.map((n) => /** @type {[string, number]} */ ([n.id, weights[n.id] ?? 0])).sort((a, b) => a[1] - b[1]);
      state.weights = { rank: new Map(sorted.map(([id], i) => [id, sorted.length > 1 ? i / (sorted.length - 1) : 1])) };
    } catch {
      refuseTick(box);
      state.weights = null;
    }
    paintBackground();
  });
}

// ------------------------------------------------------------ the filters

const writtenChoice = $select("#filter-written");
/** The buttons of the period: they drive the hidden list, which is what is remembered. */
const periodButtons = () => $all(".period-choices button");

/** @type {ReturnType<typeof setTimeout> | undefined} the next midnight, for the "Today" period */
let midnight;

/** "Written or modified": since an hour, today, seven or thirty days. */
async function loadWritten() {
  const value = writtenChoice.value;
  const count = $("#period-count");
  count.textContent = "";
  count.classList.remove("check-error");
  clearTimeout(midnight);
  if (!value) {
    state.writtenSince = null;
  } else {
    const since = value === "day" ? new Date(new Date().setHours(0, 0, 0, 0)) : new Date(Date.now() - Number(value) * 3600_000);
    // TODAY ENDS AT MIDNIGHT (2026-11-21, audit 18). The start of "today" was
    // worked out once: a page left open past midnight showed yesterday's
    // writes as today's. The period is read again when the day changes.
    if (value === "day") {
      const next = new Date(since);
      next.setDate(next.getDate() + 1);
      midnight = setTimeout(() => { if (writtenChoice.value === "day") loadWritten(); }, Math.max(1000, next.getTime() - Date.now() + 1000));
    }
    try {
      const slugs = await getWritten(since.toISOString());
      state.writtenSince = { since: since.toISOString(), slugs: new Set(slugs) };
      count.textContent = t("notesCount", slugs.length);
    } catch {
      // (Said beside the period, audit 18: the filter used to stay as if
      // ticked, with nothing lit and nothing said.)
      state.writtenSince = null;
      count.textContent = t("writtenFailed");
      count.classList.add("check-error");
    }
  }
  dim();
  showSeedsCount();
  paintBackground();
  paintLive();
}

// ------------------------------------------------------------ the seeds

const seedsBox = $input("#filter-seeds");
// NO "VALIDATE THESE SEEDS" (2026-11-22). A button validated at once every
// seed the filters left: with no period chosen, all of them, after a single
// confirmation, and undone only one by one. To validate is to say "I read it,
// it is right": done in bulk, unread, it says nothing. A seed is validated on
// its card, or by Claude when the person names the notes (promote.mjs --notes).

/** How many seeds the filters leave, beside the box. */
export function showSeedsCount() {
  const n = state.seedFilter ? visibleSeeds().length : 0;
  $("#seeds-count").textContent = state.seedFilter ? t("notesCount", n) : "";
}

function setUpFilters() {
  for (const box of /** @type {HTMLInputElement[]} */ ($all(".nature-filter"))) box.addEventListener("change", () => {
    const nature = box.dataset.nature ?? "";
    if (box.checked) state.natureFilters.add(nature); else state.natureFilters.delete(nature);
    dim();
    showSeedsCount();
    paintLive();
  });
  seedsBox.addEventListener("change", () => {
    state.seedFilter = seedsBox.checked;
    dim();
    showSeedsCount();
    paintLive();
  });
  // A seed validated (here or on its card), or the map read again: the count follows.
  onStatusChange(showSeedsCount);
  writtenChoice.addEventListener("change", loadWritten);
  // The buttons of the period drive the hidden list; a list changed by what
  // was remembered updates them in return.
  for (const button of periodButtons()) button.addEventListener("click", () => {
    if (writtenChoice.value === button.dataset.v) return;
    writtenChoice.value = button.dataset.v ?? "";
    writtenChoice.dispatchEvent(new Event("change"));
  });
  writtenChoice.addEventListener("change", () => {
    for (const button of periodButtons()) {
      button.classList.toggle("active", button.dataset.v === writtenChoice.value);
      button.setAttribute("aria-checked", String(button.dataset.v === writtenChoice.value));
    }
  });
}

/** The box of the filters opens and closes; it remembers. */
function setUpFold() {
  const box = $("#filters");
  const head = $("#filters-head");
  if (recall("filters") === "closed") box.classList.add("closed");
  // Restored closed, the box also says so to screen readers.
  head.setAttribute("aria-expanded", String(!box.classList.contains("closed")));
  head.addEventListener("click", () => {
    const closed = box.classList.toggle("closed");
    head.setAttribute("aria-expanded", String(!closed));
    remember("filters", closed ? "closed" : "open");
  });
}

// ------------------------------------------------------------ what is remembered

// THE LAYERS AND THE FILTERS REMEMBER (2026-11-08): what was ticked, and the
// period of the "Written" filter, come back after a reload. A convenience of
// this browser: without local storage, the page starts from its defaults.

/** The controls that are remembered: the checkboxes of the box, and the period. */
const rememberedControls = () => /** @type {(HTMLInputElement | HTMLSelectElement)[]} */ ($all('#filters input[type="checkbox"], #filter-written')).filter((el) => el.id || el.dataset.nature);
/** @param {HTMLElement} el */
const controlKey = (el) => el.id || `nature-${el.dataset.nature}`;
/** @param {HTMLInputElement | HTMLSelectElement} el @returns {el is HTMLInputElement} */
const isCheckbox = (el) => el.type === "checkbox";

/** From the opening: a setting changed before the end of the loading counts too. */
function rememberLayers() {
  for (const el of rememberedControls()) {
    el.addEventListener("change", () => {
      /** @type {Record<string, boolean | string>} */
      const kept = {};
      for (const control of rememberedControls()) kept[controlKey(control)] = isCheckbox(control) ? control.checked : control.value;
      remember("layers", JSON.stringify(kept));
    });
  }
}

/** Puts back what was ticked at the last visit. Called once the map is there. */
export function restoreLayers() {
  /** @type {Record<string, boolean | string | undefined>} */
  let kept = {};
  try {
    kept = JSON.parse(recall("layers") ?? "{}");
  } catch {
    kept = {};
  }
  for (const el of rememberedControls()) {
    const value = kept[controlKey(el)];
    if (value !== undefined) {
      if (isCheckbox(el)) el.checked = Boolean(value); else el.value = String(value);
    }
    // ALWAYS read again, even without a visible change: on a reload the
    // browser ticks a box again by itself, and the state of the page stayed
    // the former one (seen on 2026-11-08: the Bases box ticked, the bases absent).
    el.dispatchEvent(new Event("change"));
  }
}

/** Wires the box at the top left: views, layers, filters, its fold, and what it remembers. */
export function setUpFilterBox() {
  setUpViews();
  setUpLayers();
  setUpFilters();
  setUpFold();
  rememberLayers();
}
