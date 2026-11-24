// activity.js: the panel at the bottom left: what the AIs are reading and
// writing in the brain right now, and what the day has cost. Folded, it is a
// round icon that lights up while an AI reads.

import { getSkillsUsed, getUsage } from "./api.js";
import { $, closest, pressable } from "./dom.js";
import { clockSeconds, conversationName, escapeHtml } from "./format.js";
import { t } from "./i18n.js";
import { chooseNote } from "./note-card.js";
import { FADE_MS, LIT_MS, conversationColor, familyColor, state, toolById } from "./state.js";
import { recall, remember } from "./storage.js";

/** @typedef {import("./state.js").ReadEvent} ReadEvent */
/** @typedef {import("./state.js").WriteEvent} WriteEvent */

/** How long a read counts in the panel: two minutes. */
const ALIVE_MS = LIT_MS + FADE_MS;
const activity = $("#activity");

/** What a brain tool did to a note, in one word: "open", "search"; else the tool's own name. @param {string} tool */
const gesture = (tool) => t("gesture", tool) ?? String(tool ?? "").replace(/^brain_/, "");

/** One line for a skill the AI started (2026-11-23): its name, and the conversation that started it. @param {import("../contract.d.ts").SkillUse} e */
function skillLine(e) {
  const who = e.convTitle || t("aConversation");
  return `<li class="skill-use" data-tip="${escapeHtml(t("skillStartedBy", who))}"><time>${clockSeconds(e.at)}</time><span class="skill-mark" aria-hidden="true">⚡</span><span class="title">/${escapeHtml(e.skill)}</span></li>`;
}

/** One line of the list: a read (a round dot, in the conversation's colour) or a write (a square one, in its tool's). @param {(ReadEvent & { kind: "read" }) | (WriteEvent & { kind: "write" })} l */
function line(l) {
  if (l.kind === "read") return `<li data-slug="${escapeHtml(l.slug)}" tabindex="0" role="button" data-tip="${escapeHtml(conversationName(l))}"><time>${clockSeconds(l.at)}</time><span class="gesture"><span class="dot" style="background:${conversationColor(l.conv)}"></span> ${escapeHtml(gesture(l.tool))}</span><span class="title">${escapeHtml(state.noteById.get(l.slug)?.title ?? state.dustByAddress.get(l.slug)?.title ?? l.slug)}</span></li>`;
  const tool = toolById(l.tool);
  return `<li data-slug="${escapeHtml(l.slug)}" tabindex="0" role="button" data-tip="${escapeHtml(tool ? t("arrivedBy", tool.name) : t("writeWithoutTool"))}"><time>${clockSeconds(l.at)}</time><span class="gesture"><span class="dot square" style="background:${familyColor(tool)}"></span> ${l.isNew ? t("newNote") : t("updatedNote")}</span><span class="title">${escapeHtml(l.title)}</span></li>`;
}

/** Rewrites the panel from the reads and the writes the page holds. */
export function updateActivity() {
  const now = Date.now();
  const alive = state.reads.filter((read) => now - Date.parse(read.at) <= ALIVE_MS);
  const notes = new Set(alive.map((read) => read.slug));
  /** @type {Map<string, ReadEvent>} conversation -> its latest read */
  const conversations = new Map();
  for (const read of alive) conversations.set(read.conv, read);
  activity.classList.toggle("is-live", notes.size > 0);
  $("#activity-count").textContent = notes.size ? t("readCount", notes.size, conversations.size) : t("noneRead");
  $("#conversations").innerHTML = [...conversations.values()].sort((a, b) => b.at.localeCompare(a.at))
    .map((read) => `<li><span class="dot" style="background:${conversationColor(read.conv)}"></span>${escapeHtml(conversationName(read))}</li>`).join("");
  // The activity: the reads and the writes, the most recent at the top.
  const all = [...state.reads.map((read) => ({ ...read, kind: /** @type {const} */ ("read") })), ...state.writes.map((write) => ({ ...write, kind: /** @type {const} */ ("write") })), ...state.skillUses.map((use) => ({ ...use, slug: `skill:${use.skill}`, kind: /** @type {const} */ ("skill") }))].sort((a, b) => a.at.localeCompare(b.at));
  const latest = [];
  const seen = new Set();
  for (let i = all.length - 1; i >= 0 && latest.length < 14; i--) {
    const l = all[i];
    if (seen.has(`${l.kind}|${l.slug}`)) continue;
    seen.add(`${l.kind}|${l.slug}`);
    latest.push(l);
  }
  $("#activity-list").innerHTML = latest.length ? latest.map((l) => (l.kind === "skill" ? skillLine(/** @type {any} */ (l)) : line(/** @type {any} */ (l)))).join("") : `<li class="empty">${t("nothingYet")}</li>`;
}

/** The usage of the day, in the panel: read again each time it opens, nothing runs all the time. */
export async function updateUsageToday() {
  const today = $("#usage-today");
  try {
    // Three figures: only the lines since midnight (local time) are asked for, not the whole journal.
    const midnight = new Date(new Date().setHours(0, 0, 0, 0));
    const lines = (await getUsage(midnight.toISOString())).filter((l) => Date.parse(l.at) >= midnight.getTime());
    const calls = lines.filter((l) => l.tool !== "(connection)").length;
    const tokens = lines.reduce((sum, l) => sum + (Number(l.tokIn) || 0), 0);
    const conversations = new Set(lines.map((l) => l.conv)).size;
    // The skills the AI started today (2026-11-23).
    let skills = 0;
    try {
      skills = (await getSkillsUsed(midnight.toISOString())).length;
    } catch {
      skills = 0;
    }
    today.textContent = [calls ? t("todayCalls", calls, conversations, tokens) : t("noCallsToday"), skills ? t("todaySkills", skills) : ""].filter(Boolean).join(" ");
  } catch {
    today.textContent = t("usageUnavailable");
  }
}

/** Wires the activity panel: its fold (remembered), its list, and its refresh every five seconds. */
export function setUpActivity() {
  // The panel folds; it remembers.
  if (recall("activity-folded") === "0") activity.classList.remove("folded");
  if (!activity.classList.contains("folded")) updateUsageToday();
  $("#activity-toggle").addEventListener("click", () => {
    const folded = activity.classList.toggle("folded");
    if (!folded) updateUsageToday();
    remember("activity-folded", folded ? "1" : "0");
  });
  $("#activity-list").addEventListener("click", (ev) => {
    const slug = closest(ev, "[data-slug]")?.dataset.slug;
    if (slug && state.noteById.has(slug)) chooseNote(slug, { fly: true });
  });
  pressable($("#activity-list"), "li[data-slug]");
  setInterval(updateActivity, 5000);
}
