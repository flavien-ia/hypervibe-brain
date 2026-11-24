# /brain:sources

You choose what feeds your second brain: your mail and calendar, the folders you work in, your work with Claude, your existing writings, and sources of your own. Each source is presented with what it brings and what it implies before you decide. You can add or remove one at any time.

## When to use it

- During `/brain:create`, which runs it at the sources step.
- Later, to turn a source on or off, or to add a folder to watch.
- To have your work with Claude and your watched folders read live, during the day, rather than once a week.
- To say what must never be read: a client's folder, an archive, a kind of file, one of your projects.
- To have the brain follow by itself something that is yours: your posts, a client tracking tool, a reading app, a feed.
- To draw up the list of your writings to bring in.
- When the live reading has stopped working and you want it repaired.

## How it goes

1. **Where things stand**: Claude says in three lines which sources are on, which folders are watched and which writings are already listed.
2. **The living sources**: looked at every week by the weekly review. Claude presents each one, then records your choice.
  - Mail and calendar: the new people who matter, the meetings worth remembering and the decisions taken become notes. Claude reads them through your Claude's connectors (Gmail, Google Calendar, Outlook); the text of an email is never copied, at most a sentence of summary; newsletters and notifications are ignored.
  - Watched folders: the new or changed files in the folders you choose are looked at, and what deserves it becomes a note. A folder is read with everything under it, down to its last sub-folder: name the widest one. Nothing leaves the computer.
  - Work with Claude: the projects you worked on with Claude are summed up, and a project without a note gets one. Only one line per work session is recorded on the computer (the name of the project's folder).
3. **Tuning to your taste**: for mail and calendar, Claude looks at last week's meetings with you and asks which kind of meeting deserves a note. For folders, it suggests the ones your answers point to and checks that they exist.
4. **Live reading if you want it**: your work with Claude and your watched folders can be read during the day. A Claude in the background reads each conversation once it is over and each document you changed, and keeps what will matter later, as new seeds and as dated facts added to your existing notes, each with where it comes from. Claude tells you what it costs before turning it on, then helps you give that background Claude its access: you create it yourself, in a window that Claude opens for you. Mail and calendar stay weekly.
5. **Your own sources**: Claude asks whether there is something else your brain should follow by itself. Each source is defined with you, in plain words: what it reads, what becomes a note (and in which type and domain), how often (every day or every week), whether a note may be refreshed later, and who handles it.
  - Read automatically: a small program, written with you, when the source can be read without judgment.
  - Done by Claude: instructions, written with you, that Claude follows during the weekly review, when judgment or a browser is needed.
6. **Trial and approval**: a program is first tried without writing anything. Claude shows you the number of notes and the first three, and adjusts until you say "that's it". It only runs after your approval on this computer; then five notes from the first run are read together. A source done by Claude is carried out a first time with you.
7. **Your writings**: Claude asks what you have already written and where, orders it by interest with you, turns it into a checklist, then offers to bring in the first one with `/brain:ingest`.
8. **End**: two lines, which sources feed the brain and when they are next read.

## What it creates for you

- Your **living source choices** recorded, with the list of watched folders
- If you want it, the **live reading** of your conversations with Claude and of your watched folders: for each, the instructions of the Claude that reads, yours to adjust, and the small program that hands it what has settled
- For each source of your own: its **program** or its **instructions**, stored in the brain
- The **list of your writings**, to tick off as they come in
- If you want it, a **capture address** by email
- If you want it, a **step of your own**: a program that brings no note but runs with the brain every evening or every week (publishing a copy for one of your apps, checking something)

## Prerequisites

- A brain already created
- For mail and calendar: the Gmail, Google Calendar or Outlook connectors connected in your Claude app (Settings, Connectors). The source only starts once they are connected.
- The weekly review, set up by `/brain:add-routines`. Until then, the sources are read when you say "review my brain".
- For the live reading: a Claude subscription, the brain's background program turned on (Claude does it with you), and a lasting access to your Claude account that you create yourself, in a window that Claude opens for you. It stays on your computer, in a file that your account alone can read (not in a vault, which closes itself after a few hours and would stop the reading with it), and never goes through the conversation.
- If a source needs an access key: you paste it yourself into the brain's secrets file, never into the conversation. If you keep your keys in a Hypervibe vault, the key stays there.

## Tips

{{callout:tip|A capture address}}
If the mail source is on, a thought sent by email to an address of yours (or marked with an agreed word in the subject) becomes a seed at the next review. The message is reworded as a note, never pasted whole, and nothing else in the mailbox is read.
{{/callout}}

{{callout:info|What the live reading costs}}
It uses your Claude plan: about 100,000 to 200,000 tokens for each conversation or document read, nine tenths of them context read again, and several million tokens on a busy day. Under a subscription nothing is billed for it, but it counts toward your plan's limits. The weekly review tells you what it read, what it wrote and what it cost; you can pause it at any time, and everything it writes can be undone in one sentence.
{{/callout}}

{{callout:info|A cap for the day}}
The live reading stops by itself once it has used five million tokens in a day, and starts again the next morning; nothing is lost meanwhile, what arrived waits. You can move the cap or remove it. And when many items wait at once (after a holiday, or when older conversations are brought in), it reads nothing and asks you first: read them all, only the latest, or none.
{{/callout}}

{{callout:info|When the live reading stops}}
If the Claude that reads in the background can no longer work (its access has expired, your plan's limit was reached), your brain tells you by email if you set one up, and `/brain:status` says it first in any case. One sentence has it repaired: "the judge of my brain is down, repair it". Nothing is lost meanwhile: what it could not read waits.
{{/callout}}

{{callout:info|A source that waits for your vault}}
A source whose key is kept in your Hypervibe vault does not run while the vault is closed. It is a wait, not a breakdown: nothing is lost, the source runs by itself as soon as the vault is open again, and the live view shows a small key beside it meanwhile. The Claude that reads in the background never waits for the vault: its access is kept in a file on your computer.
{{/callout}}

{{callout:warning|What it must never read}}
Say it in a sentence: "never read what is in my Acme folder", "leave my Excel files out", "not the conversations of that project". Claude turns it into a rule, shows you what it sets aside among what was waiting, and records it. From then on nothing of it reaches the live reading. What was read before stays in the brain until you undo it.
{{/callout}}

{{callout:info|What enters as a seed}}
What a source brings enters as a seed, and a source may only rewrite a note while it is still a seed that this same source wrote. One exception: finished objects (your posts, articles, talks given) may enter as trusted and stay up to date, as long as nobody has touched the note. A single edit by your hand, and it is never rewritten again. Nothing ever comes in twice.
{{/callout}}

{{callout:warning|What the machine may add to a validated note}}
The machine creates notes; on a note you validated it never rewrites your text. It may only add a fact that says where it comes from (what the live reading does), and a source may keep a few lines up to date (a count of messages, a figure) within a zone marked with its name, never a character outside; Claude tells you so plainly before setting such a source up. On a validated concept, idea, decision or lesson, which is your thinking, it adds nothing: it proposes the change in the weekly letter.
{{/callout}}
