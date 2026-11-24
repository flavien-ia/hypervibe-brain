---
name: _writings
description: Internal - lists with a person what they have already written (notes, articles, documents), orders it by interest, writes it as the checklist of their second brain's SOURCES.md, then brings the first one in. Called by /brain:sources and /brain:_catch-up. Not meant to be invoked directly by users.
user-invocable: false
---

# The writings

What the person has already written is the fastest way to a brain that sounds like them: it comes in once, one source at a time.

## Communication
- Reply in the person's language. The checklist is written in the brain's language.

## Where things stand

Read `SOURCES.md` in the brain's folder (`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json` gives the folder, and how many sources are listed and ticked: `sourcesPlanned`, `sourcesDone`). Say what is listed and what is already in.

## List them

Ask what they have already written and where, order it by interest with them, and write it in `SOURCES.md` as a checklist (`- [ ] <source>: <where>`), in the brain's language. When a source is a folder or a file of this computer, write its full path after the colon: the first big session can then count what it holds before anything is read. Anything they do not want in the brain goes under the file's "never goes in" heading instead. The checklist takes the place of the sentence that says nothing is listed yet. In a brain created by an earlier version of the plugin the file may still show `{{SOURCES}}` or `{{EXCLUSIONS}}`: put the checklist in place of the first and remove the second (with what must never go in, if they named something). No `{{...}}` stays in a document the person reads.

## Bring the first one in

A writing begun and not ended comes first: `node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" state` lists the ledgers still open, with how many items each still holds. Take that one up again before opening another.

Otherwise, propose to bring in the first one now. **Its cost is said before anything is read**, here as in the first big session:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" count
```

`blocks.writings.list` gives each listed writing with its number of `files` and an `estimate` in tokens of their Claude plan (null when the line names something that cannot be counted from here: a website, an app; say so). Say both figures for the first one, as an estimate, and let them choose: now, or later. On their yes, invoke `/brain:ingest`. It takes one source at a time, lists and counts every item of it in a ledger, writes three trial notes first, goes on until the ledger is empty, and ticks the source in `SOURCES.md` when the ledger has closed it. The next one starts only then; a large source takes several sessions, and its ledger keeps where it stands, item by item.

If they keep it for later, say that `/brain:ingest` takes the next unticked source whenever they want.

## End

One line: how many writings are listed, how many are in, which one is next. Then hand back to the skill that called you.
