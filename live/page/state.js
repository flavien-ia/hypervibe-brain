// state.js: everything the page knows at a given moment, in one object.
//
// The other modules read and change it directly: there is one page, one map,
// one state. What comes from the server keeps the shape of contract.d.ts;
// what the page works out itself (places, grids, what is hovered) is typed
// here.

import { colors, dataColor } from "./theme.js";

/** @typedef {import("../contract.d.ts").Tool} Tool */
/** @typedef {import("../contract.d.ts").Family} Family */
/** @typedef {import("../contract.d.ts").Vocabulary} Vocabulary */
/** @typedef {import("../contract.d.ts").TerritoriesResponse} TerritoriesResponse */
/** @typedef {import("../contract.d.ts").NextResponse} NextResponse */
/** @typedef {import("../contract.d.ts").JudgeCost} JudgeCost */
/** @typedef {import("../contract.d.ts").SetupResponse} SetupResponse */
/** @typedef {import("../contract.d.ts").LogosResponse} LogosResponse */
/** @typedef {import("../contract.d.ts").ContactRow} ContactRow */
/** @typedef {import("../contract.d.ts").ReadEvent} ReadEvent */
/** @typedef {import("../contract.d.ts").WriteEvent} WriteEvent */
/** @typedef {import("../contract.d.ts").RunSignal} RunSignal */
/** @typedef {import("./map.js").Note} Note */
/** @typedef {import("./map.js").Point} Point */
/** @typedef {import("./map.js").Layout} Layout */
/** @typedef {import("./map.js").ToolPlace} ToolPlace */
/** @typedef {import("./map.js").SectorArc} SectorArc */

/** The arrangements of the map, and the executive floor (2026-11-22). @typedef {"domains" | "semantic" | "executive"} View */
/** The zoom and the offset of the map on the screen. @typedef {{ k: number, x: number, y: number }} Camera */
/** One entry of the catalogue (a row of GET /api/catalogue, named). @typedef {{ address: string, tool: string, title: string, date: string }} CatalogueEntry */
/**
 * A dot of the dust around the notes: a catalogue entry, or a contact of the directory.
 * @typedef {Point & { address: string, tool: string, title: string, date?: string, contact?: true, email?: string, client?: string, note?: string, n?: number, weight?: number }} Dust
 */
/** A logo ready to paint: a drawn path and its colour as the brain gives it (six hexadecimal digits; theme.js logoColor paints it), or a loaded image. @typedef {{ path: Path2D, hex: string } | { image: HTMLImageElement, round: boolean }} ReadyLogo */
/**
 * The path between two notes read one after the other by a conversation, as last painted.
 * @typedef {{ conv: string, read: ReadEvent, from: string, to: string, followed: boolean, p0: Point, pc: Point, p1: Point }} LivePath
 */
/**
 * A tool whose source is running, or has just brought something in.
 * @typedef {object} Running
 * @property {number} start milliseconds
 * @property {number | null} end milliseconds; null while it runs
 * @property {Extract<RunSignal, { state: "start" }>} [info] what the source said when it started
 * @property {Extract<RunSignal, { state: "end" }>} [outcome] what it said when it ended
 */

// ------------------------------------------------------------ constants

/** A note that was read stays fully lit for a minute in the activity panel... */
export const LIT_MS = 60_000;
/** ...then counts for one more minute. */
export const FADE_MS = 60_000;
/** The ring that signals a fresh write. */
export const PING_MS = 2500;
/** Beyond this magnification, the titles are written. */
export const TITLES_FROM = 3.2;
/** How many titles at most. */
export const TITLES_MAX = 140;
/** How close the pointer must be to a note, in screen pixels. */
export const REACH_PX = 12;
/** The side of a cell of the grids that find what is under the pointer, in world units. */
export const CELL = 12;
// The colours of the conversations (VIVID), of what is chosen (SELECTION), of
// the "Written or modified" filter, of a contact, of the natures and of the two
// sectors of the ring: they depend on the design (theme.js, 2026-11-23), and
// are given from there as live bindings, under the names they always had.
export { CONTACT_COLOR, NATURE_COLORS, SECTORS, SELECTION, VIVID, WRITTEN_COLOR } from "./theme.js";
// A NOTE THAT WAS READ SHINES FOR THREE SECONDS, fading, then goes out (2026-11-08).
export const READ_MS = 3000;
// Without a signal for the end of an answer (a client other than Claude Code),
// a minute without a new read counts as the end.
export const NO_END_MS = 60_000;
// The line that goes from a note read to the next is drawn in this time, then
// the note lights up.
export const LINE_MS = 350;

// ------------------------------------------------------------ the state

/** Everything the page knows now. */
export const state = {
  // ---- the brain
  /** @type {Note[]} */
  notes: [],
  /** @type {Map<string, Note>} */
  noteById: new Map(),
  /** @type {Map<string, string[]>} note id -> the notes it is linked to */
  neighbours: new Map(),
  /** @type {Map<string, number>} note id -> how many notes link to it (the next seed to validate is the most linked to) */
  inbound: new Map(),
  /** @type {Vocabulary | null} */
  vocabulary: null,
  /** @type {TerritoriesResponse | null} the stable territories of the Semantic view */
  territories: null,
  /** @type {CatalogueEntry[]} */
  catalogue: [],
  /** Whether the last reading of the catalogue succeeded. */
  catalogueRead: false,
  /** @type {ContactRow[] | null} the Contacts layer, loaded when first ticked */
  contacts: null,
  /** @type {{ rank: Map<string, number> } | null} the Importance filter: the rank of each note by weight (0 to 1), loaded when first asked */
  weights: null,

  // ---- the tools around it
  /** @type {Tool[]} */
  tools: [],
  /** @type {Record<string, Family>} */
  families: {},
  /** @type {Record<string, ReadyLogo>} */
  logos: {},
  /** @type {LogosResponse} as the server gave them (the settings page draws them in SVG) */
  rawLogos: {},
  /** @type {NextResponse} tool id -> its next run */
  nextRuns: {},
  /** @type {JudgeCost[]} the judges and where each stands today (without their runs: the usage page asks for those) */
  judges: [],
  /** @type {SetupResponse | null} what the brain still lacks (setup.js); null until the server said */
  setup: null,
  /** @type {Set<string>} the tools with several databases that are unfolded */
  openTools: new Set(),

  // ---- the arrangement
  /** @type {View} */
  view: "domains",
  /** @type {Layout | null} null until the map is loaded */
  layout: null,
  /** @type {ToolPlace[]} */
  toolPlaces: [],
  /** @type {SectorArc[]} */
  sectors: [],
  /** @type {{ parent: string, min: number, max: number }[]} the span of each open second arc */
  openArcs: [],
  /** @type {Map<string, string[]>} cell -> the notes in it */
  grid: new Map(),
  /** @type {Dust[]} */
  dust: [],
  /** @type {Map<string, Dust[]>} cell -> the dust in it */
  dustGrid: new Map(),
  /** @type {Map<string, Dust>} */
  dustByAddress: new Map(),

  // ---- the layers and the filters
  // ONE SINGLE BOX (2026-11-08): the sources and the bases are shown or hidden together.
  showTools: true,
  showCatalogue: true,
  showContacts: false,
  /** The skills the AI started in the last half hour, for the activity panel (stream.js). @type {import("../contract.d.ts").SkillUse[]} */
  skillUses: [],
  /** The crown of the harnesses around the ring of tools (the "Harnesses" layer, executive.js, 2026-11-23). */
  showHarnesses: false,
  /** @type {Set<string>} the nature filters ticked: AI memory (lessons), decisions */
  natureFilters: new Set(),
  /** @type {{ since: string, slugs: Set<string> } | null} the "Written or modified" filter */
  writtenSince: null,
  /** The organizations named around the brain (arrange.js, placeContacts). @type {{ x: number, y: number, label: string, n: number }[]} */
  contactClusters: [],
  /** The "Seeds" filter: the notes the machine wrote that the person has not validated yet. */
  seedFilter: false,
  /** @type {Map<string, string>} note id -> the status the person has just given it, until the map says the same */
  pendingStatus: new Map(),

  // ---- the camera
  /** @type {Camera} */
  camera: { k: 1, x: 0, y: 0 },
  /** The scale at which the whole brain fits the window. */
  baseScale: 1,
  /** Whether the person moved the map (a resize then keeps their framing). */
  moved: false,
  width: 0,
  height: 0,
  dpr: 1,

  // ---- what is chosen, what is hovered
  /** @type {string | null} the note whose card is open */
  selection: null,
  /** @type {string | null | undefined} the selection the background was last painted for */
  paintedSelection: undefined,
  /** @type {string | null} the tool whose card is open */
  chosenTool: null,
  /** @type {Set<string> | null} the notes the chosen tool wrote this week */
  toolNotes: null,
  /** @type {Dust | null} the catalogue entry or the contact whose card is open */
  chosenEntry: null,
  /** @type {string | null} */
  hoverNote: null,
  /** @type {string | null} */
  hoverTool: null,
  /** @type {Dust | null} */
  hoverDust: null,
  /** @type {LivePath | null} */
  hoverPath: null,

  // ---- the live activity
  /** @type {ReadEvent[]} */
  reads: [],
  /** @type {WriteEvent[]} */
  writes: [],
  /** @type {Map<string, string[]>} conversation -> the ends of its answers, said by the end-of-answer hook */
  turnEnds: new Map(),
  /** @type {Map<string, Running>} tool id -> the flow of a source that runs */
  running: new Map(),
  /** @type {LivePath[]} the reading paths as last painted, for the pointer */
  livePaths: [],
  /** @type {string | null} who serves the page: when it changes, the page reloads */
  serverVersion: null,
};

// ------------------------------------------------------------ looking things up

/**
 * A point of the world, on the screen (in CSS pixels).
 * @param {Point} p
 * @returns {Point}
 */
export const toScreen = (p, floor = 0) => {
  const q = project(p, floor);
  return { x: state.camera.x + q.x * state.camera.k, y: state.camera.y + q.y * state.camera.k };
};

// THE TWO FLOORS, SEEN FROM ABOVE AND ASIDE (2026-11-22). In the Executive
// view the brain shows its two floors at once: the knowledge below, the
// executive floor above. Each floor is the flat map turned on itself, then
// tilted (its depth squashed), the upper one raised: an affine change of the
// world, so the canvas draws it as it draws the flat map (setWorld), circles
// becoming ellipses by themselves, and the texts stay upright on the screen
// (toScreen). The rest of the page asks for a floor, or gets floor 0.
//
// THE PERSON SETS IT (2026-11-22): how far it is turned, how much it is
// tilted, how high the executive floor stands over the knowledge (the box of
// the view, executive.js, and Shift + drag). Kept in this browser.
// (rise: the pair of floors a little up, the names of the ring below taking more room than the plate above.)
// (gap: fixed at the height the person chose on 2026-11-23, 0.63 of the disc's radius.)
// (tools: where the ring of tools stands, "floor" a floor of its own under the knowledge, "rings" on each floor, 2026-11-23.)
// (tilt: false since 2026-11-23, the Executive view is one plane, the harnesses in a crown around the ring of tools;
// the tilted floors stay here, unused, the time the crown is judged.)
export const ISO = { tilt: false, turn: 0, squash: 0.46, gap: 0.63, rise: 0.1, tools: /** @type {"floor" | "rings"} */ ("floor") };
/** Whether the crown of the harnesses is drawn: the "Harnesses" layer, in the Domains and Semantic views alike. */
export const crownShown = () => Boolean(state.showHarnesses);
/** How far the crown of the harnesses reaches, in world units from the centre (executive.js), for the framing. */
export const CROWN = { outer: 0 };
/** The disc of the brain when the floors are tilted, else null. */
const tilted = () => (state.view === "executive" && ISO.tilt && state.layout ? state.layout.center : null);
/** How much a floor is raised, in world units (the knowledge below, the executive floor above). @param {number} floor */
const lift = (floor) => {
  const c = tilted();
  if (!c) return 0;
  // The floors stacked around their middle: knowledge and executive (0, 1),
  // or tools, knowledge and executive (-1, 0, 1).
  const middle = ISO.tools === "floor" ? 0 : 0.5;
  return (-(floor - middle) * ISO.gap - ISO.rise) * c.r;
};
/** The floor the ring of tools stands on: -1 when the tools have a floor of their own (Executive view), else 0. */
export const toolFloor = () => (tilted() && ISO.tools === "floor" ? -1 : 0);
/**
 * A tool's place, as a point of floor 0 that the screen shows where the tool
 * is drawn: the live canvas draws in floor 0's world (reads, writes, halos),
 * and a tool on another floor is reached by it all the same.
 * @template {Point | null | undefined} P @param {P} p @returns {P}
 */
export function atTool(p) {
  if (!p || toolFloor() === 0) return p;
  const e = toScreen(p, toolFloor());
  return /** @type {P} */ ({ ...p, ...toWorld(e.x, e.y, 0) });
}
/** How much depth is kept: 1 on the flat map. */
export const squash = () => (tilted() ? ISO.squash : 1);
/** How far the floors are turned, in radians: 0 on the flat map. */
export const turn = () => (tilted() ? ISO.turn : 0);
/**
 * A point of a floor, in the world before the camera.
 * @param {Point} p @param {number} [floor] 0 the knowledge, 1 the executive floor
 * @returns {Point}
 */
export function project(p, floor = 0) {
  const c = tilted();
  if (!c) return p;
  const cos = Math.cos(ISO.turn), sin = Math.sin(ISO.turn);
  const dx = p.x - c.x, dy = p.y - c.y;
  return { x: c.x + cos * dx - sin * dy, y: c.y + (sin * dx + cos * dy) * ISO.squash + lift(floor) };
}
/**
 * A point of the screen, back on a floor of the world.
 * @param {number} sx @param {number} sy @param {number} [floor]
 * @returns {Point}
 */
export function toWorld(sx, sy, floor = 0) {
  const qx = (sx - state.camera.x) / state.camera.k;
  const qy = (sy - state.camera.y) / state.camera.k;
  const c = tilted();
  if (!c) return { x: qx, y: qy };
  const u = qx - c.x, v = (qy - lift(floor) - c.y) / ISO.squash;
  const cos = Math.cos(ISO.turn), sin = Math.sin(ISO.turn);
  return { x: c.x + cos * u + sin * v, y: c.y - sin * u + cos * v };
}
/**
 * Sets a context to draw a floor in world units.
 * @param {CanvasRenderingContext2D} ctx @param {number} [floor]
 */
export function setWorld(ctx, floor = 0) {
  const { k, x, y } = state.camera;
  const d = state.dpr;
  const c = tilted();
  if (!c) return ctx.setTransform(d * k, 0, 0, d * k, d * x, d * y);
  const cos = Math.cos(ISO.turn), sin = Math.sin(ISO.turn), s = ISO.squash;
  // x' = cos·x − sin·y + ex ; y' = s·sin·x + s·cos·y + ey (world units), then the camera.
  const ex = c.x - cos * c.x + sin * c.y;
  const ey = c.y + lift(floor) - s * sin * c.x - s * cos * c.y;
  ctx.setTransform(d * k * cos, d * k * s * sin, -d * k * sin, d * k * s * cos, d * (x + k * ex), d * (y + k * ey));
}
/** The angle, on the screen, of the radius of the brain that goes through a point of floor 0. @param {Point} p */
export function screenAngle(p) {
  const c = state.layout?.center;
  if (!c) return 0;
  const a = toScreen(p), o = toScreen(c);
  return Math.atan2(a.y - o.y, a.x - o.x);
}

// BOTH A SOURCE AND A BASE (2026-11-20). The ring tells two things: what
// feeds the brain, and where it can go and look. A tool that does both
// (the accounting the brain reads each evening AND can query) sat with the
// sources only, a dot recalling its other role: looked for among the bases, it
// was not found. It is drawn in both sectors. It stays ONE tool: the same
// card, the same state, and pointing at one place circles the other too. Its
// second place carries the tool's id with this suffix, and nothing else knows
// it: the pointer gives back the tool's own id.
export const TWIN = "~base";
/** The id of the tool a place of the ring shows (its second place carries a suffix). */
export const realId = (id) => (typeof id === "string" && id.endsWith(TWIN) ? id.slice(0, -TWIN.length) : id);

/**
 * A tool, by id (or by the id of its second place on the ring).
 * @param {string | null | undefined} id
 * @returns {Tool | undefined}
 */
export const toolById = (id) => {
  const real = realId(id);
  return state.tools.find((tool) => tool.id === real);
};

/**
 * The colour of a tool's family.
 * @param {Tool | undefined} tool
 * @param {string} [fallback] for a tool that is not known (or a family that is not)
 * @returns {string}
 */
export const familyColor = (tool, fallback = colors.mark) => { const color = tool && state.families[tool.family]?.color; return color ? dataColor(color, "family") : fallback; };

/**
 * The place of a tool on the map; a database folded into its parent is shown by it.
 * @param {string | null | undefined} id
 * @returns {ToolPlace | null}
 */
export function toolPlace(id) {
  if (!id) return null;
  const place = state.toolPlaces.find((p) => p.id === id);
  if (place) return place;
  const parent = toolById(id)?.parent;
  return parent ? state.toolPlaces.find((p) => p.id === parent) ?? null : null;
}

/**
 * The colour of a conversation: always the same for the same conversation.
 * @param {string} conv
 * @returns {string}
 */
export function conversationColor(conv) {
  if (!conv) return colors.name === "night" ? "#e6e7f2" : colors.mark;
  let h = 0;
  for (const ch of conv) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return colors.vivid[h % colors.vivid.length];
}

// What no tool declares yet: the addresses of the directory of contacts are
// drawn towards the mail tool, as they were before the tools declared their
// prefixes (2026-11-10). To go when a source declares "annuaire://" itself.
/** @type {Record<string, string | undefined>} */
const FORMER_SCHEMES = { annuaire: "gmail" };

/**
 * The tool an address read by brain_fetch lives in ("scheme://..."), to draw
 * the flow towards it: the tool of the catalogue entry at that address when
 * it is one (the entry says where it comes from), else the tool that serves
 * the longest prefix of the address (`prefixes`, as the sources and the data
 * registry declare them: "neon://" for the tool, "neon://<project>/" for one
 * of its databases, shown by its parent while it is folded).
 * @param {string | null | undefined} address
 * @returns {string | null}
 */
export function toolOfAddress(address) {
  const a = address ?? "";
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//.exec(a)?.[1];
  if (!scheme) return null;
  const entry = state.dustByAddress.get(a);
  if (entry && !entry.contact) return entry.tool;
  /** @type {string | null} */
  let best = null;
  let length = 0;
  for (const tool of state.tools) {
    for (const prefix of tool.prefixes ?? []) {
      if (prefix.length > length && a.startsWith(prefix)) { best = tool.id; length = prefix.length; }
    }
  }
  return best ?? FORMER_SCHEMES[scheme] ?? null;
}
