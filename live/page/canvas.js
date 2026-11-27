// canvas.js: the two canvases of the map, one over the other.
//
// The BACKGROUND (bubbles, dots, names, the ring of tools) is only repainted
// on a zoom, a move or a change of view (paint-background.js). The LIVE one
// (reads that light up, the selection, what is hovered) is the only canvas
// repainted when a note lights up (paint-live.js).

import { $ } from "./dom.js";
import { colors } from "./theme.js";

/** What receives the pointer: the two canvases fill it. */
export const scene = $("#scene");
/** The canvas of what only changes with the view (paint-background.js). */
export const backgroundCanvas = /** @type {HTMLCanvasElement} */ ($("#background"));
/** The canvas of what is happening, over the other one (paint-live.js). */
export const liveCanvas = /** @type {HTMLCanvasElement} */ ($("#live"));
/** Where the background is painted. */
export const backgroundContext = /** @type {CanvasRenderingContext2D} */ (backgroundCanvas.getContext("2d"));
/** Where the live activity is painted. */
export const liveContext = /** @type {CanvasRenderingContext2D} */ (liveCanvas.getContext("2d"));

/**
 * Writes a text with an edge around it, so that it reads over anything: the
 * edge is the ground of the page (theme.js).
 * @param {CanvasRenderingContext2D} c
 * @param {string} text
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {string} [edge] another edge
 * @param {number} [width] its width
 */
export function writeText(c, text, x, y, color, edge = colors.textEdge, width = colors.textEdgeWidth) {
  c.lineWidth = width; c.strokeStyle = edge; c.lineJoin = "round";
  c.strokeText(text, x, y);
  c.fillStyle = color; c.fillText(text, x, y);
}
