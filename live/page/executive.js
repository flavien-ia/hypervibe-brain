// executive.js: the executive floor of the brain, above the knowledge floor
// (2026-11-22, an exploration in the Executive view).
//
// The knowledge floor is what the brain knows; this one is what the person's
// AI knows how to do: their own skills (kept in the brain), the harnesses
// installed beside them (the plugins, each a bubble), and the guards that
// frame them (scripts/executive.mjs). The Executive view shows both floors at
// once, turned, tilted and stacked (state.js, project).
//
// THE TOOLS ARE PILLARS (2026-11-23). A tool is not only what feeds the
// knowledge: a harness acts on it directly (an invoice in Pennylane, a draft
// in Gmail, a query to Neon). So each tool of the ring rises from the floor
// below to the floor above, and a skill is linked, on its own floor, to the
// tools its SKILL.md names (the server reads them, live/server.mjs). A guard
// stands by the tool it guards, on the floor above. Which tool a guard guards
// is still guessed from its name.

import { attempt, getExecutive, readSkillText, translateSkill } from "./api.js";
import { liveCanvas, writeText } from "./canvas.js";
import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { language } from "./lang.js";
import { renderBody } from "./markdown.js";
import { readDialog } from "./modal.js";
import { t } from "./i18n.js";
import { RING_GAP, pack } from "./map.js";
import { panel, panelContent } from "./panel.js";
import { paintRing } from "./paint-background.js";
import { paint } from "./paint-live.js";
import { CROWN, ISO, crownShown, familyColor, setWorld, squash, state, toScreen, toolById, toolFloor } from "./state.js";
import { recall, remember } from "./storage.js";
import { GUARD_COLOR, SKILL_COLOR, colors, fadeOf, inkOf } from "./theme.js";

// The colour of the floor (the person's own skills, the guards) is the
// design's: theme.js (2026-11-23).
export { GUARD_COLOR, SKILL_COLOR } from "./theme.js";
/** The executive floor is floor 1 (state.js). */
const UP = 1;
/** The harness of the person's own skills. */
const OWN = "";

/** @typedef {import("../contract.d.ts").ExecutiveSkill} Skill */
/** @typedef {import("../contract.d.ts").ExecutiveGuard} Guard */
/** @typedef {{ key: string, name: string, version: string, color: string, x: number, y: number, r: number, n: number }} Harness */
/** @typedef {{ event: string, matcher: string, script: string, file?: string, what?: string }} PluginHook */
/** @typedef {{ kind: "skill", item: Skill, harness: Harness, x: number, y: number } | { kind: "guard", item: Guard, x: number, y: number, tool: import("./state.js").ToolPlace | null } | { kind: "hook", item: PluginHook, plugin: string, version: string, color: string, x: number, y: number }} Piece */

/** @type {import("../contract.d.ts").ExecutiveResponse | null} */
let floor = null;
/** Where each piece stands, in world units of the floor above (arrangeFloor). @type {Piece[]} */
let pieces = [];
/** One bubble per harness. @type {Harness[]} */
let harnesses = [];
/** The piece whose card is open. @type {string | null} */
let chosen = null;
const keyOf = (/** @type {Piece} */ p) => (p.kind === "skill" ? `skill:${p.harness.key}:${p.item.folder}` : p.kind === "hook" ? `hook:${p.plugin}:${p.item.event}:${p.item.script}` : `guard:${p.item.file}`);

// ONE FLOOR BROUGHT FORWARD (2026-11-23): a click on the name of a floor
// brings it forward, and the other one nearly vanishes (floorNames, below);
// a second click shows both. The floor set back is no longer clicked either.
/** @typedef {"both" | "knowledge" | "executive" | "tools"} Focus */
/** @typedef {"knowledge" | "executive" | "tools"} Floor */
/** @type {Focus} */
let focus = "both";
/** The floor brought forward. */
export const floorFocus = () => (state.view !== "executive" || (focus === "tools" && ISO.tools !== "floor") ? "both" : focus);
/** The live canvas (the notes read, written, chosen) belongs to the floor below: it fades with it. */
export function applyFocus() {
  const f = floorFocus();
  liveCanvas.style.opacity = f === "executive" || f === "tools" ? "0.1" : "";
}
/** @param {Focus} to */
export function setFocus(to) {
  focus = to;
  applyFocus();
  paint();
}

/** Reads the floor from the server, once per opening of the view. */
export async function loadExecutive() {
  const answer = await attempt(getExecutive());
  floor = answer ?? { ok: false, skills: [], guards: [] };
}

/**
 * Places the floor above: a bubble per harness, packed in the disc, its
 * skills as a sunflower; each guard by the tool it guards. Called once the
 * ring is placed (arrange.js).
 * @param {import("./map.js").Layout} layout
 */
export function arrangeFloor(layout, ring = state.toolPlaces) {
  if (!ISO.tilt) return arrangeCrown(layout, ring);
  pieces = [];
  harnesses = [];
  if (!floor) return;
  const { x: cx, y: cy, r } = layout.center;
  /** @type {{ key: string, name: string, version: string, color: string, skills: Skill[] }[]} */
  const groups = [{ key: OWN, name: t("execPersonalSkills"), version: "", color: SKILL_COLOR, skills: floor.skills ?? [] }];
  (floor.harnesses ?? []).forEach((h, i) => groups.push({ key: h.name, name: h.name, version: h.version, color: colors.vivid[(i + 2) % colors.vivid.length], skills: h.skills }));
  const shown = groups.filter((g) => g.skills.length);
  const circles = pack(shown.map((g) => Math.sqrt(g.skills.length) + 1), 0.25);
  const R = r * 0.9;
  shown.forEach((g, i) => {
    const c = circles[i];
    const h = { key: g.key, name: g.name, version: g.version, color: g.color, x: cx + c.x * R, y: cy + c.y * R, r: c.r * R, n: g.skills.length };
    harnesses.push(h);
    g.skills.forEach((item, j) => {
      const a = j * 2.39996;
      const rr = g.skills.length === 1 ? 0 : h.r * 0.82 * Math.sqrt((j + 0.5) / g.skills.length);
      pieces.push({ kind: "skill", item, harness: h, x: h.x + Math.cos(a) * rr, y: h.y + Math.sin(a) * rr });
    });
  });
  (floor.guards ?? []).forEach((item, i) => {
    const words = item.file.toLowerCase().split(/[^a-z0-9]+/);
    const tool = state.toolPlaces.find((p) => !p.parent && (words.includes(p.id.toLowerCase()) || words.includes(String(toolById(p.id)?.name ?? "").toLowerCase()))) ?? null;
    // By its tool, a little inside the ring, on the floor above.
    if (tool) {
      const a = Math.atan2(tool.y - cy, tool.x - cx), d = Math.hypot(tool.x - cx, tool.y - cy) - 34;
      pieces.push({ kind: "guard", item, tool, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
    } else pieces.push({ kind: "guard", item, tool: null, x: cx + Math.cos(-Math.PI / 2 + i * 0.5) * (r + 40), y: cy + Math.sin(-Math.PI / 2 + i * 0.5) * (r + 40) });
  });
}

// THE CROWN OF THE HARNESSES (2026-11-23). One plane: the knowledge in the
// middle, the ring of tools around it, and around the ring, beyond the names
// of the tools, a crown cut in arcs, one arc per harness (the person's own
// skills, then each plugin), its skills as dots. The two exchanges that
// matter are side by side: the tools feed the knowledge (the ring to the
// centre), the harnesses act on the tools (the crown to the ring). Each arc
// faces the tools its skills use the most, so that their links stay short.
// THE CROWN FITS THE SCREEN. The names of the tools are written at a fixed
// size on the screen: the smaller the window, the more of the world they take
// once the whole map is framed. The gap between the ring and the crown, and
// the step between two skills, are worked out from the window: about 170
// pixels for the names, about 10 between two skills.
const NAMES_PX = 140;
const STEP_PX = 10;
/** The margin of the framing around the crown, in pixels (camera.js). */
export const CROWN_MARGIN = 70;
/** @typedef {{ key: string, name: string, version: string, color: string, a0: number, a1: number, r0: number, r1: number, n: number }} Arc */
/** The arcs of the crown. @type {Arc[]} */
let arcs = [];

/** @param {import("./map.js").Layout} layout */
/** @param {import("./map.js").Layout} layout @param {import("./state.js").ToolPlace[]} around where the tools stand, shown or not */
function arrangeCrown(layout, around) {
  pieces = [];
  harnesses = [];
  arcs = [];
  CROWN.outer = 0;
  if (!floor) return;
  const { x: cx, y: cy, r } = layout.center;
  const ring = r + RING_GAP;
  const m = Math.max(240, Math.min(state.width || 1000, state.height || 800) - 2 * CROWN_MARGIN);
  const a = (2 * NAMES_PX) / m;
  const depth = 120;
  const gap = Math.min(1400, Math.max(260, (a * (ring + depth + 30)) / Math.max(0.2, 1 - a)));
  const r0 = ring + gap;
  const scale = m / (2 * (r0 + depth + 30));
  const STEP = STEP_PX / scale;
  /** The angle of a tool of the ring, by id. @param {string} id */
  const angleOf = (id) => {
    const p = around.find((q) => q.id === id && !q.parent);
    return p ? Math.atan2(p.y - cy, p.x - cx) : null;
  };
  /** @type {{ key: string, name: string, version: string, color: string, skills: Skill[], want: number | null }[]} */
  const groups = [{ key: OWN, name: t("execPersonalSkills"), version: "", color: SKILL_COLOR, skills: floor.skills ?? [], want: null }];
  (floor.harnesses ?? []).forEach((h, i) => groups.push({ key: h.name, name: h.name, version: h.version, color: colors.vivid[(i + 2) % colors.vivid.length], skills: h.skills, want: null }));
  const shown = groups.filter((g) => g.skills.length);
  // Where each harness would like to stand: facing the tools its skills name.
  for (const g of shown) {
    let sx = 0, sy = 0;
    for (const s of g.skills) for (const id of s.uses ?? []) {
      const a = angleOf(id);
      if (a !== null) { sx += Math.cos(a); sy += Math.sin(a); }
    }
    g.want = sx || sy ? Math.atan2(sy, sx) : null;
  }
  // Their widths share the circle by their number of skills, a gap between two.
  const total = shown.reduce((n, g) => n + g.skills.length, 0) || 1;
  const GAP = 0.05;
  const room = Math.PI * 2 - GAP * shown.length;
  const ordered = [...shown].sort((a, b) => (a.want ?? 9) - (b.want ?? 9));
  let at = 0;
  const placed = ordered.map((g) => {
    const w = (room * g.skills.length) / total;
    const a0 = at;
    at += w + GAP;
    return { g, a0, w };
  });
  // Turned as a whole so that each arc is, on average, as near as can be to where it would like to stand.
  let ox = 0, oy = 0;
  for (const { g, a0, w } of placed) if (g.want !== null) { ox += Math.cos(g.want - (a0 + w / 2)); oy += Math.sin(g.want - (a0 + w / 2)); }
  const turn = ox || oy ? Math.atan2(oy, ox) : -Math.PI / 2;
  for (const { g, a0: start, w } of placed) {
    const a0 = start + turn, a1 = a0 + w;
    const perRow = Math.max(1, Math.floor((w * (r0 + STEP)) / STEP));
    const rows = Math.ceil(g.skills.length / perRow);
    const r1 = r0 + STEP * (rows + 0.5);
    const mid = (a0 + a1) / 2, rm = (r0 + r1) / 2;
    const h = { key: g.key, name: g.name, version: g.version, color: g.color, x: cx + Math.cos(mid) * rm, y: cy + Math.sin(mid) * rm, r: (r1 - r0) / 2, n: g.skills.length };
    harnesses.push(h);
    arcs.push({ key: g.key, name: g.name, version: g.version, color: g.color, a0, a1, r0, r1, n: g.skills.length });
    CROWN.outer = Math.max(CROWN.outer, r1);
    g.skills.forEach((item, j) => {
      const row = Math.floor(j / perRow), col = j % perRow;
      const inRow = Math.min(perRow, g.skills.length - row * perRow);
      const a = a0 + (w * (col + 0.5)) / inRow;
      const rr = r0 + STEP * (row + 0.75);
      pieces.push({ kind: "skill", item, harness: h, x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    });
  }
  // A guard of the person's stands on the inner edge of the crown: in front of
  // the tool it guards (several in front of one tool, one behind the other),
  // else along the arc of the person's own skills. The hooks of a plugin stand
  // along the inner edge of its own arc.
  /** Spreads n things along the inner edge of an arc. @param {Arc | undefined} arc @param {number} j @param {number} n */
  const along = (arc, j, n) => {
    const a = arc ? arc.a0 + ((arc.a1 - arc.a0) * (j + 0.5)) / n : -Math.PI / 2 + j * 0.2;
    return { x: cx + Math.cos(a) * (r0 - 26), y: cy + Math.sin(a) * (r0 - 26) };
  };
  const own = arcs.find((a) => a.key === OWN);
  /** @type {Map<string, number>} */
  const before = new Map();
  const loose = [];
  for (const item of floor.guards ?? []) {
    const words = item.file.toLowerCase().split(/[^a-z0-9]+/);
    const tool = around.find((p) => !p.parent && (words.includes(p.id.toLowerCase()) || words.includes(String(toolById(p.id)?.name ?? "").toLowerCase()))) ?? null;
    if (!tool) { loose.push(item); continue; }
    const k = before.get(tool.id) ?? 0;
    before.set(tool.id, k + 1);
    const a = Math.atan2(tool.y - cy, tool.x - cx), d = r0 - 40 - 30 * k;
    pieces.push({ kind: "guard", item, tool, x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
  }
  loose.forEach((item, j) => pieces.push({ kind: "guard", item, tool: null, ...along(own, j, loose.length) }));
  for (const [i, h] of (floor.harnesses ?? []).entries()) {
    const arc = arcs.find((a) => a.key === h.name);
    const list = h.hooks ?? [];
    list.forEach((hook, j) => pieces.push({ kind: "hook", item: hook, plugin: h.name, version: h.version, color: colors.vivid[(i + 2) % colors.vivid.length], ...along(arc, j, list.length) }));
  }
}

/**
 * The plane of the Executive view: the ring of tools as on the map, then the
 * crown, its links to the tools, its guards and its names.
 * @param {CanvasRenderingContext2D} c
 */
function paintCrown(c) {
  const layout = state.layout;
  if (!layout) return;
  // (The ring of tools is already drawn, paint-background.js.)
  const { k } = state.camera;
  const px = 1 / k;
  const { x: cx, y: cy } = layout.center;
  const near = k / (state.baseScale || k);
  const lit = chosen ? pieces.find((p) => keyOf(p) === chosen) ?? null : null;
  const litUses = new Set(lit?.kind === "skill" ? lit.item.uses ?? [] : []);
  setWorld(c, 0);
  // The arcs.
  for (const a of arcs) {
    c.beginPath();
    c.arc(cx, cy, a.r1, a.a0, a.a1);
    c.arc(cx, cy, a.r0, a.a1, a.a0, true);
    c.closePath();
    c.globalAlpha = 0.07; c.fillStyle = a.color; c.fill();
    c.globalAlpha = 0.5; c.lineWidth = 1.2 * px; c.strokeStyle = a.color; c.stroke();
  }
  c.globalAlpha = 1;
  // The links of the skills to the tools they name: faint, the chosen skill's bright (and the others then hidden).
  for (const p of pieces) {
    if (p.kind !== "skill") continue;
    const mine = lit === p;
    if (lit && !mine) continue;
    for (const id of p.item.uses ?? []) {
      const to = placeOf(id);
      if (!to) continue;
      c.strokeStyle = p.harness.color; c.globalAlpha = mine ? 0.9 : 0.07; c.lineWidth = (mine ? 1.8 : 1) * px;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(to.x, to.y); c.stroke();
    }
  }
  c.globalAlpha = 1;
  // The skills.
  const dot = Math.max(3.2 * px, 3.2 * px + STEP_PX * 0.08 / (state.baseScale || k));
  for (const p of pieces) {
    if (p.kind !== "skill") continue;
    c.fillStyle = p.harness.color;
    c.beginPath(); c.arc(p.x, p.y, dot, 0, Math.PI * 2); c.fill();
    if (p.harness.key === OWN && p.item.placed && p.item.placed !== "linked") { c.strokeStyle = colors.misplaced; c.lineWidth = 2 * px; c.stroke(); }
    if (lit === p) { c.strokeStyle = colors.mark; c.lineWidth = 2 * px; c.beginPath(); c.arc(p.x, p.y, dot + 5 * px, 0, Math.PI * 2); c.stroke(); }
  }
  // The tools the chosen skill names, circled.
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  for (const id of litUses) {
    const place = placeOf(id);
    if (!place || !lit || lit.kind !== "skill") continue;
    const e = toScreen(place);
    c.beginPath(); c.arc(e.x, e.y, 17, 0, Math.PI * 2);
    c.strokeStyle = lit.harness.color; c.lineWidth = 2.2; c.stroke();
  }
  drawGuards(c);
  for (const p of pieces) {
    if (p.kind !== "hook") continue;
    const e = toScreen(p);
    shield(c, e.x, e.y, 6.5);
    c.fillStyle = colors.disc; c.fill();
    c.strokeStyle = p.color; c.lineWidth = lit === p ? 2.4 : 1.5; c.stroke();
  }
  // The names: each arc on its outer edge; the skills from close enough, the chosen one always.
  for (const a of arcs) {
    const mid = (a.a0 + a.a1) / 2;
    const e = toScreen({ x: cx + Math.cos(mid) * (a.r1 + 10), y: cy + Math.sin(mid) * (a.r1 + 10) });
    const o = toScreen({ x: cx, y: cy });
    const out = Math.atan2(e.y - o.y, e.x - o.x);
    c.font = `700 11px ${colors.displayFont}`;
    c.textAlign = Math.cos(out) > 0.3 ? "left" : Math.cos(out) < -0.3 ? "right" : "center";
    c.textBaseline = Math.sin(out) > 0.3 ? "top" : Math.sin(out) < -0.3 ? "bottom" : "middle";
    writeText(c, `${a.name.toUpperCase()} · ${a.n}`, e.x + Math.cos(out) * 6, e.y + Math.sin(out) * 6, inkOf(a.color));
    c.textBaseline = "alphabetic";
  }
  c.font = `600 10.5px ${colors.font}`;
  c.textAlign = "center";
  for (const p of pieces) {
    if (p.kind !== "skill" || (lit !== p && near < 2.4)) continue;
    const e = toScreen(p);
    writeText(c, `/${p.item.name}`, e.x, e.y + 15, lit === p ? colors.mark : colors.skillName);
  }
  for (const p of pieces) {
    if (p.kind === "skill" || (lit !== p && near < 2.4)) continue;
    const e = toScreen(p);
    c.textAlign = "left";
    writeText(c, p.kind === "guard" ? guardName(p.item) : p.item.script.replace(/\.m?js$/, ""), e.x + 12, e.y + 4, p.kind === "guard" ? colors.guardName : colors.hookName);
  }
  c.textAlign = "center";
}

/** A shield, centred on (x, y), of half-width w, in screen pixels. @param {CanvasRenderingContext2D} c @param {number} x @param {number} y @param {number} w */
function shield(c, x, y, w) {
  c.beginPath();
  c.moveTo(x, y - w * 1.15);
  c.lineTo(x + w, y - w * 0.7);
  c.lineTo(x + w, y + w * 0.05);
  c.quadraticCurveTo(x + w * 0.85, y + w * 0.9, x, y + w * 1.3);
  c.quadraticCurveTo(x - w * 0.85, y + w * 0.9, x - w, y + w * 0.05);
  c.lineTo(x - w, y - w * 0.7);
  c.closePath();
}

/** The place of a tool of the ring, by id (its first place). @param {string} id */
const placeOf = (id) => state.toolPlaces.find((p) => p.id === id) ?? null;

/**
 * The floor above, painted over the knowledge floor: the pillars of the
 * tools, its plate, its harnesses and skills, the links of the skills to
 * their tools, its guards, and the names.
 * @param {CanvasRenderingContext2D} c the background's context
 */
export function paintUpperFloor(c) {
  if (!state.layout) return;
  if (!ISO.tilt) return paintCrown(c);
  const f = floorFocus();
  const back = (/** @type {Floor} */ name) => f !== "both" && f !== name;
  // The knowledge, already drawn: veiled when it is set back.
  if (back("knowledge")) {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = colors.veil;
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
  }
  // The ring of tools: on a floor of its own, or on the knowledge floor and again on the executive floor.
  if (ISO.tools === "floor") layer(c, back("tools"), (g) => paintRing(g, toolFloor()));
  else layer(c, back("knowledge"), (g) => paintRing(g, 0));
  layer(c, back("executive"), (g) => {
    drawUpperFloor(g);
    if (ISO.tools === "rings") paintRing(g, UP);
    drawGuards(g);
  });
  floorNames(c);
}

/**
 * Draws a layer, faint when its floor is set back: drawn apart, then laid down at a tenth.
 * @param {CanvasRenderingContext2D} c @param {boolean} faint @param {(g: CanvasRenderingContext2D) => void} draw
 */
function layer(c, faint, draw) {
  if (!faint) return draw(c);
  const apart = document.createElement("canvas");
  apart.width = c.canvas.width;
  apart.height = c.canvas.height;
  const a = /** @type {CanvasRenderingContext2D} */ (apart.getContext("2d"));
  draw(a);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 0.1;
  c.drawImage(apart, 0, 0);
  c.globalAlpha = 1;
}

// THE NAME OF A FLOOR BRINGS IT FORWARD (2026-11-23). Each floor is named on
// the map, the knowledge under its disc, the executive floor over its plate:
// a click on a name brings that floor forward (the other nearly vanishes), a
// second click shows both again. The names stay bright whatever the floor
// brought forward: they are how one goes back.
/** Where the names of the floors were written, on the screen, for the pointer. @type {{ floor: Floor, x: number, y: number, w: number, h: number }[]} */
let nameBoxes = [];

/** The two names, as pills: filled when their floor is brought forward. @param {CanvasRenderingContext2D} c */
function floorNames(c) {
  const layout = state.layout;
  if (!layout) return;
  const { k } = state.camera;
  const { x: cx, y: cy, r } = layout.center;
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  nameBoxes = [];
  const up = toScreen({ x: cx, y: cy }, UP), down = toScreen({ x: cx, y: cy }, 0);
  const tilt = squash() * k;
  const tools = toScreen({ x: cx, y: cy }, -1);
  /** @type {[Floor, string, string, number, number][]} */
  const names = [
    ["executive", t("execFloorUp"), SKILL_COLOR, up.x, up.y - (r + 16) * tilt - 16],
    // (Under its disc; on its left when the floor of the tools is right below, its name in their middle.)
    ISO.tools === "floor" ? ["knowledge", t("execFloorDown"), colors.floorKnowledge, down.x - (r + 16) * k - 62, down.y] : ["knowledge", t("execFloorDown"), colors.floorKnowledge, down.x, down.y + (r + 16) * tilt + 16],
  ];
  // The floor of the tools has no disc: its name stands in its middle.
  if (ISO.tools === "floor") names.push(["tools", t("execFloorTools"), colors.floorTools, tools.x, tools.y]);
  for (const [floorOf, text, color, x, y] of names) {
    c.font = `700 11.5px ${colors.displayFont}`; c.letterSpacing = "3px";
    const label = text.toUpperCase();
    const w = c.measureText(label).width + 22, h = 22;
    const box = { floor: floorOf, x: x - w / 2, y: y - h / 2, w, h };
    nameBoxes.push(box);
    const on = focus === floorOf && state.view === "executive";
    c.beginPath(); c.roundRect(box.x, box.y, w, h, 11);
    c.fillStyle = on ? color : colors.pill; c.fill();
    c.strokeStyle = color; c.lineWidth = 1.2; c.globalAlpha = on ? 1 : 0.7; c.stroke(); c.globalAlpha = 1;
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = on ? colors.pillText : inkOf(color);
    c.fillText(label, x + 1.5, y + 0.5);
    c.letterSpacing = "0px"; c.textBaseline = "alphabetic";
  }
}

/** The name of a floor under the pointer. @param {number} sx @param {number} sy */
export function floorNameAt(sx, sy) {
  if (state.view !== "executive") return null;
  return nameBoxes.find((b) => sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h)?.floor ?? null;
}

/** A click on a floor's name: that floor forward, or all again. @param {Floor} floorOf */
export function toggleFocus(floorOf) {
  setFocus(focus === floorOf ? "both" : floorOf);
}

/** @param {CanvasRenderingContext2D} c */
function drawUpperFloor(c) {
  const layout = state.layout;
  if (!layout) return;
  const { k } = state.camera;
  const px = 1 / k;
  const { x: cx, y: cy, r } = layout.center;
  const edge = r + 16;
  const near = k / (state.baseScale || k);
  const lit = chosen ? pieces.find((p) => keyOf(p) === chosen) ?? null : null;
  const litUses = new Set(lit?.kind === "skill" ? lit.item.uses ?? [] : []);

  // The plate, in world units of the floor above: it hides a little of what is below.
  setWorld(c, UP);
  c.beginPath(); c.arc(cx, cy, edge, 0, Math.PI * 2);
  c.fillStyle = colors.plate; c.fill();
  c.lineWidth = 1.5 * px; c.strokeStyle = colors.plateEdge; c.stroke();
  for (const h of harnesses) {
    c.beginPath(); c.arc(h.x, h.y, h.r, 0, Math.PI * 2);
    c.globalAlpha = 0.07; c.fillStyle = h.color; c.fill();
    c.globalAlpha = 0.45; c.lineWidth = 1.2 * px; c.strokeStyle = h.color; c.stroke();
    c.globalAlpha = 1;
  }

  // The links of each skill to the tools it names, faint, the chosen one
  // bright: on this floor to the ring of this floor, or down to the floor of
  // the tools (drawn on the screen, from one floor to the other).
  const below = ISO.tools === "floor";
  if (below) c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  for (const p of pieces) {
    if (p.kind !== "skill") continue;
    const mine = lit === p;
    if (!mine && lit) continue;
    for (const id of p.item.uses ?? []) {
      const to = placeOf(id);
      if (!to) continue;
      c.strokeStyle = p.harness.color; c.globalAlpha = mine ? 0.9 : below ? 0.05 : 0.08;
      c.beginPath();
      if (below) {
        const a = toScreen(p, UP), b = toScreen(to, toolFloor());
        c.lineWidth = mine ? 1.8 : 1; c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
      } else {
        c.lineWidth = (mine ? 1.8 : 1) * px; c.moveTo(p.x, p.y); c.lineTo(to.x, to.y);
      }
      c.stroke();
    }
  }
  c.globalAlpha = 1;
  if (below) setWorld(c, UP);
  // The skills.
  const dot = 3.2 * px + 2.4;
  for (const p of pieces) {
    if (p.kind !== "skill") continue;
    c.fillStyle = p.harness.color;
    c.beginPath(); c.arc(p.x, p.y, dot, 0, Math.PI * 2); c.fill();
    if (p.harness.key === OWN && p.item.placed && p.item.placed !== "linked") { c.strokeStyle = colors.misplaced; c.lineWidth = 2 * px; c.stroke(); }
    if (lit === p) { c.strokeStyle = colors.mark; c.lineWidth = 2 * px; c.beginPath(); c.arc(p.x, p.y, dot + 4 * px, 0, Math.PI * 2); c.stroke(); }
  }

  // The tools the chosen skill names, circled where they are.
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  for (const id of litUses) {
    const place = placeOf(id);
    const tool = toolById(id);
    if (!place || !tool) continue;
    const e = toScreen(place, below ? toolFloor() : UP);
    c.beginPath(); c.arc(e.x, e.y, 17, 0, Math.PI * 2);
    c.strokeStyle = lit?.kind === "skill" ? lit.harness.color : familyColor(tool); c.lineWidth = 2.2; c.stroke();
  }

  // The names: its harnesses, the skills from close enough, the chosen one always.
  // (The names of the floors are written last, over everything: floorNames.)
  const o = toScreen({ x: cx, y: cy }, UP);
  for (const h of harnesses) {
    const e = toScreen({ x: h.x, y: h.y - h.r }, UP);
    c.font = `700 10.5px ${colors.displayFont}`;
    writeText(c, `${h.name.toUpperCase()} · ${h.n}`, e.x, e.y - 4, colors.harnessName);
  }
  c.font = `600 10.5px ${colors.font}`;
  for (const p of pieces) {
    const e = toScreen(p, UP);
    if (p.kind === "guard") {
      c.textAlign = e.x >= o.x ? "left" : "right";
      writeText(c, guardName(p.item), e.x + (e.x >= o.x ? 13 : -13), e.y + 4, colors.guardName);
      continue;
    }
    if (p.kind !== "skill" || (lit !== p && near < 2.2)) continue;
    c.textAlign = "center";
    writeText(c, `/${p.item.name}`, e.x, e.y + 14, lit === p ? colors.mark : colors.skillName);
  }
  c.textAlign = "center";
}

/**
 * The guards, upright on the screen, by the tool they guard: a short line to
 * it on this floor's ring, or down to the floor of the tools.
 * @param {CanvasRenderingContext2D} c
 */
function drawGuards(c) {
  const lit = chosen ? pieces.find((p) => keyOf(p) === chosen) ?? null : null;
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  for (const p of pieces) {
    if (p.kind !== "guard") continue;
    const e = toScreen(p, UP);
    if (p.tool && state.showTools) {
      const to = toScreen(p.tool, !ISO.tilt ? 0 : ISO.tools === "floor" ? toolFloor() : UP);
      c.strokeStyle = GUARD_COLOR; c.globalAlpha = 0.7; c.lineWidth = 1.5; c.setLineDash([4, 3]);
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(to.x, to.y); c.stroke();
      c.setLineDash([]); c.globalAlpha = 1;
    }
    const w = 9;
    shield(c, e.x, e.y, w);
    c.fillStyle = p.item.placed ? GUARD_COLOR : colors.guardOff; c.fill();
    c.strokeStyle = lit === p ? colors.mark : colors.guardEdge; c.lineWidth = lit === p ? 2 : 1.2; c.stroke();
    c.fillStyle = colors.guardInk;
    c.fillRect(e.x - w * 0.32, e.y - w * 0.05, w * 0.64, w * 0.5);
    c.strokeStyle = colors.guardInk; c.lineWidth = w * 0.14;
    c.beginPath(); c.arc(e.x, e.y - w * 0.08, w * 0.22, Math.PI, 0); c.stroke();
  }
}

/** A guard's name as shown: its file, without the extension nor the word "guard". @param {Guard} g */
export const guardName = (g) => g.file.replace(/\.m?js$/, "").replace(/[-_.]?guard$/i, "");

/** The piece under the pointer, within ten pixels (the nearest). @param {number} sx @param {number} sy @returns {Piece | null} */
export function pieceAt(sx, sy) {
  if (!crownShown() || floorFocus() === "knowledge") return null;
  /** @type {Piece | null} */
  let best = null;
  let distance = 10;
  for (const p of pieces) {
    const e = toScreen(p, UP);
    const d = Math.hypot(e.x - sx, e.y - sy);
    if (d < distance) { distance = d; best = p; }
  }
  return best;
}

/** The names of the tools a skill uses. @param {Skill} s */
const toolNames = (s) => (s.uses ?? []).map((id) => toolById(id)?.name ?? id);

/** What each moment a hook runs at means, in words. */
const WHEN = /** @type {const} */ ({ PreToolUse: "execHookWhen_PreToolUse", PostToolUse: "execHookWhen_PostToolUse", UserPromptSubmit: "execHookWhen_UserPromptSubmit", Stop: "execHookWhen_Stop", SessionStart: "execHookWhen_SessionStart" });

/** What a hover over a piece says. @param {Piece} p */
export const describePiece = (p) => {
  if (p.kind === "guard") return `<b>${escapeHtml(guardName(p.item))}</b><br>${escapeHtml(t("execGuardHover"))}`;
  if (p.kind === "hook") return `<b>${escapeHtml(p.item.script)}</b> <small>${escapeHtml(p.plugin)}</small><br>${escapeHtml(p.item.event)}${p.item.matcher ? ` · ${escapeHtml(p.item.matcher)}` : ""}`;
  const where = p.harness.key === OWN ? t("execOwn") : p.harness.name;
  const tools = toolNames(p.item);
  return `<b>/${escapeHtml(p.item.name)}</b> <small>${escapeHtml(where)}</small>${tools.length ? `<br>${escapeHtml(tools.join(", "))}` : ""}`;
};

/** Opens the card of a piece. @param {Piece | null} p */
export function choosePiece(p) {
  chosen = p ? keyOf(p) : null;
  if (!p) return;
  state.selection = null;
  panel.hidden = false;
  const row = (/** @type {string} */ label, /** @type {string} */ value) => `<div class="row"><span>${escapeHtml(label)}</span><b>${value}</b></div>`;
  if (p.kind === "hook") {
    const h = p.item;
    panelContent.innerHTML = `
      <p class="exec-kind" style="--c:${p.color}"><span class="exec-dot"></span>${escapeHtml(`${t("execHook")} · ${p.plugin}`)}</p>
      <h2>${escapeHtml(h.script)}</h2>
      <div class="exec-text" id="exec-description">${h.what ? renderBody(h.what) : escapeHtml(t("execHookNoWords"))}</div>
      <div class="exec-rows">
        ${row(t("execWhen"), escapeHtml(whenText(h.event)))}
        ${row(t("execWired"), `<code>${escapeHtml(h.event)}</code>${h.matcher ? ` ${escapeHtml(t("execOnTools"))} <code>${escapeHtml(h.matcher)}</code>` : ""}`)}
        ${row(t("execInPlugin"), escapeHtml(`${p.plugin} ${p.version}`))}
        ${row(t("execWrite"), escapeHtml(t("execHookPluginWrite")))}
      </div>`;
    // What it says it does, in the person's language (the hook's own words are the plugin's, often English).
    translateDescription({ file: h.file, description: h.what }, keyOf(p));
    return;
  }
  if (p.kind === "skill") {
    const s = p.item;
    const own = p.harness.key === OWN;
    const tools = toolNames(s);
    panelContent.innerHTML = `
      <p class="exec-kind" style="--c:${p.harness.color}"><span class="exec-dot"></span>${escapeHtml(own ? t("execSkill") : `${t("execSkill")} · ${p.harness.name}`)}</p>
      <h2>/${escapeHtml(s.name)}</h2>
      <div class="exec-text" id="exec-description">${renderBody(s.description)}</div>
      <p class="exec-actions"><button type="button" id="exec-read" class="open-note-file">${escapeHtml(t("execRead"))}</button></p>
      <div class="exec-rows">
        ${own ? row(t("execLivesIn"), `<code>${escapeHtml(`${floor?.floor ?? ""}/skills/${s.folder}`)}</code>`) : row(t("execInPlugin"), escapeHtml(`${p.harness.name} ${p.harness.version}`))}
        ${own && s.placed ? row(t("execPlaced"), escapeHtml(t(`execPlaced_${s.placed}`))) : ""}
        ${row(t("execTools"), escapeHtml(tools.length ? tools.join(", ") : t("execNoTool")))}
        ${row(t("execWrite"), escapeHtml(own ? t("execSkillWrite") : t("execPluginWrite")))}
      </div>`;
    $("#exec-read").addEventListener("click", () => readSkill(s));
    translateDescription(s, keyOf(p));
  } else {
    const g = p.item;
    const wires = g.hooks.map((h) => `<code>${escapeHtml(h.event)}</code> ${escapeHtml(t("execOnTools"))} <code>${escapeHtml(h.matcher ?? "*")}</code>${h.placed ? "" : ` (${escapeHtml(t("execNotWired"))})`}`).join("<br>");
    panelContent.innerHTML = `
      <p class="exec-kind" style="--c:${GUARD_COLOR}"><span class="exec-dot"></span>${escapeHtml(t("execGuard"))}</p>
      <h2>${escapeHtml(guardName(g))}</h2>
      <div class="exec-text">${renderBody(g.what)}</div>
      <div class="exec-rows">
        ${row(t("execLivesIn"), `<code>${escapeHtml(`${floor?.floor ?? ""}/guards/${g.file}`)}</code>`)}
        ${row(t("execWhen"), escapeHtml([...new Set(g.hooks.map((h) => whenText(h.event)))].join(" ")))}
        ${row(t("execWired"), wires || escapeHtml(t("execNotWired")))}
        ${p.tool ? row(t("execInFront"), escapeHtml(toolById(p.tool.id)?.name ?? p.tool.id)) : ""}
        ${row(t("execWrite"), escapeHtml(t("execGuardWrite")))}
      </div>`;
  }
}

/**
 * Whether a text is not in the page's language, roughly: a few words that
 * only English uses, against a few only French uses.
 * @param {string} text
 */
function foreign(text) {
  const words = ` ${text.toLowerCase().replace(/[^a-zà-ÿ' ]+/g, " ")} `;
  const count = (/** @type {string[]} */ list) => list.reduce((n, w) => n + (words.split(` ${w} `).length - 1), 0);
  const en = count(["the", "and", "of", "to", "when", "with", "your", "for", "use", "this", "from", "that", "it", "is"]);
  const fr = count(["le", "la", "les", "des", "une", "un", "pour", "et", "avec", "quand", "dans", "du", "qui", "est"]);
  return language() === "fr" ? en > fr : language() === "en" ? fr > en : false;
}

/** When a hook runs, in words. @param {string} event */
const whenText = (event) => {
  const key = WHEN[/** @type {keyof typeof WHEN} */ (event)];
  return key ? t(key) : event;
};

/** The description in the person's language, asked once and kept by the server. @param {{ file?: string, description?: string }} s @param {string} key */
async function translateDescription(s, key) {
  if (!s.file || !s.description || !foreign(s.description)) return;
  const box = document.getElementById("exec-description");
  if (box) box.classList.add("translating");
  const answer = await attempt(translateSkill(s.file, language()));
  if (chosen !== key) return;
  const now = document.getElementById("exec-description");
  if (!now) return;
  now.classList.remove("translating");
  if (answer?.ok && answer.text) {
    now.innerHTML = renderBody(answer.text);
    now.title = s.description;
  }
}

/** Opens a skill to read it whole, in a window. @param {Skill} s */
async function readSkill(s) {
  if (!s.file) return;
  const answer = await attempt(readSkillText(s.file));
  if (!answer?.ok) return;
  // The blocks of code apart: the notes' renderer knows paragraphs, titles and lists.
  const parts = String(answer.text ?? "").replace(/\r\n/g, "\n").split(/^```[^\n]*\n([\s\S]*?)^```[ \t]*$/m);
  const html = parts.map((part, i) => (i % 2 ? `<pre>${escapeHtml(part.replace(/\n$/, ""))}</pre>` : renderBody(part))).join("");
  readDialog({ title: `/${s.name}`, html });
}

// A SKILL IN USE LIGHTS UP (2026-11-23). When the AI starts a skill (the
// Skill tool, or a /command typed), its dot in the crown glows, its name shows
// and its links to its tools light, then fade over a minute.
const GLOW_MS = 60_000;
/** When each skill was last started, by its name as the AI calls it ("devis", "brain:capture"). @type {Map<string, number>} */
const used = new Map();
/** @param {import("../contract.d.ts").SkillUse[]} list */
export function skillsUsed(list) {
  for (const e of list) {
    const at = Date.parse(e.at) || Date.now();
    if (Date.now() - at < GLOW_MS) used.set(e.skill.toLowerCase(), Math.max(at, used.get(e.skill.toLowerCase()) ?? 0));
  }
}
/** The names a skill is called by. @param {Piece & { kind: "skill" }} p */
const callNames = (p) => (p.harness.key === OWN ? [p.item.name, p.item.folder] : [`${p.harness.name}:${p.item.name}`, `${p.harness.name}:${p.item.folder}`]).map((n) => n.toLowerCase());
/**
 * Draws the glow of the skills in use, on the live canvas (screen pixels).
 * @param {CanvasRenderingContext2D} c
 * @returns {boolean} whether something still glows (the live canvas keeps painting)
 */
export function glowSkills(c) {
  if (!crownShown() || !used.size) return false;
  const now = Date.now();
  let alive = false;
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  for (const p of pieces) {
    if (p.kind !== "skill") continue;
    const at = Math.max(...callNames(p).map((n) => used.get(n) ?? 0));
    const age = now - at;
    if (!at || age > GLOW_MS) continue;
    alive = true;
    const f = 1 - age / GLOW_MS;
    const e = toScreen(p, ISO.tilt ? UP : 0);
    // Its links to its tools.
    for (const id of p.item.uses ?? []) {
      const to = placeOf(id);
      if (!to) continue;
      const b = toScreen(to, ISO.tilt ? (ISO.tools === "floor" ? toolFloor() : UP) : 0);
      c.strokeStyle = p.harness.color; c.globalAlpha = 0.75 * f; c.lineWidth = 2;
      c.beginPath(); c.moveTo(e.x, e.y); c.lineTo(b.x, b.y); c.stroke();
      c.beginPath(); c.arc(b.x, b.y, 16, 0, Math.PI * 2); c.stroke();
    }
    // A ring that breathes, and the name.
    const pulse = 0.65 + 0.35 * Math.sin(now / 220);
    const glow = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, 22);
    glow.addColorStop(0, p.harness.color); glow.addColorStop(1, fadeOf(p.harness.color));
    c.globalAlpha = f * pulse; c.fillStyle = glow;
    c.beginPath(); c.arc(e.x, e.y, 22, 0, Math.PI * 2); c.fill();
    c.globalAlpha = f; c.strokeStyle = colors.mark; c.lineWidth = 2;
    c.beginPath(); c.arc(e.x, e.y, 8, 0, Math.PI * 2); c.stroke();
    c.font = `700 12px ${colors.font}`; c.textAlign = "center";
    writeText(c, `/${p.item.name}`, e.x, e.y - 14, colors.mark);
  }
  c.globalAlpha = 1;
  return alive;
}

/** The card closes with the panel. */
export const forgetPiece = () => { chosen = null; };

// THE SKILL UNDER THE POINTER (2026-11-24). Hovered, the dot of a skill is
// circled by a ring in its harness's colour, a dark edge on each side, set a
// little apart from the dot: not the white ring of the chosen skill, nor the
// glow of a skill the AI uses. The ring is an element over the map
// (#piece-ring), not a stroke on a canvas: moving the pointer from dot to dot
// repaints nothing, and it stays bright whichever floor is brought forward
// (the live canvas fades with the knowledge floor). A paint of the background
// (a zoom, a move, a new arrangement) puts it back in place (placePieceRing).
/** @type {Piece | null} */
let hovered = null;

/** The radius of a skill's dot on the screen, in pixels, as paintCrown and drawUpperFloor draw it. */
function skillDotPx() {
  const { k } = state.camera;
  return ISO.tilt ? 3.2 + 2.4 * k : Math.max(3.2, 3.2 + (STEP_PX * 0.08 * k) / (state.baseScale || k));
}

/** Puts the ring of the hovered skill where its dot is now, or hides it. */
export function placePieceRing() {
  const ring = document.getElementById("piece-ring");
  if (!ring) return;
  const p = hovered;
  if (!p || p.kind !== "skill" || !crownShown() || !pieces.includes(p) || floorFocus() === "knowledge") { ring.hidden = true; return; }
  const e = toScreen(p, ISO.tilt ? UP : 0);
  const r = skillDotPx() + 7;
  ring.style.left = `${e.x}px`;
  ring.style.top = `${e.y}px`;
  ring.style.width = ring.style.height = `${2 * r}px`;
  ring.style.setProperty("--ring", p.harness.color);
  ring.hidden = false;
}

/** The piece under the pointer (pointer.js): a skill wears its ring, anything else none. @param {Piece | null} p */
export function hoverPiece(p) {
  const next = p?.kind === "skill" ? p : null;
  if (next === hovered) return;
  hovered = next;
  placePieceRing();
}

// ------------------------------------------------------------ how the floors are seen

// ONE CONTROL TO TURN IN EVERY DIRECTION (2026-11-23): a round pad; dragged
// across, the floors turn; up and down, they tilt. The height of the floor
// above is fixed, at the one the person chose (0.63 of the disc's radius).
const DEFAULTS = { turn: ISO.turn, squash: ISO.squash };
const PAD = $("#floors-pad");
const DOT = $("#floors-dot");
const PAD_R = 27;

/** The dot of the pad says where the floors stand. */
function showFloors() {
  const u = Math.sin(ISO.turn / 2) * (PAD_R - 6);
  const v = -((ISO.squash - 0.575) / 0.425) * (PAD_R - 6);
  DOT.style.transform = `translate(${u.toFixed(1)}px, ${v.toFixed(1)}px)`;
}
/** Kept in this browser, and the map repainted. */
function floorsChanged() {
  remember("floors", JSON.stringify({ turn: ISO.turn, squash: ISO.squash, tools: ISO.tools }));
  paint();
}

/**
 * Turns the floors (radians) and tilts them (a change of the squash), from the pad or Shift + drag.
 * @param {number} by @param {number} tilt
 */
export function turnFloors(by, tilt) {
  ISO.turn = ((ISO.turn + by + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  ISO.squash = Math.min(1, Math.max(0.15, ISO.squash + tilt));
  showFloors();
  floorsChanged();
}

/** Wires the pad, and takes back what this browser kept. */
export function setUpFloors() {
  try {
    const kept = JSON.parse(recall("floors") ?? "null");
    if (kept && typeof kept === "object") {
      if (Number.isFinite(kept.turn)) ISO.turn = kept.turn;
      if (Number.isFinite(kept.squash)) ISO.squash = Math.min(1, Math.max(0.15, kept.squash));
      if (kept.tools === "floor" || kept.tools === "rings") ISO.tools = kept.tools;
    }
  } catch {
    // unreadable: the defaults
  }
  showFloors();
  /** @type {{ x: number, y: number } | null} */
  let from = null;
  PAD.addEventListener("pointerdown", (ev) => {
    PAD.setPointerCapture(ev.pointerId);
    from = { x: ev.clientX, y: ev.clientY };
    PAD.classList.add("held");
  });
  PAD.addEventListener("pointermove", (ev) => {
    if (!from) return;
    const dx = ev.clientX - from.x, dy = ev.clientY - from.y;
    from = { x: ev.clientX, y: ev.clientY };
    turnFloors(dx * 0.02, -dy * 0.008);
  });
  const release = () => { from = null; PAD.classList.remove("held"); };
  PAD.addEventListener("pointerup", release);
  PAD.addEventListener("pointercancel", release);
  // WHERE THE TOOLS STAND (2026-11-23, to compare): a floor of their own
  // under the knowledge, or a ring on each floor. One button switches.
  const TOOLS = $("#floors-tools");
  const showTools = () => {
    TOOLS.classList.toggle("rings", ISO.tools === "rings");
    TOOLS.dataset.tip = t(ISO.tools === "floor" ? "floorsToolsFloor" : "floorsToolsRings");
    TOOLS.setAttribute("aria-label", TOOLS.dataset.tip);
  };
  showTools();
  TOOLS.addEventListener("click", () => {
    ISO.tools = ISO.tools === "floor" ? "rings" : "floor";
    if (focus === "tools") focus = "both";
    showTools();
    applyFocus();
    floorsChanged();
  });
  $("#floors-reset").addEventListener("click", () => {
    Object.assign(ISO, DEFAULTS);
    showFloors();
    floorsChanged();
  });
}
