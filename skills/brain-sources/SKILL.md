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

## Their own sources

Beyond what every brain has, each person has sources of their own: their posts kept in some database or export, the talks in their agenda, a reading app, a CRM, a feed... Ask: **"is there something else, somewhere, that you would like your brain to follow by itself?"**, and suggest from what you know of them.

`node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list` shows the ones already defined.

For each one they want, define it **with them**, in plain words first:

1. **What it reads**, and where (a folder of exports, a web address, a database, an app...).
2. **What becomes a note**, and what does not (a post yes, a comment no), in which of the brain's types and domains.
3. **How often**: every day or every week.
4. **Whether a note may be refreshed later** (the likes of a post, the date of an event): only while it is still a seed, and only by this source. Never a validated note.
5. **Which kind**:
   - **read automatically** (`script`): when the source can be read without judgment (a file, an API, a database). You write a small program with them: it reads and prints the notes to create, and the plugin writes them, with every check. A key it needs goes in the brain's `.env`, pasted by the person, never in the conversation.
   - **done by Claude** (`claude`): when it needs judgment or a browser (a website without an API, a feed to sort). You write, with them, the instructions Claude will follow during the weekly review.

Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" add <name> --kind <script|claude> --every <day|week> --type <type> --domains <d1,d2> --description "<one sentence>" [--updates]
```

It creates `sources/<name>/` in the brain, with a `run.mjs` whose contract is written at its top, or an `instructions.md`. Write it with them.

**For a script, test before anything is written**:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" test <name>
```

It runs the program, checks every note it would create, and writes nothing. Show the person the count and the three first notes; adjust until they say "that's it". Then **their approval, on this computer**: a program that comes with the brain (a clone on another computer, a restored copy) never runs by itself, and a program that changed must be approved again. Explain it in one sentence, and on their yes:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" trust <name>
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" run <name>
```

The first run brings everything the source holds: say how many notes before running it if there are many, and check five of them together afterwards (same care as `/hyperbrain:brain-ingest`). Afterwards, the evening save runs it at its rhythm, from its last success.

**For a source done by Claude**, do it once together now, following its instructions, then record it: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" mark <name> --ok --created <n>`. The weekly review does it afterwards.

## The writings

Ask what they have already written and where, order it by interest with them, and write it in `SOURCES.md` as a checklist (`- [ ] <source>: <where>`), in the brain's language. Then propose to bring in the first one now: invoke `/hyperbrain:brain-ingest`.

## End

Two lines: which sources now feed the brain, and when they are next read.
