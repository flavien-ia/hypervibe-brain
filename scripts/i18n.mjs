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
// locale (or --lang), and kept in brain.json.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LANGS = ["fr", "en"];

/**
 * The computer's language. On macOS, Node takes its locale from LANG and
 * LC_* only, never from System Settings, and an app started from the Dock has
 * neither: a French Mac would come out English. Hence, in order: the
 * environment variables (ignoring C and POSIX), the Mac's own setting, then
 * what Node reports (right on Windows).
 */
export function osLang() {
  const pick = (v) => (v && !/^(C|POSIX)([._]|$)/i.test(v) ? v : "");
  let locale = pick(process.env.LC_ALL) || pick(process.env.LC_MESSAGES) || pick(process.env.LANG);
  if (!locale && process.platform === "darwin") {
    try {
      locale = execFileSync("/usr/bin/defaults", ["read", "-g", "AppleLocale"], { encoding: "utf8", timeout: 5000 }).trim();
    } catch {
      locale = "";
    }
  }
  if (!locale) {
    try {
      locale = Intl.DateTimeFormat().resolvedOptions().locale || "";
    } catch {
      locale = "";
    }
  }
  return String(locale).toLowerCase().startsWith("fr") ? "fr" : "en";
}

/** The brain's language: brain.json, else the computer's. */
export function brainLang(root) {
  try {
    const p = join(root, "brain.json");
    if (existsSync(p)) {
      const l = JSON.parse(readFileSync(p, "utf8")).lang;
      if (LANGS.includes(l)) return l;
    }
  } catch {
    // unreadable settings: the computer's language
  }
  return osLang();
}

// A count of tokens as a person reads it: "350 thousand", "1.4 million".
const big = (n, fr) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", fr ? "," : ".")} million${fr && n >= 2_000_000 ? "s" : ""}` : `${Math.round(n / 1000)} ${fr ? "mille" : "thousand"}`);

const T = {
  en: {
    commitCapture: (title) => `capture: ${title}`,
    commitSave: (notes, others) => `save: ${notes} note(s), ${others} other file(s)`,
    commitCreate: (name) => `${name}'s brain is created`,
    taskName: "Hypervibe Brain evening save",
    taskDescription: "Hypervibe Brain: rebuilds the index of the second brain and saves it. No AI, no cost.",
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
      changedSources: (n) => `- ${n} source(s) modified after their note was last touched.`,
      changedTitle: (n) => `## Sources modified since their note (${n})`,
      changedLine: (slug, status, day, updated) => `- [[${slug}]] (${status}): source modified on ${day}, note touched on ${updated}`,
      newMark: " **(new)**",
      journal: (n) => `## What you worked on (${n} project(s))`,
      journalLine: (p, sessions, last) => `- ${p}: ${sessions} session(s), last on ${last}`,
      journalCommits: (n) => `, ${n} commit(s)`,
      journalTitle: (ti) => `  - session "${ti}"`,
      watch: (n) => `## Files that moved in the watched folders (${n})`,
      watchMore: (n) => `- ... and ${n} more.`,
      people: (n, core) => `## Contacts (${n} in the directory, ${core} in the core)`,
      peopleNoNote: "In the core, without a note yet (to decide):",
      own: (n) => `## Your own sources (${n})`,
      writes: (n) => `## What the machine wrote this week (${n})`,
      writesLine: (i, what, note, who, from, text) => `${i}. [[${note}]]: ${what === "fact" ? `fact added${text ? `, « ${text.length > 160 ? `${text.slice(0, 157)}...` : text} »` : ""}` : "note created"} (${who}${from ? `, from ${from}` : ""})`,
      writesMore: (n) => `- ... and ${n} more.`,
      writesBulk: (who, zones, updated, notes) => `- ${who}: ${[zones ? `${zones} machine zone(s) updated` : "", updated ? `${updated} record(s) refreshed` : ""].filter(Boolean).join(", ")}, on ${notes} note(s)`,
      writesUndo: "To take one back: « review: undo 3 ». Without an answer, everything stays.",
      growTitle: (n, all) => `## Notes that grow (${n}${all > n ? ` of ${all}` : ""})`,
      growLine: (slug, type, size, fed) => `- [[${slug}]] (${type}): ${Math.round(size / 1000)} 000 characters${fed ? `, ${fed} fact(s) added this month` : ""}`,
      growHint: "For each: a synthesis or a split, drafted by the review and proposed in the letter; nothing is applied without you.",
      judgeTitle: "## The judge this week",
      judgeLine: (n, r) => `- ${n}: ${r.runs} run(s) (${r.minutes} min${r.failed ? `, ${r.failed} failed` : ""}), ${r.judged} item(s) read, ${r.fruitful} gave something: ${r.facts} fact(s), ${r.created} note(s) created, ${r.proposals} proposal(s), ${r.refused} refused (already there), ${r.takenBack} taken back${r.waiting ? `; ${r.waiting} waiting` : ""}${r.tokens || r.cached ? `. Cost: about ${big(r.tokens ?? 0)} tokens of the Claude plan, and ${big(r.cached ?? 0)} read again from its cache` : ""}${r.held ? `. HELD before a catch-up: ${r.held.items} items wait, about ${big(r.held.estimate ?? 0)} tokens; it reads nothing until you say "read them all", "only the latest N" or "drop them"` : ""}${r.capped ? `. Stopped for today by its daily cap (${big(r.spentToday ?? 0)} tokens used, cap ${big(r.dailyTokens ?? 0)}); it starts again tomorrow` : ""}`,
      judgeHint: "Its facts are among the writes numbered above: « undo 3 » takes one back.",
      proposalsTitle: (n) => `## Proposed by the machine this week (${n})`,
      healthTitle: (n) => `## Disconnected (${n})`,
      healthLine: (label, reason, since) => `- ${label}: ${reason} (since ${since}). In the live view: reconnect it, or remove it.`,
      proposalLine: (note, text, from) => `- [[${note}]]: « ${text.length > 200 ? `${text.slice(0, 197)}...` : text} »${from ? ` (from ${from})` : ""}`,
      skillsTitle: "## Skills to declare to a source",
      skillsLine: (skill, source, n) => `- \`${skill}\` ran, and each time the source \`${source}\` then found new data (${n} time(s) this week): add \`"skill:${skill}"\` to its \`after\`, so that it runs right after the skill?`,
      ownLine: (name, kind, on, last, created, error) => `- ${name} (${kind === "script" ? "read automatically" : kind === "step" ? "a program, writes no note" : "done by Claude"}${on ? "" : ", off"}): ${last ? `last success ${last}${kind === "step" ? "" : `, ${created} new note(s)`}` : "never succeeded yet"}${error ? `. **Problem**: ${error}` : ""}`,
    },
  },
  fr: {
    commitCapture: (title) => `capture : ${title}`,
    commitSave: (notes, others) => `sauvegarde : ${notes} fiche(s), ${others} autre(s) fichier(s)`,
    commitCreate: (name) => `Création du brain de ${name}`,
    taskName: "Hypervibe Brain sauvegarde du soir",
    taskDescription: "Hypervibe Brain : reconstruit l'index du second brain et le sauvegarde. Sans IA, sans coût.",
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
      changedSources: (n) => `- ${n} source(s) modifiée(s) après la dernière retouche de leur fiche.`,
      changedTitle: (n) => `## Sources modifiées depuis leur fiche (${n})`,
      changedLine: (slug, status, day, updated) => `- [[${slug}]] (${status}) : source modifiée le ${day}, fiche touchée le ${updated}`,
      newMark: " **(nouveau)**",
      journal: (n) => `## Ce sur quoi vous avez travaillé (${n} projet(s))`,
      journalLine: (p, sessions, last) => `- ${p} : ${sessions} session(s), la dernière le ${last}`,
      journalCommits: (n) => `, ${n} commit(s)`,
      journalTitle: (ti) => `  - session « ${ti} »`,
      watch: (n) => `## Fichiers qui ont bougé dans les dossiers suivis (${n})`,
      watchMore: (n) => `- ... et ${n} de plus.`,
      people: (n, core) => `## Contacts (${n} dans l'annuaire, ${core} au cœur)`,
      writes: (n) => `## Ce que la machine a écrit cette semaine (${n})`,
      writesLine: (i, what, note, who, from, text) => `${i}. [[${note}]] : ${what === "fact" ? `fait ajouté${text ? `, « ${text.length > 160 ? `${text.slice(0, 157)}...` : text} »` : ""}` : "fiche créée"} (${who}${from ? `, d'après ${from}` : ""})`,
      writesMore: (n) => `- ... et ${n} de plus.`,
      writesBulk: (who, zones, updated, notes) => `- ${who} : ${[zones ? `${zones} zone(s) machine mise(s) à jour` : "", updated ? `${updated} enregistrement(s) rafraîchi(s)` : ""].filter(Boolean).join(", ")}, sur ${notes} fiche(s)`,
      writesUndo: "Pour en annuler une : « brain-review : annule la 3 ». Sans réponse, tout reste.",
      growTitle: (n, all) => `## Les fiches qui grossissent (${n}${all > n ? ` sur ${all}` : ""})`,
      growLine: (slug, type, size, fed) => `- [[${slug}]] (${type}) : ${Math.round(size / 1000)} 000 caractères${fed ? `, ${fed} fait(s) ajouté(s) ce mois-ci` : ""}`,
      growHint: "Pour chacune : une synthèse ou une séparation, rédigée par la relecture et proposée dans la lettre ; rien n'est appliqué sans toi.",
      judgeTitle: "## Le juge cette semaine",
      judgeLine: (n, r) => `- ${n} : ${r.runs} passage(s) (${r.minutes} min${r.failed ? `, ${r.failed} en échec` : ""}), ${r.judged} élément(s) lu(s), ${r.fruitful} ont apporté quelque chose : ${r.facts} fait(s), ${r.created} fiche(s) créée(s), ${r.proposals} proposition(s), ${r.refused} refusé(s) (déjà là), ${r.takenBack} défait(s)${r.waiting ? ` ; ${r.waiting} en attente` : ""}${r.tokens || r.cached ? `. Coût : environ ${big(r.tokens ?? 0, true)}${(r.tokens ?? 0) >= 1_000_000 ? " de" : ""} jetons du forfait Claude, et ${big(r.cached ?? 0, true)} relus depuis son cache` : ""}${r.held ? `. EN ATTENTE avant un rattrapage : ${r.held.items} éléments attendent, environ ${big(r.held.estimate ?? 0, true)}${(r.held.estimate ?? 0) >= 1_000_000 ? " de" : ""} jetons ; il ne lit rien tant que vous n'avez pas dit « lis tout », « seulement les N derniers » ou « laisse tomber »` : ""}${r.capped ? `. Arrêté pour aujourd'hui par son plafond du jour (${big(r.spentToday ?? 0, true)}${(r.spentToday ?? 0) >= 1_000_000 ? " de" : ""} jetons utilisés, plafond ${big(r.dailyTokens ?? 0, true)}) ; il repart demain` : ""}`,
      judgeHint: "Ses faits sont parmi les écritures numérotées plus haut : « annule la 3 » en défait un.",
      proposalsTitle: (n) => `## Proposé par la machine cette semaine (${n})`,
      healthTitle: (n) => `## Débranché (${n})`,
      healthLine: (label, reason, since) => `- ${label} : ${reason} (depuis le ${since}). Dans la vue en direct : le reconnecter, ou le retirer.`,
      proposalLine: (note, text, from) => `- [[${note}]] : « ${text.length > 200 ? `${text.slice(0, 197)}...` : text} »${from ? ` (d'après ${from})` : ""}`,
      skillsTitle: "## Skills à déclarer à une source",
      skillsLine: (skill, source, n) => `- \`${skill}\` a tourné, et chaque fois la source \`${source}\` a ensuite trouvé de la donnée nouvelle (${n} fois cette semaine) : ajouter \`"skill:${skill}"\` à son \`after\`, pour qu'elle tourne juste après la skill ?`,
      peopleNoNote: "Au cœur, sans fiche pour l'instant (à décider) :",
      own: (n) => `## Vos propres sources (${n})`,
      ownLine: (name, kind, on, last, created, error) => `- ${name} (${kind === "script" ? "lue automatiquement" : kind === "step" ? "un programme, sans fiche" : "faite par Claude"}${on ? "" : ", arrêtée"}) : ${last ? `dernier succès le ${last}${kind === "step" ? "" : `, ${created} fiche(s) nouvelle(s)`}` : "jamais réussie pour l'instant"}${error ? `. **Problème** : ${error}` : ""}`,
    },
  },
};

export const t = (lang) => T[LANGS.includes(lang) ? lang : "en"];
