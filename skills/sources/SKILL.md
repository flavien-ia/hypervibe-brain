---
name: sources
description: Choose what feeds your second brain - your mail and calendar, the folders you work in, your work with Claude, your existing writings, sources of your own. Add or remove a source at any time, have some of them read live, say what must never be read.
---

# /brain:sources - What feeds the brain

The sources are the heart of the brain: what builds it and keeps enriching it. You say where things stand, you present the choices in the person's words, and you hand each one to the skill that does it. Two kinds of sources, to explain simply:

- **Living sources**, looked at every week by the weekly review: new things appear in them all the time. Two of them, the work with Claude and the watched folders, can also be read **live**, during the day.
- **Writings**, what the person has already written (notes, articles, documents): they come in once, one at a time, and are listed in `SOURCES.md`.

## Communication
- Reply in the person's language. Say what a source brings and what it implies, never how it works inside.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" show --json
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list --json
```

`sources` says which living sources are on and which folders are watched; the list shows the sources of their own and the ones read live (`live`). Read `SOURCES.md` in the brain's folder for the writings. Tell it in three lines, then offer the rest.

## The living sources

Present each with what it brings and what it implies, then let the person choose.

| Source | What it brings | What it implies |
|---|---|---|
| **Mail and calendar** | every week, the new people who matter, the meetings worth remembering and the decisions taken become notes | Claude reads the week's mail and calendar during the review, through the connectors of their Claude (Gmail, Google Calendar, Outlook); the text of an email is never copied, at most a sentence of summary; newsletters and notifications are ignored |
| **Watched folders** | every week, the new or changed files in the folders they choose (their writing, their projects, their talks) are looked at, and what deserves a note gets one | the list of folders; nothing leaves the computer |
| **Work with Claude** | every week, the projects they worked on with Claude, and what was done in them, are summed up, and a project without a note gets one | one line per work session on the computer (the name of the project's folder); nothing leaves it |

- **Mail and calendar**: on their yes, invoke `/brain:_mail-calendar`. It checks the connectors, turns the source on and tunes it to their taste.
- **Watched folders**: suggest the ones their answers point to (where they write, their current projects), and check each exists. A synced folder is fine here: it is only read. For each: `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" watch add "<folder>"` (`watch remove` takes one back). A watched folder is read with all that is under it: name the widest folder, not its sub-folders. The command says so itself (`included` when the folder is inside one already watched, `replaces` when it takes the place of folders it holds); tell the person in one sentence.
- **Work with Claude**: `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" source journal on` (`off` stops it).

**These sources are read by the weekly review.** If it is not set up, say so and offer `/brain:add-routines`; until then, they are read when the person says "review my brain".

## What each request goes to

| The person wants | Invoke |
|---|---|
| their work with Claude or their watched folders read **during the day**, not once a week; to pause or stop that reading | `/brain:_live-sources` |
| to know what the live reading costs, move its cap for the day, or answer a judge that waits before a big catch-up | `/brain:_limits` |
| something **never read** by it (a client, a project, a folder, a kind of file) | `/brain:_exclude` |
| the brain to follow **something of their own** (their posts, a CRM, a reading app, a feed), a capture address by email, or a program of theirs run with the brain | `/brain:_own-source` |
| to list **what they have already written** and bring it in | `/brain:_writings` |
| a live reading that **stopped working** | `/brain:_repair-judge` |

Offer the live reading once the work with Claude or a watched folder is chosen: it is the difference between a brain that learns of their week at the weekly review and one that knows the same evening. Offer a source of their own to everyone, with the question: **"is there something else, somewhere, that you would like your brain to follow by itself?"**, and suggest from what you know of them.

**The keys of a source and the vault.** A source of their own that needs a key reads it from the brain's `.env` or, for a person who has a Hypervibe vault, from the vault, where the keys of the sources stay. A source whose key is in a closed vault is put on hold: it is not a breakdown. It runs by itself at the first pass that finds the vault open, and the live view shows a small key beside a source that waits. The Claude that reads in the background is the one exception: its token is kept in a file of this computer, outside the vault, so that the reading never stops because a vault closed (`/brain:_judge-token`).

One request at a time: invoke the skill, let it finish, come back here.

**The first time** (`/brain:create` or `/brain:start` called you, or nothing is chosen yet), go through everything once, in this order: the living sources above, the live reading, a source of their own, then their writings (`/brain:_writings` lists them in `SOURCES.md` and offers to bring in the first one). Each is offered, none is imposed. **Later**, do only what they came for.

## End

Two lines: which sources now feed the brain, and when they are next read. If `/brain:start` or `/brain:create` called you, hand back to it.
