#!/usr/bin/env node
// tests/zones/skills-docs.mjs - The checks of the zone "skills, templates and
// documentation" (2026-11-21).
//
// The skills are instructions Claude follows to guide a person: a script that
// does not exist, a sub-command that was renamed, a skill that is no longer
// there, and the person is left with a Claude that improvises. Nothing checked
// that mechanically. This file does, and it replays the few corrections of the
// zone that touch a script (init.mjs, prereqs.mjs) or that rest on what a
// script answers (start.mjs, contacts.mjs, letter.mjs).
//
// It works in a throwaway folder of the system's temporary folder, with
// HVBRAIN_HOME on it and HVBRAIN_DIR empty: never the person's brain, never
// their settings, no vault (HVBRAIN_VAULT=off), no window, no call to Claude.
//
//   node tests/zones/skills-docs.mjs            one line per check: ok, wait or FAIL
//   node tests/zones/skills-docs.mjs --strict   what is awaited from another zone fails too
//
// "wait": the skills name a command another zone is adding at the same time
// (its name was agreed, the script may not be there yet). It is not a failure
// of this zone, and it must be "ok" before the version is published: --strict
// says so.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPTS = join(ROOT, "scripts");
const SKILLS = join(ROOT, "skills");
const STRICT = process.argv.includes("--strict");

let passed = 0;
let waiting = 0;
let failed = 0;
const short = (d) => String(d ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
function check(name, ok, detail = "") {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${ok || !detail ? "" : `\n        ${short(detail)}`}`);
}
/** A check that rests on a command another zone is adding: "wait" until it is there. */
function awaited(name, ok, detail = "") {
  if (ok || STRICT) return check(name, ok, detail);
  waiting++;
  console.log(`wait  ${name}${detail ? `\n        ${short(detail)}` : ""}`);
}

const fwd = (p) => p.replace(/\\/g, "/");
const rel = (p) => fwd(relative(ROOT, p));
const read = (p) => readFileSync(p, "utf8");
/** Every file under a folder, as full paths. */
function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

// The files of this zone.
const skillFiles = walk(SKILLS).filter((f) => f.endsWith(".md"));
const instructions = skillFiles.filter((f) => /[\\/](SKILL|brief)\.md$/.test(f));
const zoneFiles = [
  ...skillFiles,
  ...walk(join(ROOT, "templates", "brain")),
  ...walk(join(ROOT, "templates", "cloud")),
  ...walk(join(ROOT, "templates", "viz")),
  ...["README.md", "README.fr.md", "live/README.md", "live/README.fr.md", "docs/README.md", "docs/rythme.md", "scripts/prereqs.mjs", "scripts/init.mjs"].map((f) => join(ROOT, f)).filter((f) => existsSync(f)),
];

// ---------------------------------------------------------------- 1. the scripts a skill names
// What another zone is adding while this one is corrected (see the report of
// the zone): the script, or the sub-command and its option.
const AWAITED_SCRIPTS = new Set(["promote.mjs"]);
const AWAITED_COMMANDS = new Set(["contacts.mjs list", "contacts.mjs --tier", "judge-token.mjs keep-outside"]);
// A source's own program, in the brain: not a script of the plugin.
const NOT_OURS = new Set(["run.mjs"]);
const scriptText = new Map();
const textOf = (name) => {
  if (!scriptText.has(name)) scriptText.set(name, existsSync(join(SCRIPTS, name)) ? read(join(SCRIPTS, name)) : null);
  return scriptText.get(name);
};

{
  const missing = [];
  const pending = [];
  let cited = 0;
  for (const f of instructions) {
    for (const m of read(f).matchAll(/((?:readers\/)?[a-z][a-z0-9-]*\.mjs)\b/g)) {
      const name = m[1];
      if (NOT_OURS.has(name)) continue;
      cited++;
      if (existsSync(join(SCRIPTS, name))) continue;
      (AWAITED_SCRIPTS.has(name) ? pending : missing).push(`${rel(f)}: ${name}`);
    }
  }
  check(`every script a skill names exists in scripts/ (${cited} mentions in ${instructions.length} files)`, cited > 100 && !missing.length, [...new Set(missing)].join(" ; "));
  awaited("the scripts awaited from another zone are there (promote.mjs)", !pending.length, [...new Set(pending.map((x) => x.split(": ")[1]))].join(", ") + " not there yet");
}

// The sub-command and the options of each command a skill gives, looked for in
// the script itself: a command line, in a block or between backticks.
{
  const commands = [];
  for (const f of instructions) {
    const text = read(f);
    const spans = [];
    let inBlock = false;
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*```/.test(line)) {
        inBlock = !inBlock;
        continue;
      }
      if (inBlock) spans.push(line);
      else for (const s of line.matchAll(/`([^`]+)`/g)) spans.push(s[1]);
    }
    for (const span of spans) {
      for (const m of span.matchAll(/(?:^|[\s/"])([a-z][a-z0-9-]*\.mjs)"?((?:[ \t]+[^|\n]*)?)/g)) {
        const name = m[1];
        if (NOT_OURS.has(name) || textOf(name) === null) continue;
        const words = m[2].replace(/[[\]]/g, " ").trim().split(/\s+/).filter(Boolean);
        // ("build.mjs exit 0" is a line of the evening's log, not a command.)
        const sub = /^[a-z][a-z-]*$/.test(words[0] ?? "") && words[0] !== "exit" ? words[0] : null;
        const options = words.filter((w) => /^--[a-z][a-z-]*$/.test(w));
        commands.push({ file: rel(f), name, sub, options });
      }
    }
  }
  const unknown = [];
  const pending = [];
  const plain = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const c of commands) {
    const text = textOf(c.name);
    // Known to the script: compared as a string, named in the usage it prints,
    // or in the commands its header lists (`node scripts/x.mjs state`).
    const has = (word) => text.includes(`"${word}"`) || text.includes(`'${word}'`)
      || new RegExp(`usage:[^\\n]*[\\s|]${plain(word)}(?![\\w-])`).test(text)
      || new RegExp(`${plain(c.name)}[ \\t]+${plain(word)}(?![\\w-])`).test(text);
    for (const word of [...(c.sub ? [c.sub] : []), ...c.options]) {
      if (has(word)) continue;
      (AWAITED_COMMANDS.has(`${c.name} ${word}`) ? pending : unknown).push(`${c.file}: ${c.name} ${word}`);
    }
  }
  check(`every sub-command and option a skill gives is one its script knows (${commands.length} commands)`, commands.length > 150 && !unknown.length, [...new Set(unknown)].join(" ; "));
  awaited("the sub-commands awaited from another zone are in their script (contacts.mjs list --tier, judge-token.mjs keep-outside)", !pending.length, [...new Set(pending.map((x) => x.split(": ")[1]))].join(", ") + " not there yet");
}

// ---------------------------------------------------------------- 2. the skills a text invokes
{
  const names = new Set(readdirSync(SKILLS, { withFileTypes: true }).filter((e) => e.isDirectory() && existsSync(join(SKILLS, e.name, "SKILL.md"))).map((e) => e.name));
  const unknown = [];
  let invoked = 0;
  for (const f of zoneFiles.filter((x) => x.endsWith(".md"))) {
    for (const m of read(f).matchAll(/\/brain:([a-z_][a-z0-9_-]*)/g)) {
      invoked++;
      if (!names.has(m[1])) unknown.push(`${rel(f)}: /brain:${m[1]}`);
    }
  }
  check(`every /brain:<skill> named in the zone is a skill of the plugin (${invoked} mentions, ${names.size} skills)`, invoked > 200 && !unknown.length, [...new Set(unknown)].join(" ; "));
  const misnamed = [...names].filter((n) => !new RegExp(`^name:\\s*${n}\\s*$`, "m").test(read(join(SKILLS, n, "SKILL.md"))));
  check("each skill carries the name of its folder", !misnamed.length, misnamed.join(", "));
}

// ---------------------------------------------------------------- 3. the templates, in both languages
{
  const list = (lang) => walk(join(ROOT, "templates", "brain", lang)).map((f) => fwd(relative(join(ROOT, "templates", "brain", lang), f))).sort();
  const [en, fr] = [list("en"), list("fr")];
  check(`the French and English templates of a brain hold the same files (${en.length})`, en.length > 0 && en.join("|") === fr.join("|"), `en: ${en.join(", ")} / fr: ${fr.join(", ")}`);
  const slots = (lang, f) => [...new Set(read(join(ROOT, "templates", "brain", lang, f)).match(/\{\{[A-Z_]+\}\}/g) ?? [])].sort().join(",");
  const lines = (lang, f) => read(join(ROOT, "templates", "brain", lang, f)).split("\n").length;
  const apart = en.filter((f) => fr.includes(f) && (slots("en", f) !== slots("fr", f) || lines("en", f) !== lines("fr", f)));
  check("each template has the same slots and the same number of lines in both languages", !apart.length, apart.join(", "));

  // The documentation of each skill, in both languages: the same shape.
  const shape = (f) => {
    const t = read(f);
    return [(t.match(/^## /gm) ?? []).length, (t.match(/^\d+\. /gm) ?? []).length, (t.match(/^ {2}- /gm) ?? []).length, (t.match(/\{\{callout:/g) ?? []).length].join("/");
  };
  const docs = skillFiles.filter((f) => /[\\/]DOC\.md$/.test(f));
  const uneven = docs.filter((f) => !existsSync(f.replace(/DOC\.md$/, "DOC.fr.md")) || shape(f) !== shape(f.replace(/DOC\.md$/, "DOC.fr.md")));
  check(`each DOC.md has its DOC.fr.md, with the same sections, steps and callouts (${docs.length})`, docs.length > 10 && !uneven.length, uneven.map(rel).join(", "));
}

// ---------------------------------------------------------------- 4. what the zone no longer says
{
  // The rhythm of the sources is the half hour, a watched folder is read to
  // its bottom, the first big session has five blocks, the app is "Second
  // Brain", and the skills are /brain:create and /brain:start.
  const GONE = [
    [/fifteen minutes/i, "fifteen minutes"],
    [/quart d['’]heure/i, "quart d'heure"],
    [/six levels/i, "six levels"],
    [/four blocks/i, "four blocks"],
    [/Brain live/, "Brain live"],
    [/Brain en direct/, "Brain en direct"],
    [/create-brain/, "create-brain"],
    [/start-brain/, "start-brain"],
  ];
  // Said of something else than the rhythm of the sources, and meant.
  const MEANT = [
    ["skills/create/DOC.md", "fifteen minutes", "Ten to fifteen minutes ahead of you"], // the time the decisions take
    ["docs/rythme.md", "quart d'heure", "Avant le 19 novembre 2026"], // the history of the clock, dated
  ];
  const found = [];
  for (const f of zoneFiles) {
    const lines = read(f).split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [pattern, label] of GONE) {
        if (!pattern.test(line)) continue;
        if (MEANT.some(([file, l, must]) => file === rel(f) && l === label && line.includes(must))) continue;
        found.push(`${rel(f)}:${i + 1} "${label}"`);
      }
    });
  }
  check(`no text of the zone still says what is no longer true (${zoneFiles.length} files, ${GONE.length} phrases)`, zoneFiles.length > 80 && !found.length, found.join(" ; "));

  const dashes = zoneFiles.filter((f) => /[–—]/.test(read(f)));
  check("no em dash nor en dash in the zone", !dashes.length, dashes.map(rel).join(", "));
  const escapes = zoneFiles.filter((f) => f.endsWith(".md") && /\\u[0-9a-fA-F]{4}/.test(read(f)));
  check("no \\uXXXX escape in a text a person reads", !escapes.length, escapes.map(rel).join(", "));
}

// ---------------------------------------------------------------- 5. what the corrections wrote in the skills
{
  const skill = (n, f = "SKILL.md") => read(join(SKILLS, n, f));
  const says = [
    ["1: the directory is listed by tier", /contacts\.mjs" list --tier 2/.test(skill("contacts")) && !/the list from `stats`/.test(skill("contacts"))],
    ["2: a missing git identity goes to /brain:_computer", /identity: null[^\n]*\/brain:_computer/.test(skill("create")) && !/`\/brain:start`, Step 3/.test(skill("create"))],
    ["3: --from is required with brevo and resend", !/\[--from/.test(skill("_alert-channel")) && /--channel <brevo\|resend> --to <their address> --from/.test(skill("_alert-channel"))],
    ["4: the period of the directory is this month and the three before it", /this month and the three before it/.test(skill("contacts")) && !/last three months/.test(skill("contacts")) && !/last three months/.test(skill("contacts", "DOC.md")) && !/trois derniers mois/.test(skill("contacts", "DOC.fr.md"))],
    ["6: the standard sources look every half hour, and the judge reads in the same pass", /every half hour/.test(skill("_live-sources")) && /in the same pass/.test(skill("_live-sources"))],
    ["8: the documentation of the start names the memory block and the page", /what Claude already remembers of you/.test(skill("start", "DOC.md")) && /page in your browser/.test(skill("start", "DOC.md")) && /ce que Claude retient déjà de vous/.test(skill("start", "DOC.fr.md")) && /dans votre navigateur une page/.test(skill("start", "DOC.fr.md"))],
    ["11: the background program looks every half hour", /every half hour/.test(skill("add-routines")) && !/every few minutes/.test(skill("add-routines"))],
    ["13: the brain's own documents name the ledger and the seven tools", ["en", "fr"].every((l) => /brain_fetch/.test(read(join(ROOT, "templates", "brain", l, "CLAUDE.md"))) && /brain_contact/.test(read(join(ROOT, "templates", "brain", l, "CLAUDE.md")))) && /ledger/.test(read(join(ROOT, "templates", "brain", "en", "SOURCES.md"))) && /registre/.test(read(join(ROOT, "templates", "brain", "fr", "SOURCES.md")))],
    ["14: declining the routines is recorded", /start\.mjs" mark routines declined/.test(skill("add-routines"))],
    ["15: the token can be postponed", /start\.mjs" mark token later/.test(skill("_judge-token")) && /mark token later/.test(skill("start"))],
    ["16: the construction resumes at the step its stage names", /resume at the step `stage` names/.test(skill("create")) && !/resume at the step after `stage`/.test(skill("create"))],
    ["17: the proof of reading is given to an older installation", /"proof": true/.test(skill("_live-sources")) && /"proof": true/.test(skill("update"))],
    ["18: a second computer does not go through the whole start", !/`\/brain:start` there first/.test(skill("add-second-computer")) && /isRunner: false/.test(skill("start")) && /runner: false/.test(skill("status"))],
    ["19: the skills say what replaces the slots of SOURCES.md", /\{\{SOURCES\}\}/.test(skill("_writings")) && /No `\{\{\.\.\.\}\}` may be left/.test(skill("create"))],
    ["20: the cost of a first writing is said before it is read", /start\.mjs" count/.test(skill("_writings")) && /before the batch/.test(skill("ingest"))],
    ["21: the directory is in when a period was decided and no month is left", (skill("_catch-up").match(/decided/g) ?? []).length >= 3],
    ["22: Linux has its line to install the GitHub tool", /apt install gh/.test(skill("_computer")) && /apt install gh/.test(skill("add-backup"))],
    ["the judges' token lives outside the vault, and the skills say why", ["_judge-token", "_repair-judge", "_live-sources", "start"].every((n) => /closes itself after a few hours/.test(skill(n))) && /keep-outside/.test(skill("_judge-token")) && !/stores the new one there and removes the file/.test(skill("_judge-token"))],
    ["a closed vault puts a source on hold, and the skills say it is not a breakdown", ["sources", "_own-source", "_mail-calendar", "status", "live"].every((n) => /not a breakdown|not in trouble/.test(skill(n))) && ["sources", "_own-source", "_mail-calendar", "status", "live"].every((n) => /small key/.test(skill(n))) && /petite clé/.test(read(join(ROOT, "docs", "rythme.md")))],
    ["a seed is validated from the live view or by promote.mjs, and the skills say so", ["live", "review", "capture", "status"].every((n) => /promote\.mjs" --note <slug>/.test(skill(n)) && /"Validate"/.test(skill(n))) && ["en", "fr"].every((l) => /Validate|Valider/.test(read(join(ROOT, "templates", "brain", l, "BRAIN.md"))) && /Validate|Valider/.test(read(join(ROOT, "templates", "brain", l, "CLAUDE.md"))))],
  ];
  for (const [name, ok] of says) check(`the skills say it: ${name}`, ok);

  const prereqs = read(join(SCRIPTS, "prereqs.mjs"));
  check("5: the audit of the computer also looks for wrangler through npx, without installing it", prereqs.includes('["npx", ["--no", "--", "wrangler"]]') && !prereqs.includes("/start-brain"));
  for (const s of ["prereqs.mjs", "init.mjs"]) {
    const r = spawnSync(process.execPath, ["--check", join(SCRIPTS, s)], { encoding: "utf8" });
    check(`${s} is valid JavaScript`, r.status === 0, r.stderr);
  }
}

// ---------------------------------------------------------------- 6. in a throwaway brain
const BASE = mkdtempSync(join(tmpdir(), "hvbrain-zone-skills-docs-"));
const HOME_DIR = join(BASE, "home");
mkdirSync(HOME_DIR, { recursive: true });
const { CLAUDE_CODE_OAUTH_TOKEN: _token, ...inherited } = process.env;
const env = { ...inherited, HVBRAIN_HOME: HOME_DIR, HVBRAIN_DIR: "", HVBRAIN_VAULT: "off", HVBRAIN_NO_WINDOW: "1", HVBRAIN_NO_OPEN: "1" };
/** Runs a script of the plugin against the throwaway home, and only there. */
function node(script, args = [], { input } = {}) {
  if (env.HVBRAIN_HOME !== HOME_DIR || env.HVBRAIN_DIR !== "" || !fwd(HOME_DIR).startsWith(fwd(tmpdir()))) throw new Error("the throwaway home is not set: nothing is run");
  const r = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { env, input, encoding: "utf8", timeout: 120_000, windowsHide: true });
  return { ok: r.status === 0, code: r.status, out: String(r.stdout ?? "").trim(), err: String(r.stderr ?? "").trim() };
}
const json = (out) => {
  try {
    return JSON.parse(out.trim().split("\n").at(-1));
  } catch {
    return {};
  }
};

try {
  // Asked while no brain exists yet, as /brain:create does.
  const place = node("init.mjs", ["--dir", join(BASE, "elsewhere"), "--check"]);
  check("the place of a brain is still checked without creating anything", place.ok && json(place.out).check === true && !existsSync(join(BASE, "elsewhere")), `${place.out} ${place.err}`);

  // The French brain first, the English one last: it is the active one below.
  const FR = join(BASE, "brain-fr");
  const EN = join(BASE, "brain-en");
  const madeFr = node("init.mjs", ["--dir", FR, "--name", "Léa", "--domains", "travail,ecriture", "--lang", "fr", "--no-git"]);
  const madeEn = node("init.mjs", ["--dir", EN, "--name", "Tom", "--domains", "work,writing", "--lang", "en", "--no-git", "--switch"]);
  check("a brain is created in each language, in the throwaway folder", madeFr.ok && madeEn.ok && json(madeEn.out).dir === fwd(EN), `${madeFr.out} ${madeFr.err} ${madeEn.out} ${madeEn.err}`);

  // 19. No slot left in a document nobody fills right after the creation.
  for (const [lang, dir, sentence] of [["en", EN, "Nothing is listed yet"], ["fr", FR, "Rien n'est encore listé"]]) {
    const sources = existsSync(join(dir, "SOURCES.md")) ? read(join(dir, "SOURCES.md")) : "{{missing}}";
    check(`19 (${lang}): SOURCES.md of a new brain holds no raw slot, and says who lists the writings`, !/\{\{/.test(sources) && sources.includes(sentence) && !/\n\s*\n\s*\n## /.test(sources.replace(/\r/g, "")), sources);
    const left = ["CLAUDE.md", "WRITING_RULES.md", "vault/CLAUDE.md"].filter((f) => /\{\{/.test(read(join(dir, f))));
    check(`19 (${lang}): no raw slot in the other documents the creation does not fill by talking`, !left.length, left.join(", "));
    const founding = [...new Set(read(join(dir, "BRAIN.md")).match(/\{\{[A-Z_]+\}\}/g) ?? [])].sort().join(",");
    check(`19 (${lang}): BRAIN.md keeps only the four slots /brain:create writes with the person`, founding === "{{COMPONENTS}},{{DOMAINS}},{{PRIVACY}},{{WHY}}", founding);
    // What start.mjs counts as a writing is a ticked or unticked line: the sentence is none.
    check(`19 (${lang}): the sentence is not read as a writing to bring in`, !/^\s*- \[[ xX]\]/m.test(sources));
  }
  check("16: the creation leaves stage 2, the step whose first notes are still to write", JSON.parse(read(join(EN, "brain.json"))).stage === 2);

  // 14, 15. What a person may say of a step of the start.
  const declined = node("start.mjs", ["mark", "routines", "declined"]);
  const stateAfter = json(node("start.mjs", ["state"]).out);
  const routines = (stateAfter.steps ?? []).find((s) => s.id === "routines");
  check("14: declining the routines is recorded, and the start no longer waits for them", declined.ok && json(declined.out).ok === true && routines?.state === "declined", `${declined.out} ${declined.err} ${JSON.stringify(routines)}`);
  const back = node("start.mjs", ["mark", "routines", "todo"]);
  check("14: mark routines todo brings the step back", back.ok && (json(node("start.mjs", ["state"]).out).steps ?? []).find((s) => s.id === "routines")?.state === "todo", `${back.out} ${back.err}`);
  const later = node("start.mjs", ["mark", "token", "later"]);
  awaited("15: the token can be postponed (start.mjs mark token later)", later.ok && json(later.out).ok === true, `${later.out} ${later.err}`);

  // 4, 21, 1. The directory: its period, its closing check, its list by tier.
  const enabled = node("contacts.mjs", ["enable"]);
  const before = json(node("contacts.mjs", ["months"]).out);
  check("21: before a period is chosen the directory answers decided: false with left: 0 (why the skill asks for both)", enabled.ok && before.decided === false && before.left === 0, JSON.stringify(before));
  const period = json(node("contacts.mjs", ["months", "--back", "3"]).out);
  check("4: --back 3 is this month and the three before it, four months to read", period.decided === true && period.months?.length === 4 && period.left === 4, JSON.stringify(period));
  const added = node("contacts.mjs", ["upsert", "--month", period.next ?? "2026-11"], { input: `${JSON.stringify({ address: "ada@example.org", name: "Ada", sent: 40, received: 40, first: "2026-11-02", last: "2026-11-20", subjects: ["a"] })}\n` });
  const listed = node("contacts.mjs", ["list", "--tier", "2"]);
  awaited("1: the people of a tier are listed (contacts.mjs list --tier 2)", added.ok && listed.ok && /ada@example\.org/.test(listed.out) && !/^usage:/.test(listed.out), `${listed.out} ${listed.err}`.slice(0, 300));

  // 3. The sender is required where a service sends.
  const noFrom = node("letter.mjs", ["setup", "--channel", "brevo", "--to", "tom@example.org"]);
  const withFrom = node("letter.mjs", ["setup", "--channel", "brevo", "--to", "tom@example.org", "--from", "brain@example.org"]);
  const connector = node("letter.mjs", ["setup", "--channel", "connector", "--to", "tom@example.org"]);
  check("3: brevo refuses without --from, takes it with, and the connector needs none", !noFrom.ok && /--from/.test(noFrom.out) && withFrom.ok && connector.ok, `${noFrom.out} | ${withFrom.out} ${withFrom.err} | ${connector.out} ${connector.err}`);

  // The judges' token: where it is looked for, and the copy out of the vault.
  const token = json(node("judge-token.mjs", ["state"]).out);
  check("the state of the token says where one is found, with each place", token.ok === true && token.found === null && token.places?.file === false && ["none", "locked", "has", "empty"].includes(token.places?.vault), JSON.stringify(token));
  const outside = node("judge-token.mjs", ["keep-outside"]);
  awaited("the vault's token can be copied outside (judge-token.mjs keep-outside)", !/^usage:/.test(outside.out) && outside.code !== 2 && !existsSync(join(HOME_DIR, ".hypervibe-brain", "judge-token.json")), `${outside.out} ${outside.err}`);
} catch (e) {
  check("the checks in a throwaway brain ran to their end", false, e.stack ?? e.message);
} finally {
  rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
check("the throwaway folder is removed", !existsSync(BASE));

console.log(`\n${passed} ok, ${waiting} wait, ${failed} FAIL${waiting ? "  (wait: a command another zone is adding; --strict makes it a failure)" : ""}`);
process.exitCode = failed ? 1 : 0;
