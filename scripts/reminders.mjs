// reminders.mjs - The two short instructions the hooks slip into the AI's
// context, at the moment a lesson is born and at the moment it is most
// easily lost (2026-11-22).
//
// Why: an audit of real conversations. The person corrects the AI ("stop
// doing that", "never...", "always..."), the AI obeys for the rest of the
// conversation and writes nothing in the brain: the next conversation makes
// the same mistake. And when a long conversation goes on over a summary of
// itself (Claude Code compacts it), the lessons read at its start are gone
// with the rest, and the AI makes the mistake again.
//  - hook-suggest.mjs, at each message of the person: when the message reads
//    like a correction or a rule, the AI is asked to save it as a lesson, in
//    its very answer, through the capture skill, after checking that the brain
//    does not hold it already;
//  - hook-resume.mjs, when a session starts again over a summary: the AI is
//    asked to read again the lessons of the subject in progress before going on.
// Both are written in the brain's language and can be turned off in its
// brain.json, under `reminders` (docs/reglages.md).
//
// STRONG AND WEAK PHRASES (2026-11-22, after labelling 48 real messages that
// set the reminder off: 9 were corrections, 39 were not). Words like "never",
// "always", "from now on" are everywhere in what a person writes: in a bug
// report ("the field is never read"), a question ("will it always do that?"),
// a text being written for a site, a brief pasted for another session. So:
//  - a STRONG phrase ("stop doing", "new rule", "I already told you", "keep it
//    in memory") is enough on its own;
//  - a WEAK phrase, written with a "~" in front ("~never", "~next time"),
//    counts only when its sentence speaks to the AI (you, an imperative, "we
//    must", "il faut") and is not a question, nor a description in a tense of
//    "to be" or "to have" ("I have never typed it", "tu es la version 5
//    désormais"), nor a condition ("si tu dois..."), nor the aim of a task
//    ("a skill that lets you do it faster next time").
// And the person's own words are what is left once quoted text ("..."),
// pasted blocks (<pasted_content>, ``` fences, "> " lines), long pasted
// paragraphs, long prompt files and the briefs one session writes for
// another are taken out.
// A missed correction costs more than a reminder said for nothing (a lesson
// lost against one sentence the AI ignores), so the list leans to saying it.
//
// LIGHT ON PURPOSE: a hook runs before every message, so this module reads
// one or two small files and imports nothing of the plugin. The detection is
// a few regular expressions: under a millisecond per message.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// What a correction or a rule sounds like, in the plugin's two languages. A
// phrase is matched without accents or capitals, as whole words; "..." stands
// for a few words of one clause (up to six); a phrase that starts with "^"
// must open a sentence or a clause (after a full stop, a colon, a new line, or
// a word like "ok", "so", "alors", "mais"); a phrase that starts with "~" is
// weak (see the head of this file). A brain adds its own under
// reminders.phrases, and drops these with reminders.defaults: false.
// Measured on 2026-11-22 against 2,750 real messages of one person over thirty
// days, labelled by hand: the former list rang 48 times, 9 of them for a
// correction; this one rings 27 times, 22 of them for a correction.
export const CORRECTIONS = [
  // French, strong: a reproach, a rule that is announced, a demand to remember.
  "^arrête de", "^arrête d'", "^arrêtez de", "^arrêtez d'", "^arrête avec", "tu arrêtes de", "tu arrêtes d'", "t'arrêtes de",
  "t'arrête de", "t'arrêtes d'", "^cesse de", "^cessez de", "nouvelle règle", "à partir de maintenant", "retiens que", "retiens bien",
  "retiens-le", "retiens ça", "souviens-toi", "rappelle-toi", "je t'ai déjà dit", "je te l'ai déjà dit", "je t'avais dit",
  "je te l'avais dit", "je t'ai déjà demandé", "je t'avais demandé", "je t'ai demandé de", "combien de fois", "note ... en mémoire",
  "noter ... en mémoire", "garde ... en mémoire", "mets ... en mémoire", "enregistre ... en mémoire", "garde ... en tête",
  "que ça n'arrive plus", "que ça ne se reproduise", "ça ne doit plus arriver", "ne refais plus", "ne refais jamais",
  "ne recommence pas", "ne recommence plus", "pourquoi tu refais", "pourquoi tu recommences", "pourquoi tu continues",
  "pourquoi fais-tu", "pourquoi tu fais", "pourquoi tu as encore", "pourquoi tu relances", "pourquoi ne l'as-tu pas",
  "pourquoi tu ne l'as pas", "pourquoi tu as dû", "pourquoi as-tu dû", "pourquoi t'as dû",
  // French, weak: a rule only when said to the AI, and not asked.
  // Not "toujours" alone: it says "still" as often as "always" ("le cockpit
  // affiche toujours en cours").
  "~ne ... jamais", "~n' ... jamais", "~plus jamais", "~^jamais", "~^toujours", "~il faut toujours", "~faut toujours",
  "~tu ... toujours", "~vous ... toujours", "~on doit toujours", "~tu ne ... plus", "~tu n' ... plus", "~évite de", "~évite d'",
  "~dorénavant", "~désormais", "~à l'avenir", "~la prochaine fois", "~les prochaines fois", "~à chaque fois que tu",
  "~chaque fois que tu", "~à chaque fois que vous", "~chaque fois que vous",
  "~systématiquement", "~n'oublie pas", "~n'oublie jamais", "~fais ... attention à ce que", "~fais ... attention à ne",
  "~faites ... attention à ce que", "~faites ... attention à ne", "~^attention à ne pas", "~tu dois", "~vous devez", "~^à noter",
  "~note bien", "~tu as encore", "~ta réponse est", "~tes réponses sont",
  // English, strong.
  "^stop", "stop doing", "stop using", "stop adding", "stop writing", "stop making", "stop putting", "quit doing", "don't ever",
  "do not ever", "never ever", "^never", "^always", "you should always", "you must always", "you should never", "you must never",
  "please never", "please always", "from now on", "new rule", "^remember that", "remember this", "i told you", "i already told you",
  "i've told you", "i asked you to", "i already asked you", "how many times", "keep ... in mind", "make a note", "why do you keep",
  "why did you", "why are you still", "don't do that again", "never do that again", "that should not happen again",
  // English, weak.
  "~going forward", "~in the future", "~next time", "~remember to", "~don't forget", "~never", "~always", "~every time you",
  "~each time you", "~be careful", "~you keep", "~your answer is", "~your answers are",
];

const flat = (s) => String(s ?? "").normalize("NFD").replace(/\p{Mn}/gu, "").toLowerCase().replace(/[’‘`]/g, "'");
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Where a sentence or a clause opens, for "^": the text's start, a full stop,
// a colon, a new line, an arrow; then up to three words that only lead in
// ("Ok so stop", "Attends, arrête de", "Non mais arrête de"). Not a
// parenthesis: "(jamais le nom d'un client)" qualifies, it does not rule.
const LEAD = "(?:ok|okay|bon|alors|donc|mais|et|non|oui|attends?|stp|ah|bah|euh|eh|so|and|but|no|yes|please|hey|wait)";
const OPEN = `(?:^|[.!?\\n:;]|=>)\\s*(?:${LEAD}[\\s,!]+){0,3}`;

/** Whether a phrase is weak (starts with "~", see the head of this file). */
export const isWeak = (phrase) => flat(phrase).trim().startsWith("~");

/** A phrase as a regular expression on the folded text (see CORRECTIONS). */
export function phraseRegex(phrase, flags = "u") {
  let p = flat(phrase).trim();
  if (p.startsWith("~")) p = p.slice(1).trim();
  const start = p.startsWith("^");
  if (start) p = p.slice(1).trim();
  const tokens = p.split(/\s+/).filter(Boolean);
  let src = "";
  tokens.forEach((t, i) => {
    if (t === "..." || t === "…") {
      src += "(?:[^\\s.,;:!?]+\\s+){0,6}?"; // within one clause
      return;
    }
    src += escape(t);
    const next = tokens[i + 1];
    if (next === undefined) return;
    if (t.endsWith("'")) return; // "n'" sticks to the next word
    // A whole word before the gap: "garde ... en mémoire" is not "garder en mémoire".
    if (next === "..." || next === "…") src += "(?![\\p{L}\\p{N}])\\s*";
    else src += "\\s+";
  });
  const head = start ? OPEN : "(?<![\\p{L}\\p{N}'])";
  // A phrase that ends on an apostrophe ("arrête d'") goes on into the next word.
  const tail = p.endsWith("'") ? "" : "(?![\\p{L}\\p{N}])";
  return new RegExp(`${head}${src}${tail}`, flags);
}

// A paragraph longer than this is taken for something pasted (a report, a
// brief, a mail), not for the person's own words: in the 48 labelled
// messages, no correction sat in a paragraph of more than 700 characters.
const LONG_PARAGRAPH = 1500;

/**
 * The person's own words in a message, folded: without quoted code, pasted
 * blocks, quotations and the messages one session writes for another.
 */
export function ownWords(text) {
  let s = String(text ?? "");
  // Claude Code's own wrappers: a report a subagent hands back, the brief a
  // session leaves to the one it starts. Nobody typed them.
  if (/^\s*(another claude session sent a message|background \(from the session)/i.test(s)) return "";
  // A long message that opens on a Markdown title is a prompt file (a skill,
  // a scheduled job), whose rules are for the AI that runs it.
  if (s.length > LONG_PARAGRAPH && /^\s*#{1,3} \S/.test(s)) return "";
  s = s
    .replace(/```[\s\S]*?(```|$)/g, " ")
    // A pasted block; its closing tag may carry the same attributes as the
    // opening one (</pasted_content id="x">), which the old pattern missed.
    .replace(/<([a-z_-]+)\b[^>]*>[\s\S]*?<\/\1\b[^>]*>/gi, " ")
    .replace(/^[ \t]*>.*$/gm, " ")
    // Quotations: a sentence of a text being worked on, a phrase of the AI's
    // answer the person reacts to. Its "never" is not the person's rule.
    .replace(/"[^"]{0,1500}"/g, " ")
    .replace(/«[^»]{0,1500}»/g, " ")
    .replace(/“[^”]{0,1500}”/g, " ");
  s = s.split(/\n[ \t]*\n/).filter((p) => p.length <= LONG_PARAGRAPH).join("\n\n");
  return flat(s).slice(0, 4000);
}

// Imperatives that open a clause, in both languages, on the folded text.
const IMPERATIVES = [
  "fais", "faites", "mets", "met", "mettez", "ecris", "ecrivez", "utilise", "utilisez", "ajoute", "ajoutez", "enleve", "retire",
  "evite", "evitez", "demande", "demandez", "pense", "verifie", "garde", "laisse", "prends", "lance", "relance", "cree", "propose",
  "dis", "donne", "passe", "reponds", "commence", "termine", "oublie", "essaie", "privilegie", "prefere", "choisis", "range", "note",
  "previens", "montre", "explique", "relis", "cherche", "regarde", "arrete", "continue", "respecte", "redige", "corrige", "supprime",
  "attention", "never", "always", "don't", "do not", "use", "stop", "avoid", "make", "keep", "write", "put", "add", "ask", "check", "remember",
  "be", "try", "prefer", "start", "answer", "reply", "say", "tell", "send", "run", "read", "look",
].join("|");
// What makes a sentence speak to the AI: you, an imperative, a rule for "us"
// or for whoever does the work ("il faut", "we must"), a rule that opens the
// sentence ("Jamais de...", "Ne jamais...").
const ADDRESSED = new RegExp(
  [
    "\\b(?:tu|te|toi|vous|ton|ta|tes|votre|vos)\\b",
    "(?<!\\p{L})t'(?=\\p{L})",
    "\\bil (?:ne |n')?faut\\b",
    "(?<!\\p{L})faut que\\b",
    "\\bon (?:ne |n')?(?:doit|devrait|devra)\\b",
    // Not "the AI" or "Claude": a person talks about them as a subject as much
    // as to them ("so that the AI uses the brain each time it needs to").
    "\\b(?:you|your|yourself)\\b",
    "\\bwe (?:should|must|never|always)\\b",
    "\\blet's\\b",
    `(?:^|[,;:(]|\\b(?:et|puis|mais|alors|donc|ok|bon|non|and|then|but|so|please)\\b)\\s*(?:ne |n')?(?:${IMPERATIVES})\\b`,
    `^(?:${LEAD}[\\s,!]+)*(?:ne |n')?(?:jamais|plus jamais|toujours)\\b`,
    "^(?:ne|n') ?(?:jamais|plus)\\b",
  ].join("|"),
  "u",
);
// A question that is a request: "comment faire en sorte que désormais...".
const REQUEST = /\b(?:comment faire (?:en sorte |pour )?que|fais en sorte|faire en sorte|how (?:do|can) (?:we|i) make sure|make sure)\b/;
// "To be" and "to have" around "never" or "always" make a description: "je
// n'ai jamais tapé", "il est toujours cassé", "it has never worked".
// Conjugated only: "il ne faut jamais avoir" is a rule.
const AUX = /\b(?:ai|as|a|avons|avez|ont|avais|avait|avions|aviez|avaient|aura|aurait|suis|es|est|sommes|etes|sont|etais|etait|etions|etaient|sera|seront|serait|ete|have|has|had|was|were|is|are|am|been)\b|(?<!let)'(?:ve|s|re|m)\b/;
const TIMELESS = /\b(?:jamais|toujours|plus|never|always|ever)\b/;
// "From now on" describes as often as it rules: "tu es la version 5
// désormais", "désormais il y a une interface", "j'ai désormais des crédits".
// The verb may sit a few words away, on either side.
const FROM_NOW = /\b(?:desormais|dorenavant|a l'avenir|going forward|in the future)\b/;
// A full stop ends a sentence, but not inside a number ("version 5.2").
const isBound = (s, i) => /[!?\n]/.test(s[i]) || (s[i] === "." && !(/\d/.test(s[i - 1] ?? "") && /\d/.test(s[i + 1] ?? "")));
const words = (s) => s.match(/[\p{L}\p{N}']+(?:\.\d+)*/gu) ?? []; // "5.2" is one word

// What a weak phrase means depends at times on the next words.
const UNDONE = [
  [/(?:dois|devez|must)$/, /^\s+(?:pouvoir|avoir|etre|y avoir|be able|have)\b/], // "tu dois pouvoir le faire": an expectation
  [/a noter$/, /^\s+(?:dans|en|sur|au|aux)\b/], // "à noter dans le CRM": a task, file it there
];
const NEXT_TIME = /\b(?:la prochaine fois|les prochaines fois|next time)\b/;
const PURPOSE = /\b(?:pour qu|pour que|afin (?:de|que|qu)|qui (?:te |vous |me |nous )?permet|so that|in order to)/;

/** Whether one match of a weak phrase counts (see the head of this file). */
function weakCounts(own, m) {
  const end = m.index + m[0].length;
  let a = end - 1;
  while (a >= 0 && !isBound(own, a)) a--;
  let b = end;
  while (b < own.length && !isBound(own, b)) b++;
  const sentence = own.slice(a + 1, b).trim();
  const request = REQUEST.test(sentence);
  if (own[b] === "?" && !request) return false;
  if (!request && !ADDRESSED.test(sentence)) return false;
  // A condition is not a rule: "si tu dois réduire une colonne", "if you never...".
  const before = words(own.slice(a + 1, m.index));
  if (["si", "if", "s'il"].includes(before.at(-1))) return false;
  // The words right after that undo the phrase.
  const after = own.slice(end);
  for (const [phrase, next] of UNDONE) if (phrase.test(m[0]) && next.test(after)) return false;
  // "Next time" in a clause of purpose is the aim of a task, not a rule: "a
  // skill that lets you do it faster next time".
  if (NEXT_TIME.test(m[0]) && PURPOSE.test(own.slice(a + 1, m.index))) return false;
  if (FROM_NOW.test(m[0])) {
    // Within its clause: "désormais, tu as la main" keeps its rule.
    const left = own.slice(a + 1, m.index).split(/[,;:]/).at(-1);
    const right = own.slice(end, b).split(/[,;:]/)[0];
    const near = [...words(left).slice(-5), ...words(right).slice(0, 3)];
    if (near.some((w) => AUX.test(w))) return false;
  } else if (TIMELESS.test(m[0])) {
    const prev = own.slice(Math.max(0, m.index - 30), m.index).match(/([\p{L}']+)\s*$/u)?.[1] ?? "";
    if (AUX.test(m[0]) || AUX.test(prev)) return false;
    if (/toujours$/.test(m[0]) && /^\s+pas\b/.test(own.slice(end))) return false; // "toujours pas": still not
  }
  return true;
}

/** Whether a message reads like a correction or a rule. */
export function soundsLikeRule(text, phrases = CORRECTIONS) {
  const own = ownWords(text);
  if (!own.trim()) return false;
  return phrases.some((p) => {
    try {
      if (!isWeak(p)) return phraseRegex(p).test(own);
      for (const m of own.matchAll(phraseRegex(p, "gu"))) if (weakCounts(own, m)) return true;
      return false;
    } catch {
      return false;
    }
  });
}

/**
 * The brain's settings the hooks need, read straight from its brain.json:
 * its language, its word for a lesson, and its `reminders`. Null when no
 * brain is set up.
 */
export function brainSettings() {
  const home = process.env.HVBRAIN_HOME || homedir();
  let dir = process.env.HVBRAIN_DIR;
  if (!dir) {
    try {
      dir = JSON.parse(readFileSync(join(home, ".hypervibe-brain", "config.json"), "utf8")).brain;
    } catch {
      dir = "";
    }
  }
  if (!dir || !existsSync(join(dir, "brain.json"))) return null;
  let cfg = {};
  try {
    cfg = JSON.parse(readFileSync(join(dir, "brain.json"), "utf8"));
  } catch {
    return null;
  }
  const fr = (cfg.lang ?? cfg.format) === "fr";
  // The brain's own word for a lesson: what its natures say (lesson, lecon...).
  const natures = Object.values(cfg.natures ?? {}).flat().map(String);
  const lesson = natures.find((n) => ["lesson", "lecon"].includes(flat(n))) ?? (cfg.format === "fr" ? "lecon" : "lesson");
  const r = cfg.reminders ?? {};
  const phrases = [...(r.defaults === false ? [] : CORRECTIONS), ...[].concat(r.phrases ?? []).map(String)];
  return { fr, lesson, corrections: r.corrections !== false, resume: r.resume !== false, phrases };
}

/** The instruction slipped in after a message that reads like a rule. */
export function correctionText({ fr, lesson }) {
  return fr
    ? `Ce message ressemble à une correction ou à une règle de travail. Si c'en est une qui doit durer, enregistre-la dans le brain comme leçon dans cette réponse même : cherche d'abord qu'elle n'y est pas déjà (brain_search avec nature: "${lesson}"), puis écris-la avec la skill /brain:capture (nature ${lesson}), en une phrase qui dit la règle et pourquoi. Si elle existe déjà, ne la double pas. Si ce n'est qu'une consigne pour cette tâche, ignore ce rappel.`
    : `This message reads like a correction or a working rule. If it is one that should last, save it in the brain as a lesson in this very answer: first check that it is not there already (brain_search with nature: "${lesson}"), then write it with the /brain:capture skill (nature ${lesson}), in one sentence that says the rule and why. If it exists already, do not write it twice. If it is only an instruction for this task, ignore this reminder.`;
}

/** The instruction slipped in when a session goes on over a summary of itself. */
export function resumeText({ fr, lesson }) {
  return fr
    ? `La conversation reprend sur un résumé : les leçons lues plus tôt n'y sont plus. Avant de reprendre le travail, relis les leçons du brain sur le sujet en cours (brain_search avec nature: "${lesson}" et les mots du sujet, une ou deux recherches), et applique-les.`
    : `The conversation goes on over a summary: the lessons read earlier are no longer in it. Before going back to work, read again the brain's lessons on the subject in progress (brain_search with nature: "${lesson}" and the words of the subject, one or two searches), and apply them.`;
}
