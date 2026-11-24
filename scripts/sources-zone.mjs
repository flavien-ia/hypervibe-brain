// sources-zone.mjs - The list of the sources connected to the brain, as a
// machine zone of SOURCES.md (P7, phase K). SOURCES.md keeps what is not a
// source (what never enters and why, the privacy rules, the history of the
// decisions); what IS connected is read from sources/ and written here, at
// each save, so that the two never diverge. Nobody writes this list by hand.

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib.mjs";
import { brainLang } from "./i18n.mjs";

const OPEN = "<!-- sources:auto -->";
const CLOSE = "<!-- /sources:auto -->";

const W = {
  fr: {
    title: "### Les sources branchées (liste tenue par le plugin, depuis `sources/`)",
    head: "| Source | Ce qu'elle fait entrer | Quand | Outils |",
    every: { day: "chaque soir", week: "chaque semaine", hour: "chaque heure" },
    minutes: (n) => `toutes les ${n} min`,
    after: (x) => `après ${x}`,
    kind: { claude: "par Claude, à la relecture", step: "étape, n'écrit pas de fiche" },
    live: "par Claude en arrière-plan, dans la journée",
    off: "(éteinte)",
    paused: "(en pause)",
  },
  en: {
    title: "### The connected sources (kept by the plugin, from `sources/`)",
    head: "| Source | What it brings in | When | Tools |",
    every: { day: "every evening", week: "every week", hour: "every hour" },
    minutes: (n) => `every ${n} min`,
    after: (x) => `after ${x}`,
    kind: { claude: "by Claude, at the review", step: "a step, writes no note" },
    live: "by Claude in the background, during the day",
    off: "(off)",
    paused: "(paused)",
  },
};

export function sourcesZone() {
  const l = W[brainLang(ROOT)] ?? W.en;
  const dir = join(ROOT, "sources");
  const rows = [];
  for (const n of existsSync(dir) ? readdirSync(dir).sort() : []) {
    let d;
    try {
      d = JSON.parse(readFileSync(join(dir, n, "source.json"), "utf8"));
    } catch {
      continue;
    }
    // A judge (kind "claude", "live": true) reads during the day, whatever its "every" says.
    const judge = d.kind === "claude" && d.live === true;
    const when = judge ? l.live : [
      l.every[d.every] ?? (/^\d+m$/.test(String(d.every)) ? l.minutes(parseInt(d.every, 10)) : d.every),
      (d.after ?? []).length ? l.after(d.after.map((x) => `\`${String(x).replace(/^(skill|source):/, "")}\``).join(", ")) : "",
      l.kind[d.kind] ?? "",
    ].filter(Boolean).join(", ");
    const tools = (d.tools ?? []).map((t) => (typeof t === "string" ? t : t.id)).join(", ");
    const what = String(d.description ?? "").replace(/\|/g, "/");
    rows.push(`| \`${n}\`${d.enabled === false ? ` ${l.off}` : d.paused === true ? ` ${l.paused}` : ""} | ${what} | ${when} | ${tools} |`);
  }
  return [OPEN, l.title, "", l.head, "|---|---|---|---|", ...rows, CLOSE].join("\n");
}

/** Rewrites the zone in SOURCES.md (adds it at the end the first time). Returns whether it changed. */
export function writeSourcesZone() {
  const f = join(ROOT, "SOURCES.md");
  if (!existsSync(f)) return false;
  const before = readFileSync(f, "utf8");
  const nl = before.includes("\r\n") ? "\r\n" : "\n";
  const t = before.replace(/\r\n/g, "\n");
  const zone = sourcesZone();
  const i = t.indexOf(OPEN);
  const j = t.indexOf(CLOSE);
  const next = i >= 0 && j > i ? t.slice(0, i) + zone + t.slice(j + CLOSE.length) : `${t.trimEnd()}\n\n${zone}\n`;
  if (next === t) return false;
  writeFileSync(f, next.replace(/\n/g, nl), "utf8");
  return true;
}
