// THE MODAL (2026-11-10): a real window, in place of confirm() and prompt().
// Two uses:
//
//   const ok = await confirmDialog({ title, text, yes: "Redo", no: "Cancel" });
//     -> true (the main button) or false (Cancel, Esc, a click beside it)
//
//   const name = await askDialog({ title, text, value, placeholder, yes: "Rename" });
//     -> the text typed (Enter or the main button), or null when cancelled
//        (with number: { min, max }, the field only takes a number)
//
// The text may hold several paragraphs: an array of strings. It is placed as
// text, never as HTML.

import { t } from "./i18n.js";

/**
 * @typedef {object} DialogOptions
 * @property {string} [title]
 * @property {string | string[]} [text]
 * @property {string} [yes] the main button
 * @property {string} [no] the button that cancels
 */

/** @type {{ backdrop: HTMLElement, close: (answer: string | boolean | null) => void } | null} */
let opened = null;

/**
 * @param {DialogOptions & { field: { value: string, placeholder: string, number?: { min: number, max: number } } | null }} options
 * @returns {Promise<string | boolean | null>}
 */
function open({ title = "", text = "", yes = t("confirm"), no = t("cancel"), field = null }) {
  if (opened) opened.close(null);
  return new Promise((resolve) => {
    const previous = /** @type {HTMLElement | null} */ (document.activeElement);
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    const box = document.createElement("div");
    box.className = "modal";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    const heading = document.createElement("h3");
    heading.id = `modal-title-${Date.now()}`;
    heading.textContent = title;
    box.setAttribute("aria-labelledby", heading.id);
    box.append(heading);
    for (const paragraph of /** @type {string[]} */ ([]).concat(text).filter(Boolean)) {
      const p = document.createElement("p");
      p.textContent = paragraph;
      box.append(p);
    }
    /** @type {HTMLInputElement | null} */
    let input = null;
    if (field) {
      input = document.createElement("input");
      input.className = "modal-input";
      input.type = "text";
      input.autocomplete = "off";
      // A number to choose: the field only takes one, between two bounds.
      if (field.number) {
        input.type = "number";
        input.min = String(field.number.min);
        input.max = String(field.number.max);
        input.step = "1";
      }
      input.value = field.value ?? "";
      input.placeholder = field.placeholder ?? "";
      input.setAttribute("aria-labelledby", heading.id);
      box.append(input);
    }
    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const noButton = document.createElement("button");
    noButton.type = "button";
    noButton.className = "modal-no";
    noButton.textContent = no;
    const yesButton = document.createElement("button");
    yesButton.type = "button";
    yesButton.className = "modal-yes";
    yesButton.textContent = yes;
    actions.append(noButton, yesButton);
    box.append(actions);
    backdrop.append(box);
    document.body.append(backdrop);
    // A timer rather than a frame: a hidden window draws nothing.
    setTimeout(() => backdrop.classList.add("visible"), 10);
    setTimeout(() => { if (input) { input.focus(); input.select(); } else yesButton.focus(); }, 0);
    const order = /** @type {HTMLElement[]} */ ([input, noButton, yesButton].filter(Boolean));

    /** @param {string | boolean | null} answer */
    function close(answer) {
      if (opened?.backdrop !== backdrop) return;
      opened = null;
      removeEventListener("keydown", onKey, true);
      backdrop.remove();
      previous?.focus?.();
      resolve(answer);
    }
    const accept = () => close(input ? input.value.trim() : true);
    const cancel = () => close(input ? null : false);
    // In capture: the modal keeps the keyboard, nothing else of the page reacts.
    /** @param {KeyboardEvent} ev */
    function onKey(ev) {
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); cancel(); }
      else if (ev.key === "Enter" && document.activeElement === input) { ev.preventDefault(); accept(); }
      else if (ev.key === "Tab") {
        // The focus stays in the window.
        ev.preventDefault();
        const i = order.indexOf(/** @type {HTMLElement} */ (document.activeElement));
        order[(i + (ev.shiftKey ? order.length - 1 : 1)) % order.length].focus();
      }
    }
    addEventListener("keydown", onKey, true);
    yesButton.addEventListener("click", accept);
    noButton.addEventListener("click", cancel);
    backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) cancel(); });
    opened = { backdrop, close };
  });
}

/**
 * A WINDOW TO READ (2026-11-23): a long text (a skill, in the Executive view),
 * wide, scrolling, closed by its cross, Esc or a click beside it. The html is
 * built by the caller from text it escaped (markdown.js renderBody).
 * @param {{ title: string, html: string }} options
 */
export function readDialog({ title, html }) {
  if (opened) opened.close(null);
  const previous = /** @type {HTMLElement | null} */ (document.activeElement);
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const box = document.createElement("div");
  box.className = "modal modal-read";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  const head = document.createElement("div");
  head.className = "modal-read-head";
  const heading = document.createElement("h3");
  heading.id = `modal-title-${Date.now()}`;
  heading.textContent = title;
  box.setAttribute("aria-labelledby", heading.id);
  const cross = document.createElement("button");
  cross.type = "button";
  cross.className = "modal-read-close";
  cross.setAttribute("aria-label", t("close"));
  cross.textContent = "×";
  head.append(heading, cross);
  const body = document.createElement("div");
  body.className = "modal-read-body note-body";
  body.innerHTML = html;
  box.append(head, body);
  backdrop.append(box);
  document.body.append(backdrop);
  setTimeout(() => backdrop.classList.add("visible"), 10);
  setTimeout(() => cross.focus(), 0);
  function close() {
    if (opened?.backdrop !== backdrop) return;
    opened = null;
    removeEventListener("keydown", onKey, true);
    backdrop.remove();
    previous?.focus?.();
  }
  /** @param {KeyboardEvent} ev */
  function onKey(ev) {
    if (ev.key === "Escape") { ev.preventDefault(); ev.stopImmediatePropagation(); close(); }
  }
  addEventListener("keydown", onKey, true);
  cross.addEventListener("click", close);
  backdrop.addEventListener("mousedown", (ev) => { if (ev.target === backdrop) close(); });
  opened = { backdrop, close };
}

/** @type {HTMLElement | null} */
let toastBox = null;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let toastTimer;
/**
 * A short message at the bottom of the screen, for six seconds: what the page
 * could not do (an optimistic change the server refused, 2026-11-21). Said to
 * screen readers too; placed as text, never as HTML.
 * @param {string} text
 */
export function toast(text) {
  if (!toastBox) {
    toastBox = document.createElement("div");
    toastBox.className = "toast";
    toastBox.setAttribute("role", "status");
    toastBox.setAttribute("aria-live", "polite");
    document.body.append(toastBox);
  }
  toastBox.textContent = text;
  toastBox.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (toastBox) toastBox.hidden = true; }, 6000);
}

/**
 * Asks to confirm something.
 * @param {DialogOptions} [options]
 * @returns {Promise<boolean>} true for the main button
 */
export const confirmDialog = async (options = {}) => (await open({ ...options, field: null })) === true;

/**
 * Asks for a text, or for a whole number between two bounds (`number`).
 * @param {DialogOptions & { value?: string, placeholder?: string, number?: { min: number, max: number } }} [options]
 * @returns {Promise<string | null>} the text typed, trimmed; null when cancelled
 */
export async function askDialog({ value = "", placeholder = "", number, ...options } = {}) {
  const answer = await open({ yes: t("validate"), ...options, field: { value, placeholder, number } });
  return typeof answer === "string" ? answer : null;
}
