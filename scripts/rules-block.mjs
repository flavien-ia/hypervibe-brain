#!/usr/bin/env node
// rules-block.mjs - The brain's rules for the person's AI, kept by the plugin
// in their global CLAUDE.md (~/.claude/CLAUDE.md), between two marks. What
// must be there without being looked for: a rule so that a skill that writes
// data a source of the brain reads is never forgotten by the hub (P7, phase
// H), and, once the memory of the AI lives in the brain (memory.mjs lock on),
// a second one that says where to write it instead. Written by the MCP server
// at each start, once a brain exists (mcp.mjs, HVBRAIN_RULES_BLOCK=off stops
// it), and by memory.mjs lock; run by hand to refresh it.
//
// The block is the plugin's: between its marks it is rewritten as a whole.
// The person's own rules live outside it.
//
//   node scripts/rules-block.mjs [--lang fr|en] [--file <CLAUDE.md>] [--dry]

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, userConfig, writeFileAtomic } from "./lib.mjs";
import { brainLang, osLang } from "./i18n.mjs";

export const OPEN = "<!-- hypervibe-brain:rules -->";
export const CLOSE = "<!-- /hypervibe-brain:rules -->";

const TEXT = {
  fr: [
    "## Règles du brain (Hypervibe Brain)",
    "",
    "Bloc tenu par le plugin du brain : il est réécrit à chaque mise à jour, vos propres règles vivent en dehors.",
    "",
    "- **Une skill qui écrit de la donnée que le brain lit se déclare à sa source.** Quand tu crées ou modifies une skill qui écrit dans une base, un dossier ou un outil qu'une source du brain lit, propose d'ajouter la skill au `after` de cette source (`sources/<nom>/source.json`, `\"after\": [\"skill:<nom de la skill>\"]`) : c'est ce qui fait tourner la source au moment où la donnée bouge. Sans cela, la source attend le passage du soir, et la lettre du dimanche signale l'oubli.",
  ],
  en: [
    "## The brain's rules (Hypervibe Brain)",
    "",
    "A block kept by the brain's plugin: rewritten at each update, your own rules live outside it.",
    "",
    "- **A skill that writes data the brain reads is declared to its source.** When you create or change a skill that writes into a database, a folder or a tool that a source of the brain reads, offer to add the skill to that source's `after` (`sources/<name>/source.json`, `\"after\": [\"skill:<skill name>\"]`): that is what runs the source when the data moves. Without it, the source waits for the evening, and the Sunday letter points out the miss.",
  ],
};

// THE MEMORY LIVES IN THE BRAIN (2026-11-20): said only once the person chose
// it (memory.mjs lock on). The hook refuses the write; this rule says where
// the thing goes instead, and that the brain is read before a task.
const MEMORY = {
  fr: "- **La mémoire vit dans le brain.** Ce que tu apprends de la personne, de ses projets, de ses décisions et de tes propres erreurs ne s'écrit plus dans les dossiers de mémoire de Claude (`~/.claude/projects/<projet>/memory/`), que le plugin garde fermés : écris-le dans le brain avec `/brain:capture` (une règle ou un piège appris est une leçon, un choix de la personne une décision, ce qu'un client ou un lecteur a dit de son travail un retour). Avant une tâche, cherche dans le brain les leçons qui la concernent.",
  en: "- **The memory lives in the brain.** What you learn of the person, of their projects, of their decisions and of your own mistakes is no longer written in Claude's memory folders (`~/.claude/projects/<project>/memory/`), which the plugin keeps closed: write it in the brain with `/brain:capture` (a rule or a trap learnt is a lesson, a choice of theirs a decision, what a client or a reader said of their work a feedback). Before a task, look in the brain for the lessons that apply to it.",
};

export function writeRulesBlock({ lang, file = join(HOME, ".claude", "CLAUDE.md"), dry = false } = {}) {
  const l = lang ?? (userConfig().brain ? brainLang(userConfig().brain) : osLang());
  const block = [OPEN, ...(TEXT[l] ?? TEXT.en), ...(userConfig().memory?.lock === true ? [MEMORY[l] ?? MEMORY.en] : []), CLOSE].join("\n");
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const nl = before.includes("\r\n") ? "\r\n" : "\n";
  const t = before.replace(/\r\n/g, "\n");
  // AN OPENING MARK WHOSE END IS GONE (2026-11-21). With the closing mark
  // removed by an edit, a second block was added at the end of the file; at
  // the next pass, everything between the old opening mark and the new end was
  // taken for the block and deleted: the person's own rules, without a copy.
  // Such a mark is now taken away with the lines after it that are the block's
  // own, and nothing else: what the plugin did not write is never removed.
  const own = new Set([...Object.values(TEXT).flat(), ...Object.values(MEMORY)]);
  let text = t;
  for (;;) {
    const i = text.indexOf(OPEN);
    if (i < 0) break;
    const j = text.indexOf(CLOSE, i);
    const other = text.indexOf(OPEN, i + OPEN.length);
    if (j >= 0 && (other < 0 || other > j)) break; // a whole block: replaced below
    const after = text.slice(i + OPEN.length).split("\n");
    let n = 1;
    while (n < after.length && (!after[n].trim() || own.has(after[n].trimEnd()))) n++;
    text = `${text.slice(0, i)}${after[0]}${n < after.length ? `\n${after.slice(n).join("\n")}` : ""}`;
  }
  const i = text.indexOf(OPEN);
  const j = i >= 0 ? text.indexOf(CLOSE, i) : -1;
  const next = i >= 0 && j > i ? text.slice(0, i) + block + text.slice(j + CLOSE.length) : `${text.trimEnd()}${text.trim() ? "\n\n" : ""}${block}\n`;
  if (next === t) return { ok: true, file, changed: false };
  // Written beside, then renamed: the person's global instructions are never half a file.
  if (!dry) writeFileAtomic(file, next.replace(/\n/g, nl));
  return { ok: true, file, changed: true, dry: dry || undefined };
}

const isMain = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/rules-block.mjs");
if (isMain) {
  const a = process.argv.slice(2);
  const opt = (n) => (a.includes(n) ? a[a.indexOf(n) + 1] : undefined);
  console.log(JSON.stringify(writeRulesBlock({ lang: opt("--lang"), file: opt("--file"), dry: a.includes("--dry") })));
}
