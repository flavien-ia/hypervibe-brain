---
name: create-brain
description: Build your second brain step by step, from the first decisions to a living brain (notes, sources, weekly review). Resumes where you left off.
---

# /create-brain - Build a second brain, step by step

You guide a person through the construction of **their** second brain: their ideas, projects, the people who matter, their publications, their decisions, as linked markdown notes that Claude consults from any session and writes to properly.

Commands below call the plugin's scripts through `${CLAUDE_SKILL_DIR}/../../scripts/`. `BRAIN_DIR` stands for the brain's folder.

## Communication
- Detect the user's language from the conversation (their own messages, anywhere in the session). If nothing gives a signal, fall back to the OS locale. ALWAYS reply in that language, including any example text quoted in this skill, which is illustrative and must be translated. **The brain's documents and notes are written in that language too.**
- The person may not be a developer: no jargon without a one-sentence explanation, never a command for them to type. You run everything.
- Show progress as a short checklist.

## The stance

- **One step at a time, and a gate at the end of each**: the next step only starts when the gate's criterion is met. Announce the step, say what it will produce, do it, show the result.
- **The brain belongs to the person.** What goes in, how it is classified, what stays private: they decide. You propose, you explain consequences, they choose.
- **Each gate passed is recorded**: set `stage` in `BRAIN_DIR/hyperbrain.json` to the number of the next step. It is what lets the journey resume in another session.
- **Less, but running.** Twenty right notes and a brain that answers beat an ambitious plan that stops at step 2.

## Step 0 - Where are we?

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/prereqs.mjs" --json
```

- `ready` is false: the computer is not ready. Invoke `/hyperbrain:start-hyperbrain` first, then come back.
- `brain` is not null: a brain exists. Run `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json`, say where it stands in two sentences ("your brain has 42 notes, the evening save is armed, your articles remain to be ingested"), and **resume at the step after `stage`**. Never redo a step unasked.
- Otherwise, present the path in five lines, then start Step 1:

> 1. We decide together what your brain holds (about fifteen minutes of questions).
> 2. We create it and put your first twenty notes in, by talking.
> 3. We check that Claude reads it from every conversation.
> 4. Your existing writings go in, one source at a time.
> 5. We make it live: a save every evening, a review every week, the reflex of capturing.

## Step 1 - The decisions

The most important step, and it produces no code. Ask the questions **one at a time**, with examples drawn from what you already know about the person (the conversation, their memory, their `CLAUDE.md`).

1. **Why?** What do they expect from their brain? Finding again what they thought, writing in their own voice, not losing the people they meet, preparing a book... One or two sentences.
2. **Their domains**: the 3 to 8 big areas of their life and work (for instance work, writing, family, money, health, learning). One word each. Every note will carry one or two: too few and they sort nothing, too many and every note is a hesitation.
3. **Their sources**: what they have already written, and where. Notes (which app, which folder), documents, published articles or posts, Claude's memory files, notebooks... Order them with the person **by interest**: they will go in one at a time, the richest first.
4. **What never goes in**: health, family, money? Explain the two levels:
   - a `private` note exists in the brain, but its content is **never shown to an AI** (neither by search nor to Claude);
   - the `vault/danger-zone/` folder is not even read, nor backed up: the last resort.
5. **Where it lives, and its backup.** The folder: by default a `hyperbrain` folder directly in their home folder (`C:\Users\<them>\hyperbrain` on Windows, `/Users/<them>/hyperbrain` on a Mac; find the real path with `node -e "console.log(require('os').homedir())"`), or next to their other projects if they have a place for them. **Never inside a synchronised folder** (Dropbox, OneDrive, iCloud, Google Drive), and beware: Windows often puts Documents and the Desktop inside OneDrive, and macOS puts them in iCloud when "Desktop and Documents" sync is on. These tools damage git repositories and databases; the creation refuses such a folder. The backup: a **private** GitHub repository is recommended (full history, going back note by note). If they want one, also ask whether they allow the brain to **push its saves by itself**: it is a permission, not a default.

Summarise the answers in a short block and have it validated. **Gate 1: the summary is validated.**

## Step 2 - Creation and the first notes

### Create

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/init.mjs" --dir "BRAIN_DIR" --name "<first name>" --domains "<d1>,<d2>,<d3>" [--auto-push]
```

One JSON line comes back. `identity: null` means git has no name: go back to `/hyperbrain:start-hyperbrain`, Step 3. If it answers that a brain already exists, ask the person whether the new one should replace it as the active brain (the old one is not deleted), and repeat with `--switch` only if they say so.

Then write the two founding documents from Step 1, **in the person's language**, keeping their structure: `BRAIN.md` (fill `{{WHY}}`, `{{DOMAINS}}`, `{{PRIVACY}}`, `{{COPIES}}`, translate the headings) and `SOURCES.md` (`{{SOURCES}}` as a checklist `- [ ]` in the chosen order, `{{EXCLUSIONS}}`). Show both, then save:

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

## Step 3 - Claude reads it everywhere

The plugin already plugged the brain into Claude: its server tells every new session that the brain exists and when to consult it, without being asked. Nothing to configure.

**Gate 3: the person, in a new session.** Ask them to open a **new** conversation, ask there a question about themselves ("what does my brain say about my projects?"), and come back to tell you whether Claude answered from their notes. Do not test it in their place.

### Search by meaning (optional, recommended)

Without it everything works, except finding a note searched with other words than its own. It needs an OpenAI API key (or a compatible service): a few cents for thousands of notes, then only the changed notes.

**The key never goes through the conversation.** Create `BRAIN_DIR/.env` with the single line `OPENAI_API_KEY=` (it is already excluded from git), open it in their editor (`start "" "BRAIN_DIR/.env"` on Windows, `open` on macOS, `xdg-open` on Linux), and ask them to paste the key after the `=`, save, and tell you when done. No key yet: platform.openai.com, API keys, and a small credit. Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs"
```

The `vectors` line says how many were computed. Try `brain_search` with `meaning: true` and words that are in no note.

### The online backup (if chosen in Step 1)

If `gh` is connected (`gh auth status`), and **with the person's explicit agreement** to create the repository:

```bash
cd "BRAIN_DIR" && gh repo create <name> --private --source . --push
```

Otherwise, the manual way: the person creates an empty **private** repository on github.com, then you run `git remote add origin <address>` and `git push -u origin main`. **Always private**: the brain holds their life.

## Step 4 - The sources, one at a time

Invoke `/hyperbrain:brain-ingest` for the first unticked source of `SOURCES.md`. It runs the whole protocol (scope, three trial notes, batches, checking, ticking).

**Gate 4: at least one whole source ingested and checked.** The next ones can come later, at the person's pace: `/hyperbrain:brain-ingest` again, or `/hyperbrain:create-brain`, which will resume here.

## Step 5 - Make it live

A brain nobody feeds dies within three months. Three habits:

1. **Capturing**: whenever they say "note this", "keep this idea", it is `/hyperbrain:brain`. Have them try it once, right now.
2. **The first review**: invoke `/hyperbrain:brain-review` now, together, and read the report. It shows what the weekly review will bring.
3. **The routines**, proposed last, once they have seen what a review is:

> Your brain can now look after itself: **a save every evening** (on this computer, no AI, no cost) and **a review every week** by Claude, like the one we just read. **Shall I arm them?**

- **Yes**: invoke the skill `/hyperbrain:brain-routines` right away; it asks the times and arms both.
- **Not now**: tell them `/hyperbrain:brain-routines` arms them whenever they want, and that until then the brain is saved only when they ask for it.

**Gate 5: a review has run, and the routines are armed or knowingly postponed.** Set `stage` to 6: the brain is built.

## And afterwards

End with what exists beyond this journey, so they know what to ask for when they need it: a cold copy outside GitHub, a second computer (a clone and a git sync), access from the cloud for online agents (a read-only copy behind a token door), a visual map of the brain. None of it is needed to start.

## The rules that do not bend

1. **The machine creates, it never modifies a validated note without the person.** Any note you write without them validating its text enters as `seed`.
2. **A new note always goes through the capture script**, never a file written by hand.
3. **No secret** in a note, in the conversation, or in a commit. An API key goes into `.env`, pasted by the person.
4. **Git**: never `git add -A` nor `git add .`, never a stash, never `pull --autostash`, never `push --force`. Push only if the person allowed it (`autoPush`) or asks for it.
5. **One source at a time**, with three trial notes before each batch.
