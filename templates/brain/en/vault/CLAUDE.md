# The format of a note

One note = one markdown file, one subject. Its file name (the **slug**) is lowercase words joined by dashes, unique across the whole vault.

```markdown
---
type: idea
title: "A short, telling title"
domains: [work, writing]
status: seed
visibility: internal
created: 2026-09-30
updated: 2026-09-30
source: "where what is written here comes from"
---

The body, a few sentences or a few pages. Links to other notes
are written [[slug-of-the-other-note]].
```

## The types of this brain, and their folder

Chosen with {{NAME}} at the creation. The folder **is** the type: a note of a type lives in its folder, and nowhere else. A type is added by asking Claude.

{{TYPES}}

## The fields

- `domains`: one or two domains, **taken from the list in `brain.json`**. Never empty: a blocking error.
- `status`: `seed` (written by a machine, not validated yet), `trusted` (validated), `archived` (closed). A seed becomes trusted when {{NAME}} validates it (the "Validate" button on the note in the live view, or a word to Claude) or when the weekly review finds it has taken root.
- `visibility`: `public`, `internal` (the default), `private` (read by the AI like any other; its text is only kept out of what is shared: the cloud copy holds it only if {{NAME}} chose it, the shared map never).
- `created`, `updated`: dates `YYYY-MM-DD`.
- `source`: where the content comes from. A file path, a web address, `claude://chat/2026-09-30`... Always fill it: it is what allows checking.

- `nature` (optional, for a note): `decision` (what {{NAME}} settled: a price, a rule, a choice, a renunciation), `feedback` (what a client or a reader said of their work), `lesson` (something learned not to repeat, including a working rule given to the AI). The list lives in `brain.json` (`natures`). A note without a nature is a thought or a fact.

**The writing rules live in [`../WRITING_RULES.md`](../WRITING_RULES.md)**, one page to read before any writing: they are copied nowhere else.

Other fields may be added as the brain needs them (a date of event, a web address...): they are kept as they are.

## What is not a note

A task, a reminder, a passing state. The question to ask before writing: **will we want to find this again in six months?**
