# /brain:ingest

Brings one of your existing writings into your second brain: a notes folder, your articles or posts, documents, Claude's memory. One source at a time, three trial notes before anything else, and a check at the end. The next source only starts once this one is in and checked.

## When to use it

- After `/brain:sources`, to bring in the first writing on your list.
- To move on to the next writing, or to resume a large source started in an earlier session.
- For a writing that is not on the list yet: Claude adds it there first, then brings it in.

## How it goes

1. **Choosing the source**: by default, the first unticked writing on your list. You may choose another, or name a new one.
2. **The scope, with you**: which folders, which period, which files to leave aside. Claude looks at the source itself (it goes through it, counts, opens two or three items) and tells you what it sees, for instance "312 notes, 2019 to today, a third are shopping lists". You agree on what counts.
3. **Three trial notes**: written from three different items, then shown. This is where format, length, tone, type and domain get settled. Claude adjusts until you say "that's it".
4. **The batch**: for each item worth a note.
  - Claude first searches the brain, by words then by meaning. A note that already covers the subject is only enriched with your agreement, never duplicated. For a large batch, it asks you for a general rule once and for all.
  - The note is written as a seed, with its source pointing to the original (the file or the web address).
  - The brain is saved every twenty to fifty notes, and Claude shows the progress ("40 of 120 documents").
5. **The check**: an automatic check of the notes and links, with no error allowed, then five notes drawn at random from the batch and read with you. A flaw that repeats (wrong type, domain too broad) is fixed on the whole batch, with your agreement.
6. **Closing**: the source is ticked on the list, the brain is saved, and Claude ends in one line: how many notes, which source is next.

## What it creates for you

- **Seed notes**, each tied to its original through its source
- For your own published writings: one note per text, in the type for publications, with the text or its core
- For your notes: ideas or notes, rephrased faithfully
- For other people's works (books, articles read): one note per work, with what you keep from it, never the text copied
- The **source ticked** on your list, or a progress marker if it is not finished
- If the source brings a kind of thing your brain has no type for: a **new type**, proposed before the batch

## Prerequisites

- A brain already created
- The source written on the list of your writings (kept by `/brain:sources`)
- Your presence at the start, for the scope and the trial notes, and at the end, for the check

## Tips

{{callout:info|Why three trial notes}}
Settling the format on three notes costs a few minutes. Discovering it after a hundred notes means redoing everything. Take the time to correct the trials frankly: the whole batch will follow them.
{{/callout}}

{{callout:tip|A large source, several sessions}}
Nothing forces you to finish in one go. When you stop, Claude writes under the source where things stand (for instance "done up to June 2022") and saves. The next session resumes from there.
{{/callout}}

{{callout:warning|Emails and secrets}}
The text of an email or a message never goes into the brain: at most a rephrased summary, and only if you want it. A secret (key, password) never goes in, even rephrased.
{{/callout}}
