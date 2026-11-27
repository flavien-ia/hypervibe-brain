// data.js: reads from the server what the page keeps in its state: the map,
// the territories, the tools and their logos, their next runs, the catalogue,
// the contacts.

import { attempt, getCatalogue, getContacts, getLogos, getMap, getNext, getTerritories, getTools } from "./api.js";
import { arrange } from "./arrange.js";
import { safeColor } from "./format.js";
import { useLanguage } from "./i18n.js";
import { language } from "./lang.js";
import { setVocabulary } from "./map.js";
import { paintBackground } from "./paint-background.js";
import { paint } from "./paint-live.js";
import { state } from "./state.js";
import { seedColors } from "./theme.js";

/** The stable territories of the Semantic view (the server computes and keeps them); read again with the map. */
export async function loadTerritories() {
  state.territories = await attempt(getTerritories());
}

/** The map: the notes and their links, with the words of the brain. Throws when the server does not answer. */
export async function loadMap() {
  // THE MAP IS ASKED FOR FIRST (2026-11-18). The server answers one question
  // at a time: asked before the map, the territories made it wait.
  const asked = getMap();
  loadTerritories().then(() => { if (state.view === "semantic" && state.layout) { arrange(); paint(); } });
  const map = await asked;
  // The brain says its language with the map. A page that started in another
  // one (a first visit before the server answered, a brain whose language
  // changed) follows at once, before anything is worded from this map.
  if (map.vocabulary?.lang && map.vocabulary.lang !== language()) useLanguage(map.vocabulary.lang);
  // The vocabulary of the brain comes with the map: its domains, their
  // colours, its types. The contacts are not sent: the map is one of ideas.
  setVocabulary(map.vocabulary);
  state.vocabulary = map.vocabulary ?? null;
  state.notes = map.nodes.map(([id, title, type, domains, degree, status, pos, date, nature]) => ({ id, title, type, domains, degree, status, pos, date, nature: nature ?? "" }));
  state.noteById = new Map(state.notes.map((n) => [n.id, n]));
  state.neighbours = new Map();
  const link = (/** @type {string} */ from, /** @type {string} */ to) => {
    const list = state.neighbours.get(from);
    if (list) list.push(to); else state.neighbours.set(from, [to]);
  };
  state.inbound = new Map();
  for (const [a, b] of map.links) {
    if (!state.noteById.has(a) || !state.noteById.has(b)) continue;
    link(a, b);
    link(b, a);
    state.inbound.set(b, (state.inbound.get(b) ?? 0) + 1);
  }
  // A note the person has just validated (or put back as a seed) keeps the
  // status shown until the index says the same: a map read in between, built
  // before the change reached it, would show it as it was (note-card.js).
  for (const [slug, status] of state.pendingStatus) {
    const n = state.noteById.get(slug);
    if (!n || n.status === status) state.pendingStatus.delete(slug);
    else n.status = status;
  }
}

/** When each tool's sources run next (the ring around it). Read again every thirty seconds. */
export async function loadNext() {
  state.nextRuns = (await attempt(getNext())) ?? {};
  if (state.layout) paintBackground();
}

/** The tools around the brain and their logos. Throws when the server does not answer. */
export async function loadTools() {
  const [answer, logos] = await Promise.all([getTools(), getLogos()]);
  // When the sources run next is the longest question the page asks (nearly
  // two seconds on a real brain), and only draws a ring: asked once the tools
  // are there, it no longer holds the opening (2026-11-18).
  loadNext();
  // An error answer does not replace the tools already there: the caller keeps the state of before.
  if (!Array.isArray(answer.tools) || !answer.families) throw new Error("unreadable tools");
  state.tools = answer.tools;
  state.families = answer.families;
  // The family colours come from the brain's configuration: checked once
  // here, they are safe wherever they are placed afterwards.
  for (const family of Object.values(state.families)) family.color = safeColor(family.color);
  // The families take the colours of the design in their order (theme.js).
  seedColors("family", Object.values(state.families).map((family) => family.color));
  // The logos: a path of Simple Icons (CC0) on 24 units, ready to paint, or
  // an image the brain gives, loaded once.
  state.rawLogos = logos;
  for (const [id, logo] of Object.entries(logos)) {
    if ("image" in logo) {
      const image = new Image();
      image.onload = () => { state.logos[id] = { image, round: logo.round }; if (state.layout) paintBackground(); };
      image.src = logo.image;
      continue;
    }
    // Its colour is worked out at each paint (theme.js logoColor): a black or
    // very dark logo is painted in cream, to be seen on the disc of its tool.
    state.logos[id] = { path: new Path2D(logo.path), hex: logo.hex };
  }
}

/** The catalogue. Read again when the map is rebuilt; a reading that fails keeps the catalogue of before. */
export async function loadCatalogue() {
  const rows = await attempt(getCatalogue());
  state.catalogueRead = Array.isArray(rows);
  if (rows && state.catalogueRead) state.catalogue = rows.map(([address, tool, title, date]) => ({ address, tool, title, date }));
  // (2026-11-23) A brain with no catalogue shows no box to show it: a layer
  // that draws nothing only asks a question. Shown again as soon as a source
  // gives it entries.
  const box = document.getElementById("layer-catalogue")?.closest("label");
  if (box instanceof HTMLElement) box.style.display = state.catalogueRead && !state.catalogue.length ? "none" : "";
}

/**
 * The contacts of the directory, read once, read again when the map is rebuilt.
 * @param {boolean} [again] read them even when they are already there
 * @returns {Promise<boolean>} false when there are none (the reading failed); a new reading that fails keeps those of before
 */
export async function loadContacts(again = false) {
  if (state.contacts && !again) return true;
  const rows = await attempt(getContacts());
  if (Array.isArray(rows)) state.contacts = rows;
  return Boolean(state.contacts);
}
