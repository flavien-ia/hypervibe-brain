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

- `domains`: one or two domains, **taken from the list in `hyperbrain.json`**. Never empty: a blocking error.
- `status`: `seed` (written by a machine, not validated yet), `trusted` (validated), `archived` (closed).
- `visibility`: `public`, `internal` (the default), `private` (the content is never shown to an AI).
- `created`, `updated`: dates `YYYY-MM-DD`.
- `source`: where the content comes from. A file path, a web address, `claude://chat/2026-09-30`... Always fill it: it is what allows checking.

Other fields may be added as the brain needs them (a date of event, a web address...): they are kept as they are.

## What is not a note

A task, a reminder, a passing state. The question to ask before writing: **will we want to find this again in six months?**
