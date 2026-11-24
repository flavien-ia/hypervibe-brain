// THE TOOLTIP (2026-11-09): a real small window on hover, for any element
// that carries data-tip="<the text>". One floating element for the whole
// page, placed above the element (below when there is no room), kept inside
// the screen. With the keyboard too: it opens on focus.
//
// Importing this module is enough: it listens to the document.

const tooltip = document.createElement("div");
tooltip.className = "tooltip";
tooltip.setAttribute("role", "tooltip");
tooltip.hidden = true;
document.body.append(tooltip);
/** @type {HTMLElement | null} */
let target = null;

/** @param {HTMLElement} el */
function show(el) {
  target = el;
  tooltip.textContent = el.dataset.tip ?? "";
  tooltip.hidden = false;
  tooltip.classList.remove("below");
  const r = el.getBoundingClientRect(), b = tooltip.getBoundingClientRect();
  const margin = 8;
  let top = r.top - b.height - margin;
  if (top < margin) { top = r.bottom + margin; tooltip.classList.add("below"); }
  const left = Math.min(innerWidth - b.width - margin, Math.max(margin, r.left + r.width / 2 - b.width / 2));
  tooltip.style.top = `${Math.round(top)}px`;
  tooltip.style.left = `${Math.round(left)}px`;
  // The tip stays in front of the element, even when the tooltip was shifted.
  tooltip.style.setProperty("--tip-x", `${Math.round(r.left + r.width / 2 - left)}px`);
}
function hide() { target = null; tooltip.hidden = true; }

/**
 * The element with a tooltip under an event; an empty data-tip shows nothing (a line without a text, for instance).
 * @param {Event} ev
 * @returns {HTMLElement | null}
 */
function under(ev) {
  const el = /** @type {HTMLElement | null} */ (/** @type {Element | null} */ (ev.target)?.closest?.("[data-tip]") ?? null);
  return el?.dataset.tip ? el : null;
}

// A TOOLTIP CLOSES ON A CLICK (2026-11-21). The tooltip of the activity
// button stayed over the panel the click had just opened, and hid part of it.
// A click closes it, and the element clicked keeps it closed until the
// pointer leaves it.
/** @type {HTMLElement | null} the element last clicked, whose tooltip stays closed while the pointer is on it */
let clicked = null;
document.addEventListener("click", (ev) => {
  clicked = under(ev);
  hide();
}, true);

document.addEventListener("mouseover", (ev) => {
  // The element vanished under the tooltip (a button that closes its own
  // page, a list that is rewritten): no "mouseout" will come, it closes here.
  if (target && !target.getClientRects().length) hide();
  const el = under(ev);
  if (el && el === clicked) return;
  if (el && el !== target) show(el);
});
document.addEventListener("mouseout", (ev) => {
  const el = under(ev);
  if (el && !el.contains(/** @type {Node | null} */ (ev.relatedTarget))) {
    if (el === clicked) clicked = null;
    hide();
  }
});
document.addEventListener("focusin", (ev) => { const el = under(ev); if (el && el !== clicked) show(el); });
document.addEventListener("focusout", (ev) => { if (under(ev)) hide(); });
addEventListener("scroll", hide, true);

// EVERY BUTTON HAS A NAME (2026-11-21). Twelve buttons of twenty-five had no
// name a screen reader could say: a button that only holds an icon. Its
// tooltip says what it does: it becomes its name, unless it already has one.
// Done for the buttons of the markup and for those the page writes later.
/** @param {Element} el */
function name(el) {
  if (!(el instanceof HTMLElement)) return;
  // (A name given here follows its tooltip; a name of the markup is never touched.)
  const ours = el.dataset.named === "tip";
  if (!ours && (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby") || el.title)) return;
  const tip = el.dataset.tip;
  // Its text, without the symbols an icon button may hold ("×", "▾").
  const text = (el.textContent ?? "").replace(/[^\p{L}\p{N}]/gu, "");
  if (tip && !text) {
    el.setAttribute("aria-label", tip);
    el.dataset.named = "tip";
  }
}
/** @param {ParentNode} root */
const nameAll = (root) => { for (const el of root.querySelectorAll("button, [role='button']")) name(el); };
nameAll(document);
new MutationObserver((changes) => {
  for (const change of changes) {
    const el = /** @type {Element} */ (change.target);
    if (change.type === "attributes") { if (el.matches("button, [role='button']")) name(el); continue; }
    for (const node of change.addedNodes) if (node instanceof Element) { if (node.matches("button, [role='button']")) name(node); nameAll(node); }
  }
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-tip"] });

/**
 * Esc: the page has one handler, which closes the layer on top. It asks here
 * whether a tooltip was open. A tooltip left behind an element that vanished
 * is put away without counting.
 * @returns {boolean} true when a visible tooltip has just been closed
 */
export function closeTooltip() {
  if (!target) return false;
  const visible = target.getClientRects().length > 0;
  hide();
  return visible;
}
