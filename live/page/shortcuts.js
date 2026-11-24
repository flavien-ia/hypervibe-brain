// shortcuts.js: the keys of the page: "/" goes to the search, Esc closes the
// layer on top, and on an open note V validates a seed, N opens the next one.

import { closeIndex, indexIsOpen } from "./index-page.js";
import { closeLegend, legendIsOpen } from "./legend.js";
import { changeStatus, openNextSeed } from "./note-card.js";
import { closePanel, panel } from "./panel.js";
import { searchField } from "./search.js";
import { closeSettings, settingsAreOpen } from "./settings.js";
import { state } from "./state.js";
import { closeTooltip } from "./tooltip.js";
import { toggleUsage, usageIsOpen } from "./usage.js";
import { isSeed } from "./validate.js";

/**
 * "/" goes to the search, except when one is writing somewhere else (the
 * filter of the index, the one of the usage page, a setting, a dialog).
 * @param {EventTarget | null} target
 */
const isTyping = (target) => {
  const el = /** @type {HTMLElement | null} */ (target);
  return Boolean(el?.closest?.("input, textarea, select") || el?.isContentEditable);
};

/** Wires the keyboard: one listener for the whole page. */
export function setUpShortcuts() {
  // ONE SINGLE HANDLER FOR ESC: it closes the layer on top, and only that
  // one. The modal comes before it (it keeps the keyboard, in capture). Then,
  // in the order the layers cover each other: the tooltip, the legend or the
  // settings (they cover everything, the card included), the open card, then
  // the index or the usage page (the card opens over them).
  addEventListener("keydown", (ev) => {
    if (ev.key === "/" && !isTyping(ev.target)) { ev.preventDefault(); searchField.focus(); return; }
    // ON AN OPEN NOTE (2026-11-21): V validates it when it is a seed, N opens
    // the next seed. Never while one writes, never with a modifier (Ctrl+V
    // pastes), never under a page that covers the card.
    const plain = !ev.ctrlKey && !ev.metaKey && !ev.altKey && !isTyping(ev.target);
    if (plain && (ev.key === "v" || ev.key === "V" || ev.key === "n" || ev.key === "N") && !panel.hidden && state.selection && !legendIsOpen() && !settingsAreOpen() && !document.querySelector(".modal-backdrop")) {
      ev.preventDefault();
      if (ev.key.toLowerCase() === "n") return openNextSeed();
      if (isSeed(state.noteById.get(state.selection)?.status)) changeStatus(state.selection, "trusted");
      return;
    }
    if (ev.key !== "Escape" || ev.target === searchField) return; // the search has its own: it closes its results
    if (closeTooltip()) return;
    if (legendIsOpen()) return closeLegend();
    if (settingsAreOpen()) return closeSettings();
    if (!panel.hidden) return closePanel();
    if (indexIsOpen()) return closeIndex();
    if (usageIsOpen()) return toggleUsage(false);
  });
}
