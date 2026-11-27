// legend.js: the legend, what each element of the page stands for.
//
// Its texts are in the dictionary (legend... keys), its small drawings here.
// It shows as a full page over the map (the Legend button of the filters),
// and alone in legend.html. Rewritten on 2026-11-10 for the interface as it
// is today, with examples that belong to nobody's brain; brought up to 0.9.0
// on 2026-11-21 (a tool in both sectors, the amber key, the seeds and their
// validation, the card of a note, the notices, the clock at the half hour).
// The colours of the drawings are those the map paints on the night (theme.js);
// on the Hypervibe design, theme.js recolor translates them (2026-11-23), the
// disc of a tool into the night of its design system (2026-11-27).

import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { iconInDrawing } from "./icones-hypervibe.js";
import { colors, recolor } from "./theme.js";

/** @typedef {keyof import("./i18n/en.js").Dictionary} Key */

const CIRCLE = `<circle cx="32" cy="24" r="11" fill="#15162a" stroke="#3ee0c5" stroke-width="2"/>`;

/** The drawing of each item, on 64 by 48. A function when the drawing carries a text. @type {Record<string, string | (() => string)>} */
const DRAWINGS = {
  bubbles: `<circle cx="32" cy="24" r="20" fill="none" stroke="#4aa3ff" stroke-opacity=".5"/><circle cx="26" cy="20" r="2" fill="#4aa3ff"/><circle cx="34" cy="28" r="2" fill="#4aa3ff"/><circle cx="38" cy="18" r="2" fill="#4aa3ff"/>`,
  territories: `<circle cx="22" cy="22" r="13" fill="none" stroke="#9aa0d0" stroke-opacity=".6"/><circle cx="44" cy="28" r="10" fill="none" stroke="#9aa0d0" stroke-opacity=".6"/><circle cx="19" cy="20" r="2" fill="#4aa3ff"/><circle cx="26" cy="26" r="2" fill="#e0559b"/><circle cx="43" cy="26" r="2" fill="#ffc53d"/><circle cx="47" cy="31" r="2" fill="#4aa3ff"/>`,
  dust: `<circle cx="20" cy="18" r="1.3" fill="#9aa0b8"/><circle cx="30" cy="30" r="1.3" fill="#9aa0b8"/><circle cx="44" cy="20" r="1.3" fill="#9aa0b8"/><circle cx="38" cy="36" r="1.3" fill="#9aa0b8"/>`,
  move: `<circle cx="32" cy="24" r="12" fill="none" stroke="#9aa0b8" stroke-width="2"/><circle cx="32" cy="24" r="3.5" fill="#9aa0b8"/><path d="M32 6v6M32 36v6M14 24h6M44 24h6" fill="none" stroke="#9aa0b8" stroke-width="2" stroke-linecap="round"/>`,
  tool: `${CIRCLE}<text x="32" y="28" fill="#3ee0c5" font-size="10" text-anchor="middle" font-weight="700">AB</text>`,
  roles: `<circle cx="18" cy="24" r="10" fill="#15162a" stroke="#3ee0c5" stroke-width="2"/><circle cx="24" cy="31" r="3.2" fill="#b39dff" stroke="#15162a" stroke-width="1.5"/><circle cx="46" cy="24" r="10" fill="#15162a" stroke="#3ee0c5" stroke-width="2"/><circle cx="40" cy="31" r="3.2" fill="#3ee0c5" stroke="#15162a" stroke-width="1.5"/>`,
  cluster: `<circle cx="34" cy="24" r="11" fill="#15162a" stroke="#7ec8ff" stroke-width="2"/><circle cx="19" cy="18" r="2.6" fill="#15162a" stroke="#7ec8ff"/><circle cx="17" cy="25" r="2.6" fill="#15162a" stroke="#7ec8ff"/><circle cx="19" cy="32" r="2.6" fill="#15162a" stroke="#7ec8ff"/>`,
  struck: `<circle cx="32" cy="24" r="11" fill="#15162a" stroke="#9aa0b8" stroke-width="1.2" stroke-opacity=".6"/><line x1="23" y1="33" x2="41" y2="15" stroke="#ff8a8a" stroke-width="2"/>`,
  nextRun: `${CIRCLE}<circle cx="32" cy="24" r="14.5" fill="none" stroke="#3ee0c5" stroke-opacity=".2" stroke-width="2"/><path d="M32 9.5 A14.5 14.5 0 0 1 46.5 24" fill="none" stroke="#3ee0c5" stroke-width="2"/>`,
  // (The key and what is chosen are drawn as the design paints them: theme.js.)
  vault: () => `${CIRCLE}<circle cx="50" cy="10" r="8" fill="${colors.keyDisc}"/><g fill="none" stroke="${colors.keyStroke}" stroke-width="1.8" stroke-linecap="round"><circle cx="46.9" cy="10" r="2.6"/><path d="M49.5 10h5.7M52.3 10v2.3M55.2 10v2.3"/></g>`,
  chosen: () => `${CIRCLE}${colors.selectionEdge ? `<circle cx="32" cy="24" r="19" fill="none" stroke="${colors.selectionEdge}" stroke-width="4.4"/>` : ""}<circle cx="32" cy="24" r="19" fill="none" stroke="#ffe500" stroke-width="2"/>`,
  breathing: `<defs><radialGradient id="legend-halo"><stop offset="0" stop-color="#3ee0c5"/><stop offset="1" stop-color="#3ee0c5" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="24" r="20" fill="url(#legend-halo)" opacity=".7"/>${CIRCLE}`,
  write: `<circle cx="10" cy="24" r="6" fill="#15162a" stroke="#4aa3ff" stroke-width="2"/><path d="M16 24 Q34 10 54 22" fill="none" stroke="#4aa3ff" stroke-width="2"/><circle cx="54" cy="22" r="2.5" fill="#4aa3ff"/>`,
  orphan: `<path d="M32 4 Q34 20 44 36" fill="none" stroke="#ffffff" stroke-width="2"/><circle cx="44" cy="36" r="2.5" fill="#ffffff"/>`,
  read: `<circle cx="14" cy="30" r="2.5" fill="#ff7ae0"/><circle cx="32" cy="16" r="2.5" fill="#ff7ae0"/><circle cx="50" cy="28" r="2.5" fill="#ff7ae0"/><path d="M14 30 L32 16 L50 28" fill="none" stroke="#ff7ae0" stroke-width="1.5"/>`,
  opened: `<circle cx="20" cy="24" r="5" fill="#ff7ae0" stroke="#ffffff" stroke-opacity=".8" stroke-width="1.5"/><circle cx="44" cy="24" r="4" fill="none" stroke="#ff7ae0" stroke-width="2"/>`,
  fetch: `<circle cx="12" cy="30" r="3" fill="#ffc53d"/><line x1="12" y1="30" x2="48" y2="18" stroke="#ffc53d" stroke-opacity=".4" stroke-width="1.5"/><circle cx="26" cy="25.3" r="2" fill="#ffc53d"/><circle cx="34" cy="22.7" r="2" fill="#ffc53d"/><circle cx="48" cy="18" r="7" fill="#15162a" stroke="#b39dff" stroke-width="2"/>`,
  activity: `<path d="M8 24h12l5-10 8 20 5-10h18" fill="none" stroke="#9aa0b8" stroke-width="2"/>`,
  // The crown of the harnesses (2026-11-23).
  harnessArc: `<path d="M6 40 A30 30 0 0 1 58 40" fill="none" stroke="#a78bfa" stroke-width="10" stroke-opacity="0.15"/><path d="M6 40 A30 30 0 0 1 58 40" fill="none" stroke="#a78bfa" stroke-opacity="0.55"/><circle cx="14" cy="27" r="2.2" fill="#a78bfa"/><circle cx="24" cy="19" r="2.2" fill="#a78bfa"/><circle cx="34" cy="16" r="2.2" fill="#a78bfa"/><circle cx="44" cy="19" r="2.2" fill="#a78bfa"/><circle cx="52" cy="27" r="2.2" fill="#a78bfa"/>`,
  skillLit: `<circle cx="32" cy="16" r="10" fill="#a78bfa" fill-opacity="0.35"/><circle cx="32" cy="16" r="4" fill="#a78bfa" stroke="#fff" stroke-width="1.5"/><line x1="32" y1="16" x2="32" y2="38" stroke="#a78bfa" stroke-width="1.6"/><circle cx="32" cy="40" r="6" fill="#15162a" stroke="#a78bfa" stroke-width="2"/>`,
  ownGuard: `<path d="M32 11.350000000000001L43 16.3L43 24.55Q41.35 33.9 32 38.3Q22.65 33.9 21 24.55L21 16.3Z" fill="#f59e0b" stroke="#0b0c18" stroke-width="1.5"/><rect x="28.5" y="23.5" width="7" height="5.5" fill="#0b0c18"/><path d="M29.6 23.5 a2.4 2.4 0 0 1 4.8 0" fill="none" stroke="#0b0c18" stroke-width="1.5"/>`,
  pluginHook: `<path d="M22 15.950000000000001L29 19.1L29 24.35Q27.95 30.3 22 33.1Q16.05 30.3 15 24.35L15 19.1Z" fill="#15162a" stroke="#3ee0c5" stroke-width="1.5"/><path d="M42 15.950000000000001L49 19.1L49 24.35Q47.95 30.3 42 33.1Q36.05 30.3 35 24.35L35 19.1Z" fill="#15162a" stroke="#ff7ae0" stroke-width="1.5"/>`,
  layers: `<circle cx="32" cy="24" r="6" fill="none" stroke="#9aa0b8"/><circle cx="32" cy="24" r="12" fill="none" stroke="#9aa0b8"/><circle cx="32" cy="24" r="18" fill="none" stroke="#9aa0b8"/>`,
  filter: `<path d="M10 12h44l-16 18v10l-12 6V30z" fill="none" stroke="#9aa0b8" stroke-width="2"/>`,
  seeds: `<circle cx="14" cy="34" r="1.6" fill="#9aa0b8" opacity=".3"/><circle cx="50" cy="38" r="1.6" fill="#9aa0b8" opacity=".3"/><circle cx="32" cy="8" r="1.6" fill="#9aa0b8" opacity=".3"/><g fill="#9be7c4" stroke="#9be7c4" stroke-width="1.4"><circle cx="20" cy="18" r="6" fill-opacity=".25"/><circle cx="20" cy="18" r="2.6"/><circle cx="42" cy="22" r="6" fill-opacity=".25"/><circle cx="42" cy="22" r="2.6"/><circle cx="30" cy="36" r="6" fill-opacity=".25"/><circle cx="30" cy="36" r="2.6"/></g>`,
  chosenNote: () => `<path d="M26 26L48 12M26 26L52 34M26 26L8 38" fill="none" stroke="#ffffff" stroke-opacity=".4"/><circle cx="48" cy="12" r="2.4" fill="#ffffff"/><circle cx="52" cy="34" r="2.4" fill="#ffffff"/><circle cx="8" cy="38" r="2.4" fill="#ffffff"/><circle cx="26" cy="26" r="12" fill="#ffe500" opacity=".25"/><circle cx="26" cy="26" r="4.5" fill="#ffe500"${colors.selectionEdge ? ` stroke="${colors.selectionEdge}" stroke-width="1.2"` : ""}/>`,
  status: () => `<rect x="4" y="14" width="56" height="20" rx="5" fill="rgba(155,231,196,.12)" stroke="#9be7c4"/><text x="32" y="27.5" fill="#9be7c4" font-size="9" text-anchor="middle">${escapeHtml(t("validateNote"))}</text>`,
  openFile: `<path d="M20 8h17l9 9v23H20z" fill="none" stroke="#9aa0b8" stroke-width="2" stroke-linejoin="round"/><path d="M37 8v9h9" fill="none" stroke="#9aa0b8" stroke-width="2" stroke-linejoin="round"/><path d="M25 26h16M25 32h12" fill="none" stroke="#9aa0b8" stroke-width="1.6" stroke-linecap="round"/>`,
  refresh: () => `<rect x="4" y="14" width="56" height="20" rx="5" fill="rgba(126,227,107,.12)" stroke="#7ee36b"/><text x="32" y="27.5" fill="#b9f5ad" font-size="9" text-anchor="middle">${escapeHtml(t("refresh"))}</text>`,
  history: `<path d="M12 12v24" fill="none" stroke="#9aa0b8" stroke-opacity=".5" stroke-width="2"/><rect x="18" y="9" width="36" height="8" rx="2" fill="none" stroke="#7ee36b"/><rect x="18" y="20" width="36" height="8" rx="2" fill="none" stroke="#9aa0b8" stroke-opacity=".6"/><rect x="18" y="31" width="36" height="8" rx="2" fill="none" stroke="#ff8a8a"/>`,
  settings: `<circle cx="32" cy="24" r="6" fill="none" stroke="#9aa0b8" stroke-width="2"/><path d="M32 8v6M32 34v6M16 24h6M42 24h6M20.7 12.7l4.2 4.2M39.1 31.1l4.2 4.2M20.7 35.3l4.2-4.2M39.1 16.9l4.2-4.2" fill="none" stroke="#9aa0b8" stroke-width="2" stroke-linecap="round"/>`,
  usage: `<path d="M10 40h44" fill="none" stroke="#9aa0b8" stroke-opacity=".6"/><rect x="14" y="26" width="8" height="14" fill="#3987e5"/><rect x="14" y="20" width="8" height="5" fill="#d95926"/><rect x="28" y="14" width="8" height="26" fill="#3987e5"/><rect x="28" y="8" width="8" height="5" fill="#d95926"/><rect x="42" y="30" width="8" height="10" fill="#3987e5"/>`,
  index: `<path d="M22 14h30M22 24h30M22 34h30" fill="none" stroke="#9aa0b8" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="14" r="2" fill="#9aa0b8"/><circle cx="13" cy="24" r="2" fill="#9aa0b8"/><circle cx="13" cy="34" r="2" fill="#9aa0b8"/>`,
  notices: `<rect x="6" y="10" width="52" height="28" rx="6" fill="rgba(250,178,25,.08)" stroke="#fab219" stroke-opacity=".7"/><path d="M13 20h38M13 28h26" fill="none" stroke="#9aa0b8" stroke-width="2" stroke-linecap="round"/>`,
  install: `<rect x="10" y="10" width="44" height="30" rx="5" fill="rgba(255,229,0,.12)" stroke="#ffe500"/><path d="M32 16v13M26 24l6 6 6-6" fill="none" stroke="#ffe500" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  // The switch of the design (2026-11-24): the two designs side by side, each on its own night (2026-11-27: the night
  // blue, then the warm black of the design system), Hypervibe with its rainbow band, its cream and its colours.
  // (In rgb(): recolor leaves them as they are in both designs.)
  design: `<rect x="5" y="12" width="26" height="24" rx="5" fill="rgb(11,12,24)" stroke="rgb(154,160,184)" stroke-opacity=".6"/><circle cx="13" cy="21" r="2.2" fill="rgb(74,163,255)"/><circle cx="22" cy="28" r="2.2" fill="rgb(224,85,155)"/><rect x="33" y="12" width="26" height="24" rx="5" fill="rgb(26,20,16)" stroke="rgb(250,248,245)" stroke-opacity=".35"/><g><rect x="35" y="13.5" width="4.4" height="2.4" fill="rgb(255,96,64)"/><rect x="39.4" y="13.5" width="4.4" height="2.4" fill="rgb(255,229,0)"/><rect x="43.8" y="13.5" width="4.4" height="2.4" fill="rgb(0,200,150)"/><rect x="48.2" y="13.5" width="4.4" height="2.4" fill="rgb(75,123,255)"/><rect x="52.6" y="13.5" width="4.4" height="2.4" fill="rgb(139,92,246)"/></g><circle cx="41" cy="24" r="2.2" fill="rgb(255,229,0)"/><circle cx="50" cy="29" r="2.2" fill="rgb(255,77,109)"/>`,
  keys: `<rect x="20" y="12" width="24" height="24" rx="5" fill="none" stroke="#9aa0b8" stroke-width="2"/><path d="M36 17 L28 31" fill="none" stroke="#e8e9f5" stroke-width="2" stroke-linecap="round"/>`,
};

/** The legend: its sections, and in each the items (a drawing, the key of its title, the key of its text). @type {{ title: Key, items: [drawing: string, title: Key, text: Key][] }[]} */
const SECTIONS = [
  { title: "legendBrain", items: [
    ["bubbles", "legendBubblesTitle", "legendBubblesText"],
    ["territories", "legendTerritoriesTitle", "legendTerritoriesText"],
    ["dust", "legendDustTitle", "legendDustText"],
    ["move", "legendMoveTitle", "legendMoveText"],
  ] },
  { title: "legendRing", items: [
    ["tool", "legendToolTitle", "legendToolText"],
    ["roles", "legendRolesTitle", "legendRolesText"],
    ["cluster", "legendClusterTitle", "legendClusterText"],
    ["struck", "legendStruckTitle", "legendStruckText"],
  ] },
  { title: "legendTime", items: [
    ["nextRun", "legendNextRunTitle", "legendNextRunText"],
    ["vault", "legendVaultTitle", "legendVaultText"],
    ["chosen", "legendChosenTitle", "legendChosenText"],
  ] },
  { title: "legendNow", items: [
    ["breathing", "legendBreathingTitle", "legendBreathingText"],
    ["write", "legendWriteTitle", "legendWriteText"],
    ["orphan", "legendOrphanTitle", "legendOrphanText"],
    ["read", "legendReadTitle", "legendReadText"],
    ["opened", "legendOpenedTitle", "legendOpenedText"],
    ["fetch", "legendFetchTitle", "legendFetchText"],
    ["activity", "legendActivityTitle", "legendActivityText"],
  ] },
  { title: "legendHarnesses", items: [
    ["harnessArc", "legendHarnessArcTitle", "legendHarnessArcText"],
    ["skillLit", "legendSkillLitTitle", "legendSkillLitText"],
    ["ownGuard", "legendOwnGuardTitle", "legendOwnGuardText"],
    ["pluginHook", "legendPluginHookTitle", "legendPluginHookText"],
  ] },
  { title: "legendFilters", items: [
    ["layers", "legendLayersTitle", "legendLayersText"],
    ["filter", "legendFilterTitle", "legendFilterText"],
    ["seeds", "legendSeedsTitle", "legendSeedsText"],
    ["design", "legendDesignTitle", "legendDesignText"],
  ] },
  { title: "legendNote", items: [
    ["chosenNote", "legendChosenNoteTitle", "legendChosenNoteText"],
    ["status", "legendStatusTitle", "legendStatusText"],
    ["openFile", "legendOpenFileTitle", "legendOpenFileText"],
  ] },
  { title: "legendCard", items: [
    ["refresh", "legendRefreshTitle", "legendRefreshText"],
    ["history", "legendHistoryTitle", "legendHistoryText"],
  ] },
  { title: "legendPages", items: [
    ["settings", "legendSettingsTitle", "legendSettingsText"],
    ["usage", "legendUsageTitle", "legendUsageText"],
    ["index", "legendIndexTitle", "legendIndexText"],
    ["notices", "legendNoticesTitle", "legendNoticesText"],
    ["install", "legendInstallTitle", "legendInstallText"],
    ["keys", "legendKeysTitle", "legendKeysText"],
  ] },
];

// THE ICONS OF THE PAGE, IN THE LEGEND (2026-11-24). Some drawings are those
// of a button or a title of the page; on the Hypervibe design, the page shows
// the icons of its design system there (icones-hypervibe.js), so the legend
// shows them too, in the colour of a text.
/** @type {Record<string, string>} */
const AS_ICONS = { move: "cible", activity: "cerveau", layers: "couches", filter: "filtrer", openFile: "document", settings: "reglages", index: "menu" };

/** @param {string} name */
function drawing(name) {
  if (colors.name === "hypervibe" && AS_ICONS[name]) return `<svg viewBox="0 0 64 48" aria-hidden="true">${iconInDrawing(AS_ICONS[name], { x: 16, y: 8, size: 32, color: colors.toolName })}</svg>`;
  const drawn = DRAWINGS[name];
  return `<svg viewBox="0 0 64 48" aria-hidden="true">${recolor(typeof drawn === "function" ? drawn() : drawn)}</svg>`;
}

/**
 * The legend as HTML, in the page's language: an introduction, then the sections.
 * @returns {string}
 */
export function legendHtml() {
  return `<p class="intro">${t("legendIntro")}</p>` + SECTIONS.map((section) =>
    `<h2>${t(section.title)}</h2>` + section.items.map(([name, title, text]) => `<div class="item">${drawing(name)}<div><h3>${t(title)}</h3><p>${t(text)}</p></div></div>`).join("")).join("");
}

// ------------------------------------------------------------ over the map (index.html)

/** Whether the legend is open over the map. */
export const legendIsOpen = () => !$("#legend").hidden;

/** Opens the legend as a full page, like the settings. Written at each opening: the language may have been learnt since. */
export function openLegend() {
  $("#legend-body").innerHTML = legendHtml();
  $("#legend").hidden = false;
  $("#legend").scrollTop = 0;
}

/** Closes the legend: back to the map. */
export function closeLegend() {
  $("#legend").hidden = true;
}

/** Wires the Legend button of the filters box, and the legend's "back" button. */
export function setUpLegend() {
  $("#open-legend").addEventListener("click", openLegend);
  $("#legend-close").addEventListener("click", closeLegend);
}
