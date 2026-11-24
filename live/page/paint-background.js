// paint-background.js: the canvas that only changes on a zoom, a move or a
// change of view: the disc of the brain, the bubbles, the dust of the
// catalogue, the dots of the notes, the names, and the ring of tools.

import { backgroundCanvas, backgroundContext, writeText } from "./canvas.js";
import { paintUpperFloor, placePieceRing } from "./executive.js";
import { initials, shorten } from "./format.js";
import { t } from "./i18n.js";
import { RING_GAP, domainColor, domainOf } from "./map.js";
import { colors, inkOf, logoColor } from "./theme.js";
import { CONTACT_COLOR, SECTORS, TITLES_FROM, TITLES_MAX, crownShown, familyColor, screenAngle, setWorld, squash, state, toScreen, toolById, toolPlace, turn } from "./state.js";


/** The name of a tool as the ring writes it: a small circle (one database of a tool) drops the word around its name. */
const ringName = (/** @type {import("./state.js").Tool} */ tool, /** @type {boolean | undefined} */ small) => (small ? t("shortDatabaseName", tool.name) : tool.name);

/**
 * The small key of a tool whose source waits for the vault: a ring and a
 * shaft with two teeth, on a disc of its own so that it reads over anything.
 * @param {CanvasRenderingContext2D} c
 * @param {number} x
 * @param {number} y
 */
function drawKey(c, x, y) {
  c.save();
  c.globalAlpha = 1;
  c.beginPath(); c.arc(x, y, 6.2, 0, Math.PI * 2);
  c.fillStyle = colors.keyDisc; c.fill();
  c.strokeStyle = colors.keyStroke; c.lineWidth = 1.4; c.lineCap = "round";
  c.beginPath(); c.arc(x - 2.4, y, 2, 0, Math.PI * 2); c.stroke();
  c.beginPath();
  c.moveTo(x - 0.4, y); c.lineTo(x + 4, y);
  c.moveTo(x + 2.2, y); c.lineTo(x + 2.2, y + 1.8);
  c.moveTo(x + 4, y); c.lineTo(x + 4, y + 1.8);
  c.stroke();
  c.restore();
}

/** Repaints the background canvas for the current view, camera and selection. Nothing before the map is laid out. */
export function paintBackground() {
  const layout = state.layout;
  if (!layout) return;
  const { k, x, y } = state.camera;
  const c = backgroundContext;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, backgroundCanvas.width, backgroundCanvas.height);
  setWorld(c, 0);
  const px = 1 / k; // one screen pixel, in world units

  // The circle of the brain, the bubbles.
  c.lineWidth = 1.5 * px;
  c.strokeStyle = colors.brainRing;
  c.beginPath(); c.arc(layout.center.x, layout.center.y, layout.center.r + 16, 0, Math.PI * 2); c.stroke();
  for (const b of layout.bubbles) {
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    c.fillStyle = colors.bubbleFill; c.fill();
    c.lineWidth = 1.2 * px; c.strokeStyle = colors.bubbleStroke; c.stroke();
  }
  for (const b of layout.subBubbles) {
    c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    c.fillStyle = colors.subBubbleFill; c.fill();
    c.lineWidth = px; c.strokeStyle = colors.subBubbleStroke; c.stroke();
  }
  // The executive floor: its skills and guards (executive.js).

  // NO LINE AT REST (2026-11-08): the ring says what is connected; a line only
  // appears when something happens (the live canvas).

  // The dust of the catalogue first, under the notes.
  if (state.dust.length) {
    /** @type {Map<string, import("./state.js").Dust[]>} */
    const byColor = new Map();
    for (const p of state.dust) {
      const color = p.contact ? CONTACT_COLOR : familyColor(toolById(p.tool), colors.unknown);
      const list = byColor.get(color);
      if (list) list.push(p); else byColor.set(color, [p]);
    }
    const r = Math.max(0.45, 0.9 * Math.min(1, 1.6 / Math.sqrt(k / state.baseScale)));
    for (const [color, points] of byColor) {
      // The contacts around the brain (2026-11-22): the more is exchanged with
      // someone, the bigger and brighter the dot (weight, arrange.js), in four
      // steps so each step stays one fill.
      for (let step = 0; step < 4; step++) {
        const these = points.filter((p) => Math.min(3, Math.floor((p.weight ?? 0) * 4)) === step);
        if (!these.length) continue;
        const rr = r * (1 + step * 0.7);
        c.fillStyle = color; c.globalAlpha = 0.38 + step * 0.17;
        c.beginPath();
        for (const p of these) { c.moveTo(p.x + rr, p.y); c.arc(p.x, p.y, rr, 0, Math.PI * 2); }
        c.fill();
      }
    }
    c.globalAlpha = 1;
  }

  // The dots, in batches of the same colour and the same brightness: one fill
  // per batch.
  /** @type {Map<string, [number, number, number][]>} */
  const batches = new Map();
  for (const n of state.notes) {
    const p = layout.at.get(n.id);
    if (!p) continue;
    // Every note at the same brightness: the "corpus" layer (sources,
    // publications, works) is no longer greyed, it holds the person's books.
    // With the Importance filter, the brightness follows the RANK of the note
    // (the weights are packed: half of them sit between 0.21 and 0.31): the
    // top 10 % shine, the rest fades; in steps of a tenth.
    const rank = state.weights ? state.weights.rank.get(n.id) ?? 0 : 0;
    const lit = state.weights ? Math.round((0.06 + 0.9 * rank ** 2.2) * 10) / 10 : 0.95;
    // THE PERIOD (2026-11-22): a note written or modified in it keeps its
    // colour and its brightness; one outside it nearly vanishes.
    const brightness = state.writtenSince && !state.writtenSince.slugs.has(n.id) ? Math.min(lit, 0.08) : lit;
    const key = `${domainColor(domainOf(n))}|${brightness}`;
    const size = layout.dotSize.get(layout.groupOf.get(n.id) ?? "") ?? 3;
    // The size follows the rank too: a dot of one or two pixels does not show its brightness.
    const scale = state.weights ? 0.5 + 2.2 * rank ** 3 : 1;
    const batch = batches.get(key);
    const dot = /** @type {[number, number, number]} */ ([p.x, p.y, ((size + 0.8) / 2) * scale]);
    if (batch) batch.push(dot); else batches.set(key, [dot]);
  }
  for (const [key, dots] of batches) {
    const [color, alpha] = key.split("|");
    c.fillStyle = color; c.globalAlpha = Number(alpha);
    c.beginPath();
    for (const [dx, dy, r] of dots) { c.moveTo(dx + r, dy); c.arc(dx, dy, r, 0, Math.PI * 2); }
    c.fill();
  }
  c.globalAlpha = 1;
  // The nature of a note (decision, feedback, lesson) is no longer drawn all
  // the time: the filters show it when asked.

  // The texts, at a constant size on the screen.
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  c.textAlign = "center";
  // The names of the biggest organizations around the brain (2026-11-22),
  // small, in the contacts colour, once the map is near enough to read them.
  if (state.showContacts && state.contactClusters.length && k / (state.baseScale || k) > 1.6) {
    c.font = `600 9.5px ${colors.font}`;
    for (const g of state.contactClusters) {
      const e = toScreen(g);
      writeText(c, g.label, e.x, e.y, inkOf(CONTACT_COLOR));
    }
  }
  // NAMES THAT DO NOT OVERLAP (2026-11-21). Small neighbouring bubbles wrote
  // their names over each other in the middle of the map ("PERSO", "ART",
  // "TECH"...). The biggest bubbles are named first; a name that would touch
  // one already written first drops its number, then moves up a line or down
  // into its bubble, and as a last resort waits for a closer zoom.
  /** @type {{ x: number, y: number, w: number }[]} the boxes already written, centred on their line */
  const written = [];
  const LINE = 14;
  const touches = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w) => written.some((o) => x < o.x + o.w + 6 && x + w + 6 > o.x && Math.abs(y - o.y) < LINE);
  for (const b of [...layout.bubbles].sort((a, z) => z.r - a.r)) {
    const e = toScreen({ x: b.x, y: b.y - b.r });
    // The name in capitals and, after it, much smaller, the number of notes.
    const nameFont = `700 ${b.r * k > 70 ? 13 : 11}px ${colors.displayFont}`;
    const countFont = `400 9px ${colors.font}`;
    const name = shorten(b.name, 34).toUpperCase();
    const count = ` ${b.n}`;
    c.font = nameFont;
    const nameWidth = c.measureText(name).width;
    c.font = countFont;
    const countWidth = c.measureText(count).width;
    /** @type {{ y: number, withCount: boolean } | null} */
    let spot = null;
    for (const [dy, withCount] of /** @type {[number, boolean][]} */ ([[0, true], [0, false], [-LINE, false], [2 * LINE, false], [-2 * LINE, false], [3 * LINE, false]])) {
      const w = nameWidth + (withCount ? countWidth : 0);
      if (!touches(e.x - w / 2, e.y + dy, w)) { spot = { y: e.y + dy, withCount }; break; }
    }
    if (!spot) { b.nameBox = undefined; continue; }
    const width = nameWidth + (spot.withCount ? countWidth : 0);
    const x0 = e.x - width / 2;
    written.push({ x: x0, y: spot.y, w: width });
    b.nameBox = { x: x0, y: spot.y, width };
    c.textAlign = "left";
    c.font = nameFont;
    writeText(c, name, x0, spot.y - 7, colors.bubbleName);
    if (spot.withCount) {
      c.font = countFont;
      writeText(c, count, x0 + nameWidth, spot.y - 7, colors.bubbleCount);
    }
    c.textAlign = "center";
  }
  c.font = `10px ${colors.font}`;
  for (const b of layout.subBubbles) {
    if (b.r * k < 34) continue;
    const e = toScreen({ x: b.x, y: b.y - b.r });
    writeText(c, `${b.name.toUpperCase()} · ${b.n}`, e.x, e.y + 14, colors.subBubbleName);
  }
  // This background is painted for this selection, titles written or not:
  // noted here, outside the test, else the live canvas believes it is stale
  // and repaints it at every frame.
  state.paintedSelection = state.selection;
  // The titles, from close enough.
  if (k / state.baseScale >= TITLES_FROM) {
    /** @type {[import("./state.js").Note, import("./state.js").Point][]} */
    const inside = [];
    for (const n of state.notes) {
      const p = layout.at.get(n.id);
      if (!p) continue;
      const e = toScreen(p);
      if (e.x < -50 || e.y < -20 || e.x > state.width + 50 || e.y > state.height + 20) continue;
      inside.push([n, e]);
    }
    inside.sort((a, b) => b[0].degree - a[0].degree);
    c.textAlign = "left";
    for (const [n, e] of inside.slice(0, TITLES_MAX)) {
      if (n.id === state.selection) continue; // written in yellow by the live canvas
      c.font = `11px ${colors.font}`;
      writeText(c, shorten(n.title, 46), e.x + 6, e.y + 3.5, colors.title);
    }
  }
  // The ring of tools: here on the flat map; in the Executive view the floors
  // place it themselves (executive.js), on the floor they choose.
  paintRing(c, 0);
  // The executive floor, above the knowledge floor (executive.js).
  if (crownShown()) paintUpperFloor(c);
  // The ring of a hovered skill follows the map (executive.js).
  placePieceRing();
}

/**
 * The ring of tools and the arcs of its sectors, on a floor (0 the knowledge;
 * the Executive view may set it on the floor of the tools, -1, or on the
 * executive floor, 1). Screen pixels, upright texts.
 * @param {CanvasRenderingContext2D} c @param {number} [floor]
 */
export function paintRing(c, floor = 0) {
  const layout = state.layout;
  if (!layout) return;
  const { k } = state.camera;
  c.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  // The sectors: a discreet arc between the brain and the ring, and their name outside.
  const center = toScreen(layout.center, floor);
  for (const arc of state.sectors) {
    const color = SECTORS[arc.sector]?.color ?? colors.mark;
    const arcRadius = (layout.center.r + RING_GAP - 24) * k;
    c.globalAlpha = 0.35; c.strokeStyle = color; c.lineWidth = 1.5;
    c.beginPath(); c.ellipse(center.x, center.y, arcRadius, arcRadius * squash(), 0, arc.start + turn(), arc.end + turn()); c.stroke();
    // The sector's name, outside: beyond the longest tool name near the middle
    // of the sector, with some air.
    const middle = (arc.start + arc.end) / 2 + turn();
    c.font = `600 10.5px ${colors.font}`;
    let longest = 0;
    for (const place of state.toolPlaces) {
      if (place.sector !== arc.sector) continue;
      let gap = Math.abs(place.angle - middle) % (Math.PI * 2);
      if (gap > Math.PI) gap = Math.PI * 2 - gap;
      if (gap > 0.5) continue;
      const tool = toolById(place.id);
      if (tool) longest = Math.max(longest, c.measureText(ringName(tool, place.small)).width);
    }
    const nameRadius = (layout.center.r + RING_GAP) * k + 23 + longest + 8;
    const cos = Math.cos(middle), sin = Math.sin(middle);
    c.globalAlpha = 0.9;
    c.font = `700 16px ${colors.displayFont}`;
    c.letterSpacing = "3px";
    c.textAlign = cos > 0.35 ? "left" : cos < -0.35 ? "right" : "center";
    c.textBaseline = sin < -0.35 ? "bottom" : sin > 0.35 ? "top" : "middle";
    // (Not with the crown of the harnesses: it stands where the name would be.)
    if (!crownShown()) writeText(c, t("sectorName", arc.sector).toUpperCase(), center.x + cos * nameRadius, center.y + sin * (nameRadius - 23 - longest - 8) * squash() + sin * (23 + longest + 8), inkOf(color));
    c.letterSpacing = "0px";
    c.globalAlpha = 1;
  }
  // The ring of tools.
  for (const place of state.toolPlaces) {
    const tool = toolById(place.id);
    if (!tool) continue;
    const color = familyColor(tool);
    const e = toScreen(place, floor);
    // An unfolded child: a discreet thread to its parent.
    if (place.parent) {
      const parent = toolPlace(place.parent);
      if (parent) {
        const ep = toScreen(parent, floor);
        c.globalAlpha = 0.3; c.strokeStyle = color; c.lineWidth = 1;
        c.beginPath(); c.moveTo(ep.x, ep.y); c.lineTo(e.x, e.y); c.stroke();
        c.globalAlpha = 1;
      }
    }
    // A disconnected tool (health check): greyed and struck through, its card says why.
    const connected = (tool.in || tool.out) && !tool.disconnected;
    const R = place.small ? 8 : 11;
    // A tool with several databases, folded: its databases as a cluster of
    // small circles on the side of the brain, to say that it opens.
    if (tool.children?.length && !state.openTools.has(tool.id) && place.id === tool.id) {
      const n = Math.min(tool.children.length, 7);
      for (let j = 0; j < n; j++) {
        const a = place.angle + Math.PI + (j - (n - 1) / 2) * 0.42;
        const rr = R + 5 + (j % 2) * 3.5;
        c.beginPath(); c.arc(e.x + Math.cos(a) * rr, e.y + Math.sin(a) * rr, 2.6, 0, Math.PI * 2);
        c.fillStyle = colors.disc; c.fill();
        c.globalAlpha = 0.9; c.strokeStyle = color; c.lineWidth = 1.2; c.stroke(); c.globalAlpha = 1;
      }
    }
    c.beginPath(); c.arc(e.x, e.y, R, 0, Math.PI * 2);
    c.fillStyle = colors.disc; c.fill();
    c.lineWidth = connected ? 2.2 : 1.2; c.strokeStyle = color; c.globalAlpha = connected ? 1 : 0.6; c.stroke();
    // THE EDGE RING (2026-11-08): a ring that fills up until the next run of
    // its sources; dotted if it waits for the vault.
    // While one of its sources works, the breathing says the activity: the
    // ring of the next run disappears until it is done.
    // A catch-up shows even while it works: it is its progress.
    const planned = state.nextRuns[place.id];
    const next = planned?.catchUp ? planned : state.running.has(place.id) ? null : planned;
    if (next) {
      const rr = R + 3.5;
      c.globalAlpha = 0.18; c.lineWidth = 2; c.strokeStyle = color;
      c.beginPath(); c.arc(e.x, e.y, rr, 0, Math.PI * 2); c.stroke();
      if (next.catchUp || next.due) {
        const u = next.catchUp ? Math.max(0.02, next.catchUp.done / Math.max(1, next.catchUp.total)) : Math.max(0.02, Math.min(1, (Date.now() - next.start) / Math.max(1, (next.due ?? 0) - next.start)));
        c.globalAlpha = 0.9; c.lineWidth = 2;
        c.beginPath(); c.arc(e.x, e.y, rr, -Math.PI / 2, -Math.PI / 2 + u * Math.PI * 2); c.stroke();
      } else {
        c.setLineDash([2, 3]); c.globalAlpha = 0.8;
        c.beginPath(); c.arc(e.x, e.y, rr, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
      }
      c.globalAlpha = 1;
    }
    c.globalAlpha = connected ? 1 : 0.6;
    const logo = state.logos[tool.id];
    if (logo && "image" in logo && logo.round) {
      // An app icon: cut into a disc, just inside the circle.
      c.save();
      c.beginPath(); c.arc(e.x, e.y, R - 2, 0, Math.PI * 2); c.clip();
      c.drawImage(logo.image, e.x - (R - 2), e.y - (R - 2), 2 * (R - 2), 2 * (R - 2));
      c.restore();
    } else if (logo && "image" in logo) {
      const side = 14;
      c.drawImage(logo.image, e.x - side / 2, e.y - side / 2, side, side);
    } else if (logo) {
      c.save();
      const side = 13; // the side of the logo, in pixels
      c.translate(e.x - side / 2, e.y - side / 2);
      c.scale(side / 24, side / 24);
      c.fillStyle = logoColor(logo.hex);
      c.fill(logo.path);
      c.restore();
    } else {
      c.font = `700 8.5px ${colors.font}`;
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = color; c.fillText(initials(tool.name), e.x, e.y + 0.5);
    }
    // Its other roles: one dot per role, in the colour of that sector, set on
    // the edge of the circle, on the side of the brain.
    // (Counted from the sector of this place: a tool drawn in both has, in each, the dot of the other.)
    const others = (tool.roles ?? []).filter((r) => r !== place.sector && SECTORS[r]); // an unknown role does not break the map
    others.forEach((r, j) => {
      const a = place.angle + Math.PI + (j - (others.length - 1) / 2) * 0.9 + (others.length === 1 ? 0.55 : 0);
      c.globalAlpha = 1;
      c.beginPath(); c.arc(e.x + Math.cos(a) * R, e.y + Math.sin(a) * R, 3.4, 0, Math.PI * 2);
      c.fillStyle = SECTORS[r]?.color ?? colors.mark; c.fill();
      c.strokeStyle = colors.disc; c.lineWidth = 1.5; c.stroke();
    });
    if (tool.disconnected) {
      c.globalAlpha = 0.9; c.strokeStyle = colors.struck; c.lineWidth = 2;
      c.beginPath(); c.moveTo(e.x - R * 0.8, e.y + R * 0.8); c.lineTo(e.x + R * 0.8, e.y - R * 0.8); c.stroke();
    }
    c.globalAlpha = 1;
    // A SMALL KEY BESIDE THE TOOL (2026-11-21): one of its sources needs a key
    // and waits for the vault to be opened. A wait, not a failure: drawn in
    // the colour of waiting, beside the circle along the ring (the name is
    // outside, the dots of the other roles inside), never over the logo.
    if (planned?.vault) drawKey(c, e.x + Math.cos(place.angle - Math.PI / 2) * (R + 9), e.y + Math.sin(place.angle - Math.PI / 2) * (R + 9));
    // The name along the radius: two neighbours never overlap.
    // (Along the radius as the screen shows it: on the tilted floors it is not the world's angle.)
    const angle = screenAngle(place);
    const left = Math.cos(angle) < 0;
    c.save();
    const nameOffset = place.small ? 18 : 23; // beyond the ring of the next run
    c.translate(e.x + Math.cos(angle) * nameOffset, e.y + Math.sin(angle) * nameOffset);
    c.rotate(angle + (left ? Math.PI : 0));
    c.textAlign = left ? "right" : "left";
    c.textBaseline = "middle";
    // The names of the ring that an open second arc covers fade for as long as it is open.
    const covered = !place.small && state.openArcs.some((arc) => arc.parent !== place.id && place.angle >= arc.min && place.angle <= arc.max);
    if (covered) c.globalAlpha = 0.15;
    c.font = `${connected ? 600 : 400} ${place.small ? 9.5 : 10.5}px ${colors.font}`;
    const name = ringName(tool, place.small);
    place.nameWidth = c.measureText(name).width;
    // (The chosen one in the colour of the selection; on the cream, in black over a yellow marker.)
    if (tool.id === state.chosenTool) writeText(c, name, 0, 0, colors.selectionText, colors.selectionTextEdge ?? undefined, colors.selectionTextEdge ? 5 : undefined);
    else writeText(c, name, 0, 0, connected ? colors.toolName : colors.toolNameOff);
    c.restore();
  }
  c.textBaseline = "alphabetic";
}
