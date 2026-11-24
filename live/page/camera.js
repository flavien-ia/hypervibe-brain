// camera.js: what part of the map the window shows (zoom and offset), and the
// slides from one framing to another.

import { backgroundCanvas, liveCanvas, scene } from "./canvas.js";
import { $ } from "./dom.js";
import { RING_GAP, WORLD } from "./map.js";
import { paint } from "./paint-live.js";
import { CROWN, crownShown, project, state } from "./state.js";

/** @typedef {import("./state.js").Camera} Camera */

/**
 * The framing that shows the whole brain. It always counts the ring of tools:
 * hiding the tools changes neither the zoom nor the reference scale.
 * @returns {Camera}
 */
export function overview() {
  // The ring, then the room for the names of the tools and of the sectors, in pixels.
  // (The Executive view counts the crown of the harnesses around the ring, 2026-11-23.)
  const extent = crownShown() && CROWN.outer ? 2 * (CROWN.outer + 30) : WORLD + 2 * (RING_GAP + 10);
  // (The Executive view: the crown carries its own names, a narrower margin.)
  const margin = crownShown() && CROWN.outer ? 2 * 70 : 2 * 170;
  const k = Math.max(Math.min(state.width, state.height) - margin, 120) / extent;
  return { k, x: state.width / 2 - (WORLD / 2) * k, y: state.height / 2 - (WORLD / 2) * k };
}

/** The window changed size: the canvases follow, and the framing too unless the person moved the map. */
export function resize() {
  state.dpr = window.devicePixelRatio || 1;
  state.width = scene.clientWidth;
  state.height = scene.clientHeight;
  for (const canvas of [backgroundCanvas, liveCanvas]) {
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
  }
  state.baseScale = overview().k;
  if (!state.moved) state.camera = overview();
  paint();
}

let glide = 0;

/** Stops the slide in progress: the person takes the map in hand. */
export const stopGlide = () => cancelAnimationFrame(glide);

/**
 * Slides the view to a framing, in about half a second.
 * @param {Camera} target
 */
export function glideTo(target) {
  cancelAnimationFrame(glide);
  const from = { ...state.camera };
  const t0 = performance.now();
  const step = () => {
    const u = Math.min(1, (performance.now() - t0) / 550);
    const e = u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2;
    state.camera = { k: from.k + (target.k - from.k) * e, x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e };
    paint();
    if (u < 1) glide = requestAnimationFrame(step);
  };
  glide = requestAnimationFrame(step);
}

/**
 * The framing that shows a disc of the world, centred.
 * @param {number} cx
 * @param {number} cy
 * @param {number} radius
 * @returns {Camera}
 */
export function viewOn(cx, cy, radius) {
  const k = Math.min(Math.min(state.width, state.height) / (radius * 2.3), state.baseScale * 40);
  return { k, x: state.width / 2 - cx * k, y: state.height / 2 - cy * k };
}

/**
 * Slides the view to a note.
 * @param {string} slug
 */
export function flyTo(slug) {
  const at = state.layout?.at.get(slug);
  if (!at) return;
  state.moved = true;
  // (On the tilted floors, where the note is drawn.)
  const p = project(at);
  glideTo(viewOn(p.x, p.y, 40));
}

/** The round button at the bottom right: the whole brain back into view. */
export function setUpRecenter() {
  $("#recenter").addEventListener("click", () => { state.moved = false; glideTo(overview()); });
}
