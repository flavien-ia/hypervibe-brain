#!/usr/bin/env node
// review.mjs - The weekly look at the brain, written as a report the person
// reads (reviews/YYYY-MM-DD.md), in the brain's language. Deterministic: it
// counts and it lists; the thinking (which links to add, what the week's mail
// and meetings bring) is Claude's, in the skill that runs this script.
//
// PROMOTION. A seed becomes "trusted" when it has taken root: at least two
// weeks old, and either linked FROM a note born another day, or read by Claude
// through the tools (the reads journal). Only with --apply, and never for the
// types the person keeps for themselves (ideas by default). Every promotion is
// listed in the report and kept in index/promotions.jsonl: the person can send
// a note back to seed in one word.
// What does not count as a link (brain.json, `promotion`):
//   ignoreLinksFrom  types, or folders (ending with /), whose links are
//                    plumbing: a domain note that lists everything, a directory
//                    of people that names each one's company...
//   a line marked ":auto"  written by a program, not by thought
//   minDays          the age a seed must reach (14 by default)
//
// THE LIVE SOURCES it reports on, when the person chose them (brain.json):
//   journal  the projects worked on with Claude this week (~/.hypervibe-brain/journal.jsonl),
//            with their commits, read from each project's own git history: no
//            global git hook (that setting belongs to other tools, Hypervibe's
//            secret scanner among them)
//   watch    the files that moved in the folders the person asked to follow
// and always: the sources that point to a file that no longer exists.
//
//   node scripts/review.mjs [--apply] [--days 7] [--json]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { appendFileSync } from "node:fs";
import { readEvents, readJournals } from "./journal.mjs";
import { HOME, ROOT, computerName, config, userConfig, promotionsFile, readAllReads, readVault, requireBrain, requireRunner, today, validate, vocab } from "./lib.mjs";
import { brainLang, t } from "./i18n.mjs";
import { readDirectory } from "./directory.mjs";

requireBrain();
// The weekly review computes and promotes: the runner's work.
requireRunner();
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DAYS = Number(args.includes("--days") ? args[args.indexOf("--days") + 1] : 7);
const ROOT_DAYS = Number(config().promotion?.minDays ?? 14);

const dayOffset = (n) => {
  const d = new Date(Date.now() - n * 86400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const since = dayOffset(DAYS);
const rootLimit = dayOffset(ROOT_DAYS);

const cfg = config();
const L = t(brainLang(ROOT)).review;
const sources = cfg.sources ?? {};
const { fiches, errors: parseErrors } = readVault();
const { errors, warnings } = validate(fiches, cfg);
const bySlug = new Map(fiches.map((f) => [f.slug, f]));
const incoming = new Map();
for (const f of fiches) for (const l of f.links) if (bySlug.has(l)) (incoming.get(l) ?? incoming.set(l, []).get(l)).push(f);

const fresh = fiches.filter((f) => String(f.fm.created) >= since).sort((a, b) => String(b.fm.created).localeCompare(String(a.fm.created)));
const ignoreFrom = (cfg.promotion?.ignoreLinksFrom ?? []).map(String);
const plumbing = (src) => ignoreFrom.some((x) => (x.endsWith("/") ? src.rel.startsWith(x) || src.rel.startsWith(`vault/${x}`) : src.fm.type === x));
// A link counts if one of the lines that make it was not written by a program.
const byHand = (body, slug) => {
  const lines = String(body).split("\n").filter((l) => l.includes(`[[${slug}]]`) || l.includes(`[[${slug}|`) || l.includes(`[[${slug}#`));
  return lines.length > 0 && lines.some((l) => !l.includes(":auto"));
};
const reads = new Map();
for (const e of readAllReads(cfg)) reads.set(e.slug, (reads.get(e.slug) ?? 0) + 1);
const why = new Map();
const promotable = fiches.filter((f) => {
  // neverPromoted holds types, or folders (ending with /): a directory of people is data, not knowledge.
  const kept = cfg.neverPromoted.some((x) => (String(x).endsWith("/") ? f.rel.startsWith(x) || f.rel.startsWith(`vault/${x}`) : f.fm.type === x));
  if (f.fm.status !== "seed" || kept || String(f.fm.created) > rootLimit) return false;
  const links = (incoming.get(f.slug) ?? []).filter((src) => String(src.fm.created) !== String(f.fm.created) && !plumbing(src) && byHand(src.body, f.slug)).map((src) => src.slug);
  const n = reads.get(f.slug) ?? 0;
  if (!links.length && !n) return false;
  why.set(f.slug, { links, reads: n });
  return true;
});
const orphans = fiches.filter((f) => f.fm.status !== "archived" && !f.links.length && !(incoming.get(f.slug) ?? []).length);
const noSource = fiches.filter((f) => !f.fm.source);
const broken = warnings.filter((w) => w.msg.startsWith("link to a note"));

// A note's source on this computer: a path, or a scheme the person declared
// for this computer in ~/.hypervibe-brain/config.json, "sourceRoots"
// ({"dropbox": "C:/Users/me/Dropbox"} makes "dropbox://Work/a.docx" a file).
// The folders differ from one computer to the other: never in brain.json.
const LOCAL_PATH = /^(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\/|~[\\/])/;
const roots = userConfig().sourceRoots ?? {};
function localPath(s) {
  if (LOCAL_PATH.test(s)) return s.replace(/^file:\/\//, "").replace(/^~(?=[\\/])/, HOME);
  const m = s.match(/^([a-z][\w+.-]*):\/\/(.+)$/i);
  return m && roots[m[1]] ? join(roots[m[1]], ...m[2].split("/")) : null;
}
// The sources that are gone, and the ones modified after their note was last
// touched: the note may be out of date. Types listed in brain.json,
// review.changedIgnore, are left out of the second list (a finished record,
// such as a published post, does not follow its file).
const dead = [];
const changed = [];
const changedIgnore = new Set(cfg.review?.changedIgnore ?? []);
for (const f of fiches) {
  const p = localPath(String(f.fm.source ?? "").trim());
  if (!p) continue;
  if (!existsSync(p)) {
    dead.push(f);
    continue;
  }
  if (changedIgnore.has(f.fm.type) || !f.fm.updated) continue;
  try {
    const d = new Date(statSync(p).mtimeMs);
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (day > String(f.fm.updated)) changed.push({ f, day });
  } catch {
    // unreadable: said nowhere
  }
}
changed.sort((a, b) => (a.f.fm.status === "trusted" ? 0 : 1) - (b.f.fm.status === "trusted" ? 0 : 1) || b.day.localeCompare(a.day));
// What the review has already shown: an entry is "new" the first week it
// appears, so that the letter proposes it once and not every week after.
const SIGNALS = join(ROOT, "index", "signals.json");
let signals = {};
try {
  signals = JSON.parse(readFileSync(SIGNALS, "utf8"));
} catch {
  signals = {};
}
const isNew = (key) => !signals[key] || signals[key] === today();
const signalKeys = [...dead.map((f) => `dead:${f.slug}`), ...changed.map((c) => `changed:${c.f.slug}:${c.day}`)];

// The work journal: sessions of Claude Code, by project, this week, on every
// computer of the person (journal.mjs), with the titles of the sessions.
let journal = [];
if (sources.journal) {
  const byProject = new Map();
  const me = computerName();
  for (const e of readJournals(since)) {
    const name = e.project ?? basename(String(e.cwd ?? ""));
    const k = e.computer === me ? name : `${name} (${e.computer})`;
    const cur = byProject.get(k) ?? { project: k, cwd: String(e.cwd ?? ""), here: e.computer === me, sessions: 0, last: "", titles: [] };
    cur.sessions++;
    if (e.t > cur.last) cur.last = e.t;
    if (e.title && !cur.titles.includes(e.title)) cur.titles.push(e.title);
    byProject.set(k, cur);
  }
  journal = [...byProject.values()].sort((a, b) => b.last.localeCompare(a.last));
  // Their commits of the week, from each project's own history (on this
  // computer; another computer's project may not be cloned here).
  for (const j of journal) {
    try {
      const log = execFileSync("git", ["-C", j.cwd, "log", `--since=${since}`, "--no-merges", "--format=%s"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000, windowsHide: true }).trim();
      j.commits = log ? log.split("\n") : [];
    } catch {
      j.commits = [];
    }
  }
}

// The person's own sources: what each brought, and the ones in trouble.
const own = [];
const SRC = join(ROOT, "sources");
if (existsSync(SRC)) {
  for (const n of readdirSync(SRC)) {
    try {
      const d = JSON.parse(readFileSync(join(SRC, n, "source.json"), "utf8"));
      let st = {};
      try {
        st = JSON.parse(readFileSync(join(SRC, n, "state.json"), "utf8"));
      } catch {
        st = {};
      }
      own.push({ name: n, kind: d.kind, enabled: d.enabled !== false, lastSuccess: st.lastSuccess ?? null, lastError: st.lastError ?? null, created: st.lastCreated ?? 0 });
    } catch {
      // not a source
    }
  }
}

// THE SKILLS NOT DECLARED (P7, phase H). A skill that ran, and a source whose
// next run after it found new data, every time, when the source does not wait
// for that skill: the source should run right after it. Proposed, never done.
const undeclared = [];
{
  const sinceW = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const signals = readEvents({ since: sinceW, act: "signal" }).filter((e) => e.what === "skill");
  const runs = readEvents({ since: sinceW, act: "run" }).filter((e) => String(e.who ?? "").startsWith("source:"));
  const wrote = (r) => (r.created ?? 0) + (r.updated ?? 0) + (r.zones ?? 0) + (r.entries ?? 0) > 0;
  const pairs = new Map();
  for (const o of own) {
    let after = [];
    try {
      after = JSON.parse(readFileSync(join(SRC, o.name, "source.json"), "utf8")).after ?? [];
    } catch {
      after = [];
    }
    const mine = runs.filter((r) => r.who === `source:${o.name}`);
    for (const s of signals) {
      for (const skill of s.skills ?? []) {
        if (after.includes(`skill:${skill}`) || after.includes(`skill:${skill.split(":").pop()}`)) continue;
        const next = mine.find((r) => r.at > s.at);
        const k = `${skill}|${o.name}`;
        const p = pairs.get(k) ?? { skill, source: o.name, yes: 0, no: 0 };
        if (next && wrote(next)) p.yes++;
        else p.no++;
        pairs.set(k, p);
      }
    }
    // The source's runs that wrote without any skill before them: it moves on its own too.
    for (const r of mine.filter(wrote)) {
      const before = signals.filter((s) => s.at < r.at && s.at > (mine.filter((x) => x.at < r.at).pop()?.at ?? ""));
      if (!before.length) for (const p of pairs.values()) if (p.source === o.name) p.no++;
    }
  }
  for (const p of pairs.values()) if (p.yes >= 2 && p.no === 0) undeclared.push(p);
}

// The contacts directory: its size, and the core without a note.
let people = null;
if (cfg.contacts?.enabled) {
  const dir = readDirectory(cfg);
  // A person of the core may have a note that no address points to (written
  // by hand, or from another source): their name is then the title of a note
  // of the people type. And a person with several addresses is one person.
  const fold = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const personType = cfg.contacts?.personType ?? ["person", "personne", "people", "personnes"].find((t) => cfg.types[t]);
  const named = new Set(fiches.filter((f) => f.fm.type === personType).map((f) => fold(f.fm.title)));
  const seen = new Set();
  const coreWithoutNote = dir.contacts.filter((c) => {
    if (c.tier !== 2 || c.note || !c.name || named.has(fold(c.name)) || seen.has(fold(c.name))) return false;
    seen.add(fold(c.name));
    return true;
  });
  people = { total: dir.contacts.length, core: dir.contacts.filter((c) => c.tier === 2).length, coreWithoutNote: coreWithoutNote.slice(0, 15) };
}

// The watched folders: what moved this week, newest first.
let moved = [];
if (Array.isArray(sources.watch) && sources.watch.length) {
  const limit = Date.now() - DAYS * 86400_000;
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir) || moved.length > 2000) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else {
        try {
          const m = statSync(p).mtimeMs;
          if (m >= limit) moved.push({ path: p.replace(/\\/g, "/"), mtime: m });
        } catch {
          // gone meanwhile
        }
      }
    }
  };
  for (const d of sources.watch) walk(d, 0);
  moved.sort((a, b) => b.mtime - a.mtime);
}

const promoted = [];
if (APPLY && !errors.length && !parseErrors.length) {
  for (const f of promotable) {
    const abs = join(ROOT, f.rel);
    const raw = readFileSync(abs, "utf8");
    const nl = raw.includes("\r\n") ? "\r\n" : "\n";
    // In the brain's own words: `statut: graine` in a French brain.
    const v = vocab(cfg);
    const next = raw
      .replace(new RegExp(`^${v.keys.status}:\\s*${v.status.seed}\\s*$`, "m"), `${v.keys.status}: ${v.status.trusted}`)
      .replace(new RegExp(`^${v.keys.updated}:\\s*\\S+\\s*$`, "m"), `${v.keys.updated}: ${today()}`);
    if (next !== raw) {
      writeFileSync(abs, next.replace(/\r?\n/g, nl), "utf8");
      promoted.push(f);
      appendFileSync(promotionsFile(), `${JSON.stringify({ date: today(), slug: f.slug, type: f.fm.type, ...why.get(f.slug) })}\n`, "utf8");
    }
  }
}

const byDomain = {};
for (const f of fiches) for (const d of [].concat(f.fm.domains)) byDomain[d] = (byDomain[d] ?? 0) + 1;
const line = (f) => `- [[${f.slug}]] (${f.fm.type}, ${f.fm.created}) ${f.fm.title}`;
const nErr = errors.length + parseErrors.length;
const out = [];
out.push(L.title(cfg.name || "?", today()), "", L.summary(fiches.length, fresh.length, DAYS), "");
out.push(L.health, "", nErr ? L.errors(nErr) : L.noError, L.broken(broken.length), L.noSource(noSource.length), L.orphansCount(orphans.length), L.deadSources(dead.length), L.changedSources(changed.length), "");
out.push(L.domains, "", ...cfg.domains.map((d) => `- ${d}: ${byDomain[d] ?? 0}`), "");
out.push(L.fresh(fresh.length), "", ...(fresh.length ? fresh.slice(0, 60).map(line) : [L.nothingNew]), "");
const promoList = APPLY ? promoted : promotable;
out.push(APPLY ? L.promoted(promoted.length) : L.promotable(promotable.length), "", ...(promoList.length ? promoList.map((f) => { const w = why.get(f.slug) ?? {}; return `${line(f)}${w.links?.length ? ` <- ${w.links.map((x) => `[[${x}]]`).join(", ")}` : ""}${w.reads ? ` (MCP x${w.reads})` : ""}`; }) : [L.none]));
if (APPLY && promoted.length) out.push("", L.disagree);
// WHAT THE MACHINE WROTE THIS WEEK (the brain's journal, P7): every fact it
// added and every note it created, numbered, so that one sentence takes it
// back (undo.mjs <number> --letter <day>); the rest, machine zones and
// refreshed records, counted by source. The person's own edits are theirs.
{
  const sinceW = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const all = readEvents({ since: sinceW, act: "write" });
  const undone = new Set(all.filter((e) => e.what === "undone").map((e) => e.undoes));
  const mine = all.filter((e) => e.who !== "hand" && e.what !== "undone" && !undone.has(e.id));
  const numbered = mine.filter((e) => e.what === "fact" || e.what === "created");
  const bulk = new Map();
  for (const e of mine.filter((x) => x.what === "zone" || x.what === "updated")) {
    const b = bulk.get(e.who) ?? { zones: 0, updated: 0, notes: new Set() };
    if (e.what === "zone") b.zones++;
    else b.updated++;
    b.notes.add(e.note);
    bulk.set(e.who, b);
  }
  if (numbered.length || bulk.size) {
    out.push("", L.writes(numbered.length + [...bulk.values()].reduce((n, b) => n + b.zones + b.updated, 0)), "");
    out.push(...numbered.slice(0, 80).map((e, i) => L.writesLine(i + 1, e.what, e.note, e.who, e.from, e.text)));
    if (numbered.length > 80) out.push(L.writesMore(numbered.length - 80));
    for (const [who, b] of bulk) out.push(L.writesBulk(who, b.zones, b.updated, b.notes.size));
    if (numbered.length) {
      out.push("", L.writesUndo);
      mkdirSync(join(ROOT, "reviews"), { recursive: true });
      writeFileSync(join(ROOT, "reviews", `${today()}-writes.json`), `${JSON.stringify(Object.fromEntries(numbered.slice(0, 80).map((e, i) => [String(i + 1), e.id])), null, 1)}\n`, "utf8");
    }
  }
}
// NOTES THAT GROW (2026-11-08). The machine adds facts to notes all week
// (the judge, the sources): a note much read and much fed ends up a pile of
// paragraphs. Past a size (review.condenseAbove, 10 000 characters of the
// person's text and facts, machine zones left out), the note is put to the
// Sunday review, which drafts a synthesis, or a split into several notes,
// and proposes it: never applied without the person. Five a week at most,
// the ones fed most this month first; a note proposed is not proposed again
// for eight weeks (reviews/condense.json). Long by nature, never listed: the
// sources, publications and talks (review.condenseIgnoreTypes), and the
// slugs that start with review.condenseIgnore (a skill's own journal...).
{
  const above = Number(cfg.review?.condenseAbove ?? 10000);
  const ignoreTypes = new Set(cfg.review?.condenseIgnoreTypes ?? ["source", "publication", "talk"]);
  const ignoreSlugs = (cfg.review?.condenseIgnore ?? []).map(String);
  const seenFile = join(ROOT, "reviews", "condense.json");
  const seen = existsSync(seenFile) ? JSON.parse(readFileSync(seenFile, "utf8")) : {};
  const eightWeeks = new Date(Date.now() - 56 * 86400_000).toISOString().slice(0, 10);
  const fedSince = new Date(Date.now() - 30 * 86400_000).toISOString();
  const fed = new Map();
  for (const e of readEvents({ since: fedSince, act: "write" })) if (e.what === "fact") fed.set(e.note, (fed.get(e.note) ?? 0) + 1);
  const sizeOf = (f) => String(f.body ?? "").replace(/<!-- ([a-z0-9-]+):auto -->[\s\S]*?<!-- \/\1:auto -->/g, "").trim().length;
  const growing = fiches
    .filter((f) => !ignoreTypes.has(f.fm.type) && !ignoreSlugs.some((p) => f.slug.startsWith(p)) && !(seen[f.slug] && seen[f.slug] > eightWeeks))
    .map((f) => ({ f, size: sizeOf(f), fed: fed.get(f.slug) ?? 0 }))
    .filter((x) => x.size > above)
    .sort((a, b) => b.fed - a.fed || b.size - a.size);
  if (growing.length) {
    const week = growing.slice(0, 5);
    out.push("", L.growTitle(week.length, growing.length), "", ...week.map((x) => L.growLine(x.f.slug, x.f.fm.type, x.size, x.fed)), "", L.growHint);
    if (APPLY) {
      for (const x of week) seen[x.f.slug] = today();
      mkdirSync(join(ROOT, "reviews"), { recursive: true });
      writeFileSync(seenFile, `${JSON.stringify(seen, null, 1)}\n`, "utf8");
    }
  }
}
out.push("", L.orphans(orphans.length), "", ...(orphans.length ? orphans.slice(0, 40).map(line) : [L.none]));
if (broken.length) out.push("", L.brokenTitle, "", ...broken.slice(0, 40).map((w) => `- ${w.rel}: ${w.msg}`));
if (dead.length) out.push("", L.deadTitle, "", ...dead.slice(0, 40).map((f) => `- [[${f.slug}]]: ${f.fm.source}${isNew(`dead:${f.slug}`) ? L.newMark : ""}`));
if (changed.length) out.push("", L.changedTitle(changed.length), "", ...changed.slice(0, 40).map((c) => L.changedLine(c.f.slug, vocab(cfg).status[c.f.fm.status] ?? c.f.fm.status, c.day, c.f.fm.updated) + (isNew(`changed:${c.f.slug}:${c.day}`) ? L.newMark : "")));
if (sources.journal) {
  out.push("", L.journal(journal.length), "");
  if (!journal.length) out.push(L.none);
  for (const j of journal) {
    out.push(L.journalLine(j.project, j.sessions, j.last.slice(0, 10)) + (j.commits.length ? L.journalCommits(j.commits.length) : ""));
    for (const ti of j.titles.slice(0, 5)) out.push(L.journalTitle(ti));
    for (const c of j.commits.slice(0, 5)) out.push(`  - ${c}`);
  }
}
if (people) {
  out.push("", L.people(people.total, people.core), "");
  if (people.coreWithoutNote.length) {
    out.push(L.peopleNoNote);
    for (const c of people.coreWithoutNote) out.push(`- ${c.name ?? "?"} (${c.sent ?? 0} / ${c.received ?? 0})${c.summary ? `: ${c.summary}` : ""}`);
  } else out.push(L.none);
}
if (own.length) {
  out.push("", L.own(own.length), "");
  for (const o of own) out.push(L.ownLine(o.name, o.kind, o.enabled, o.lastSuccess?.slice(0, 10) ?? null, o.created, o.lastError));
}
{
  // THE MEASURE OF THE JUDGE: one line per live source, so the person sees
  // whether "the same day" holds without filling the brain with noise.
  const { report } = await import("./judge.mjs");
  const r = report(new Date(Date.now() - DAYS * 86400_000).toISOString());
  const names = Object.keys(r).filter((n) => r[n].runs || r[n].waiting);
  if (names.length) {
    out.push("", L.judgeTitle, "");
    for (const n of names) out.push(L.judgeLine(n, r[n]));
    out.push("", L.judgeHint);
  }
}
{
  // What the rule kept for the person (a validated decision, lesson, concept,
  // idea): the machine proposed it, the letter puts it to them.
  const sinceP = new Date(Date.now() - DAYS * 86400_000).toISOString();
  const proposals = readEvents({ since: sinceP, act: "signal" }).filter((e) => e.what === "proposal");
  if (proposals.length) out.push("", L.proposalsTitle(proposals.length), "", ...proposals.slice(0, 40).map((e) => L.proposalLine(e.note, e.text ?? "", e.from)));
}
{
  // What is connected but no longer answers (health.mjs, two failed checks in a row).
  let health = {};
  try {
    health = JSON.parse(readFileSync(join(ROOT, "index", "health.json"), "utf8"));
  } catch {
    health = {};
  }
  const down = Object.values(health).filter((h) => h.disconnected);
  if (down.length) out.push("", L.healthTitle(down.length), "", ...down.map((h) => L.healthLine(h.label, h.reason, String(h.since).slice(0, 10))));
}
if (undeclared.length) out.push("", L.skillsTitle, "", ...undeclared.map((p) => L.skillsLine(p.skill, p.source, p.yes)));
if (moved.length) out.push("", L.watch(moved.length), "", ...moved.slice(0, 50).map((m) => `- ${m.path}`), ...(moved.length > 50 ? [L.watchMore(moved.length - 50)] : []));
out.push("");

mkdirSync(join(ROOT, "reviews"), { recursive: true });
writeFileSync(join(ROOT, "reviews", `${today()}.md`), out.join("\n"), "utf8");
// The real weekly run stamps what it showed, with the day it first appeared.
if (APPLY) {
  const next = {};
  for (const k of signalKeys) next[k] = signals[k] ?? today();
  mkdirSync(join(ROOT, "index"), { recursive: true });
  writeFileSync(SIGNALS, `${JSON.stringify(next, null, 2)}
`, "utf8");
}
const summary = { report: `reviews/${today()}.md`, fresh: fresh.length, promoted: promoted.length, promotable: promotable.length, orphans: orphans.length, errors: nErr, deadSources: dead.length, changedSources: changed.length, journal: journal.length, moved: moved.length };
console.log(args.includes("--json") ? JSON.stringify(summary) : `review written: ${summary.report} (${fresh.length} new, ${APPLY ? `${promoted.length} promoted` : `${promotable.length} promotable`}, ${orphans.length} orphans, ${nErr} errors)`);
