---
name: _memory
description: Internal - brings what the person's AI remembers of them into their second brain. Counts the files of Claude Code's own memory, makes a whole backup a program checks, moves them aside, brings each one in as notes that name it as their source (one ledger per lot, several readers side by side), shows what was set aside and what contradicts the brain, then offers to lock the AI's own memory so that what it learns is written in the brain from now on. Called by /brain:_catch-up. Not meant to be invoked directly by users.
user-invocable: false
---

# What their AI remembers of them

Claude Code keeps a memory of its own: files it writes by itself, one folder per working folder, with what it learnt of the person, of their projects, of their decisions and of its own mistakes. None of it is in the brain: another AI plugged into the brain tomorrow would know nothing of it. This skill brings it in, then asks whether the AI should go on keeping a memory beside the brain.

## Communication
- Reply in the person's language. Plain words: "what Claude remembers of you", never "the auto memory".
- Every cost is an **estimate**, said as one.
- Nothing is deleted at any step, and you say so: the files are copied, then moved aside, and one command puts everything back.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/memory.mjs" state
```

`found` (the files still in Claude's memory folders, per working folder), `estimate`, `backedUp` (true when a checked backup holds every one of them as it is now), `ledgers` and `left` (the lots already opened, and how many files they still hold), `lock`. **Take up what is open before anything else**: ledgers with something `left` go straight to "Bring them in".

`elsewhere` in `memory.mjs find` means Claude Code was told to keep its memory in another folder: say so, and bring that folder in as a writing instead (`/brain:ingest`).

## 1. Say what it is and what it costs

One short paragraph, with the figures of `found`: how many files, in how many working folders, and the estimate (about fifteen thousand tokens a file, the order measured on a real memory of 157 files; a file gives two notes on average, a long one many more). It is read here, in this conversation, by Claude and by helpers working side by side. Then their choice: **now, later, never** (`start.mjs mark memory later|never`). Never push.

## 2. The whole backup, before anything moves

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/memory.mjs" backup
```

Every file is copied into this computer's settings, and each copy is read again and compared with its original. Say where the backup is (`folder`) and that it was checked (`verified`). **If it answers `ok: false`, stop here**: nothing was moved, say what it said.

## 3. The files move aside

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/memory.mjs" archive
```

Each file moves to a folder named `memory-archive-<day>` beside its memory folder, a short page takes its place (it says the memory now lives in the brain, and where the old files are), and every file is listed in a ledger: lots of twenty-five files at most (`ledgers`). The command refuses to move a file that no checked backup holds.

## 4. The lock, asked now

While the files come in, Claude would go on writing new ones. Ask, as a real question, before bringing anything in:

> From now on, should Claude write what it learns in your brain, and stop keeping a memory of its own beside it?

Say what the yes does, in their words: Claude's own memory is switched off in its settings (the former setting is kept, to be given back), a guard refuses any write into those folders, and a rule in their global instructions says where to write instead. It can be lifted at any time.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/memory.mjs" lock on
```

A no is theirs: say in one sentence that Claude will then keep two memories, and that `/brain:start` will offer the new files again. The guard only acts in conversations opened after this one.

## 5. Bring them in, one lot after the other

The rules of the work are in `brief.md`, beside this file: read it. A lot is brought in by whoever holds the brief and the lot's name, so **several lots can be read side by side**: hand each lot to a helper (a subagent), with the whole text of `brief.md`, the lot's name and the person's language, and at most eight at once. With one or two lots, do them yourself.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" next <lot> --n 10
```

A file leaves its lot by a fact: a note of the brain names it as its source, a note that already said it all is named (`ledger.mjs done`), or it is set aside with a reason the person will read (`ledger.mjs skip`): the only fair reason is an index whose every line points to a file of the memory. "Too long", "outdated" or "of little interest" are not reasons: an old state of a project is history, written with its date.

**You never say the memory is in. The ledgers do.**

## 6. The closing check

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" state
node "${CLAUDE_SKILL_DIR}/../../scripts/lint.mjs"
```

- Every lot shows `left: 0`. A lot that does not goes back to step 5, with its figure said.
- **What was set aside is shown to the person**, file by file with its reason, before its lot is closed: `ledger.mjs close <lot> --agreed` only after they have seen it.
- **A link to a note that does not exist** (the check names it) is a name a reader guessed: put it right with `rewrite.mjs`, never by hand. A title in two halves, joined by a comma or a colon, is put right with `rewrite.mjs --title`.
- **What the readers reported** is read in full and sorted with the person, never summed up as "all went well":
  - *what contradicts a note of the brain*: the new note follows the file, the old one was not touched. Show each pair, and let them say which is true; correct on their word, with `rewrite.mjs` (a validated note is shown before it is rewritten);
  - *a sentence a reader added of its own* (a reason, a cause the file does not give): take it out;
  - *a secret met in a file*: say in which file, never its value. A secret pasted in an old conversation is theirs to renew;
  - *what is outdated to the point of misleading*: it was written with its date; name it.

## 7. Tell them

A short account, with the figures the ledgers gave: files counted, covered by a note, set aside and why, left; how many notes were written; where the backup and the archives are; whether the lock is on. Then the reflex to keep: what Claude learns is now written with `/brain:capture`, and a search of the brain comes before a task.

Everything written is a seed with its source, and each write can be undone. To put the whole memory back where it was (and lift the lock): `node "${CLAUDE_SKILL_DIR}/../../scripts/memory.mjs" restore`, or `restore --backup` when the archives are gone. The notes already written stay in the brain: they are theirs to keep.

Hand back to the skill that called you.
