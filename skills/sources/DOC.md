# /brain:sources

You choose what feeds your second brain: your mail and calendar, the folders you work in, your work with Claude, your existing writings, and sources of your own. Each source is presented with what it brings and what it implies before you decide. You can add or remove one at any time.

## When to use it

- During `/brain:create`, which runs it at the sources step.
- Later, to turn a source on or off, or to add a folder to watch.
- To have the brain follow by itself something that is yours: your posts, a client tracking tool, a reading app, a feed.
- To draw up the list of your writings to bring in.

## How it goes

1. **Where things stand**: Claude says in three lines which sources are on, which folders are watched and which writings are already listed.
2. **The living sources**: looked at every week by the weekly review. Claude presents each one, then records your choice.
  - Mail and calendar: the new people who matter, the meetings worth remembering and the decisions taken become notes. Claude reads them through your Claude's connectors (Gmail, Google Calendar, Outlook); the text of an email is never copied, at most a sentence of summary; newsletters and notifications are ignored.
  - Watched folders: the new or changed files in the folders you choose are looked at, and what deserves it becomes a note. Nothing leaves the computer.
  - Work with Claude: the projects you worked on with Claude are summed up, and a project without a note gets one. Only one line per work session is recorded on the computer (the name of the project's folder).
3. **Tuning to your taste**: for mail and calendar, Claude looks at last week's meetings with you and asks which kind of meeting deserves a note. For folders, it suggests the ones your answers point to and checks that they exist.
4. **Your own sources**: Claude asks whether there is something else your brain should follow by itself. Each source is defined with you, in plain words: what it reads, what becomes a note (and in which type and domain), how often (every day or every week), whether a note may be refreshed later, and who handles it.
  - Read automatically: a small program, written with you, when the source can be read without judgment.
  - Done by Claude: instructions, written with you, that Claude follows during the weekly review, when judgment or a browser is needed.
5. **Trial, then your approval**: a program is first tried without writing anything. Claude shows you the number of notes and the first three, and adjusts until you say "that's it". It only runs after your approval on this computer; then five notes from the first run are read together. A source done by Claude is carried out a first time with you.
6. **Your writings**: Claude asks what you have already written and where, orders it by interest with you, turns it into a checklist, then offers to bring in the first one with `/brain:ingest`.
7. **End**: two lines, which sources feed the brain and when they are next read.

## What it creates for you

- Your **living source choices** recorded, with the list of watched folders
- For each source of your own: its **program** or its **instructions**, stored in the brain
- The **list of your writings**, to tick off as they come in
- If you want it, a **capture address** by email
- If you want it, a **step of your own**: a program that brings no note but runs with the brain every evening or every week (publishing a copy for one of your apps, checking something)

## Prerequisites

- A brain already created
- For mail and calendar: the Gmail, Google Calendar or Outlook connectors connected in your Claude app (Settings, Connectors). The source only starts once they are connected.
- The weekly review, set up by `/brain:add-routines`. Until then, the sources are read when you say "review my brain".
- If a source needs an access key: you paste it yourself into the brain's secrets file, never into the conversation

## Tips

{{callout:tip|A capture address}}
If the mail source is on, a thought sent by email to an address of yours (or marked with an agreed word in the subject) becomes a seed at the next review. The message is reworded as a note, never pasted whole, and nothing else in the mailbox is read.
{{/callout}}

{{callout:info|Seeds, except for what is already done}}
What a source brings enters as a seed, and a note can only be refreshed while it is still a seed. One exception: finished objects (your posts, articles, talks given) may enter as trusted and stay up to date, as long as nobody has touched the note. A single edit by your hand, and it is never rewritten again. Nothing ever comes in twice.
{{/callout}}

{{callout:warning|The one case where a program writes inside a validated note}}
A source may keep a few lines up to date inside existing notes (a count of messages, a figure), only within a zone marked with its name, never a character outside. Claude tells you so plainly before setting it up.
{{/callout}}
