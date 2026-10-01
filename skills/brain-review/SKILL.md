---
name: brain-review
description: The weekly review of your second brain - what is new, the seeds that took root and become trusted, orphan notes, broken links, and proposed links. Also what the weekly routine runs.
---

# /brain-review - The week of the brain

You review the person's brain and write the report of the week in `reviews/`. Two modes:

- **With the person** (they invoked it): you run the review, then go through the report together, and they decide on the proposals.
- **Automatic** (a scheduled routine invoked it, the prompt says so, or nobody is there): you ask no question and modify no `trusted` note. The only notes you create are the seeds the living sources bring (the week's mail and meetings, the sources done by Claude), never one from your own judgment. You only run the steps below and leave the report.

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

It writes `reviews/<today>.md`, in the brain's language: the new notes, the seeds that took root and become `trusted` (at least two weeks old, and either linked by hand from a note born another day, or read by Claude through the brain's tools; never an idea, whose maturity is the person's call; `promotion` in `hyperbrain.json` can set the age and which notes' links are plumbing, and each promotion is kept with its reason in `index/promotions.jsonl`), orphans, broken links, sources that no longer exist, domain coverage, and, depending on the living sources chosen (`sources` in `status.mjs --json`), the projects worked on with Claude with their commits of the week, and the files that moved in the watched folders.

4. Rebuild: `node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs" --quiet`.
5. **Your part, the thinking.** Read the report, and add to it, in the brain's language:
   - **Proposed links**: for the week's new notes and the orphans, search the brain (`brain_search`, by words then `meaning: true`) for the notes they should be linked to. At most ten links, and the duplicates you suspect, each with its reason in one sentence. Proposals only: you do not apply them.
   - **Work with Claude** (source `journal`): for each project of the week that has no note in the brain, propose one; for one that has, say in a sentence what moved, from its commits.
   - **The watched folders** (source `watch`): among the files that moved, the ones that deserve a note (a finished text, a new document), with one sentence each.
   - **Mail and calendar** (source `mail`): only if this session has the person's mail and calendar connectors (Gmail, Google Calendar, Outlook...). Look at the week's meetings and at the email threads where the person took part (not newsletters, not notifications). Write, with the capture script and as `seed`, a note for each **new person who matters**, each **meeting worth remembering** and each **decision taken**, in the brain's own types for people, events and notes (`brain_stats` lists them; if the brain has no type for events, use its notes type), with a `source` pointing to the thread or the event (`gmail:<thread id>`, `calendar:<event id>`). Search first: never a duplicate. **Never copy the text of an email**, at most a sentence of summary in your words, and nothing that looks private (health, money, family) unless the person asked for it. List what you created in a section of the report. Without the connectors: say it in the report in one line, and create nothing.
   - **The contacts directory** (if `contacts.mjs stats` says it is on, and the mail connector is here): add the week's exchanges, the same way as its first fill (one JSON line per person, the counts of the week; never the text of an email) with `contacts.mjs upsert`. Then, in the report, propose a note for each person now in the core (tier 2) who has none, with one sentence of why; the person decides (`contacts.mjs promote`).
   - **Their own sources**: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list --json`. For each source done by Claude (`kind: claude`) that is enabled and due, follow its `sources/<name>/instructions.md`, capture its notes as seeds with `--source "source:<name>:<identifier>"` (search first, never twice), then record it with `sources.mjs mark <name> --ok --created <n>`, or `--error "<what went wrong>"`. For the sources read automatically, the report already says what they brought; one in trouble (an error, or not approved on this computer) is said plainly at the top of the report, with what to do.
6. **The letter**, if the person has one (`letter` in `hyperbrain.json`, set up by `/hyperbrain:add-routines`; without it, skip). Write it in markdown, in the brain's language, in the voice of someone who reports, not who sells, and in this order, without any other section:
   1. **The introduction**, with no section title: a `#` title ("The review of <date>"), two or three sentences on the week, then what came in, compact (the sources, the work with Claude, the mail).
   2. `---`, then `## The new seeds`: every note created this week by the machine, **numbered from 1**, one line each: the slug in `code` and one sentence of what it keeps. None: say it in one line. Then this box, word for word in the brain's language: `> These notes are already in your brain, as seeds. To remove some: in any Claude conversation, "brain-review: remove seeds 3 and 8". Saying nothing keeps them.`
   3. `## The proposals`: the links, merges and notes you proposed and did not apply (Step 5), **numbered from 1**, one line each: what it would change, and why you did not do it yourself. Then: `> None of this is applied. To accept: "brain-review: apply proposals 1 and 4". A proposal without an answer is not repeated next week.`
   4. `---`, then `## Promotions and collisions`: each seed promoted this week and what made it rise; then the collision of the week, two notes close in meaning that nothing links (`brain_neighbors` gives the close ones: compare with the links), a single one, the most surprising. **Numbered from 1.** Then: `> The promotions are done. To send one back: "brain-review: back to seed 1"; to link a collision: "brain-review: link 2".`
   5. A dark box (`>> ` lines), with no section title, first line `**Oh, by the way...!**`: two or three old notes that came back into the week's activity, or anniversaries of dated notes. Skip it if nothing came back.
   6. **The health, small** (`^ ` lines), three sentences at most, starting with a dot: 🟢 all is well, 🟠 an incident without loss (a source in trouble, a skipped save), 🔴 no evening save for more than two days, an error in the notes, or a loss. If it is 🔴, repeat it in one line at the top of the letter.

   Then send it:

```bash
cat <letter file> | node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" send
```

   It keeps the letter in `reviews/`, and sends it by the channel chosen. When it answers `sendWithConnector: true`, **you** send it with the mail connector's send tool, to the address it gives (the person's own, nobody else, ever), with the subject it gives and the HTML file as the body (or the markdown as plain text if the tool only takes text). No connector in this session: say so in your summary; the letter stays in `reviews/`.
7. Save: `node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs"`.

## The answers to a letter

When the person says "brain-review: remove seeds 3 and 8", "apply proposals 1 and 4", "back to seed 1", "link 2": read the latest `reviews/<date>-letter.md` to know what the numbers were, then do it, in front of them: remove a seed (only a seed, never a trusted note), apply a proposal, set a promoted note back to seed, add the link. Say what was done in one line each, then save.

## With the person, afterwards

Go through the report in a few lines: the promotions (any disagreement sends the note back to `seed`: edit its `status`), then the proposals one by one. A link they accept: add `[[slug]]` to the note in front of them and set `updated` to today (a validated note is only modified with their agreement, and this is it). Save at the end.

## End

Five lines at most: how many new notes, how many promotions, the errors if any, the path of the report.
