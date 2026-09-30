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

## The nine types, and their folder

The folder **is** the type: an `idea` lives in `vault/ideas/`, and nowhere else.

| type | folder | for |
|---|---|---|
| `idea` | `ideas/` | an intuition, a hypothesis, something to dig into |
| `concept` | `concepts/` | a notion one defines and reuses |
| `note` | `notes/` | a fact, an observation, a decision and its reason |
| `project` | `projects/` | a project, ongoing or finished |
| `person` | `people/` | someone who matters |
| `organization` | `organizations/` | a company, an institution, a group |
| `publication` | `publications/` | something published (article, post, book, video) |
| `event` | `events/` | a talk, a meeting, a dated moment |
| `source` | `sources/` | a work or a reading that feeds the thinking |

## The fields

- `domains`: one or two domains, **taken from the list in `hyperbrain.json`**. Never empty: a blocking error.
- `status`: `seed` (written by a machine, not validated yet), `trusted` (validated), `archived` (closed).
- `visibility`: `public`, `internal` (the default), `private` (the content is never shown to an AI).
- `created`, `updated`: dates `YYYY-MM-DD`.
- `source`: where the content comes from. A file path, a web address, `claude://chat/2026-09-30`... Always fill it: it is what allows checking.

## What is not a note

A task, a reminder, a passing state. The question to ask before writing: **will we want to find this again in six months?**
