// settings.js: the settings page.
//
// THE SETTINGS PAGE (2026-11-09): opened by the round button at the bottom
// left, closed by "Back to the brain" or Esc. At the top, the sources with
// their circles; a click shows what can be set for that one: the rhythm of
// what collects it, and the judge that reads what it brings (model, hours,
// batches, its cap per day, what it never reads).

import { attempt, excludePattern, getSettings, saveSettings } from "./api.js";
import { loadNext } from "./data.js";
import { $, $all, closest } from "./dom.js";
import { escapeHtml, initials, numberOr } from "./format.js";
import { t } from "./i18n.js";
import { drawHeld, heldSlot, loadJudges } from "./judges.js";
import { hubNotice, loadSetup, noSourceNotice, onSetupDrawn, tokenNotice } from "./setup.js";
import { familyColor, realId, state, toolById } from "./state.js";
import { colors, logoColor } from "./theme.js";
import { keyIcon } from "./tool-card.js";

/** @typedef {import("../contract.d.ts").SettingsResponse} SettingsResponse */
/** @typedef {import("../contract.d.ts").JudgeSettings} JudgeSettings */
/** @typedef {import("../contract.d.ts").SettingsSaved} SettingsSaved */
/** @typedef {import("../contract.d.ts").SettingsQuery} SettingsQuery */
/** @typedef {import("./state.js").Tool} Tool */

/** The models a judge may use; what each is like is in the dictionary (`modelNote`). */
const MODELS = [{ id: "haiku", name: "Haiku" }, { id: "sonnet", name: "Sonnet" }, { id: "opus", name: "Opus" }];
/** What a server that does not answer amounts to. @type {SettingsSaved} */
const NOT_SAVED = { ok: false, error: "" };
/** The caps a judge may be given, in millions of tokens a day; 0 is no cap. */
const CAPS = [0, 1, 2, 5, 10, 20];

/** @type {SettingsResponse | null} the settings as last read, kept up to date with what is saved */
let settings = null;

/** The circle of a tool, as on the ring: its logo, else its initials. @param {Tool} tool */
function ringHtml(tool) {
  const logo = state.logos[tool.id];
  const raw = state.rawLogos[tool.id];
  let inside = `<b>${escapeHtml(initials(tool.name))}</b>`;
  if (logo && "image" in logo) inside = `<img src="${escapeHtml(logo.image.src)}" alt="">`;
  else if (logo) inside = `<svg viewBox="0 0 24 24"><path d="${escapeHtml(raw && "path" in raw ? raw.path : "")}" fill="${escapeHtml(logoColor(logo.hex))}"/></svg>`;
  return `<span class="ring" style="--c:${familyColor(tool, colors.unknown)}">${inside}</span>`;
}

/** Whether the settings were read and no tool has anything to set: no source, no judge. */
let nothingToSet = false;

/**
 * What the brain lacks to have anything to set, at the top of the page: no
 * source at all, and a hub that does not run (here even when nothing needs it
 * yet: it is where the rhythms are set). Each judge's card says when the
 * judge has no key to call Claude.
 */
function drawNotices() {
  if (!settingsAreOpen()) return;
  $("#settings-notices").innerHTML = (nothingToSet ? noSourceNotice() : "") + hubNotice({ always: true });
  for (const slot of $all(".token-slot")) slot.innerHTML = tokenNotice(slot.dataset.judge ?? "");
}

/**
 * Opens the settings page over the map: reads the settings, then shows the
 * tool whose card is open (2026-11-21: it always showed the first one), else
 * the first that has something to set.
 */
export async function openSettings() {
  document.body.classList.add("page-open");
  $("#settings").hidden = false;
  $("#settings-detail").innerHTML = "";
  $("#settings-notices").innerHTML = "";
  nothingToSet = false;
  const read = await attempt(getSettings());
  if (!read) {
    $("#settings-sources").innerHTML = `<p class="meta">${t("settingsUnreadable")}</p>`;
    return;
  }
  settings = read;
  // Where the judges stand right now (one may wait for an answer): read with the settings.
  loadJudges();
  // What the brain lacks (the hub may have been turned on since the page was loaded): read with the settings.
  loadSetup();
  // A parent tool (the folders) counts through its children. A tool that only
  // has a judge has something to set too.
  const ids = (/** @type {Tool} */ tool) => [tool.id, ...(tool.children ?? [])];
  const withSources = state.tools.filter((tool) => !tool.parent && [...(read.sources ?? []), ...(read.judges ?? [])].some((s) => ids(tool).some((id) => s.tools.includes(id))));
  nothingToSet = !withSources.length;
  drawNotices();
  if (!withSources.length) {
    $("#settings-sources").innerHTML = "";
    return;
  }
  $("#settings-sources").innerHTML = withSources.map((tool) => `<button class="source-pick" data-tool="${escapeHtml(tool.id)}">${ringHtml(tool)}<span>${escapeHtml(tool.name)}</span></button>`).join("");
  const open = realId(state.chosenTool);
  const wanted = withSources.find((tool) => tool.id === open || (tool.children ?? []).includes(open ?? "")) ?? withSources[0];
  chooseSetting(wanted.id);
}

/** Whether the settings page is open. */
export const settingsAreOpen = () => !$("#settings").hidden;

/** Closes the settings: back to the map. */
export function closeSettings() {
  $("#settings").hidden = true;
  document.body.classList.remove("page-open");
}

// PAUSING (2026-11-10): a collection or a judge that is stopped no longer
// runs by itself, and stays there. The state changes on the screen at once;
// the server follows, and if it refuses, the button comes back.
/** @param {string} name the source or the judge @param {boolean} paused */
const pauseButton = (name, paused) => `<button type="button" class="pause-button${paused ? " is-paused" : ""}" data-source="${escapeHtml(name)}" data-paused="${paused ? 1 : 0}" data-prefix="${escapeHtml(t("pausedPrefix"))}" data-tip="${escapeHtml(paused ? t("pausedTip") : t("pauseTip"))}">${paused ? t("resume") : t("pause")}</button>`;

/** @param {HTMLElement} button */
async function togglePause(button) {
  const name = button.dataset.source ?? "";
  const want = button.dataset.paused !== "1";
  const buttons = `.pause-button[data-source="${CSS.escape(name)}"]`;
  const put = (/** @type {boolean} */ paused) => {
    for (const x of $all(buttons)) x.outerHTML = pauseButton(name, paused);
    for (const list of [settings?.sources, settings?.judges]) for (const s of list ?? []) if (s.name === name) s.paused = paused;
  };
  put(want);
  const answer = (await attempt(saveSettings({ source: name, paused: want ? "1" : "0" }))) ?? NOT_SAVED;
  if (answer.ok) return void loadNext();
  put(!want);
  const mark = /** @type {HTMLElement | null | undefined} */ (document.querySelector(buttons)?.closest(".row, .setting-card")?.querySelector(".saved"));
  if (mark) {
    mark.textContent = t("notSaved", answer.error);
    mark.hidden = false;
    setTimeout(() => { mark.hidden = true; }, 4000);
  }
}

// THE CAP OF A DAY (2026-11-17): past that many tokens in a day, the judge
// stops until the next day. The list offers round caps; a cap written by hand
// in the judge's file that is none of them is offered too, as it is.
/** @param {JudgeSettings} j */
function capRow(j) {
  const caps = CAPS.includes(j.dailyTokens / 1e6) ? CAPS : [...CAPS, j.dailyTokens / 1e6].sort((a, b) => a - b);
  const options = caps.map((millions) => `<option value="${millions * 1e6}"${millions * 1e6 === j.dailyTokens ? " selected" : ""}>${escapeHtml(!millions ? t("capNone") : Number.isInteger(millions) ? t("capMillions", millions) : t("tokensWords", millions * 1e6))}</option>`).join("");
  return `<div class="row"><span>${t("dailyCap")} <span class="help-mark" tabindex="0" data-tip="${escapeHtml(t("capTip", j.spentToday))}">?</span></span><select data-field="dailyTokens" aria-label="${escapeHtml(t("dailyCap"))}">${options}</select>${capNote(j)}</div>`;
}
/** Beside the cap: what the judge used today, or that it reached its cap. @param {JudgeSettings} j */
const capNote = (j) => `<span class="field-note cap-note${j.capped ? " warn" : ""}">${escapeHtml(j.capped ? t("capReached") : t("capSpent", j.spentToday))}</span>`;

// WHAT A JUDGE NEVER READS (2026-11-17): a list of patterns, each with its
// cross, and a field to add one. The plugin keeps the list (and takes out of
// the judge's pile what a new pattern covers).
// A LONG PATH IS CUT IN ITS MIDDLE (2026-11-21): cut at its end, two
// exclusions that only differ by their last folder read the same. Its start
// and its end stay; the whole path shows on hover.
const MIDDLE_MAX = 52;
/** @param {string} text @returns {string} */
const middle = (text) => (text.length > MIDDLE_MAX ? `${text.slice(0, 20)}…${text.slice(-(MIDDLE_MAX - 21))}` : text);
/** @param {string[]} patterns */
const excludeList = (patterns) => `<div class="exclude-list">${patterns.length
  ? patterns.map((pattern) => `<span class="exclude-chip"><code${pattern.length > MIDDLE_MAX ? ` data-tip="${escapeHtml(pattern)}"` : ""}>${escapeHtml(middle(pattern))}</code><button type="button" class="exclude-remove" data-pattern="${escapeHtml(pattern)}" aria-label="${escapeHtml(t("excludeRemoveTip", pattern))}" data-tip="${escapeHtml(t("excludeRemoveTip", pattern))}">×</button></span>`).join("")
  : `<span class="field-note">${t("excludeNone")}</span>`}</div>`;
/** @param {JudgeSettings} j */
const excludeRow = (j) => `<div class="row exclude-row"><span>${t("neverRead")} <span class="help-mark" tabindex="0" data-tip="${escapeHtml(t("neverReadTip"))}">?</span></span><div class="exclude-body">${excludeList(j.exclude ?? [])}<form class="exclude-add"><input type="text" autocomplete="off" spellcheck="false" maxlength="300" aria-label="${escapeHtml(t("excludeAddLabel"))}" placeholder="${escapeHtml(t("excludePlaceholder"))}"><button type="submit">${t("add")}</button></form><p class="exclude-note" hidden></p></div></div>`;

/** The card of a judge, if it is on the screen. @param {string} name */
const judgeCard = (name) => /** @type {HTMLElement | null} */ (document.querySelector(`.setting-card[data-source="${CSS.escape(name)}"]`));

/**
 * Writes a judge's exclusions again in its card, and says something under them for a few seconds.
 * @param {JudgeSettings} judge
 * @param {string} [text]
 * @param {boolean} [failed]
 */
function drawExclusions(judge, text = "", failed = false) {
  const card = judgeCard(judge.name);
  const list = card?.querySelector(".exclude-list");
  if (!card || !list) return;
  list.outerHTML = excludeList(judge.exclude);
  const note = /** @type {HTMLElement} */ (card.querySelector(".exclude-note"));
  note.textContent = text;
  note.classList.toggle("failed", failed);
  note.hidden = !text;
  if (text) setTimeout(() => { if (note.textContent === text) note.hidden = true; }, 6000);
}

/**
 * Adds or removes one exclusion: the list changes at once; the server
 * follows, and if it refuses, the list comes back with the reason.
 * @param {string} name the judge
 * @param {"add" | "remove"} action
 * @param {string} pattern
 * @param {HTMLInputElement | null} [field] the field the pattern was typed in
 */
async function changeExclusion(name, action, pattern, field = null) {
  const judge = settings?.judges?.find((x) => x.name === name);
  if (!judge || !pattern) return;
  const before = judge.exclude ?? [];
  if (action === "add" && before.includes(pattern)) return drawExclusions(judge, t("excludeAlready"));
  judge.exclude = action === "add" ? [...before, pattern] : before.filter((x) => x !== pattern);
  if (field) field.value = "";
  drawExclusions(judge);
  const answer = await attempt(excludePattern(name, action, pattern));
  if (answer?.ok) {
    judge.exclude = answer.exclude;
    drawExclusions(judge, action === "add" ? t("excludeAdded", answer.removed) : t("excludeRemoved"));
    // What left the pile changes what waits, and maybe a judge that was held.
    loadJudges();
    return void loadNext();
  }
  judge.exclude = before;
  // What was typed comes back, unless something else was typed meanwhile.
  if (field && !field.value) field.value = pattern;
  drawExclusions(judge, t("notDone", answer ? t("judgeRefusal", answer.code) ?? answer.error : t("judgeRefusal", "no-answer")), true);
}

/**
 * Saves the cap of a judge: what the card says follows at once; if the server refuses, the list goes back.
 * @param {HTMLSelectElement} select
 */
async function saveCap(select) {
  const card = /** @type {HTMLElement | null} */ (select.closest(".setting-card"));
  const judge = settings?.judges?.find((x) => x.name === card?.dataset.source);
  if (!card || !judge) return;
  const before = judge.dailyTokens;
  const put = (/** @type {number} */ cap) => {
    judge.dailyTokens = cap;
    judge.capped = cap > 0 && judge.spentToday >= cap;
    const note = judgeCard(judge.name)?.querySelector(".cap-note");
    if (note) note.outerHTML = capNote(judge);
  };
  put(Number(select.value));
  const answer = (await attempt(saveSettings({ source: judge.name, dailyTokens: select.value }))) ?? NOT_SAVED;
  if (!answer.ok) {
    put(before);
    select.value = String(before);
  }
  const mark = /** @type {HTMLElement | null} */ (judgeCard(judge.name)?.querySelector(".saved"));
  if (mark) {
    mark.textContent = answer.ok ? t("saved") : t("notSaved", answer.error);
    mark.hidden = false;
    setTimeout(() => { mark.hidden = true; }, 3000);
  }
  if (answer.ok) { loadJudges(); loadNext(); }
}

/** Shows what can be set for one tool: what collects it, and its judges. @param {string} id */
function chooseSetting(id) {
  if (!settings) return;
  for (const button of $all(".source-pick")) button.classList.toggle("active", button.dataset.tool === id);
  const tool = toolById(id);
  const ids = [id, ...(tool?.children ?? [])];
  const own = (settings.sources ?? []).filter((s) => ids.some((i) => s.tools.includes(i)));
  const judges = (settings.judges ?? []).filter((j) => j.tools.includes(id));
  // Each collection of the source, and its rhythm, which can be set (the server says which ones are allowed).
  // A source that needs a key while the vault is closed: the same small key as on the ring.
  const waitsForVault = (/** @type {string} */ name) => Object.values(state.nextRuns).some((run) => run.vaultSources?.includes(name));
  const rows = own.map((s) => `<div class="row" data-source="${escapeHtml(s.name)}"><span class="collector-name">${escapeHtml(s.name)}${s.description ? `<span class="help-mark" tabindex="0" data-tip="${escapeHtml(s.description)}">?</span>` : ""}${waitsForVault(s.name) ? ` <span class="waits-vault" data-tip="${escapeHtml(t("waitsForVault"))}">${keyIcon()}</span>` : ""}</span><select data-field="every" aria-label="${escapeHtml(t("rhythmOf", s.name))}">${(s.choices ?? []).map((choice) => `<option value="${escapeHtml(choice)}"${choice === s.every ? " selected" : ""}>${escapeHtml(t("rhythm", choice))}</option>`).join("")}</select>${pauseButton(s.name, s.paused)}<span class="saved" hidden></span></div>`).join("");
  const nameOf = (/** @type {string} */ toolId) => toolById(toolId)?.name ?? toolId;
  const cards = judges.map((j) => {
    const model = MODELS.find((x) => x.id === j.model) ?? MODELS[1];
    const shared = j.tools.filter((toolId) => toolId !== id).map(nameOf);
    const from = `<input type="number" min="0" max="23" data-field="from" aria-label="${escapeHtml(t("workingHoursStart"))}" value="${numberOr(j.hours?.[0], 7)}">`;
    const to = `<input type="number" min="1" max="24" data-field="to" aria-label="${escapeHtml(t("workingHoursEnd"))}" value="${numberOr(j.hours?.[1], 24)}">`;
    return `<div class="setting-card" data-source="${escapeHtml(j.name)}">
        <h3>${t("itsJudge")} <span class="help-mark" tabindex="0" data-tip="${escapeHtml(t("judgeTip"))}">?</span>${pauseButton(j.name, j.paused)}</h3>${shared.length ? `<p class="desc">${escapeHtml(t("judgeAlso", shared.join(", ")))}</p>` : ""}
        ${heldSlot(j.name)}
        <div class="token-slot" data-judge="${escapeHtml(j.name)}">${tokenNotice(j.name)}</div>
        <div class="row"><span>${t("model")}</span><div class="model-choice">${MODELS.map((x) => `<button type="button" data-model="${x.id}" class="${x.id === model.id ? "active" : ""}">${x.name}</button>`).join("")}</div><span class="field-note">${escapeHtml(t("modelNote", model.id))}</span></div>
        <div class="row"><span>${t("workingHours")}</span>${t("workingHoursHtml", from, to)}</div>
        <div class="row"><span>${t("itemsPerRun")}</span><input type="number" min="1" max="30" data-field="batch" aria-label="${escapeHtml(t("itemsPerRun"))}" value="${numberOr(j.batch, 15)}"><span class="field-note">${t("itemsPerRunNote")}</span></div>
        ${capRow(j)}
        ${excludeRow(j)}
        <div class="row"><span class="saved" hidden>${t("saved")}</span></div>
      </div>`;
  }).join("");
  $("#settings-detail").innerHTML = `<div class="setting-card collectors"><h3>${escapeHtml(tool?.name ?? id)}</h3><p class="desc">${t("collectorsIntro")}</p>${rows}</div>${cards || `<p class="meta">${t("noJudge")}</p>`}`;
  // A judge that waits for an answer says so in its card.
  drawHeld();
}

/**
 * Shows a judge's model in its card: the button lit, and what the model is like.
 * @param {HTMLElement} card
 * @param {string} model
 */
function showModel(card, model) {
  for (const other of $all(".model-choice button", card)) other.classList.toggle("active", other.dataset.model === model);
  /** @type {HTMLElement} */ (card.querySelector(".field-note")).textContent = t("modelNote", model);
}

/**
 * Shows a judge's numbers in its card: its batch and its hours.
 * @param {HTMLElement} card
 * @param {JudgeSettings} judge
 */
function showNumbers(card, judge) {
  const put = (/** @type {string} */ field, /** @type {number} */ value) => { /** @type {HTMLInputElement} */ (card.querySelector(`[data-field="${field}"]`)).value = String(value); };
  put("batch", numberOr(judge.batch, 15));
  put("from", numberOr(judge.hours?.[0], 7));
  put("to", numberOr(judge.hours?.[1], 24));
}

/**
 * Saves a judge's setting, and says so in its card for three seconds.
 * REFUSED, IT GOES BACK (2026-11-21, audit 6): the card showed the new model,
 * hours or batch after a refusal (a server restarting, an end before the
 * start), as if they were kept. The values of before come back; saved, the
 * card shows what the server really kept (a batch of 40 is kept as 30).
 * @param {HTMLElement} card
 * @param {Omit<SettingsQuery, "source">} fields
 */
async function saveJudge(card, fields) {
  const answer = (await attempt(saveSettings({ source: card.dataset.source ?? "", ...fields }))) ?? NOT_SAVED;
  const mark = /** @type {HTMLElement} */ (card.querySelector(".saved"));
  mark.textContent = answer.ok ? t("savedNextRun") : t("notSaved", answer.error);
  mark.hidden = false;
  setTimeout(() => { mark.hidden = true; }, 3000);
  // The setting stays right if one comes back to another source of the same judge.
  const judge = settings?.judges?.find((x) => x.name === card.dataset.source);
  if (!judge) return;
  if (answer.ok) {
    if (fields.model) judge.model = answer.model ?? fields.model;
    if (fields.batch) judge.batch = answer.batch ?? Number(fields.batch);
    if (fields.from) judge.hours = answer.hours ?? [Number(fields.from), Number(fields.to)];
  }
  if (fields.model) showModel(card, judge.model);
  if (fields.batch || fields.from) showNumbers(card, judge);
}

/** Wires the settings page: its round button, its sources, and what is saved on a change. */
export function setUpSettings() {
  // (The round button stands just above the activity panel: layout.js places it, 2026-11-24.)
  $("#open-settings").addEventListener("click", openSettings);
  onSetupDrawn(drawNotices);
  $("#settings-close").addEventListener("click", closeSettings);

  $("#settings-sources").addEventListener("click", (ev) => {
    const button = closest(ev, ".source-pick");
    if (button) chooseSetting(button.dataset.tool ?? "");
  });
  $("#settings-detail").addEventListener("click", (ev) => {
    const pause = closest(ev, ".pause-button");
    if (pause) return void togglePause(pause);
    const cross = closest(ev, ".exclude-remove");
    if (cross) return void changeExclusion(/** @type {HTMLElement | null} */ (cross.closest(".setting-card"))?.dataset.source ?? "", "remove", cross.dataset.pattern ?? "");
    const button = closest(ev, ".model-choice button");
    const card = /** @type {HTMLElement | null | undefined} */ (button?.closest(".setting-card"));
    if (!button || !card) return;
    const model = button.dataset.model ?? "";
    showModel(card, model);
    saveJudge(card, { model });
  });
  // A pattern typed in "Never read": Enter or the button adds it.
  $("#settings-detail").addEventListener("submit", (ev) => {
    const form = closest(ev, ".exclude-add");
    if (!form) return;
    ev.preventDefault();
    const field = /** @type {HTMLInputElement} */ (form.querySelector("input"));
    changeExclusion(/** @type {HTMLElement | null} */ (form.closest(".setting-card"))?.dataset.source ?? "", "add", field.value.trim(), field);
  });
  $("#settings-detail").addEventListener("change", async (ev) => {
    const cap = /** @type {HTMLSelectElement | null} */ (closest(ev, "select[data-field='dailyTokens']"));
    if (cap) return void saveCap(cap);
    // The rhythm of a collection: a source.json of its own.
    const select = /** @type {HTMLSelectElement | null} */ (closest(ev, "select[data-field='every']"));
    const row = /** @type {HTMLElement | null | undefined} */ (select?.closest(".row"));
    if (select && row) {
      const answer = (await attempt(saveSettings({ source: row.dataset.source ?? "", every: select.value }))) ?? NOT_SAVED;
      const mark = /** @type {HTMLElement} */ (row.querySelector(".saved"));
      mark.textContent = answer.ok ? t("saved") : t("notSaved", answer.error);
      mark.hidden = false;
      setTimeout(() => { mark.hidden = true; }, 3000);
      const source = settings?.sources?.find((x) => x.name === row.dataset.source);
      // (Refused: the rhythm of before comes back, audit 6.)
      if (source && answer.ok) source.every = select.value;
      else if (source) select.value = source.every;
      return;
    }
    const card = /** @type {HTMLElement | null | undefined} */ (closest(ev, "input[data-field]")?.closest(".setting-card"));
    if (!card) return;
    const value = (/** @type {string} */ field) => /** @type {HTMLInputElement} */ (card.querySelector(`[data-field="${field}"]`)).value;
    saveJudge(card, { batch: value("batch"), from: value("from"), to: value("to") });
  });
}
