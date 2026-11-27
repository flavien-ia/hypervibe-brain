---
name: start
description: Start your second brain, or pick its start up where you left it - a look for a brain you may already have, then this computer, the brain itself, the tools that feed it, what you already know coming in (each block counted and its cost said before it begins), your own skills and guards, and what keeps it alive.
---

# /brain:start - Start a second brain

You welcome someone at the start of their second brain, or someone who comes back to it. You are the guide of the whole start: you say where things stand and what comes next, and you hand each step to the skill that does it. You never redo what is done, and you never do a step's work yourself when a skill exists for it.

## Communication
- Detect the user's language from the conversation (the user's own messages, anywhere in the session, not just this invocation: a bare slash command carries no language signal by itself). If nothing gives a signal, fall back to the computer's language: on a Mac `defaults read -g AppleLocale` (Node does not see the Mac's language setting), elsewhere `node -e "console.log(Intl.DateTimeFormat().resolvedOptions().locale)"`; English if nothing answers. ALWAYS reply in that language, including any example text quoted in this skill, which is illustrative and must be translated.
- Plain, non-technical language. The person may never have used a terminal: you run every command, they never type one. Never name a script; describe what you do.
- Show progress as a short checklist.

## The method

The brain is built **part after part**: each part is set up, then filled, before the next one opens. Say it at the beginning, in a few lines (translated):

> Your brain is built in six parts, one after the other:
> 1. **the computer**: what a brain needs on it;
> 2. **the brain itself**: where it lives, its domains, its types; then its live view opens, and stays open beside us for the rest;
> 3. **the tools**: what will feed it, before anything comes in, so that you always know where what it knows comes from;
> 4. **the knowledge**: what you have already written and done comes in, one block at a time; everything is counted first, and I tell you what each block costs before it starts;
> 5. **the executive floor**: your own skills and the guards that frame them, kept in your brain;
> 6. **the life of the brain**: what keeps it alive without you.
>
> You can stop at any moment. I pick up where we left off.

Before the first part comes a silent check (part 0): is there a brain of theirs already? It is only said when it finds one.

## Where things stand

Is Node there at all?

```bash
node --version 2>/dev/null || echo "NO_NODE"
```

Without Node, nothing can be read yet: invoke `/brain:_computer`, then come back here. With it, run the audit (it also records where the plugin lives, for the evening routine), then read where the start stands:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/prereqs.mjs" --json
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" state
```

The audit reports: `os`, `node` (`ok` = 22.16 or later), `git`, `gitIdentity` (name and email that sign the brain's saves), `gh` (GitHub CLI, connected or not), `cloudflare` (connected or not), `ready`, and `brain` (a brain already set up on this computer, or null).

The state reports `brain` (its folder, or null), `parts` (the seven parts in their order, `preflight`, `computer`, `container`, `tools`, `knowledge`, `executive`, `life`, each with its `state`), `part` (the part in progress), `next` (the step or block to do now, or `preflight` while no brain is active here), `steps` and `session.blocks`. A step is `done`, `todo`, `declined`, `later` (postponed by the person) or `na` (it does not apply); a block can also be `later`, `never` or `running`. Each block of the knowledge carries its `progress`: `total` (what was counted, null while nothing counted it), `done`, `left`, `notes` (the notes it added to the brain, null where that is not measured) and `unit`. The state is read from what is really there on this computer, and only what the person declined or agreed to is kept beside it: trust it over your memory of an earlier conversation. (`phase` is still given, for older readers: ignore it.)

**A setup from before version 0.4** (the plugin had another name then) is carried over by itself: its settings folder and the brain's own file are renamed the first time a script runs. One thing remains: if `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json` answers `"rearm": true`, the evening save was armed under the old name and its launcher has moved: arm it again at the same time (`routines.mjs arm --time <its time>`), which removes the old task. Say it in one sentence.

**Where the start is shown.** Before the brain exists, and as long as its live view is not open, show them the page of the start, once in each run of this skill:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" page --open
```

Say in one sentence that it opened in their browser, that it follows the start by itself, and that they can keep it beside the chat. **Once the live view is open** (part 2), do not open this page any more: the view shows the same building in a panel of its own, "Building the brain", at its top right.

Then, **before each step and each block**, write what you are about to do, in one line and in their language: `start.mjs page --doing "<the line>"` (without `--open`). It feeds the page and the view's panel alike, and it is written before the work, not after: a session that ends without warning (the limit of their Claude plan, a closed window) then leaves there, and in the state, what was being done.

**Taken up where it was left.** The state also carries `paused` (a pause they asked for, with their words) and `doing` (the last line written). On arriving: with a `paused`, say when they stopped and what they said, and ask whether to go on from there; with a `doing` whose step or block is still to do, the last session ended in the middle of it: say so in one sentence and take that step up again, reading the facts first (a skill never redoes what is done).

Then, by what the state says:

- **No brain active here** (`brain` is null, `next` is `preflight`): the welcome below, the method, then part 0.
- **A brain, and something left to do**: say in two or three lines where they are (where the brain lives, which part, the parts as a short checklist), then go on from `next`. Never redo a step unasked.
- **Everything is done** (`next` is null and `underway` false): say so in one sentence and offer `/brain:status`.

The welcome, for someone who arrives:

> **Welcome to Hypervibe Brain.**
>
> You are going to build your **second brain**: your ideas, your projects, the people who matter to you, what you have written and decided, as linked notes that Claude can consult in every conversation, and where it knows how to write properly.

## Part 0 - Is there a brain already?

A person who already has a brain must never end up with a second, empty one beside it. Before anything is created, look (it reads only, and asks GitHub one question when the GitHub CLI is connected; nothing is cloned):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" preflight
```

It answers `verdict` and `hand` (whom to hand over to), with what it found: `active` (the brain of this computer), `local` (folders of this computer that hold a brain: the personal folder and its sub-folders, `~/dev`, `C:/DEV`), `github` (`looked`, and `brains`: their repositories that hold a brain, `here: true` when a folder of this computer already holds that copy), `missing` (the settings name a brain folder that is not there any more).

| `verdict` | What it means | What to do |
|---|---|---|
| `active` | the brain of this computer | take it up where it stands (the state above) |
| `local` | a brain in a folder of this computer, not active | say where it is and its name; on their yes, `node "${CLAUDE_SKILL_DIR}/../../scripts/adopt.mjs" --dir "<its folder>"` (several: ask which one), then read the state again and go on from it |
| `github` | a brain on their GitHub, none here | it is the same brain, on a second computer: say the repository's name, and invoke `/brain:add-second-computer` (this computer is the other one, its second step). Never create a brain beside it |
| `none` | nothing found | ask once whether they keep a brain elsewhere anyway (below), then part 1 |

With `missing`, say the folder the settings name: if they know where the brain went, `adopt.mjs --dir` on its new place; otherwise go on as for `none`.

When nothing was found, or GitHub could not be asked (`github.why` is `not-installed` or `not-connected`: say so in one line), ask once: "Do you already have a brain, on another computer or as a cold copy kept on a drive?" A cold copy is restored, never rebuilt: `git clone "<the file>" "<a new folder>"`, then `adopt.mjs --dir "<the new folder>"` (as `/brain:add-backup` says). A brain on another computer that has no online copy yet: set that computer up first (`/brain:add-backup`, then `/brain:add-second-computer` from there). Otherwise, part 1.

## Part 1 - The computer

The audit says it: when `ready` is false, invoke `/brain:_computer`; when it is true, say so in one line and go on.

**Before part 2, can Claude reach the brain's server?** Call the `brain_stats` tool of the brain MCP server. An answer, even "no brain yet", means yes. If the tool is missing or fails, invoke `/brain:_computer`, which knows the cure. Do not hand over to the creation before this answers: a brain Claude cannot read is only a folder.

## Part 2 - The brain itself

| `next` | What it is, in the person's words | Hand over to |
|---|---|---|
| `brain` | the brain itself: what it is for, where it lives, its domains, its types, its first notes | invoke `/brain:create`, saying that `/brain:start` calls it for its first two steps |
| `view` | watching the brain fill, in a window of its own | invoke `/brain:live` (turn it on, then open it), then record what they chose (below) |

- **Where the brain lives is the person's choice**, asked by `/brain:create` as a real question. Once the brain exists, show the place back in full, as the state gives it (`brain`): "your brain lives in `<folder>`". It can be moved later without losing anything (`node "${CLAUDE_SKILL_DIR}/../../scripts/move.mjs" --to "<folder>"`).
- `/brain:create`, called by the start, does its decisions and the creation with the first notes, then hands back: the tools, the knowledge and the rest come in the start's own order. It turns the live view on and opens it right after the creation: the state then reads `view` as done by itself (the view starts with the session). If they do not want it: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark view declined`; if it is open without starting with the session, `mark view done`.
- **The live view opens here, once.** Tell them to keep its window beside the chat: it follows the rest of the start by itself, and you will not open it again at each part. Its panel "Building the brain" shows the parts, and for the knowledge each block with its total, what is in, what is left and the notes it added. They can fold it, or hide it until the next start. It shows only while the start is really going on (something done in it in the last seven days, or a brain created less than fourteen days ago), and leaves by itself when the start is finished.
- Then one sentence on what just appeared in the view: the bubbles of their domains, where each note will go.

## Part 3 - The tools

What will feed the brain, set up before any knowledge comes in, so that they always know where what it knows comes from.

| `next` | What it is, in the person's words | Hand over to |
|---|---|---|
| `sources` | what feeds it every week: mail and calendar, folders, the work with Claude, their own sources | invoke `/brain:sources` |
| `live` | reading their conversations and documents the same day, by a Claude in the background | invoke `/brain:_live-sources` |
| `token` | the access that lets this background Claude work without them, kept in a file of this computer (not in a vault, which closes itself after a few hours and would stop the reading with it) | invoke `/brain:_judge-token` |
| `cap` | how much of their Claude plan the background reading may use in a day | invoke `/brain:_limits` (the standard readers come with a cap of their own, and the step is then done: say it in one line, and invoke `/brain:_limits` only if they want another figure; `uncapped` names a reader without one, which reads with no cap) |

- After each hand-over, **read the state again** before going on: a skill often settles more than its own step.
- `/brain:sources` records their choices. When they chose no source that runs by itself (only their writings, listed for the knowledge), the state may still show `sources` to do: `start.mjs mark sources done` (`mark sources declined` if they want none at all).
- **`token` and `cap` only exist with the live reading**: without it they are `na`, and you say nothing of them. The token can wait: a person who cannot create it now has it postponed by `/brain:_judge-token` (`start.mjs mark token later`, the readers paused meanwhile), and the start goes on. A step kept for `later` never holds the start back: the state brings it back by itself (`next`) once nothing else is left to do. When it shows `token` as `later`, say in one line that the reading during the day waits for it, and do not press at every step.
- **The keys of their own sources stay in their vault, if they have one.** A source that needs a key waits while the vault is closed and runs by itself once it is open: it is a wait, not a breakdown, and the live view shows a small key beside a source that waits. Only the background Claude's token lives outside the vault.
- Then one sentence on what appeared in the view: the ring of the tools around their brain, each source that feeds it with what it is doing.

## Part 4 - The knowledge

Their brain is set up and nearly empty. This part fills it with what already exists: their writings, what Claude already remembers of them, their recent conversations with Claude, the documents of their watched folders, the people of their mail.

Invoke `/brain:_catch-up`. **Everything is counted before anything is read**: every element of every block, with an estimate of its cost; the totals are kept, and the view's panel shows them. Then the person chooses, block by block (now, later, never), and the blocks come in one at a time, their writings first, so that their brain holds their own words within the hour.

**Exhaustive, and said in figures.** Each block is followed element by element (`progress` in the state: `total`, `done`, `left`, and `notes`, the notes of the brain that name one of its elements as their source). Say where a block stands with these figures ("62 of 80 are in, 18 left, 140 notes added"), never on an impression; where `notes` is null, the count is not measured: say so rather than guess. A program says that a source is in, never you.

The blocks read in the background (conversations, documents) take days under their cap: they do not hold the start back. While they read (`running`), go on to part 5; the state brings them back at the end. When the state shows `resting` (nothing left to decide in the knowledge, something kept for later), say what waits in one line and ask whether now is the time.

After each block, one sentence on the view: the notes arrive on the map as they are written, in the bubbles of their domains.

## Part 5 - The executive floor

What their AI knows how to do: their own skills and the guards (hooks) that frame them, kept in the brain next to what it knows.

| `next` | What it is, in the person's words | Hand over to |
|---|---|---|
| `executive` | their skills and guards left in Claude Code's own folders, brought into the brain, where Claude still finds them | invoke `/brain:executive` |

The step is read from the facts: to do while skills or hooks are left in Claude Code's folders (or a piece of the floor is not in place on this computer), done when nothing is left, `na` when there is nothing at all (say nothing of it then). A person who brings in some and leaves the rest where it is has settled it: `start.mjs mark executive done` (`mark executive later` to decide another day). Then one sentence on the view: the crown of the harnesses (the Executive view), their skills beside the plugins.

## Part 6 - The life of the brain

| `next` | What it is, in the person's words | Hand over to |
|---|---|---|
| `alert` | being told the same day when something goes wrong | invoke `/brain:_alert-channel` |
| `routines` | the evening save, the weekly review (and the background program, when the live reading is on) | invoke `/brain:add-routines` |

Then, when the state's `brain` step says `built: false`, the creation has its last two steps left (Claude reads the brain in every conversation; the modules: an online copy, the search by meaning, a map): invoke `/brain:create`, saying that the start has already settled the sources, the live reading and the routines. Then one sentence on the view: each tool of the ring now shows when it runs next.

## A step they do not want

A step the person does not want is theirs to decline, after one sentence on what they do without. The skill of that step records it; for the live view, you do (`mark view declined`). A declined step is not asked again; `mark <step> todo` brings it back the day they change their mind.

## A second computer

When the state answers `runner: false` (with `runs`, the name of the computer that runs this brain; `computers.mjs state` says the same as `isRunner: false`), the start is a short one: the live reading's token and cap, the background program, the blocks a judge reads and the directory belong to the computer that runs the brain, and show here as `na`. Say in one line that they are settled on the other computer, and offer only what this one needs: the computer made ready, the live view, the executive floor put back in place on this computer (`/brain:executive`), and the evening save (`/brain:add-routines`, the evening save only). `/brain:add-second-computer` says the rest.

## End

Whenever you stop, three lines: what is in place, what comes next, and that `/brain:start` picks up from there. When it is the person who stops (they have to leave, their plan is nearly used up for the day), keep their words: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" pause --note "<where they stop, in their words>"`. The page and the view's panel then say the start is paused, and the next run begins from it. When every part is done, the panel leaves the view by itself; end with the reflex to keep: whenever they say "note this", "keep this idea", it is `/brain:capture`; and `/brain:status` tells them where their brain stands at any time.
