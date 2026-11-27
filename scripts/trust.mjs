#!/usr/bin/env node
// trust.mjs - What runs by itself for the brain runs only once the person has
// approved it ON THIS COMPUTER, and is asked again when it changes.
//
// WHY (2026-11-27, security audit). A brain is a folder that travels: a second
// computer, a restored copy, a pull. Some of what it holds is not knowledge,
// it decides what RUNS: a guard wired into the AI's platform, a skill listed
// to the AI, a source's program, a judge's instructions and tools, the
// registry that says which service receives which key, the folders a judge
// may open. Until then only a source's run.mjs was approved; the rest was
// taken on the brain's word, so a change that arrived by a pull was run the
// same evening. Each of these now has a FINGERPRINT (what it would run, send
// or open, read from its files), and its approval is that fingerprint, kept
// in this computer's settings (~/.hypervibe-brain/config.json, "trusted"),
// never in the brain. Whatever is not approved, or changed since, waits:
// it is not run, not asked, not opened, and the status says so.
//
// AN APPROVAL IS THE PERSON'S OWN GESTURE. It is given in a terminal of
// theirs (`guide` asks for each thing, with what it does), never by the AI: a
// command that approves refuses to run without a keyboard in front of it, and
// the plugin's lock refuses the AI such a command (hook-locks.mjs). Two
// things approve by themselves, because the person has just asked for them
// here: bringing a skill or a guard of this computer into the brain
// (executive.mjs adopt-*), and installing a standard source (the plugin's own
// code).
//
// WHAT WAS ALREADY THERE. On a computer that ran this brain before this rule,
// what was running is approved once, as it is, the first time any of this is
// asked, and written in the brain's journal: nothing stops with the update.
// From then on (and from its first day on a computer that receives the
// brain), a change waits for the person.
//
//   node scripts/trust.mjs state                 what waits for an approval on this computer
//   node scripts/trust.mjs window [--dry]        opens a terminal of the person's on `guide`
//   node scripts/trust.mjs guide                 (in a terminal) shows each thing that waits, and asks
//   node scripts/trust.mjs approve data <scheme>|--all      (in a terminal) a data entry of brain.json
//   node scripts/trust.mjs approve watch <folder>|--all     (in a terminal) a watched folder
//   (a source: sources.mjs trust <name>; a guard or a skill: executive.mjs trust guard|skill <name>)

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline";
import { HOME, PLUGIN_ROOT, ROOT, hasBrain, readJsonFile, setUserConfig, sha256, userConfig } from "./lib.mjs";
import { approvalOf, printFiles } from "./hook-guard.mjs";
import { logEvent } from "./journal.mjs";

const fwd = (p) => String(p).replaceAll("\\", "/");
const CASELESS = process.platform === "win32" || process.platform === "darwin";
const spelled = (p) => (CASELESS ? fwd(resolve(String(p))).toLowerCase() : fwd(resolve(String(p)))).replace(/\/+$/, "");
/** This brain, as the keys of the approvals name it. */
const BRAIN_KEY = () => fwd(ROOT);
const keyOf = (kind, name) => `${BRAIN_KEY()}::${kind}${name === undefined ? "" : `::${name}`}`;
/** A value written the same way whatever the order of its keys. */
const canonical = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const readText = (file) => {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return null;
  }
};
const readJson = (file) => readJsonFile(file, null).value;

// ------------------------------------------------------------ the person

/**
 * Whether the one who asks is the person, at a keyboard: an approval needs a
 * terminal (the AI's commands have none). A bench is let through: with
 * HVBRAIN_HOME naming another folder than the person's own, its approvals are
 * written in that throwaway folder, never in theirs.
 */
export function personAsks() {
  // (As the disk knows them: another spelling of the person's own home, a
  // short name, a link to their settings, is still their home.)
  const real = (p) => {
    try {
      return spelled(realpathSync.native(p));
    } catch {
      return spelled(p);
    }
  };
  const places = (home) => [home, join(home, ".hypervibe-brain"), join(home, ".hypervibe-brain", "config.json")].map(real);
  const own = places(homedir());
  const bench = Boolean(process.env.HVBRAIN_HOME) && !places(HOME).some((p) => own.includes(p));
  return Boolean(bench || (process.stdin.isTTY && process.stdout.isTTY));
}
/** What an approval answers when it is not the person who asks. */
export const NOT_THE_PERSON = () => ({
  ok: false,
  error: "an approval is the person's own gesture, given in a terminal of theirs: it is never run for them. Open one with `trust.mjs window` (it shows what waits and asks them), or give them the line to paste",
  byHand: handLine(),
});
const handLine = () => `node "${fwd(join(PLUGIN_ROOT, "scripts", "trust.mjs"))}" guide`;

// ------------------------------------------------------------ the approvals

/** The approval kept for one thing, or null. */
export const approval = (kind, name) => approvalOf(userConfig(), keyOf(kind, name));
/**
 * Keeps approvals: `list` is [kind, name, record] each. `how` says where each
 * came from ("person", "adopted", "installed", "migration"), in the settings
 * and in the brain's journal.
 */
export function approve(list, how) {
  if (!list.length) return;
  const at = new Date().toISOString();
  setUserConfig((c) => {
    const trusted = { ...(c.trusted ?? {}) };
    for (const [kind, name, record] of list) {
      // One key a thing, whatever the spelling it had before.
      for (const k of Object.keys(trusted)) if (k !== keyOf(kind, name) && CASELESS && k.toLowerCase() === keyOf(kind, name).toLowerCase()) delete trusted[k];
      trusted[keyOf(kind, name)] = { ...record, at, how };
    }
    return { trusted };
  });
  for (const [kind, name] of list) logEvent({ act: "signal", who: how === "person" ? "person" : "trust", what: "approved", kind, ...(name === undefined ? {} : { name: String(name) }), how });
}

// ------------------------------------------------------------ what a program runs

const SCRIPT = /\.(mjs|cjs|js|ps1|py|sh|cmd|bat)$/i;
const CODE = /\.(mjs|cjs|js)$/i;
/**
 * THE FILES A PROGRAM OF THE BRAIN RUNS WITH (2026-11-27): itself, and every
 * file of the brain it imports or starts, followed from file to file. Read
 * from its text: an import or a require of a relative path, a path put
 * together with join() or resolve() from pieces written in the file
 * (`join(ROOT, "scripts", "connectors", "x.mjs")`), any text that names a
 * script that exists, from the file's own folder or from the brain's. Only
 * files inside the brain are followed (the plugin's are the plugin's, Node's
 * are Node's). A path built at run time from something that is not written in
 * the file escapes this reading: said in docs/approbations.md.
 * @param {string[]} entries absolute paths
 * @returns {string[]} paths relative to the brain, sorted
 */
export function closure(entries) {
  const root = resolve(ROOT);
  const inside = (p) => {
    const rel = relative(root, p);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) && !/(^|[\\/])(node_modules|\.git|vault|index|journal|catalogue|reviews)([\\/]|$)/.test(rel);
  };
  const isFile = (p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  };
  /** @type {Set<string>} */
  const seen = new Set();
  const queue = entries.map((e) => resolve(e)).filter(isFile);
  while (queue.length && seen.size < 300) {
    const file = /** @type {string} */ (queue.shift());
    if (seen.has(file)) continue;
    seen.add(file);
    if (!CODE.test(file)) continue;
    let text = "";
    try {
      if (statSync(file).size > 2_000_000) continue;
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const named = new Set();
    const strings = (s) => [...s.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map((m) => m[2]);
    // Every text of the file: an import, a require, a path named as it is.
    for (const s of strings(text)) if (s && s.length < 400 && !s.includes("${")) named.add(s);
    // A path put together from pieces.
    for (const call of text.matchAll(/\b(?:join|resolve)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)) {
      const pieces = strings(call[1]);
      for (let i = 0; i < pieces.length; i++) named.add(pieces.slice(i).join("/"));
    }
    for (const n of named) {
      const relativeOne = /^\.{1,2}[\\/]/.test(n);
      if (!relativeOne && !SCRIPT.test(n)) continue;
      const bases = relativeOne ? [dirname(file)] : [dirname(file), root];
      for (const base of bases) {
        const at = resolve(base, n);
        for (const candidate of SCRIPT.test(at) || extname(at) ? [at] : [at, `${at}.mjs`, `${at}.js`, join(at, "index.mjs"), join(at, "index.js")]) {
          if (inside(candidate) && isFile(candidate) && !seen.has(candidate)) queue.push(candidate);
        }
      }
    }
  }
  return [...seen].filter((p) => inside(p)).map((p) => fwd(relative(root, p))).sort();
}

// ------------------------------------------------------------ the executive floor

const GUARDS = () => join(ROOT, "executive", "guards");
/** What a guard's line of executive/guards.json wires: its moments, its tools, its companions. */
const wiringOf = (entry) => sha256(canonical({ hooks: (entry?.hooks ?? []).map((h) => ({ event: h.event, matcher: h.matcher ?? null, timeout: h.timeout ?? null })), with: [...(entry?.with ?? [])].map(String).sort() }));
/**
 * The fingerprint of a guard: its file, the files it uses beside it ("with"),
 * every file of the brain they import or start, and how it is wired.
 * @returns {{ hash: string, files: string[], wiring: string }}
 */
export function guardPrint(file, entry) {
  const own = [file, ...(entry?.with ?? [])].map((f) => join(GUARDS(), String(f)));
  const files = [...new Set([...own.map((p) => fwd(relative(ROOT, p))), ...closure(own)])].sort();
  return { hash: printFiles(ROOT, files), files, wiring: wiringOf(entry) };
}
/** Why a guard is not approved as it stands, or null. */
export function guardPending(file, entry) {
  const kept = approval("guard", file);
  if (!kept) return "never approved on this computer";
  const now = guardPrint(file, entry);
  if (kept.hash !== now.hash || canonical(kept.files) !== canonical(now.files)) return "changed since its approval";
  if (kept.wiring !== now.wiring) return "its wiring (when it runs, on which tools) changed since its approval";
  return null;
}

/** The fingerprint of a skill of the floor: every file of its folder. */
export function skillPrint(name) {
  const dir = join(ROOT, "executive", "skills", String(name));
  const files = [];
  const walk = (d, depth) => {
    let entries = [];
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === ".git" || files.length >= 2000) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        if (depth < 12) walk(p, depth + 1);
      } else if (e.isFile()) files.push(fwd(relative(ROOT, p)));
    }
  };
  walk(dir, 0);
  return { hash: printFiles(ROOT, files) };
}
/**
 * Why a skill may not be LINKED as it stands, or null. A skill already linked
 * stays so while it changes: a skill is meant to be improved, by the person
 * and by their AI, and the platform reads its folder directly. The approval
 * is asked before the platform is shown a skill it did not have.
 */
export function skillPending(name) {
  const kept = approval("skill", name);
  if (!kept) return "never approved on this computer";
  return kept.hash === skillPrint(name).hash ? null : "changed since its approval";
}

// ------------------------------------------------------------ the sources

const SOURCES = () => join(ROOT, "sources");
const defOf = (name) => readJson(join(SOURCES(), String(name), "source.json"));
/** What of a source.json decides what runs and what it may write: the rest (a pause, a rhythm, a cap) is the plugin's own to change. */
const EXEC_KEYS = ["kind", "live", "allowedTools", "finished", "zones", "updates", "setsTier", "contactCounts", "entries", "judge"];
/** Whether a source is one that runs by itself: a program (script, step), or a judge (a background Claude). */
export const runsAlone = (def) => Boolean(def) && (["script", "step"].includes(def.kind) || (def.kind === "claude" && def.live === true));
/**
 * The fingerprint of a source: what of its source.json decides what runs
 * (its tools above all), its instructions, its program and every file of the
 * brain that program imports or starts.
 * @returns {{ hash: string, files: string[] }}
 */
export function sourcePrint(name) {
  const dir = join(SOURCES(), String(name));
  const def = defOf(name) ?? {};
  // A judge may run programs of the brain itself ("Bash(node {brain}/x.mjs:*)", judge.mjs): they are part of what is approved.
  const programs = (Array.isArray(def.allowedTools) ? def.allowedTools : [])
    .map((t) => /^Bash\(node \{brain\}\/([\w./-]+\.mjs)(?: [\w=.\/-]+)*:\*\)$/.exec(String(t))?.[1])
    .filter((p) => p && !p.split("/").includes(".."))
    .map((p) => join(ROOT, String(p)));
  const files = [...new Set([...["run.mjs", "instructions.md"].map((f) => join(dir, f)).filter((p) => existsSync(p)).map((p) => fwd(relative(ROOT, p))), ...closure([join(dir, "run.mjs"), ...programs])])].sort();
  const exec = Object.fromEntries(EXEC_KEYS.filter((k) => def[k] !== undefined).map((k) => [k, def[k]]));
  return { hash: sha256(`${canonical(exec)}\n${printFiles(ROOT, files)}`), files };
}
/** Whether a source is approved on this computer as it stands. */
export function sourceTrusted(name) {
  settle();
  const kept = approval("source", name);
  return Boolean(kept) && kept.hash === sourcePrint(name).hash;
}
/** Why a source that runs alone is not approved as it stands, or null. */
export function sourcePending(name) {
  settle();
  const kept = approval("source", name);
  if (!kept) return "never approved on this computer";
  return kept.hash === sourcePrint(name).hash ? null : "changed since its approval";
}
export const approveSource = (name, how) => approve([["source", name, sourcePrint(name)]], how);

// ------------------------------------------------------------ the data registry

/**
 * What an entry of brain.json's "data" would reach and with which keys: the
 * services it names (their origin: scheme, host, port), the keys it reads (by
 * their NAMES: a vault item and field, a variable of a .env), the files and
 * folders it opens, and its adapter. A route, a query or a label may change
 * without a new approval: they go to the same service with the same keys.
 */
export function dataFacts(def) {
  const hosts = new Set();
  const secrets = new Set();
  const paths = new Set();
  let explore = false;
  const walk = (v, key) => {
    if (typeof v === "string") {
      if (/^https?:\/\//i.test(v)) {
        try {
          hosts.add(new URL(v).origin);
        } catch {
          hosts.add(v);
        }
      } else if (v.startsWith("$")) secrets.add(`environment: ${v.slice(1)}`);
      return;
    }
    if (!v || typeof v !== "object") {
      if (key === "explore" && v === true) explore = true;
      return;
    }
    if (Array.isArray(v)) return void v.forEach((x) => walk(x, key));
    if (Array.isArray(v.vault)) return void secrets.add(`vault: ${v.vault.map(String).join(" / ")}`);
    if (v.env && typeof v.env === "object") return void secrets.add(`file: ${fwd(String(v.env.file ?? ""))} (${String(v.env.key ?? "")})`);
    for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(def, "");
  if (typeof def?.file === "string") paths.add(fwd(def.file));
  if (def?.root) paths.add(typeof def.root === "string" ? fwd(def.root) : `root: ${String(def.root.sourceRoot ?? "")}`);
  return { adapter: String(def?.adapter ?? ""), hosts: [...hosts].sort(), secrets: [...secrets].sort(), paths: [...paths].sort(), ...(explore ? { explore: true } : {}) };
}
const dataPrint = (def) => ({ hash: sha256(canonical(dataFacts(def))) });
/** The registry as brain.json holds it. */
const registry = () => readJson(join(ROOT, "brain.json"))?.data ?? {};
/** An entry that needs no approval: the catalogue's own answers, kept in the brain. */
const needsApproval = (def) => Boolean(def) && def.adapter !== "catalogue";
/** Why a data entry is not approved as it stands, or null. */
export function dataPending(scheme, def = registry()[scheme]) {
  if (!needsApproval(def)) return null;
  settle();
  const kept = approval("data", scheme);
  if (!kept) return "never approved on this computer";
  return kept.hash === dataPrint(def).hash ? null : "it names another service, other keys or another file than when it was approved";
}
/** What a tool answers for a data entry that waits: why, and what to do. */
export const dataRefusal = (scheme, why) => `the data source "${scheme}://" is not read: ${why}. An entry of the brain's registry (brain.json, data) says where keys are sent, so each one is approved by the person on each computer, in a terminal of theirs (/brain:status says what waits)`;

// ------------------------------------------------------------ the watched folders

const watchList = () => {
  const list = readJson(join(ROOT, "brain.json"))?.sources?.watch;
  return Array.isArray(list) ? list.map(String) : [];
};
/** The watched folders approved on this computer, as brain.json writes them. */
export function watchedApproved(list = watchList()) {
  settle();
  const ok = new Set((approval("watch")?.folders ?? []).map(spelled));
  return list.filter((f) => ok.has(spelled(f)));
}
/** The watched folders that wait for an approval. */
export const watchPending = (list = watchList()) => {
  const ok = new Set(watchedApproved(list).map(spelled));
  return list.filter((f) => !ok.has(spelled(f)));
};
/** Approves watched folders (all of brain.json's without a list); those no longer watched leave. */
export function approveWatch(folders, how) {
  settle();
  const now = watchList();
  const keep = new Set([...(approval("watch")?.folders ?? []), ...(folders ?? now)].map(spelled));
  approve([["watch", undefined, { folders: now.filter((f) => keep.has(spelled(f))).map(fwd) }]], how);
}

// ------------------------------------------------------------ what was already there

const sinceOf = (cfg) => {
  const all = cfg.trustSince;
  if (!all || typeof all !== "object") return null;
  const k = Object.keys(all).find((x) => spelled(x) === spelled(ROOT));
  return k ? all[k] : null;
};
/** Says that this brain is under the rule on this computer from now: nothing of it is approved by itself (a brain just created, or just received). */
export const trustFromNow = (dir) => (c) => ({ trustSince: { ...(c.trustSince ?? {}), [fwd(dir)]: new Date().toISOString() } });
let settled = false;
/**
 * WHAT WAS ALREADY RUNNING IS APPROVED ONCE (see the top). Only on a computer
 * that ran this brain before the rule (its settings bear no date for it):
 *   - a program approved under the rule of before (its run.mjs alone), still
 *     as it was approved;
 *   - a judge that has already run here (its system prompt is kept on this
 *     computer, ~/.hypervibe-brain/judge/<name>.system.md);
 *   - the data registry and the watched folders, as they are.
 * Then the date is written, and nothing is approved by itself any more.
 */
export function settle() {
  if (settled || !hasBrain()) return;
  const cfg = userConfig();
  if (sinceOf(cfg)) {
    settled = true;
    return;
  }
  /** @type {[string, string | undefined, object][]} */
  const list = [];
  let names = [];
  try {
    names = readdirSync(SOURCES());
  } catch {
    names = [];
  }
  const legacy = cfg.trustedSources ?? {};
  const legacyOf = (n) => legacy[Object.keys(legacy).find((k) => spelled(k.slice(0, k.lastIndexOf("::"))) === spelled(ROOT) && k.slice(k.lastIndexOf("::") + 2) === n) ?? ""];
  for (const n of names) {
    const def = defOf(n);
    if (!runsAlone(def)) continue;
    if (def.kind === "claude") {
      if (existsSync(join(HOME, ".hypervibe-brain", "judge", `${n}.system.md`))) list.push(["source", n, sourcePrint(n)]);
      continue;
    }
    const run = readText(join(SOURCES(), n, "run.mjs"));
    if (run !== null && legacyOf(n) === sha256(run.replace(/\r\n/g, "\n"))) list.push(["source", n, sourcePrint(n)]);
  }
  for (const [scheme, def] of Object.entries(registry())) if (needsApproval(def)) list.push(["data", scheme, dataPrint(def)]);
  const watched = watchList();
  if (watched.length) list.push(["watch", undefined, { folders: watched.map(fwd) }]);
  try {
    // IN ONE WRITE: the date and the approvals together. Written one after the
    // other, a program that asked between the two (the hub, a conversation)
    // found the rule in force and nothing approved yet, and skipped a run.
    const at = new Date().toISOString();
    let mine = false;
    setUserConfig((c) => {
      // Another program settled it meanwhile: nothing more to write.
      if (sinceOf(c)) return {};
      mine = true;
      const trusted = { ...(c.trusted ?? {}) };
      for (const [kind, name, record] of list) trusted[keyOf(kind, name)] ??= { ...record, at, how: "migration" };
      return { trustSince: { ...(c.trustSince ?? {}), [fwd(ROOT)]: at }, trusted };
    });
    if (mine) {
      for (const [kind, name] of list) logEvent({ act: "signal", who: "trust", what: "approved", kind, ...(name === undefined ? {} : { name: String(name) }), how: "migration" });
      logEvent({ act: "signal", who: "trust", what: "migrated", approved: list.map(([kind, name]) => (name === undefined ? kind : `${kind}:${name}`)) });
    }
    settled = true;
  } catch {
    // The settings cannot be written (unreadable, read-only): nothing is
    // approved, and what asks finds everything waiting, with the reason said.
    settled = true;
  }
}

// ------------------------------------------------------------ what waits

/**
 * Everything that waits for the person's approval on this computer, with what
 * the person needs to decide: what each thing is, what it says it does, why
 * it waits.
 */
export async function pending() {
  if (!hasBrain()) return { ok: true, count: 0, guards: [], skills: [], sources: [], data: [], watch: [] };
  settle();
  const out = { ok: true, count: 0, guards: [], skills: [], sources: [], data: [], watch: [] };
  try {
    const { state } = await import("./executive.mjs");
    const floor = state({ harnesses: false });
    out.guards = floor.guards.filter((g) => g.pending).map((g) => ({ file: g.file, what: g.what ?? "", hooks: g.hooks.map((h) => ({ event: h.event, matcher: h.matcher ?? "" })), why: g.pending }));
    out.skills = [...floor.skills, ...floor.shared].filter((s) => s.pending).map((s) => ({ folder: s.folder, name: s.name ?? s.folder, description: s.description ?? "", why: s.pending }));
  } catch (e) {
    out.executiveError = String(e?.message ?? e).slice(0, 200);
  }
  let names = [];
  try {
    names = readdirSync(SOURCES());
  } catch {
    names = [];
  }
  for (const n of names.sort()) {
    const def = defOf(n);
    if (!runsAlone(def) || def.enabled === false) continue;
    const why = sourcePending(n);
    if (why) out.sources.push({ name: n, kind: def.kind === "claude" ? "judge" : def.kind, description: typeof def.description === "string" ? def.description : "", ...(Array.isArray(def.allowedTools) ? { allowedTools: def.allowedTools.map(String) } : {}), files: sourcePrint(n).files, why });
  }
  for (const [scheme, def] of Object.entries(registry())) {
    const why = dataPending(scheme, def);
    if (why) out.data.push({ scheme, tool: String(def.tool ?? scheme), ...dataFacts(def), why });
  }
  out.watch = watchPending().map(fwd);
  out.count = out.guards.length + out.skills.length + out.sources.length + out.data.length + out.watch.length;
  if (out.count) out.how = { window: `node "${fwd(join(PLUGIN_ROOT, "scripts", "trust.mjs"))}" window`, byHand: handLine() };
  return out;
}

// ------------------------------------------------------------ the person's terminal

const SAY = {
  en: {
    title: "Hypervibe Brain: what waits for your approval on this computer",
    none: "Nothing waits for your approval. You can close this window.",
    intro: ["Your brain travels (another computer, a restored copy). What it holds that RUNS by itself is only run on a computer once you said yes there, and asked again when it changed.", "For each one: what it is, and why it asks. Type yes to approve it, or press Enter to leave it waiting (it will not run meanwhile)."],
    guard: (g) => [`A guard: ${g.file}`, g.what ? `  What it says it does: ${g.what.split("\n")[0]}` : "  It does not say what it does.", `  When it runs: ${g.hooks.map((h) => `${h.event}${h.matcher ? ` (${h.matcher})` : ""}`).join(", ") || "never"}`],
    skill: (s) => [`A skill: ${s.name}`, s.description ? `  What it says it does: ${s.description}` : "  It has no description."],
    source: (s) => [`${s.kind === "judge" ? "A background reader (a judge)" : "A program of your brain"}: ${s.name}`, s.description ? `  What it says it does: ${s.description}` : "  It has no description.", ...(s.allowedTools ? [`  The tools it may use: ${s.allowedTools.join(", ")}`] : []), `  Its files: ${s.files.join(", ") || "none"}`],
    data: (d) => [`A data source: ${d.scheme}:// (${d.tool})`, ...(d.hosts.length ? [`  The services it speaks to: ${d.hosts.join(", ")}`] : []), ...(d.secrets.length ? [`  The keys it sends them: ${d.secrets.join(", ")}`] : []), ...(d.paths.length ? [`  The files it opens: ${d.paths.join(", ")}`] : [])],
    watch: (f) => [`A watched folder: ${f}`, "  Its documents are read by the background reader of the documents."],
    why: (w) => `  Why it asks: ${w}.`,
    ask: "  Approve it? (yes, or Enter to leave it) ",
    skillsAtOnce: (names) => [`${names.length} skills of yours wait to be shown to Claude on this computer:`, `  ${names.join(", ")}`, "  A skill runs nothing by itself: Claude follows it when you call it."],
    askAll: "  Approve them all at once? (yes, or Enter to see them one by one) ",
    yes: /^\s*(y|yes|oui|o)\s*$/i,
    done: (n, left) => `${n} approved, ${left} left waiting.`,
    close: "Press Enter to close this window.",
    noTty: "This command asks its questions in a terminal window.",
  },
  fr: {
    title: "Hypervibe Brain : ce qui attend votre accord sur cet ordinateur",
    none: "Rien n'attend votre accord. Vous pouvez fermer cette fenêtre.",
    intro: ["Votre brain voyage (un autre ordinateur, une copie restaurée). Ce qu'il contient et qui TOURNE tout seul ne tourne sur un ordinateur qu'une fois que vous y avez dit oui, et le redemande quand il a changé.", "Pour chacun : ce que c'est, et pourquoi il demande. Tapez oui pour l'approuver, ou Entrée pour le laisser en attente (il ne tournera pas d'ici là)."],
    guard: (g) => [`Un garde-fou : ${g.file}`, g.what ? `  Ce qu'il dit faire : ${g.what.split("\n")[0]}` : "  Il ne dit pas ce qu'il fait.", `  Quand il tourne : ${g.hooks.map((h) => `${h.event}${h.matcher ? ` (${h.matcher})` : ""}`).join(", ") || "jamais"}`],
    skill: (s) => [`Une skill : ${s.name}`, s.description ? `  Ce qu'elle dit faire : ${s.description}` : "  Elle n'a pas de description."],
    source: (s) => [`${s.kind === "judge" ? "Un lecteur de fond (un juge)" : "Un programme de votre brain"} : ${s.name}`, s.description ? `  Ce qu'il dit faire : ${s.description}` : "  Il n'a pas de description.", ...(s.allowedTools ? [`  Les outils dont il peut se servir : ${s.allowedTools.join(", ")}`] : []), `  Ses fichiers : ${s.files.join(", ") || "aucun"}`],
    data: (d) => [`Une source de données : ${d.scheme}:// (${d.tool})`, ...(d.hosts.length ? [`  Les services auxquels elle parle : ${d.hosts.join(", ")}`] : []), ...(d.secrets.length ? [`  Les clés qu'elle leur envoie : ${d.secrets.join(", ")}`] : []), ...(d.paths.length ? [`  Les fichiers qu'elle ouvre : ${d.paths.join(", ")}`] : [])],
    watch: (f) => [`Un dossier suivi : ${f}`, "  Ses documents sont lus par le lecteur de fond des documents."],
    why: (w) => `  Pourquoi il demande : ${WHY_FR[w] ?? w}.`,
    ask: "  L'approuver ? (oui, ou Entrée pour le laisser) ",
    skillsAtOnce: (names) => [`${names.length} de vos skills attendent d'être montrées à Claude sur cet ordinateur :`, `  ${names.join(", ")}`, "  Une skill ne lance rien toute seule : Claude la suit quand vous l'appelez."],
    askAll: "  Les approuver toutes d'un coup ? (oui, ou Entrée pour les voir une par une) ",
    yes: /^\s*(y|yes|oui|o)\s*$/i,
    done: (n, left) => `${n} approuvé(s), ${left} laissé(s) en attente.`,
    close: "Appuyez sur Entrée pour fermer cette fenêtre.",
    noTty: "Cette commande pose ses questions dans une fenêtre de terminal.",
  },
};
const WHY_FR = {
  "never approved on this computer": "jamais approuvé sur cet ordinateur",
  "changed since its approval": "modifié depuis son approbation",
  "its wiring (when it runs, on which tools) changed since its approval": "son branchement (quand il tourne, sur quels outils) a changé depuis son approbation",
  "it names another service, other keys or another file than when it was approved": "il nomme un autre service, d'autres clés ou un autre fichier que lors de son approbation",
};
const lang = () => {
  const l = readJson(join(ROOT, "brain.json"))?.lang;
  return l === "fr" ? "fr" : "en";
};

/** Shows each thing that waits and asks the person, one by one. In a terminal only. */
async function guide() {
  const W = SAY[lang()];
  const p = await pending();
  console.log(`\n${W.title}\n`);
  if (!p.count) {
    console.log(W.none);
    return { ok: true, approved: 0, left: 0 };
  }
  console.log(`${W.intro.join("\n")}\n`);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((done) => rl.question(q, done));
  let approved = 0;
  let n = 0;
  const one = async (lines, why, yes) => {
    n++;
    console.log(`${n}/${p.count}  ${lines.join("\n")}\n${W.why(why)}`);
    if (W.yes.test(String(await ask(W.ask)))) {
      await yes();
      approved++;
    }
    console.log("");
  };
  const executive = p.guards.length || p.skills.length ? await import("./executive.mjs") : null;
  for (const g of p.guards) await one(W.guard(g), g.why, () => executive.trust("guard", g.file));
  // Many skills at once (a computer that has just received the brain): one yes for all, or one by one.
  let skills = p.skills;
  if (skills.length > 3) {
    console.log(W.skillsAtOnce(skills.map((s) => s.name)).join("\n"));
    if (W.yes.test(String(await ask(W.askAll)))) {
      for (const s of skills) executive.trust("skill", s.folder);
      approved += skills.length;
      n += skills.length;
      skills = [];
    }
    console.log("");
  }
  for (const s of skills) await one(W.skill(s), s.why, () => executive.trust("skill", s.folder));
  for (const s of p.sources) await one(W.source(s), s.why, () => approveSource(s.name, "person"));
  for (const d of p.data) await one(W.data(d), d.why, () => approve([["data", d.scheme, dataPrint(registry()[d.scheme])]], "person"));
  for (const f of p.watch) await one(W.watch(f), "never approved on this computer", () => approveWatch([f], "person"));
  console.log(W.done(approved, p.count - approved));
  await ask(W.close);
  rl.close();
  return { ok: true, approved, left: p.count - approved };
}

/**
 * Opens a terminal window of the person's on `guide`, and comes back at once.
 * Says whether a window opened; the line to paste by hand is given either way.
 */
function openWindow(dry) {
  const script = join(PLUGIN_ROOT, "scripts", "trust.mjs");
  const base = { ok: true, opened: false, byHand: handLine() };
  // The bench, a run without a screen: never a window.
  if (dry || process.env.HVBRAIN_NO_WINDOW || process.env.HVBRAIN_HOME) return base;
  const WINDOWS = process.platform === "win32";
  try {
    if (WINDOWS) {
      const q = (s) => `'"${String(s).replace(/"/g, '\\"').replace(/'/g, "''")}"'`;
      const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Start-Process -FilePath ${q(process.execPath)} -ArgumentList @(${[script, "guide", "--brain", ROOT].map(q).join(",")})`], { windowsHide: true, timeout: 30_000 });
      return { ...base, opened: r.status === 0 };
    }
    const sh = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
    const line = `${sh(process.execPath)} ${sh(script)} guide --brain ${sh(ROOT)}`;
    if (process.platform === "darwin") {
      const r = spawnSync("osascript", ["-e", `tell application "Terminal"\n  activate\n  do script ${JSON.stringify(line)}\nend tell`], { encoding: "utf8", timeout: 30_000 });
      return { ...base, opened: r.status === 0 };
    }
    for (const [bin, a] of [["x-terminal-emulator", ["-e", "bash", "-lc", line]], ["gnome-terminal", ["--", "bash", "-lc", line]], ["konsole", ["-e", "bash", "-lc", line]], ["xterm", ["-e", "bash", "-lc", line]]]) {
      if (spawnSync("bash", ["-lc", `command -v ${bin}`], { stdio: "ignore", timeout: 15_000 }).status !== 0) continue;
      spawn(bin, a, { stdio: "ignore", detached: true }).unref();
      return { ...base, opened: true };
    }
  } catch {
    // no window: the line remains
  }
  return base;
}

const isMain = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/trust.mjs");
/** The command line. (Not awaited at the top of the module: executive.mjs imports this file, and `state` asks executive.mjs for the floor; a module that waits for one that waits for it never ends.) */
async function main() {
  const a = process.argv.slice(2).filter((x, i, all) => x !== "--brain" && all[i - 1] !== "--brain");
  const out = (o) => {
    console.log(JSON.stringify(o, null, 2));
    if (o.ok === false) process.exitCode = 1;
  };
  if (a[0] === "state") out(await pending());
  else if (a[0] === "window") out({ ...openWindow(a.includes("--dry")), waiting: (await pending()).count });
  else if (a[0] === "guide") {
    if (process.stdin.isTTY && process.stdout.isTTY) await guide();
    else {
      console.error(SAY[lang()].noTty);
      process.exitCode = 1;
    }
  } else if (a[0] === "approve" && (a[1] === "data" || a[1] === "watch") && a[2]) {
    if (!personAsks()) out(NOT_THE_PERSON());
    else if (!hasBrain()) out({ ok: false, error: "no brain set up on this computer yet" });
    else if (a[1] === "data") {
      const all = registry();
      const schemes = a[2] === "--all" ? Object.keys(all).filter((s) => needsApproval(all[s])) : [a[2]];
      if (schemes.some((s) => !needsApproval(all[s]))) out({ ok: false, error: `no data entry "${a[2]}" in this brain's registry (brain.json, data)` });
      else {
        settle();
        approve(schemes.map((s) => ["data", s, dataPrint(all[s])]), "person");
        out({ ok: true, approved: schemes });
      }
    } else {
      const watched = watchList();
      const folders = a[2] === "--all" ? watched : watched.filter((f) => spelled(f) === spelled(a[2]));
      if (!folders.length) out({ ok: false, error: a[2] === "--all" ? "no folder is watched" : `${fwd(a[2])} is not a watched folder of this brain` });
      else {
        approveWatch(folders, "person");
        out({ ok: true, approved: folders.map(fwd) });
      }
    }
  } else {
    console.log("usage: trust.mjs state | window [--dry] | guide | approve data <scheme>|--all | approve watch <folder>|--all (see the top of scripts/trust.mjs)");
    process.exitCode = 2;
  }
}
if (isMain) setImmediate(() => main().catch((e) => { console.log(JSON.stringify({ ok: false, error: String(e?.message ?? e) })); process.exitCode = 1; }));
