#!/usr/bin/env node
// review.mjs - The weekly look at the brain, written as a report the person
// reads (reviews/YYYY-MM-DD.md), in the brain's language. Deterministic: it
// counts and it lists; the thinking (which links to add, what the week's mail
// and meetings bring) is Claude's, in the skill that runs this script.
//
// PROMOTION. A seed becomes "trusted" when it has taken root: at least two
// weeks old, and linked FROM a note born another day. Only with --apply, and
// never for ideas, whose maturity is the person's call. Every promotion is
// listed in the report: the person can send a note back to seed in one word.
//
// THE LIVE SOURCES it reports on, when the person chose them (hyperbrain.json):
//   journal  the projects worked on with Claude this week (~/.hyperbrain/journal.jsonl),
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
import { HOME, ROOT, config, readVault, requireBrain, today, validate, vocab } from "./lib.mjs";
import { brainLang, t } from "./i18n.mjs";
import { readDirectory } from "./directory.mjs";

requireBrain();
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DAYS = Number(args.includes("--days") ? args[args.indexOf("--days") + 1] : 7);
const ROOT_DAYS = 14;

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
const promotable = fiches.filter(
  (f) => f.fm.status === "seed" && !cfg.neverPromoted.includes(f.fm.type) && String(f.fm.created) <= rootLimit &&
    (incoming.get(f.slug) ?? []).some((src) => String(src.fm.created) !== String(f.fm.created)),
);
const orphans = fiches.filter((f) => f.fm.status !== "archived" && !f.links.length && !(incoming.get(f.slug) ?? []).length);
const noSource = fiches.filter((f) => !f.fm.source);
const broken = warnings.filter((w) => w.msg.startsWith("link to a note"));

// A source that is a path on this computer, and that is gone.
const LOCAL_PATH = /^(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\/|~[\\/])/;
const dead = fiches.filter((f) => {
  const s = String(f.fm.source ?? "").trim();
  if (!LOCAL_PATH.test(s)) return false;
  const p = s.replace(/^file:\/\//, "").replace(/^~(?=[\\/])/, HOME);
  return !existsSync(p);
});

// The work journal: sessions of Claude Code, by project, this week.
let journal = [];
if (sources.journal) {
  const byProject = new Map();
  try {
    for (const line of readFileSync(join(HOME, ".hyperbrain", "journal.jsonl"), "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (String(e.t).slice(0, 10) < since) continue;
        const k = e.project ?? basename(String(e.cwd ?? ""));
        const cur = byProject.get(k) ?? { project: k, cwd: String(e.cwd ?? ""), sessions: 0, last: "" };
        cur.sessions++;
        if (e.t > cur.last) cur.last = e.t;
        byProject.set(k, cur);
      } catch {
        // an unreadable line is skipped
      }
    }
  } catch {
    // no journal yet
  }
  journal = [...byProject.values()].sort((a, b) => b.last.localeCompare(a.last));
  // Their commits of the week, from each project's own history.
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

// The contacts directory: its size, and the core without a note.
let people = null;
if (cfg.contacts?.enabled) {
  const dir = readDirectory(cfg);
  people = { total: dir.contacts.length, core: dir.contacts.filter((c) => c.tier === 2).length, coreWithoutNote: dir.contacts.filter((c) => c.tier === 2 && !c.note).slice(0, 15) };
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
    }
  }
}

const byDomain = {};
for (const f of fiches) for (const d of [].concat(f.fm.domains)) byDomain[d] = (byDomain[d] ?? 0) + 1;
const line = (f) => `- [[${f.slug}]] (${f.fm.type}, ${f.fm.created}) ${f.fm.title}`;
const nErr = errors.length + parseErrors.length;
const out = [];
out.push(L.title(cfg.name || "?", today()), "", L.summary(fiches.length, fresh.length, DAYS), "");
out.push(L.health, "", nErr ? L.errors(nErr) : L.noError, L.broken(broken.length), L.noSource(noSource.length), L.orphansCount(orphans.length), L.deadSources(dead.length), "");
out.push(L.domains, "", ...cfg.domains.map((d) => `- ${d}: ${byDomain[d] ?? 0}`), "");
out.push(L.fresh(fresh.length), "", ...(fresh.length ? fresh.slice(0, 60).map(line) : [L.nothingNew]), "");
const promoList = APPLY ? promoted : promotable;
out.push(APPLY ? L.promoted(promoted.length) : L.promotable(promotable.length), "", ...(promoList.length ? promoList.map(line) : [L.none]));
if (APPLY && promoted.length) out.push("", L.disagree);
out.push("", L.orphans(orphans.length), "", ...(orphans.length ? orphans.slice(0, 40).map(line) : [L.none]));
if (broken.length) out.push("", L.brokenTitle, "", ...broken.slice(0, 40).map((w) => `- ${w.rel}: ${w.msg}`));
if (dead.length) out.push("", L.deadTitle, "", ...dead.slice(0, 40).map((f) => `- [[${f.slug}]]: ${f.fm.source}`));
if (sources.journal) {
  out.push("", L.journal(journal.length), "");
  if (!journal.length) out.push(L.none);
  for (const j of journal) {
    out.push(L.journalLine(j.project, j.sessions, j.last.slice(0, 10)) + (j.commits.length ? L.journalCommits(j.commits.length) : ""));
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
if (moved.length) out.push("", L.watch(moved.length), "", ...moved.slice(0, 50).map((m) => `- ${m.path}`), ...(moved.length > 50 ? [L.watchMore(moved.length - 50)] : []));
out.push("");

mkdirSync(join(ROOT, "reviews"), { recursive: true });
writeFileSync(join(ROOT, "reviews", `${today()}.md`), out.join("\n"), "utf8");
const summary = { report: `reviews/${today()}.md`, fresh: fresh.length, promoted: promoted.length, promotable: promotable.length, orphans: orphans.length, errors: nErr, deadSources: dead.length, journal: journal.length, moved: moved.length };
console.log(args.includes("--json") ? JSON.stringify(summary) : `review written: ${summary.report} (${fresh.length} new, ${APPLY ? `${promoted.length} promoted` : `${promotable.length} promotable`}, ${orphans.length} orphans, ${nErr} errors)`);
