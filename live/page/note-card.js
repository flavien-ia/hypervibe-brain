// note-card.js: the card of a note, and those of what has no note: an entry
// of the catalogue, a contact of the directory, each read where it lives.

import { attempt, fetchData, getNote, openNoteFile, refreshIndex } from "./api.js";
import { flyTo } from "./camera.js";
import { closest } from "./dom.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { domainName, typeName } from "./map.js";
import { renderBody } from "./markdown.js";
import { toast } from "./modal.js";
import { paintBackground } from "./paint-background.js";
import { liveMarks, onLiveMarks, paintLive } from "./paint-live.js";
import { panel, panelContent } from "./panel.js";
import { NATURE_COLORS, state, toolById } from "./state.js";
import { isSeed, isTrusted, nextSeed, onStatusChange, setStatus } from "./validate.js";
import { colors } from "./theme.js";

/** @typedef {import("./state.js").Dust} Dust */
/**
 * What the page reads of a note as the plugin's engine gives it (GET /api/note).
 * @typedef {object} NoteAnswer
 * @property {string} [error]
 * @property {string} [created]
 * @property {string} [updated]
 * @property {string} [status]
 * @property {string} [nature]
 * @property {string[]} [data] the addresses where its data lives
 * @property {string} [body]
 * @property {string} [source]
 * @property {true} [stale] the index is behind this note: the page asks for it to be brought up to date
 * @property {{ slug: string, title: string, type: string }[]} [links]
 * @property {{ slug: string, title: string, type: string }[]} [backlinks]
 */
/** What the page reads of a piece of data as the plugin gives it (POST /api/fetch). @typedef {{ error?: string, warning?: string, data?: unknown }} DataAnswer */

/**
 * The line of a note's status: a seed can be validated, a validated note put
 * back as a seed; the next seed is one click (or N) away.
 * @param {string} slug
 * @returns {string}
 */
function statusRow(slug) {
  const status = state.noteById.get(slug)?.status;
  const next = nextSeed(slug);
  const nextButton = next ? ` <button type="button" class="next-seed" data-tip="${escapeHtml(t("nextSeedTip"))}">${escapeHtml(t("nextSeed"))}</button>` : "";
  if (isSeed(status)) return `<span class="tag">${t("seedTag")}</span> <button type="button" class="validate-note" data-note="${escapeHtml(slug)}" data-tip="${escapeHtml(t("validateNoteTip"))}">${escapeHtml(t("validateNote"))}</button>${nextButton}`;
  if (isTrusted(status)) return `<span class="tag validated">${escapeHtml(t("validatedTag"))}</span> <a href="#" class="back-to-seed" data-note="${escapeHtml(slug)}">${escapeHtml(t("backToSeed"))}</a>${nextButton}`;
  return nextButton.trim();
}

/** Writes the status line of the open note again (its status changed). */
function redrawStatus() {
  const slug = state.selection;
  const row = panelContent.querySelector(".status-row");
  if (!slug || !row) return;
  row.innerHTML = statusRow(slug);
  const word = panelContent.querySelector(".status-word");
  const status = state.noteById.get(slug)?.status;
  if (word && status) word.textContent = t("statusName", status);
}

/** How long ago, in words that move: "à l'instant", "il y a 12 s", "il y a 3 min". @param {string} at */
const ago = (at) => {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(at)) / 1000));
  return s < 5 ? t("justNow") : s < 60 ? t("secondsAgo", s) : t("minutesAgo", Math.round(s / 60));
};
/** The circle the map shows on the open note, and what it means; nothing when the map shows none. */
function showLiveMark() {
  const box = document.getElementById("note-live");
  if (!box) return;
  const mark = state.selection ? liveMarks.get(state.selection) : undefined;
  if (!mark) {
    if (!box.hidden) { box.hidden = true; box.innerHTML = ""; }
    return;
  }
  const ring = mark.kind === "found" ? `border:2px solid ${mark.color};background:transparent` : `background:${mark.color};border:2px solid ${mark.kind === "written" ? mark.color : colors.rim}`;
  const html = `<span class="live-dot" style="${ring};box-shadow:0 0 10px ${mark.color}"></span>${escapeHtml(t(`liveMark_${mark.kind}`, mark.who, ago(mark.at)))}`;
  if (box.innerHTML !== html) box.innerHTML = html;
  box.hidden = false;
}
onLiveMarks(showLiveMark);

/**
 * Validates the open note, or puts it back as a seed (the button, the V key).
 * @param {string} slug
 * @param {"trusted" | "seed"} to
 */
export async function changeStatus(slug, to) {
  const done = await setStatus(slug, to);
  if (!done.ok) toast(done.why);
}

/** The next seed, the most linked to of those left (the button, the N key). */
export function openNextSeed() {
  const next = nextSeed(state.selection);
  if (next) chooseNote(next, { fly: true });
  else toast(t("noSeedLeft"));
}

/**
 * Opens the card of a note.
 * @param {string} slug
 * @param {{ fly?: boolean }} [how] `fly`: the view slides to the note
 */
export async function chooseNote(slug, { fly = false } = {}) {
  const n = state.noteById.get(slug);
  if (!n) return;
  state.selection = slug;
  if (state.chosenTool) { state.chosenTool = null; paintBackground(); }
  paintLive();
  if (fly) flyTo(slug);
  panel.hidden = false;
  const head = `<h2>${escapeHtml(n.title)}</h2><p class="meta">${escapeHtml(typeName(n.type))} · ${escapeHtml(n.domains.map(domainName).join(", "))}${n.status ? ` · <span class="status-word">${escapeHtml(t("statusName", n.status))}</span>` : ""}</p>`;
  panelContent.innerHTML = `${head}<p class="meta">${t("readingNote")}</p>`;
  const note = /** @type {NoteAnswer | null} */ (await attempt(getNote(slug)));
  if (state.selection !== slug) return;
  if (!note) { panelContent.innerHTML = `${head}<p class="meta error">${t("noteUnreadable")}</p>`; return; }
  // The index is behind this note (it changed since): the reading started
  // nothing, the page asks for the index to be brought up to date.
  if (note.stale) refreshIndex().catch(() => {});
  // The map's status first: it is the one the person may just have changed.
  if (!n.status && note.status) n.status = note.status;
  const links = [...(note.links ?? []), ...(note.backlinks ?? [])].filter((x, i, all) => all.findIndex((other) => other.slug === x.slug) === i);
  // (2026-11-24) The nature's pill carries its colour in --c: the design draws it as a tint and a dot of that colour,
  // never as a coloured border (theme-hypervibe.css).
  panelContent.innerHTML = `
      ${head}
      ${note.created ? `<p class="meta">${escapeHtml(t("noteCreated", note.created, note.updated))}</p>` : ""}
      <p class="live-mark" id="note-live" hidden></p>
      <p class="status-row">${statusRow(slug)}</p>
      ${note.nature ? `<p class="tag nature-tag" style="--c:${NATURE_COLORS[note.nature] ?? colors.mark}">${escapeHtml(t("natureName", note.nature))}</p>` : ""}
      ${note.data?.length ? `<h3>${t("dataElsewhere")}</h3><ul class="links">${note.data.map((address) => `<li><code>${escapeHtml(address)}</code></li>`).join("")}</ul>` : ""}
      <div class="body">${note.error ? `<p class="meta">${escapeHtml(note.error)}</p>` : note.body ? renderBody(note.body) : ""}</div>
      ${note.source ? `<p class="meta">${escapeHtml(t("noteSource", note.source))}</p>` : ""}
      ${links.length ? `<h3>${t("linkedNotes", links.length)}</h3><ul class="links">${links.map((l) => `<li><a href="#" class="link" data-slug="${escapeHtml(l.slug)}">${escapeHtml(l.title)}</a> <small>${escapeHtml(typeName(l.type))}</small></li>`).join("")}</ul>` : ""}
      <p class="open-row"><button type="button" class="open-note-file" data-note="${escapeHtml(slug)}">${escapeHtml(t("openNoteFile"))}</button></p>`;
  showLiveMark();
}

/**
 * An entry of the catalogue in the panel, and its data read on demand.
 * @param {Dust} entry
 */
export async function chooseEntry(entry) {
  // A contact that has its own note opens as a note.
  if (entry.contact && entry.note && state.noteById.has(entry.note)) { state.chosenEntry = null; return chooseNote(entry.note); }
  state.chosenEntry = entry;
  state.selection = null;
  if (state.chosenTool) { state.chosenTool = null; paintBackground(); }
  paintLive();
  if (entry.contact) return chooseContact(entry);
  const toolName = toolById(entry.tool)?.name ?? entry.tool;
  panel.hidden = false;
  const head = `<h2>${escapeHtml(entry.title)}</h2><p class="meta">${escapeHtml(toolName)}${entry.date ? ` · ${escapeHtml(entry.date)}` : ""} · ${t("inCatalogue")}</p>`;
  const address = `<p class="meta">${t("entryAddressHtml", `<code>${escapeHtml(entry.address)}</code>`)}</p>`;
  panelContent.innerHTML = `${head}<p class="tag">${escapeHtml(t("entryLivesIn", toolName))}</p>${address}<p class="meta">${t("readingData")}</p>`;
  const answer = /** @type {DataAnswer | null} */ (await attempt(fetchData(entry.address)));
  if (panel.hidden || state.chosenEntry !== entry) return;
  if (!answer) { panelContent.innerHTML = `${head}${address}<p class="meta error">${t("dataUnreadable")}</p>`; return; }
  const fields = answer.data && typeof answer.data === "object" ? Object.entries(answer.data).filter(([, v]) => v !== null && v !== "" && typeof v !== "object") : [];
  panelContent.innerHTML = `${head}${address}${answer.error ? `<p class="meta">${escapeHtml(answer.error)}</p>` : ""}${answer.warning ? `<p class="meta">${escapeHtml(answer.warning)}</p>` : ""}${fields.length ? `<h3>${escapeHtml(t("dataReadIn", toolName))}</h3><ul class="links">${fields.map(([key, v]) => `<li><small>${escapeHtml(key)}</small><br>${escapeHtml(String(v)).replace(/\n/g, "<br>")}</li>`).join("")}</ul>` : ""}`;
}

/**
 * A contact of the directory, read on demand (it has no note).
 * @param {Dust} contact
 */
async function chooseContact(contact) {
  panel.hidden = false;
  const head = `<h2>${escapeHtml(contact.title)}</h2><p class="meta">${escapeHtml(contact.email)}${contact.client ? ` · ${escapeHtml(contact.client)}` : ""} · ${t("directoryWord")}</p>`;
  panelContent.innerHTML = `${head}<p class="meta">${t("readingDirectory")}</p>`;
  const answer = /** @type {DataAnswer | null} */ (await attempt(fetchData(contact.address)));
  if (panel.hidden || state.chosenEntry !== contact) return;
  if (!answer) { panelContent.innerHTML = `${head}<p class="meta error">${t("directoryUnreadable")}</p>`; return; }
  // The directory's own keys: English since 2026-11-07, French in a directory written before.
  const x = /** @type {Record<string, any>} */ (answer.data && typeof answer.data === "object" ? answer.data : {});
  const line = (/** @type {string} */ label, /** @type {unknown} */ value) => (value ? `<li><small>${label}</small><br>${escapeHtml(Array.isArray(value) ? value.join(" · ") : String(value))}</li>` : "");
  const sent = x.sent ?? x.envoyes;
  panelContent.innerHTML = `${head}${answer.error ? `<p class="meta">${escapeHtml(answer.error)}</p>` : ""}<ul class="links">${line(t("contactSummary"), x.summary ?? x.resume)}${line(t("contactContext"), x.context ?? x.contexte)}${line(t("contactRole"), x.role)}${line(t("contactOrganisation"), x.organization ?? x.organisation)}${line(t("contactExchanges"), sent != null ? t("exchanges", sent, x.received ?? x.recus, x.first ?? x.premiere, x.last ?? x.derniere) : "")}${line(t("contactTopics"), (x.subjects ?? x.sujets ?? []).slice(0, 6))}</ul>`;
}

/** Wires the links to a note inside the panel. */
export function setUpNoteCard() {
  // A link to a note (in the body of a note, among its linked notes, in the
  // runs of a tool): one listener, so one reading.
  panelContent.addEventListener("click", (ev) => {
    const el = closest(ev, "[data-slug]");
    if (!el) return;
    ev.preventDefault(); // an <a href="#"> does not move the page
    const slug = el.dataset.slug ?? "";
    if (state.noteById.has(slug)) chooseNote(slug, { fly: true });
  });
  // Validate a seed, put a note back as a seed, go to the next seed.
  panelContent.addEventListener("click", (ev) => {
    const validate = closest(ev, ".validate-note");
    const back = closest(ev, ".back-to-seed");
    if (validate || back) {
      ev.preventDefault();
      const slug = (validate ?? back)?.dataset.note ?? "";
      if (slug) changeStatus(slug, validate ? "trusted" : "seed");
      return;
    }
    if (closest(ev, ".next-seed")) {
      ev.preventDefault();
      openNextSeed();
    }
  });
  // The note's own file, shown in the file manager (its path comes from the index, on the server).
  panelContent.addEventListener("click", async (ev) => {
    const button = /** @type {HTMLButtonElement | null} */ (closest(ev, ".open-note-file"));
    if (!button) return;
    ev.preventDefault();
    button.disabled = true;
    try {
      const answer = await openNoteFile(button.dataset.note ?? "");
      button.textContent = answer.ok ? t("noteFileOpened") : t("noteFileNotFound");
    } catch {
      button.textContent = t("noteFileNotFound");
    }
    setTimeout(() => { button.disabled = false; button.textContent = t("openNoteFile"); }, 2500);
  });
  // A status changed (here, by a key, or for many seeds at once): the open card and the map follow.
  // (The open note's line is written again even when it is not among them: its next seed may have changed.)
  onStatusChange(() => {
    redrawStatus();
    paintLive();
  });
}
