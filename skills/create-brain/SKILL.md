---
name: create-brain
description: Build your second brain step by step - the decisions, the creation, the sources that feed it, then the modules you want (backup, routines, search by meaning, map). Resumes where you left off.
---

# /create-brain - Build a second brain, step by step

You guide a person through the construction of **their** second brain: their ideas, projects, the people who matter, their publications, their decisions, as linked notes that Claude consults from any conversation and writes to properly.

Like Hypervibe's `/bootstrap`: **a core** that every brain has, built here, then **modules**, which are other skills. This skill proposes them at the end and invokes the ones the person wants; each can also be added later, on its own.

Commands below call the plugin's scripts through `${CLAUDE_SKILL_DIR}/../../scripts/`. `BRAIN_DIR` stands for the brain's folder.

## Communication
- Detect the user's language from the conversation (their own messages, anywhere in the session). If nothing gives a signal, fall back to the computer's language. ALWAYS reply in that language, including every example text quoted in this skill, which is illustrative and must be translated. **The brain's documents and notes are written in that language too.**
- The person may not be a developer: no jargon without a one-sentence explanation, never a command for them to type. You run everything.
- **Say what a thing does for them, never what it is technically.** Not "a scheduled git commit", but "every evening, your computer records the day's changes".
- Show progress as a short checklist.

## The stance

- **One step at a time, and a gate at the end of each**: the next step only starts when the gate's criterion is met. Announce the step, say what it will produce, do it, show the result.
- **The brain belongs to the person.** What goes in, what it does, what stays private: they decide. You propose, you explain the consequences, they choose.
- **Each gate passed is recorded**: set `stage` in `BRAIN_DIR/hyperbrain.json` to the number of the next step. It is what lets the journey resume in another session.
- **Less, but running.** Twenty right notes and a brain that answers beat an ambitious plan that stops at step 2.

## Step 0 - Where are we?

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/prereqs.mjs" --json
```

Keep `os` (`windows`, `mac` or `linux`): several explanations below depend on it.

- `ready` is false: the computer is not ready. Invoke `/hyperbrain:start-hyperbrain` first, then come back.
- `brain` is not null: a brain exists. Run `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json`, say where it stands in two sentences ("your brain has 42 notes, fed by your mail and your writing folder; the online backup is not set up yet"), and **resume at the step after `stage`**. Never redo a step unasked.
- The person already has a brain folder that is not active here (restored, cloned from another computer): `node "${CLAUDE_SKILL_DIR}/../../scripts/adopt.mjs" --dir "<folder>"`, then resume.
- Otherwise, present the path in five lines, then start Step 1:

> 1. We decide together what your brain is for and what it holds (about ten minutes).
> 2. We create it, and put your first twenty notes in, by talking.
> 3. We choose what feeds it: your mail and calendar, your folders, your work with Claude, what you have already written.
> 4. We check that Claude reads it in every conversation.
> 5. You choose the modules you want: protection, automatic tasks, search by meaning, a map.

## Step 1 - The decisions

The most important step, and it produces no code. Ask the questions **one at a time**, with examples drawn from what you already know about the person (the conversation, their memory, their `CLAUDE.md`).

1. **Why?** What do they expect from their brain? Finding again what they thought, writing in their own voice, not losing the people they meet, preparing a book... One or two sentences.
2. **Their domains**: the 3 to 8 big areas of their life and work (for instance work, writing, family, money, health, learning). One word each. Every note will carry one or two: too few and they sort nothing, too many and every note is a hesitation.
3. **Their types of notes**: the kinds of things their brain will hold. They are theirs, not the plugin's: a speaker has talks, a writer books, a consultant clients and missions, a researcher papers. Look at their computer first, **with their agreement** (say that you only read folder names and count files, never open one):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/discover.mjs"
```

   From what it shows (the folders and their sub-folders, the kinds of files, the code projects, the way their Claude already sorts its memory), and from the conversation, **propose a list of 5 to 12 types**, each with one sentence of what goes in it and the evidence that suggested it ("*talks*: your folder Travail/Conférences holds 60 presentations"). Always include a few basics: notes (facts, decisions), ideas, people, projects. Then discuss: they remove, rename, add. Names are single lowercase words without accents, in their language (`conference`, `livre`, `oeuvre` for a French brain), each with its folder (usually the plural). One question to settle: which types hold ideas whose maturity is theirs to judge (never promoted by the machine; ideas by default).
4. **What never goes in**: health, family, money? Explain the two levels:
   - a *private* note exists in the brain, but its content is **never shown to an AI** (neither by search nor to Claude);
   - a "danger zone" folder is not even read, nor backed up: the last resort.
5. **Where it lives.** By default a `hyperbrain` folder in their home folder (find its real path with `node -e "console.log(require('os').homedir())"`), or next to their other projects if they have a place for them. **Never inside a synchronised folder**: these tools damage the history and the search index of the brain (the creation refuses such a folder). What to say depends on `os`:
   - **windows**: not in Dropbox, OneDrive or Google Drive. Careful: Windows often places the *Documents* and *Desktop* folders inside OneDrive without saying so.
   - **mac**: not in Dropbox, OneDrive, Google Drive or iCloud Drive. Careful: when "Desktop and Documents Folders" is ticked in the iCloud settings, the *Desktop* and *Documents* folders keep their usual place but are stored in iCloud (the creation detects it and refuses them).
   - **linux**: not in a folder synchronised by Dropbox, Nextcloud or similar.

Summarise the answers in a short block and have it validated. **Gate 1: the summary is validated.**

## Step 2 - Creation and the first notes

### Create

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/init.mjs" --dir "BRAIN_DIR" --name "<first name>" --domains "<d1>,<d2>,<d3>" --types "<type>:<folder>,<type>:<folder>,..." --lang <fr|en>
```

`--lang`: the language of the conversation if it is French or English; for any other language, `en`, and you translate the brain's documents when you fill them. **The format of the notes follows it**: a French brain writes `titre`, `domaines`, `statut: graine`... `--types`: the types validated in Step 1. If some types never promoted by the machine differ from the default (ideas), set `neverPromoted` in `hyperbrain.json`. One JSON line comes back. `identity: null` means git has no name: go back to `/hyperbrain:start-hyperbrain`, Step 3. If it answers that a brain already exists, ask whether the new one should replace it as the active brain (the old one is not deleted), and repeat with `--switch` only if they say so.

In `vault/CLAUDE.md`, the table of types has a column "for": fill it for the types that have no description yet, with the sentence agreed in Step 1. Then write the founding document `BRAIN.md` from Step 1, **in the person's language**, keeping its structure: fill `{{WHY}}`, `{{DOMAINS}}`, `{{PRIVACY}}`; leave `{{COMPONENTS}}` for Step 5. Show it, then save:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs" --now
```

### The first twenty notes, by talking

An empty brain is useless and gives no desire. Have the person fill theirs **through conversation**, not a form. Three or four open questions, one at a time:

- Your two or three current projects: what they are, where they stand.
- Three ideas you care about, that you often defend.
- Five people who matter in your work, and why.
- A recent decision, and its reason.

From the answers, draw **one note per subject**, and **show the list of titles with their type and domain** before writing. The person corrects, then write each note:

```bash
printf '%s' "<the body>" | node "${CLAUDE_SKILL_DIR}/../../scripts/capture.mjs" --title "<title>" --type <type> --domains <domain> [--links <slug>,<slug>] --status trusted --source "conversation of <date>"
```

`--status trusted` here because the person has just validated the content. Link notes together (`--links`, or `[[slug]]` in the body): a brain without links is just a folder. Write first the notes the others will point to (a link to a note that does not exist yet is refused).

Then ask the brain, through the `brain_search` tool of the hyperbrain MCP server, for a word from one of the notes.

**Gate 2: the search finds one of their notes.** Show them: it is the first time they see their brain answer.

## Step 3 - The sources

What builds and enriches the brain. Invoke `/hyperbrain:brain-sources`: it presents the living sources (mail and calendar, watched folders, work with Claude) with what each implies, records the person's choices, lists their existing writings in `SOURCES.md`, and offers to bring in the first one (`/hyperbrain:brain-ingest`).

Then propose **the contacts directory**, in one sentence of what it brings (who they exchange with, who is who, searchable in every conversation) and one of what it implies (read from their mail through their Claude's connector, never the text of an email, only those who matter become notes, with their agreement). On a yes, invoke `/hyperbrain:brain-contacts`.

**Gate 3: the sources are chosen, the directory is set up or knowingly declined**, and either a first writing has been brought in and checked, or the person knowingly keeps it for later.

## Step 4 - Claude reads it everywhere

The plugin already plugged the brain into Claude: it tells every new conversation that the brain exists and when to consult it, without being asked. Nothing to configure.

**Gate 4: the person, in a new conversation.** Ask them to open a **new** conversation, ask there a question about themselves ("what does my brain say about my projects?"), and come back to tell you whether Claude answered from their notes. Do not test it in their place.

## Step 5 - The modules

Present them by family, each in one sentence of what it brings, and let the person choose (recommend at least the first two families). Then **invoke the chosen skills, one after the other, in this order**; each explains what it implies before doing anything, and asks its own questions.

> **Protect your brain**
> - `/hyperbrain:add-backup`: a private copy online, a weekly copy in a place you choose, or both. If the computer is lost, nothing is.
>
> **Make it live on its own**
> - `/hyperbrain:add-routines`: every evening your computer records the day's changes, every week Claude rereads your brain and leaves you a report.
>
> **Use it better**
> - `/hyperbrain:add-meaning`: find a note even when you search with other words than its own.
> - `/hyperbrain:brain-viz`: see your brain as a map.

Before `/hyperbrain:add-routines`, run a first review together (`/hyperbrain:brain-review`) and read the report: it shows concretely what the weekly review brings, and the person decides with that in mind.

For each module declined, one sentence: its skill adds it whenever they want. Then fill `{{COMPONENTS}}` in `BRAIN.md` with the sources and modules now in place, in their language, and save.

**Gate 5: each module is added or knowingly declined.** Set `stage` to 6: the brain is built. End with the reflex to keep: whenever they say "note this", "keep this idea", it is `/hyperbrain:brain`; have them try it once, right now.

## The rules that do not bend

1. **The machine creates, it never modifies a validated note without the person.** Any note you write without them validating its text enters as `seed`.
2. **A new note always goes through the capture script**, never a file written by hand.
3. **No secret** in a note, in the conversation, or in a commit. An API key goes into `.env`, pasted by the person.
4. **Git**: never `git add -A` nor `git add .`, never a stash, never `pull --autostash`, never `push --force`. Push only if the person allowed it (`autoPush`) or asks for it.
5. **One source at a time**, with three trial notes before each batch.
