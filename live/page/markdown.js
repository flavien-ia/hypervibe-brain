// markdown.js: the body of a note, rendered soberly for its card
// (note-card.js): titles, paragraphs, lists, the links to other notes and the
// web addresses. Apart from the card so that it can be checked without a
// browser (tests/zones/vue.mjs).

import { escapeHtml } from "./format.js";
import { state } from "./state.js";

/**
 * One line of a note, already escaped, with what can be clicked: the
 * [[links]] to other notes, and the web addresses (2026-11-21: http and https
 * only, in a new tab, without telling the site where the click came from).
 * @param {string} html
 * @returns {string}
 */
export function inline(html) {
  // A link written [label](address), then a bare address. Only http(s): an
  // address of another scheme (javascript:, file:) stays text. (First: a
  // title of the map put in a link below is never turned into an address.)
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)"<>`]+)\)|(https?:\/\/[^\s"<>`]+)/g, (_, label, address, bare) => {
    let url = address ?? bare;
    // A bare address that ends a sentence leaves its full stop outside.
    let after = "";
    if (bare) {
      const end = /[.,;:!?)\]]+$/.exec(url);
      if (end) { after = end[0]; url = url.slice(0, -after.length); }
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label ?? url}</a>${after}`;
  });
  // The line is already escaped (slug and label included); the title comes
  // from the map, raw: the machine may have written it from an email.
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, slug, label) => {
    const title = state.noteById.get(slug)?.title;
    // (A link, not a span: it is reached with the keyboard too, audit 17.)
    return `<a href="#" class="link" data-slug="${slug}">${label ?? (title === undefined ? slug : escapeHtml(title))}</a>`;
  });
  return html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
}

/**
 * The body of a note in markdown, rendered soberly: titles, paragraphs, and
 * the lists as lists (2026-11-21: they showed as lines starting with "-").
 * @param {unknown} markdown
 * @returns {string}
 */
export function renderBody(markdown) {
  const blocks = String(markdown ?? "").replace(/\r\n/g, "\n").split(/\n{2,}/);
  return blocks.map((block) => {
    const text = block.trim();
    if (!text) return "";
    // Line by line: the items of a list ("- ", "* ", "1. ") are gathered, the
    // other lines make a paragraph; a line that is indented under an item
    // continues it.
    /** @type {string[]} */
    const out = [];
    /** @type {{ kind: "ul" | "ol", items: string[] } | null} */
    let list = null;
    /** @type {string[]} */
    let lines = [];
    const endParagraph = () => { if (lines.length) out.push(`<p>${lines.join("<br>")}</p>`); lines = []; };
    const endList = () => { if (list) out.push(`<${list.kind}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.kind}>`); list = null; };
    for (const raw of text.split("\n")) {
      const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
      if (item) {
        endParagraph();
        const kind = /\d/.test(item[1]) ? "ol" : "ul";
        if (list && list.kind !== kind) endList();
        list ??= { kind, items: [] };
        // (A box to tick, "- [ ] ", shows as its text.)
        list.items.push(inline(escapeHtml(item[2].replace(/^\[[ xX]\]\s+/, ""))));
      } else if (list && /^\s+\S/.test(raw)) {
        list.items[list.items.length - 1] += ` ${inline(escapeHtml(raw.trim()))}`;
      } else {
        endList();
        if (/^#{1,6} /.test(raw)) {
          endParagraph();
          out.push(`<h4>${inline(escapeHtml(raw.replace(/^#{1,6} /, "")))}</h4>`);
        } else lines.push(inline(escapeHtml(raw.trim())));
      }
    }
    endList();
    endParagraph();
    return out.join("");
  }).join("");
}
