---
name: create-brain
description: Build your second brain step by step, from the first decisions and the components you want, to a living brain (notes, sources, routines). Resumes where you left off.
---

# /create-brain - Build a second brain, step by step

You guide a person through the construction of **their** second brain: their ideas, projects, the people who matter, their publications, their decisions, as linked markdown notes that Claude consults from any session and writes to properly.

Commands below call the plugin's scripts through `${CLAUDE_SKILL_DIR}/../../scripts/`. `BRAIN_DIR` stands for the brain's folder.

## Communication
- Detect the user's language from the conversation (their own messages, anywhere in the session). If nothing gives a signal, fall back to the OS locale. ALWAYS reply in that language, including every example text quoted in this skill, which is illustrative and must be translated. **The brain's documents and notes are written in that language too.**
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
- `brain` is not null: a brain exists. Run `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json`, say where it stands in two sentences ("your brain has 42 notes, the evening save is set up, your articles remain to be brought in"), and **resume at the step after `stage`**. Never redo a step unasked.
- Otherwise, present the path in five lines, then start Step 1:

> 1. We decide together what your brain holds and what it does for you (about fifteen minutes).
> 2. We create it and put your first twenty notes in, by talking.
> 3. We check that Claude reads it in every conversation.
> 4. What you have already written goes in, one source at a time.
> 5. We set up what keeps it alive.

## Step 1 - The decisions

The most important step, and it produces no code. Ask the questions **one at a time**, with examples drawn from what you already know about the person (the conversation, their memory, their `CLAUDE.md`).

1. **Why?** What do they expect from their brain? Finding again what they thought, writing in their own voice, not losing the people they meet, preparing a book... One or two sentences.
2. **Their domains**: the 3 to 8 big areas of their life and work (for instance work, writing, family, money, health, learning). One word each. Every note will carry one or two: too few and they sort nothing, too many and every note is a hesitation.
3. **Their sources**: what they have already written, and where. Notes (which app, which folder), documents, published articles or posts, Claude's memory files, notebooks... Order them with the person **by interest**: they will go in one at a time, the richest first.
4. **What never goes in**: health, family, money? Explain the two levels:
   - a *private* note exists in the brain, but its content is **never shown to an AI** (neither by search nor to Claude);
   - a "danger zone" folder is not even read, nor backed up: the last resort.
5. **The components** (see below): what the brain does beyond holding notes.
6. **Where it lives.** By default a `hyperbrain` folder in their home folder (find its real path with `node -e "console.log(require('os').homedir())"`), or next to their other projects if they have a place for them. **Never inside a synchronised folder**: these tools damage the history and the search index of the brain (the creation refuses such a folder). What to say depends on `os`:
   - **windows**: not in Dropbox, OneDrive or Google Drive. Careful: Windows often places the *Documents* and *Desktop* folders inside OneDrive without saying so.
   - **mac**: not in Dropbox, OneDrive, Google Drive or iCloud Drive. Careful: when "Desktop and Documents Folders" is ticked in the iCloud settings, the *Desktop* and *Documents* folders keep their usual place but are stored in iCloud (the creation detects it and refuses them). Dropbox, OneDrive and Google Drive live under `~/Library/CloudStorage`, iCloud Drive under `~/Library/Mobile Documents`.
   - **linux**: not in a folder synchronised by Dropbox, Nextcloud or similar.

### The components

Present them as a short menu, **each with what it brings and what it implies**, in plain words, then let the person choose. Recommend the first five; the rest depends on their habits. Translate everything.

| Component | What it brings | What it implies |
|---|---|---|
| **Search by meaning** | finds a note even when you search with other words than its own | an OpenAI account and key, a few cents for thousands of notes; the text of your non-private notes is sent to OpenAI to be turned into numbers |
| **Online backup** | a private copy of the whole history on GitHub: if the computer is lost, nothing is | a free GitHub account; your notes are stored there, in a private space |
| **Evening save** | every evening, your computer records the day's changes (and sends them online if you chose the backup) | nothing to pay, no AI; a task in the computer's scheduler, invisible |
| **Weekly review** | once a week, Claude rereads your brain and writes you a report: new notes, notes that have proven themselves, forgotten notes, links to add | uses a little of your Claude subscription; the Claude app must be open at that moment, or the review waits for the next opening |
| **Work journal** | the weekly review tells which projects you worked on with Claude | one line per work session on your computer (the project's folder name), nothing leaves it |
| **Mail and calendar** | the weekly review looks at your week's emails and meetings and proposes notes for new people, meetings and decisions | Claude reads your mail during the review, through the Gmail / Calendar (or Outlook) connectors of your Claude; the text of an email is never copied, at most a summary |
| **Watched folders** | the weekly review lists the files that changed in folders you choose (your writing, your projects) and proposes what deserves a note | the list of folders; nothing leaves the computer |
| **Cold copy** | once a week, the whole history in a single file, in a place you choose (an external drive, Dropbox...): what survives even the loss of the computer and GitHub | a little space; the last eight copies are kept |

Say also, in one sentence, what does not exist yet and will come: using the brain from a second computer, reaching it from the cloud, and receiving the weekly review by email. And that seeing the brain as a map is `/hyperbrain:brain-viz`, available at any time.

For **watched folders** and **cold copy**, ask the folders now. Any component can be added or removed later, just by asking.

Summarise all the answers in a short block and have it validated. **Gate 1: the summary is validated.**

## Step 2 - Creation and the first notes

### Create

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/init.mjs" --dir "BRAIN_DIR" --name "<first name>" --domains "<d1>,<d2>,<d3>" --lang <fr|en> [--auto-push]
```

`--lang`: the language of the conversation if it is French or English; for any other language, `en`, and you translate the brain's documents when you fill them. `--auto-push` only if they chose the online backup and allowed the brain to send its saves online by itself. One JSON line comes back. `identity: null` means git has no name: go back to `/hyperbrain:start-hyperbrain`, Step 3. If it answers that a brain already exists, ask whether the new one should replace it as the active brain (the old one is not deleted), and repeat with `--switch` only if they say so.

Record the chosen components:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set <meaning|backup|save|review|journal|mail> on
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" watch add "<folder>"
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" cold-copy "<folder>"
```

Then write the two founding documents from Step 1, **in the person's language**, keeping their structure: `BRAIN.md` (fill `{{WHY}}`, `{{DOMAINS}}`, `{{COMPONENTS}}` as a short list of what was chosen and why, `{{PRIVACY}}`) and `SOURCES.md` (`{{SOURCES}}` as a checklist `- [ ]` in the chosen order, `{{EXCLUSIONS}}`). Show both, then save:

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

The plugin already plugged the brain into Claude: it tells every new conversation that the brain exists and when to consult it, without being asked. Nothing to configure.

**Gate 3: the person, in a new conversation.** Ask them to open a **new** conversation, ask there a question about themselves ("what does my brain say about my projects?"), and come back to tell you whether Claude answered from their notes. Do not test it in their place.

### Search by meaning (if chosen)

**The key never goes through the conversation.** Create `BRAIN_DIR/.env` with the single line `OPENAI_API_KEY=` (it is already kept out of the history), open it in their text editor (`start "" "BRAIN_DIR/.env"` on Windows, `open -e "BRAIN_DIR/.env"` on a Mac, `xdg-open` on Linux), and ask them to paste the key after the `=`, save, close, and tell you when done. No key yet: platform.openai.com, "API keys", and a small credit (a few dollars last for years). Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs"
```

The `vectors` line says how many were computed. Try `brain_search` with `meaning: true` and words that are in no note.

### The online backup (if chosen)

If `gh` is connected (`gh auth status`), and **with the person's explicit agreement** to create the repository:

```bash
cd "BRAIN_DIR" && gh repo create <name> --private --source . --push
```

Otherwise, the manual way: the person creates an empty **private** repository on github.com, then you run `git remote add origin <address>` and `git push -u origin main`. **Always private**: the brain holds their life.

## Step 4 - The sources, one at a time

Invoke `/hyperbrain:brain-ingest` for the first unticked source of `SOURCES.md`. It runs the whole protocol (scope, three trial notes, batches, checking, ticking).

**Gate 4: at least one whole source brought in and checked.** The next ones can come later, at the person's pace: `/hyperbrain:brain-ingest` again, or `/hyperbrain:create-brain`, which will resume here.

## Step 5 - Keeping it alive

A brain nobody feeds dies within three months. In this order:

1. **Capturing**: whenever they say "note this", "keep this idea", it is `/hyperbrain:brain`. Have them try it once, right now.
2. **A first review, together**: invoke `/hyperbrain:brain-review` and read the report with them. It shows concretely what the weekly review brings.
3. **The automatic tasks**, if they chose the evening save or the weekly review in Step 1. Propose them in these words (translated, adapted to what they chose):

> Two things can now happen without you asking:
> - **every evening at 9 pm**, your computer records the day's changes to your brain (and sends them to GitHub, since you chose the online backup). No AI, nothing to pay;
> - **every week**, on the day you choose, Claude rereads your brain and leaves you a report like the one we just read.
>
> **Shall I set them up now?**

- **Yes**: invoke the skill `/hyperbrain:brain-routines` right away; it asks the times and sets both up.
- **Not now**: tell them `/hyperbrain:brain-routines` does it whenever they want, and that until then the brain is only saved when they ask for it ("save my brain").

**Gate 5: a review has run, and the automatic tasks are set up or knowingly postponed.** Set `stage` to 6: the brain is built. End by mentioning `/hyperbrain:brain-viz`, to see the brain as a map.

## The rules that do not bend

1. **The machine creates, it never modifies a validated note without the person.** Any note you write without them validating its text enters as `seed`.
2. **A new note always goes through the capture script**, never a file written by hand.
3. **No secret** in a note, in the conversation, or in a commit. An API key goes into `.env`, pasted by the person.
4. **Git**: never `git add -A` nor `git add .`, never a stash, never `pull --autostash`, never `push --force`. Push only if the person allowed it (`autoPush`) or asks for it.
5. **One source at a time**, with three trial notes before each batch.
