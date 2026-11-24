// conversations-watch: the settled Claude Code conversations, on the pile of
// their judge.
//
// A STEP of the brain: it writes no note. At each tick of its rhythm ("every"
// in source.json: the half hour, at :00 and :30) it looks at
// the conversations with Claude Code on this computer and puts on the pile of
// the judge named in source.json ("judge") the ones that have settled: yours
// (not a sub-agent, not a background run), three messages or more, quiet for
// "calm" minutes, and not read yet up to their last exchange. A conversation
// taken up again comes back with the date up to which it was read, so the
// judge reads only what follows. No AI here, and no cost: the judge reads.
//
// The work itself is the plugin's (scripts/watch.mjs): an update of the plugin
// improves it without this file changing, so without a new approval. What it
// prints is its report; a non-zero exit code says something went wrong.
//
// source.json: "judge" (the judge's name), "calm" (minutes of quiet, 30),
// "cap" (how many at most in one pass, 25), "from" (never a conversation
// whose last exchange is older than this date: remove it to go back over all
// the conversations Claude Code still keeps, thirty days of them unless its
// settings say otherwise, at the cost of reading them all). What the
// judge must never read is in the JUDGE's own source.json ("exclude"): a
// conversation of an excluded project never reaches its pile.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// The plugin that runs this step says where it lives: an update can move it.
const plugin = process.env.HVBRAIN_PLUGIN;
if (!plugin) {
  console.error("this step is run by Hypervibe Brain (sources.mjs run), which says where the plugin lives");
  process.exit(1);
}
// The plugin's code must look at the brain this step belongs to, even when
// another brain is the active one on this computer.
process.env.HVBRAIN_DIR = process.env.HVBRAIN_BRAIN_DIR;
const { watchConversations } = await import(pathToFileURL(join(plugin, "scripts", "watch.mjs")).href);
console.log(watchConversations(JSON.parse(readFileSync("source.json", "utf8"))).report);
