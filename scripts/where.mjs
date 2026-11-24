#!/usr/bin/env node
// where.mjs - Prints the brain's folder on this computer, and nothing else.
//
//   node scripts/where.mjs            C:/Users/x/brain
//   cd "$(node scripts/where.mjs)"    in a skill or a script of the person's own
//
// The brain's folder is written in ONE place (`brain` in
// ~/.hypervibe-brain/config.json; HVBRAIN_DIR overrides it for one command).
// Anything that needs it asks here instead of writing the path: the day the
// brain moves (move.mjs), nothing else has to change.
//
// Exit 3, with a sentence on stderr, when no brain is set up.

import { BRAIN, hasBrain } from "./lib.mjs";

if (!hasBrain()) {
  console.error(BRAIN ? `no brain in ${BRAIN} (no brain.json)` : "no brain set up on this computer yet: run /brain:create");
  process.exit(3);
}
console.log(BRAIN.replaceAll("\\", "/"));
