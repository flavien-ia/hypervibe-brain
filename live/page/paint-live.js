// paint-live.js: the canvas of what is happening: the notes lit by a filter,
// the reads of each conversation and the path between them, the writes that
// arrive, the sources at work, the selection and what is hovered.
//
// No animation runs all the time: the rings of a fresh event are animated for
// a few seconds, then this canvas is only repainted every two seconds for as
// long as something fades, and not at all after that.

import { liveCanvas, liveContext, writeText } from "./canvas.js";
import { shorten } from "./format.js";
import { OTHER } from "./map.js";
import { paintBackground } from "./paint-background.js";
import { CONTACT_COLOR, LINE_MS, NO_END_MS, PING_MS, READ_MS, SELECTION, atTool, conversationColor, familyColor, realId, setWorld, state, toScreen, toolById, toolOfAddress, toolPlace } from "./state.js";
import { SEED_COLOR } from "./validate.js";
import { filteredNotes, picking } from "./filtering.js";
import { glowSkills } from "./executive.js";
import { colors, fadeOf } from "./theme.js";

/** @typedef {import("./state.js").Point} Point */
/** @typedef {import("./state.js").ReadEvent} ReadEvent */

/** How long the pulse of a write takes from its tool to its note. */
const TRAVEL_MS = 1600;

/**
 * Notes brought forward by a filter, all in the same colour: a halo, its
 * outline, a dot in the centre. Three paths for the whole set (one per pass),
 * not three per note: with "30 d", thousands of paths fewer at each frame.
 * @param {CanvasRenderingContext2D} c
 * @param {Point[]} points
 * @param {string} color
 * @param {number} px one screen pixel, in world units
 */
function lightUp(c, points, color, px) {
  if (!points.length) return;
  const circles = (/** @type {number} */ r) => {
    c.beginPath();
    for (const p of points) { c.moveTo(p.x + r, p.y); c.arc(p.x, p.y, r, 0, Math.PI * 2); }
  };
  c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 1.4 * px;
  circles(6 * px);
  c.globalAlpha = 0.25; c.fill();
  c.globalAlpha = 1; c.stroke();
  circles(2.6 * px);
  c.fill();
}

/**
 * Strokes the path just drawn as what is chosen: in yellow.
 * @param {CanvasRenderingContext2D} c
 * @param {number} width
 */
function strokeChosen(c, width) {
  c.strokeStyle = SELECTION; c.lineWidth = width; c.stroke();
}

/** @type {ReturnType<typeof setTimeout> | undefined} */
let nextPaint;

// WHAT THE CIRCLE OF A NOTE MEANS, IN ITS CARD (2026-11-22). A note read or
// written a moment ago wears a circle on the map, in the colour of the
// conversation that read it or of the tool that wrote it. The card of that
// note shows the same circle and says what it means, for as long as the map
// shows it. Each paint keeps here what is lit, and tells the card.
/** @typedef {{ kind: "opened" | "found" | "written", color: string, who: string, at: string }} LiveMark */
/** @type {Map<string, LiveMark>} */
export const liveMarks = new Map();
/** @type {(() => void) | null} */
let markListener = null;
/** The card follows what the map shows. @param {() => void} fn */
export function onLiveMarks(fn) { markListener = fn; }

/** Repaints the live canvas, and plans its own next paint for as long as something moves or fades. */
export function paintLive() {
  const layout = state.layout;
  if (!layout) return;
  // The chosen note changed since the last background: its white title must
  // leave the background (this canvas writes it in yellow), else it is written twice.
  if ((state.paintedSelection ?? null) !== (state.selection ?? null)) paintBackground();
  const now = Date.now();
  const { k, x, y } = state.camera;
  const c = liveContext;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, liveCanvas.width, liveCanvas.height);
  setWorld(c, 0);
  const px = 1 / k;
  let stillAlive = false;
  let animating = false;

  // The filters that pick notes (AI memory, Decisions, Seeds): one rule,
  // filtering.js (the natures one OR the other, the period and the seeds AND).
  // The background fades, what is left lights up, each colour in one go. A
  // seed among natures keeps its nature's colour, ringed in the seeds' colour.
  if (picking()) {
    /** @type {Map<string, Point[]>} */
    const byColor = new Map();
    /** @type {Point[]} */
    const seedRings = [];
    for (const f of filteredNotes(SEED_COLOR)) {
      const p = layout.at.get(f.id);
      if (!p) continue;
      const list = byColor.get(f.color);
      if (list) list.push(p); else byColor.set(f.color, [p]);
      if (state.seedFilter && state.natureFilters.size) seedRings.push(p);
    }
    for (const [color, points] of byColor) lightUp(c, points, color, px);
    if (seedRings.length) {
      c.strokeStyle = SEED_COLOR; c.lineWidth = 1.4 * px; c.globalAlpha = 0.9;
      c.beginPath();
      for (const p of seedRings) { c.moveTo(p.x + 9 * px, p.y); c.arc(p.x, p.y, 9 * px, 0, Math.PI * 2); }
      c.stroke(); c.globalAlpha = 1;
    }
  }

  // The "Written or modified" filter is drawn by the background itself
  // (paint-background.js): the notes of the period in their own colours, the
  // others nearly gone. No green over them any more (2026-11-22).


  // The dot of the catalogue or the contact that is hovered, and the one that is open.
  for (const p of new Set([state.hoverDust, state.chosenEntry])) {
    if (!p) continue;
    c.fillStyle = p.contact ? CONTACT_COLOR : familyColor(toolById(p.tool));
    c.beginPath(); c.arc(p.x, p.y, 2.6 * px, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(p.x, p.y, 6 * px, 0, Math.PI * 2);
    if (p === state.chosenEntry) strokeChosen(c, 1.5 * px);
    else { c.strokeStyle = colors.mark; c.lineWidth = 1.5 * px; c.stroke(); }
  }

  // The tool that is chosen or hovered: circled in yellow; chosen, its notes of the week light up.
  for (const id of new Set([state.chosenTool, state.hoverTool])) {
    const place = atTool(toolPlace(id));
    if (!id || !place) continue;
    // The notes this tool wrote this week light up (the chosen tool).
    if (id === state.chosenTool && state.toolNotes?.size) {
      c.fillStyle = familyColor(toolById(id)); c.globalAlpha = 0.9;
      c.beginPath();
      for (const slug of state.toolNotes) {
        const p = layout.at.get(slug);
        if (p) { c.moveTo(p.x + 3 * px, p.y); c.arc(p.x, p.y, 3 * px, 0, Math.PI * 2); }
      }
      c.fill(); c.globalAlpha = 1;
    }
    // Both its places when it has two (a source that is also a base): one tool.
    for (const at of new Set([place, ...state.toolPlaces.filter((p) => realId(p.id) === id).map(atTool)])) {
      c.beginPath(); c.arc(at.x, at.y, (at.small ? 15 : 19) * px, 0, Math.PI * 2); strokeChosen(c, 2 * px);
    }
  }

  // THE TRACE OF A CONVERSATION (2026-11-08). Every note it reads during an
  // answer stays lit, linked step by step; when the answer ends (the
  // end-of-answer hook says so), the whole set goes out in three seconds.
  /** @type {Map<string, { last: string, since: string, f: number }>} */
  const traces = new Map();
  for (const read of state.reads) {
    let trace = traces.get(read.conv);
    if (!trace) traces.set(read.conv, (trace = { last: "", since: "", f: 0 }));
    if (read.at > trace.last) trace.last = read.at;
  }
  for (const [conv, trace] of traces) {
    const ends = state.turnEnds.get(conv) ?? [];
    trace.since = ends.filter((at) => at < trace.last).sort().pop() ?? "";
    const end = ends.filter((at) => at >= trace.last).sort()[0];
    const sinceEnd = end ? now - Date.parse(end) : now - Date.parse(trace.last) - NO_END_MS;
    trace.f = sinceEnd <= 0 ? 1 : Math.max(0, 1 - sinceEnd / READ_MS);
    if (trace.f > 0 && trace.f < 1) animating = true;
    else if (trace.f > 0) stillAlive = true;
  }
  /** How lit a read is: 1 during the answer, down to 0 three seconds after its end. */
  const litness = (/** @type {ReadEvent} */ read) => {
    const trace = traces.get(read.conv);
    return trace && read.at > trace.since ? trace.f : 0;
  };
  // The reads that are lit: the latest of each note per conversation.
  /** @type {Map<string, ReadEvent>} */
  const active = new Map();
  for (const read of state.reads) if (litness(read) > 0) active.set(`${read.conv}|${read.slug}`, read);
  const lit = [...active.values()].sort((a, b) => a.at.localeCompare(b.at));

  // The path of each conversation, from one opening to the next.
  /** @type {Map<string, ReadEvent[]>} */
  const byConversation = new Map();
  for (const read of lit) {
    if (read.tool === "brain_search") continue;
    const steps = byConversation.get(read.conv);
    if (steps) steps.push(read); else byConversation.set(read.conv, [read]);
  }
  // When the next note is linked to the one before (a [[...]] link that was
  // followed), the path is a solid, vivid line: it is the thread Claude
  // pulled. Else (a jump, after a search for instance), a discreet dotted line.
  state.livePaths = [];
  const onTheWay = new Set(); // the notes the line has not reached yet
  for (const [conv, steps] of byConversation) {
    c.strokeStyle = conversationColor(conv);
    for (let i = 1; i < steps.length; i++) {
      const a = layout.at.get(steps[i - 1].slug), b = layout.at.get(steps[i].slug);
      if (!a || !b) continue;
      const followed = (state.neighbours.get(steps[i - 1].slug) ?? []).includes(steps[i].slug);
      const f = litness(steps[i]);
      c.globalAlpha = (followed ? 0.95 : 0.45) * f;
      c.lineWidth = (followed ? 2.6 : 1.5) * px;
      c.setLineDash(followed ? [] : [5 * px, 5 * px]);
      const mx = (a.x + b.x) / 2 - (b.y - a.y) * 0.22, my = (a.y + b.y) / 2 + (b.x - a.x) * 0.22;
      // The line builds up from the note before to the next one, fast, and
      // the note only lights up when it arrives.
      const progress = Math.min(1, (now - Date.parse(steps[i].at)) / LINE_MS);
      if (progress < 1) {
        animating = true;
        onTheWay.add(`${conv}|${steps[i].slug}`);
        const pt = (/** @type {number} */ u) => ({ x: (1 - u) ** 2 * a.x + 2 * (1 - u) * u * mx + u * u * b.x, y: (1 - u) ** 2 * a.y + 2 * (1 - u) * u * my + u * u * b.y });
        c.beginPath(); c.moveTo(a.x, a.y);
        for (let j = 1; j <= 16; j++) { const q = pt((progress * j) / 16); c.lineTo(q.x, q.y); }
        c.stroke();
        continue;
      }
      c.beginPath(); c.moveTo(a.x, a.y); c.quadraticCurveTo(mx, my, b.x, b.y); c.stroke();
      state.livePaths.push({ conv, read: steps[i], from: steps[i - 1].slug, to: steps[i].slug, followed, p0: a, pc: { x: mx, y: my }, p1: b });
    }
  }
  c.setLineDash([]); c.globalAlpha = 1;

  // The catalogue entries that were read (a search that returns them, a
  // brain_fetch): the dot lights up; a brain_fetch also draws the flow to the
  // tool where the data lives, from the last note the conversation opened.
  for (const read of state.reads) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(read.slug)) continue;
    const age = now - Date.parse(read.at);
    const f = litness(read);
    if (f <= 0) continue;
    stillAlive = true;
    const color = conversationColor(read.conv);
    const dot = state.dustByAddress.get(read.slug);
    if (dot) {
      c.globalAlpha = f; c.fillStyle = color;
      c.beginPath(); c.arc(dot.x, dot.y, 3.2 * px, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    if (read.tool !== "brain_fetch") continue;
    const tool = atTool(toolPlace(toolOfAddress(read.slug)));
    const before = state.reads.filter((r) => r.conv === read.conv && r.tool === "brain_get" && r.at <= read.at).pop();
    const from = (before && layout.at.get(before.slug)) ?? dot ?? layout.center;
    const to = tool ?? { x: layout.center.x + layout.center.r + 16, y: layout.center.y };
    // A question leaves the note for the tool, the answer comes back: dots
    // go, then come back, for the time of the read (3.2 s).
    const progress = Math.min(1, age / 3200);
    if (progress < 1) animating = true;
    c.strokeStyle = color; c.lineWidth = 1.5 * px; c.globalAlpha = 0.3 * f;
    c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); c.stroke();
    if (progress < 1) {
      c.fillStyle = color;
      for (let j = 0; j < 3; j++) {
        const v = Math.max(0, Math.min(1, progress * 2 - j * 0.08));
        const u = v <= 0.5 ? v * 2 : 2 - v * 2;
        c.globalAlpha = 0.9 * f;
        c.beginPath(); c.arc(from.x + (to.x - from.x) * u, from.y + (to.y - from.y) * u, 2.6 * px, 0, Math.PI * 2); c.fill();
      }
    }
    if (tool) { c.globalAlpha = f; c.beginPath(); c.arc(tool.x, tool.y, 17 * px, 0, Math.PI * 2); c.lineWidth = 2.5 * px; c.stroke(); }
    c.globalAlpha = 1;
  }

  // The hovered path, underlined.
  const hovered = state.hoverPath;
  if (hovered) {
    c.strokeStyle = colors.mark; c.globalAlpha = 0.9; c.lineWidth = 3 * px; c.setLineDash([]);
    c.beginPath(); c.moveTo(hovered.p0.x, hovered.p0.y);
    c.quadraticCurveTo(hovered.pc.x, hovered.pc.y, hovered.p1.x, hovered.p1.y);
    c.stroke(); c.globalAlpha = 1;
  }

  // The writes in the vault: a pulse leaves the tool it came through and
  // runs to the note (or to its bubble, for a new note the map does not place
  // yet), then a ring marks the note.
  for (const write of state.writes) {
    const age = now - Date.parse(write.at);
    if (age >= TRAVEL_MS + PING_MS) continue;
    stillAlive = true;
    const color = familyColor(toolById(write.tool));
    const target = layout.at.get(write.slug) ?? layout.resolve({ domain: write.domains[0] ?? OTHER, type: write.type }) ?? layout.center;
    const from = atTool(toolPlace(write.tool)) ?? { x: layout.center.x, y: layout.center.y - layout.center.r - 16 };
    if (age < TRAVEL_MS) {
      animating = true;
      const progress = age / TRAVEL_MS;
      const mx = (from.x + target.x) / 2 + (layout.center.x - (from.x + target.x) / 2) * 0.25;
      const my = (from.y + target.y) / 2 + (layout.center.y - (from.y + target.y) / 2) * 0.25;
      const pt = (/** @type {number} */ u) => ({ x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * mx + u * u * target.x, y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * my + u * u * target.y });
      // The trail, then the head of the pulse.
      c.strokeStyle = color; c.lineWidth = 2.5 * px; c.globalAlpha = 0.6;
      c.beginPath();
      for (let j = 0; j <= 10; j++) { const q = pt(Math.max(0, progress - 0.18 + (0.18 * j) / 10)); if (j) c.lineTo(q.x, q.y); else c.moveTo(q.x, q.y); }
      c.stroke();
      const head = pt(progress);
      c.globalAlpha = 1; c.fillStyle = color;
      c.beginPath(); c.arc(head.x, head.y, 4.5 * px, 0, Math.PI * 2); c.fill();
      continue;
    }
    const after = age - TRAVEL_MS;
    if (after < PING_MS) {
      animating = true;
      const progress = after / PING_MS;
      c.beginPath(); c.arc(target.x, target.y, (10 + 26 * progress) * px, 0, Math.PI * 2);
      c.strokeStyle = color; c.lineWidth = 2 * px; c.globalAlpha = 0.9 * (1 - progress); c.stroke();
    }
    c.globalAlpha = 1;
  }

  liveMarks.clear();
  for (const write of state.writes) {
    if (now - Date.parse(write.at) >= TRAVEL_MS + PING_MS) continue;
    liveMarks.set(write.slug, { kind: "written", color: familyColor(toolById(write.tool)), who: toolById(write.tool)?.name ?? write.tool ?? "", at: write.at });
  }
  for (const read of lit) {
    if (litness(read) > 0) liveMarks.set(read.slug, { kind: read.tool === "brain_search" ? "found" : "opened", color: conversationColor(read.conv), who: read.convTitle ?? "", at: read.at });
  }
  markListener?.();
  for (const read of lit) {
    const p = layout.at.get(read.slug);
    if (!p) continue;
    const f = litness(read);
    if (f <= 0 || onTheWay.has(`${read.conv}|${read.slug}`)) continue;
    const color = conversationColor(read.conv);
    const opened = read.tool !== "brain_search";
    // The halo: a radial gradient, cheaper than a blur; it shines, then fades.
    const haloRadius = (opened ? 26 : 16) * px;
    const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloRadius);
    g.addColorStop(0, color); g.addColorStop(1, fadeOf(color));
    c.globalAlpha = (opened ? 0.55 : 0.35) * f; c.fillStyle = g;
    c.beginPath(); c.arc(p.x, p.y, haloRadius, 0, Math.PI * 2); c.fill();
    c.globalAlpha = f;
    c.beginPath(); c.arc(p.x, p.y, (opened ? 5 : 4) * px, 0, Math.PI * 2);
    if (opened) { c.fillStyle = color; c.fill(); c.strokeStyle = colors.rim; c.lineWidth = 1.5 * px; c.stroke(); }
    else { c.strokeStyle = color; c.lineWidth = 2 * px; c.stroke(); }
    c.globalAlpha = 1;
  }

  // THE ACTIVE FLOW (P7): a source that runs, or that has just brought
  // something in, lights up its tool, and keeps it lit five seconds after the
  // end. A source without an announced end goes out by itself after ten
  // minutes.
  for (const [id, run] of state.running) {
    const alive = run.end === null ? now - run.start < 10 * 60_000 : now - run.end < 5000;
    if (!alive) { state.running.delete(id); setTimeout(paintBackground, 0); continue; }
    animating = true;
    const place = atTool(toolPlace(id));
    const tool = toolById(id);
    if (!place || !tool) continue;
    const color = familyColor(tool);
    const fade = run.end === null ? 1 : 1 - (now - run.end) / 5000;
    const pulse = 0.6 + 0.4 * Math.sin(now / 240);
    // IT BREATHES (2026-11-08): a source at work pulses in place; what it
    // brings in then leaves from its tool towards the notes written (the
    // pulses of the writes), no more beam towards the edge of the brain.
    const haloRadius = 26 * px;
    const g = c.createRadialGradient(place.x, place.y, 0, place.x, place.y, haloRadius);
    g.addColorStop(0, color); g.addColorStop(1, fadeOf(color));
    c.globalAlpha = 0.7 * fade * pulse; c.fillStyle = g;
    c.beginPath(); c.arc(place.x, place.y, haloRadius, 0, Math.PI * 2); c.fill();
    c.globalAlpha = fade; c.lineWidth = 2 * px; c.strokeStyle = color;
    c.beginPath(); c.arc(place.x, place.y, (14 + 3 * pulse) * px, 0, Math.PI * 2); c.stroke();
    c.globalAlpha = 1;
  }

  // The chosen note, its neighbours, what is hovered.
  if (state.selection) {
    const s = layout.at.get(state.selection);
    if (s) {
      c.strokeStyle = colors.neighbourLine; c.lineWidth = px;
      for (const v of state.neighbours.get(state.selection) ?? []) {
        const p = layout.at.get(v);
        if (!p) continue;
        c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(p.x, p.y); c.stroke();
      }
      c.fillStyle = colors.mark;
      for (const v of state.neighbours.get(state.selection) ?? []) {
        const p = layout.at.get(v);
        if (p) { c.beginPath(); c.arc(p.x, p.y, 2.6 * px + 0.6, 0, Math.PI * 2); c.fill(); }
      }
      c.globalAlpha = 0.25; c.fillStyle = SELECTION; c.beginPath(); c.arc(s.x, s.y, 14 * px, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1; c.beginPath(); c.arc(s.x, s.y, 5 * px, 0, Math.PI * 2); c.fill();
    }
  }
  if (state.hoverNote && state.hoverNote !== state.selection) {
    const p = layout.at.get(state.hoverNote);
    if (p) { c.beginPath(); c.arc(p.x, p.y, 7 * px, 0, Math.PI * 2); c.strokeStyle = colors.mark; c.lineWidth = 1.5 * px; c.stroke(); }
  }

  // The titles of the notes opened live, and the one of the chosen note.
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  c.textAlign = "left";
  const openedNow = lit.filter((read) => read.tool !== "brain_search").slice(-8);
  for (const read of openedNow) {
    const p = layout.at.get(read.slug), n = state.noteById.get(read.slug);
    if (!p || !n) continue;
    const e = toScreen(p);
    // Same place, same size as the background's title: it covers it instead of doubling it.
    c.font = `600 11px ${colors.font}`;
    c.globalAlpha = onTheWay.has(`${read.conv}|${read.slug}`) ? 0 : litness(read);
    if (c.globalAlpha <= 0) continue;
    writeText(c, shorten(n.title, 46), e.x + 6, e.y + 3.5, colors.liveTitle);
  }
  c.globalAlpha = 1;
  if (state.selection) {
    const p = layout.at.get(state.selection), n = state.noteById.get(state.selection);
    if (p && n) { const e = toScreen(p); c.font = `700 13px ${colors.font}`; writeText(c, shorten(n.title, 50), e.x + 11, e.y + 4.5, colors.selectionText); }
  }

  // The skills in use glow in the crown of the harnesses (executive.js).
  if (glowSkills(c)) animating = true;

  // The next paint: continuously for the time of a ring, then every two
  // seconds for as long as something fades, then nothing.
  clearTimeout(nextPaint);
  if (animating) nextPaint = setTimeout(() => requestAnimationFrame(paintLive), 33);
  else if (stillAlive) nextPaint = setTimeout(() => requestAnimationFrame(paintLive), 2000);
}

/** Repaints both canvases. */
export function paint() {
  if (!state.layout) return;
  paintBackground();
  paintLive();
}
