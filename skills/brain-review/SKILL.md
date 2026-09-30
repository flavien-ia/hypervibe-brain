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

It writes `reviews/<today>.md`, in the brain's language: the new notes, the seeds that took root and become `trusted` (at least two weeks old and linked from a note born another day; never an idea, whose maturity is the person's call), orphans, broken links, sources that no longer exist, domain coverage, and, depending on the living sources chosen (`sources` in `status.mjs --json`), the projects worked on with Claude with their commits of the week, and the files that moved in the watched folders.

4. Rebuild: `node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs" --quiet`.
5. **Your part, the thinking.** Read the report, and add to it, in the brain's language:
   - **Proposed links**: for the week's new notes and the orphans, search the brain (`brain_search`, by words then `meaning: true`) for the notes they should be linked to. At most ten links, and the duplicates you suspect, each with its reason in one sentence. Proposals only: you do not apply them.
   - **Work with Claude** (source `journal`): for each project of the week that has no note in the brain, propose one; for one that has, say in a sentence what moved, from its commits.
   - **The watched folders** (source `watch`): among the files that moved, the ones that deserve a note (a finished text, a new document), with one sentence each.
   - **Mail and calendar** (source `mail`): only if this session has the person's mail and calendar connectors (Gmail, Google Calendar, Outlook...). Look at the week's meetings and at the email threads where the person took part (not newsletters, not notifications). Write, with the capture script and as `seed`, a note for each **new person who matters**, each **meeting worth remembering** and each **decision taken**, in the brain's own types for people, events and notes (`brain_stats` lists them; if the brain has no type for events, use its notes type), with a `source` pointing to the thread or the event (`gmail:<thread id>`, `calendar:<event id>`). Search first: never a duplicate. **Never copy the text of an email**, at most a sentence of summary in your words, and nothing that looks private (health, money, family) unless the person asked for it. List what you created in a section of the report. Without the connectors: say it in the report in one line, and create nothing.
   - **The contacts directory** (if `contacts.mjs stats` says it is on, and the mail connector is here): add the week's exchanges, the same way as its first fill (one JSON line per person, the counts of the week; never the text of an email) with `contacts.mjs upsert`. Then, in the report, propose a note for each person now in the core (tier 2) who has none, with one sentence of why; the person decides (`contacts.mjs promote`).
   - **Their own sources**: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list --json`. For each source done by Claude (`kind: claude`) that is enabled and due, follow its `sources/<name>/instructions.md`, capture its notes as seeds with `--source "source:<name>:<identifier>"` (search first, never twice), then record it with `sources.mjs mark <name> --ok --created <n>`, or `--error "<what went wrong>"`. For the sources read automatically, the report already says what they brought; one in trouble (an error, or not approved on this computer) is said plainly at the top of the report, with what to do.
6. Save: `node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs"`.

## With the person, afterwards

Go through the report in a few lines: the promotions (any disagreement sends the note back to `seed`: edit its `status`), then the proposals one by one. A link they accept: add `[[slug]]` to the note in front of them and set `updated` to today (a validated note is only modified with their agreement, and this is it). Save at the end.

## End

Five lines at most: how many new notes, how many promotions, the errors if any, the path of the report.
