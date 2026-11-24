// index-page.js: the index page. Everything the brain can find again, in one
// list: the notes, the entries of the catalogue, the contacts. A click opens
// the item as on the map.
//
// THE INDEX, a full page like the settings (2026-11-10): it is not a way of
// arranging the map, it replaces it. The top bar leaves with the map.

import { arrange } from "./arrange.js";
import { loadCatalogue, loadContacts } from "./data.js";
import { $, $input, closest, pressable } from "./dom.js";
import { escapeHtml, plain } from "./format.js";
import { t } from "./i18n.js";
import { typePlural } from "./map.js";
import { chooseEntry, chooseNote } from "./note-card.js";
import { paint } from "./paint-live.js";
import { notice } from "./setup.js";
import { CONTACT_COLOR, NATURE_COLORS, familyColor, state, toolById } from "./state.js";
import { colors } from "./theme.js";

/**
 * One line of the index.
 * @typedef {object} IndexLine
 * @property {"note" | "entry" | "contact"} kind
 * @property {string} source the group it is counted in ("Notes · projects", "Catalogue · <tool>", "Contacts")
 * @property {string} title
 * @property {string} date
 * @property {string} [detail] a second, smaller text after the title
 * @property {string} color
 * @property {string} [slug] for a note
 * @property {Omit<import("./state.js").Dust, "x" | "y">} [entry] for a catalogue entry or a contact
 * @property {string} search what a filter looks into, without accents
 */

const index = {
  /** @type {Set<string>} the sources ticked */
  sources: new Set(),
  filter: "",
  limit: 200,
  /** @type {IndexLine[] | null} null until it is built, and when it is stale */
  lines: null,
  /** @type {IndexLine[]} the lines the filters keep */
  shown: [],
  /** @type {string[]} what could not be read (the catalogue, the contacts), in words */
  missing: [],
};

/** Whether the index page is open. */
export const indexIsOpen = () => !$("#index").hidden;

/** Closes the index: back to the map. */
export function closeIndex() {
  $("#index").hidden = true;
  document.body.classList.remove("page-open");
}

/** Opens the index over the map, built if needed, with the focus in its filter. */
export async function openIndex() {
  document.body.classList.add("page-open");
  $("#index").hidden = false;
  $("#index").scrollTop = 0;
  setTimeout(() => $("#index-search").focus(), 0);
  // Built at the first opening, after the map is rebuilt, or when a reading was missing.
  if (!index.lines || index.missing.length) await buildIndex();
  listIndex();
  $("#index-search").focus();
}

/** The lines of the index: the notes, the catalogue, the contacts. A reading that fails does not stop the rest: the index says what it lacks. */
async function buildIndex() {
  if (!index.lines) $("#index-count").textContent = t("readingIndex");
  // A catalogue that could not be read is asked again here, and the map gets its dots back.
  if (!state.catalogueRead) {
    await loadCatalogue();
    if (state.catalogueRead && state.layout) { arrange(); paint(); }
  }
  const withContacts = await loadContacts();
  index.missing = [state.catalogueRead ? "" : t("missingCatalogue"), withContacts ? "" : t("missingContacts")].filter(Boolean);
  /** @type {IndexLine[]} */
  const lines = [];
  for (const n of state.notes) lines.push({ kind: "note", source: t("indexNotes", typePlural(n.type) ?? n.type), title: n.title, date: n.date, color: NATURE_COLORS[n.nature] ?? colors.bubbleName, slug: n.id, search: `${n.title} ${n.id}` });
  for (const entry of state.catalogue) {
    const tool = toolById(entry.tool);
    lines.push({ kind: "entry", source: t("indexCatalogue", tool?.name ?? entry.tool), title: entry.title, date: entry.date, color: familyColor(tool, colors.unknown), entry, search: `${entry.title} ${entry.address}` });
  }
  for (const [address, name, client, , note] of state.contacts ?? []) {
    lines.push({ kind: "contact", source: t("indexContacts"), title: name || address, date: "", detail: `${address}${client ? ` · ${client}` : ""}`, color: CONTACT_COLOR, entry: { address: `annuaire://${address}`, tool: "contacts", title: name || address, email: address, client, note, contact: true }, search: `${name} ${address} ${client}` });
  }
  for (const line of lines) line.search = plain(line.search);
  index.lines = lines;
  // The sources, with their number, as buttons to tick; those already ticked stay so.
  /** @type {Map<string, number>} */
  const bySource = new Map();
  for (const line of lines) bySource.set(line.source, (bySource.get(line.source) ?? 0) + 1);
  for (const name of [...index.sources]) if (!bySource.has(name)) index.sources.delete(name);
  $("#index-sources").innerHTML = [...bySource].sort((a, b) => b[1] - a[1]).map(([name, n]) => `<button data-source="${escapeHtml(name)}"${index.sources.has(name) ? ' class="active"' : ""}>${escapeHtml(name)} <small>${n}</small></button>`).join("");
}

/** The index is no longer up to date (the map was rebuilt, the tools changed): built again at once when it is open, else at its next opening. */
export async function staleIndex() {
  if (!indexIsOpen()) { index.lines = null; return; }
  await buildIndex();
  listIndex();
}

function listIndex() {
  if (!index.lines) return; // not read yet: the list will come with it
  const words = plain(index.filter).split(/\s+/).filter(Boolean);
  const shown = index.lines.filter((line) => (!index.sources.size || index.sources.has(line.source)) && words.every((word) => line.search.includes(word)));
  // Nothing at all to list (a brain just created): said in a notice, rather than "0 out of 0" over an empty list.
  const empty = !index.lines.length && !index.missing.length;
  $("#index-empty").hidden = !empty;
  if (empty) $("#index-empty").innerHTML = notice(t("indexEmpty"), t("emptyBrainSay"));
  $("#index-count").textContent = empty ? "" : t("indexCount", shown.length, index.lines.length, index.missing);
  $("#index-list").innerHTML = shown.slice(0, index.limit).map((line, i) => `<li data-i="${i}" tabindex="0" role="button"><span class="dot" style="background:${line.color}"></span><span class="title">${escapeHtml(line.title)}${line.detail ? ` <small>${escapeHtml(line.detail)}</small>` : ""}</span><small>${escapeHtml(line.source)}${line.date ? ` · ${escapeHtml(String(line.date).slice(0, 10))}` : ""}</small></li>`).join("");
  index.shown = shown;
  $("#index-more").hidden = shown.length <= index.limit;
}

/** Wires the index page: its button, its filter, its sources, its list. */
export function setUpIndex() {
  $("#open-index").addEventListener("click", () => openIndex());
  $("#index-close").addEventListener("click", closeIndex);
  $("#index-sources").addEventListener("click", (ev) => {
    const button = closest(ev, "button[data-source]");
    if (!button) return;
    const name = button.dataset.source ?? "";
    if (index.sources.has(name)) index.sources.delete(name); else index.sources.add(name);
    button.classList.toggle("active", index.sources.has(name));
    index.limit = 200;
    listIndex();
  });
  $input("#index-search").addEventListener("input", (ev) => { index.filter = /** @type {HTMLInputElement} */ (ev.target).value; index.limit = 200; listIndex(); });
  $("#index-more").addEventListener("click", () => { index.limit += 400; listIndex(); });
  $("#index-list").addEventListener("click", (ev) => {
    const item = closest(ev, "li");
    const line = item ? index.shown[Number(item.dataset.i)] : undefined;
    if (!line) return;
    if (line.kind === "note" && line.slug) chooseNote(line.slug);
    else if (line.entry) chooseEntry(/** @type {import("./state.js").Dust} */ (line.entry));
  });
  pressable($("#index-list"), "li[data-i]");
}
