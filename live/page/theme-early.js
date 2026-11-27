// theme-early.js: the ground of the page, set before anything is drawn.
//
// A plain script in the <head> of every page of the view, not a module: it
// runs before the first paint, so that a person who chose another ground than
// the default (theme.js, in the settings) never sees the default flash first.
// It reads what this browser remembers, under the key of storage.js
// ("brain-live:ground"), and writes it on the root (`data-ground`), where the
// stylesheet reads it (theme-hypervibe.css). It also follows a ground chosen
// in another window of the view: the legend alone and the history of a tool
// change with the map, without reloading. No local storage, or a value it
// does not know: the default ground (2026-11-27).
(() => {
  const KEY = "brain-live:ground";
  /** @param {string | null} kept */
  const show = (kept) => {
    document.documentElement.dataset.ground = kept === "black" || kept === "blue" ? kept : "hypervibe";
  };
  try {
    show(localStorage.getItem(KEY));
  } catch {
    show(null);
  }
  addEventListener("storage", (ev) => { if (ev.key === KEY) show(ev.newValue); });
})();
