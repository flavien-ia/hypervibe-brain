---
name: _exclude
description: Internal - records what a judge of the second brain must never read (a client, a project, a folder, a kind of file), from the person's own sentence. Called by /brain:sources and /brain:_live-sources when the person says "never read this". Not meant to be invoked directly by users.
user-invocable: false
---

# Never read this

## Communication
- Reply in the person's language. Say what will no longer be read, in their words, never the pattern's syntax unless they ask.

## What to do

The person says, in a sentence, that something is not for the judges: a client's work under a confidentiality clause, an archive, a kind of file, one of their projects. Turn the sentence into a pattern, and say it back in their words before recording it.

- **A name** (no slash): every folder or file of that name, wherever it is, with `*` for any run of characters: `0. OLD`, `client-*`, `*.xlsx`. For a conversation, the names are the folders on the way to the project it was held in.
- **A path or an address** (with a slash): that folder and everything under it, `C:/Work/Secret/` or `dropbox://Clients/X/`.

An exclusion belongs to one judge: `conversations`, `documents`, or one of their own. A client's name usually goes to both; ask when the sentence does not say. First look at what it takes off the pile, without changing anything:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" exclude <judge> add "<pattern>" --dry
```

`items` lists what waits and would be left unread. Tell them which ones, then record it with the same command without `--dry`. From then on nothing that matches reaches the judge. `exclude <judge> list` shows the patterns, `exclude <judge> remove "<pattern>"` takes one back: only what is new from then on comes in.

Two things to say plainly. What a judge already read stays in the brain: offer to look together at what came from there and to undo it. And an exclusion stops the judges only: the weekly review still names the files that moved in a watched folder and the projects they worked on, never their content. To keep a folder out of that too, stop watching it (`components.mjs watch remove "<folder>"`).

## End

One line: what is no longer read, by which judge, and how many waiting items left its pile.
