// theme.js: the two designs of the page, and every colour the canvases paint.
//
// THE DESIGN CAN BE SWITCHED (2026-11-23). The page was drawn in one design,
// a dark night blue ("night", the default). A second one follows the design
// system of Hypervibe in its own night, a warm black: cream text, the six
// colours of its rainbow, its own fonts (Archivo and Geist, served from
// page/fonts/), its icons (icones-hypervibe.js). The panels follow an
// attribute of the root (`data-theme="hypervibe"`, styled by
// theme-hypervibe.css); the canvases read their colours here. (It was first
// drawn on the cream, then on the warm black of the design system's scenes,
// then on 2026-11-24 on the grounds of the night design; on 2026-11-27 it was
// asked to stand on the night of its own design system, `#1A1410`.)
//
// The colours the other modules import (SELECTION, VIVID, SECTORS...) are
// live bindings: `setTheme` gives them their new values, and a module that
// imported them reads the new value at its next paint. Nothing is cached
// elsewhere, except what arrange() works out (the colours of the harnesses),
// which is why a change of design arranges the map again (main.js).
//
// This module touches the document only inside its functions: the bench
// loads the page's modules in Node (tests/zones/vue.mjs).

import { recall, remember } from "./storage.js";

/** @typedef {"night" | "hypervibe"} Theme */

/** The designs, in the order of the switch. @type {Theme[]} */
export const THEMES = ["night", "hypervibe"];

// ------------------------------------------------------------ the tokens of Hypervibe

// The design system of Hypervibe (src/lib/design/tokens.ts of the app), in
// its night (NUIT, the scenes and the layers that float): the cream as text,
// the grey of the night for what is secondary. Its ground is the night of the
// design system (NUIT.fond, `--color-night`, `#1A1410`, 2026-11-27): the
// page, the map and the disc of a tool. A surface laid on it is that night
// under the design system's veil of cream (NUIT.voile, 6 %), worked out here
// (`veiled`), never a colour of its own. The cream stays above 14.8:1 and
// the grey above 5.6:1 on the night and on a surface. On the night, the
// design system writes a colour in its vivid value (CONTRASTES_NUIT). Two of
// them stay under 4.5:1 on a surface (the blue, the violet): their text is
// the vivid colour lightened by a quarter of cream, `light`, which also
// gives the map more colours than six, all of the same family.
const HV = {
  coral: { vivid: "#FF6040", light: "#FE866D" },
  yellow: { vivid: "#FFE500", light: "#FEEA3D" },
  teal: { vivid: "#00C896", light: "#3FD4AE" },
  blue: { vivid: "#4B7BFF", light: "#779AFD" },
  violet: { vivid: "#8B5CF6", light: "#A783F6" },
  rose: { vivid: "#FF4D6D", light: "#FE788F" },
  // The night of the design system (2026-11-27): the page, the map, the disc of a tool.
  night: "#1A1410",
  cream: "#FAF8F5",
  greyNight: "#A39A90",
  grey: "#635B53",
};
/** The veil of cream the design system lays on its night to make a surface (NUIT.voile). */
const HV_VEIL = 0.06;
/**
 * The night of Hypervibe under a veil of cream, as one colour: a surface of
 * the design system painted on a canvas, where nothing can be laid over
 * anything (2026-11-27).
 * @param {number} veil the share of cream, from 0 to 1
 * @param {number} [alpha] how opaque the colour is
 * @returns {string}
 */
function veiled(veil, alpha = 1) {
  const night = /** @type {[number, number, number]} */ (rgbOf(HV.night));
  const cream = /** @type {[number, number, number]} */ (rgbOf(HV.cream));
  const [r, g, b] = night.map((v, i) => Math.round(v + (cream[i] - v) * veil));
  return `rgba(${r},${g},${b},${alpha})`;
}
/** The six colours, in the order of the rainbow, then the rose. */
const HUES = [HV.coral, HV.yellow, HV.teal, HV.blue, HV.violet, HV.rose];

// ------------------------------------------------------------ the two palettes

/**
 * What a design gives the canvases. The night values are those the page
 * always painted: the default design does not change by one pixel.
 * @typedef {object} Palette
 * @property {Theme} name
 * @property {string} font the family of the texts painted on the canvases
 * @property {string} displayFont the family of the names in capitals (domains, sectors, harnesses)
 * @property {string[]} vivid the colours of the conversations (and of the harnesses)
 * @property {string} selection the yellow of what is chosen (fills, rings)
 * @property {string | null} selectionEdge a dark edge around the rings of what is chosen, for a light background
 * @property {string} selectionText the colour of the title of what is chosen
 * @property {string | null} selectionTextEdge the marker behind that title (else the usual edge)
 * @property {string} written
 * @property {string} contact
 * @property {Record<string, string | undefined>} natures
 * @property {Record<string, { color: string } | undefined>} sectors
 * @property {string} seed
 * @property {string} skill
 * @property {string} guard
 * @property {{ you: string, judge: string, judgeReread: string, warning: string }} usage
 * @property {string} textEdge the edge around a text painted on the map, so that it reads over anything
 * @property {number} textEdgeWidth
 * @property {string} disc the inside of the circle of a tool, of a hook, of the small circles of a folded tool
 * @property {string} brainRing
 * @property {string} bubbleFill
 * @property {string} bubbleStroke
 * @property {string} subBubbleFill
 * @property {string} subBubbleStroke
 * @property {string} unknown a tool or an entry of no known family
 * @property {string} bubbleName
 * @property {string} bubbleCount
 * @property {string} subBubbleName
 * @property {string} title the title of a note, from close enough
 * @property {string} liveTitle the title of a note opened live
 * @property {string} toolName
 * @property {string} toolNameOff
 * @property {string} keyDisc the disc under the small key of a tool that waits for the vault
 * @property {string} keyStroke
 * @property {string} struck the stroke of a disconnected tool
 * @property {string} mark the plain marks: a ring hovered, the neighbours of the chosen note, a path hovered
 * @property {string} rim the edge of a note opened live
 * @property {string} neighbourLine
 * @property {string} veil what covers a floor set back
 * @property {string} misplaced
 * @property {string} skillName
 * @property {string} hookName
 * @property {string} guardName
 * @property {string} harnessName
 * @property {string} guardOff
 * @property {string} guardInk the padlock drawn on a guard
 * @property {string} guardEdge
 * @property {string} floorKnowledge
 * @property {string} floorTools
 * @property {string} pill the name of a floor, as a pill
 * @property {string} pillText the name of a floor brought forward
 * @property {string} plate the plate of the floor above
 * @property {string} plateEdge
 * @property {string} metaColor the colour of the window's bar (meta theme-color)
 */

/** @type {Palette} */
const NIGHT = {
  name: "night",
  font: `"Segoe UI", system-ui, sans-serif`,
  displayFont: `"Segoe UI", system-ui, sans-serif`,
  vivid: ["#ff5a5f", "#ffc53d", "#3ee0c5", "#ff7ae0", "#9b8cff", "#7ee36b", "#ff9f43", "#4cc3ff"],
  selection: "#ffe500",
  selectionEdge: null,
  selectionText: "#ffe500",
  selectionTextEdge: null,
  written: "#7ee36b",
  contact: "#a5b4fc",
  natures: { decision: "#ffd166", feedback: "#4ade80", lesson: "#f472b6", retour: "#4ade80", lecon: "#f472b6" },
  sectors: { source: { color: "#3ee0c5" }, base: { color: "#b39dff" } },
  seed: "#9be7c4",
  skill: "#a78bfa",
  guard: "#f59e0b",
  usage: { you: "#3987e5", judge: "#d95926", judgeReread: "#8f4a30", warning: "#fab219" },
  textEdge: "rgba(11,12,24,0.8)",
  textEdgeWidth: 3,
  disc: "#15162a",
  brainRing: "rgba(201,204,239,0.2)",
  bubbleFill: "rgba(255,255,255,0.035)",
  bubbleStroke: "rgba(154,160,208,0.35)",
  subBubbleFill: "rgba(255,255,255,0.03)",
  subBubbleStroke: "rgba(154,160,208,0.18)",
  unknown: "#9aa0b8",
  bubbleName: "#e8e9f5",
  bubbleCount: "#9aa0c0",
  subBubbleName: "rgba(170,176,208,0.85)",
  title: "rgba(255,255,255,0.9)",
  liveTitle: "#ffffff",
  toolName: "#e8e9f5",
  toolNameOff: "#9aa0b8",
  keyDisc: "#15162a",
  keyStroke: "#fab219",
  struck: "#ff8a8a",
  mark: "#ffffff",
  rim: "rgba(255,255,255,0.8)",
  neighbourLine: "rgba(255,255,255,0.4)",
  veil: "rgba(11,12,24,0.9)",
  misplaced: "#ef4444",
  skillName: "rgba(233,227,255,0.85)",
  hookName: "rgba(233,227,255,0.8)",
  guardName: "#fde7c2",
  harnessName: "#ece8ff",
  guardOff: "#6b7280",
  guardInk: "rgba(11,12,24,0.85)",
  guardEdge: "rgba(11,12,24,0.9)",
  floorKnowledge: "#9aa0d0",
  floorTools: "#4cc3ff",
  pill: "rgba(17,15,36,0.88)",
  pillText: "#11101f",
  plate: "rgba(17,15,36,0.84)",
  plateEdge: "rgba(167,139,250,0.55)",
  metaColor: "#0b0c18",
};

// THE MAP IN THE NIGHT OF HYPERVIBE (2026-11-24, on its own night since
// 2026-11-27). The warm black of the design system (theme-hypervibe.css
// paints it under the map, a little lighter at its heart), cream instead of
// lavender white, the colours of the design system at full strength (the
// yellow of what is chosen reads again as it is), Archivo for the names in
// capitals and Geist for the rest. A pill and a plate are surfaces: that
// night under the veil of cream, almost opaque (`veiled`). Each meaning
// keeps its hue, so that the legend's words stay true: the memory in pink
// (rose), the decisions in yellow, the seeds in mint, the sources in teal, the
// data in violet, the guards in orange (coral), the key in yellow.
/** @type {Palette} */
const HYPERVIBE = {
  name: "hypervibe",
  // The fonts of hypervibe.fr, served by the view itself (theme-hypervibe.css): Geist, Archivo.
  font: `"Geist", "Segoe UI", system-ui, sans-serif`,
  displayFont: `"Archivo", "Geist", "Segoe UI", system-ui, sans-serif`,
  vivid: [HV.coral.vivid, HV.yellow.vivid, HV.teal.vivid, HV.rose.vivid, HV.violet.light, HV.blue.light, HV.coral.light, HV.teal.light],
  selection: HV.yellow.vivid,
  selectionEdge: null,
  selectionText: HV.yellow.vivid,
  selectionTextEdge: null,
  written: HV.teal.vivid,
  contact: HV.blue.light,
  natures: { decision: HV.yellow.vivid, feedback: HV.teal.vivid, lesson: HV.rose.vivid, retour: HV.teal.vivid, lecon: HV.rose.vivid },
  sectors: { source: { color: HV.teal.vivid }, base: { color: HV.violet.light } },
  seed: HV.teal.light,
  skill: HV.violet.light,
  guard: HV.coral.vivid,
  usage: { you: HV.blue.vivid, judge: HV.coral.vivid, judgeReread: "#A33A22", warning: HV.yellow.vivid },
  textEdge: "rgba(26,20,16,0.8)",
  textEdgeWidth: 3,
  disc: HV.night,
  brainRing: "rgba(250,248,245,0.2)",
  bubbleFill: "rgba(250,248,245,0.035)",
  bubbleStroke: "rgba(250,248,245,0.22)",
  subBubbleFill: "rgba(250,248,245,0.025)",
  subBubbleStroke: "rgba(250,248,245,0.12)",
  unknown: HV.greyNight,
  bubbleName: HV.cream,
  bubbleCount: HV.greyNight,
  subBubbleName: HV.greyNight,
  title: "rgba(250,248,245,0.9)",
  liveTitle: HV.cream,
  toolName: HV.cream,
  toolNameOff: HV.greyNight,
  keyDisc: HV.yellow.vivid,
  keyStroke: HV.night,
  struck: HV.coral.vivid,
  mark: HV.cream,
  rim: "rgba(250,248,245,0.85)",
  neighbourLine: "rgba(250,248,245,0.38)",
  veil: "rgba(26,20,16,0.9)",
  misplaced: HV.coral.vivid,
  skillName: "rgba(250,248,245,0.85)",
  hookName: "rgba(250,248,245,0.75)",
  guardName: HV.coral.light,
  harnessName: HV.cream,
  guardOff: HV.grey,
  guardInk: HV.night,
  guardEdge: HV.night,
  floorKnowledge: HV.greyNight,
  floorTools: HV.blue.light,
  pill: veiled(HV_VEIL, 0.88),
  pillText: HV.night,
  plate: veiled(HV_VEIL, 0.84),
  plateEdge: "rgba(167,131,246,0.55)",
  metaColor: HV.night,
};

const PALETTES = { night: NIGHT, hypervibe: HYPERVIBE };

// ------------------------------------------------------------ the design in use

/** @param {unknown} name @returns {name is Theme} */
const isTheme = (name) => name === "night" || name === "hypervibe";

/** The design of the page at its opening: the attribute theme-early.js set, else what this browser remembers. @returns {Theme} */
function initialTheme() {
  const set = typeof document === "undefined" ? null : document.documentElement.dataset.theme;
  if (isTheme(set)) return set;
  const kept = recall("theme");
  return isTheme(kept) ? kept : "night";
}

/** The palette in use. A live binding: always the current design's. */
export let colors = PALETTES[initialTheme()];

// The colours the other modules import by name, as they did before the designs.
/** The colours of the conversations. */
export let VIVID = colors.vivid;
/** The yellow of what is chosen. */
export let SELECTION = colors.selection;
/** The green of the "Written or modified" filter. */
export let WRITTEN_COLOR = colors.written;
/** The colour of a contact of the directory. */
export let CONTACT_COLOR = colors.contact;
/** By nature of note; the French ids are those of brains made before the plugin spoke English. @type {Record<string, string | undefined>} */
export let NATURE_COLORS = colors.natures;
/** The two sectors of the ring. @type {Record<string, { color: string } | undefined>} */
export let SECTORS = colors.sectors;
/** The colour of the seeds (validate.js). */
export let SEED_COLOR = colors.seed;
/** The colour of the floor: the person's own skills (executive.js). */
export let SKILL_COLOR = colors.skill;
/** The guards (executive.js). */
export let GUARD_COLOR = colors.guard;
/** The usage page (usage.js): the person, the judge, what the judge reads again, a cap reached. */
export let USAGE_YOU = colors.usage.you;
export let USAGE_JUDGE = colors.usage.judge;
export let USAGE_JUDGE_REREAD = colors.usage.judgeReread;
export let USAGE_WARNING = colors.usage.warning;

/** The design in use. @returns {Theme} */
export const themeName = () => colors.name;

/** @type {Set<(theme: Theme) => void>} */
const listeners = new Set();
/** Called after each change of design. @param {(theme: Theme) => void} fn */
export function onThemeChange(fn) { listeners.add(fn); }

/** The root carries the design, and the window's bar its colour. */
function showOnRoot() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (colors.name === "night") delete root.dataset.theme; else root.dataset.theme = colors.name;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors.metaColor);
}

/**
 * Switches the design: the colours, the root's attribute, what this browser
 * remembers; then each listener redraws what it owns.
 * @param {Theme} name
 * @param {{ keep?: boolean }} [options] keep: false to try it without remembering it
 */
export function setTheme(name, { keep = true } = {}) {
  if (!isTheme(name)) return;
  colors = PALETTES[name];
  VIVID = colors.vivid;
  SELECTION = colors.selection;
  WRITTEN_COLOR = colors.written;
  CONTACT_COLOR = colors.contact;
  NATURE_COLORS = colors.natures;
  SECTORS = colors.sectors;
  SEED_COLOR = colors.seed;
  SKILL_COLOR = colors.skill;
  GUARD_COLOR = colors.guard;
  USAGE_YOU = colors.usage.you;
  USAGE_JUDGE = colors.usage.judge;
  USAGE_JUDGE_REREAD = colors.usage.judgeReread;
  USAGE_WARNING = colors.usage.warning;
  assigned.clear();
  for (const [kind, list] of seeds) for (const color of list) dataColor(color, kind);
  showOnRoot();
  if (keep) remember("theme", name);
  for (const fn of listeners) fn(name);
}

// ------------------------------------------------------------ the colours of the brain's own data

/** @param {string} color @returns {[number, number, number] | null} red, green, blue from 0 to 255 */
function rgbOf(color) {
  const c = String(color ?? "").trim();
  let m = /^#([0-9a-f]{3})$/i.exec(c);
  if (m) return /** @type {[number, number, number]} */ ([...m[1]].map((h) => parseInt(h + h, 16)));
  m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(c);
  if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}

/** @param {[number, number, number]} rgb @returns {{ h: number, s: number, l: number }} hue in degrees, saturation and lightness from 0 to 1 */
function hslOf([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

// The swatches a colour of the brain is brought to, in the night of
// Hypervibe (each above 3:1 on its night and on a surface): the six vivid
// colours first, then their light values, so that eight domains stay eight
// colours.
const SWATCHES = [
  ...HUES.map((t) => ({ color: t.vivid, light: false })),
  ...HUES.map((t) => ({ color: t.light, light: true })),
].map((w) => ({ ...w, h: hslOf(/** @type {[number, number, number]} */ (rgbOf(w.color))).h }));

/** kind -> the brain's colour -> its swatch in the design. @type {Map<string, Map<string, string>>} */
const assigned = new Map();
/** kind -> the brain's colours, in the brain's order (seedColors). @type {Map<string, string[]>} */
const seeds = new Map();

/**
 * The colours of a kind, in the brain's order (its domains, its families):
 * they take their swatches in this order, now and after each change of design.
 * @param {string} kind
 * @param {string[]} list
 */
export function seedColors(kind, list) {
  seeds.set(kind, list);
  assigned.delete(kind);
  for (const color of list) dataColor(color, kind);
}

/**
 * A colour the brain chose (a domain, a family of tools), as the design shows
 * it. The night shows it as it is. Hypervibe brings it to its nearest swatch
 * of the design system by hue, one swatch per colour of a kind while there
 * are swatches left; a grey stays a grey. The first colours asked take the
 * swatches first: map.js and data.js ask them in the brain's order.
 * @param {string} color
 * @param {string} kind "domain", "family"...
 * @returns {string}
 */
export function dataColor(color, kind) {
  if (colors.name === "night") return color;
  const rgb = rgbOf(color);
  if (!rgb) return color;
  const { h, s } = hslOf(rgb);
  if (s < 0.18) return HV.greyNight;
  let table = assigned.get(kind);
  if (!table) assigned.set(kind, (table = new Map()));
  const known = table.get(color);
  if (known) return known;
  const taken = new Set(table.values());
  const gap = (/** @type {number} */ a) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
  // A light value only when the vivid colour of that hue is far or taken.
  const score = (/** @type {(typeof SWATCHES)[number]} */ w) => gap(w.h) + (w.light ? 18 : 0) + (taken.has(w.color) ? 1000 : 0);
  const best = [...SWATCHES].sort((a, b) => score(a) - score(b))[0];
  table.set(color, best.color);
  return best.color;
}

/**
 * A colour as a text on the map or on a panel: the night writes it as it is;
 * Hypervibe writes a colour of its design system in its vivid value, except
 * the blue and the violet, written in their light value (above 4.5:1 on its
 * night and on a surface); any other colour is lightened.
 * @param {string} color
 * @returns {string}
 */
export function inkOf(color) {
  if (colors.name === "night") return color;
  const upper = String(color).toUpperCase();
  for (const t of HUES) if (upper === t.vivid || upper === t.light) return t === HV.blue || t === HV.violet ? t.light : upper;
  const rgb = rgbOf(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map((v, i) => Math.round(v * 0.6 + [250, 248, 245][i] * 0.4));
  return `rgb(${r},${g},${b})`;
}

/**
 * The end of a halo (a radial gradient): transparent black on the night, as
 * always; in Hypervibe the colour itself made transparent, so that the halo
 * fades in its own colour rather than through grey.
 * @param {string} color
 * @returns {string}
 */
export function fadeOf(color) {
  if (colors.name === "night") return "rgba(0,0,0,0)";
  const rgb = rgbOf(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)` : "rgba(255,255,255,0)";
}

/**
 * The colour of a logo drawn from its path: a black or very dark logo is
 * lightened on the dark disc of either design.
 * @param {string} hex six hexadecimal digits, without "#"
 * @returns {string}
 */
export function logoColor(hex) {
  const value = parseInt(hex, 16);
  const luminance = (0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  if (luminance >= 0.3) return `#${hex}`;
  return colors.name === "night" ? "#e8e9f5" : HV.cream;
}

// The drawings of the legend (legend.js) are written in the night's colours;
// in Hypervibe each is translated by this table, the meaning kept.
/** @type {Record<string, string>} */
const LEGEND_COLORS = {
  "#15162a": HV.night, "#0b0c18": HV.night, "#ffffff": HV.cream, "#fff": HV.cream, "#e8e9f5": HV.cream,
  "#3ee0c5": HV.teal.vivid, "#4aa3ff": HV.blue.vivid, "#7ec8ff": HV.blue.light, "#3987e5": HV.blue.vivid,
  "#9aa0d0": HV.greyNight, "#9aa0b8": HV.greyNight, "#e0559b": HV.rose.vivid, "#ff7ae0": HV.rose.vivid,
  "#ffc53d": HV.yellow.vivid, "#b39dff": HV.violet.light, "#a78bfa": HV.violet.light,
  "#ff8a8a": HV.coral.vivid, "#fab219": HV.yellow.vivid, "#ffe500": HV.yellow.vivid, "#f59e0b": HV.coral.vivid,
  "#9be7c4": HV.teal.light, "#7ee36b": HV.teal.vivid, "#b9f5ad": HV.teal.light, "#d95926": HV.coral.vivid,
  "rgba(155,231,196,.12)": "rgba(63,212,174,.14)", "rgba(126,227,107,.12)": "rgba(0,200,150,.14)",
  "rgba(250,178,25,.08)": "rgba(255,229,0,.1)", "rgba(255,229,0,.12)": "rgba(255,229,0,.14)",
};

/**
 * A drawing of the legend in the design's colours.
 * @param {string} svg
 * @returns {string}
 */
export function recolor(svg) {
  if (colors.name === "night") return svg;
  return svg.replace(/#[0-9a-f]{3,6}\b|rgba\([^)]*\)/gi, (found) => LEGEND_COLORS[found.toLowerCase()] ?? found);
}

// ------------------------------------------------------------ the fonts

/**
 * Asks the fonts of Hypervibe (theme-hypervibe.css) for the canvases: the
 * browser only fetches a font a text of the page uses, and a canvas painted
 * before it arrives keeps the system's. Resolves once they are there (at
 * once on the night, which loads no font), so that the map is painted again
 * (main.js, 2026-11-24).
 * @returns {Promise<boolean>} whether the fonts of the design were loaded
 */
export async function loadFonts() {
  if (colors.name === "night" || typeof document === "undefined" || !document.fonts) return false;
  try {
    await Promise.all([`400 13px "Geist"`, `700 13px "Geist"`, `800 13px "Archivo"`, `400 13px "Geist Mono"`].map((f) => document.fonts.load(f)));
    return document.fonts.check(`400 13px "Geist"`) && document.fonts.check(`800 13px "Archivo"`);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the switch

/** The buttons of the switch say which design is in use. */
function showSwitch() {
  if (typeof document === "undefined") return;
  for (const b of document.querySelectorAll("[data-theme-choice]")) {
    const on = b.getAttribute("data-theme-choice") === colors.name;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
}

/** Wires the switch of the design (in the filters box): a click switches at once, and the page remembers it. */
export function setUpThemeSwitch() {
  showOnRoot();
  showSwitch();
  for (const b of document.querySelectorAll("[data-theme-choice]")) {
    b.addEventListener("click", () => {
      const name = b.getAttribute("data-theme-choice");
      if (isTheme(name) && name !== colors.name) setTheme(name);
    });
  }
  onThemeChange(showSwitch);
}
