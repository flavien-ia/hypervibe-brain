#!/usr/bin/env node
// tests/zones/usage.mjs - The checks of one zone of the plugin: how the AI
// uses the brain (2026-11-22, after an audit of real conversations). The
// natures asked in any word, the search by default rather than meaning alone,
// the suggestions of the hook (names, gate, short messages, diversity of
// types, a sentence each, the budget), the lessons at the moment they are
// born and after a summary, the facts that replace what a note said, and the
// page of the settings.
//
// In a throwaway brain under the system's temporary folder, with a fake home
// (HVBRAIN_HOME) and a fake embeddings API (tests/faux-embeddings.mjs).
// Nothing here touches the real brain, the real ~/.hypervibe-brain, the live
// view of the person (the hook is pointed at a port nobody listens on) nor a
// paid API.
//
//   node tests/zones/usage.mjs [--keep]
//
// Prints one line per check (ok / FAIL), and exits 1 when one failed.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PLUGIN = join(HERE, "..", "..");
const SCRIPTS = join(PLUGIN, "scripts");
const BASE = join(tmpdir(), `brain-zone-usage-${process.pid}`);
const HOME = join(BASE, "home");
const BRAIN = join(BASE, "brain");
const FR_BRAIN = join(BASE, "cerveau");
const HB = join(HOME, ".hypervibe-brain");
rmSync(BASE, { recursive: true, force: true });
mkdirSync(HOME, { recursive: true });

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 700)}` : ""}`);
  }
};
const section = (name) => console.log(`\n${name}`);

/** A port nobody listens on: the hook must never reach the person's own live view. */
const freePort = () =>
  new Promise((res) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
const DEAD_PORT = await freePort();

const env = {
  ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: "", OPENAI_API_KEY: "", EMBEDDINGS_API_KEY: "", EMBEDDINGS_BASE_URL: "", HVBRAIN_NO_WINDOW: "1", HVBRAIN_RULES_BLOCK: "off",
  HVBRAIN_VAULT: "off", HVBRAIN_WHO: "", HVBRAIN_SUGGEST: "", CLAUDE_CODE_OAUTH_TOKEN: "", BRAIN_LIVE_PORT: String(DEAD_PORT),
};
const run = (cmd, a, o = {}) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, a, { cwd: BASE, env: { ...env, ...o.env }, input: o.input ?? "", encoding: "utf8", windowsHide: true });
  const err = String(r.stderr ?? "").split("\n").filter((l) => !/ExperimentalWarning|trace-warnings/.test(l)).join("\n").trim();
  return { ok: r.status === 0, status: r.status, out: r.status === 0 ? r.stdout : `${r.stdout}${err}`, stdout: r.stdout ?? "", err, ms: Date.now() - t0 };
};
const node = (script, a = [], o = {}) => run("node", [join(SCRIPTS, script), ...a], o);
const json = (s) => {
  const i = s.search(/^[[{]/m);
  return JSON.parse(i >= 0 ? s.slice(i) : s);
};
const U = (f) => pathToFileURL(join(SCRIPTS, f)).href;
/** Runs a few lines that import the plugin's modules, in a program of their own; gives back what they print as JSON. */
const mod = (code, o = {}) => {
  const r = run("node", ["--input-type=module", "-e", code], o);
  try {
    return { ...r, value: json(r.stdout) };
  } catch {
    return { ...r, value: null };
  }
};
const build = (opts = {}, o = {}) => mod(`const m = await import(${JSON.stringify(U("build.mjs"))}); const r = await m.buildIndex({ quiet: true, ...${JSON.stringify(opts)} }); console.log(JSON.stringify(r));`, o).value;
const tool = (name, args = {}, o = {}) => {
  const r = node("tool.mjs", [name], { ...o, input: JSON.stringify(args) });
  try {
    return { ...JSON.parse(r.stdout.trim().split("\n").pop()), ms: r.ms };
  } catch {
    return { ok: false, error: `no answer: ${r.out}`, ms: r.ms };
  }
};
const writeNote = (slug, { title = slug, body = "x", type = "note", folder = "notes", domains = "[a]", status = "seed", extra = "" } = {}) => {
  mkdirSync(join(BRAIN, "vault", folder), { recursive: true });
  writeFileSync(join(BRAIN, "vault", folder, `${slug}.md`), `---\ntype: ${type}\ntitle: "${title}"\ndomains: ${domains}\nstatus: ${status}\nvisibility: internal\ncreated: 2026-03-01\nupdated: 2026-10-01\nsource: "zone"\n${extra}---\n\n${body}\n`, "utf8");
};
const brainJson = () => JSON.parse(readFileSync(join(BRAIN, "brain.json"), "utf8"));
const setBrainJson = (patch) => writeFileSync(join(BRAIN, "brain.json"), `${JSON.stringify({ ...brainJson(), ...patch }, null, 2)}\n`, "utf8");
const said = (r) => {
  try {
    return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.additionalContext ?? "" : "";
  } catch {
    return `not JSON: ${r.stdout}`;
  }
};

const fake = spawn("node", [join(HERE, "..", "faux-embeddings.mjs")], { windowsHide: true });
const port = await new Promise((res) => fake.stdout.once("data", (d) => res(Number(String(d).trim()))));
const EMB = { EMBEDDINGS_API_KEY: "test-key", EMBEDDINGS_BASE_URL: `http://127.0.0.1:${port}/v1` };
const embedCalls = () => Number(run("node", ["-e", `fetch("http://127.0.0.1:${port}/count").then((r) => r.text()).then((t) => console.log(t))`]).stdout.trim());

try {
  console.log(`\nZone usage, in ${BASE}\n`);

  // ---------------------------------------------------------------- a brain
  let r = node("init.mjs", ["--dir", BRAIN, "--name", "Zoe", "--domains", "a,b", "--lang", "en", "--switch", "--no-git", "--types", "note:notes,person:people,intervention:interventions"]);
  if (!r.ok) throw new Error(`the throwaway brain could not be created: ${r.out}`);
  setBrainJson({ natures: { note: ["decision", "feedback", "lesson"] }, domains: { a: { label: "Atelier", note: "atelier" }, b: { label: "Bureau", note: "bureau" } } });
  const FILL = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon".split(" ");
  for (let i = 0; i < 40; i++) writeNote(`fond-${i}`, { title: `Fond ${i}`, body: `${FILL.slice(i % 10, (i % 10) + 8).join(" ")} numero${i}.` });
  writeNote("marc-garnier", { title: "Marc Garnier", type: "person", folder: "people", body: "Marc Garnier dirige un cabinet d'architecture. Il a commandé une conférence pour son équipe en mars." });
  for (const [i, who] of ["Marc Durand", "Marc Lefort", "Marc Petit"].entries()) writeNote(`marc-${i}`, { title: who, type: "person", folder: "people", body: `${who} travaille dans le design.` });
  // A type that is many: six talks, all very close to the message about the garden.
  const GARDEN = "jardin potager arrosage tomates courgettes paillage compost semis";
  for (let i = 0; i < 6; i++) writeNote(`conf-jardin-${i}`, { title: `Conférence jardin ${i}`, type: "intervention", folder: "interventions", body: `${GARDEN} conference${i}. Une intervention donnée sur le potager.` });
  writeNote("note-jardin", { title: "Le potager de la maison", body: `Le potager se paille en mai. ${GARDEN.split(" ").slice(0, 6).join(" ")} maison.` });
  writeNote("lecon-arrosage", { title: "Arroser le soir", body: `Arroser le potager le soir, jamais en plein soleil. ${GARDEN}.`, extra: "nature: lesson\n" });
  writeNote("decision-prix", { title: "Le prix est fixé", body: "Le prix de la conférence est fixé à mille.", extra: "nature: decision\n" });
  writeNote("retour-client", { title: "Un retour de client", body: "Le client a aimé la conférence sur le potager.", extra: "nature: feedback\n" });
  let b = build({}, { env: EMB });
  check("a throwaway brain is built, with its vectors", b?.ok && embedCalls() > 0, JSON.stringify(b)?.slice(0, 300));

  // ---------------------------------------------------------------- A
  section("A. A nature, a type or a domain, in the brain's word or another (constat 1)");
  for (const asked of ["lecon", "Leçon", "LESSON", "lessons", "leçons"]) {
    const t = tool("brain_search", { query: "potager", nature: asked, words: true });
    check(`nature "${asked}" finds the lessons of a brain that says "lesson"`, t.ok && Array.isArray(t.result) && t.result.length === 1 && t.result[0].slug === "lecon-arrosage", JSON.stringify(t).slice(0, 300));
  }
  let t = tool("brain_search", { query: "conférence", nature: "retour", words: true });
  check("nature \"retour\" finds the feedback, \"décision\" the decisions", t.ok && t.result?.[0]?.slug === "retour-client" && tool("brain_search", { query: "prix", nature: "décision", words: true }).result?.[0]?.slug === "decision-prix", JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "potager", nature: "souvenir" });
  check("a nature no language has still answers with the natures the brain has", t.ok && String(t.result?.error).includes("souvenir") && t.result.known?.includes("lesson"), JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "Marc", type: "people", words: true });
  check("a type asked by its folder (\"people\") is the type (\"person\")", t.ok && Array.isArray(t.result) && t.result.length === 4 && t.result.every((x) => x.type === "person"), JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "Marc", type: "Persons", words: true });
  check("and by a capital and a plural", t.ok && Array.isArray(t.result) && t.result.length === 4, JSON.stringify(t).slice(0, 300));
  t = tool("brain_search", { query: "Marc", domain: "Atelier", words: true });
  check("a domain asked by its label is the domain", t.ok && Array.isArray(t.result) && t.result.length === 4, JSON.stringify(t).slice(0, 300));
  t = tool("brain_timeline", { type: "interventions" });
  check("the timeline takes a type by its folder too", t.ok && Array.isArray(t.result) && t.result.length === 6, JSON.stringify(t).slice(0, 300));
  r = node("query.mjs", ["search", "potager", "--nature", "lecon", "--words", "--json"]);
  check("and so does the command line", r.ok && json(r.out).some((x) => x.slug === "lecon-arrosage"), r.out);
  {
    const v = mod(`const p = await import(${JSON.stringify(U("pure.mjs"))}); console.log(JSON.stringify({ a: p.pickKnown("lecon", ["decision", "lesson"], { kind: "nature" }), b: p.pickKnown("feedback", ["decision", "retour", "lecon"], { kind: "nature" }), c: p.pickKnown("lecon", ["decision", "lesson"]), d: p.pickKnown("zz", ["a"]), e: p.natureOf("Leçon") }));`).value;
    check("in a French brain, \"feedback\" is \"retour\"; outside a nature, nothing is translated", v?.a === "lesson" && v.b === "retour" && v.c === "lecon" && v.d === "zz" && v.e === "lesson", JSON.stringify(v));
  }

  // ---------------------------------------------------------------- B
  section("B. The search by default, not meaning alone (constat 2)");
  {
    const v = mod(`const m = await import(${JSON.stringify(U("tools.mjs"))}); const s = m.TOOLS.find((x) => x.name === "brain_search"); console.log(JSON.stringify({ i: m.instructionsFor("Zoe"), meaning: s.inputSchema.properties.meaning.description, nature: s.inputSchema.properties.nature.description, size: JSON.stringify(m.TOOLS).length }));`).value;
    check("the instructions say to keep the default search, and that meaning alone misses names", /by default it looks by words and by meaning/.test(v?.i) && /meaning alone[^.]*misses names/.test(v?.i), v?.i);
    check("the parameter meaning says: never for a name", /never for a name/.test(v?.meaning ?? ""), v?.meaning);
    check("the parameter nature gives the real values, in both languages", /lesson, decision, feedback/.test(v?.nature ?? "") && /lecon/.test(v?.nature ?? ""), v?.nature);
    check("the descriptions stay short", v?.size < 4800, String(v?.size));
  }
  t = tool("brain_search", { query: "Marc Garnier", limit: 3 }, { env: EMB });
  check("the search by default finds a person by their name first", t.ok && t.result?.[0]?.slug === "marc-garnier", JSON.stringify(t).slice(0, 300));

  // ---------------------------------------------------------------- C
  section("C. The suggestions of the hook (constat 3)");
  const hook = (prompt, extraEnv = {}, input = {}) => run("node", [join(SCRIPTS, "hook-suggest.mjs")], { input: JSON.stringify({ prompt, session_id: `zone-${Math.random()}`, ...input }), env: { ...EMB, ...extraEnv } });
  const lastUsage = () => JSON.parse(readFileSync(join(HB, "usage.jsonl"), "utf8").trim().split("\n").pop());
  let calls = embedCalls();
  r = hook("Qui est Marc Garnier ?");
  let s = said(r);
  check("a short message that names a note gets that note, by its name", r.ok && /\[marc-garnier\]/.test(s) && !/marc-[0-9]/.test(s), s || r.out);
  check("and the embeddings API was not asked: too short for meaning", embedCalls() === calls, `${embedCalls() - calls} calls`);
  check("each suggestion carries its type and its closest sentence", /\[marc-garnier\] \(person\): "Marc Garnier dirige un cabinet d'architecture\./.test(s), s);
  for (const p of ["oui vas y, continue et pousse", "vérifie que le tarif est le même", "ok go", "yes, go ahead and push it"]) {
    calls = embedCalls();
    r = hook(p);
    check(`nothing for a message of execution: "${p}"`, r.ok && r.stdout.trim() === "" && embedCalls() === calls, `${r.stdout} ${embedCalls() - calls} calls`);
  }
  r = hook(`Prépare une note sur le ${GARDEN} pour la maison`);
  s = said(r);
  const talks = (s.match(/\[conf-jardin-\d\]/g) ?? []).length;
  check("a long message gets the notes closest by meaning, and its lessons apart", r.ok && /^The second brain may have something/.test(s) && /Lessons that may apply:\n- Arroser le soir \[lecon-arrosage\]/.test(s), s || r.out);
  check("within a second and a half, with the best closeness in the journal", lastUsage().tool === "(suggestion)" && lastUsage().ms <= 1500 && typeof lastUsage().best === "number", JSON.stringify(lastUsage()));
  check("a gate near the best closeness: what is far below it is left out", !/\[fond-\d+\]/.test(s), s);
  // (A message without "maison": the note "Le potager de la maison" is then found by meaning, not by its name.)
  const SPRING = `Prépare une note sur le ${GARDEN} pour le printemps`;
  setBrainJson({ suggest: { margin: 0.5, gate: 0.3, typeMargin: 0.5 } });
  r = hook(SPRING);
  s = said(r);
  const many = (s.match(/\[conf-jardin-\d\]/g) ?? []).length;
  const shown = s.split("Lessons that may apply:")[0].match(/^- /gm)?.length ?? 0;
  check("a type that is many does not take every place when another type is close", many === 2 && shown === 4, `${many} talks: ${s}`);
  setBrainJson({ suggest: { margin: 0.5, gate: 0.3, typeMargin: 0 } });
  r = hook(SPRING);
  s = said(r);
  check("but several of one type pass when they are clearly closer (typeMargin)", (s.match(/\[conf-jardin-\d\]/g) ?? []).length >= 3, s);
  setBrainJson({ suggest: { gate: 0.99 } });
  r = hook(SPRING);
  check("the gate is the brain's to set (brain.json, suggest.gate)", r.ok && r.stdout.trim() === "", r.stdout);
  setBrainJson({ suggest: { names: false } });
  r = hook("Qui est Marc Garnier ?");
  check("and so are the names (suggest.names)", r.ok && r.stdout.trim() === "", r.stdout);
  setBrainJson({ suggest: {} });
  {
    const v = mod(`const m = await import(${JSON.stringify(U("suggest.mjs"))});
      const c = (type, rank) => ({ type, rank, slug: type + rank });
      const a = m.diversify([c("i", 0.9), c("i", 0.89), c("i", 0.88), c("n", 0.87)], { limit: 4, perType: 2, typeMargin: 0.03 }).map((x) => x.type).join("");
      const b = m.diversify([c("i", 0.9), c("i", 0.89), c("i", 0.88)], { limit: 4, perType: 2, typeMargin: 0.03 }).length;
      const d = m.diversify([c("i", 0.9), c("i", 0.89), c("i", 0.88), c("n", 0.5)], { limit: 3, perType: 2, typeMargin: 0.03 }).map((x) => x.type).join("");
      const e = m.prefilter("pousse le jardin", m.settings({ execution: ["jardin", "-pousse"] })).words.join();
      console.log(JSON.stringify({ a, b, d, e, p: m.prefilter("ok go, pousse et continue").count, q: m.prefilter("Voici le plan du jardin potager avec tomates courgettes et paillage du compost").ok, cap: [...m.capitalsOf("Acme a payé. Le client Garnier aussi")] }));`).value;
    check("the diversity: a third of one type waits for another type close enough", v?.a === "iini", JSON.stringify(v));
    check("and passes when no other type is waiting, or when it is clearly closer", v?.b === 3 && v.d === "iii", JSON.stringify(v));
    check("the prefilter counts the meaningful words, the words of execution aside", v?.p === 0 && v.q === true, JSON.stringify(v));
    check("a brain adds its words of execution, or takes one out (suggest.execution)", v?.e === "pousse", JSON.stringify(v));
    check("a capital inside a sentence marks a name, one at its start does not", JSON.stringify(v?.cap) === JSON.stringify([["acme", false], ["le", false], ["garnier", true]]), JSON.stringify(v?.cap));
  }
  for (const auto of ["<agent-message from=\"x\">Marc Garnier a été ajouté</agent-message>", "<scheduled-task name=\"x\">Qui est Marc Garnier</scheduled-task>", "<cross-session-message from=\"y\">Qui est Marc Garnier</cross-session-message>"]) {
    r = hook(auto);
    check(`nothing for a message no person wrote: ${auto.slice(1, auto.indexOf(" "))}`, r.ok && r.stdout.trim() === "", r.stdout);
  }
  r = hook("Qui est Marc Garnier ? Arrête de me tutoyer.", { HVBRAIN_WHO: "ai:conversations" });
  check("nothing for a background reader of the brain (HVBRAIN_WHO=ai:...)", r.ok && r.stdout.trim() === "", r.stdout);

  // ---------------------------------------------------------------- D
  section("D. The lessons at the moment they are born, and after a summary (constat 4)");
  r = hook("Arrête de me tutoyer dans les mails.");
  s = said(r);
  check("a correction gets the reminder to save it as a lesson, with the capture skill and the brain's word", /reads like a correction or a working rule/.test(s) && /\/brain:capture/.test(s) && /nature: "lesson"/.test(s), s || r.out);
  for (const p of ["From now on, always sign with my first name", "Ne mets jamais de tiret dans un titre", "Nouvelle règle : tu me demandes avant de lancer un banc", "I already told you to use pnpm", "stop adding comments everywhere"]) {
    check(`the reminder for: "${p}"`, /working rule/.test(said(hook(p))));
  }
  for (const p of ["Il est toujours cassé, regarde", "Je n'ai pas d'autres banques, si jamais c'était refusé ?", "Quel est le prix de la conférence ?"]) {
    check(`no reminder for: "${p}"`, !/working rule/.test(said(hook(p))));
  }
  // Cases drawn from labelled real messages (2026-11-22), told again in a few
  // words: before, 9 of the 48 alarms were corrections, and corrections said
  // as "faut que t'arrêtes de" or "note en mémoire" went unseen.
  {
    const rules = [
      "Attends, arrête de lancer des tests dans tous les sens !",
      "Ok alors arrête de relancer la recette à chaque modif.",
      "Faut que t'arrêtes de refaire tout le banc à chaque petite correction.",
      "C'est pas malin, faut que tu arrêtes de faire ça !",
      "Pour la prochaine fois, tu peux le faire sans me demander, à noter.",
      "Enlève-les et fais en sorte de ne plus jamais mettre ça.",
      "Et fais très attention à ce que ça ne sonne pas comme une IA !",
      "On ne devrait jamais lancer toutes les recettes d'un coup.",
      "Ah et note en mémoire que pour ce service il faut indiquer les droits.",
      "Ok pour la correction. Et fais attention à ce que ça n'arrive plus !",
      "Pourquoi tu refais tout le banc ? On l'a déjà passé non ?",
      "À noter : quand tu ranges une facture, tu peux supprimer le fichier ensuite.",
      "Normalement tu dois m'indiquer à la fin ce que tu n'as pas pu récupérer.",
      "Non mais là ta réponse est beaucoup trop longue... fais plus naturel",
      "Comment faire en sorte que désormais tu écrives tes notes dans le brain ?",
      "Les pièces jointes zip ne passent pas dans un mail (à noter en mémoire).",
      "Why do you keep rewriting the whole file?",
      "Please make sure you never push without asking me.",
      "Next time, ask me before you run the tests.",
      "You always forget to run the linter.",
    ];
    const notRules = [
      `Le texte dit "Ne jamais afficher le prix par part" : non, ce n'est pas une règle à garder.`,
      "Je n'ai jamais tapé le mot de passe.",
      "Les nouveaux fournisseurs ne sont jamais proposés d'eux-mêmes ? C'est vrai ?",
      "Est-ce que ça risque de compliquer le travail à l'avenir ?",
      "Tu es la version 5.2 désormais, tu verras peut-être d'autres bugs.",
      "Désormais il n'y a plus besoin de relancer l'application.",
      "J'ai désormais des crédits offerts chaque mois.",
      "Et quand elle termine, en trois secondes l'ensemble arrête de briller.",
      "Pourquoi l'IA ne le fait presque jamais ?",
      "Le tableau affiche toujours en cours : regarde le problème et corrige.",
      "Si tu dois réduire une colonne, passe le titre sur deux lignes.",
      "Tu dois pouvoir modifier un client, vérifie bien.",
      "Crée-toi une skill qui te permette de faire ça plus vite la prochaine fois.",
      "À noter dans le CRM, et prépare le brouillon où tu mets ma signature.",
      `<pasted_content id="ab12">Le champ n'est jamais lu. Ne jamais réécrire le fichier.</pasted_content id="ab12"> Tu peux regarder ?`,
      `Another Claude session sent a message: <agent-message from="x">Never push without asking.</agent-message>`,
      "Background (from the session that started this one): ne jamais écraser le travail des autres sessions.",
      "Pour chaque groupe, propose un nom de thème (jamais le nom d'une personne).",
      "It has never worked on Windows, look at the logs.",
      "Will it always do that?",
    ];
    const v = mod(`const m = await import(${JSON.stringify(U("reminders.mjs"))});
      const rules = ${JSON.stringify(rules)}, notRules = ${JSON.stringify(notRules)};
      const long = "Voici le rapport. ".repeat(1500) + "Arrête de me tutoyer.";
      const t = performance.now(); for (let i = 0; i < 20; i++) m.soundsLikeRule(long); const ms = (performance.now() - t) / 20;
      console.log(JSON.stringify({ missed: rules.filter((x) => !m.soundsLikeRule(x)), wrong: notRules.filter((x) => m.soundsLikeRule(x)), ms,
        weakOwn: [m.soundsLikeRule("Tu mets toujours un tiret.", ["~toujours"]), m.soundsLikeRule("Est-ce que tu mets toujours un tiret ?", ["~toujours"]), m.soundsLikeRule("Il est toujours cassé.", ["~toujours"])] }));`).value ?? {};
    check(`a correction said in so many ways gets the reminder (${rules.length} cases)`, v.missed?.length === 0, JSON.stringify(v.missed));
    check(`and a "never" or "always" that is no rule does not (${notRules.length} cases: quoted, pasted, asked, described, conditional, briefs between sessions)`, v.wrong?.length === 0, JSON.stringify(v.wrong));
    check("a weak phrase of the brain's own (\"~toujours\") counts only said to the AI, not asked, not described", JSON.stringify(v.weakOwn) === "[true,false,false]", JSON.stringify(v.weakOwn));
    check("and the detection stays instant on a long pasted message", typeof v.ms === "number" && v.ms < 50, `${v.ms} ms`);
  }
  r = hook("Qui est Marc Garnier ? Arrête de me tutoyer.");
  s = said(r);
  check("the reminder and the suggestions go together, the reminder first", /^This message reads like a correction/.test(s) && /\[marc-garnier\]/.test(s), s);
  r = hook("Arrête de me tutoyer dans les mails.", { HVBRAIN_SUGGEST: "off" });
  check("the reminder is said even when the suggestions are off", /working rule/.test(said(r)), r.stdout);
  setBrainJson({ reminders: { corrections: false } });
  check("brain.json, reminders.corrections: false, turns it off", said(hook("Arrête de me tutoyer dans les mails.")) === "");
  setBrainJson({ reminders: { defaults: false, phrases: ["interdit de", "^plus ... de tutoiement"] } });
  check("a brain's own phrases replace the plugin's (reminders.defaults: false, reminders.phrases)", /working rule/.test(said(hook("Il est interdit de me tutoyer"))) && /working rule/.test(said(hook("Plus jamais de tutoiement."))) && !/working rule/.test(said(hook("Arrête de me tutoyer"))));
  setBrainJson({ reminders: {} });

  const resume = (input, extraEnv = {}) => run("node", [join(SCRIPTS, "hook-resume.mjs")], { input: JSON.stringify(input), env: extraEnv });
  r = resume({ hook_event_name: "SessionStart", source: "compact", session_id: "zone" });
  let out = {};
  try {
    out = JSON.parse(r.stdout);
  } catch {
    out = {};
  }
  check("after a summary, the session is told to read again the lessons of its subject", r.ok && out.hookSpecificOutput?.hookEventName === "SessionStart" && /goes on over a summary/.test(out.hookSpecificOutput?.additionalContext ?? "") && /nature: "lesson"/.test(out.hookSpecificOutput.additionalContext), r.out);
  check("and the hook is quick", r.ms < 1500, `${r.ms} ms`);
  check("nothing at an ordinary start, a resume or a clear", ["startup", "resume", "clear"].every((source) => resume({ source }).stdout.trim() === ""));
  check("nothing for a background reader of the brain", resume({ source: "compact" }, { HVBRAIN_WHO: "ai:documents" }).stdout.trim() === "");
  setBrainJson({ reminders: { resume: false } });
  check("brain.json, reminders.resume: false, turns it off", resume({ source: "compact" }).stdout.trim() === "");
  setBrainJson({ reminders: {} });
  check("nothing when no brain is set up", resume({ source: "compact" }, { HVBRAIN_HOME: join(BASE, "nobody") }).stdout.trim() === "");
  {
    const hooks = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks;
    const start = hooks.SessionStart?.[0];
    check("hooks.json declares it for SessionStart, matcher compact", start?.matcher === "compact" && /hook-resume\.mjs/.test(start.hooks?.[0]?.command ?? ""), JSON.stringify(start));
    const src = readFileSync(join(SCRIPTS, "hook-resume.mjs"), "utf8") + readFileSync(join(SCRIPTS, "reminders.mjs"), "utf8");
    check("it imports nothing of the plugin but its small module of reminders", ![...src.matchAll(/from "\.\/([^"]+)"/g)].some((m) => m[1] !== "reminders.mjs"), [...src.matchAll(/from "\.\/([^"]+)"/g)].map((m) => m[1]).join());
  }
  // A French brain: the instructions in French, with its own word for a lesson.
  mkdirSync(FR_BRAIN, { recursive: true });
  writeFileSync(join(FR_BRAIN, "brain.json"), JSON.stringify({ name: "Zoé", lang: "fr", format: "fr", natures: { note: ["decision", "retour", "lecon"] } }), "utf8");
  r = resume({ source: "compact" }, { HVBRAIN_DIR: FR_BRAIN });
  check("in a French brain, the reminder after a summary is in French, with \"lecon\"", /reprend sur un résumé/.test(r.stdout) && /nature: \\"lecon\\"/.test(r.stdout), r.stdout);
  r = hook("Arrête de me tutoyer dans les mails.", { HVBRAIN_DIR: FR_BRAIN });
  check("and so is the reminder of a correction", /ressemble à une correction/.test(said(r)) && /nature: "lecon"/.test(said(r)), r.stdout);

  // ---------------------------------------------------------------- E
  section("E. A fact that replaces what a note said (constat 5)");
  for (const f of ["conversations/instructions.fr.md", "documents/instructions.fr.md"]) {
    const text = readFileSync(join(PLUGIN, "templates", "sources", f), "utf8");
    check(`the French judge (${f.split("/")[0]}) says what changes, from when, from where, and what the note said`, /Un fait qui contredit la fiche/.test(text) && /ce que la fiche disait avant/.test(text) && /proposed: true/.test(text));
  }
  for (const f of ["conversations/instructions.en.md", "documents/instructions.en.md"]) {
    const text = readFileSync(join(PLUGIN, "templates", "sources", f), "utf8");
    check(`the English judge (${f.split("/")[0]}) says so too`, /A fact that contradicts the note/.test(text) && /what the note said before/.test(text) && /proposed: true/.test(text));
  }
  check("rule 7 of the writing rules says it, in both languages, and a new brain gets it", /ce que la fiche disait avant/.test(readFileSync(join(PLUGIN, "templates", "brain", "fr", "WRITING_RULES.md"), "utf8")) && /what the note said before/.test(readFileSync(join(BRAIN, "WRITING_RULES.md"), "utf8")));
  writeNote("lecon-validee", { title: "Une leçon validée", status: "trusted", body: "Toujours relire.", extra: "nature: lesson\n" });
  r = node("fact.mjs", ["--note", "lecon-validee", "--text", "Le 18 novembre 2026, d'après le mail de X, la règle change ; la fiche disait toujours relire.", "--from", "gmail:zone"]);
  check("a fact on a validated lesson is only a proposal of the letter", json(r.out).proposed === true && !readFileSync(join(BRAIN, "vault", "notes", "lecon-validee.md"), "utf8").includes("18 novembre"), r.out);

  // ---------------------------------------------------------------- F
  section("F. The page of the settings");
  {
    const page = readFileSync(join(PLUGIN, "docs", "reglages.md"), "utf8");
    const index = readFileSync(join(PLUGIN, "docs", "README.md"), "utf8");
    check("docs/reglages.md exists and is in the table of docs/README.md", index.includes("(reglages.md)"));
    const keys = ["minWords", "gate", "margin", "perType", "typeMargin", "nameSpread", "titleSpread", "excerpt", "execution", "reminders.corrections", "reminders.resume", "reminders.phrases", "reminders.defaults"];
    check("it documents every key of suggest and reminders", keys.every((k) => page.includes(`\`${k}\``)), keys.filter((k) => !page.includes(`\`${k}\``)).join());
    const v = mod(`const m = await import(${JSON.stringify(U("suggest.mjs"))}); console.log(JSON.stringify(Object.keys(m.DEFAULTS)));`).value ?? [];
    check("and no key of the code is missing from it", v.length > 0 && v.every((k) => page.includes(`\`${k}\``)), v.filter((k) => !page.includes(`\`${k}\``)).join());
    check("written as the plugin writes: no long dash", ![0x2013, 0x2014].some((c) => page.includes(String.fromCodePoint(c))));
  }
} catch (e) {
  failures++;
  console.log(`\n  FAIL  the checks stopped: ${e?.stack ?? e}`);
} finally {
  fake.kill();
  if (!process.argv.includes("--keep")) {
    for (let tries = 0; tries < 10; tries++) {
      try {
        rmSync(BASE, { recursive: true, force: true });
        break;
      } catch {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300);
      }
    }
  }
}

console.log(`\n${total - failures} ok, ${failures} FAIL (${total} checks)\n`);
process.exit(failures ? 1 : 0);
