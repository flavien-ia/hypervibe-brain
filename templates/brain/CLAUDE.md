# {{NAME}}'s second brain

This folder is {{NAME}}'s second brain. The notes in `vault/` are **the only source of truth**; everything else (the index, the vectors) is rebuilt from them.

It is run by the **Hyperbrain** plugin for Claude Code: the code lives in the plugin, this folder only holds data. Read before any decision: [`BRAIN.md`](BRAIN.md) (why this brain exists, its domains, its rules) and [`SOURCES.md`](SOURCES.md) (what goes in, what never does).

## Asking

Through the MCP tools of the plugin (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`), which rebuild the index by themselves when a note has moved. Never load the whole vault into context: it is meant to be searched.

## Writing

- **A new note** goes through the `/hyperbrain:brain` skill: it searches first, classifies, validates and commits. Never a file written by hand.
- **Changing an existing note** only with {{NAME}}'s agreement, in front of them, then setting `updated` to today.
- `/hyperbrain:brain-status` tells where the brain stands; the evening routine saves what is at rest.

## The rules that do not bend

1. **The machine creates, it never modifies a validated note.** What it writes enters as `seed` with a `source`; {{NAME}} keeps a veto. A `seed` becomes `trusted` when it has taken root (weekly review) or when {{NAME}} validates it.
2. **Quote a `seed` with care, and say so; a `trusted` note can be quoted as it is.** Follow the `source` before asserting anything important.
3. **A `private` note is never shown to an AI**: it exists (title, links) but its content never leaves through search or the MCP tools, and it has no vector. `vault/danger-zone/` is not even read.
4. **No secret in a note**: no key, no password, no `.env` content.
5. **One source at a time**: a new source is only ingested once the previous one is checked (`SOURCES.md`).
6. **Git**: never `git add -A` nor `git add .`, never a stash nor `pull --autostash`, never `push --force`. Other sessions may be working in this folder.

## The format of a note

See [`vault/CLAUDE.md`](vault/CLAUDE.md).
