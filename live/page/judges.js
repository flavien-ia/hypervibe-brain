// judges.js: where the judges stand, and the judge that waits for the person.
//
// A judge whose pile grew too big at once does not read it without asking: it
// is HELD until the person says what to do (read everything, only the most
// recent ones, or none). That question must be seen without being looked for:
// it shows on the activity panel (folded included), in the judge's settings
// and beside its cost on the usage page. The three places are "slots" this
// module fills, and one listener answers their buttons.
//
//   <div class="held-slot" data-judge="<name>"></div>

import { answerCatchUp, attempt, getJudges } from "./api.js";
import { loadNext } from "./data.js";
import { $, $all, closest } from "./dom.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { askDialog, confirmDialog } from "./modal.js";
import { state } from "./state.js";

/** @typedef {import("../contract.d.ts").JudgeCost} JudgeCost */
/** @typedef {import("../contract.d.ts").CatchUpAnswer} CatchUpAnswer */

/** What to say in a judge's slots for a few seconds: its answer was taken, or why it was not. @type {Map<string, { text: string, failed: boolean }>} */
const notes = new Map();

/** What else is drawn again when the judges' state changes (the usage page: where each judge stands today). @type {Set<() => void>} */
const followers = new Set();
/** Asks to be called each time the judges' state is drawn. @param {() => void} draw */
export const onJudgesDrawn = (draw) => void followers.add(draw);

/** A slot for the held state of one judge: empty until the judge is held. @param {string} name */
export const heldSlot = (name) => `<div class="held-slot" data-judge="${escapeHtml(name)}"></div>`;

/** The box of a held judge: what waits, and the three answers. @param {JudgeCost} judge */
function heldBox(judge) {
  const held = judge.held;
  if (!held) return "";
  const button = (/** @type {CatchUpAnswer} */ answer, /** @type {string} */ label) => `<button type="button" class="held-action" data-judge="${escapeHtml(judge.name)}" data-answer="${answer}">${escapeHtml(label)}</button>`;
  return `<div class="held-box"><b>${escapeHtml(t("heldLine", judge.name, held.items, held.estimate))}</b><small>${escapeHtml(t("heldAsks", judge.name))}</small><div class="held-actions">${button("all", t("heldAll"))}${button("latest", t("heldLatest", judge.name))}${button("drop", t("heldDrop"))}</div></div>`;
}

/** Fills every slot of the page from the judges as last read, and the mark of the activity panel. */
export function drawHeld() {
  const held = state.judges.filter((judge) => judge.held);
  // The activity panel has one slot per held judge, at its top; folded, its
  // round icon grows into a line that says a judge waits.
  $("#activity-held").innerHTML = [...new Set([...held.map((judge) => judge.name), ...notes.keys()])].map(heldSlot).join("");
  $("#activity").classList.toggle("has-held", held.length > 0);
  const first = held[0]?.held;
  $("#activity-alert").textContent = !first ? "" : held.length > 1 ? t("heldShortMany", held.length) : t("heldShort", held[0].name, first.items);
  for (const slot of $all(".held-slot")) {
    const name = slot.dataset.judge ?? "";
    const judge = state.judges.find((x) => x.name === name);
    const note = notes.get(name);
    slot.innerHTML = (judge ? heldBox(judge) : "") + (note ? `<p class="held-note${note.failed ? " failed" : ""}">${escapeHtml(note.text)}</p>` : "");
  }
  for (const draw of followers) draw();
}

/** Reads where the judges stand (without their runs), then fills the slots. A silent server keeps what was known. */
export async function loadJudges() {
  // (Only the runs from now on are asked for: none.)
  const answer = await attempt(getJudges(new Date().toISOString()));
  if (Array.isArray(answer?.judges)) state.judges = answer.judges;
  drawHeld();
}

/**
 * Says something in a judge's slots, for a few seconds.
 * @param {string} name
 * @param {string} text
 * @param {boolean} [failed]
 */
function say(name, text, failed = false) {
  const note = { text, failed };
  notes.set(name, note);
  drawHeld();
  setTimeout(() => {
    if (notes.get(name) !== note) return;
    notes.delete(name);
    drawHeld();
  }, 6000);
}

/**
 * The person answers a held judge: a dialog says what will happen, then the
 * box leaves at once; the server follows, and if it refuses, the box comes
 * back with the reason.
 * @param {string} name the judge
 * @param {CatchUpAnswer} answer
 */
async function answerHeld(name, answer) {
  const judge = state.judges.find((x) => x.name === name);
  const held = judge?.held;
  if (!judge || !held) return;
  /** @type {number | undefined} */
  let n;
  if (answer === "all") {
    if (!(await confirmDialog({ title: t("heldAllTitle"), text: t("heldAllText", name, held.items, held.estimate, judge.dailyTokens), yes: t("heldAll") }))) return;
  } else if (answer === "drop") {
    if (!(await confirmDialog({ title: t("heldDropTitle"), text: t("heldDropText", name, held.items, held.estimate), yes: t("heldDrop") }))) return;
  } else {
    const typed = await askDialog({ title: t("heldLatestTitle", name), text: t("heldLatestText", name), value: String(Math.min(10, held.items)), number: { min: 1, max: held.items }, yes: t("heldLatestYes") });
    if (typed === null) return;
    // What was typed, brought back between one and everything that waits.
    n = Math.min(held.items, Math.max(1, Math.round(Number(typed)) || 0));
  }
  // (The judges may have been read again while the dialog was open: the one of now is changed.)
  const put = (/** @type {JudgeCost["held"]} */ value) => {
    const current = state.judges.find((x) => x.name === name);
    if (current) current.held = value;
  };
  put(null);
  notes.delete(name);
  drawHeld();
  const said = await attempt(answerCatchUp(name, answer, n));
  if (said?.ok) {
    say(name, t("heldDone", answer, said.kept, said.dropped));
    loadNext();
    return void loadJudges();
  }
  // Refused, or a silent server: the question is still open, unless the server says the judge no longer waits.
  if (said?.code !== "not-held") put(held);
  say(name, t("notDone", said ? t("judgeRefusal", said.code) ?? said.error : t("judgeRefusal", "no-answer")), true);
  if (said?.code === "not-held") loadJudges();
}

/** Wires the answers of a held judge (one listener for every slot of the page), and reads where the judges stand. */
export function setUpJudges() {
  document.addEventListener("click", (ev) => {
    const button = closest(ev, ".held-action");
    if (!button) return;
    ev.preventDefault();
    answerHeld(button.dataset.judge ?? "", /** @type {CatchUpAnswer} */ (button.dataset.answer));
  });
}
