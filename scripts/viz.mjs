#!/usr/bin/env node
// viz.mjs - Seeing the brain.
//
//   detect        is Hypervibe installed on this computer? (decides between the
//                 simple viewer and the persistent app)
//   build         the SIMPLE VIEWER: one self-contained page, the brain as a
//                 graph (colour = domain, size = links, dashed = seed), with
//                 search, filters and a side panel. Written to
//                 <brain>/viz/brain.html (out of git: it is rebuilt from the
//                 notes). --if-exists: only if it was built once (the evening
//                 save refreshes it).
//   export        the same data as JSON, for the persistent app.
//   publish-app   writes that JSON into the app's repository (the path chosen
//                 at the app's creation, in hyperbrain.json), commits ONLY
//                 that file, and pushes if the person agreed to it.
//
// WHAT NEVER LEAVES: the content of a private note. Its title and links are
// in the graph (it exists), its text never is, in the page or in the export.
// The export for the app carries no excerpt of private notes, no file path,
// no source that is a path on this computer.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { HOME, PLUGIN_ROOT, ROOT, config, readVault, requireBrain, today } from "./lib.mjs";
import { brainLang } from "./i18n.mjs";

const args = process.argv.slice(2);
const command = args[0];
const out = (o) => console.log(JSON.stringify(o));

/** Hypervibe, wherever Claude installed it (marketplace or cache). */
function findHypervibe() {
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name === ".git") continue;
      const p = join(dir, e.name);
      const manifest = join(p, ".claude-plugin", "plugin.json");
      if (existsSync(manifest)) {
        try {
          const m = JSON.parse(readFileSync(manifest, "utf8"));
          if (m.name === "hypervibe" || m.name?.startsWith("hypervibe-team")) found.push({ name: m.name, version: m.version, path: p.replace(/\\/g, "/") });
        } catch {
          // unreadable manifest
        }
      } else walk(p, depth + 1);
    }
  };
  walk(join(HOME, ".claude", "plugins"), 0);
  return found;
}

const LOCAL_PATH = /^(?:file:\/\/)?(?:[A-Za-z]:[\\/]|\/|~[\\/])/;

/** The graph of the brain. `forApp`: nothing a web server should hold. */
function graph({ forApp = false } = {}) {
  const cfg = config();
  const { fiches } = readVault();
  const slugs = new Set(fiches.map((f) => f.slug));
  const nodes = fiches.map((f) => {
    const priv = f.fm.visibility === "private";
    const text = priv ? "" : f.body.replace(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g, "$1").replace(/\s+/g, " ").trim();
    const source = String(f.fm.source ?? "");
    return {
      id: f.slug,
      title: String(f.fm.title ?? f.slug),
      type: f.fm.type,
      domains: [].concat(f.fm.domains ?? []),
      status: f.fm.status,
      private: priv,
      created: String(f.fm.created ?? ""),
      excerpt: text.slice(0, forApp ? 600 : 400),
      source: priv || (forApp && LOCAL_PATH.test(source)) ? "" : source,
      ...(forApp ? {} : { file: f.rel }),
    };
  });
  const edges = [];
  for (const f of fiches) for (const l of f.links) if (slugs.has(l) && l !== f.slug) edges.push({ source: f.slug, target: l });
  return { name: cfg.name, lang: brainLang(ROOT), domains: cfg.domains, generated: new Date().toISOString(), nodes, edges };
}

if (command === "detect") {
  const hv = findHypervibe();
  out({ hypervibe: hv.length > 0, plugins: hv, brain: ROOT && existsSync(join(ROOT, "hyperbrain.json")) ? ROOT.replace(/\\/g, "/") : null });
} else if (command === "build") {
  requireBrain();
  const file = join(ROOT, "viz", "brain.html");
  if (args.includes("--if-exists") && !existsSync(file)) {
    out({ ok: true, skipped: "no viewer built yet" });
    process.exit(0);
  }
  const data = graph();
  const html = readFileSync(join(PLUGIN_ROOT, "templates", "viz", "brain.html"), "utf8")
    .replace("/*HYPERBRAIN_DATA*/null", JSON.stringify(data).replace(/</g, "\\u003c"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html, "utf8");
  // The viewer is rebuilt from the notes: it stays out of git.
  const gi = join(ROOT, ".gitignore");
  if (existsSync(gi) && !/^viz\/$/m.test(readFileSync(gi, "utf8"))) writeFileSync(gi, `${readFileSync(gi, "utf8").trimEnd()}\nviz/\n`, "utf8");
  out({ ok: true, file: file.replace(/\\/g, "/"), notes: data.nodes.length, links: data.edges.length });
} else if (command === "export") {
  requireBrain();
  const data = graph({ forApp: true });
  const target = args[1];
  if (target) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(data)}\n`, "utf8");
    out({ ok: true, file: target.replace(/\\/g, "/"), notes: data.nodes.length });
  } else console.log(JSON.stringify(data));
} else if (command === "publish-app") {
  requireBrain();
  const app = config().components?.viz?.app;
  if (!app?.dir || !existsSync(app.dir)) {
    out({ ok: true, skipped: "no persistent app" });
    process.exit(0);
  }
  const rel = app.dataFile ?? "data/brain-graph.json";
  const target = join(app.dir, rel);
  const data = graph({ forApp: true });
  const before = existsSync(target) ? readFileSync(target, "utf8") : "";
  // Compare without the generation date: nothing changed, nothing to deploy.
  const strip = (s) => s.replace(/"generated":"[^"]*",?/, "");
  const next = `${JSON.stringify(data)}\n`;
  if (strip(before) === strip(next)) {
    out({ ok: true, unchanged: true });
    process.exit(0);
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, next, "utf8");
  const git = (a) => execFileSync("git", a, { cwd: app.dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }).trim();
  try {
    git(["add", "--", rel]);
    git(["commit", "-q", "--only", "-m", `brain: ${data.nodes.length} notes (${today()})`, "--", rel]);
    let pushed = false;
    if (app.autoPush === true) {
      git(["push", "--quiet"]);
      pushed = true;
    }
    out({ ok: true, notes: data.nodes.length, committed: true, pushed });
  } catch (e) {
    out({ ok: false, error: String(e.stderr ?? e.message).split("\n")[0].slice(0, 300) });
    process.exitCode = 1;
  }
} else {
  console.log("usage: viz.mjs detect | build [--if-exists] | export [file] | publish-app");
  process.exitCode = 2;
}
