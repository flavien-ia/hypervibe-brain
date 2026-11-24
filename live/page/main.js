// main.js: the live view of the brain, started.
//
// The page is plain files, loaded as modules, with no library and no build
// step. Each module has one responsibility:
//
//   lang.js, i18n.js, i18n/   the person's language, the texts in it
//   storage.js                what this browser remembers
//   dom.js, format.js         reaching the elements; writing texts, numbers, dates
//   api.js                    everything asked to the server (contract.d.ts)
//   state.js                  what the page knows at a given moment
//   theme.js                  the two designs (the night, Hypervibe), and the colours the canvases paint
//   icones-hypervibe.js       the icons of the Hypervibe design, put beside the night's ones
//   map.js                    where everything sits on the map (pure computation)
//   arrange.js                the map arranged for the current view and layers
//   canvas.js, paint-background.js, paint-live.js   the two canvases
//   camera.js, pointer.js     the framing; the hand on the map
//   data.js, stream.js        what is read at start; what arrives afterwards
//   panel.js, note-card.js, tool-card.js            the cards on the right
//   search.js, filters.js, activity.js              the search, the filters box, the activity panel
//   usage.js, settings.js, index-page.js, legend.js the four full pages
//   judges.js                 where the judges stand; the judge that waits for an answer
//   setup.js                  what the brain still lacks, said where it shows
//   build.js                  where the building of the brain stands, while /brain:start goes on
//   shortcuts.js, install.js, tooltip.js, modal.js  the keys, the app, the tooltip, the dialogs
//
// Nothing is put on `window`: what a module needs from another, it imports.

import "./tooltip.js";
import { startIcons } from "./icones-hypervibe.js";
import { setUpActivity, updateActivity, updateUsageToday } from "./activity.js";
import { accessRefused } from "./api.js";
import { arrange } from "./arrange.js";
import { setUpBuild } from "./build.js";
import { resize, setUpRecenter } from "./camera.js";
import { loadCatalogue, loadMap, loadNext, loadTools } from "./data.js";
import { $ } from "./dom.js";
import { restoreLayers, setUpFilterBox } from "./filters.js";
import { startLanguage, t } from "./i18n.js";
import { setUpIndex } from "./index-page.js";
import { linkManifest, setUpInstall } from "./install.js";
import { setUpLayout } from "./layout.js";
import { drawHeld, loadJudges, setUpJudges } from "./judges.js";
import { language } from "./lang.js";
import { setUpLegend } from "./legend.js";
import { setUpNoteCard } from "./note-card.js";
import { paint } from "./paint-live.js";
import { setUpPanel } from "./panel.js";
import { setUpFloors } from "./executive.js";
import { setUpPointer } from "./pointer.js";
import { setUpSearch } from "./search.js";
import { setUpSettings } from "./settings.js";
import { drawSetup, loadSetup } from "./setup.js";
import { setUpShortcuts } from "./shortcuts.js";
import { state } from "./state.js";
import { takeOverFormerKeys } from "./storage.js";
import { connect } from "./stream.js";
import { loadFonts, onThemeChange, setUpThemeSwitch } from "./theme.js";
import { refreshToolCard, setUpToolCard } from "./tool-card.js";
import { setUpUsage } from "./usage.js";

takeOverFormerKeys();
// The language first: the one of the last visit, at once; at the very first
// visit, the server is asked before anything is worded.
const startedIn = await startLanguage();
linkManifest();

setUpPanel();
setUpNoteCard();
setUpToolCard();
setUpPointer();
setUpFloors();
setUpSearch();
setUpShortcuts();
setUpFilterBox();
setUpThemeSwitch();
// The icons of the design system, on the Hypervibe design only (2026-11-24).
startIcons();
// A CHANGE OF DESIGN REDRAWS THE MAP AT ONCE (2026-11-23), without reloading:
// the colours of the harnesses are worked out when the map is arranged.
// The fonts of the Hypervibe design come a moment later (2026-11-24): once
// they are there, the canvases are painted again in them.
const paintInFonts = () => loadFonts().then((loaded) => { if (loaded && state.layout) paint(); });
onThemeChange(() => { if (state.layout) { arrange(); paint(); } paintInFonts(); });
setUpUsage();
setUpSettings();
// The fixed panels of the map, placed so that none covers another (2026-11-24).
setUpLayout();
setUpLegend();
setUpIndex();
setUpActivity();
setUpRecenter();
setUpInstall();
setUpJudges();
// Every thirty seconds: when the sources run next, where the judges stand
// (a judge answered from a terminal no longer waits, and nothing says so),
// and what the brain still lacks (a hub turned on or stopped says nothing either).
// (And the card of a tool left open, which follows what its sources do: tool-card.js.)
setInterval(() => { loadNext(); loadJudges(); loadSetup(); refreshToolCard(); }, 30_000);

/** Loads the brain, draws it, then listens to what happens. */
async function start() {
  try {
    await Promise.all([loadMap(), loadTools(), loadCatalogue()]);
    // THE MAP FIRST (2026-11-18). The opening took six seconds on a real
    // brain, four of them spent by the server on what the map does not need:
    // it answers one question at a time, and these were asked before the map.
    // What the brain lacks and where the judges stand are asked once the map
    // is read; each draws itself when it arrives.
    loadSetup();
    loadJudges();
    setUpBuild();
  } catch {
    // The server does not answer: say so rather than spin for ever.
    // IT TRIES AGAIN (2026-11-21, audit 18). One route that failed while the
    // page opened left "The brain does not answer" on the screen until
    // someone reloaded by hand, and the stream was never opened. The loading
    // is tried again every five seconds; the veil leaves as soon as it works.
    // (A page the server refused for lack of its token says so: trying again
    // would change nothing, reloading gives it its token.)
    $("#loading p").textContent = accessRefused() ? t("accessRefused") : t("loadFailed");
    $("#loading").classList.add("failed");
    if (!accessRefused()) setTimeout(start, 5000);
    return;
  }
  $("#loading").classList.remove("failed");
  // The map came in another language than the page started in (data.js took
  // it): what was already worded is worded again.
  if (language() !== startedIn) {
    linkManifest();
    if (!$("#activity").classList.contains("folded")) updateUsageToday();
    drawHeld();
  }
  // The map is read: an empty one says so in its middle.
  drawSetup();
  arrange();
  resize();
  addEventListener("resize", resize);
  // A hidden window: nothing to paint; when it comes back, the page catches up.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) paint(); });
  updateActivity();
  connect();
  restoreLayers();
  paintInFonts();
  // The map is painted: the veil fades out.
  // (A timer rather than a frame: a hidden window draws nothing, and the veil would stay.)
  setTimeout(() => {
    $("#loading").classList.add("done");
    setTimeout(() => $("#loading").remove(), 500);
  }, 30);
}

start();
