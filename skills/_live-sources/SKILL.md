---
name: _live-sources
description: Internal - turns on, pauses or stops the live reading of a second brain, where a Claude in the background reads the person's conversations with Claude and the documents of their watched folders the same day. Says what it costs first, installs it, and makes sure it can run. Called by /brain:start and /brain:sources. Not meant to be invoked directly by users.
user-invocable: false
---

# Reading live

"Work with Claude" and "Watched folders" can be read **during the day** rather than once a week: a Claude that runs in the background (a *judge*) reads each conversation once it has gone quiet, and each document once it has been left alone, and writes what is worth keeping the same day.

## Communication
- Reply in the person's language. Say "a Claude in the background" before you ever say "a judge", and never name a script.
- The cost is said before anything is turned on, with its numbers, and as what it is: usage of their Claude plan.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" install --list
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" state
```

The first says which of the two standard sources are installed (`conversations`, `documents`); the second, for each judge, what waits on its pile and how its last runs went. One that fails (`failures` above 0) is not for this skill: invoke `/brain:_repair-judge`.

## What to say before

Offer it in these words (translated):

> Your brain can also read your work as it happens. A Claude in the background reads each conversation you had with Claude once it is over, and each document you changed in your watched folders, and keeps what will matter later: a decision and its reason, a working rule, a fact about a project. It creates new notes as seeds, and adds dated facts, each with where it comes from, to the notes you already have. It never rewrites your text, and on a concept, an idea, a decision or a lesson you validated, it adds nothing: it proposes the change in the weekly letter.
>
> What it implies: it uses your Claude plan. Measured on a real brain: about 100,000 to 200,000 tokens for each conversation or document it reads, nine tenths of them context read again, and several million tokens on a busy day. Under a subscription nothing is billed for it, but it counts toward your plan's limits, the same ones your own conversations use. So it comes with a cap for the day, which you can move, and before a big catch-up it asks you first. The weekly review tells you what it read, what it wrote and what it cost. You can pause it at any time, tell it what it must never read, and everything it writes can be undone in one sentence.

**Mail and calendar stay weekly**: they are read through the connectors of their Claude, and a background judge, sealed on purpose, has no connector.

If they do not want it: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark live declined`, one sentence on how to turn it on later (`/brain:sources`), and stop here.

## Turn it on

On their yes, one source at a time:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" install conversations
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" install documents
```

Each puts a pair in the brain's `sources/`, in the brain's language: the judge (its instructions, `sources/<name>/instructions.md`, are theirs to adjust with you) and a small program that looks every half hour (at :00 and :30) and hands the judge what has settled. Nothing is ever overwritten: if a source of that name exists, the install refuses. The install is their approval of the pair on this computer (the reader, with its instructions and its tools, and the small program). On another computer each is approved there by the person, in a window you open for them (`node "${CLAUDE_SKILL_DIR}/../../scripts/trust.mjs" window`); and when they adjust the reader's instructions with you, the reader waits until they approve the new ones the same way. The answer's `remains` lists what is still missing; say each in their words and do it with them:

- **The background program is not on** (`hub: false`): `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" hub on`. It starts with their session and runs each source at its rhythm, without any AI of its own; without it the judge never reads. `hub off` stops it.
- **Claude's lasting token is missing** (`token: false`): a Claude that runs with nobody in front of it needs an access that does not end with the session. Invoke `/brain:_judge-token`: the person creates that token themselves, in a window you open for them, and it never passes through the conversation. It is kept in a file of this computer, outside any vault: a vault closes itself after a few hours, and every background reader would stop with it. Until the token is there the judge fails, says so after its second try, and its pile waits: nothing is lost.
- **No folder is watched** (documents only): `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" watch add "<folder>"`, for each folder they name.

## How it behaves

What to tell them, in plain words: the conversations of the last two days are read first (`--days N` at the install to change it, 0 for only from now on; what is older belongs to the first big session of `/brain:start`, which counts it and says its cost first), then each conversation within the hour that follows its last message (it must have been quiet for half an hour), and again if they take it up (only what follows is read); a document within three quarters of an hour of its last change (it must have been left alone for a quarter of an hour), each new version once (Word, PowerPoint, Excel, text, PDF); the judge reads between 7 am and 11 pm, in the same pass that handed it the items, every half hour: all that settled since the pass before is read in one go, which shares its fixed cost.

**Its cap for the day**: each of the two comes with five million tokens a day, about thirty conversations or documents at the measured size. Say it in one sentence: the start reads it as settled. If they want another figure, invoke `/brain:_limits`.

**What it must never read**: ask once whether something should stay out (a client under a confidentiality clause, an archive, a kind of file). On a yes, invoke `/brain:_exclude`.

## Pause, stop, take back

- To pause one: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" pause conversations` (its pile goes on gathering; `resume` starts it again).
- To stop it for good: `sources.mjs disable` for the judge and for its `-watch`.
- To take back something it wrote: each write is numbered in the weekly letter ("undo 3"), and `node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" report` says what the judges did since yesterday.

## A documents source from before PDFs

A documents source installed before PDFs were read opens them once its `source.json` lists `"Read({watch}/**/*.pdf)"` among its `allowedTools` and its `-watch` lists `".pdf"` among its `extensions`: offer to add both. The rule lets the judge read inside the watched folders of this computer, and nowhere else.

## A judge from before the proof of reading

Each item is opened to its last page or handed to the judge again: that promise holds only for a judge whose `source.json` says `"proof": true`. The two standard judges are installed with it; one installed by an earlier version of the plugin has no such line and is believed on its word. Read `sources/conversations/source.json` and `sources/documents/source.json` in the brain's folder: where the line is missing, set it with `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" set <judge> proof on`, provided the judge's `instructions.md` still has it open each item with the plugin's reader (the standard text does). Say it in one sentence: "from now on, a conversation or a document that was not read to its end comes back on the pile". Never add it to a judge of their own: the plugin can only prove a reading where it wrote the instructions.

## End

Two lines: what is read live now, and when the first reading will happen. Then hand back to the skill that called you.
