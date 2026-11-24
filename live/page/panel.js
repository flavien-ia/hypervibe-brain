// panel.js: the panel on the right, where a card opens: a note, a catalogue
// entry or a contact (note-card.js), a tool (tool-card.js).

import { $ } from "./dom.js";
import { paintBackground } from "./paint-background.js";
import { paintLive } from "./paint-live.js";
import { state } from "./state.js";

/** The panel on the right. */
export const panel = $("#panel");
/** Where a card is written. */
export const panelContent = $("#panel-content");

/** @type {(() => void) | null} what the card of a tool does when it closes (tool-card.js: the map goes back where it was) */
let onToolCardClose = null;
/** @param {() => void} fn */
export const whenToolCardCloses = (fn) => { onToolCardClose = fn; };

/** @type {(() => void) | null} what else forgets its choice when the panel closes (executive.js) */
let onClose = null;
/** @param {() => void} fn */
export const whenPanelCloses = (fn) => { onClose = fn; };

/** Closes the panel: nothing is chosen any more. */
export function closePanel() {
  panel.hidden = true;
  onClose?.();
  state.selection = null;
  state.chosenEntry = null;
  if (state.chosenTool) {
    state.chosenTool = null;
    paintBackground();
    onToolCardClose?.();
  }
  paintLive();
}

/** Wires the cross that closes the panel. */
export function setUpPanel() {
  $("#panel-close").addEventListener("click", closePanel);
}
