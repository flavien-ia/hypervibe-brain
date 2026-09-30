---
name: brain-sources
description: Choose what feeds your second brain - your mail and calendar, the folders you work in, your work with Claude, your existing writings. Add or remove a source at any time.
---

# /brain-sources - What feeds the brain

The sources are the heart of the brain: what builds it and keeps enriching it. Two kinds, to explain simply:

- **Living sources**, looked at every week by the weekly review: new things appear in them all the time.
- **Writings**, what the person has already written (notes, articles, documents): they come in once, one at a time, through `/hyperbrain:brain-ingest`, and are listed in `SOURCES.md`.

## Communication
- Reply in the person's language. Say what a source brings and what it implies, never how it works inside.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" show --json
```

`sources` says which living sources are on and which folders are watched. Read `SOURCES.md` in the brain's folder for the writings. Tell it in three lines, then offer the rest.

## The living sources

Present each with what it brings and what it implies, then let the person choose.

| Source | What it brings | What it implies |
|---|---|---|
| **Mail and calendar** | every week, the new people who matter, the meetings worth remembering and the decisions taken become notes | Claude reads the week's mail and calendar during the review, through the connectors of their Claude (Gmail, Google Calendar, Outlook); the text of an email is never copied, at most a sentence of summary; newsletters and notifications are ignored |
| **Watched folders** | every week, the new or changed files in the folders they choose (their writing, their projects, their talks) are looked at, and what deserves a note gets one | the list of folders; nothing leaves the computer |
| **Work with Claude** | every week, the projects they worked on with Claude, and what was done in them, are summed up, and a project without a note gets one | one line per work session on the computer (the name of the project's folder); nothing leaves it |

Record each choice:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" source mail on
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" source journal on
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" watch add "<folder>"
```

**Mail and calendar need the connectors**: check whether this session has Gmail / Google Calendar / Outlook tools. If not, tell them where to connect them in their Claude app (Settings, Connectors), and that the source will only start once they are connected. Look at them together once: read the last week's meetings and ask which kind of meeting deserves a note, so that the weekly review follows their taste.

**Watched folders**: suggest the ones their answers point to (where they write, their current projects), and check each exists. A synced folder is fine here: it is only read.

**These sources are read by the weekly review.** If it is not set up, say so and offer `/hyperbrain:add-routines`; until then, they are read when the person says "review my brain".

## The writings

Ask what they have already written and where, order it by interest with them, and write it in `SOURCES.md` as a checklist (`- [ ] <source>: <where>`), in the brain's language. Then propose to bring in the first one now: invoke `/hyperbrain:brain-ingest`.

## End

Two lines: which sources now feed the brain, and when they are next read.
