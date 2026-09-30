// pure.mjs - The calculations the local engine AND the cloud Worker share,
// written once. No import, no access to anything: pure functions only, so
// that the Worker (a Cloudflare runtime, without Node's modules) runs exactly
// the same code as this computer.
//
// Why one file rather than two engines kept in step: the brain this plugin
// grew from had two, and a bench to prove they agreed. "Two engines that
// diverge are the guarantee that one day one of them serves what the other
// hides." Sharing the code removes the divergence at its source.

export const flat = (s) => String(s ?? "").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase();

/** Every word must appear, anywhere, accents ignored. Several words are NOT an exact phrase. */
export function ftsQuery(q) {
  const words = flat(q).match(/[\p{L}\p{N}]+/gu) ?? [];
  return { words, match: words.map((w) => `"${w}"*`).join(" ") };
}

/** A short excerpt around the first word found. */
export function snippet(body, words, len = 220) {
  if (!body) return "";
  const text = String(body).replace(/\s+/g, " ");
  const low = flat(text);
  let at = -1;
  for (const w of words) {
    at = low.indexOf(w);
    if (at >= 0) break;
  }
  const start = Math.max(0, at - 60);
  return (start > 0 ? "..." : "") + text.slice(start, start + len) + (start + len < text.length ? "..." : "");
}

/** Rows of { slug, v: Float32Array, norm }: the closest to a query vector. */
export function nearest(rows, query, limit, exclude = new Set()) {
  let qn = 0;
  for (const x of query) qn += x * x;
  qn = Math.sqrt(qn) || 1;
  const scored = [];
  for (const r of rows) {
    if (exclude.has(r.slug)) continue;
    let dot = 0;
    for (let i = 0; i < r.v.length; i++) dot += r.v[i] * query[i];
    scored.push({ slug: r.slug, score: dot / (qn * r.norm) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export const normOf = (v) => {
  let n = 0;
  for (const x of v) n += x * x;
  return Math.sqrt(n) || 1;
};

/** Contacts: every word, anywhere in what is known of them, accents ignored; core first. */
export function matchContacts(contacts, terms, { limit = 20 } = {}) {
  const words = flat(terms).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return contacts
    .filter((c) => {
      const text = flat(Object.values(c).flat().filter((v) => typeof v === "string" || typeof v === "number").join(" "));
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || Number(b.sent ?? 0) - Number(a.sent ?? 0))
    .slice(0, limit);
}

// The words of a note's format, by the brain's language (see lib.mjs).
export const VOCAB = {
  en: {
    keys: { type: "type", title: "title", domains: "domains", status: "status", visibility: "visibility", created: "created", updated: "updated", source: "source" },
    status: { seed: "seed", trusted: "trusted", archived: "archived" },
    visibility: { public: "public", internal: "internal", private: "private" },
  },
  fr: {
    keys: { type: "type", title: "titre", domains: "domaines", status: "statut", visibility: "visibilite", created: "cree", updated: "touche", source: "source" },
    status: { seed: "graine", trusted: "fiable", archived: "archive" },
    visibility: { public: "public", internal: "interne", private: "prive" },
  },
};
