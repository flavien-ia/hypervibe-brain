// summary.mjs - The brain's table of contents, sent to every conversation.
//
// Why: an AI told "query the brain when an answer depends on the person"
// mostly does not, because it does not know what the brain holds (measured
// on 2026-11-05: 74 conversations connected, 18 queried it). A short map
// (domains, the most linked notes, the projects alive, what the natures
// hold) lets it see when the brain has something to say. It is NOT the
// index: the index is a database the server queries; this is a page the AI
// reads, kept to a few hundred tokens because every conversation pays for it.
//
// Built from the index (never from the notes' text), in the brain's language.

import { config, domainLabel, isFrench } from "./lib.mjs";

const CAP = 3600; // characters, about a thousand tokens at most

export function summary(db, cfg = config()) {
  const fr = isFrench(cfg);
  const hidden = (cfg.search?.hidden ?? []).map((p) => String(p).replace(/\\/g, "/").replace(/^\/+/, ""));
  const visible = (rel) => !hidden.some((p) => String(rel ?? "").replace(/\\/g, "/").replace(/^vault\//, "").startsWith(p));
  // An archived note stays out of the map: it is history, not an entry point.
  const rows = db.prepare("SELECT slug, rel, type, title, domains, updated, visibility, status FROM fiche").all().filter((r) => visible(r.rel) && r.status !== "archived");
  if (!rows.length) return "";
  const lines = [];
  const say = (f, e) => (fr ? f : e);

  // What it holds, by type.
  const byType = new Map();
  for (const r of rows) byType.set(r.type, (byType.get(r.type) ?? 0) + 1);
  lines.push(say("Ce que contient le brain : ", "What the brain holds: ") + [...byType].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${t}`).join(", ") + ".");
  try {
    const hiddenTools = cfg.search?.hiddenTools ?? [];
    const cat = db.prepare("SELECT tool, COUNT(*) n FROM entry GROUP BY tool ORDER BY n DESC").all().filter((c) => !hiddenTools.includes(c.tool));
    if (cat.length) lines.push(say("Son catalogue (retrouvé sans fiche, par brain_search) : ", "Its catalogue (found without a note, by brain_search): ") + cat.map((c) => `${c.n} ${c.tool}`).join(", ") + ".");
  } catch {
    // an index built before the catalogue
  }

  // The domains.
  const byDomain = new Map();
  for (const r of rows) for (const d of JSON.parse(r.domains || "[]")) byDomain.set(d, (byDomain.get(d) ?? 0) + 1);
  if (byDomain.size) lines.push(say("Domaines : ", "Domains: ") + [...byDomain].sort((a, b) => b[1] - a[1]).map(([d, n]) => (domainLabel(cfg, d) === d ? `${d} (${n})` : `${domainLabel(cfg, d)} [${d}] (${n})`)).join(", ") + ".");

  // The natures: where the decisions and the lessons are.
  try {
    const nat = db.prepare("SELECT nature, COUNT(*) n FROM facet WHERE nature IS NOT NULL GROUP BY nature ORDER BY n DESC").all();
    if (nat.length) lines.push(say("Natures (brain_search avec nature) : ", "Natures (brain_search with nature): ") + nat.map((x) => `${x.n} ${x.nature}`).join(", ") + say(". Avant une tâche, ses leçons ; avant de trancher, ses décisions.", ". Before a task, its lessons; before settling anything, its decisions."));
  } catch {
    // an index built before the facets
  }

  // The hubs: the notes most linked to, the brain's main entry points.
  const title = new Map(rows.map((r) => [r.slug, r.title]));
  const hubs = db.prepare("SELECT dst, COUNT(*) n FROM link GROUP BY dst ORDER BY n DESC LIMIT 60").all().filter((h) => title.has(h.dst)).slice(0, 18);
  if (hubs.length) lines.push(say("Points d'entrée (les fiches les plus liées) : ", "Entry points (the most linked notes): ") + hubs.map((h) => `${title.get(h.dst)} [${h.dst}]`).join(" ; ") + ".");

  // The projects alive: touched in the last three months.
  const projectType = Object.keys(cfg.types ?? {}).find((t) => /^proj/.test(t));
  if (projectType) {
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const alive = rows.filter((r) => r.type === projectType && String(r.updated) >= since).sort((a, b) => String(b.updated).localeCompare(String(a.updated))).slice(0, 15);
    if (alive.length) lines.push(say("Projets vivants (touchés ces trois mois) : ", "Projects alive (touched in the last three months): ") + alive.map((r) => `${r.title} [${r.slug}]`).join(" ; ") + ".");
  }

  let text = lines.join("\n");
  if (text.length > CAP) text = `${text.slice(0, text.lastIndexOf(" ; ", CAP))}...`;
  return text;
}
