// pointer.js: the hand on the map. What is under the pointer (a tool, a note,
// a dot of the catalogue, a reading path, the name of a territory), the box
// that says it on hover, the zoom and the drag, and what a click opens.

import { renameTerritory } from "./api.js";
import { arrange } from "./arrange.js";
import { glideTo, stopGlide, viewOn } from "./camera.js";
import { scene } from "./canvas.js";
import { loadTerritories } from "./data.js";
import { $ } from "./dom.js";
import { choosePiece, describePiece, floorFocus, floorNameAt, forgetPiece, hoverPiece, pieceAt, toggleFocus, turnFloors } from "./executive.js";
import { clockSeconds, conversationName, escapeHtml, shorten, wordWhy } from "./format.js";
import { t } from "./i18n.js";
import { domainName, typeName } from "./map.js";
import { askDialog, toast } from "./modal.js";
import { chooseEntry, chooseNote } from "./note-card.js";
import { paint, paintLive } from "./paint-live.js";
import { closePanel, whenPanelCloses } from "./panel.js";
import { CELL, REACH_PX, project, realId, screenAngle, state, toScreen, toWorld, toolById, toolFloor, toolPlace } from "./state.js";
import { chooseTool, rememberViewBeforeUnfold } from "./tool-card.js";

/** @typedef {import("./state.js").Dust} Dust */
/** @typedef {import("./state.js").LivePath} LivePath */
/** @typedef {import("./map.js").Bubble} Bubble */

// ------------------------------------------------------------ what is under the pointer

/**
 * The note under a point of the screen, within reach.
 * @param {number} sx
 * @param {number} sy
 * @returns {string | null}
 */
function noteAt(sx, sy) {
  const layout = state.layout;
  if (!layout) return null;
  const { k } = state.camera;
  const { x: wx, y: wy } = toWorld(sx, sy);
  const reach = REACH_PX / k;
  const cells = Math.ceil(reach / CELL);
  const ci = Math.floor(wx / CELL), cj = Math.floor(wy / CELL);
  /** @type {string | null} */
  let best = null;
  let distance = reach;
  for (let i = ci - cells; i <= ci + cells; i++) for (let j = cj - cells; j <= cj + cells; j++) for (const id of state.grid.get(`${i}:${j}`) ?? []) {
    const p = layout.at.get(id);
    if (!p) continue;
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < distance) { distance = d; best = id; }
  }
  return best;
}

/**
 * WHAT HAPPENS IN A FLOW (2026-11-08): hovering a source at work (the halo
 * around its tool) says which source runs, since when, why, and for the
 * judge what it reads.
 * @param {number} sx
 * @param {number} sy
 * @returns {string | null} the id of the tool
 */
function runningAt(sx, sy) {
  for (const id of state.running.keys()) {
    const place = toolPlace(id);
    if (!place) continue;
    const p = toScreen(place, toolFloor());
    if (Math.hypot(sx - p.x, sy - p.y) < 26) return id;
  }
  return null;
}

/**
 * The tool under a point of the screen: its circle, or its name.
 * @param {number} sx
 * @param {number} sy
 * @returns {string | null}
 */
function toolAt(sx, sy) {
  for (const place of state.toolPlaces) {
    const e = toScreen(place, toolFloor());
    // (The second place of a tool that is both a source and a base gives the tool itself.)
    if (Math.hypot(e.x - sx, e.y - sy) < 14) return realId(place.id);
    // Its name, written along the radius: clickable like the circle.
    const dx = sx - e.x, dy = sy - e.y;
    const angle = screenAngle(place);
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (across < 8 && along > 10 && along < (place.small ? 18 : 23) + (place.nameWidth ?? 0) + 4) return realId(place.id);
  }
  return null;
}

/**
 * The dot of the catalogue under the pointer, within five pixels.
 * @param {number} sx
 * @param {number} sy
 * @returns {Dust | null}
 */
function dustAt(sx, sy) {
  if (!state.dust.length) return null;
  const { k } = state.camera;
  const { x: wx, y: wy } = toWorld(sx, sy);
  const reach = 5 / k;
  const cells = Math.ceil(reach / CELL);
  const ci = Math.floor(wx / CELL), cj = Math.floor(wy / CELL);
  /** @type {Dust | null} */
  let best = null;
  let distance = reach;
  for (let i = ci - cells; i <= ci + cells; i++) for (let j = cj - cells; j <= cj + cells; j++) for (const p of state.dustGrid.get(`${i}:${j}`) ?? []) {
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < distance) { distance = d; best = p; }
  }
  return best;
}

/**
 * The reading path under the pointer (the line from a note read to the next), within six pixels.
 * @param {number} sx
 * @param {number} sy
 * @returns {LivePath | null}
 */
function pathAt(sx, sy) {
  /** @type {LivePath | null} */
  let best = null;
  let distance = 6;
  for (const path of state.livePaths) {
    for (let i = 0; i <= 24; i++) {
      const u = i / 24;
      const e = toScreen({ x: (1 - u) ** 2 * path.p0.x + 2 * (1 - u) * u * path.pc.x + u * u * path.p1.x, y: (1 - u) ** 2 * path.p0.y + 2 * (1 - u) * u * path.pc.y + u * u * path.p1.y });
      const d = Math.hypot(e.x - sx, e.y - sy);
      if (d < distance) { distance = d; best = path; }
    }
    if (best && distance < 4) break;
  }
  return best;
}

/**
 * The name of a territory under the pointer (Semantic view): a click renames it.
 * @param {number} cx
 * @param {number} cy
 * @returns {Bubble | null}
 */
function territoryNameAt(cx, cy) {
  if (state.view !== "semantic" || !state.layout) return null;
  return state.layout.bubbles.find((b) => b.nameBox && cx >= b.nameBox.x - 4 && cx <= b.nameBox.x + b.nameBox.width + 4 && Math.abs(cy - b.nameBox.y) < 12) ?? null;
}

// ------------------------------------------------------------ what the hover box says

/**
 * A source at work on a tool: which, for how long, why, what it reads.
 * @param {string} id the tool
 * @returns {string | null} HTML
 */
function describeRun(id) {
  const run = state.running.get(id);
  if (!run) return null;
  const info = run.info;
  const seconds = Math.max(0, Math.round(((run.end ?? Date.now()) - run.start) / 1000));
  const time = seconds < 60 ? t("seconds", seconds) : t("minutesSeconds", Math.floor(seconds / 60), String(seconds % 60).padStart(2, "0"));
  const lines = [];
  if (info?.source) lines.push(t("activitySourceHtml", escapeHtml(info.source), info.description ? escapeHtml(shorten(info.description, 140)) : ""));
  if (info && info.why !== undefined) lines.push(escapeHtml(t("activityWhy", wordWhy(info.why))));
  if (info?.titles?.length) lines.push(`${escapeHtml(t("activityReadsList", info.items ?? info.titles.length))}<br>${info.titles.map((title) => `· ${escapeHtml(shorten(String(title), 90))}`).join("<br>")}`);
  else if (info?.items) lines.push(escapeHtml(t("activityReads", info.items)));
  if (run.end !== null && run.outcome) lines.push(run.outcome.ok === false ? t("activityFailed") : escapeHtml(t("activityDone", run.outcome.judged)));
  const name = escapeHtml(toolById(id)?.name ?? id);
  return `${run.end === null ? t("activityRunning", name, time) : t("activityFinished", name, time)}<small>${lines.join("<br>") || t("activityNothing")}</small>`;
}

/**
 * What a reading path says: from where, to where, a followed link or a jump, which conversation.
 * @param {LivePath} path
 * @returns {string} HTML
 */
function describePath(path) {
  const from = state.noteById.get(path.from)?.title ?? path.from, to = state.noteById.get(path.to)?.title ?? path.to;
  return `${escapeHtml(shorten(from, 40))} → ${escapeHtml(shorten(to, 40))}<small>${path.followed ? t("pathFollowed") : t("pathJump")} · ${escapeHtml(conversationName(path.read))} · ${clockSeconds(path.read.at)}</small>`;
}

const hoverBox = $("#hover");

/**
 * Shows the box next to the pointer; null hides it.
 * @param {PointerEvent} ev
 * @param {string | null} html
 */
function showHover(ev, html) {
  if (!html) { hoverBox.hidden = true; return; }
  hoverBox.innerHTML = html;
  hoverBox.hidden = false;
  hoverBox.style.left = `${Math.min(ev.clientX + 16, innerWidth - 320)}px`;
  hoverBox.style.top = `${ev.clientY + 14}px`;
}

// ------------------------------------------------------------ the gestures

/** @type {Map<number, { x: number, y: number }>} the pointers that are down */
const pointers = new Map();
/** @type {{ x: number, y: number, camera: import("./state.js").Camera, distance: number, moved: boolean } | null} the gesture in progress: where it started, and whether it moved */
let gesture = null;

/** @param {WheelEvent} ev */
function onWheel(ev) {
  ev.preventDefault();
  stopGlide();
  state.moved = true;
  const r = scene.getBoundingClientRect();
  const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
  const v = state.camera;
  const k = Math.min(Math.max(v.k * Math.exp(-ev.deltaY * 0.0015), state.baseScale * 0.5), state.baseScale * 40);
  state.camera = { k, x: sx - ((sx - v.x) * k) / v.k, y: sy - ((sy - v.y) * k) / v.k };
  paint();
}

/** @param {PointerEvent} ev */
function onPointerDown(ev) {
  scene.setPointerCapture(ev.pointerId);
  stopGlide();
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  const pts = [...pointers.values()];
  const c = pts.length === 2 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
  gesture = { x: c.x, y: c.y, camera: { ...state.camera }, distance: pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0, moved: gesture?.moved ?? false };
}

/** Whether the pointer was over a piece of the executive floor, or a floor's name, at its last move. */
let onPiece = false;

/** The pointer moves without a button down: what it is over lights up, and the box says it. @param {PointerEvent} ev */
function onHover(ev) {
  // Over the name of a territory nothing else comes first: a text cursor and an invitation.
  const territory = territoryNameAt(ev.clientX, ev.clientY);
  scene.classList.toggle("over-name", Boolean(territory));
  if (territory) {
    hoverPiece(null);
    if (state.hoverTool || state.hoverNote || state.hoverPath || state.hoverDust) {
      state.hoverTool = null; state.hoverNote = null; state.hoverPath = null; state.hoverDust = null;
      scene.classList.remove("over-something");
      paintLive();
    }
    showHover(ev, `${escapeHtml(territory.name)}<small>${t("clickToRename")}</small>`);
    return;
  }
  // The name of a floor: what a click does.
  const floorName = floorNameAt(ev.clientX, ev.clientY);
  if (floorName) {
    hoverPiece(null);
    onPiece = true;
    scene.classList.add("over-something");
    showHover(ev, escapeHtml(t(floorFocus() === floorName ? "execFloorBoth" : "execFloorForward")));
    return;
  }
  // A piece of the executive floor: its name and what a click does.
  // (Its dot is ringed, and the hand stays on it: executive.js, 2026-11-24.)
  const piece = pieceAt(ev.clientX, ev.clientY);
  hoverPiece(piece);
  if (piece) {
    onPiece = true;
    scene.classList.add("over-something");
    showHover(ev, describePiece(piece));
    return;
  }
  // Off a piece (or a floor's name), the hand leaves unless what is below asks for it again.
  if (onPiece && !state.hoverTool && !state.hoverNote && !state.hoverPath && !state.hoverDust) scene.classList.remove("over-something");
  onPiece = false;
  const tool = toolAt(ev.clientX, ev.clientY) ?? runningAt(ev.clientX, ev.clientY);
  const below = floorFocus() !== "executive";
  const note = tool || !below ? null : noteAt(ev.clientX, ev.clientY);
  const dust = tool || note || !below ? null : dustAt(ev.clientX, ev.clientY);
  const path = tool || note || dust ? null : pathAt(ev.clientX, ev.clientY);
  if (tool !== state.hoverTool || note !== state.hoverNote || path !== state.hoverPath || dust !== state.hoverDust) {
    state.hoverTool = tool; state.hoverNote = note; state.hoverPath = path; state.hoverDust = dust;
    scene.classList.toggle("over-something", Boolean(tool || note || path || dust));
    paintLive();
  }
  const hoveredTool = toolById(tool);
  const hoveredNote = note ? state.noteById.get(note) : undefined;
  if (tool && state.running.has(tool)) showHover(ev, describeRun(tool));
  else if (hoveredTool) showHover(ev, `${escapeHtml(hoveredTool.name)}<small>${escapeHtml(state.families[hoveredTool.family]?.name ?? "")}</small>`);
  else if (hoveredNote) showHover(ev, `${escapeHtml(hoveredNote.title)}<small>${escapeHtml(typeName(hoveredNote.type))}${hoveredNote.nature ? ` · ${escapeHtml(t("natureName", hoveredNote.nature))}` : ""} · ${escapeHtml(hoveredNote.domains.map(domainName).join(", "))}</small>`);
  else if (dust?.contact) showHover(ev, `${escapeHtml(dust.title)}<small>${escapeHtml(dust.email)}${dust.client ? ` · ${escapeHtml(dust.client)}` : ""} · ${t("contactWord")}</small>`);
  else if (dust) showHover(ev, `${escapeHtml(shorten(dust.title, 80))}<small>${escapeHtml(toolById(dust.tool)?.name ?? dust.tool)}${dust.date ? ` · ${escapeHtml(dust.date)}` : ""} · ${t("inCatalogue")}</small>`);
  else if (path) showHover(ev, describePath(path));
  else showHover(ev, null);
}

/** @param {PointerEvent} ev */
function onPointerMove(ev) {
  if (!pointers.has(ev.pointerId)) return onHover(ev);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  const g = gesture;
  if (!g) return;
  const pts = [...pointers.values()];
  if (pts.length === 2 && g.distance > 0) {
    // Two fingers: the map follows their middle and their spread.
    const c = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
    const k = Math.min(Math.max((g.camera.k * Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) / g.distance, state.baseScale * 0.5), state.baseScale * 40);
    g.moved = true; state.moved = true;
    state.camera = { k, x: c.x - ((g.x - g.camera.x) * k) / g.camera.k, y: c.y - ((g.y - g.camera.y) * k) / g.camera.k };
    paint();
    return;
  }
  const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
  if (!g.moved && Math.hypot(dx, dy) < 4) return;
  g.moved = true; state.moved = true;
  scene.classList.add("grabbing");
  showHover(ev, null);
  // In the Executive view, Shift + drag turns the floors (across) and tilts them (up and down).
  if (ev.shiftKey && state.view === "executive") {
    g.x = ev.clientX; g.y = ev.clientY;
    return turnFloors(dx * 0.008, -dy * 0.004);
  }
  state.camera = { k: g.camera.k, x: g.camera.x + dx, y: g.camera.y + dy };
  paint();
}

/**
 * RENAMING A TERRITORY (Semantic view): a click on its name. The person's
 * name replaces the AI's and is never touched again; empty, back to the
 * proposed name.
 * @param {Bubble} territory
 */
async function renameTerritoryOf(territory) {
  const name = await askDialog({ title: t("renameTerritoryTitle"), text: t("renameTerritoryText"), value: territory.name, placeholder: t("renameTerritoryPlaceholder"), yes: t("rename") });
  if (name === null) return;
  // The name is written on the screen at once; the server follows. REFUSED,
  // IT GOES BACK (2026-11-21, audit 7): a refusal, or a server that did not
  // answer, left the new name on the screen as if it were kept. The name of
  // before comes back, and the person is told why.
  const before = territory.name;
  territory.name = name || territory.name;
  paint();
  /** @type {import("../contract.d.ts").TerritoryRenamed | null} */
  let answer = null;
  try {
    answer = await renameTerritory(territory.key, name);
  } catch {
    answer = null;
  }
  if (!answer?.ok) {
    territory.name = before;
    paint();
    toast(answer && answer.code === "unknown" ? t("territoryGone") : t("renameNotSaved"));
    // (A territory that no longer exists: the cutting of now is read again.)
    if (answer) loadTerritories().then(() => { arrange(); paint(); }).catch(() => {});
    return;
  }
  loadTerritories().then(() => { arrange(); paint(); }).catch(() => {});
}

/** The pointer is released: the end of a drag, or a click. @param {PointerEvent} ev */
function onRelease(ev) {
  const g = gesture;
  pointers.delete(ev.pointerId);
  scene.classList.remove("grabbing");
  if (pointers.size > 0) {
    const [rest] = [...pointers.values()];
    gesture = { x: rest.x, y: rest.y, camera: { ...state.camera }, distance: 0, moved: true };
    return;
  }
  gesture = null;
  if (!g || g.moved || ev.type === "pointercancel" || !state.layout) return;
  // First, as on hover: the name of a territory comes before everything.
  const territory = territoryNameAt(ev.clientX, ev.clientY);
  if (territory) return void renameTerritoryOf(territory);
  // The name of a floor (Executive view): that floor forward, or both again.
  const floorName = floorNameAt(ev.clientX, ev.clientY);
  if (floorName) return void toggleFocus(floorName);
  // A piece of the executive floor (executive.js) comes first in its view.
  const piece = pieceAt(ev.clientX, ev.clientY);
  if (piece) { choosePiece(piece); return void paint(); }
  // A click: a tool, else a note, else a dot of the catalogue, else a reading path, else a bubble, else nothing.
  const toolId = toolAt(ev.clientX, ev.clientY);
  if (toolId) {
    if (toolById(toolId)?.children?.length) {
      // A click opens it with its card, the next one closes both.
      const close = state.openTools.has(toolId);
      if (close) state.openTools.delete(toolId); else state.openTools.add(toolId);
      arrange(true);
      // On opening, the view slides to centre the tool and its arc.
      if (!close) {
        const places = state.toolPlaces.filter((p) => p.id === toolId || p.parent === toolId);
        const cx = places.reduce((a, p) => a + p.x, 0) / places.length;
        const cy = places.reduce((a, p) => a + p.y, 0) / places.length;
        const k = state.camera.k;
        // (What the view was before: given back when the card closes, tool-card.js.)
        rememberViewBeforeUnfold(toolId);
        state.moved = true;
        glideTo({ k, x: state.width / 2 - cx * k, y: state.height / 2 - cy * k });
      }
      return void chooseTool(close ? null : toolId);
    }
    return void chooseTool(toolId === state.chosenTool ? null : toolId);
  }
  // (The floor below set back is not clicked.)
  const below = floorFocus() !== "executive";
  const note = below ? noteAt(ev.clientX, ev.clientY) : null;
  if (note) return void chooseNote(note);
  const dust = below ? dustAt(ev.clientX, ev.clientY) : null;
  if (dust) return void chooseEntry(dust);
  const path = pathAt(ev.clientX, ev.clientY);
  if (path) return void chooseNote(path.to);
  const { k } = state.camera;
  const { x: wx, y: wy } = toWorld(ev.clientX, ev.clientY);
  const bubble = state.layout.bubbles.find((b) => Math.hypot(b.x - wx, b.y - wy) < b.r);
  if (bubble && k < state.baseScale * 1.6) {
    state.moved = true;
    const q = project(bubble);
    return glideTo(viewOn(q.x, q.y, bubble.r));
  }
  closePanel();
}

/** Wires the wheel and the pointer on the map. */
export function setUpPointer() {
  whenPanelCloses(forgetPiece);
  scene.addEventListener("wheel", onWheel, { passive: false });
  scene.addEventListener("pointerdown", onPointerDown);
  scene.addEventListener("pointermove", onPointerMove);
  scene.addEventListener("pointerup", onRelease);
  scene.addEventListener("pointercancel", onRelease);
  scene.addEventListener("pointerleave", () => {
    if (state.hoverNote || state.hoverTool) { state.hoverNote = null; state.hoverTool = null; paintLive(); }
    hoverPiece(null);
    hoverBox.hidden = true;
  });
}
