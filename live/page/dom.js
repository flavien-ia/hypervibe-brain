// dom.js: reaching the elements of the page.
//
// The selectors designate the page's own markup (index.html), so the element
// is there: these helpers say so to the type checker once, instead of a null
// test at every line.

/**
 * The element a selector designates.
 * @param {string} selector
 * @returns {HTMLElement}
 */
export const $ = (selector) => /** @type {HTMLElement} */ (document.querySelector(selector));

/**
 * The same, for a text field or a checkbox.
 * @param {string} selector
 * @returns {HTMLInputElement}
 */
export const $input = (selector) => /** @type {HTMLInputElement} */ (document.querySelector(selector));

/**
 * The same, for a list of choices.
 * @param {string} selector
 * @returns {HTMLSelectElement}
 */
export const $select = (selector) => /** @type {HTMLSelectElement} */ (document.querySelector(selector));

/**
 * Every element a selector designates.
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement[]}
 */
export const $all = (selector, root = document) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);

/**
 * The nearest ancestor of an event's target that matches a selector (the target itself included), or null.
 * @param {Event} ev
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
export const closest = (ev, selector) => /** @type {HTMLElement | null} */ (/** @type {Element | null} */ (ev.target)?.closest?.(selector) ?? null);

/**
 * REACHED WITH THE KEYBOARD TOO (2026-11-21, audit 17). The lines of a list
 * that open something on a click (the index, the latest activity) could not
 * be reached without a mouse. They carry tabindex="0" and role="button" in
 * their markup; here, Enter or Space on one of them is the same as a click.
 * @param {HTMLElement} container
 * @param {string} selector the lines that can be pressed
 */
export function pressable(container, selector) {
  container.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const el = closest(ev, selector);
    if (!el || ev.target !== el) return;
    ev.preventDefault();
    el.click();
  });
}
