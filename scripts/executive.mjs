#!/usr/bin/env node
// executive.mjs - The executive floor of the brain: the person's skills and
// guards, kept in the brain and placed where the AI's platform looks for them.
//
//   node scripts/executive.mjs state                 what the floor holds, and whether each piece is placed
//   node scripts/executive.mjs adopt-skill <name>    moves ~/.claude/skills/<name> into the brain, and links it back
//   node scripts/executive.mjs adopt-guard <file> [--with <file>...]
//                                                    moves ~/.claude/hooks/<file> into the brain, and points the settings at it;
//                                                    --with: a file it uses beside it (a window, a list), moved and locked with it
//   node scripts/executive.mjs place                 puts back every link and every guard the brain holds AND the person approved here
//   node scripts/executive.mjs trust guard|skill <name>   (in the person's own terminal) approves one, then places it
//   node scripts/executive.mjs candidates            what is left in ~/.claude to bring in: skills, hooks (with what each says it does)
//
// NOTHING IS PLACED THAT THE PERSON DID NOT APPROVE ON THIS COMPUTER
// (2026-11-27, security audit; trust.mjs). `place` read executive/guards.json
// and wrote a hook for each of its lines into the platform's settings, on the
// moment and the tools the file chose, and linked every skill: a brain that
// arrived by a clone, or a pull that changed a guard, was code run at the next
// action, with nobody asked. Each guard and each skill now has a fingerprint
// approved on this computer: `adopt-*` approves what it has just brought in
// (the person asked for it here), `trust` approves one that arrived, in the
// person's own terminal, and `place` only places what is approved; the rest
// is listed as `pending`. A guard is no longer run straight from the brain:
// the settings run a small program beside them (hook-guard.mjs, copied to
// ~/.hypervibe-brain/guard.mjs) that checks the fingerprint at each run and,
// when the guard changed, refuses what it guards instead of running it.
// A name of file, a moment or a pattern of tools that is not well formed is
// never written in the settings.
//
// WHY (2026-11-22). The memory of the person's AI went into the brain on
// 2026-11-04, so that another AI plugged into the brain loses nothing. What
// the AI KNOWS HOW TO DO stayed in the platform's folders: the person's own
// skills (~/.claude/skills) and the guards that frame them (~/.claude/hooks,
// wired in ~/.claude/settings.json). This floor is the brain's second one: the
// executive memory, next to the knowledge.
//
// THE PLATFORM STILL FINDS THEM WHERE IT LOOKS. A skill is not looked up like
// a note: Claude Code lists it in the AI's context and calls it by
// /<name>. So the brain is the source, and the platform's folder holds a link
// to it (a junction on Windows, which needs no rights): the skill stays
// callable as before, and an edit of it is an edit in the brain.
//
// A GUARD IS NOT A SKILL. A skill may be changed by the AI (that is how it
// learns); a guard must not be: an AI that may rewrite what frames it is not
// framed. The guards of the floor are locked against the AI's writes
// (hook-executive.mjs); the person changes them by hand. Their wiring is the
// platform's own: the floor keeps it in executive/guards.json and writes it in
// the platform's settings.
//
// THE BRAIN HOLDS CODE HERE, AND ONLY HERE. Everywhere else a brain is data and
// the code lives in the plugin (lib.mjs); this floor is the person's own code,
// which no plugin update may touch. A file is never deleted: what is moved is
// first copied to ~/.hypervibe-brain/backups/executive/<when>/.

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, hasBrain, readJsonFile, requireBrain, writeFileAtomic, writeJsonAtomic } from "./lib.mjs";
import { NOT_THE_PERSON, approval, approve, guardPending, guardPrint, personAsks, skillPending, skillPrint } from "./trust.mjs";

export const FLOOR = join(ROOT, "executive");
export const SKILLS = join(FLOOR, "skills");
export const GUARDS = join(FLOOR, "guards");
export const MANIFEST = join(FLOOR, "guards.json");
const PLATFORM = join(HOME, ".claude");
const PLATFORM_SKILLS = join(PLATFORM, "skills");
const PLATFORM_HOOKS = join(PLATFORM, "hooks");
const SETTINGS = join(PLATFORM, "settings.json");
const fwd = (p) => String(p).replaceAll("\\", "/");
const same = (a, b) => fwd(resolve(a)).toLowerCase() === fwd(resolve(b)).toLowerCase();

/** The name and description a skill declares at the head of its SKILL.md. */
export function skillHead(dir) {
  try {
    const text = readFileSync(join(dir, "SKILL.md"), "utf8").replace(/^﻿/, "");
    const head = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? "";
    const field = (k) => new RegExp(`^${k}:\\s*(.*)$`, "m").exec(head)?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
    return { name: field("name") || basename(dir), description: field("description") };
  } catch {
    return { name: basename(dir), description: "" };
  }
}

/** Where a path of the platform's skills leads: "linked" to the brain, "missing", or "other" (a folder of its own, or a link elsewhere). */
function placement(name) {
  const at = join(PLATFORM_SKILLS, name);
  let st;
  try {
    st = lstatSync(at);
  } catch {
    return "missing";
  }
  if (!st.isSymbolicLink()) return "other";
  try {
    return same(realpathSync(at), join(SKILLS, name)) ? "linked" : "other";
  } catch {
    return "other";
  }
}

/** The wiring of the guards. One that cannot be read is never written over (a guard would be lost). */
function readManifest() {
  const r = readJsonFile(MANIFEST, {});
  if (r.unreadable) throw new Error(`${fwd(MANIFEST)} cannot be read (${r.error}): nothing done, put it right by hand`);
  return r.value ?? {};
}
const readSettings = () => {
  if (!existsSync(SETTINGS)) return {};
  const raw = readFileSync(SETTINGS, "utf8");
  return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
};
/** The program beside the settings that runs a guard once it has checked its fingerprint: a copy of the plugin's hook-guard.mjs. */
const LAUNCHER = join(HOME, ".hypervibe-brain", "guard.mjs");
/** The command that runs a guard of the floor: through the launcher (forward slashes, quoted: a folder may hold a space). */
const guardCommand = (file) => `node "${fwd(LAUNCHER)}" "${fwd(join(GUARDS, file))}"`;
/** Whether a command of the settings runs this file (whatever its slashes or quotes). */
const runs = (command, path) => fwd(String(command)).replaceAll('"', "").toLowerCase().includes(fwd(path).toLowerCase());
const squeezed = (command) => fwd(String(command)).replaceAll('"', "").replace(/\s+/g, " ").trim().toLowerCase();
/** Whether a command of the settings runs this guard through the launcher. */
const viaLauncher = (command, file) => squeezed(command) === squeezed(guardCommand(file));
/** Whether a command of the settings runs this guard straight from the brain, as before 2026-11-27. */
const straight = (command, file) => squeezed(command) === squeezed(`node ${fwd(join(GUARDS, file))}`);
/** Keeps the launcher beside the settings equal to the plugin's own (an update of the plugin may have changed it). */
function writeLauncher() {
  const own = readFileSync(join(PLUGIN_ROOT, "scripts", "hook-guard.mjs"), "utf8");
  let kept = null;
  try {
    kept = readFileSync(LAUNCHER, "utf8");
  } catch {
    kept = null;
  }
  if (kept !== own) writeFileAtomic(LAUNCHER, own);
}

// WHAT A LINE OF guards.json MAY SAY (2026-11-27). Its key is a file's name
// and nothing else: it ends in the command the settings run, and a key such
// as `x.mjs" & other-program & rem "` was a command of its own. Its moments
// are those the platform runs a hook at, its pattern of tools a pattern.
const GUARD_FILE = /^[\w.-]+\.m?js$/;
const MOMENTS = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "UserPromptSubmit", "Stop", "SubagentStart", "SubagentStop", "SessionStart", "SessionEnd", "Notification", "PreCompact"]);
/** Why a line of guards.json is never wired, or null. @param {string} file @param {any} g */
function wiringProblem(file, g) {
  if (!GUARD_FILE.test(file)) return "its name is not a guard's file name (letters, digits, dots and dashes, ending in .mjs or .js)";
  if (!g || typeof g !== "object" || !Array.isArray(g.hooks) || !g.hooks.length) return "it says no moment to run at";
  for (const h of g.hooks) {
    if (!h || typeof h !== "object" || !MOMENTS.has(h.event)) return `"${String(h?.event ?? "").slice(0, 40)}" is not a moment the platform runs a hook at`;
    if (h.matcher !== undefined) {
      if (typeof h.matcher !== "string" || h.matcher.length > 300 || /[\x00-\x1f]/.test(h.matcher)) return "its pattern of tools is not one line of text";
      try {
        new RegExp(h.matcher);
      } catch {
        return "its pattern of tools cannot be read as a pattern";
      }
    }
    if (h.timeout !== undefined && !(Number.isFinite(h.timeout) && h.timeout > 0 && h.timeout <= 3600)) return "its time limit is not a number of seconds";
  }
  if (g.with !== undefined && !(Array.isArray(g.with) && g.with.every((w) => typeof w === "string" && /^[\w.-]+$/.test(w)))) return "a file it names beside it is not a file's name";
  if (/["$`\n\r]/.test(fwd(LAUNCHER)) || /["$`\n\r]/.test(fwd(GUARDS))) return "the brain's folder or the home folder holds a character a command cannot carry safely";
  return null;
}

/** What the guard's first comment says it does. */
function guardWhat(file) {
  return headComment(join(GUARDS, file));
}

/**
 * What a script says it does: the comment at its head (after a #! line), its
 * paragraphs and its lists kept, without the "name.mjs - " it often starts
 * with. Paragraphs are taken while the text stays short enough for a card
 * (about 900 characters, the first one always): a first line alone ("sigtop
 * for Claude") said nothing of what the guard allows and refuses (2026-11-23).
 * @param {string} path
 * @returns {string} markdown: paragraphs apart, the items of a list one per line
 */
function headComment(path) {
  try {
    const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((l, i) => !(i === 0 && l.startsWith("#!")));
    /** @type {string[][]} the paragraphs, each a list of logical lines (an item of a list is one line) */
    const paragraphs = [[]];
    for (const l of lines) {
      const m = /^\s*\/\/(.*)$/.exec(l);
      if (!m) break;
      const raw = m[1].replace(/^ /, "");
      const p = /** @type {string[]} */ (paragraphs.at(-1));
      if (!raw.trim()) { if (p.length) paragraphs.push([]); continue; }
      // A new item of a list starts its own line; an indented line goes on the one before.
      if (/^\s*[-*]\s+/.test(raw) || !p.length) p.push(raw.trim());
      else p[p.length - 1] += ` ${raw.trim()}`;
    }
    const kept = [];
    let length = 0;
    for (const p of paragraphs.filter((x) => x.length)) {
      const text = p.join("\n");
      if (kept.length && length + text.length > 900) break;
      kept.push(text);
      length += text.length;
    }
    return kept.join("\n\n").replace(/^[\w.-]+\.m?js\s*[-:]\s*/i, "");
  } catch {
    return "";
  }
}

/**
 * What the floor holds, and whether each piece is in place. `harnesses: false`
 * leaves out the plugins of the computer (the start asks every few seconds
 * whether the floor is in place, and reads no plugin for that, 2026-11-23).
 */
export function state({ harnesses: withHarnesses = true } = {}) {
  // What ran here before the approvals existed is approved once, as it is (migrate).
  const carried = migrate();
  // A skill that is linked stays so; one that is not waits for an approval (trust.mjs, skillPending).
  const waits = (name) => (placement(name) === "missing" ? skillPending(name) : null);
  const skills = existsSync(SKILLS)
    ? readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory() && existsSync(join(SKILLS, d.name, "SKILL.md"))).map((d) => ({ ...skillHead(join(SKILLS, d.name)), folder: d.name, placed: placement(d.name), pending: waits(d.name) }))
    : [];
  const manifest = readManifest();
  let settings = {};
  try {
    settings = readSettings();
  } catch {
    settings = {};
  }
  const guards = Object.entries(manifest).map(([file, g]) => {
    const invalid = wiringProblem(file, g);
    const hooks = invalid ? [] : g.hooks;
    const wired = hooks.map((h) => ({
      ...h,
      // In place: the settings run it through the launcher, which checks its fingerprint at each run.
      placed: (settings.hooks?.[h.event] ?? []).some((group) => (group.matcher ?? "") === (h.matcher ?? "") && (group.hooks ?? []).some((x) => viaLauncher(x.command, file))),
    }));
    const present = !invalid && existsSync(join(GUARDS, file));
    // Why it waits for the person: a line that is not well formed, a file that is gone, a fingerprint that is not the approved one.
    const pending = invalid ?? (present ? guardPending(file, g) : "its file is not in the brain's executive floor");
    return { file: String(file).slice(0, 200), what: (invalid ? "" : guardWhat(file)) || String(g?.what ?? ""), present, hooks: wired, placed: wired.length > 0 && wired.every((h) => h.placed), approved: !pending, pending, ...(invalid ? { invalid } : {}) };
  });
  // A folder other skills use (no SKILL.md of its own, "_presta"): kept and linked like a skill, not shown as one.
  const shared = existsSync(SKILLS) ? readdirSync(SKILLS, { withFileTypes: true }).filter((d) => d.isDirectory() && !existsSync(join(SKILLS, d.name, "SKILL.md"))).map((d) => ({ folder: d.name, placed: placement(d.name), pending: waits(d.name) })) : [];
  // The launcher the settings run is kept equal to the plugin's own, and put
  // back when it is gone (an update of the plugin may have changed it; without
  // it a wired guard would not run at all).
  if (guards.some((g) => g.placed)) {
    try {
      writeLauncher();
    } catch {
      // read-only settings folder: the copy that is there goes on serving
    }
  }
  // WHAT WAITS FOR THE PERSON'S APPROVAL, in one list (the status says it first).
  const pending = [
    ...guards.filter((g) => g.pending).map((g) => ({ kind: "guard", name: g.file, why: g.pending })),
    ...[...skills, ...shared].filter((s) => s.pending).map((s) => ({ kind: "skill", name: s.folder, why: s.pending })),
  ];
  return {
    ok: true,
    floor: fwd(FLOOR),
    skills: skills.map((s) => ({ ...s, file: fwd(join(SKILLS, s.folder, "SKILL.md")) })),
    shared,
    guards,
    pending,
    ...(pending.length ? { approve: `node "${fwd(join(PLUGIN_ROOT, "scripts", "trust.mjs"))}" window` } : {}),
    ...(carried.length ? { carried } : {}),
    harnesses: withHarnesses ? harnesses() : [],
  };
}

/**
 * WHAT WAS ALREADY IN PLACE IS APPROVED ONCE, AS IT IS (2026-11-27). On a
 * computer that ran the floor before the approvals existed, a guard the
 * settings still run straight from the brain, and a skill the platform's
 * folder still links to, were in use here: each is approved as it stands, the
 * guards are wired again through the launcher, and it is written in the
 * brain's journal. It happens once: afterwards no guard is wired the old way,
 * so a guard or a skill that arrives later waits for the person.
 * @returns {string[]} what was approved this time
 */
function migrate() {
  if (!hasBrain() || !existsSync(FLOOR)) return [];
  let manifest = {};
  let settings = null;
  try {
    manifest = readManifest();
    settings = readSettings();
  } catch {
    return [];
  }
  /** @type {[string, string, object][]} */
  const list = [];
  const commands = Object.values(settings.hooks ?? {}).flatMap((groups) => (Array.isArray(groups) ? groups : []).flatMap((g) => (g?.hooks ?? []).map((h) => String(h?.command ?? ""))));
  const old = Object.entries(manifest).filter(([file, g]) => !wiringProblem(file, g) && existsSync(join(GUARDS, file)) && commands.some((c) => straight(c, file)));
  for (const [file, g] of old) if (!approval("guard", file)) list.push(["guard", file, guardPrint(file, g)]);
  if (existsSync(SKILLS)) {
    for (const d of readdirSync(SKILLS, { withFileTypes: true })) if (d.isDirectory() && placement(d.name) === "linked" && !approval("skill", d.name)) list.push(["skill", d.name, skillPrint(d.name)]);
  }
  if (!list.length && !old.length) return [];
  try {
    approve(list, "migration");
    if (old.length) {
      writeLauncher();
      for (const groups of Object.values(settings.hooks ?? {})) for (const group of Array.isArray(groups) ? groups : []) for (const h of group?.hooks ?? []) for (const [file] of old) if (straight(h.command, file)) h.command = guardCommand(file);
      backup("settings.json", SETTINGS);
      writeFileAtomic(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
    }
  } catch {
    return []; // settings that cannot be written: tried again at the next reading
  }
  return list.map(([kind, name]) => `${kind} ${name}`);
}

/**
 * THE HARNESSES (2026-11-23): the plugins installed on this computer, and
 * their skills. They are not moved into the brain (each is a product, with
 * its own repository and versions); the floor shows them beside the person's
 * own skills, for what the AI knows how to do as a whole.
 * @returns {{ name: string, version: string, skills: { name: string, description: string, folder: string, file: string }[], hooks: { event: string, matcher: string, script: string, file?: string, what?: string }[] }[]}
 */
function harnesses() {
  const list = readJsonFile(join(PLATFORM, "plugins", "installed_plugins.json"), {}).value ?? {};
  const out = [];
  for (const [key, installs] of Object.entries(list.plugins ?? list)) {
    const install = [].concat(installs)[0];
    const root = install?.installPath;
    if (!root || !existsSync(join(root, "skills"))) continue;
    const skills = readdirSync(join(root, "skills"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(root, "skills", d.name, "SKILL.md")))
      .map((d) => ({ ...skillHead(join(root, "skills", d.name)), folder: d.name, file: fwd(join(root, "skills", d.name, "SKILL.md")) }));
    let version = String(install.version ?? "");
    try {
      version = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8")).version ?? version;
    } catch {
      // the registry's word
    }
    // Its hooks too (2026-11-23): what the plugin checks or does on its own, around the AI's work.
    /** @type {{ event: string, matcher: string, script: string, file?: string, what?: string }[]} */
    const hooks = [];
    try {
      const declared = JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8")).hooks ?? {};
      for (const [event, groups] of Object.entries(declared)) for (const g of groups ?? []) for (const h of g.hooks ?? []) {
        const script = /([\w.-]+\.(?:m?js|ps1|sh|py))/.exec(String(h.command ?? ""))?.[1] ?? String(h.command ?? "").slice(0, 60);
        // Its file, to say what it does: the path in its command, the plugin's folder put back.
        const path = /"([^"]+\.(?:m?js|ps1|sh|py))"|(\S+\.(?:m?js|ps1|sh|py))/.exec(String(h.command ?? "").replaceAll("${CLAUDE_PLUGIN_ROOT}", fwd(root)));
        const file = path ? fwd(path[1] ?? path[2]) : "";
        hooks.push({ event, matcher: String(g.matcher ?? ""), script, ...(file && existsSync(file) ? { file, what: headComment(file) } : {}) });
      }
    } catch {
      // no hook
    }
    if (skills.length) out.push({ name: key.split("@")[0], version, skills, hooks });
  }
  return out.sort((a, b) => b.skills.length - a.skills.length);
}

/** A copy of what is about to move, in ~/.hypervibe-brain/backups/executive/<when>/. */
function backup(what, from) {
  const dir = join(HOME, ".hypervibe-brain", "backups", "executive", new Date().toISOString().replace(/[:.]/g, "-"), what);
  mkdirSync(join(dir, ".."), { recursive: true });
  cpSync(from, dir, { recursive: true });
  return fwd(dir);
}

/** A folder moved (a rename, else a copy and then the original removed once the copy is whole). */
function move(from, to) {
  try {
    renameSync(from, to);
  } catch {
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

/** The link the platform reads, to the skill in the brain. */
function link(name) {
  mkdirSync(PLATFORM_SKILLS, { recursive: true });
  symlinkSync(join(SKILLS, name), join(PLATFORM_SKILLS, name), "junction");
}

export function adoptSkill(name, { shared = false } = {}) {
  requireBrain();
  if (!/^[\w.-]+$/.test(name)) return { ok: false, error: `not a skill's folder name: ${name}` };
  const at = join(PLATFORM_SKILLS, name);
  const was = placement(name);
  if (was === "linked") return { ok: true, already: true, skill: name };
  if (was === "missing") return { ok: false, error: `no skill ${name} in ${fwd(PLATFORM_SKILLS)}` };
  if (lstatSync(at).isSymbolicLink()) return { ok: false, error: `${fwd(at)} is a link to ${fwd(readlinkSync(at))}: it is someone else's, left as it is` };
  if (!existsSync(join(at, "SKILL.md")) && !shared) return { ok: false, error: `${fwd(at)} holds no SKILL.md (a folder that other skills use is brought in with --shared)` };
  if (existsSync(join(SKILLS, name))) return { ok: false, error: `the brain holds a skill ${name} already: nothing moved` };
  const saved = backup(join("skills", name), at);
  mkdirSync(SKILLS, { recursive: true });
  move(at, join(SKILLS, name));
  link(name);
  // Brought in from this very computer, at the person's word: approved as it is.
  approve([["skill", name, skillPrint(name)]], "adopted");
  return { ok: placement(name) === "linked", skill: name, in: fwd(join(SKILLS, name)), linkedFrom: fwd(at), backup: saved };
}

export function adoptGuard(file, companions = []) {
  requireBrain();
  if (!/^[\w.-]+\.m?js$/.test(file)) return { ok: false, error: `not a guard's file name (a .mjs or .js file of ${fwd(PLATFORM_HOOKS)}): ${file}` };
  const from = join(PLATFORM_HOOKS, file);
  const manifest = readManifest();
  if (manifest[file] && existsSync(join(GUARDS, file))) return { ok: true, already: true, guard: file };
  if (!existsSync(from)) return { ok: false, error: `no guard ${file} in ${fwd(PLATFORM_HOOKS)}` };
  const settings = readSettings();
  /** @type {{ event: string, matcher?: string, timeout?: number }[]} */
  const hooks = [];
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    for (const group of groups ?? []) {
      for (const h of group.hooks ?? []) {
        if (!runs(h.command, from)) continue;
        // Only "node <file>": anything else around it (an argument, another
        // program) would be lost in the move, so nothing moves.
        if (!/^\s*node\s+"?[^"\s]+"?\s*$/.test(String(h.command))) return { ok: false, error: `the settings run ${file} with something more than "node <file>" (${h.command}): nothing moved` };
        hooks.push({ event, ...(group.matcher !== undefined ? { matcher: group.matcher } : {}), ...(h.timeout ? { timeout: h.timeout } : {}) });
      }
    }
  }
  if (!hooks.length) return { ok: false, error: `${file} is not wired in ${fwd(SETTINGS)}: a guard nobody runs guards nothing, nothing moved` };
  // A file the guard uses beside it goes with it: left behind, it could be
  // changed by the AI while the guard itself is locked (2026-11-23).
  for (const extra of companions) {
    if (!/^[\w.-]+$/.test(extra) || !existsSync(join(PLATFORM_HOOKS, extra))) return { ok: false, error: `no file ${extra} beside the guard in ${fwd(PLATFORM_HOOKS)}: nothing moved` };
  }
  const saved = backup(join("hooks", file), from);
  for (const extra of companions) {
    backup(join("hooks", extra), join(PLATFORM_HOOKS, extra));
    mkdirSync(GUARDS, { recursive: true });
    cpSync(join(PLATFORM_HOOKS, extra), join(GUARDS, extra));
  }
  const entry = { what: "", hooks, ...(companions.length ? { with: companions } : {}) };
  const problem = wiringProblem(file, entry);
  if (problem) return { ok: false, error: `${file}: ${problem}: nothing moved` };
  backup("settings.json", SETTINGS);
  mkdirSync(GUARDS, { recursive: true });
  cpSync(from, join(GUARDS, file));
  entry.what = guardWhat(file);
  // Brought in from this very computer, at the person's word: approved as it
  // is, BEFORE the settings run it (the launcher refuses a guard not approved).
  writeLauncher();
  approve([["guard", file, guardPrint(file, entry)]], "adopted");
  // The settings run it from the brain, through the launcher, at the same place in the same order.
  for (const groups of Object.values(settings.hooks ?? {})) for (const group of groups ?? []) for (const h of group.hooks ?? []) if (runs(h.command, from)) h.command = guardCommand(file);
  writeFileAtomic(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
  writeJsonAtomic(MANIFEST, { ...manifest, [file]: entry });
  rmSync(from);
  for (const extra of companions) rmSync(join(PLATFORM_HOOKS, extra));
  const now = state().guards.find((g) => g.file === file);
  return { ok: Boolean(now?.placed), guard: file, in: fwd(join(GUARDS, file)), hooks, backup: saved };
}

/** Puts back what the brain holds: the links of its skills, the wiring of its guards. Touches nothing that is someone else's. */
/**
 * WHAT IS LEFT TO BRING IN (2026-11-23): the skills of the platform's folder
 * that are folders of their own (not yet links to the brain), and the hooks
 * the settings run from ~/.claude/hooks, each with what it says it does; the
 * files of that folder that no setting runs are named apart (a file a guard
 * uses beside it, or something left over).
 */
export function candidates() {
  const skills = [];
  if (existsSync(PLATFORM_SKILLS)) {
    for (const d of readdirSync(PLATFORM_SKILLS, { withFileTypes: true })) {
      const at = join(PLATFORM_SKILLS, d.name);
      let link = false;
      try {
        link = lstatSync(at).isSymbolicLink();
      } catch {
        continue;
      }
      if (link || !d.isDirectory()) continue;
      const head = skillHead(at);
      skills.push({ folder: d.name, ...head, hasSkill: existsSync(join(at, "SKILL.md")) });
    }
  }
  let settings = {};
  try {
    settings = readSettings();
  } catch {
    settings = {};
  }
  const commands = Object.entries(settings.hooks ?? {}).flatMap(([event, groups]) => (groups ?? []).flatMap((g) => (g.hooks ?? []).map((h) => ({ event, matcher: g.matcher ?? "", command: String(h.command ?? "") }))));
  const hooks = [];
  const loose = [];
  if (existsSync(PLATFORM_HOOKS)) {
    for (const file of readdirSync(PLATFORM_HOOKS).filter((f) => /\.(m?js|ps1|sh|py)$/.test(f))) {
      const wired = commands.filter((c) => runs(c.command, join(PLATFORM_HOOKS, file)));
      if (wired.length) hooks.push({ file, what: headComment(join(PLATFORM_HOOKS, file)), hooks: wired.map(({ event, matcher }) => ({ event, matcher })) });
      else loose.push(file);
    }
  }
  return { ok: true, skills, hooks, loose };
}

export function place() {
  requireBrain();
  const done = [];
  const left = [];
  /** @type {{ kind: string, name: string, why: string }[]} what waits for the person's approval, and is not placed */
  const pending = [];
  const now = state();
  for (const s of [...now.skills, ...now.shared]) {
    if (s.placed === "linked") continue;
    if (s.placed !== "missing") { left.push(`skill ${s.folder}: ${fwd(join(PLATFORM_SKILLS, s.folder))} is a folder of its own, left as it is`); continue; }
    if (s.pending) { pending.push({ kind: "skill", name: s.folder, why: s.pending }); continue; }
    link(s.folder);
    done.push(`skill ${s.folder}`);
  }
  const settings = readSettings();
  let changed = false;
  const manifest = readManifest();
  const tail = (file) => `/${fwd(GUARDS).split("/").slice(-2).join("/")}/${file}`.toLowerCase();
  for (const g of now.guards) {
    // Never wired: a line that is not well formed, a guard the person did not approve as it stands.
    if (g.pending) { pending.push({ kind: "guard", name: g.file, why: g.pending }); continue; }
    const file = g.file;
    for (const h of manifest[file].hooks) {
      settings.hooks ??= {};
      const groups = (settings.hooks[h.event] ??= []);
      // A guard already wired for this matcher, maybe at another place of the
      // brain (the brain moved) or straight from it (before 2026-11-27): its
      // command is put right. (Per matcher: one guard may be wired twice, for
      // two kinds of tools.)
      let found = false;
      for (const group of groups.filter((x) => (x.matcher ?? "") === (h.matcher ?? ""))) for (const x of group.hooks ?? []) if (fwd(String(x.command)).replaceAll('"', "").trim().toLowerCase().endsWith(tail(file))) {
        found = true;
        if (x.command !== guardCommand(file)) { x.command = guardCommand(file); changed = true; done.push(`guard ${file}: path`); }
      }
      if (found) continue;
      let group = groups.find((x) => (x.matcher ?? "") === (h.matcher ?? ""));
      if (!group) { group = { ...(h.matcher !== undefined ? { matcher: h.matcher } : {}), hooks: [] }; groups.push(group); }
      group.hooks.push({ type: "command", command: guardCommand(file), ...(h.timeout ? { timeout: h.timeout } : {}) });
      changed = true;
      done.push(`guard ${file}`);
    }
  }
  // The launcher the settings run, kept equal to the plugin's own.
  if (now.guards.some((g) => !g.pending)) writeLauncher();
  if (changed) {
    backup("settings.json", SETTINGS);
    writeFileAtomic(SETTINGS, `${JSON.stringify(settings, null, 2)}\n`);
  }
  return { ok: left.length === 0, done, ...(left.length ? { left } : {}), ...(pending.length ? { pending, approve: `node "${fwd(join(PLUGIN_ROOT, "scripts", "trust.mjs"))}" window` } : {}) };
}

/**
 * THE PERSON APPROVES one guard or one skill as it stands on this computer,
 * then it is placed. Called from their own terminal (the command below, or
 * trust.mjs guide): never by the AI.
 * @param {"guard" | "skill"} kind @param {string} name
 */
export function trust(kind, name) {
  requireBrain();
  if (kind === "guard") {
    const g = readManifest()[name];
    const problem = g ? wiringProblem(name, g) : `the floor's guards.json names no guard ${String(name).slice(0, 80)}`;
    if (problem) return { ok: false, error: `${String(name).slice(0, 80)}: ${problem}` };
    if (!existsSync(join(GUARDS, name))) return { ok: false, error: `${name}: its file is not in the brain's executive floor` };
    approve([["guard", name, guardPrint(name, g)]], "person");
  } else if (kind === "skill") {
    if (!/^[\w.-]+$/.test(String(name)) || !existsSync(join(SKILLS, name))) return { ok: false, error: `no skill ${String(name).slice(0, 80)} in the brain's executive floor` };
    approve([["skill", name, skillPrint(name)]], "person");
  } else return { ok: false, error: "trust guard <file> | trust skill <name>" };
  const placed = place();
  return { ok: true, approved: `${kind} ${name}`, placed: placed.done, ...(placed.pending ? { pending: placed.pending } : {}) };
}

if (process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/executive.mjs")) {
  const [command, arg] = process.argv.slice(2);
  const out = (o) => { console.log(JSON.stringify(o, null, 2)); process.exitCode = o.ok === false ? 1 : 0; };
  try {
    if (command === "state") out(state());
    else if (command === "candidates") out(candidates());
    else if (command === "adopt-skill" && arg) out(adoptSkill(arg, { shared: process.argv.includes("--shared") }));
    else if (command === "adopt-guard" && arg) {
      const args = process.argv.slice(4);
      const companions = args.flatMap((a, i) => (args[i - 1] === "--with" ? [a] : []));
      out(adoptGuard(arg, companions));
    }
    else if (command === "place") out(place());
    // An approval is the person's own gesture, in a terminal of theirs (trust.mjs).
    else if (command === "trust" && arg && process.argv[4]) out(personAsks() ? trust(arg, process.argv[4]) : NOT_THE_PERSON());
    else { console.log("usage: executive.mjs state | candidates | adopt-skill <name> | adopt-guard <file> | place | trust guard|skill <name> (see the top of scripts/executive.mjs)"); process.exitCode = 1; }
  } catch (e) {
    out({ ok: false, error: String(e?.message ?? e) });
  }
}
