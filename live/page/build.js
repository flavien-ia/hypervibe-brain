// build.js: the building of the brain, shown while /brain:start goes on
// (2026-11-23).
//
// The start builds the brain part after part: the brain itself, the tools
// that feed it, the knowledge that comes in, the executive floor, the life of
// the brain. The live view opens with the second part and stays open for the
// rest: this panel, at the top right, says where the building stands, and for
// the knowledge each block with its total counted first, then what is in, what
// is left, and how many notes it added. It reads GET /api/start (the plugin's
// start.mjs state, trimmed by the server): every five seconds while the start
// goes on, every thirty seconds otherwise, a question the server answers
// without starting anything when no start was ever begun. It shows only during
// a real start (start.mjs: not finished, and used lately), leaves when the start
// is finished, and the person can fold it or hide it for this start (the page
// remembers both).

import { attempt, getStart } from "./api.js";
import { $ } from "./dom.js";
import { escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { recall, remember } from "./storage.js";

/** @typedef {import("../contract.d.ts").StartResponse} StartResponse */
/** @typedef {import("../contract.d.ts").StartBlock} StartBlock */

const box = $("#build");
/** What was written last: the panel is written again only when it changes. */
let shown = "";
/** @type {ReturnType<typeof setTimeout> | undefined} */
let again;
/** @type {StartResponse | null} what the server said last */
let last = null;

/** The states a part, a step or a block may be in, as the plugin says them. @param {string} s */
const word = (s) => t("buildState", s);

/** One block of the knowledge: its name, then its figures. @param {StartBlock} b @param {string | null} next */
function blockLine(b, next) {
  const p = b.progress;
  const figures = !p ? "" : p.total === null ? t("buildNotCounted") : t("buildFigures", p.done, p.total, p.left, p.notes, p.unit);
  const s = b.id === next && (b.state === "todo" || b.state === "later") ? "now" : b.state;
  const bar = p && p.total ? `<span class="build-bar"><i style="width:${Math.round((Math.min(p.done, p.total) / p.total) * 100)}%"></i></span>` : "";
  return `<li class="build-block is-${escapeHtml(s)}"><span class="build-name">${escapeHtml(t("buildBlock", b.id))}</span><span class="build-state">${escapeHtml(word(s))}</span>${figures ? `<small>${escapeHtml(figures)}</small>` : ""}${bar}</li>`;
}

/** The start whose panel the person hid: its date of beginning. */
const hiddenKey = (/** @type {StartResponse} */ s) => s.began ?? "start";

/** The panel, from what the server said. @param {StartResponse | null} s */
function draw(s) {
  const on = Boolean(s && s.ok && s.underway && recall("build-hidden") !== hiddenKey(s));
  last = s;
  const html = !on || !s ? "" : body(s);
  box.hidden = !on;
  if (html === shown) return;
  shown = html;
  box.innerHTML = html;
}

/** @param {StartResponse} s */
function body(s) {
  const parts = s.parts ?? [];
  const done = parts.filter((p) => p.state === "done" || p.state === "na").length;
  const folded = box.classList.contains("folded");
  const rows = parts.map((p) => {
    const st = p.id === s.part && p.state !== "done" ? "now" : p.state;
    const blocks = p.id === "knowledge" && (st === "now" || st === "running" || p.state === "done") ? `<ul class="build-blocks">${(s.blocks ?? []).map((b) => blockLine(b, s.next)).join("")}</ul>` : "";
    return `<li class="build-part is-${escapeHtml(st)}"><span class="build-mark" aria-hidden="true"></span><span class="build-name">${escapeHtml(t("buildPart", p.id))}</span><span class="build-state">${escapeHtml(word(st))}</span>${blocks}</li>`;
  }).join("");
  const now = s.paused ? `<p class="build-now"><b>${escapeHtml(t("buildPaused"))}</b>${s.paused.note ? ` ${escapeHtml(s.paused.note)}` : ""}</p>` : s.doing ? `<p class="build-now"><b>${escapeHtml(t("buildDoing"))}</b> ${escapeHtml(s.doing)}</p>` : "";
  return `<button type="button" id="build-toggle" aria-expanded="${folded ? "false" : "true"}" data-tip="${escapeHtml(t(folded ? "buildUnfold" : "buildFold"))}"><span>${escapeHtml(t("buildTitle"))}</span><span class="build-count">${escapeHtml(t("buildCount", done, parts.length))}</span><span class="chevron" aria-hidden="true"></span></button><button type="button" id="build-hide" aria-label="${escapeHtml(t("buildHide"))}" data-tip="${escapeHtml(t("buildHide"))}">×</button><div id="build-body">${now}<ol class="build-parts">${rows}</ol></div>`;
}

/** Reads where the start stands, draws it, and asks again: soon while it goes on, seldom otherwise. */
export async function loadStart() {
  clearTimeout(again);
  const s = /** @type {StartResponse | null} */ (await attempt(getStart()));
  // (A silent server keeps what was shown.)
  if (s) draw(s);
  again = setTimeout(loadStart, s?.underway ? 5000 : 30_000);
}

/** Wires the panel: its fold, remembered. */
export function setUpBuild() {
  if (recall("build-folded") === "1") box.classList.add("folded");
  box.addEventListener("click", (ev) => {
    const target = /** @type {Element | null} */ (ev.target);
    // Hidden for this start: a new start shows it again.
    if (target?.closest?.("#build-hide")) {
      if (last) remember("build-hidden", hiddenKey(last));
      box.hidden = true;
      return;
    }
    if (!target?.closest?.("#build-toggle")) return;
    const folded = box.classList.toggle("folded");
    remember("build-folded", folded ? "1" : "0");
    const toggle = $("#build-toggle");
    toggle.setAttribute("aria-expanded", folded ? "false" : "true");
    toggle.dataset.tip = t(folded ? "buildUnfold" : "buildFold");
    shown = box.innerHTML;
  });
  loadStart();
}
