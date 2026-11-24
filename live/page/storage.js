// storage.js: the few things this browser remembers from one visit to the
// next (localStorage). A convenience only: without local storage the page
// starts from its defaults, and nothing here may throw.
//
//   brain-live:lang              the language of the last visit ("fr", "en")
//   brain-live:filters           the filters box: "open" or "closed"
//   brain-live:activity-folded   the activity panel: "1" folded, "0" open
//   brain-live:build-folded      the panel of the building, during /brain:start: "1" folded
//   brain-live:build-hidden      the start whose panel the person hid (when it began): a new start shows it again
//   brain-live:layers            what is ticked in the filters box, as JSON:
//                                { [the control's id, or "nature-<nature>"]: checked or value }
//   brain-live:theme             the design of the page: "hypervibe", else the default (theme.js;
//                                read before the first paint by theme-early.js)

const PREFIX = "brain-live:";

/** @typedef {"lang" | "filters" | "activity-folded" | "layers" | "floors" | "build-folded" | "build-hidden" | "theme"} StorageKey */

/**
 * What the page remembered under a key, or null.
 * @param {StorageKey} key
 * @returns {string | null}
 */
export function recall(key) {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    return null; // no local storage: the defaults
  }
}

/**
 * Keeps a value for the next visit.
 * @param {StorageKey} key
 * @param {string} value
 */
export function remember(key, value) {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // no local storage: nothing is kept
  }
}

// THE FRENCH KEYS OF BEFORE (2026-11-10). Until the English pass the page kept
// its preferences under French names, with French values. Each is read once,
// rewritten under its new name, then removed, so that nobody loses what they
// had ticked.
const FORMER_CONTROLS = { "calque-outils": "layer-tools", "calque-catalogue": "layer-catalogue", "calque-contacts": "layer-contacts", "calque-importance": "layer-importance", "filtre-ecrites": "filter-written" };

/** @type {{ from: string, to: StorageKey, convert: (value: string) => string | null }[]} */
const FORMER_KEYS = [
  { from: "filtres", to: "filters", convert: (v) => (v === "ferme" ? "closed" : v === "ouvert" ? "open" : null) },
  { from: "replie", to: "activity-folded", convert: (v) => (v === "0" || v === "1" ? v : null) },
  {
    from: "calques",
    to: "layers",
    convert: (v) => {
      /** @type {Record<string, unknown>} */
      const kept = {};
      for (const [id, value] of Object.entries(JSON.parse(v))) {
        const control = /** @type {Record<string, string | undefined>} */ (FORMER_CONTROLS)[id] ?? id;
        // The "today" choice of the written filter was the value "jour".
        kept[control] = control === "filter-written" && value === "jour" ? "day" : value;
      }
      return JSON.stringify(kept);
    },
  },
];

/** Takes over the preferences kept under the French keys of before; a key already rewritten is left alone. */
export function takeOverFormerKeys() {
  for (const { from, to, convert } of FORMER_KEYS) {
    try {
      const former = localStorage.getItem(PREFIX + from);
      if (former === null) continue;
      if (localStorage.getItem(PREFIX + to) === null) {
        const value = convert(former);
        if (value !== null) localStorage.setItem(PREFIX + to, value);
      }
      localStorage.removeItem(PREFIX + from);
    } catch {
      // unreadable or no local storage: the defaults
    }
  }
}
