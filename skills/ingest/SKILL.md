---
name: ingest
description: Bring one of your existing sources into your second brain (a notes folder, your articles or posts, documents, Claude's memory), with trial notes first and a check at the end.
---

# /brain:ingest - One source into the brain

You bring **one** source into the person's brain. Never two at a time: the next one starts when this one is ingested and checked.

## Communication
- Reply in the person's language (from the conversation; the OS locale if nothing else). Notes are written in that language, unless the source itself is in another language and the person prefers to keep it.
- Plain language. Show progress as a short checklist, with counts ("40 of 120 documents").

## 0. Which source

Read `SOURCES.md` in the brain's folder (`node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json` gives the folder and the sources ticked). By default, the first unticked source; the person may choose another, or name a new one (then add it to `SOURCES.md` first: **a new source is decided in that file before anything is ingested**).

## 1. The scope, with the person

Which folders, which period, which files to leave aside. Look at the source yourself (list it, count it, open two or three items) and say what you see: "312 notes, 2019 to today, a third are shopping lists". Agree on what counts.

## 2. Three trial notes

Write three notes from three different items, with `--no-commit`, and show them. This is where format, length, tone, type and domain get settled, not after a hundred notes. Adjust with the person until they say "that's it". Then commit them with the others (the next save takes them).

## 3. The batch

For each item worth a note:

1. **Search first** (`brain_search`, by words then by meaning): a note already covering it is enriched only with the person's agreement, never duplicated. For a large batch, ask once for a general rule ("when a note exists, add a sentence and the source") rather than every time.
2. **Write with the capture script**, as `seed` (you wrote it, the person did not validate it word for word), with a `--source` pointing to the original (file path, web address):

```bash
printf '%s' "<the body>" | node "${CLAUDE_SKILL_DIR}/../../scripts/capture.mjs" --title "<title>" --type <type> --domains <domain> [--links <slugs>] --source "<the original>" --no-commit
```

3. Every twenty to fifty notes, save: `node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs" --now`.

What a note holds, by kind of source:

- **Their own writings** (articles, posts, notes): one note per published text, in the brain's type for publications, with the text or its core; their notes become ideas or notes, rephrased faithfully.
- **Other people's works** (books, articles read): one note per work, in the brain's type for sources or readings, with what the person keeps from it, never the text copied.
- **A kind of thing the brain has no type for** (the source brings talks, and there is no type for them): propose the new type to the person before the batch (`node "${CLAUDE_SKILL_DIR}/../../scripts/types.mjs" add <type> <folder>`), never squeeze a whole source into a wrong type.
- **Emails or messages**: never the body, at most a rephrased summary, and only if the person wants it.
- **Secrets**: never, even rephrased.

A large source takes several sessions: when stopping, write under its line in `SOURCES.md` where things stand ("done up to 2022-06"), and save.

## 4. The check

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/lint.mjs"
node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs"
```

No error allowed. Then draw five notes at random from the batch and read them with the person. A systematic flaw (wrong type, domain too broad) is fixed on the whole batch, with their agreement.

## 5. Close

Tick the source in `SOURCES.md` (`- [x]`), then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs" --now
```

One line to end: how many notes, which source is next.
