---
name: review
description: The weekly review of your second brain - what is new, the seeds that took root and become trusted, orphan notes, broken links, and proposed links. Also what the weekly routine runs.
---

# /brain:review - The week of the brain

You review the person's brain and write the report of the week in `reviews/`. Two modes:

- **With the person** (they invoked it): you run the review, then go through the report together, and they decide on the proposals.
- **Automatic** (a scheduled routine invoked it, the prompt says so, or nobody is there): you ask no question and modify no `trusted` note. The only notes you create are the seeds the living sources bring (the week's mail and meetings, the sources done by Claude), never one from your own judgment. You only run the steps below and leave the report.

The brain's rule holds in both modes: the machine creates notes; on a validated note it never rewrites the person's text: it may only add a fact that says where it comes from, and keep its own machine zones up to date. On a validated concept or idea, or a validated note of nature decision or lesson, which is the person's thinking, it adds nothing: it proposes the change in the weekly letter. Anything more on a validated note is done with the person, on their word.

## Communication
- Reply in the person's language (their brain's language: see `BRAIN.md`). The report's added sections are written in it too.

## The steps

1. Is there a brain? `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json`. If not: say so (with the person) or stop silently (automatic).
   **Repair before telling.** If the evening routine is armed and `lastSave` is more than a day old (or missing), the week would be told without its last days: run the evening save first, `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" run-now`, wait for it, and keep the gap for the health of the letter (more than two days: 🔴). `lastAlert`, if there is one, is an evening that went wrong this week: it goes in the health too.
2. Check it:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/lint.mjs" --quiet
```

With errors: note them for the report, and **do not** run step 3 (a promotion on a broken vault is not trusted). With the person, offer to fix them together.

3. The report, with the promotions:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/review.mjs" --apply
```

It writes `reviews/<today>.md`, in the brain's language: the new notes, the seeds that took root and become `trusted` (at least two weeks old, and either linked by hand from a note born another day, or read by Claude through the brain's tools; never an idea, whose maturity is the person's call; `promotion` in `brain.json` can set the age and which notes' links are plumbing, and each promotion is kept with its reason in `index/promotions.jsonl`), orphans, broken links, sources that no longer exist and sources modified after their note was last touched (a path, or a scheme the person mapped to a folder of this computer: `sourceRoots` in `~/.hypervibe-brain/config.json`, such as `{"dropbox": "C:/Users/me/Dropbox"}`; types listed in `review.changedIgnore` of `brain.json` are left out of the second list; an entry seen for the first time is marked new), domain coverage, and, depending on the living sources chosen (`sources` in `status.mjs --json`), the projects worked on with Claude with their commits of the week, and the files that moved in the watched folders.

4. Rebuild: `node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs" --quiet`.
5. **Your part, the thinking.** Read the report, and add to it, in the brain's language. **The bar for any note you create** (from the mail, the journal, the watched folders, a source done by Claude): no quota, zero is a fine week and so are twenty, but every candidate must pass three questions, and one "no" kills it: (1) will the person want to find this again in six months (lasting, not operational)? (2) is it absent from the brain (search first; if a note covers it, create nothing and propose the enrichment)? (3) does it stand on its own, understood without having lived the week?
   - **The sources, gone or modified** (from the report): each entry marked new becomes a numbered proposal of the letter, never an act: "archive `<slug>` (its source is gone)", "re-read `<slug>` (source modified on <date>, note touched on <date>)", trusted notes first; several project notes whose sources moved make one proposal, not one each. An entry not marked new was already proposed: it is not repeated.
   - **Proposed links**: for the week's new notes and the orphans, search the brain (`brain_search` with its default, which mixes words and meaning) for the notes they should be linked to. At most ten links, and the duplicates you suspect, each with its reason in one sentence. Proposals only: you do not apply them.
   - **Work with Claude** (source `journal`): the report gathers the sessions of every computer of the person (another computer's projects carry its name) with the titles Claude gave them. For each project of the week that has no note in the brain, propose one; for one that has, say in a sentence what moved, from its titles and commits.
   - **Notes that grow** (the report's section of that name, five at most): read each note whole (`brain_get`), and choose. **Condense** when it is one subject buried under its facts: write the synthesis in `reviews/<today>-condense/<slug>.md` (the body only, never the frontmatter nor the machine zones `<!-- x:auto -->`, which stay as they are): the person's own text kept in its words and first, every fact's substance kept, with where it comes from, in fewer and clearer paragraphs, the dated news of the past folded into what they changed, nothing invented, no figure dropped that was there. **Split** when it carries several subjects that each deserve a note: say which notes, with their titles and what moves into each, and what the note keeps (a hub that links them). Neither, when the length is the subject (a long project that is still one): say so in one line, and it is not proposed again for eight weeks. Each choice becomes a numbered proposal of the letter, with its size before and after.
   - **The watched folders** (source `watch`): among the files that moved, the ones that deserve a note (a finished text, a new document), with one sentence each. If the brain has the standard `documents` source, a judge has already read most of them during the week: search first, and keep for this review what it does not read (a PDF, a file left out by its limits).
   - **Mail and calendar** (source `mail`): only if this session has the person's mail and calendar connectors (Gmail, Google Calendar, Outlook...). Look at the week's meetings and at the email threads where the person took part (not newsletters, not notifications). Write, with the capture script and as `seed`, a note for each **new person who matters**, each **meeting worth remembering** and each **decision taken**, in the brain's own types for people, events and notes (`brain_stats` lists them; if the brain has no type for events, use its notes type), with a `source` pointing to the thread or the event (`gmail:<thread id>`, `calendar:<event id>`). Search first: never a duplicate. **Never copy the text of an email**, at most a sentence of summary in your words, and nothing that looks private (health, money, family) unless the person asked for it. List what you created in a section of the report. Without the connectors: say it in the report in one line, and create nothing.
   - **The contacts directory** (if `contacts.mjs stats` says it is on, and the mail connector is here): add the week's exchanges, the same way as its first fill (one JSON line per person, the counts of the week; never the text of an email) with `contacts.mjs upsert`. Then, in the report, propose a note for each person now in the core (tier 2) who has none, with one sentence of why; the person decides (`contacts.mjs promote`).
   - **Their own sources**: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list --json`. **Never a source marked `live`**: it is a judge, which the plugin runs by itself during the day; the report's section "The judge this week" says what it read, what it wrote and what it cost. For each other source done by Claude (`kind: claude`) that is enabled and due, follow its `sources/<name>/instructions.md`, capture its notes as seeds with `--source "source:<name>:<identifier>"` (search first, never twice), then record it with `sources.mjs mark <name> --ok --created <n>`, or `--error "<what went wrong>"`. For the sources read automatically, the report already says what they brought; one in trouble (an error, or not approved on this computer) is said plainly at the top of the report, with what to do.
6. **The letter**, if the person has one (`letter` in `brain.json`, set up by `/brain:add-routines`; without it, skip). Write it in markdown, in the brain's language, in the voice of someone who reports, not who sells, and in this order, without any other section:
   1. **The introduction**, with no section title: a `#` title ("The review of <date>"), two or three sentences on the week, then what came in, compact (the sources, the work with Claude, the mail).
   2. `---`, then `## The new seeds`: every note created this week by the machine, **numbered from 1**, one line each: the slug in `code` and one sentence of what it keeps. None: say it in one line. Then this box, word for word in the brain's language: `> These notes are already in your brain, as seeds. To remove some: in any Claude conversation, "brain-review: remove seeds 3 and 8". Saying nothing keeps them.`
   3. `## What the machine wrote`: the section of the same name in the report (`reviews/<today>.md`), as it is, numbered as it is: the facts the machine added to notes, validated ones included, each with where it comes from, and the notes it created live during the week (the brain keeps itself live, writing rule 7); then, counted by source, the machine zones and refreshed records. Then: `> All of this is already in your brain. To take one back: "brain-review: undo 3". Saying nothing keeps it.` None this week: skip the section.
   4. `## The proposals`: the changes the machine proposed during the week (the report's "Proposed by the machine" section: what the brain's rule keeps for the person, such as a fact that would change a validated decision), then the links, merges and notes you proposed and did not apply (Step 5), **numbered from 1**, one line each: what it would change, and why you did not do it yourself. Then: `> None of this is applied. To accept: "brain-review: apply proposals 1 and 4". A proposal without an answer is not repeated next week.`
   5. `---`, then `## Promotions and collisions`: each seed promoted this week and what made it rise; then the collision of the week, two notes close in meaning that nothing links (`brain_neighbors` gives the close ones: compare with the links), a single one, the most surprising. **Numbered from 1.** Then: `> The promotions are done. To send one back: "brain-review: back to seed 1"; to link a collision: "brain-review: link 2".`
   6. A dark box (`>> ` lines), with no section title, first line `**Oh, by the way...!**`: two or three old notes that came back into the week's activity, or anniversaries of dated notes. Skip it if nothing came back.
   7. **The health, small** (`^ ` lines), three sentences at most, starting with a dot: 🟢 all is well, 🟠 an incident without loss (a source in trouble, a skipped save, an alert of the week from `lastAlert`), 🔴 no evening save for more than two days, an error in the notes, or a loss. If it is 🔴, repeat it in one line at the top of the letter.

   Then send it:

```bash
cat <letter file> | node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" send
```

   It keeps the letter in `reviews/`, and sends it by the channel chosen. When it answers `sendWithConnector: true`, **you** send it with the mail connector's send tool, to the address it gives (the person's own, nobody else, ever), with the subject it gives and the HTML file as the body (or the markdown as plain text if the tool only takes text). No connector in this session: say so in your summary; the letter stays in `reviews/`.
7. Save: `node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs"`.

## The answers to a letter

When the person says "brain-review: undo 3": the numbers of "What the machine wrote" are kept in `reviews/<date>-writes.json`; run `node "${CLAUDE_SKILL_DIR}/../../scripts/undo.mjs" 3 --letter <date>` (the date of that letter), which takes back that write and only it, and says so in the brain's journal. When it refuses (a later change touched the same lines), say it and do it by hand with them.

When the person says "brain-review: remove seeds 3 and 8", "apply proposals 1 and 4", "back to seed 1", "link 2": read the latest `reviews/<date>-letter.md` to know what the numbers were, then do it, in front of them: remove a seed (only a seed, never a trusted note), apply a proposal, set a promoted note back to seed (`promote.mjs --note <slug> --to seed`), add the link (with `rewrite.mjs`, as below). Say what was done in one line each, then save.

A **title** that says the thing badly (two halves joined by a comma or a colon, a name that is not the note's subject) is put right the same way, once they agreed: `node "${CLAUDE_SKILL_DIR}/../../scripts/rewrite.mjs" --note <slug> --title "<the new title>" --why "<what was agreed>"`. The note's file keeps its name, so every link to it holds.

An accepted **synthesis**: `node "${CLAUDE_SKILL_DIR}/../../scripts/rewrite.mjs" --note <slug> --file reviews/<date>-condense/<slug>.md --why "synthesis accepted in the letter of <date>"`. It keeps the front matter and the machine zones exactly, sets `updated` to today, and writes the rewrite in the brain's journal (git keeps the version before; `undo` takes it back). An accepted **split**: create the new notes with the capture script (`--source` the note they come from), then rewrite the note into its hub with `rewrite.mjs` the same way, its links to them included. **Never rewrite a note with a plain file write**: a write outside the brain's tools leaves no trace in its journal, and the live view shows it as a write without an author.

## With the person, afterwards

Go through the report in a few lines: the promotions (any disagreement sends the note back to `seed`: `node "${CLAUDE_SKILL_DIR}/../../scripts/promote.mjs" --note <slug> --to seed`, never an edit of the file by hand), then the proposals one by one. **A seed they read and find right does not have to wait for the machine**: on their word, `node "${CLAUDE_SKILL_DIR}/../../scripts/promote.mjs" --note <slug>` makes it trusted, and they can do the same by themselves in the live view (`/brain:live`: the "Seeds" filter, the "Validate" button on a note the machine wrote, then "Next seed"). Never validate one on your own judgment, and never in automatic mode. A link they accept: write the note's body with the `[[slug]]` added, in front of them, through `rewrite.mjs --note <slug> --file <the new body> --why "link accepted in the review of <date>"` (it sets `updated` to today; on a validated note, their yes is what allows it). Save at the end.

## End

Five lines at most: how many new notes, how many promotions, the errors if any, the path of the report.
