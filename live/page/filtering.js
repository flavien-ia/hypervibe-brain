// filtering.js: which notes the filters of the map leave, in one place, for
// the drawing (paint-live.js), the count and the sentence of the filters box
// (filters.js) and the seeds (validate.js).
//
// ONE RULE, CARRIED BY THE WORDS (2026-11-22). The natures (AI memory, decisions)
// are one OR the other; the period and the seeds narrow what is left (AND).
// "Decisions" and "Seeds" ticked together show the decisions not validated
// yet, and nothing else. Until then the two were drawn side by side: every
// decision in yellow, and the seeds among them in green on top. The box once
// said it with "and" and "or" between its lines: too much to read; the
// label "Only seeds" says it alone.

import { NATURE_COLORS, state } from "./state.js";
import { colors } from "./theme.js";

/** A brain may keep its AI memory under a name prefix (brain.json, viz.memoryPrefixes): those notes count as lessons. @param {{ id: string, nature?: string }} n */
export const natureOf = (n) => n.nature || ((state.vocabulary?.memoryPrefixes ?? []).some((p) => n.id.startsWith(p)) ? "lesson" : "");

/** "seed" in an English brain, "graine" in a French one. @param {string | undefined} status */
export const isSeedStatus = (status) => status === "seed" || status === "graine";

/** Whether a filter that picks notes is on (the period alone only fades the rest). */
export const picking = () => state.natureFilters.size > 0 || state.seedFilter;

/**
 * The notes the filters leave, each with the colour it lights up in: its
 * nature's when a nature is ticked, the seeds' colour otherwise.
 * @param {string} seedColor
 * @returns {{ id: string, color: string, seed: boolean }[]}
 */
export function filteredNotes(seedColor) {
  /** @type {{ id: string, color: string, seed: boolean }[]} */
  const out = [];
  for (const n of state.notes) {
    if (!state.layout?.at.has(n.id)) continue;
    if (state.writtenSince && !state.writtenSince.slugs.has(n.id)) continue;
    const nature = natureOf(n);
    if (state.natureFilters.size && !state.natureFilters.has(nature)) continue;
    const seed = isSeedStatus(n.status);
    if (state.seedFilter && !seed) continue;
    if (!picking() && !state.writtenSince) continue;
    out.push({ id: n.id, color: state.natureFilters.size ? NATURE_COLORS[nature] ?? colors.mark : seedColor, seed });
  }
  return out;
}
