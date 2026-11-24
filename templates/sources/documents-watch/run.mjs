// documents-watch: the documents that changed in the watched folders, on the
// pile of their judge.
//
// A STEP of the brain: it writes no note. At each tick of its rhythm ("every"
// in source.json: the half hour, at :00 and :30) it looks at
// the folders you asked to follow (the list kept by "watch add" and "watch
// remove") and puts on the pile of the judge named in source.json ("judge")
// each document that is new or changed since its last pass, once it has been
// left alone for "settle" minutes: read when you have finished writing it.
// A newer version of a document that already waits replaces it. No AI here,
// and no cost: the judge reads.
//
// A first pass, or a return after more than three days, sends nothing: never
// hundreds of documents at once. The weekly review lists what moved.
//
// The work itself is the plugin's (scripts/watch.mjs): an update of the plugin
// improves it without this file changing, so without a new approval. What it
// prints is its report; a non-zero exit code says something went wrong.
//
// source.json: "judge" (the judge's name), "settle" (minutes without a change,
// 15), "cap" (how many at most in one pass, 25, the latest first),
// "extensions" (the kinds of documents taken), "depth" (how many levels of
// sub-folders are looked into: all of them when it is not set, 0 for the
// watched folder alone). What the judge must never read is in the
// JUDGE's own source.json ("exclude"), and is not even looked at here.

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
const { watchDocuments } = await import(pathToFileURL(join(plugin, "scripts", "watch.mjs")).href);
console.log(watchDocuments({ ...JSON.parse(readFileSync("source.json", "utf8")), since: process.env.HVBRAIN_SOURCE_SINCE }).report);
