# /brain:review

The weekly review of your second brain: what is new, the seeds that took root and become trusted, orphan notes, broken links, and proposed links. It is done with you when you run it, or on its own when the weekly routine runs it. In both cases, it leaves a dated report in the brain.

## When to use it

- When you say "review my brain", or `/brain:review`.
- Every week, automatically, if you set up the routine with `/brain:add-routines`.
- A first time with Claude before setting up that routine, to see concretely what it brings.
- To answer the weekly letter, for instance "brain-review: remove seeds 3 and 8".

## How it goes

1. **Catching up**: if the evening save has not run for more than a day, Claude runs it first, so that the week is told whole.
2. **Checking the brain**: Claude checks the notes and the links. If it finds errors, it notes them for the report and makes no promotion this time; with you, it offers to fix them together.
3. **The report and the promotions**: the report lists the new notes, the seeds that became trusted, the orphans, the broken links, the sources that no longer exist or changed since their note, and the coverage of your domains. Depending on your sources, it adds the projects worked on with Claude, on all your computers and with each session's title, and the files that moved in the watched folders.
4. **Claude's thinking**: it reads the report and completes it. Before creating a note, it asks three questions: will you still want it in six months, is it absent from the brain, does it make sense outside this week? One no, and it does not create it.
  - Sources gone or changed: each becomes a proposal (archive, re-read), once.
  - Proposed links for the new notes and the orphans (ten at most), and the duplicates it suspects, each with its reason. These are proposals: it does not apply them.
  - Work with Claude: a note proposed for each project that has none; for the others, what moved.
  - Watched folders: the files that deserve a note.
  - Mail and calendar: a seed for each new person who matters, each meeting worth remembering and each decision taken, never copying the text of an email.
  - Contacts directory: the week's exchanges, and a note proposed for anyone who rose to the core.
  - Your own sources: the ones done by Claude are carried out; a source in trouble is flagged at the top of the report.
5. **The letter**, if you chose to have one: a summary of the week, the new seeds, the proposals, the promotions and a "collision" (two notes close in meaning that nothing links), sometimes old notes that came back into the week's activity, and the brain's health in three sentences. Everything in it is numbered so that you can answer.
6. **Saving**: the brain is saved.
7. **With you, afterwards**: you go through the report together. The promotions first (a disagreement sends the note back to seed), then the proposals one by one. A link you accept is added in front of you.

## What it creates for you

- The **report of the week**, dated, stored in the brain
- **Seeds that became trusted**, each with its reason kept
- **New seeds** drawn from your sources
- A list of **proposals** (links, merges, notes) waiting for your answer
- The **letter**, kept in the brain and sent to your own address, nobody else

## Prerequisites

- A brain already created
- For mail, calendar and the contacts directory: your Claude's connectors present in the session. Without them, the report says so in one line and nothing is created on that side.
- For the letter and the automatic run: `/brain:add-routines`

## Tips

{{callout:info|How a seed becomes trusted}}
It must be at least two weeks old, and either be linked by hand from a note born on another day, or have been read by Claude while consulting the brain. An idea is never promoted by the machine: its maturity is yours to judge.
{{/callout}}

{{callout:tip|Answering the letter}}
In any conversation: "brain-review: remove seeds 3 and 8", "apply proposals 1 and 4", "back to seed 1", "link 2". Saying nothing keeps the seeds, and a proposal left unanswered is not repeated the following week.
{{/callout}}

{{callout:warning|What the review never does on its own}}
In an automatic run, Claude asks no question, modifies no trusted note and applies no proposal. A note you validated is only modified with your agreement, and only a seed can be removed.
{{/callout}}
