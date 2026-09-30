#!/usr/bin/env node
// discover.mjs - What this computer shows about the person's work, so that
// Claude can PROPOSE the types of notes of their brain (and discuss them with
// them: the types are theirs, validated by them, never imposed).
//
// FACTS, NOT GUESSES, AND NEVER A CONTENT. It reads folder names and counts
// files by kind; it opens no file (Claude's memory files excepted, of which it
// reads only the `type:` line). What it finds stays in this conversation.
//
//   node scripts/discover.mjs [--json] [--root <folder>]...
//
// Where it looks: the person's usual folders (Documents, Desktop, Downloads,
// the synced folders), their project folders (a folder holding git
// repositories), and Claude's memory. Depth and time are bounded: a huge disk
// is sampled, not crawled.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { HOME } from "./lib.mjs";

const args = process.argv.slice(2);
const extraRoots = args.flatMap((a, i) => (a === "--root" && args[i + 1] ? [args[i + 1]] : []));
const DEADLINE = Date.now() + 15_000;
const MAX_DEPTH = 4;

const KINDS = {
  slides: [".pptx", ".ppt", ".key", ".odp"],
  text: [".docx", ".doc", ".odt", ".pages", ".rtf"],
  pdf: [".pdf"],
  notes: [".md", ".txt"],
  images: [".jpg", ".jpeg", ".png", ".heic", ".webp", ".tif", ".tiff", ".psd"],
  sheets: [".xlsx", ".xls", ".csv", ".numbers", ".ods"],
  audio: [".mp3", ".wav", ".m4a", ".flac"],
  video: [".mp4", ".mov", ".mkv", ".avi"],
  code: [".js", ".ts", ".py", ".mjs", ".tsx", ".java", ".go", ".rs"],
};
const kindOf = (ext) => Object.entries(KINDS).find(([, list]) => list.includes(ext))?.[0] ?? null;
const SKIP = /^(\.|node_modules$|AppData$|Library$|Applications$|\$|System Volume Information$|venv$|__pycache__$)/;

/** A folder's own files and those of its sub-folders, counted by kind. */
function survey(dir, depth = 0, acc = { files: 0, kinds: {}, repos: [] }) {
  if (depth > MAX_DEPTH || Date.now() > DEADLINE) return acc;
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  if (entries.some((e) => e.name === ".git")) {
    acc.repos.push(basename(dir));
    return acc; // a repository is one project: its insides are not the person's documents
  }
  for (const e of entries) {
    if (SKIP.test(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) survey(p, depth + 1, acc);
    else {
      acc.files++;
      const k = kindOf(extname(e.name).toLowerCase());
      if (k) acc.kinds[k] = (acc.kinds[k] ?? 0) + 1;
    }
  }
  return acc;
}

const candidates = [
  "Documents", "Desktop", "Bureau", "Downloads", "Téléchargements",
  "Dropbox", "OneDrive", "Google Drive", "iCloud Drive",
  join("Library", "Mobile Documents", "com~apple~CloudDocs"),
  "DEV", "dev", "Dev", "code", "Code", "projects", "Projects", "Projets", "src", "work", "Work",
];
const roots = [...new Set([
  ...candidates.map((c) => join(HOME, c)),
  ...(process.platform === "win32" ? ["C:/DEV", "D:/DEV", "C:/Projects", "C:/code"] : []),
  ...extraRoots,
])].filter((r) => {
  try {
    return statSync(r).isDirectory();
  } catch {
    return false;
  }
});
// OneDrive for business on Windows: "OneDrive - Company".
try {
  for (const e of readdirSync(HOME, { withFileTypes: true })) if (e.isDirectory() && /^OneDrive - /.test(e.name)) roots.push(join(HOME, e.name));
} catch {
  // unreadable home: nothing more
}

const places = [];
for (const root of roots) {
  if (Date.now() > DEADLINE) break;
  let entries = [];
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    continue;
  }
  const folders = [];
  let repos = 0;
  for (const e of entries) {
    if (!e.isDirectory() || SKIP.test(e.name)) continue;
    if (Date.now() > DEADLINE) break;
    const s = survey(join(root, e.name), 1);
    repos += s.repos.length;
    // The names of its sub-folders: where a person's real kinds of work show
    // ("Talks", "Manuscripts", "Clients"...), more than in any count.
    let children = [];
    try {
      children = readdirSync(join(root, e.name), { withFileTypes: true }).filter((c) => c.isDirectory() && !SKIP.test(c.name)).map((c) => c.name).slice(0, 15);
    } catch {
      children = [];
    }
    if (s.files || s.repos.length) folders.push({ name: e.name, files: s.files, kinds: s.kinds, repos: s.repos.length, children });
  }
  folders.sort((a, b) => b.files + 50 * b.repos - (a.files + 50 * a.repos));
  places.push({ root: root.replace(/\\/g, "/"), repos, folders: folders.slice(0, 40) });
}

// Claude's memory: how the person's own Claude already sorts what it knows.
const memory = { files: 0, byType: {} };
const projectsDir = join(HOME, ".claude", "projects");
if (existsSync(projectsDir)) {
  for (const p of readdirSync(projectsDir)) {
    const dir = join(projectsDir, p, "memory");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".md") || f === "MEMORY.md") continue;
      memory.files++;
      try {
        const t = /^\s*type:\s*(\S+)/m.exec(readFileSync(join(dir, f), "utf8").slice(0, 800))?.[1] ?? "unknown";
        memory.byType[t] = (memory.byType[t] ?? 0) + 1;
      } catch {
        // unreadable: counted, not typed
      }
    }
  }
}

const report = { home: HOME.replace(/\\/g, "/"), places, claudeMemory: memory, timedOut: Date.now() > DEADLINE };
if (args.includes("--json")) console.log(JSON.stringify(report, null, 1));
else {
  for (const pl of places) {
    console.log(`\n${pl.root}${pl.repos ? ` (${pl.repos} git project(s))` : ""}`);
    for (const f of pl.folders.slice(0, 15)) {
      const kinds = Object.entries(f.kinds).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${n} ${k}`).join(", ");
      console.log(`  ${f.name}: ${f.files} file(s)${kinds ? ` (${kinds})` : ""}${f.repos ? `, ${f.repos} project(s)` : ""}${f.children.length ? `
      > ${f.children.join(" | ")}` : ""}`);
    }
  }
  console.log(`\nClaude's memory: ${memory.files} file(s) ${JSON.stringify(memory.byType)}${report.timedOut ? "\n(partial: time budget reached)" : ""}\n`);
}
