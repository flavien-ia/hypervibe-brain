# {{NAME}}'s second brain

This folder is {{NAME}}'s second brain. The notes in `vault/` are **the only source of truth**; everything else (the index, the vectors) is rebuilt from them.

It is run by the **Hypervibe Brain** plugin for Claude Code: the code lives in the plugin, this folder only holds data. Read before any decision: [`BRAIN.md`](BRAIN.md) (why this brain exists, its domains, its rules) and [`SOURCES.md`](SOURCES.md) (what goes in, what never does).

## Asking

Through the MCP tools of the plugin (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`, `brain_fetch` for the data a note points to, `brain_contact` for the contacts directory), which rebuild the index by themselves when a note has moved. Never load the whole vault into context: it is meant to be searched.

## Writing

- **The writing rules**: [`WRITING_RULES.md`](WRITING_RULES.md), one page, to read before any writing.
- **A new note** goes through the `/brain:capture` skill: it searches first, classifies, validates and commits. Never a file written by hand.
- **Changing an existing note** only with {{NAME}}'s agreement, in front of them, through the plugin's tools (`rewrite.mjs` for its text or its title, `promote.mjs` to validate it), which set `updated` to today and keep the change in the journal, where it can be undone.
- `/brain:status` tells where the brain stands; the evening routine saves what is at rest.

## The rules that do not bend

1. **The machine creates; on a validated note it only adds.** What it writes enters as `seed` with a `source`; {{NAME}} keeps a veto. On a `trusted` note it never rewrites {{NAME}}'s text: it may only add a fact that says where it comes from, and keep its own machine zones up to date. On a validated concept or idea, or a validated note of nature decision or lesson, which is {{NAME}}'s thinking, it adds nothing: it proposes the change in the weekly letter. A `seed` becomes `trusted` when it has taken root (weekly review) or when {{NAME}} validates it: in the live view (`/brain:live`), the "Validate" button on a note the machine wrote, or by telling Claude which note is right. Never on the machine's own judgment.
2. **Quote a `seed` with care, and say so; a `trusted` note can be quoted as it is.** Follow the `source` before asserting anything important.
3. **Everything in the brain is there to be read by {{NAME}}'s AI.** What must not be read stays out of it: a judge's exclusions, a folder not watched. A `private` note is read like any other; its text is only kept out of what is shared (the cloud copy holds it only if {{NAME}} chose it, the shared map never). `vault/danger-zone/` is not even read.
4. **No secret in a note**: no key, no password, no `.env` content.
5. **One source at a time**: a new source is only ingested once the previous one is checked (`SOURCES.md`).
6. **Git**: never `git add -A` nor `git add .`, never a stash nor `pull --autostash`, never `push --force`. Other sessions may be working in this folder.

## The format of a note

See [`vault/CLAUDE.md`](vault/CLAUDE.md).
