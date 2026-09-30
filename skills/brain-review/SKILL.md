---
name: brain-review
description: The weekly review of your second brain - what is new, the seeds that took root and become trusted, orphan notes, broken links, and proposed links. Also what the weekly routine runs.
---

# /brain-review - The week of the brain

You review the person's brain and write the report of the week in `reviews/`. Two modes:

- **With the person** (they invoked it): you run the review, then go through the report together, and they decide on the proposals.
- **Automatic** (a scheduled routine invoked it, the prompt says so, or nobody is there): you ask no question, modify no `trusted` note, create no note. You only run the steps below and leave the report.

## Communication
- Reply in the person's language (their brain's language: see `BRAIN.md`). The report's added sections are written in it too.

## The steps

1. Is there a brain? `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json`. If not: say so (with the person) or stop silently (automatic).
2. Check it:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/lint.mjs" --quiet
```

With errors: note them for the report, and **do not** run step 3 (a promotion on a broken vault is not trusted). With the person, offer to fix them together.

3. The report, with the promotions:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/review.mjs" --apply
```

It writes `reviews/<today>.md`: the new notes, the seeds that took root and become `trusted` (at least two weeks old and linked from a note born another day; never an idea, whose maturity is the person's call), orphans, broken links, domain coverage.

4. Rebuild: `node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs" --quiet`.
5. **Your part, the thinking.** Read the report. For the week's new notes and the orphans, search the brain (`brain_search`, by words then `meaning: true`) for the notes they should be linked to. Add to the report a section "Proposals": at most ten links to create and the duplicates you suspect, each with its reason in one sentence. They are proposals: you do not apply them.
6. Save: `node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs"`.

## With the person, afterwards

Go through the report in a few lines: the promotions (any disagreement sends the note back to `seed`: edit its `status`), then the proposals one by one. A link they accept: add `[[slug]]` to the note in front of them and set `updated` to today (a validated note is only modified with their agreement, and this is it). Save at the end.

## End

Five lines at most: how many new notes, how many promotions, the errors if any, the path of the report.
