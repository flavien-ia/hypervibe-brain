---
name: ingest
description: Bring one of your existing sources into your second brain (a notes folder, your articles or posts, documents, Claude's memory), with trial notes first, a count of every item, and a check at the end.
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

Then **open the source's ledger**: every item is listed once, and the source is in when none is left. It is what keeps a long source from being called done at a third of the way.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" open <name> --from "<the folder or the file>" [--since YYYY-MM-DD]
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" open <name> --list "<a file with one item per line>"
```

`--from` lists the writings of a folder of this computer (text, Word, PDF, slides, web pages). `--list` is for what no folder holds (the articles of a website, the posts of an account): write their addresses or titles in a file, one per line, first. The answer says how many items were `counted`. A ledger that exists is taken up again as it stands (`resumed`): nothing is counted twice, and what the folder gained since is added.

**Say what reading it will use before the batch**, unless the skill that called you already did: the order is the number of items times about 150,000 tokens of their Claude plan (the size of one item read, measured on a real brain; `start.mjs count` gives this estimate for a source listed in `SOURCES.md`). An estimate, said as one. They may then take the whole source, a part of it, or keep it for later.

## 2. Three trial notes

Write three notes from three different items, with `--no-commit`, and show them. This is where format, length, tone, type and domain get settled, not after a hundred notes. Adjust with the person until they say "that's it". Then commit them with the others (the next save takes them).

## 3. The batch, until the ledger is empty

Take the items ten at a time, and go on until `left` is 0:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" next <name> --n 10
```

**Every item of the ledger ends in one of two ways, and only these:**

- **a note**: written with `--source` set to the item's `ref`, exactly as the ledger gives it. The ledger then finds the note by itself. When the item enriched a note that already existed instead, say which: `ledger.mjs done <name> <n> --note <slug>`.
- **set aside, with its reason**: `ledger.mjs skip <name> <n> --why "a shopping list"`. A reason is a rule the person agreed to in step 1 or just now ("shopping lists", "drafts of a text already in"), in the same words each time, so that they can be counted. "Too long", "not interesting" and "later" are not reasons: a long item is read in several goes, and what counts was agreed with the person.

Never stop because the source is long. Stop when the person says so, or when `left` is 0. If you must stop in the middle (the conversation gets long, the day ends), say the figures as they are: the ledger keeps them, and the next session starts at `next`.

For each item worth a note:

1. **Search first** (`brain_search`, by words then by meaning): a note already covering it is enriched only with the person's agreement, never duplicated. For a large batch, ask once for a general rule ("when a note exists, add a sentence and the source") rather than every time.
2. **Write with the capture script**, as `seed` (you wrote it, the person did not validate it word for word), with a `--source` pointing to the original (file path, web address):

```bash
printf '%s' "<the body>" | node "${CLAUDE_SKILL_DIR}/../../scripts/capture.mjs" --title "<title>" --type <type> --domains <domain> [--links <slugs>] --source "<the original>" --no-commit
```

3. Every twenty to fifty notes, save (`node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs" --now`), and tell the person where things stand in one line, from the ledger: "40 of 120 in, 6 set aside, 74 left".

What a note holds, by kind of source:

- **Their own writings** (articles, posts, notes): one note per published text, in the brain's type for publications, with the text or its core; their notes become ideas or notes, rephrased faithfully.
- **Other people's works** (books, articles read): one note per work, in the brain's type for sources or readings, with what the person keeps from it, never the text copied.
- **A kind of thing the brain has no type for** (the source brings talks, and there is no type for them): propose the new type to the person before the batch (`node "${CLAUDE_SKILL_DIR}/../../scripts/types.mjs" add <type> <folder>`), never squeeze a whole source into a wrong type.
- **Emails or messages**: never the body, at most a rephrased summary, and only if the person wants it.
- **Secrets**: never, even rephrased.

A large source takes several sessions: when stopping, save. The ledger holds where things stand, item by item; write the figures under the source's line in `SOURCES.md` too ("62 of 80 in"), for the person who reads that file.

## 4. The check

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/lint.mjs"
node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs"
```

No error allowed. Then draw five notes at random from the batch and read them with the person. A systematic flaw (wrong type, domain too broad) is fixed on the whole batch, with their agreement.

## 5. Close

The ledger closes the source, not you:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/ledger.mjs" close <name>
```

- **It refuses while items are left**, and says how many: go on with `next`. Only if the person decides to stop there: `close <name> --leave "<their words>"`, which keeps the number left unread with what they said.
- **It refuses while what was set aside has not been shown**: tell the person how many items were set aside for each reason (`reasons`), let them take some back if they wish, then `close <name> --agreed`.

Only when it answers `ok`, tick the source in `SOURCES.md` (`- [x]`), then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/save.mjs" --now
```

Two lines to end, with the ledger's figures: how many items were counted, how many notes, how many set aside and why, how many left if any. Then which source is next.
