// stream.js: what the server says while the page is open (GET /api/stream):
// the notes read and written, the ends of answers, the sources that start
// and end, and the moments when the tools, the map or the territories must
// be read again.

import { updateActivity } from "./activity.js";
import { openStream } from "./api.js";
import { arrange } from "./arrange.js";
import { loadCatalogue, loadContacts, loadMap, loadNext, loadTerritories, loadTools } from "./data.js";
import { showSeedsCount } from "./filters.js";
import { staleIndex } from "./index-page.js";
import { loadJudges } from "./judges.js";
import { drawSetup, loadSetup } from "./setup.js";
import { paintBackground } from "./paint-background.js";
import { paint, paintLive } from "./paint-live.js";
import { state } from "./state.js";
import { toolCardMoved } from "./tool-card.js";
import { skillsUsed } from "./executive.js";

/** The page keeps half an hour of activity, four hundred events at most. */
const KEPT_MS = 30 * 60_000;
const KEPT = 400;

/** Opens the stream and applies each event to the state and to the screen. */
export function connect() {
  openStream({
    // EACH EVENT ONCE (2026-11-21, audit 11). At every connection the server
    // sends again the reads and the writes of the last two minutes: a page
    // whose stream was cut and came back to the same server (a restart that
    // did not go through) kept both copies, and counted and drew them twice.
    // What the page already holds is left out as it arrives.
    reads(all) {
      const held = new Set(state.reads.map((read) => `${read.at}|${read.slug}|${read.conv}`));
      const fresh = all.filter((read) => !held.has(`${read.at}|${read.slug}|${read.conv}`));
      if (!fresh.length) return;
      state.reads.push(...fresh);
      const limit = Date.now() - KEPT_MS;
      state.reads = state.reads.filter((read) => Date.parse(read.at) >= limit).slice(-KEPT);
      updateActivity();
      paintLive();
    },
    writes(all) {
      const held = new Set(state.writes.map((write) => `${write.at}|${write.slug}`));
      const fresh = all.filter((write) => !held.has(`${write.at}|${write.slug}`));
      if (!fresh.length) return;
      state.writes.push(...fresh);
      // The card of the tool that has just written follows (tool-card.js).
      if (fresh.some((write) => write.tool && Date.now() - Date.parse(write.at) < 5000)) toolCardMoved(fresh.map((write) => write.tool));
      // Only a write that has just arrived lights up its tool: those the
      // server sends again when the page opens (the last two minutes) are past.
      for (const write of fresh) if (write.tool && Date.now() - Date.parse(write.at) < 5000) state.running.set(write.tool, { start: Date.now(), end: Date.now() + 1600 });
      if (state.writtenSince) for (const write of fresh) state.writtenSince.slugs.add(write.slug);
      const limit = Date.now() - KEPT_MS;
      state.writes = state.writes.filter((write) => Date.parse(write.at) >= limit).slice(-KEPT);
      updateActivity();
      paintLive();
    },
    // A skill the AI starts: it lights up in the crown of the harnesses (executive.js).
    skills(list) {
      skillsUsed(list);
      // The activity panel lists them too (activity.js), each once.
      const held = new Set(state.skillUses.map((e) => `${e.at}|${e.skill}`));
      state.skillUses.push(...list.filter((e) => !held.has(`${e.at}|${e.skill}`)));
      state.skillUses = state.skillUses.filter((e) => Date.now() - Date.parse(e.at) < KEPT_MS).slice(-100);
      updateActivity();
      paintLive();
    },
    // The end of an answer of Claude: its trace goes out in three seconds.
    turns(ends) {
      for (const end of ends) {
        let list = state.turnEnds.get(end.session);
        if (!list) state.turnEnds.set(end.session, (list = []));
        list.push(end.at);
        if (list.length > 50) list.shift();
      }
      paintLive();
    },
    // The runs of the sources (the brain's journal): the start and the end of each.
    runs(signals) {
      setTimeout(loadNext, 1500);
      // A run that ends has spent tokens: a judge may have reached its cap.
      // (And a judge that found no key to call Claude says so at the end of its run.)
      if (signals.some((signal) => signal.state === "end")) setTimeout(() => { loadJudges(); loadSetup(); }, 1500);
      setTimeout(paintBackground, 0); // the ring of the next run disappears or comes back
      // The card of a tool one of whose sources starts or ends follows (tool-card.js).
      toolCardMoved(signals.flatMap((signal) => signal.tools ?? []));
      for (const signal of signals) {
        const at = Date.parse(signal.at) || Date.now();
        for (const id of signal.tools ?? []) {
          const run = state.running.get(id) ?? { start: at, end: null };
          if (signal.state === "start") { run.start = at; run.end = null; run.info = signal; } else { run.end = Math.max(at, Date.now()); run.outcome = signal; }
          state.running.set(id, run);
        }
      }
      paintLive();
    },
    // The server asks for a reload: a new version, or a page that came without
    // its token (the reload gives it its cookie). Once a minute at most: a
    // browser that keeps no cookie would otherwise reload without end.
    reload() {
      let last = 0;
      try { last = Number(sessionStorage.getItem("brain-reloaded")) || 0; } catch { last = 0; }
      if (Date.now() - last < 60_000) return;
      try { sessionStorage.setItem("brain-reloaded", String(Date.now())); } catch { /* without storage, it reloads all the same */ }
      location.reload();
    },
    version({ server }) {
      if (state.serverVersion && state.serverVersion !== server) location.reload();
      state.serverVersion = server;
    },
    // The connected tools changed: the circle is redone, and the index (which carries their names) with it.
    async tools() {
      try {
        await loadTools();
      } catch {
        return; // a silent server at that moment: the circle of before stays
      }
      arrange(true);
      staleIndex();
      // A source added or removed: what the brain lacks has changed too.
      loadSetup();
    },
    // THE MAP HAS JUST BEEN REBUILT: the notes changed, and with them maybe
    // the catalogue and the directory. It is the only moment when they are
    // read again (not at each read nor at each write), and when the index is
    // built again.
    async map() {
      try {
        await loadMap();
      } catch {
        return; // a silent server at that moment: the map of before stays
      }
      await loadCatalogue();
      if (state.contacts) await loadContacts(true);
      arrange();
      paint();
      staleIndex();
      // (The seeds left: a note validated elsewhere, a judge that wrote new ones.)
      showSeedsCount();
      // The first note of a brain: the notice in the middle of the map leaves.
      drawSetup();
    },
    // A judge was capped for the day, holds its pile, or was answered (here or in another window).
    judges() {
      loadJudges();
      loadNext();
    },
    // An AI has just proposed the name of territories that had none.
    async territories() {
      await loadTerritories();
      if (state.view === "semantic" && state.layout) { arrange(); paint(); }
    },
  });
}
