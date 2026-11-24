// map.js: where everything sits on the map, with no dependency and no drawing.
//
// Two arrangements of the same brain: by DOMAIN then by type of note, and by
// TERRITORY of meaning (k-means on the semantic position). Plus the ring of
// tools around. Pure and deterministic: the same notes always give the same
// picture. Coordinates are in world units (a square of 1000).

import { t } from "./i18n.js";
import { dataColor, seedColors } from "./theme.js";

/** @typedef {import("../contract.d.ts").Vocabulary} Vocabulary */
/** @typedef {import("../contract.d.ts").TerritoriesResponse} TerritoriesResponse */
/** @typedef {import("../contract.d.ts").Tool} Tool */
/** @typedef {import("../contract.d.ts").ToolRole} ToolRole */

/**
 * One note of the map (a row of GET /api/map, named).
 * @typedef {object} Note
 * @property {string} id
 * @property {string} title
 * @property {string} type
 * @property {string[]} domains
 * @property {number} degree how many links
 * @property {string} status
 * @property {[number, number, number] | null} pos its semantic position
 * @property {string} date
 * @property {string} nature
 */
/** @typedef {{ x: number, y: number }} Point */
/** @typedef {{ x: number, y: number, r: number }} Circle */
/**
 * A bubble of the map: a domain, or a territory.
 * @typedef {Circle & { key: string, name: string, n: number, origin?: string | null, nameBox?: { x: number, y: number, width: number } }} Bubble
 */
/**
 * A bubble inside a domain: one type of note.
 * @typedef {Circle & { key: string, domain: string, type: string, name: string, n: number }} SubBubble
 */
/** Where the entries of a tool go: a domain, and maybe a type inside it. @typedef {{ domain?: string, type?: string }} Target */
/**
 * One arrangement of the notes.
 * @typedef {object} Layout
 * @property {Circle} center the disc of the brain
 * @property {Bubble[]} bubbles
 * @property {SubBubble[]} subBubbles
 * @property {Map<string, Point>} at note id -> its place
 * @property {Map<string, string>} groupOf note id -> the key of its bubble
 * @property {Map<string, number>} dotSize bubble key -> the size of its dots
 * @property {(target: Target) => Circle | null | undefined} resolve the bubble a target designates
 */
/**
 * The place of a tool on the ring.
 * @typedef {Point & { id: string, sector: ToolRole, angle: number, parent?: string, small?: boolean, nameWidth?: number }} ToolPlace
 */
/** The arc of one sector of the ring. @typedef {{ sector: ToolRole, start: number, end: number }} SectorArc */

/** The side of the square the map is laid out in, in world units. */
export const WORLD = 1000;
/** How far the ring of tools stands from the disc of the brain. */
export const RING_GAP = 150;
const TERRITORIES = 12;

// THE VOCABULARY COMES FROM THE BRAIN (2026-11-10). The domains, their names
// and their colours, the types of notes: the map receives them from the
// server (brain.json), in the identifiers the notes carry. Nothing is written
// here for one person's brain. Only the WORDS of the usual types are given,
// by identifier, in the dictionary (`typeWords`); an unknown type carries the
// name of its folder.

/** The domain of a note that has none, and of a domain the brain does not declare. */
export const OTHER = "other";
/** The sub-bubble that gathers the types too small to have their own. */
const MISC = "misc";

// THE ORDER OF THE BUBBLES IS KEPT (2026-11-10). The bubbles are packed in
// the order of their keys, and that order breaks the tie between two bubbles
// of the same size. Until the English pass these two groups were called
// "autre" and "divers": they keep that rank in the sort, so that the map of
// an existing brain does not move by a single dot.
/** @type {Record<string, string>} */
const FORMER_RANK = { [OTHER]: "autre", [MISC]: "divers" };
/** @param {string} a @param {string} b */
const byKey = (a, b) => {
  const x = FORMER_RANK[a] ?? a, y = FORMER_RANK[b] ?? b;
  return x < y ? -1 : x > y ? 1 : 0;
};

/** @type {Record<string, { name: string, color: string }>} domain id -> its name and colour; filled by setVocabulary */
export const DOMAINS = {};
/** @type {Map<string, string>} type id -> its folder, for the types the brain declares */
const declaredTypes = new Map();
let personType = "person";

const otherDomain = () => ({ name: t("otherDomain"), color: NIGHT_GREY });
/** The grey of the other domain, as the night paints it (theme.js shows it in its own grey). */
const NIGHT_GREY = "#6b7280";

/**
 * Receives the vocabulary of the brain served with the map; the tables are filled in place.
 * @param {Vocabulary | null | undefined} vocabulary
 */
export function setVocabulary(vocabulary) {
  for (const k of Object.keys(DOMAINS)) delete DOMAINS[k];
  for (const d of vocabulary?.domains ?? []) DOMAINS[d.id] = { name: d.label, color: d.color };
  // A brain may well declare a domain called "other": it keeps its own name and colour.
  DOMAINS[OTHER] ??= otherDomain();
  declaredTypes.clear();
  for (const type of vocabulary?.types ?? []) declaredTypes.set(type.id, type.folder);
  personType = vocabulary?.personType ?? "person";
  // The domains take the colours of the design in their order (theme.js).
  seedColors("domain", Object.values(DOMAINS).map((d) => d.color));
}

/**
 * The name of a type of note, in the singular ("project"); its id when the brain does not declare it.
 * @param {string} type
 * @returns {string}
 */
export const typeName = (type) => (declaredTypes.has(type) ? t("typeWords", type)?.[0] ?? type : type);

/**
 * The name of a type of note, in the plural ("projects"): its words, else its
 * folder; nothing for a type the brain does not declare.
 * @param {string} type
 * @returns {string | undefined}
 */
export function typePlural(type) {
  if (type === MISC) return t("miscTypes");
  return declaredTypes.has(type) ? t("typeWords", type)?.[1] ?? declaredTypes.get(type) ?? type : undefined;
}

/** @param {Note} n */
const isContact = (n) => n.type === personType;
/** The first domain of a note. @param {Note} n @returns {string} */
export const domainOf = (n) => n.domains[0] ?? OTHER;
/**
 * The name of a domain; its id when the brain does not declare it.
 * @param {string} domain
 * @returns {string}
 */
export const domainName = (domain) => DOMAINS[domain]?.name ?? domain;
/**
 * The colour of a domain.
 * @param {string} domain
 * @returns {string}
 */
export const domainColor = (domain) => dataColor((DOMAINS[domain] ?? DOMAINS[OTHER] ?? otherDomain()).color, "domain");

/**
 * Packs circles side by side without overlap; centres brought back into the unit circle.
 * @param {number[]} radii
 * @param {number} margin
 * @returns {Circle[]}
 */
export function pack(radii, margin) {
  const order = radii.map((r, i) => ({ r, i })).sort((a, b) => b.r - a.r);
  const mean = radii.reduce((a, b) => a + b, 0) / Math.max(1, radii.length);
  const b = order.map(({ r }, k) => {
    const a = k * 2.39996;
    const d = Math.sqrt(k) * mean * 1.2;
    return { x: Math.cos(a) * d, y: Math.sin(a) * d, r };
  });
  const gap = margin * mean;
  for (let it = 0; it < 500; it++) {
    for (const c of b) { c.x *= 0.985; c.y *= 0.985; }
    for (let i = 0; i < b.length; i++) {
      for (let j = i + 1; j < b.length; j++) {
        const A = b[i], B = b[j];
        const dx = B.x - A.x, dy = B.y - A.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const m = A.r + B.r + gap - d;
        if (m <= 0) continue;
        const ux = dx / d, uy = dy / d;
        const wa = B.r / (A.r + B.r), wb = A.r / (A.r + B.r);
        A.x -= ux * m * wa; A.y -= uy * m * wa;
        B.x += ux * m * wb; B.y += uy * m * wb;
      }
    }
  }
  const cx = (Math.min(...b.map((c) => c.x - c.r)) + Math.max(...b.map((c) => c.x + c.r))) / 2;
  const cy = (Math.min(...b.map((c) => c.y - c.r)) + Math.max(...b.map((c) => c.y + c.r))) / 2;
  const R = Math.max(...b.map((c) => Math.hypot(c.x - cx, c.y - cy) + c.r)) || 1;
  /** @type {Circle[]} */
  const out = new Array(radii.length);
  order.forEach(({ i }, k) => { const c = b[k]; out[i] = { x: (c.x - cx) / R, y: (c.y - cy) / R, r: c.r / R }; });
  return out;
}

/** @returns {Circle} */
export const worldCenter = () => ({ x: WORLD / 2, y: WORLD / 2 + 10, r: WORLD / 2 - 40 });

/** @param {Circle} center @returns {Layout} */
export const emptyLayout = (center) => ({ center, bubbles: [], subBubbles: [], at: new Map(), groupOf: new Map(), dotSize: new Map(), resolve: () => null });

/**
 * One bubble per domain, one per type inside each domain, the notes as a sunflower.
 * @param {Note[]} notes
 * @returns {Layout}
 */
export function byDomains(notes) {
  /** @type {Map<string, Map<string, Note[]>>} */
  const groups = new Map();
  for (const n of notes) {
    const d = DOMAINS[domainOf(n)] ? domainOf(n) : OTHER;
    let byType = groups.get(d);
    if (!byType) groups.set(d, (byType = new Map()));
    const list = byType.get(n.type);
    if (list) list.push(n); else byType.set(n.type, [n]);
  }
  for (const byType of groups.values()) {
    const misc = [];
    for (const [type, list] of [...byType]) {
      if (list.length < 4 || !typePlural(type)) { misc.push(...list); byType.delete(type); }
    }
    if (misc.length) byType.set(MISC, misc);
  }
  const names = [...groups.keys()].sort(byKey);
  const typesOf = (/** @type {string} */ d) => /** @type {Map<string, Note[]>} */ (groups.get(d));
  const sizes = names.map((d) => [...typesOf(d).values()].reduce((a, l) => a + l.length, 0));
  const places = pack(sizes.map((n) => Math.sqrt(Math.max(n, 30))), 0.08);
  const center = worldCenter();
  const layout = emptyLayout(center);

  names.forEach((d, i) => {
    const p = places[i];
    const dx = center.x + p.x * center.r, dy = center.y + p.y * center.r, dr = p.r * center.r;
    layout.bubbles.push({ key: d, name: DOMAINS[d].name, x: dx, y: dy, r: dr, n: sizes[i] });
    const byType = typesOf(d);
    const keys = [...byType.keys()].sort(byKey);
    const sub = pack(keys.map((type) => Math.sqrt(/** @type {Note[]} */ (byType.get(type)).length)), 0.12);
    let dot = 5;
    keys.forEach((type, k) => {
      const s = sub[k];
      const tx = dx + s.x * dr * 0.9, ty = dy + s.y * dr * 0.9, tr = s.r * dr * 0.9;
      const list = /** @type {Note[]} */ (byType.get(type));
      const alone = keys.length === 1;
      if (!alone) layout.subBubbles.push({ key: `${d}:${type}`, domain: d, type, name: typePlural(type) ?? type, x: tx, y: ty, r: tr, n: list.length });
      list.sort((a, b) => b.degree - a.degree || a.id.localeCompare(b.id));
      const n = list.length;
      const usable = tr * (alone ? 0.86 : 0.76);
      const spacing = usable * Math.sqrt(Math.PI / Math.max(1, n));
      dot = Math.min(dot, Math.max(1.6, Math.min(5, spacing * 0.62)));
      list.forEach((note, j) => {
        const rr = usable * Math.sqrt((j + 0.5) / n);
        const a = j * 2.39996;
        layout.at.set(note.id, { x: tx + Math.cos(a) * rr, y: ty + Math.sin(a) * rr + (alone ? 0 : tr * 0.08) });
        layout.groupOf.set(note.id, d);
      });
    });
    layout.dotSize.set(d, dot);
  });
  layout.resolve = (target) =>
    (target.type ? layout.subBubbles.find((b) => b.domain === target.domain && b.type === target.type) : null) ??
    layout.bubbles.find((b) => b.key === target.domain);
  return layout;
}

// ------------------------------------------------------------ by meaning

/** @param {number[]} a @param {number[]} b */
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/**
 * The two main axes of a cloud of points around its mean.
 * @param {number[][]} points
 * @param {number[]} m
 * @returns {[number[], number[]]}
 */
function mainAxes(points, m) {
  const c = new Array(9).fill(0);
  for (const p of points) {
    const v = [p[0] - m[0], p[1] - m[1], p[2] - m[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[i * 3 + j] += v[i] * v[j];
  }
  const mul = (/** @type {number[]} */ v) => [c[0] * v[0] + c[1] * v[1] + c[2] * v[2], c[3] * v[0] + c[4] * v[1] + c[5] * v[2], c[6] * v[0] + c[7] * v[1] + c[8] * v[2]];
  const unit = (/** @type {number[]} */ v) => { const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  let a = [1, 0.3, 0.1];
  for (let i = 0; i < 40; i++) a = unit(mul(a));
  let b = [0.1, 1, 0.3];
  for (let i = 0; i < 40; i++) {
    b = mul(b);
    const k = b[0] * a[0] + b[1] * a[1] + b[2] * a[2];
    b = unit([b[0] - k * a[0], b[1] - k * a[1], b[2] - k * a[2]]);
  }
  return [a, b];
}

/** A note that has a semantic position. @typedef {Note & { pos: [number, number, number] }} PlacedNote */
/** A territory being laid out: its notes, its key, and its name when the server gave one. @typedef {{ m: PlacedNote[], key: string, name?: string, origin?: string }} Group */

/**
 * The territories of meaning: the server's when it has them, else twelve cut here.
 * @param {Note[]} notes
 * @param {TerritoriesResponse | null} [territories]
 * @returns {Layout}
 */
export function byMeaning(notes, territories = null) {
  const kept = /** @type {PlacedNote[]} */ (notes.filter((n) => n.pos)).sort((a, b) => a.id.localeCompare(b.id));
  const seeds = kept.filter((n) => !isContact(n));
  const P = (seeds.length ? seeds : kept).map((n) => n.pos);
  const center = worldCenter();
  const layout = emptyLayout(center);
  if (!P.length) return layout;

  // THE STABLE TERRITORIES (2026-11-09): computed by the server on the true
  // meaning of the notes (territories.mjs), kept and named; a note without a
  // vector joins the territory whose mean position is the closest. Without
  // them (an older server, a computation that failed), the cutting of before.
  /** @type {Group[]} */
  let groups;
  /** @type {(members: PlacedNote[], group: Group) => string} */
  let nameOf;
  if (territories?.territories?.length) {
    /** @type {Map<string, Group>} */
    const byId = new Map(territories.territories.map((tr) => [tr.id, { m: [], key: tr.id, name: tr.name, origin: tr.origin }]));
    const without = [];
    for (const n of kept) {
      const g = byId.get(territories.assignment?.[n.id]);
      if (g) g.m.push(n); else without.push(n);
    }
    const means = [...byId.values()].filter((g) => g.m.length).map((g) => ({ g, c: [0, 1, 2].map((i) => g.m.reduce((sum, n) => sum + n.pos[i], 0) / g.m.length) }));
    for (const n of without) { const best = means.reduce((m, x) => (d2(n.pos, x.c) < d2(n.pos, m.c) ? x : m), means[0]); best?.g.m.push(n); }
    groups = [...byId.values()].filter((g) => g.m.length);
    nameOf = (_members, g) => g.name ?? "";
  } else {
    const K = Math.min(TERRITORIES, P.length);
    const mean = [0, 1, 2].map((i) => P.reduce((sum, p) => sum + p[i], 0) / P.length);
    /** @type {number[][]} */
    let centers = [P.reduce((m, p) => (d2(p, mean) < d2(m, mean) ? p : m))];
    while (centers.length < K) {
      let far = P[0], dl = -1;
      for (const p of P) { const d = Math.min(...centers.map((c) => d2(p, c))); if (d > dl) { dl = d; far = p; } }
      centers.push(far);
    }
    const nearest = (/** @type {number[]} */ p) => { let b = 0, bd = Infinity; centers.forEach((c, i) => { const d = d2(p, c); if (d < bd) { bd = d; b = i; } }); return b; };
    for (let it = 0; it < 40; it++) {
      const sums = centers.map(() => [0, 0, 0, 0]);
      for (const p of P) { const acc = sums[nearest(p)]; acc[0] += p[0]; acc[1] += p[1]; acc[2] += p[2]; acc[3]++; }
      centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c));
    }
    /** @type {PlacedNote[][]} */
    const members = centers.map(() => []);
    for (const n of kept) members[nearest(n.pos)].push(n);
    groups = members.map((m, i) => ({ m, key: `t${i}` })).filter((g) => g.m.length);

    // Named after its most linked note, else after what it mostly holds.
    nameOf = (m) => {
      const head = m.filter((n) => !isContact(n)).sort((a, b) => b.degree - a.degree)[0];
      if (head && head.degree >= 3) return head.title;
      /** @type {Map<string, number>} */
      const tally = new Map();
      for (const n of m) tally.set(n.type, (tally.get(n.type) ?? 0) + 1);
      const type = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? MISC;
      return t("variousOf", typePlural(type) ?? type);
    };
  }

  const places = pack(groups.map((g) => Math.sqrt(Math.max(g.m.length, 20))), 0.06);
  groups.forEach((g, i) => {
    const pl = places[i];
    const bx = center.x + pl.x * center.r, by = center.y + pl.y * center.r, br = pl.r * center.r;
    layout.bubbles.push({ key: g.key, name: nameOf(g.m, g), origin: g.origin ?? null, x: bx, y: by, r: br, n: g.m.length });
    const pts = g.m.map((n) => n.pos);
    const mean = [0, 1, 2].map((k) => pts.reduce((sum, p) => sum + p[k], 0) / pts.length);
    const [ax, ay] = mainAxes(pts, mean);
    const projected = g.m.map((n) => {
      const v = [n.pos[0] - mean[0], n.pos[1] - mean[1], n.pos[2] - mean[2]];
      const u = v[0] * ax[0] + v[1] * ax[1] + v[2] * ax[2];
      const w = v[0] * ay[0] + v[1] * ay[1] + v[2] * ay[2];
      return { n, angle: Math.atan2(w, u), dist: Math.hypot(u, w) };
    }).sort((a, b) => a.dist - b.dist || a.n.id.localeCompare(b.n.id));
    const count = projected.length;
    const usable = br * 0.86;
    const spacing = usable * Math.sqrt(Math.PI / Math.max(1, count));
    const dots = projected.map((q, rank) => {
      const r = usable * Math.sqrt((rank + 0.5) / count);
      return { id: q.n.id, x: bx + Math.cos(q.angle) * r, y: by + Math.sin(q.angle) * r };
    });
    const min = spacing * 0.85;
    for (let pass = 0; pass < 12; pass++) {
      /** @type {Map<string, number[]>} */
      const grid = new Map();
      dots.forEach((p, k) => {
        const cell = `${Math.floor(p.x / min)}:${Math.floor(p.y / min)}`;
        const inCell = grid.get(cell);
        if (inCell) inCell.push(k); else grid.set(cell, [k]);
      });
      dots.forEach((p, k) => {
        const cx = Math.floor(p.x / min), cy = Math.floor(p.y / min);
        for (let a = cx - 1; a <= cx + 1; a++) for (let b = cy - 1; b <= cy + 1; b++) for (const o of grid.get(`${a}:${b}`) ?? []) {
          if (o <= k) continue;
          const q = dots[o];
          const dx = q.x - p.x, dy = q.y - p.y, dist = Math.hypot(dx, dy) || 0.01;
          if (dist >= min) continue;
          const m = (min - dist) / 2;
          p.x -= (dx / dist) * m; p.y -= (dy / dist) * m; q.x += (dx / dist) * m; q.y += (dy / dist) * m;
        }
      });
      for (const p of dots) {
        const dx = p.x - bx, dy = p.y - by, r = Math.hypot(dx, dy);
        if (r > br * 0.93) { p.x = bx + (dx / r) * br * 0.93; p.y = by + (dy / r) * br * 0.93; }
      }
    }
    for (const p of dots) { layout.at.set(p.id, { x: p.x, y: p.y }); layout.groupOf.set(p.id, g.key); }
    layout.dotSize.set(g.key, Math.max(1.6, Math.min(5, spacing * 0.62)));
  });
  // A target (a domain, maybe a type) designates the territory that holds most of its notes.
  layout.resolve = (target) => {
    /** @type {Map<string, number>} */
    const tally = new Map();
    for (const n of kept) {
      if (domainOf(n) !== target.domain || (target.type && n.type !== target.type)) continue;
      const key = layout.groupOf.get(n.id);
      if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    const best = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
    return layout.bubbles.find((b) => b.key === best) ?? null;
  };
  return layout;
}

// ------------------------------------------------------------ the ring of tools

/** @type {ToolRole[]} */
const SECTOR_ORDER = ["source", "base"];
const GAP = 0.3;
const CHILD_GAP = 95;

/**
 * TWO SECTORS ON ONE RING (2026-11-08): the sources (what feeds the brain) at
 * the top, then the bases (what it reads on demand), separated by a gap. Each
 * sector takes the room its number of tools asks for, and an absent sector
 * gives its room to the other.
 * @param {Layout} layout
 * @param {Partial<Record<ToolRole, Tool[]>>} groups the tools of each sector (those without a parent)
 * @param {string[]} families the family ids, in the order they are shown
 * @param {(id: string) => Tool[]} childrenOf the tools gathered under one
 * @param {Set<string>} open the tools whose children are unfolded
 * @param {number} [k] the scale of the view
 * @returns {{ places: ToolPlace[], sectors: SectorArc[] }}
 */
export function placeSectors(layout, groups, families, childrenOf, open, k = 1) {
  const { center } = layout;
  const radius = center.r + RING_GAP;
  const order = new Map(families.map((f, i) => [f, i]));
  const present = SECTOR_ORDER.filter((s) => groups[s]?.length);
  const of = (/** @type {ToolRole} */ s) => groups[s] ?? [];
  const total = present.reduce((a, s) => a + of(s).length, 0);
  if (!total) return { places: [], sectors: [] };
  const gaps = present.length > 1 ? present.length : 0;
  const unit = (Math.PI * 2 - GAP * gaps) / total;
  /** @type {ToolPlace[]} */
  const places = [];
  /** @type {SectorArc[]} */
  const sectors = [];
  let angle = -Math.PI / 2 - (of(present[0]).length * unit) / 2;
  for (const s of present) {
    const sorted = [...of(s)].sort((a, b) => (order.get(a.family) ?? 99) - (order.get(b.family) ?? 99) || a.name.localeCompare(b.name));
    const start = angle;
    sorted.forEach((tool, i) => {
      const a = start + (i + 0.5) * unit;
      places.push({ id: tool.id, sector: s, angle: a, x: center.x + Math.cos(a) * radius, y: center.y + Math.sin(a) * radius });
    });
    angle = start + sorted.length * unit;
    sectors.push({ sector: s, start, end: angle });
    angle += GAP;
  }
  // THE CHILDREN ON A SECOND ARC (2026-11-08): an open tool (one database per
  // project, the watched folders) unfolds its own behind it, on an arc
  // farther from the brain, on either side of its name; the ring does not
  // move. Their spacing is counted in screen pixels (k: the scale of the
  // view). Just beyond the circles of the ring (48 screen pixels).
  const far = radius + Math.max(CHILD_GAP, 72 / k);
  for (const p of [...places]) {
    if (!open.has(p.id)) continue;
    const children = [...childrenOf(p.id)].sort((a, b) => a.name.localeCompare(b.name));
    const step = 34 / k / far;
    const n = children.length;
    children.forEach((tool, i) => {
      // One place left free in the middle: the parent's name.
      const rank = i - (n - 1) / 2;
      const a = p.angle + (rank + Math.sign(rank || 1) * 0.6) * step;
      places.push({ id: tool.id, sector: p.sector, parent: p.id, small: true, angle: a, x: center.x + Math.cos(a) * far, y: center.y + Math.sin(a) * far });
    });
  }
  return { places, sectors };
}
