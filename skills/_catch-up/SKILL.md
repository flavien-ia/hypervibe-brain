---
name: _catch-up
description: Internal - the first big session of a second brain. Counts what already exists (the person's writings, what their AI remembers of them, their recent conversations with Claude, the documents of their watched folders, the people of their mail), gives an estimate of the cost of each block, lets them choose what comes in now, later or never, then brings them in one source at a time, each to its end, with a check a program makes before the next one opens. Can be stopped and resumed. Called by /brain:start. Not meant to be invoked directly by users.
user-invocable: false
---

# The first big session

The knowledge, the fourth part of `/brain:start` (2026-11-23): the brain itself is there, and the tools that feed it. It is nearly empty. This session brings in what already exists, one source at a time. Nothing is read before its cost has been said and agreed, and nothing is said to be in before a program has counted it.

## Communication
- Reply in the person's language. Numbers as a person says them ("about forty conversations", "six million tokens"), never a raw figure of nine digits.
- Every cost here is an **estimate**, and you say so each time you give one.
- The person may stop at any moment. Say it at the beginning, and mean it: what is done stays done, what is not waits.

## One source at a time, to its end

A source is one line of their writings, what their AI remembers of them, their conversations with Claude, the documents of their watched folders, or the people of their mail. Each one goes through the same round, and the next one opens only when the round is closed:

1. its count and its cost, said;
2. their choice: now, later, never, or a part of it;
3. it is brought in;
4. **its closing check**, made by a program;
5. two lines to the person: what came in, what was set aside and why, what is left.

**You never say that a source is in. A program does.** A long source tires a model before it tires the source: twenty notes written, and the folder of eighty feels done. So each kind of source has a count that does not depend on your word:

| Source | What says it is in |
|---|---|
| A writing (a folder, a file, a list) | `ledger.mjs close <name>` answers `ok`: every item has its note, or was set aside with a reason the person has seen |
| What their AI remembers of them | every lot of the memory is closed (`ledger.mjs state`: the ledgers named `memory-...`), and `start.mjs state` shows the block `done`: no file is left in the AI's own memory folders |
| Conversations, documents | `start.mjs state` shows the block `done`: its pile is empty, and each item was opened to its last page (the readers keep the trace; an item not read to the end goes back on the pile by itself, for a judge whose `source.json` says `"proof": true`) |
| The people of their mail | `contacts.mjs months` shows `decided: true` and `left: 0`: a period was chosen, and every month of it is in (`left: 0` with `decided: false` only means no period was ever chosen: nothing was read) |

When a source stops short, say the figures: "62 of 80 are in, 18 are left", never "it is done". Stopping is always allowed, and it is the person who stops: their words go with the number left (`ledger.mjs close <name> --leave "<their words>"`, `start.mjs mark <block> later`). Cutting a source short by yourself, because it is long, is not.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" state
```

`session.blocks` gives each block its state: `todo` (not decided yet), `running` (agreed, being read in the background, with what still waits), `done`, `later`, `never`, or `na` (it has no reader: the live reading of that kind is not on). Go on from there: never count again nor ask again what is `done`, `never` or `running`. A block kept for `later` is offered again only when they come back to it.

What was begun and not ended shows there too: `writings.left` with its `ledgers` (a writing opened, and how many of its items still wait), `contacts.monthsLeft` (the months of their mail not read yet), `memory.left` with its `ledgers` (the files of their AI's memory not brought in yet). **Take up what is open before opening anything new.**

## Count first

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" count --days 30
```

It reads nothing, it counts. **Count every block before any is read**, even the ones they may keep for later: the totals are kept, and from then on `start.mjs state` follows each block element by element (`progress`: `total`, `done`, `left`, `notes`, the notes it added), which the live view's panel shows them. Give the figures of `progress` at each closing check. For each block, `items` and an `estimate` in tokens: the number of items times the size of one item read, about 150,000 tokens (the order measured on a real brain: 100,000 to 200,000 for each conversation or document, nine tenths of them context read again), or the median of this brain's own readings once it has some (`perItem`).

- **`writings`**: the sources listed in `SOURCES.md` and not brought in yet. `list` gives each line with the number of files found when the line names a folder of this computer; `uncounted` says how many lines name something that cannot be counted from here (a website, an app): look at those with the person. No writing listed at all: invoke `/brain:_writings` first, which lists them, then count again.
- **`memory`**: the files Claude keeps of its own accord about them, one folder per working folder (rules it was given, states of projects, lessons). `items` files in `projects` working folders; the estimate is about fifteen thousand tokens a file, the order measured on a real memory. `na` in the state when Claude kept nothing: say nothing of it then.
- **`conversations`**: their settled conversations with Claude of the last thirty days (Claude Code keeps no more) that were not read yet. `--days N` counts a shorter span.
- **`documents`**: the documents of their watched folders changed in the span, not read yet. `--days 365` looks a year back.
- **`contacts`**: the people they exchange with by email. No program can count them: with the mail connector, look at how many messages they sent over the period they want (this month and the three before it, or up to a year), without opening any, and say the order of size. This block has no measured cost: say so plainly. It is read in this conversation, month by month, from the headers of their mail only, never the text.

**The people of their mail are asked for, never assumed.** Before this block, say what it is and what it keeps: a directory of the people they write to, with names, addresses, dates, numbers of messages and subjects, never the text of a mail; it stays on their computer and in their brain's private copies; nobody becomes a note without their yes. Then their choice, as for the others: now, later, never, and over which period. A person who says never loses nothing else.

## Say the cost, block by block

Show one short table, in their words: the block, how many items, the estimate, how long it takes, and what it brings them.

What to say with it:

- These figures are **estimates**. The real cost depends on how long each conversation or document is.
- It is usage of their Claude plan. Under a subscription nothing is billed for it, but it counts toward the plan's limits, the ones their own conversations use.
- **Writings, the AI's memory and contacts** are read here, in this conversation, with them: they see each step and can stop between two.
- **Conversations and documents** are read in the background, by the same Claude that reads live, under its cap for the day. `daysAtCap` says over how many days the cap spreads a block: forty conversations at about six million tokens, under a cap of five million a day, take two days. They may raise the cap for those days, or keep it and let the block take its time.

Then **they choose, for each block: now, later, or never.** Never push. A person who takes only their writings today has a brain that speaks with their words tonight, and that is a good first session.

Record what is not for now:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark <block> later
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark <block> never
```

For conversations and documents, a block can also be cut: "only the twenty latest" is a fair answer when the whole costs too much (`--latest 20` below).

## Bring them in, in this order

Before each source opens, write what begins on the page of the start, in one line and in their language: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" page --doing "<the line>"`. A session cut short then leaves there what was being read.

The order shows a result early: their writings first, so that within the hour their brain holds their own words.

1. **Their writings, one line of `SOURCES.md` after the other.** Invoke `/brain:_writings`, which hands the first unticked one to `/brain:ingest`. It opens the writing's ledger (every item listed and counted), writes three trial notes, then goes through the ledger until nothing is left, and closes it. The next writing opens only when this one is closed. When they have had enough for today, stop: the ledger keeps exactly what is in and what waits. Once every listed writing is ticked and no ledger holds anything, the block is done by itself; if they stop for good with some left, `start.mjs mark writings later`.
   After the first writing, show them: ask the brain a question their own text answers (`brain_search`), and let them see it answer.

2. **What their AI remembers of them.** Invoke `/brain:_memory`. It makes a whole backup first, moves the files aside, brings each one in as notes that name it as their source, lot by lot, and asks whether Claude should from now on write what it learns in the brain. Nothing is deleted, and one command puts everything back.

3. **Their conversations with Claude.** They need the live reading of conversations (`na` otherwise: offer `/brain:_live-sources`, or leave the block). A live reading installed by an earlier version of the plugin may lack the proof of reading: before the first of the two background blocks, see that both judges have it (`/brain:_live-sources`, "A judge from before the proof of reading"). On their agreement, with the number of days they chose:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" catch-up conversations --days <N>
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" catch-up conversations --days <N> --latest <n>
```

   It puts them on the pile of the background Claude and records their agreement with it, so that it does not ask again. The answer says how many are kept (`kept`), the estimate, and `daysAtCap`. If `hub` is false the background program is not on and nothing will be read: `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" hub on`. If `paused` is true, the reading is paused: `sources.mjs resume conversations` when they want it to start. When it was paused because the background Claude's token was postponed (`token` is `later` in the state), the token comes first: `/brain:_judge-token`, then `resume`.

4. **The documents of their watched folders.** The same, with the live reading of documents:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" catch-up documents --days <N> [--latest <n>]
```

5. **The people of their mail**, if they said yes. Invoke `/brain:contacts`, and tell it the period they chose. It needs the mail connector in this session. It reads one month after the other, the most recent first, and the block is done when no month is left.

What to tell them about the two background blocks: the reading happens between 7 am and 11 pm, a few items at a time, and stops each day at its cap. Nothing has to stay open but the computer. Each item is read to its last page or handed over again; one that could not be read after three tries is left aside and named in the report (`unread`), never dropped in silence.

## The closing check of a source

Before the next source opens, and before the end:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" state
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" state
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" report
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" months
```

- **A writing**: its ledger is closed (`closed`), with `left: 0`, or with `leftUnread` and the person's words. A ledger still open is a writing still to finish.
- **What their AI remembers**: every ledger named `memory-...` is closed, and `memory` is `done` in the state. What its readers set aside or found doubtful has been shown to the person (`/brain:_memory` does it).
- **Conversations, documents**: `waiting` at 0 means the pile is read through. While it is not, the block is `running`: say how many wait and when the cap lets them through, and come back to it (`/brain:start` brings them here again). `unread` in the report names what was left aside: tell the person, they may open those themselves.
- **The people of their mail**: `decided` true and `left` at 0. With `decided` false no period was chosen and no month was read: the block is still to do, whatever `left` says.

A check that does not pass is not an obstacle to hide: it is what is left to do, and it is said as such. What it writes enters as seeds and as dated facts with their source, never over their own text, and everything can be undone. `node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" report` says what was read and written since yesterday; the weekly review tells the whole week, with its cost.

## Stop and take up again

- **Stop a background block**: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" pause <conversations|documents>`. Its pile waits. `resume` goes on from where it was. To give up what is left unread: `node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" catch-up <judge> drop`, which leaves it unread for good.
- **Go faster**: raise the cap for these days (`/brain:_limits`), or `node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" now <judge>`, which reads for one cycle past the cap.
- **Come back another day**: `/brain:start` reads the state and brings them back here, to what is left. Nothing done is done twice: a conversation or a document already read is never read again, a writing ticked in `SOURCES.md` is never brought in again.

## End

A short checklist, with the figures the checks gave, not an impression: each source with what was counted, what came in, what was set aside and why, what is left (in, being read with how many still wait, kept for later, never). Then the one thing to expect next: when the background reading will have finished, and that the weekly review will say what it brought. Hand back to `/brain:start`.
