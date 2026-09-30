---
name: brain-status
description: Where your second brain stands - notes by status and domain, errors, search by meaning, backup, routines, last review - and the next useful step.
---

# /brain-status - Where the brain stands

## Communication
- Reply in the person's language. Short and concrete: numbers, then one recommendation.

## Gather

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
```

If there is no brain: say so and offer `/hyperbrain:start-hyperbrain` then `/hyperbrain:create-brain`. Stop.

## Tell

A compact picture, in this order:

1. **The brain**: how many notes, how many `seed` / `trusted`, the domains with their counts (a domain at zero is worth saying).
2. **Its health**: errors (must be zero: an error blocks the index), warnings, search by meaning on or off.
3. **Its safety**: saved online or local only, last save, files not yet saved.
4. **Its life**: the evening save (set up? last run and its result), the weekly review (set up? last report).
5. **Its components**: which ones are on (`components`), in plain words ("search by meaning, online backup, work journal"), and the watched folders and cold copy folder if any.
6. **The construction**: `stage` below 6 means `/hyperbrain:create-brain` has not been completed; say which step comes next.

## Recommend one thing

The single most useful next step, by priority: fix errors > finish the construction > arm the routines > put the brain online (backup) > ingest the next source (`/hyperbrain:brain-ingest`) > turn on search by meaning. One sentence, and offer to do it now.
