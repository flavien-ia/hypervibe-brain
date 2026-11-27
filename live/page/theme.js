// theme.js: every colour the canvases paint, and the ground the page stands on.
//
// ONE DESIGN, THREE GROUNDS (2026-11-27). The page was first drawn in a night
// blue of its own; on 2026-11-23 it was given a second design, chosen by a
// switch, that followed the design system of Hypervibe. That design is now the
// only one: cream text, the six colours of its rainbow, its own fonts (Archivo
// and Geist, served from page/fonts/), its icons (icones-hypervibe.js). What
// is left to choose, in the settings, is THE GROUND it stands on: a pure
// black, the night blue the view was born in, or the night of the design
// system, a warm black, which is the default.
//
// The panels read the ground in the stylesheet (theme-hypervibe.css: `--bg`,
// set by the root's `data-ground`, itself set before the first paint by
// theme-early.js). The canvases read it here, in `colors`: a live binding that
// `setGround` replaces, so a module that imported it reads the new value at
// its next paint. A SURFACE IS NEVER A COLOUR OF ITS OWN: it is the chosen
// ground under the design system's veil of cream, mixed by the browser
// (`color-mix` on `--bg`) and worked out here by the same sum (`veiled`).
//
// This module touches the document only inside its functions: the bench
// loads the page's modules in Node (tests/zones/vue.mjs).

import { onRememberedElsewhere, recall, remember } from "./storage.js";

// ------------------------------------------------------------ the grounds

/** @typedef {"black" | "blue" | "hypervibe"} Ground */

/**
 * The grounds, in the order of the choice. `heart` is the lighter colour at
 * the heart of the map, for a ground that has one of its own (the night blue
 * always had); without it, the heart is the ground under the veil of cream,
 * as any surface. The stylesheet names the same colours (`--ground-...` in
 * theme-hypervibe.css): the bench checks that the two agree.
 * @type {Record<Ground, { color: string, heart: string | null }>}
 */
export const GROUNDS = {
  black: { color: "#000000", heart: null },
  blue: { color: "#0b0c18", heart: "#1c1d36" },
  hypervibe: { color: "#1A1410", heart: null },
};
/** The ground of a page that never chose one. @type {Ground} */
export const DEFAULT_GROUND = "hypervibe";

/** @param {unknown} name @returns {name is Ground} */
const isGround = (name) => name === "black" || name === "blue" || name === "hypervibe";

// ------------------------------------------------------------ the tokens of Hypervibe

// The design system of Hypervibe (src/lib/design/tokens.ts of the app), in
// its night (NUIT, the scenes and the layers that float): the cream as text,
// the grey of the night for what is secondary. A surface laid on the ground
// is that ground under the design system's veil of cream (NUIT.voile, 6 %),
// worked out here (`veiled`). The warm black is the lightest of the three
// grounds, so the one where a text reads least: there the cream stays above
// 14.8:1 and the grey above 5.6:1 on the ground and on a surface (16.2:1 and
// 6.2:1 on the night blue, 18.1:1 and 6.9:1 on the black). The design system
// writes a colour in its vivid value (CONTRASTES_NUIT). Two of them stay
// under 4.5:1 on a surface of the warm black (the blue, the violet): their
// text is the vivid colour lightened by a quarter of cream, `light`, which
// also gives the map more colours than six, all of the same family.
const HV = {
  coral: { vivid: "#FF6040", light: "#FE866D" },
  yellow: { vivid: "#FFE500", light: "#FEEA3D" },
  teal: { vivid: "#00C896", light: "#3FD4AE" },
  blue: { vivid: "#4B7BFF", light: "#779AFD" },
  violet: { vivid: "#8B5CF6", light: "#A783F6" },
  rose: { vivid: "#FF4D6D", light: "#FE788F" },
  // What is drawn on a colour (the padlock of a guard, the key on its yellow disc, the name of a floor brought
  // forward): the night of the design system as an ink, whatever the ground.
  ink: "#1A1410",
  cream: "#FAF8F5",
  greyNight: "#A39A90",
  grey: "#635B53",
};
/** The veil of cream the design system lays on its night to make a surface (NUIT.voile). */
const HV_VEIL = 0.06;
/**
 * A colour at some opacity, as a canvas takes it.
 * @param {string} color
 * @param {number} alpha
 * @returns {string}
 */
function faded(color, alpha) {
  const [r, g, b] = /** @type {[number, number, number]} */ (rgbOf(color));
  return `rgba(${r},${g},${b},${alpha})`;
}
/**
 * A ground under a veil of cream, as one colour: a surface of the design
 * system painted on a canvas, where nothing can be laid over anything. The
 * same sum as the stylesheet's `color-mix(in srgb, cream, ground)`.
 * @param {string} ground
 * @param {number} veil the share of cream, from 0 to 1
 * @param {number} [alpha] how opaque the colour is
 * @returns {string}
 */
function veiled(ground, veil, alpha = 1) {
  const from = /** @type {[number, number, number]} */ (rgbOf(ground));
  const cream = /** @type {[number, number, number]} */ (rgbOf(HV.cream));
  const [r, g, b] = from.map((v, i) => Math.round(v + (cream[i] - v) * veil));
  return `rgba(${r},${g},${b},${alpha})`;
}
/** The six colours, in the order of the rainbow, then the rose. */
const HUES = [HV.coral, HV.yellow, HV.teal, HV.blue, HV.violet, HV.rose];

// ------------------------------------------------------------ the palette

/**
 * What the canvases paint with.
 * @typedef {object} Palette
 * @property {Ground} ground the ground it was worked out for
 * @property {string} font the family of the texts painted on the canvases
 * @property {string} displayFont the family of the names in capitals (domains, sectors, harnesses)
 * @property {string[]} vivid the colours of the conversations (and of the harnesses)
 * @property {string} selection the yellow of what is chosen (fills, rings)
 * @property {string} selectionText the colour of the title of what is chosen
 * @property {string} written
 * @property {string} contact
 * @property {Record<string, string | undefined>} natures
 * @property {Record<string, { color: string } | undefined>} sectors
 * @property {string} seed
 * @property {string} skill
 * @property {string} guard
 * @property {{ you: string, judge: string, judgeReread: string, warning: string }} usage
 * @property {string} textEdge the edge around a text painted on the map, so that it reads over anything: the ground
 * @property {number} textEdgeWidth
 * @property {string} disc the inside of the circle of a tool, of a hook, of the small circles of a folded tool: the ground
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
 * @property {string} veil what covers a floor set back: the ground, almost opaque
 * @property {string} misplaced
 * @property {string} skillName
 * @property {string} hookName
 * @property {string} guardName
 * @property {string} harnessName
 * @property {string} guardOff
 * @property {string} guardInk the padlock drawn on a guard
 * @property {string} guardEdge the edge of a guard: the ground
 * @property {string} floorKnowledge
 * @property {string} floorTools
 * @property {string} pill the name of a floor, as a pill: a surface, almost opaque
 * @property {string} pillText the name of a floor brought forward
 * @property {string} plate the plate of the floor above: a surface, almost opaque
 * @property {string} plateEdge
 * @property {string} metaColor the colour of the window's bar (meta theme-color): the ground
 */

// THE MAP IN THE DESIGN OF HYPERVIBE (2026-11-24). Cream instead of white, the
// colours of the design system at full strength, Archivo for the names in
// capitals and Geist for the rest. Each meaning keeps its hue, so that the
// legend's words stay true: the memory in pink (rose), the decisions in
// yellow, the seeds in mint, the sources in teal, the data in violet, the
// guards in orange (coral), the key in yellow. Nothing here depends on the
// ground: what does is worked out by `paletteOf` (2026-11-27).
/** @type {Omit<Palette, "ground" | "textEdge" | "disc" | "veil" | "guardEdge" | "pill" | "plate" | "metaColor">} */
const SHARED = {
  // The fonts of hypervibe.fr, served by the view itself (theme-hypervibe.css): Geist, Archivo.
  font: `"Geist", "Segoe UI", system-ui, sans-serif`,
  displayFont: `"Archivo", "Geist", "Segoe UI", system-ui, sans-serif`,
  vivid: [HV.coral.vivid, HV.yellow.vivid, HV.teal.vivid, HV.rose.vivid, HV.violet.light, HV.blue.light, HV.coral.light, HV.teal.light],
  selection: HV.yellow.vivid,
  selectionText: HV.yellow.vivid,
  written: HV.teal.vivid,
  contact: HV.blue.light,
  natures: { decision: HV.yellow.vivid, feedback: HV.teal.vivid, lesson: HV.rose.vivid, retour: HV.teal.vivid, lecon: HV.rose.vivid },
  sectors: { source: { color: HV.teal.vivid }, base: { color: HV.violet.light } },
  seed: HV.teal.light,
  skill: HV.violet.light,
  guard: HV.coral.vivid,
  usage: { you: HV.blue.vivid, judge: HV.coral.vivid, judgeReread: "#A33A22", warning: HV.yellow.vivid },
  textEdgeWidth: 3,
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
  keyStroke: HV.ink,
  struck: HV.coral.vivid,
  mark: HV.cream,
  rim: "rgba(250,248,245,0.85)",
  neighbourLine: "rgba(250,248,245,0.38)",
  misplaced: HV.coral.vivid,
  skillName: "rgba(250,248,245,0.85)",
  hookName: "rgba(250,248,245,0.75)",
  guardName: HV.coral.light,
  harnessName: HV.cream,
  guardOff: HV.grey,
  guardInk: HV.ink,
  floorKnowledge: HV.greyNight,
  floorTools: HV.blue.light,
  pillText: HV.ink,
  plateEdge: "rgba(167,131,246,0.55)",
};

/**
 * The palette on a ground: what is the ground itself (the disc of a tool, the
 * edge of a text, the veil over a floor set back, the edge of a guard, the
 * window's bar), and what is a surface on it (a pill, a plate).
 * @param {Ground} name
 * @returns {Palette}
 */
function paletteOf(name) {
  const ground = GROUNDS[name].color;
  return {
    ...SHARED,
    ground: name,
    textEdge: faded(ground, 0.8),
    disc: ground,
    veil: faded(ground, 0.9),
    guardEdge: ground,
    pill: veiled(ground, HV_VEIL, 0.88),
    plate: veiled(ground, HV_VEIL, 0.84),
    metaColor: ground,
  };
}

// ------------------------------------------------------------ the ground in use

/** The ground of the page at its opening: the attribute theme-early.js set, else what this browser remembers. @returns {Ground} */
function initialGround() {
  const set = typeof document === "undefined" ? null : document.documentElement.dataset.ground;
  if (isGround(set)) return set;
  const kept = recall("ground");
  return isGround(kept) ? kept : DEFAULT_GROUND;
}

/** The palette in use. A live binding: always the one of the current ground. */
export let colors = paletteOf(initialGround());

// The colours the other modules import by name. No ground changes them.
/** The colours of the conversations. */
export const VIVID = SHARED.vivid;
/** The yellow of what is chosen. */
export const SELECTION = SHARED.selection;
/** The green of the "Written or modified" filter. */
export const WRITTEN_COLOR = SHARED.written;
/** The colour of a contact of the directory. */
export const CONTACT_COLOR = SHARED.contact;
/** By nature of note; the French ids are those of brains made before the plugin spoke English. @type {Record<string, string | undefined>} */
export const NATURE_COLORS = SHARED.natures;
/** The two sectors of the ring. @type {Record<string, { color: string } | undefined>} */
export const SECTORS = SHARED.sectors;
/** The colour of the seeds (validate.js). */
export const SEED_COLOR = SHARED.seed;
/** The colour of the floor: the person's own skills (executive.js). */
export const SKILL_COLOR = SHARED.skill;
/** The guards (executive.js). */
export const GUARD_COLOR = SHARED.guard;
/** The usage page (usage.js): the person, the judge, what the judge reads again, a cap reached. */
export const USAGE_YOU = SHARED.usage.you;
export const USAGE_JUDGE = SHARED.usage.judge;
export const USAGE_JUDGE_REREAD = SHARED.usage.judgeReread;
export const USAGE_WARNING = SHARED.usage.warning;

/** The ground in use. @returns {Ground} */
export const groundName = () => colors.ground;

/** @type {Set<(ground: Ground) => void>} */
const listeners = new Set();
/** Called after each change of ground. @param {(ground: Ground) => void} fn */
export function onGroundChange(fn) { listeners.add(fn); }

/** The root carries the ground (the stylesheet reads it there), and the window's bar its colour. */
function showOnRoot() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.ground = colors.ground;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colors.metaColor);
}

/**
 * Changes the ground: the palette of the canvases, the root's attribute, what
 * this browser remembers; then each listener redraws what it owns.
 * @param {unknown} name a ground; anything else changes nothing
 * @param {{ keep?: boolean }} [options] keep: false to show it without remembering it
 */
export function setGround(name, { keep = true } = {}) {
  if (!isGround(name)) return;
  colors = paletteOf(name);
  showOnRoot();
  if (keep) remember("ground", name);
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

// The swatches a colour of the brain is brought to (each above 3:1 on the
// three grounds and on a surface): the six vivid colours first, then their
// light values, so that eight domains stay eight colours.
const SWATCHES = [
  ...HUES.map((t) => ({ color: t.vivid, light: false })),
  ...HUES.map((t) => ({ color: t.light, light: true })),
].map((w) => ({ ...w, h: hslOf(/** @type {[number, number, number]} */ (rgbOf(w.color))).h }));

/** kind -> the brain's colour -> its swatch in the design. @type {Map<string, Map<string, string>>} */
const assigned = new Map();

/**
 * The colours of a kind, in the brain's order (its domains, its families):
 * they take their swatches in this order.
 * @param {string} kind
 * @param {string[]} list
 */
export function seedColors(kind, list) {
  assigned.delete(kind);
  for (const color of list) dataColor(color, kind);
}

/**
 * A colour the brain chose (a domain, a family of tools), as the page shows
 * it: brought to its nearest swatch of the design system by hue, one swatch
 * per colour of a kind while there are swatches left; a grey stays a grey.
 * The first colours asked take the swatches first: map.js and data.js ask
 * them in the brain's order.
 * @param {string} color
 * @param {string} kind "domain", "family"...
 * @returns {string}
 */
export function dataColor(color, kind) {
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
 * A colour as a text on the map or on a panel: a colour of the design system
 * is written in its vivid value, except the blue and the violet, written in
 * their light value (above 4.5:1 on the three grounds and on a surface); any
 * other colour is lightened.
 * @param {string} color
 * @returns {string}
 */
export function inkOf(color) {
  const upper = String(color).toUpperCase();
  for (const t of HUES) if (upper === t.vivid || upper === t.light) return t === HV.blue || t === HV.violet ? t.light : upper;
  const rgb = rgbOf(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map((v, i) => Math.round(v * 0.6 + [250, 248, 245][i] * 0.4));
  return `rgb(${r},${g},${b})`;
}

/**
 * The end of a halo (a radial gradient): the colour itself made transparent,
 * so that the halo fades in its own colour rather than through grey.
 * @param {string} color
 * @returns {string}
 */
export function fadeOf(color) {
  const rgb = rgbOf(color);
  return rgb ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)` : "rgba(255,255,255,0)";
}

/**
 * The colour of a logo drawn from its path: a black or very dark logo is
 * painted in cream, to be seen on the dark disc of a tool.
 * @param {string} hex six hexadecimal digits, without "#"
 * @returns {string}
 */
export function logoColor(hex) {
  const value = parseInt(hex, 16);
  const luminance = (0.299 * (value >> 16) + 0.587 * ((value >> 8) & 255) + 0.114 * (value & 255)) / 255;
  return luminance >= 0.3 ? `#${hex}` : HV.cream;
}

// ------------------------------------------------------------ the fonts

/**
 * Asks the fonts of the design (theme-hypervibe.css) for the canvases: the
 * browser only fetches a font a text of the page uses, and a canvas painted
 * before it arrives keeps the system's. Resolves once they are there, so that
 * the map is painted again (main.js, 2026-11-24).
 * @returns {Promise<boolean>} whether the fonts of the design were loaded
 */
export async function loadFonts() {
  if (typeof document === "undefined" || !document.fonts) return false;
  try {
    await Promise.all([`400 13px "Geist"`, `700 13px "Geist"`, `800 13px "Archivo"`, `400 13px "Geist Mono"`].map((f) => document.fonts.load(f)));
    return document.fonts.check(`400 13px "Geist"`) && document.fonts.check(`800 13px "Archivo"`);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ the choice of the ground

/** The buttons of the choice say which ground is in use. */
function showChoice() {
  if (typeof document === "undefined") return;
  for (const b of document.querySelectorAll("[data-ground-choice]")) {
    const on = b.getAttribute("data-ground-choice") === colors.ground;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
}

/**
 * Wires the choice of the ground (in the settings, under Appearance): a click
 * changes it at once, and the page remembers it. A ground chosen in another
 * window of the view is taken here too, without being remembered again.
 */
export function setUpGroundChoice() {
  showOnRoot();
  showChoice();
  for (const b of document.querySelectorAll("[data-ground-choice]")) {
    b.addEventListener("click", () => {
      const name = b.getAttribute("data-ground-choice");
      if (name !== colors.ground) setGround(name);
    });
  }
  onGroundChange(showChoice);
  onRememberedElsewhere("ground", (kept) => setGround(isGround(kept) ? kept : DEFAULT_GROUND, { keep: false }));
}
