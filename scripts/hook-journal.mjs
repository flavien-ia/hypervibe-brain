#!/usr/bin/env node
// hook-journal.mjs - The work journal: at the end of each Claude answer, note
// in which project the person is working. Declared by the plugin itself
// (hooks/hooks.json): nothing is written into the person's Claude settings.
//
// It only writes if the person chose the "journal" component. It never prints
// anything and never fails: a hook that speaks or breaks disturbs every
// conversation. One line per session and per six hours, in
// ~/.hypervibe-brain/journal.jsonl; lines older than 90 days are dropped.
// The weekly review reads it: "what you worked on this week".

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

try {
  const HOME = process.env.HVBRAIN_HOME || homedir();
  const config = JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8"));
  const brain = JSON.parse(readFileSync(join(config.brain, "brain.json"), "utf8"));
  if (brain.sources?.journal !== true) process.exit(0);

  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    input = {};
  }
  const cwd = String(input.cwd || process.cwd()).replace(/\\/g, "/");
  const session = String(input.session_id || "");
  const file = join(HOME, ".hypervibe-brain", "journal.jsonl");
  const now = Date.now();

  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  const recent = lines.slice(-200).some((l) => {
    try {
      const e = JSON.parse(l);
      return e.session === session && e.cwd === cwd && now - Date.parse(e.t) < 6 * 3600_000;
    } catch {
      return false;
    }
  });
  if (!recent) {
    mkdirSync(dirname(file), { recursive: true });
    // The same event as the sensors of the brain this plugin grew from
    // (type "session"): one format for every journal.
    appendFileSync(file, `${JSON.stringify({ t: new Date(now).toISOString(), type: "session", cwd, project: basename(cwd), session })}\n`, "utf8");
  }
  // Now and then, forget what is older than 90 days.
  if (lines.length > 2000) {
    const limit = new Date(now - 90 * 86400_000).toISOString();
    writeFileSync(file, `${lines.filter((l) => l.slice(6, 30) >= limit).join("\n")}\n`, "utf8");
  }
} catch {
  // no brain, no settings, anything: silence
}
process.exit(0);
