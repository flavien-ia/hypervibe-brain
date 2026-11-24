// arrange.js: puts everything in its place for the current view: the notes
// (map.js), the tools on their ring, the dust of the catalogue and of the
// contacts, and the grids that find what is under the pointer.

import { arrangeFloor } from "./executive.js";
import { byDomains, byMeaning, placeSectors } from "./map.js";
import { paint } from "./paint-live.js";
import { drawMiddle } from "./setup.js";
import { CELL, TWIN, crownShown, state } from "./state.js";

/** @typedef {import("./state.js").Dust} Dust */
/** @typedef {import("./state.js").Point} Point */
/** @typedef {import("./map.js").Circle} Circle */
/** @typedef {import("./map.js").Layout} Layout */
/** @typedef {import("./map.js").Target} Target */

/**
 * Where the catalogue entries of a tool go: the tool's own declaration says
 * it ("targets" in the source that declares it, served by /api/tools);
 * without one, its entries stay around the brain.
 * @param {string} toolId
 * @returns {Target | null}
 */
function catalogueTarget(toolId) {
  const target = state.tools.find((tool) => tool.id === toolId)?.targets?.[0];
  // A source's declaration may still say `domaine` (the plugin's French key of before).
  return target ? { domain: target.domain ?? target.domaine, type: target.type } : null;
}

/**
 * The dust: each entry of the catalogue, set in a ring around the bubble it
 * extends (the posts around the publications, the works around the art...).
 * A tiny dot, clickable.
 * @param {Layout} layout
 */
function placeDust(layout) {
  state.dust = [];
  state.dustGrid = new Map();
  const put = (/** @type {Dust} */ p) => {
    state.dust.push(p);
    const cell = `${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`;
    const inCell = state.dustGrid.get(cell);
    if (inCell) inCell.push(p); else state.dustGrid.set(cell, [p]);
  };
  if (state.showContacts && state.contacts) placeContacts(layout, put);
  /** @type {Map<Circle, import("./state.js").CatalogueEntry[]>} */
  const groups = new Map();
  for (const entry of state.showCatalogue ? state.catalogue : []) {
    const target = catalogueTarget(entry.tool);
    const bubble = (target && (layout.resolve(target) ?? layout.resolve({ domain: target.domain }))) ?? layout.center;
    const list = groups.get(bubble);
    if (list) list.push(entry); else groups.set(bubble, [entry]);
  }
  for (const [bubble, list] of groups) {
    list.sort((a, c) => String(a.date).localeCompare(String(c.date)));
    const n = list.length;
    const band = Math.max(6, Math.sqrt(n) * 1.15);
    list.forEach((entry, j) => {
      const a = j * 2.39996;
      const r = bubble.r + 4 + band * Math.sqrt((j + 0.5) / n);
      put({ ...entry, x: bubble.x + Math.cos(a) * r, y: bubble.y + Math.sin(a) * r });
    });
  }
  state.dustByAddress = new Map(state.dust.map((p) => [p.address, p]));
}

/**
 * The contacts: those of a client as a cluster around the organization's
 * note; the others AROUND THE BRAIN, in clusters by organization (2026-11-22).
 * They were a ring of dust just outside the disc, thousands of dots where
 * nobody could be told apart. Now each organization (the domain of the
 * address; the people of the public mail services together) is a cluster,
 * the nearer to the brain the more is exchanged with it, its people the
 * nearer to its centre the more each one writes; the biggest are named on
 * the map (state.contactClusters). Every contact is still drawn.
 * @param {Layout} layout
 * @param {(p: Dust) => void} put
 */
function placeContacts(layout, put) {
  /** @typedef {Omit<Dust, "x" | "y">} Unplaced */
  /** @type {Map<string, { at: Point, list: Unplaced[] }>} */
  const clusters = new Map();
  /** @type {Unplaced[]} */
  const alone = [];
  const organization = (/** @type {string} */ client) => (client ? layout.at.get(client) ?? layout.at.get(`client-${client}`) : null);
  const join = (/** @type {Point} */ at, /** @type {Unplaced} */ contact) => {
    const key = `${Math.round(at.x)}:${Math.round(at.y)}`;
    const cluster = clusters.get(key);
    if (cluster) cluster.list.push(contact); else clusters.set(key, { at, list: [contact] });
  };
  /** @type {Map<Unplaced, { organization: string, volume: number }>} */
  const weightOf = new Map();
  for (const [address, name, client, , note, neighbours, guessedClient, domain, volume] of state.contacts ?? []) {
    /** @type {Unplaced} */
    const contact = { address: `annuaire://${address}`, tool: "contacts", title: name || address, email: address, client: client || guessedClient, note, contact: true };
    weightOf.set(contact, { organization: domain ?? "", volume: Number(volume) || 0 });
    // At the centre of the notes that mention it, when there are some.
    const points = /** @type {Point[]} */ ((neighbours ?? []).map((v) => layout.at.get(v)).filter(Boolean));
    if (points.length) {
      join({ x: points.reduce((a, q) => a + q.x, 0) / points.length, y: points.reduce((a, q) => a + q.y, 0) / points.length }, contact);
      continue;
    }
    const at = organization(client) ?? organization(guessedClient);
    if (at) join(at, contact); else alone.push(contact);
  }
  const heaviest = Math.log1p(Math.max(0, ...[...weightOf.values()].map((w) => w.volume)));
  for (const { at, list } of clusters.values()) {
    const n = list.length;
    list.forEach((contact, j) => {
      const a = j * 2.39996;
      const r = 2.2 + 1.3 * Math.sqrt(j + 0.5);
      const weight = heaviest > 0 ? Math.log1p(weightOf.get(contact)?.volume ?? 0) / heaviest : 0;
      put({ ...contact, x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r, n, weight });
    });
  }
  // AROUND THE BRAIN, BY ORGANIZATION.
  /** @type {Map<string, { key: string, people: Unplaced[], volume: number }>} */
  const byOrganization = new Map();
  for (const contact of alone) {
    const w = weightOf.get(contact);
    // A public mail address (gmail...) belongs to nobody: each its own.
    const key = w?.organization || `@${contact.email}`;
    const group = byOrganization.get(key) ?? { key, people: [], volume: 0 };
    byOrganization.set(key, group);
    group.people.push(contact);
    group.volume += w?.volume ?? 0;
  }
  const groups = [...byOrganization.values()].sort((a, b) => b.volume - a.volume || b.people.length - a.people.length);
  // Between the disc and the ring of the tools: the gap they share.
  const { x: cx, y: cy, r: R } = layout.center;
  const ring = state.toolPlaces.length ? Math.min(...state.toolPlaces.map((p) => Math.hypot(p.x - cx, p.y - cy))) : R * 1.45;
  const inner = R + 8;
  const outer = Math.max(inner + 12, ring - 22);
  const most = Math.log1p(groups[0]?.volume ?? 1);
  /** @type {{ x: number, y: number, label: string, n: number }[]} */
  const named = [];
  groups.forEach((group, i) => {
    // The nearer the more exchanged (a logarithm: a few organizations write
    // a hundred times more than the rest).
    const near = most > 0 ? Math.log1p(group.volume) / most : 0;
    const d = outer - (outer - inner) * near;
    // The biggest spread evenly first, the others in the gaps (golden angle).
    const a = -Math.PI / 2 + i * 2.39996;
    const at = { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d };
    const people = [...group.people].sort((p, q) => (weightOf.get(q)?.volume ?? 0) - (weightOf.get(p)?.volume ?? 0));
    const n = people.length;
    people.forEach((contact, j) => {
      const b = j * 2.39996;
      const r = 1.8 * Math.sqrt(j + 0.5);
      // How much is exchanged with this person, from 0 to 1: the dot grows with it.
      const weight = heaviest > 0 ? Math.log1p(weightOf.get(contact)?.volume ?? 0) / heaviest : 0;
      put({ ...contact, x: at.x + Math.cos(b) * r, y: at.y + Math.sin(b) * r, n, weight });
    });
    if (!group.key.startsWith("@") && n >= 3 && named.length < 14) named.push({ x: at.x, y: at.y - 1.6 * Math.sqrt(n) - 3, label: group.key.split(".").slice(-2)[0], n });
  });
  state.contactClusters = named;
}

/**
 * THE CIRCLE IS REDONE BY SLIDING (2026-11-08): when a source arrives or
 * leaves, each tool slides along its ring to its new place, and a newcomer
 * comes out of the brain. Nothing jumps.
 * @param {Layout} layout
 * @param {Map<string, Point>} before tool id -> where it was
 */
function animateTools(layout, before) {
  const { center } = layout;
  const turn = Math.PI * 2;
  const paths = state.toolPlaces.map((p) => {
    const radius = Math.hypot(p.x - center.x, p.y - center.y);
    const was = before.get(p.id) ?? (p.parent ? before.get(p.parent) ?? state.toolPlaces.find((q) => q.id === p.parent) : null);
    const from = was ? Math.atan2(was.y - center.y, was.x - center.x) : p.angle;
    let gap = p.angle - from;
    gap = ((((gap + Math.PI) % turn) + turn) % turn) - Math.PI;
    return { p, from, gap, radius, r0: was ? Math.hypot(was.x - center.x, was.y - center.y) : center.r * 0.6 };
  });
  const start = performance.now();
  const DURATION = 900;
  const step = (/** @type {number} */ time) => {
    const u = Math.min(1, (time - start) / DURATION);
    const k = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    for (const path of paths) {
      const angle = path.from + path.gap * k;
      const r = path.r0 + (path.radius - path.r0) * k;
      path.p.x = center.x + Math.cos(angle) * r;
      path.p.y = center.y + Math.sin(angle) * r;
    }
    paint();
    if (u < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * Arranges the map for the current view, layers and open tools.
 * @param {boolean} [animate] the tools slide from their former place to the new one
 */
export function arrange(animate = false) {
  const before = new Map(state.toolPlaces.map((p) => [p.id, { x: p.x, y: p.y }]));
  // The Executive view shows the knowledge floor by domains, the executive floor above it (executive.js).
  const layout = state.view === "semantic" ? byMeaning(state.notes, state.territories) : byDomains(state.notes);
  state.layout = layout;
  // A map with nothing to draw says why in its middle (setup.js).
  drawMiddle();
  // TWO SECTORS ON ONE RING: the sources, then the bases, shown or hidden
  // together by the "Sources and bases" layer. A database attached to a
  // parent has no place of its own: it unfolds around it on a click.
  const families = Object.keys(state.families);
  /** The ring for a list of tools. @param {import("./state.js").Tool[]} list */
  const ringOf = (list) => {
    /** @type {Record<import("../contract.d.ts").ToolRole, import("./state.js").Tool[]>} */
    const groups = { source: [], base: [] };
    for (const tool of list) {
      groups[tool.sector ?? "source"].push(tool);
      // Both a source and a base: a second place, among the bases (state.js, TWIN).
      if ((tool.sector ?? "source") === "source" && (tool.roles ?? []).includes("base")) groups.base.push({ ...tool, id: `${tool.id}${TWIN}`, sector: "base", children: undefined });
    }
    return placeSectors(layout, groups, families, (id) => state.tools.filter((tool) => tool.parent === id), state.openTools, state.baseScale || state.camera?.k || 1);
  };
  const { places, sectors } = ringOf(state.showTools ? state.tools.filter((tool) => !tool.parent) : []);
  // Where the tools WOULD stand, shown or not: the crown of the harnesses
  // turns towards them, and must not turn when the ring is hidden (2026-11-23).
  const ring = state.showTools ? places : ringOf(state.tools.filter((tool) => !tool.parent)).places;
  state.toolPlaces = places;
  state.sectors = sectors;
  // The span of each open second arc: the names of the ring it covers fade
  // for as long as it is open.
  state.openArcs = [];
  for (const parent of state.openTools) {
    const angles = places.filter((p) => p.parent === parent).map((p) => p.angle);
    if (angles.length) state.openArcs.push({ parent, min: Math.min(...angles) - 0.08, max: Math.max(...angles) + 0.08 });
  }
  if (animate) animateTools(layout, before);
  placeDust(layout);
  if (crownShown()) arrangeFloor(layout, ring);
  state.grid = new Map();
  for (const [id, p] of layout.at) {
    const cell = `${Math.floor(p.x / CELL)}:${Math.floor(p.y / CELL)}`;
    const inCell = state.grid.get(cell);
    if (inCell) inCell.push(id); else state.grid.set(cell, [id]);
  }
}
