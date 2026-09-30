// i18n.mjs - Everything the PERSON sees from the scripts, in their language.
//
// Like Hypervibe: the skills are written in English (Claude reads them, not the
// person) and Claude speaks the person's language. But what the scripts write
// by themselves (the brain's documents, the weekly report, the names of the
// saves in the history, the scheduled task) the person reads directly: it
// must be in their language. French and English today; any other language
// falls back to English, and Claude translates what it writes itself.
//
// The language is chosen once, at the brain's creation, from the computer's
// locale (or --lang), and kept in hyperbrain.json.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LANGS = ["fr", "en"];

export function osLang() {
  const locale = (() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().locale || "";
    } catch {
      return "";
    }
  })() || process.env.LANG || process.env.LC_ALL || "";
  return String(locale).toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** The brain's language: hyperbrain.json, else the computer's. */
export function brainLang(root) {
  try {
    const p = join(root, "hyperbrain.json");
    if (existsSync(p)) {
      const l = JSON.parse(readFileSync(p, "utf8")).lang;
      if (LANGS.includes(l)) return l;
    }
  } catch {
    // unreadable settings: the computer's language
  }
  return osLang();
}

const T = {
  en: {
    commitCapture: (title) => `capture: ${title}`,
    commitSave: (notes, others) => `save: ${notes} note(s), ${others} other file(s)`,
    commitCreate: (name) => `${name}'s brain is created`,
    taskName: "Hyperbrain evening save",
    taskDescription: "Hyperbrain: rebuilds the index of the second brain and saves it. No AI, no cost.",
    review: {
      title: (name, date) => `# Review of ${name}'s brain, ${date}`,
      summary: (n, fresh, days) => `${n} notes. ${fresh} new in the last ${days} days.`,
      health: "## Health",
      errors: (n) => `- **${n} error(s)**: the index cannot be rebuilt until they are fixed.`,
      noError: "- No error.",
      broken: (n) => `- ${n} link(s) to a note that does not exist.`,
      noSource: (n) => `- ${n} note(s) without a source.`,
      orphansCount: (n) => `- ${n} orphan note(s) (no link in or out).`,
      deadSources: (n) => `- ${n} source(s) pointing to a file that no longer exists.`,
      domains: "## Domains",
      fresh: (n) => `## New this week (${n})`,
      nothingNew: "- Nothing new.",
      promoted: (n) => `## Promoted to trusted (${n})`,
      promotable: (n) => `## Could be promoted to trusted (${n})`,
      none: "- None.",
      disagree: "A promotion you disagree with: say so, the note goes back to seed.",
      orphans: (n) => `## Orphans (${n})`,
      brokenTitle: "## Broken links",
      deadTitle: "## Sources that no longer exist",
      journal: (n) => `## What you worked on (${n} project(s))`,
      journalLine: (p, sessions, last) => `- ${p}: ${sessions} session(s), last on ${last}`,
      watch: (n) => `## Files that moved in the watched folders (${n})`,
      watchMore: (n) => `- ... and ${n} more.`,
    },
  },
  fr: {
    commitCapture: (title) => `capture : ${title}`,
    commitSave: (notes, others) => `sauvegarde : ${notes} fiche(s), ${others} autre(s) fichier(s)`,
    commitCreate: (name) => `Création du brain de ${name}`,
    taskName: "Hyperbrain sauvegarde du soir",
    taskDescription: "Hyperbrain : reconstruit l'index du second brain et le sauvegarde. Sans IA, sans coût.",
    review: {
      title: (name, date) => `# Revue du brain de ${name}, ${date}`,
      summary: (n, fresh, days) => `${n} fiches. ${fresh} nouvelle(s) ces ${days} derniers jours.`,
      health: "## Santé",
      errors: (n) => `- **${n} erreur(s)** : l'index ne peut pas être reconstruit tant qu'elles ne sont pas corrigées.`,
      noError: "- Aucune erreur.",
      broken: (n) => `- ${n} lien(s) vers une fiche qui n'existe pas.`,
      noSource: (n) => `- ${n} fiche(s) sans source.`,
      orphansCount: (n) => `- ${n} fiche(s) orpheline(s) (aucun lien, ni entrant ni sortant).`,
      deadSources: (n) => `- ${n} source(s) qui pointent vers un fichier disparu.`,
      domains: "## Domaines",
      fresh: (n) => `## Nouveau cette semaine (${n})`,
      nothingNew: "- Rien de nouveau.",
      promoted: (n) => `## Passées en fiable (${n})`,
      promotable: (n) => `## Pourraient passer en fiable (${n})`,
      none: "- Aucune.",
      disagree: "Une promotion avec laquelle vous n'êtes pas d'accord : dites-le, la fiche redevient graine.",
      orphans: (n) => `## Orphelines (${n})`,
      brokenTitle: "## Liens cassés",
      deadTitle: "## Sources disparues",
      journal: (n) => `## Ce sur quoi vous avez travaillé (${n} projet(s))`,
      journalLine: (p, sessions, last) => `- ${p} : ${sessions} session(s), la dernière le ${last}`,
      watch: (n) => `## Fichiers qui ont bougé dans les dossiers suivis (${n})`,
      watchMore: (n) => `- ... et ${n} de plus.`,
    },
  },
};

export const t = (lang) => T[LANGS.includes(lang) ? lang : "en"];
