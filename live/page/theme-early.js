// theme-early.js: the design of the page, set before anything is drawn.
//
// A plain script in the <head>, not a module: it runs before the first paint,
// so that a person who chose the Hypervibe design (theme.js) never sees the
// night flash first. It only reads what this browser remembers, under the key
// of storage.js ("brain-live:theme"). No local storage: the default design.
try {
  if (localStorage.getItem("brain-live:theme") === "hypervibe") document.documentElement.dataset.theme = "hypervibe";
} catch {
  // no local storage: the default design
}
