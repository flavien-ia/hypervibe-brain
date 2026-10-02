---
name: status
description: Where your second brain stands - notes by status and domain, errors, search by meaning, backup, routines, last review - and the next useful step.
---

# /brain:status - Where the brain stands

## Communication
- Reply in the person's language. Short and concrete: numbers, then one recommendation.

## Gather

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
```

If there is no brain: say so and offer `/brain:start` then `/brain:create`. Stop.

## Tell

A compact picture, in this order:

1. **The brain**: how many notes, how many `seed` / `trusted`, the domains with their counts (a domain at zero is worth saying).
2. **Its health**: errors (must be zero: an error blocks the index), warnings, search by meaning on or off.
3. **Its safety**: saved online or local only, last save, files not yet saved.
4. **Its life**: the evening save (set up? last run and its result), the weekly review (set up? last report).
5. **What feeds it and what it does**: the living sources that are on (`sources`: mail and calendar, work with Claude, watched folders) and the modules in place (`components`: online backup, cold copy, search by meaning, map), in plain words.
6. **The construction**: `stage` below 6 means `/brain:create` has not been completed; say which step comes next.

## Recommend one thing

If the brain lives on two computers (`runner` in `brain.json`), also `node "${CLAUDE_SKILL_DIR}/../../scripts/sync.mjs" --state`: which computer runs it, how far behind or ahead this one is, and above all a conflict or a stash waiting, said first. Also `node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" stats` (the directory: how many people, how many in the core, how many with a note) and `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list --json`: a source of their own in trouble (an error, or not approved on this computer) is said first, with what to do.

The single most useful next step, by priority: fix errors > repair a source in trouble > finish the construction (`/brain:create`) > protect it (`/brain:add-backup`) > set up the automatic tasks (`/brain:add-routines`) > add a source (`/brain:sources`) or bring in the next writing (`/brain:ingest`) > search by meaning (`/brain:add-meaning`). One sentence, and offer to do it now.
