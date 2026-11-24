// search.js: the search field at the top: a note by its title, opened and
// flown to.

import { $, $input, closest } from "./dom.js";
import { escapeHtml } from "./format.js";
import { typeName } from "./map.js";
import { chooseNote } from "./note-card.js";
import { state } from "./state.js";

/** The search field (shortcuts.js gives it the focus on "/"). */
export const searchField = $input("#search");
const results = $("#results");
/** @type {import("./state.js").Note[]} the notes proposed, the best first */
let choices = [];
/** The result the arrows chose (Enter opens it). */
let active = 0;

/** Marks the result chosen with the arrows, and tells screen readers which one it is. */
function showActive() {
  for (const li of results.querySelectorAll("li")) li.classList.toggle("active", Number(/** @type {HTMLElement} */ (li).dataset.i) === active);
  const li = results.querySelector(`li[data-i="${active}"]`);
  if (li) { searchField.setAttribute("aria-activedescendant", li.id); li.scrollIntoView({ block: "nearest" }); } else searchField.removeAttribute("aria-activedescendant");
}

/** Opens one of the proposed notes and puts the field away. @param {import("./state.js").Note} note */
function open(note) {
  chooseNote(note.id, { fly: true });
  results.hidden = true;
  searchField.value = "";
}

/** Wires the search field and its list of results. */
export function setUpSearch() {
  searchField.addEventListener("input", () => {
    const q = searchField.value.trim().toLowerCase();
    if (q.length < 2) { results.hidden = true; choices = []; return; }
    const words = q.split(/\s+/);
    choices = state.notes
      .filter((n) => words.every((word) => `${n.title.toLowerCase()} ${n.id}`.includes(word)))
      .sort((a, b) => Number(!a.title.toLowerCase().startsWith(q)) - Number(!b.title.toLowerCase().startsWith(q)) || b.degree - a.degree)
      .slice(0, 12);
    // (The arrows choose a result, audit 17: only the first one could be opened without a mouse.)
    active = 0;
    results.setAttribute("role", "listbox");
    results.innerHTML = choices.map((n, i) => `<li data-i="${i}" id="result-${i}" role="option">${escapeHtml(n.title)}<small>${escapeHtml(typeName(n.type))} · ${escapeHtml(n.domains.join(", "))}</small></li>`).join("");
    results.hidden = !choices.length;
    showActive();
  });
  results.addEventListener("click", (ev) => {
    const i = closest(ev, "li")?.dataset.i;
    if (i !== undefined) open(choices[Number(i)]);
  });
  // The search has its own Esc: it closes its results (shortcuts.js leaves it alone).
  searchField.addEventListener("keydown", (ev) => {
    if ((ev.key === "ArrowDown" || ev.key === "ArrowUp") && choices.length && !results.hidden) {
      ev.preventDefault();
      active = (active + (ev.key === "ArrowDown" ? 1 : choices.length - 1)) % choices.length;
      showActive();
    }
    if (ev.key === "Enter" && choices[active]) { open(choices[active]); searchField.blur(); }
    if (ev.key === "Escape") { results.hidden = true; searchField.blur(); }
  });
}
