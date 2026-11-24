// layout.js: where the fixed panels of the map stand, so that none covers another.
//
// NO PANEL OVER ANOTHER (2026-11-24). The panels of the map are fixed: the
// views and the filters at the top left, the search at the top right, the
// activity panel at the bottom left with the round button of the settings
// just above it, the notices at the bottom, the building of the brain at the
// right, the welcome in the middle, the floors beside the button that
// recentres. Each one stood where its own rule put it, and on a window 800
// pixels high the open activity panel pushed the settings button onto the
// filters box. They are placed here together, each time one of them changes
// size, shows or hides, and each time the window changes: what can scroll
// (the filters, the notices, the building) is given the height left to it,
// and scrolls only then. The stylesheet reads the numbers as custom
// properties of the root (style.css, "No panel over another"); a property
// this module does not need is removed, and the panel stands where the
// stylesheet alone puts it.

import { $ } from "./dom.js";

/** The space between two panels, in pixels (the margin of the page's edges). */
const GAP = 10;
/** On a narrow window, the least of its body the open filters box keeps before the notices are made smaller. */
const FILTERS_LEAST = 80;
/** On a narrow window, the least a notice keeps when the notices share the height: its frame and a line. */
const NOTICE_LEAST = 48;
/** On a wide window, the notices end this far from the right edge, past the button that recentres. */
const NOTICES_RIGHT = 70;
/** On a narrow window, the activity panel ends this far from the right edge, past the button that recentres. */
const ACTIVITY_RIGHT = 64;
const NARROW = matchMedia("(max-width: 760px)");

/** @param {HTMLElement} el */
const shown = (el) => !el.hidden && getComputedStyle(el).display !== "none";

/** The height an element takes with nothing scrolled away, its borders included. @param {HTMLElement} el */
const natural = (el) => el.scrollHeight + el.offsetHeight - el.clientHeight;

/** @param {DOMRect} a @param {DOMRect} b */
const sideBySide = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;

/**
 * Sets a custom property of the root, or removes it (null).
 * @param {string} name
 * @param {number | null} px
 */
function put(name, px) {
  if (px === null) document.documentElement.style.removeProperty(name);
  else document.documentElement.style.setProperty(name, `${Math.round(px)}px`);
}

/** Places the fixed panels of the map. */
export function arrangePanels() {
  // A full page (settings, index, usage, legend) hides them all.
  if (document.body.classList.contains("page-open")) return;
  const H = innerHeight, W = innerWidth;
  const narrow = NARROW.matches;
  const activity = $("#activity"), wheel = $("#open-settings"), filters = $("#filters"), head = $("#filters-head"), body = $("#filters-body");
  const alerts = $("#alerts"), build = $("#build"), welcome = $("#welcome"), floors = $("#floors");

  // On a narrow window the floors stand above the button that recentres:
  // the activity panel and the notices end before them.
  const floorsLeft = shown(floors) ? floors.getBoundingClientRect().left : W;
  const right = narrow && floorsLeft < W ? W - floorsLeft + GAP : null;
  put("--activity-right", right !== null ? Math.max(right, ACTIVITY_RIGHT) : null);
  put("--notices-right", right);

  // The settings button, just above the activity panel, folded or open.
  const below = activity.getBoundingClientRect();
  put("--settings-bottom", H - below.top + GAP);
  const wheelTop = below.top - GAP - wheel.offsetHeight;

  // The filters box goes down at most to what stands under it (`edge`); its body scrolls past that.
  const top = filters.getBoundingClientRect().top;
  const frame = filters.offsetHeight - filters.clientHeight;
  const closed = filters.classList.contains("closed");
  let edge = wheelTop - GAP;

  if (narrow) {
    // One column: the notices stack up from the settings button, under the
    // filters. When they do not fit, the filters keep a little of their body
    // (none at all if even that is too much) and the notices share what is
    // left, each one keeping at least a line and scrolling.
    const stack = [alerts, build, welcome].filter(shown);
    const want = stack.map(natural);
    const least = want.map((h) => Math.min(h, NOTICE_LEAST));
    const sum = (/** @type {number[]} */ list) => list.reduce((a, b) => a + b, 0);
    const gaps = GAP * Math.max(0, stack.length - 1);
    const bodyLeast = closed ? 0 : Math.min(natural(body), FILTERS_LEAST);
    const above = top + frame + head.offsetHeight + GAP;
    const room = Math.max(0, edge - above - (edge - above - gaps - bodyLeast >= sum(least) ? bodyLeast : 0) - gaps);
    const share = sum(want) > room ? Math.max(0, room - sum(least)) / (sum(want) - sum(least) || 1) : 1;
    for (const el of [alerts, build, welcome]) {
      const i = stack.indexOf(el);
      const height = i < 0 ? 0 : Math.floor(least[i] + (want[i] - least[i]) * share);
      put(`--${el.id}-bottom`, i < 0 ? null : H - edge);
      put(`--${el.id}-max`, i < 0 || share === 1 ? null : height);
      el.classList.toggle("squeezed", i >= 0 && share < 1);
      if (i >= 0) edge -= height + GAP;
    }
    put("--alerts-right", null);
    put("--welcome-middle", null);
  } else {
    for (const el of [alerts, build, welcome]) put(`--${el.id}-bottom`, null);
    // The notices at the bottom end before the floors, when they show.
    put("--alerts-right", floorsLeft < W ? Math.max(NOTICES_RIGHT, W - floorsLeft + GAP) : null);
    // Under the top bar at most: past that they scroll.
    const bar = ["#views-row", ".search", "#open-index", "#install"].map((s) => $(s)).filter(shown).map((el) => el.getBoundingClientRect());
    const room = H - GAP - Math.max(0, ...bar.map((r) => r.bottom)) - GAP;
    const tall = shown(alerts) && natural(alerts) > room;
    put("--alerts-max", tall ? room : null);
    alerts.classList.toggle("squeezed", tall);
    const notices = shown(alerts) ? alerts.getBoundingClientRect() : null;
    // The building, at the right: above the notices when they stand under it.
    const building = shown(build) ? build.getBoundingClientRect() : null;
    const over = notices && building && sideBySide(notices, building) && notices.top - GAP < building.top + natural(build);
    put("--build-max", over && notices && building ? Math.max(0, notices.top - GAP - building.top) : null);
    build.classList.toggle("squeezed", false);
    // The welcome, in the middle: raised above the notices when it would reach them.
    const middle = shown(welcome) ? welcome.getBoundingClientRect() : null;
    const lift = middle && notices && sideBySide(middle, notices) ? (H + middle.height) / 2 - (notices.top - GAP) : 0;
    put("--welcome-middle", lift > 0 ? H / 2 - lift : null);
    put("--welcome-max", null);
    welcome.classList.toggle("squeezed", false);
  }

  // The filters box: down to the edge, its body scrolling past it.
  const space = edge - top;
  const tight = !closed && frame + head.offsetHeight + natural(body) > space;
  put("--filters-max", tight ? Math.max(space, frame + head.offsetHeight) : null);
  filters.classList.toggle("squeezed", tight);
}

/** Places the panels now, then again each time one of them or the window changes. */
export function setUpLayout() {
  // Gathered into one placing per turn of the page; a microtask, not a frame,
  // so that a page in the background is placed as well.
  let asked = false;
  const soon = () => {
    if (asked) return;
    asked = true;
    queueMicrotask(() => { asked = false; arrangePanels(); });
  };
  const panels = ["#bar", "#filters", "#activity", "#alerts", "#build", "#welcome", "#floors"].map((s) => $(s));
  const sizes = new ResizeObserver(soon);
  // An attribute written again with the value it had changes nothing: never
  // a reason to place again (the placing itself writes classes, and must not
  // call itself back).
  const changes = new MutationObserver((records) => {
    if (records.some((r) => r.type !== "attributes" || (r.target instanceof Element && r.target.getAttribute(r.attributeName ?? "") !== r.oldValue))) soon();
  });
  const watch = { attributes: true, attributeOldValue: true, attributeFilter: ["hidden", "class"] };
  for (const el of panels) {
    sizes.observe(el);
    changes.observe(el, { ...watch, childList: true, subtree: true });
  }
  // A full page opened or closed.
  changes.observe(document.body, { ...watch, attributeFilter: ["class"] });
  addEventListener("resize", soon);
  NARROW.addEventListener("change", soon);
  // A page in the background is told of no new size until it is drawn again.
  document.addEventListener("visibilitychange", soon);
  arrangePanels();
}
