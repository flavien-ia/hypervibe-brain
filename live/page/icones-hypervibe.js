// icones-hypervibe.js: the icons of the page, those of the design system of
// Hypervibe (2026-11-24).
//
// THE ICONS OF THE DESIGN SYSTEM, WITHOUT A DEPENDENCY. The design system of
// Hypervibe has one family of icons, Phosphor in duotone (MIT licence,
// https://phosphoricons.com): each icon is two paths on a grid of 256, the
// stroke in the colour of the text it goes with, and a background in the same
// colour at 20 %. The paths below are copied from the app
// (src/lib/design/icones.ts, generated from @phosphor-icons/core 2.1.1), with
// its names; the drawing is that of its component (src/components/ui/icone.tsx).
// The weight of the stroke, its round ends, its joins are in the paths
// themselves: an icon is filled, never stroked.
//
// THE PAGE KEEPS WRITING ITS ICONS AS IT ALWAYS DID: a small drawing in the
// markup or in a module, with its classes, its size and its states. This
// module puts an icon of the design system beside each of them (the drawing
// is then hidden by theme-hypervibe.css), and turns the arrows typed in the
// texts ("←", "→", "↗", "×"...) into icons, which the design system asks
// for ("never an arrow typed instead of an icon"). It follows whatever the
// page writes later (a card, a list, a dialog) through one MutationObserver.
// (Until 2026-11-27 it did so under one of two designs only, and took its
// icons away under the other: the page has one design now.)
//
// It imports nothing of the page, so that the pages without the map
// (history.html, legend.html) use it as they are.

/** @typedef {{ fond: string | null, trait: string }} Picto */

/** The paths, by their name in the design system. @type {Record<string, Picto>} */
export const PICTOS = {
  precedent: {
    fond: "M160,48V208L80,128Z",
    trait: "M163.06,40.61a8,8,0,0,0-8.72,1.73l-80,80a8,8,0,0,0,0,11.32l80,80A8,8,0,0,0,168,208V48A8,8,0,0,0,163.06,40.61ZM152,188.69,91.31,128,152,67.31Z",
  },
  suivant: {
    fond: "M176,128,96,208V48Z",
    trait: "M181.66,122.34l-80-80A8,8,0,0,0,88,48V208a8,8,0,0,0,13.66,5.66l80-80A8,8,0,0,0,181.66,122.34ZM104,188.69V67.31L164.69,128Z",
  },
  fleche: {
    fond: "M192,64V168L88,64Z",
    trait: "M192,56H88a8,8,0,0,0-5.66,13.66L128.69,116,58.34,186.34a8,8,0,0,0,11.32,11.32L140,127.31l46.34,46.35A8,8,0,0,0,200,168V64A8,8,0,0,0,192,56Zm-8,92.69-38.34-38.34h0L107.31,72H184Z",
  },
  bas: {
    fond: "M208,96l-80,80L48,96Z",
    trait: "M215.39,92.94A8,8,0,0,0,208,88H48a8,8,0,0,0-5.66,13.66l80,80a8,8,0,0,0,11.32,0l80-80A8,8,0,0,0,215.39,92.94ZM128,164.69,67.31,104H188.69Z",
  },
  fermer: {
    fond: "M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z",
    trait: "M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z",
  },
  aide: {
    fond: "M224,128a96,96,0,1,1-96-96A96,96,0,0,1,224,128Z",
    trait: "M140,180a12,12,0,1,1-12-12A12,12,0,0,1,140,180ZM128,72c-22.06,0-40,16.15-40,36v4a8,8,0,0,0,16,0v-4c0-11,10.77-20,24-20s24,9,24,20-10.77,20-24,20a8,8,0,0,0-8,8v8a8,8,0,0,0,16,0v-.72c18.24-3.35,32-17.9,32-35.28C168,88.15,150.06,72,128,72Zm104,56A104,104,0,1,1,128,24,104.11,104.11,0,0,1,232,128Zm-16,0a88,88,0,1,0-88,88A88.1,88.1,0,0,0,216,128Z",
  },
  reglages: {
    fond: "M230.1,108.76,198.25,90.62c-.64-1.16-1.31-2.29-2-3.41l-.12-36A104.61,104.61,0,0,0,162,32L130,49.89c-1.34,0-2.69,0-4,0L94,32A104.58,104.58,0,0,0,59.89,51.25l-.16,36c-.7,1.12-1.37,2.26-2,3.41l-31.84,18.1a99.15,99.15,0,0,0,0,38.46l31.85,18.14c.64,1.16,1.31,2.29,2,3.41l.12,36A104.61,104.61,0,0,0,94,224l32-17.87c1.34,0,2.69,0,4,0L162,224a104.58,104.58,0,0,0,34.08-19.25l.16-36c.7-1.12,1.37-2.26,2-3.41l31.84-18.1A99.15,99.15,0,0,0,230.1,108.76ZM128,168a40,40,0,1,1,40-40A40,40,0,0,1,128,168Z",
    trait: "M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A111.92,111.92,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.1,8.1,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8,8,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z",
  },
  couches: {
    fond: "M224,80l-96,56L32,80l96-56Z",
    trait: "M230.91,172A8,8,0,0,1,228,182.91l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,36,169.09l92,53.65,92-53.65A8,8,0,0,1,230.91,172ZM220,121.09l-92,53.65L36,121.09A8,8,0,0,0,28,134.91l96,56a8,8,0,0,0,8.06,0l96-56A8,8,0,1,0,220,121.09ZM24,80a8,8,0,0,1,4-6.91l96-56a8,8,0,0,1,8.06,0l96,56a8,8,0,0,1,0,13.82l-96,56a8,8,0,0,1-8.06,0l-96-56A8,8,0,0,1,24,80Zm23.88,0L128,126.74,208.12,80,128,33.26Z",
  },
  filtrer: {
    fond: "M221.9,61.38,152,136v58.65a8,8,0,0,1-3.56,6.66l-32,21.33A8,8,0,0,1,104,216V136L34.1,61.38A8,8,0,0,1,40,48H216A8,8,0,0,1,221.9,61.38Z",
    trait: "M230.6,49.53A15.81,15.81,0,0,0,216,40H40A16,16,0,0,0,28.19,66.76l.08.09L96,139.17V216a16,16,0,0,0,24.87,13.32l32-21.34A16,16,0,0,0,160,194.66V139.17l67.74-72.32.08-.09A15.8,15.8,0,0,0,230.6,49.53ZM40,56h0Zm106.18,74.58A8,8,0,0,0,144,136v58.66L112,216V136a8,8,0,0,0-2.16-5.47L40,56H216Z",
  },
  boucle: {
    fond: "M216,128a88,88,0,1,1-88-88A88,88,0,0,1,216,128Z",
    trait: "M224,48V96a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h28.69L182.06,73.37a79.56,79.56,0,0,0-56.13-23.43h-.45A79.52,79.52,0,0,0,69.59,72.71,8,8,0,0,1,58.41,61.27a96,96,0,0,1,135,.79L208,76.69V48a8,8,0,0,1,16,0ZM186.41,183.29a80,80,0,0,1-112.47-.66L59.31,168H88a8,8,0,0,0,0-16H40a8,8,0,0,0-8,8v48a8,8,0,0,0,16,0V179.31l14.63,14.63A95.43,95.43,0,0,0,130,222.06h.53a95.36,95.36,0,0,0,67.07-27.33,8,8,0,0,0-11.18-11.44Z",
  },
  menu: {
    fond: "M216,64V192H40V64Z",
    trait: "M224,128a8,8,0,0,1-8,8H40a8,8,0,0,1,0-16H216A8,8,0,0,1,224,128ZM40,72H216a8,8,0,0,0,0-16H40a8,8,0,0,0,0,16ZM216,184H40a8,8,0,0,0,0,16H216a8,8,0,0,0,0-16Z",
  },
  cible: {
    fond: "M176,128a48,48,0,1,1-48-48A48,48,0,0,1,176,128Z",
    trait: "M221.87,83.16A104.1,104.1,0,1,1,195.67,49l22.67-22.68a8,8,0,0,1,11.32,11.32l-96,96a8,8,0,0,1-11.32-11.32l27.72-27.72a40,40,0,1,0,17.87,31.09,8,8,0,1,1,16-.9,56,56,0,1,1-22.38-41.65L184.3,60.39a87.88,87.88,0,1,0,23.13,29.67,8,8,0,0,1,14.44-6.9Z",
  },
  base: {
    fond: "M216,80c0,26.51-39.4,48-88,48S40,106.51,40,80s39.4-48,88-48S216,53.49,216,80Z",
    trait: "M128,24C74.17,24,32,48.6,32,80v96c0,31.4,42.17,56,96,56s96-24.6,96-56V80C224,48.6,181.83,24,128,24Zm80,104c0,9.62-7.88,19.43-21.61,26.92C170.93,163.35,150.19,168,128,168s-42.93-4.65-58.39-13.08C55.88,147.43,48,137.62,48,128V111.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64ZM69.61,53.08C85.07,44.65,105.81,40,128,40s42.93,4.65,58.39,13.08C200.12,60.57,208,70.38,208,80s-7.88,19.43-21.61,26.92C170.93,115.35,150.19,120,128,120s-42.93-4.65-58.39-13.08C55.88,99.43,48,89.62,48,80S55.88,60.57,69.61,53.08ZM186.39,202.92C170.93,211.35,150.19,216,128,216s-42.93-4.65-58.39-13.08C55.88,195.43,48,185.62,48,176V159.36c17.06,15,46.23,24.64,80,24.64s62.94-9.68,80-24.64V176C208,185.62,200.12,195.43,186.39,202.92Z",
  },
  cerveau: {
    fond: "M240,124a48,48,0,0,1-32,45.27h0V176a40,40,0,0,1-80,0,40,40,0,0,1-80,0v-6.73h0a48,48,0,0,1,0-90.54V72a40,40,0,0,1,80,0,40,40,0,0,1,80,0v6.73A48,48,0,0,1,240,124Z",
    trait: "M248,124a56.11,56.11,0,0,0-32-50.61V72a48,48,0,0,0-88-26.49A48,48,0,0,0,40,72v1.39a56,56,0,0,0,0,101.2V176a48,48,0,0,0,88,26.49A48,48,0,0,0,216,176v-1.41A56.09,56.09,0,0,0,248,124ZM88,208a32,32,0,0,1-31.81-28.56A55.87,55.87,0,0,0,64,180h8a8,8,0,0,0,0-16H64A40,40,0,0,1,50.67,86.27,8,8,0,0,0,56,78.73V72a32,32,0,0,1,64,0v68.26A47.8,47.8,0,0,0,88,128a8,8,0,0,0,0,16,32,32,0,0,1,0,64Zm104-44h-8a8,8,0,0,0,0,16h8a55.87,55.87,0,0,0,7.81-.56A32,32,0,1,1,168,144a8,8,0,0,0,0-16,47.8,47.8,0,0,0-32,12.26V72a32,32,0,0,1,64,0v6.73a8,8,0,0,0,5.33,7.54A40,40,0,0,1,192,164Zm16-52a8,8,0,0,1-8,8h-4a36,36,0,0,1-36-36V80a8,8,0,0,1,16,0v4a20,20,0,0,0,20,20h4A8,8,0,0,1,208,112ZM60,120H56a8,8,0,0,1,0-16h4A20,20,0,0,0,80,84V80a8,8,0,0,1,16,0v4A36,36,0,0,1,60,120Z",
  },
  eclair: {
    fond: "M96,240l16-80L48,136,160,16,144,96l64,24Z",
    trait: "M215.79,118.17a8,8,0,0,0-5-5.66L153.18,90.9l14.66-73.33a8,8,0,0,0-13.69-7l-112,120a8,8,0,0,0,3,13l57.63,21.61L88.16,238.43a8,8,0,0,0,13.69,7l112-120A8,8,0,0,0,215.79,118.17ZM109.37,214l10.47-52.38a8,8,0,0,0-5-9.06L62,132.71l84.62-90.66L136.16,94.43a8,8,0,0,0,5,9.06l52.8,19.8Z",
  },
  cle: {
    fond: "M232,98.36C230.73,136.92,198.67,168,160.09,168a71.68,71.68,0,0,1-26.92-5.17h0L120,176H96v24H72v24H40a8,8,0,0,1-8-8V187.31a8,8,0,0,1,2.34-5.65l58.83-58.83h0A71.68,71.68,0,0,1,88,95.91c0-38.58,31.08-70.64,69.64-71.87A72,72,0,0,1,232,98.36Z",
    trait: "M216.57,39.43A80,80,0,0,0,83.91,120.78L28.69,176A15.86,15.86,0,0,0,24,187.31V216a16,16,0,0,0,16,16H72a8,8,0,0,0,8-8V208H96a8,8,0,0,0,8-8V184h16a8,8,0,0,0,5.66-2.34l9.56-9.57A79.73,79.73,0,0,0,160,176h.1A80,80,0,0,0,216.57,39.43ZM224,98.1c-1.09,34.09-29.75,61.86-63.89,61.9H160a63.7,63.7,0,0,1-23.65-4.51,8,8,0,0,0-8.84,1.68L116.69,168H96a8,8,0,0,0-8,8v16H72a8,8,0,0,0-8,8v16H40V187.31l58.83-58.82a8,8,0,0,0,1.68-8.84A63.72,63.72,0,0,1,96,95.92c0-34.14,27.81-62.8,61.9-63.89A64,64,0,0,1,224,98.1ZM192,76a12,12,0,1,1-12-12A12,12,0,0,1,192,76Z",
  },
  document: {
    fond: "M208,88H152V32Z",
    trait: "M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-32-80a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,136Zm0,32a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h64A8,8,0,0,1,168,168Z",
  },
};

/** @typedef {keyof typeof PICTOS} IconName */

/**
 * An icon of the design system, as SVG. Mute unless it has a title (an icon
 * alone then has a name for screen readers); the background takes `accent`
 * at 45 %, else the colour of the stroke at 20 %, as in icone.tsx.
 * @param {string} name
 * @param {{ size?: number | string, className?: string, title?: string, accent?: string, noBackground?: boolean }} [options]
 * @returns {string}
 */
export function iconSvg(name, { size = 20, className = "", title = "", accent = "", noBackground = false } = {}) {
  const p = PICTOS[name];
  if (!p) return "";
  const label = title ? ` role="img" aria-label="${title.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)}"` : ` aria-hidden="true"`;
  const fond = p.fond && !noBackground ? `<path class="hv-fond" d="${p.fond}" fill="${accent || "currentColor"}" opacity="${accent ? 0.45 : 0.2}"/>` : "";
  return `<svg class="hv-icone${className ? ` ${className}` : ""}" width="${size}" height="${size}" viewBox="0 0 256 256" fill="currentColor"${label}>${fond}<path class="hv-trait" d="${p.trait}"/></svg>`;
}

/**
 * The same icon drawn inside another drawing (the legend's, on 64 by 48):
 * a group placed at x, y, of the given size.
 * @param {string} name
 * @param {{ x: number, y: number, size: number, color: string }} where
 * @returns {string}
 */
export function iconInDrawing(name, { x, y, size, color }) {
  const p = PICTOS[name];
  if (!p) return "";
  const k = size / 256;
  return `<g transform="translate(${x} ${y}) scale(${k})" fill="${color}">${p.fond ? `<path d="${p.fond}" opacity="0.2"/>` : ""}<path d="${p.trait}"/></g>`;
}

// ------------------------------------------------------------ what is replaced

// Each icon of the page, by where it is, and the icon of the design system
// that stands for it. The drawn element stays in the page, hidden; the new
// one comes right after it and takes its classes (its size and its states:
// folded, live, spinning... are those of the base rules).
// (Chosen on 2026-11-24. The pulse of the activity has no equivalent in the
// design system: the brain stands for it, which lights up when an AI reads.
// The two rings of "where the tools stand" become the database, the stacked
// ellipses closest to them.)
/** @type {[selector: string, icon: string][]} */
const SWAPS = [
  ["#redo-territories > svg", "boucle"],
  ["#open-index > svg", "menu"],
  ["#open-settings > svg", "reglages"],
  ["#recenter > svg", "cible"],
  ["#floors-reset > svg", "boucle"],
  ["#floors-tools > svg.as-floor", "couches"],
  ["#floors-tools > svg.as-rings", "base"],
  [".filter-title:has([data-i18n='layers']) > svg", "couches"],
  [".filter-title:has([data-i18n='filter']) > svg", "filtrer"],
  ["svg.activity-icon", "cerveau"],
  ["svg.key-icon", "cle"],
  ["span.chevron", "bas"],
];

// The characters typed instead of an icon, and their icon. An arrow becomes
// one wherever the page writes it in its own words (a button, a link, a
// line of the usage page...), never in the text of a note.
/** @type {Record<string, string>} */
const GLYPHS = { "←": "precedent", "→": "suivant", "↗": "fleche", "▾": "bas", "▼": "bas", "▲": "bas", "⚡": "eclair" };
/** The characters that are an icon only when they are the whole text of their element. @type {Record<string, [icon: string, where: string]>} */
const ALONE = { "×": ["fermer", "button"], "?": ["aide", ".help-mark"] };
const GLYPH_RE = /[←→↗▾▼▲⚡]/;
/** Where the page writes in its own words. */
const OWN_WORDS = "button, [role='button'], a, .help-mark, .skill-mark, .hero-delta, #hover, .what small, #legend-body b";
/** Where it does not: the text of a note, code, fields. */
const NOT_OURS = ".body, .exec-text, .modal-read-body, code, pre, kbd, textarea, select, option, script, style, svg, .hv-glyph";

const SWAP_SELECTORS = SWAPS.map(([selector, icon]) => [`${selector}:not(.hv-icone):not(.hv-replaced)`, icon]);

/** @param {string} html @returns {Element} */
function element(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  return /** @type {Element} */ (tpl.content.firstElementChild);
}

/** @param {Element} drawn the icon the page drew @param {string} icon the one of the design system that stands for it */
function swap(drawn, icon) {
  const classes = drawn.getAttribute("class") ?? "";
  drawn.after(element(iconSvg(icon, { className: classes })));
  drawn.classList.add("hv-replaced");
}

/** @param {Text} text */
function dressText(text) {
  const value = text.data;
  const parent = text.parentElement;
  if (!parent || parent.closest(NOT_OURS) || !parent.closest(OWN_WORDS)) return;
  const alone = ALONE[value.trim()];
  if (alone) {
    if (parent.matches(alone[1]) && parent.childNodes.length === 1) text.replaceWith(glyph(value, alone[0], "hv-alone"));
    return;
  }
  if (!GLYPH_RE.test(value)) return;
  const parts = value.split(/([←→↗▾▼▲⚡])/);
  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (!part) continue;
    fragment.append(GLYPHS[part] ? glyph(part, GLYPHS[part], part === "▲" ? "hv-up" : "") : document.createTextNode(part));
  }
  text.replaceWith(fragment);
}

/**
 * A character turned into an icon: the character stays, hidden, so that the
 * text of the element is the same for the code that reads it.
 * @param {string} character @param {string} icon @param {string} extra
 */
function glyph(character, icon, extra) {
  const span = document.createElement("span");
  span.className = `hv-glyph${extra ? ` ${extra}` : ""}`;
  const kept = document.createElement("span");
  kept.className = "hv-glyph-text";
  kept.textContent = character;
  span.append(kept, element(iconSvg(icon, { className: "hv-inline", size: "1em" })));
  return span;
}

/** @param {Node} root */
function dress(root) {
  if (root.nodeType === Node.TEXT_NODE) { dressText(/** @type {Text} */ (root)); return; }
  if (!(root instanceof Element) && !(root instanceof Document)) return;
  if (root instanceof Element && root.closest(".hv-icone, .hv-glyph")) return;
  for (const [selector, icon] of SWAP_SELECTORS) {
    if (root instanceof Element && root.matches(selector)) swap(root, icon);
    for (const el of root.querySelectorAll(selector)) swap(el, icon);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  /** @type {Text[]} */
  const texts = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(/** @type {Text} */ (n));
  for (const text of texts) dressText(text);
}

/**
 * The gradient the background of a clicked icon takes on hover (the
 * design system's DegradeIcones): once in the document, hidden by its size.
 */
function gradient() {
  if (document.getElementById("hv-icone-arc-en-ciel-defs")) return;
  const stops = ["#FF6040", "#FFE500", "#00C896", "#4B7BFF", "#8B5CF6"].map((c, i) => `<stop offset="${i / 4}" stop-color="${c}"/>`).join("");
  const defs = element(`<svg id="hv-icone-arc-en-ciel-defs" aria-hidden="true" width="0" height="0" style="position:absolute"><defs><linearGradient id="hv-icone-arc-en-ciel" x1="0" y1="1" x2="1" y2="0">${stops}</linearGradient></defs></svg>`);
  document.body.append(defs);
}

let started = false;

/** Dresses the page in the icons of the design system, and follows what it writes afterwards: call once, on any page of the view. */
export function startIcons() {
  if (started || typeof document === "undefined" || !document.body) return;
  started = true;
  new MutationObserver((changes) => {
    for (const change of changes) {
      if (change.type === "characterData") dress(change.target);
      else for (const node of change.addedNodes) if (node.isConnected) dress(node);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
  gradient();
  dress(document.body);
}
