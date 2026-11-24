// setup.js: what the brain still lacks, said where it shows.
//
// THE EMPTY STATES (2026-11-17). A brain just created has no note, no source,
// no judge, and the program that runs the sources (the plugin's hub) is off:
// every page was then an empty box, or a circle with nothing in it. Each of
// these is now said in one or two plain sentences, followed by what to say to
// Claude to change it. The view never does it itself: it shows, Claude acts.
//
// One shape for all of them, the "notice":
//
//   <div class="notice"><p>what is the case</p><p class="say">Say to Claude: "..."</p></div>
//
// Where they show: in the middle of the map (no note, no source), in a line
// at the bottom of the map (a hub that should run, a judge without its key),
// and in the pages that would otherwise be empty (settings, usage, index, the
// card of a tool), which ask this module for their notice.

import { attempt, getSetup } from "./api.js";
import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { state } from "./state.js";

/** @typedef {import("./i18n/en.js").Dictionary} Dictionary */

/**
 * A notice: what is the case, then what to say to Claude.
 * @param {string} text one or two sentences
 * @param {string} say the words to say to Claude
 * @param {string} [kind] "warn" for something that should work and does not
 * @returns {string}
 */
export const notice = (text, say, kind = "") => `<div class="notice${kind ? ` ${kind}` : ""}"><p>${escapeHtml(text)}</p><p class="say">${t("sayToClaudeHtml", escapeHtml(say))}</p></div>`;

/** The brain has no note yet. */
export const emptyBrainNotice = () => notice(t("emptyBrain"), t("emptyBrainSay"));
/** No source feeds the brain. */
export const noSourceNotice = () => notice(t("noSource"), t("noSourceSay"));
/** No judge reads for the brain. */
export const noJudgeNotice = () => notice(t("noJudgeYet"), t("noSourceSay"));

/** Whether this brain has neither a source nor a judge (false until the server said). */
export const nothingFeeds = () => Boolean(state.setup && !state.setup.sources && !state.setup.judges);

/**
 * The hub does not run: said when it matters. On the computer that does not
 * run the brain's sources (a brain on two computers), it is as it should be.
 * @param {{ always?: boolean }} [how] `always`: even when nothing this brain declares needs it (the settings, where the rhythms are set)
 * @returns {string} the notice, or "" when there is nothing to say
 */
export function hubNotice({ always = false } = {}) {
  const hub = state.setup?.hub;
  if (!hub || hub.running || !hub.here || (!hub.needed && !always)) return "";
  // Turned on and not running is a stop (it starts again with the session); never turned on is a choice to make.
  return hub.on ? notice(t("hubStopped"), t("hubStoppedSay"), "warn") : notice(t("hubOff"), t("hubOffSay"), hub.needed ? "warn" : "");
}

/**
 * A judge whose last run found no key to call Claude.
 * @param {string} name the judge
 * @returns {string} the notice, or "" when this judge has its key (or never ran)
 */
export const tokenNotice = (name) => (state.setup?.noToken.includes(name) ? notice(t("noToken", name), t("noTokenSay"), "warn") : "");

/** What else is drawn again when the setup is read (an open page that shows one of these notices). @type {Set<() => void>} */
const followers = new Set();
/** Asks to be called each time the setup is drawn. @param {() => void} draw */
export const onSetupDrawn = (draw) => void followers.add(draw);

/** What the map shows right now, in its middle and at its bottom: written again only when it changes. */
const shown = { middle: "", bottom: "" };

/**
 * The notice in the middle of the map, while the map has nothing to draw: a
 * brain without a note; or the Semantic view of a brain whose notes have no
 * vector (the search by meaning is not on), where no note has a place.
 * Called each time the map is arranged (the notes and the view come with it,
 * not with the setup).
 */
export function drawMiddle() {
  const welcome = $("#welcome");
  const middle = !state.notes.length ? emptyBrainNotice() + (nothingFeeds() ? noSourceNotice() : "")
    : state.view === "semantic" && state.territories && !state.territories.territories?.length ? notice(t("noMeaning"), t("noMeaningSay"))
    : "";
  if (middle === shown.middle) return;
  shown.middle = middle;
  welcome.innerHTML = middle;
  welcome.hidden = !middle;
}

/** Writes the notices of the map from what the page knows: in its middle, and at its bottom. */
export function drawSetup() {
  drawMiddle();
  // At the bottom: what the person set up and that does not work.
  const bottom = hubNotice() + (state.setup?.noToken ?? []).map(tokenNotice).join("");
  const alerts = $("#alerts");
  if (bottom !== shown.bottom) {
    shown.bottom = bottom;
    alerts.innerHTML = bottom;
    alerts.hidden = !bottom;
  }
  for (const draw of followers) draw();
}

/** Reads what the brain lacks, then draws it. A silent server keeps what was known. */
export async function loadSetup() {
  const answer = await attempt(getSetup());
  if (answer && typeof answer === "object" && "hub" in answer) state.setup = answer;
  drawSetup();
}
