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

import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, writeFileSync } from "node:fs";
import { homedir, hostname } from "node:os";

/** The skills called since the person's last message, from the end of a transcript. */
function skillsOfLastAnswer(transcript) {
  if (!transcript || !existsSync(transcript)) return [];
  const fd = openSync(transcript, "r");
  try {
    const size = fstatSync(fd).size;
    // The end of the file, a megabyte first. An answer whose tools gave back
    // more than that (2026-11-21: a skill called, then a megabyte of results)
    // hid its own beginning, and the skill's signal was lost: the end read is
    // widened until the person's message is in it, up to 32 MB.
    for (let len = Math.min(size, 1024 * 1024); ; len = Math.min(size, len * 4)) {
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      const lines = buf.toString("utf8").split("\n").reverse();
      const skills = [];
      let whole = false;
      for (const l of lines) {
        let o;
        try {
          o = JSON.parse(l);
        } catch {
          continue;
        }
        const c = o.message?.content;
        // The person's own message ends the answer (a tool's result is a user line too).
        if (o.type === "user" && !o.isMeta && (typeof c === "string" || (Array.isArray(c) && c.some((x) => x.type === "text")))) {
          whole = true;
          break;
        }
        if (o.type === "assistant" && Array.isArray(c)) {
          for (const x of c) if (x.type === "tool_use" && x.name === "Skill" && x.input?.skill) skills.push(String(x.input.skill));
        }
      }
      if (whole || len >= size || len >= 32 * 1024 * 1024) return [...new Set(skills)];
    }
  } finally {
    closeSync(fd);
  }
}
import { basename, dirname, join } from "node:path";

try {
  const HOME = process.env.HVBRAIN_HOME || homedir();
  const config = JSON.parse(readFileSync(join(HOME, ".hypervibe-brain", "config.json"), "utf8"));
  const brain = JSON.parse(readFileSync(join(config.brain, "brain.json"), "utf8"));

  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    input = {};
  }

  // THE END OF AN ANSWER, for the live view: the trail of the notes this
  // conversation read fades when its answer ends. A tiny local file, never
  // folded into the brain, kept to its last 300 lines.
  try {
    const turns = join(HOME, ".hypervibe-brain", "turns.jsonl");
    mkdirSync(dirname(turns), { recursive: true });
    appendFileSync(turns, `${JSON.stringify({ at: new Date().toISOString(), session: String(input.session_id || "") })}\n`, "utf8");
    const all = readFileSync(turns, "utf8").split("\n").filter(Boolean);
    if (all.length > 600) writeFileSync(turns, `${all.slice(-300).join("\n")}\n`, "utf8");
  } catch {
    // a comfort of the live view
  }

  // THE SKILLS THAT JUST RAN (P7, the hub's "after" trigger). The skills
  // called in this answer, read from the end of its transcript back to the
  // person's message: only the names of the Skill tool's calls, never the
  // text. A source that waits for one ("after": ["skill:<name>"] in its
  // source.json) gets a flag the hub runs at its next beat. A skill never
  // knows the brain exists.
  try {
    const skills = skillsOfLastAnswer(input.transcript_path);
    if (skills.length) {
      const dir = join(config.brain, "sources");
      const waiting = [];
      for (const n of existsSync(dir) ? readdirSync(dir) : []) {
        let d = null;
        try {
          d = JSON.parse(readFileSync(join(dir, n, "source.json"), "utf8"));
        } catch {
          continue;
        }
        const after = (d.after ?? []).filter((x) => String(x).startsWith("skill:")).map((x) => String(x).slice(6));
        if (d.enabled !== false && skills.some((sk) => after.includes(sk) || after.includes(sk.split(":").pop()))) waiting.push(n);
      }
      const hb = join(HOME, ".hypervibe-brain");
      mkdirSync(join(hb, "due"), { recursive: true });
      // The person's own "now" (the live view's button) is never overwritten
      // by a skill's flag: it is what lets a paused source run once.
      const isNow = (n) => {
        try {
          return JSON.parse(readFileSync(join(hb, "due", n), "utf8")).why === "now";
        } catch {
          return false;
        }
      };
      for (const n of waiting.filter((x) => !isNow(x))) writeFileSync(join(hb, "due", n), `${JSON.stringify({ at: new Date().toISOString(), why: `skill ${skills.join(", ")}` })}\n`, "utf8");
      appendFileSync(join(hb, "events.jsonl"), `${JSON.stringify({
        at: new Date().toISOString(),
        id: randomBytes(5).toString("hex"),
        computer: String(config.computer ?? process.env.HVBRAIN_COMPUTER ?? hostname()).trim().toLowerCase(),
        brain: String(config.brain).replaceAll("\\", "/"),
        act: "signal",
        who: "hook",
        what: "skill",
        skills,
        sources: waiting.length ? waiting : undefined,
        session: String(input.session_id || "").slice(0, 12) || undefined,
      })}\n`, "utf8");
    }
  } catch {
    // a signal lost: the evening runs the sources anyway
  }

  if (brain.sources?.journal !== true) process.exit(0);
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
    appendFileSync(file, `${JSON.stringify({ t: new Date(now).toISOString(), type: "session", cwd, project: basename(cwd), session, transcript: input.transcript_path || undefined })}\n`, "utf8");
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
