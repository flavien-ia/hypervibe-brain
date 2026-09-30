---
name: brain
description: Capture a thought, a decision or a fact into your second brain, classified right away. When you say "note this in my brain", "remember this idea", or /brain followed by the thought.
---

# /brain - Capture into the second brain

You write **one new note** into the person's brain, classified. Works from any folder.

## Communication
- Reply in the person's language (from the conversation; the OS locale if nothing else). The note itself is written in the language the person used.
- One line of confirmation at the end, nothing more.

## 0. Is there a brain?

If the `brain_stats` tool of the hyperbrain MCP server answers that no brain is set up, say so and offer `/hyperbrain:create-brain`. Stop.

## 1. Word it, faithfully

One to three sentences saying what the person just thought. You rephrase for clarity, never to embellish: it is their thought, not yours. A phrase that belongs to them is kept word for word. Invoked with no argument after an exchange: capture what was just said, and say so.

**Never capture**: a secret (key, password, `.env` content), even rephrased; the body of an email (at most a summary); a task or a reminder (the brain keeps what one wants to find again in six months).

## 2. Search what exists, always

With `brain_search` (by words, then `meaning: true` if the words may differ).

- A note already covers exactly this: **create nothing**, offer to enrich it. The person decides; if they agree, edit the file in front of them and set `updated` to today.
- Neighbouring notes exist: they become the links of the new one (two or three good ones, not eight approximate ones).
- Nothing exists: create.

## 3. Classify

- `--type`: one of **this brain's own types**, listed by `brain_stats` (`types`) and described in the brain's `vault/CLAUDE.md`. Its intuitions and hypotheses go to its type for ideas, facts and decisions to its type for notes. When in doubt: the notes type. A kind of thing that fits no type: capture it in the closest one and propose a new type to the person (`types.mjs add`), never invent one in the command.
- `--domains`: one or two of the brain's domains (`brain_stats` lists them in `byDomain`). Nothing else: the script refuses.
- `--status`: `seed` if you worded it; `trusted` only if the person just validated the text word for word. (A French brain writes them `graine` and `fiable`: both spellings are understood.)
- `--visibility private` if the person asks: the content will never be shown to an AI again.

## 4. Write

```bash
printf '%s' "<the body>" | node "${CLAUDE_SKILL_DIR}/../../scripts/capture.mjs" --title "<short, telling title>" --type <type> --domains <domain> --links <slug-a>,<slug-b> --source "<where it comes from>"
```

The script refuses a name already taken, an unknown domain, a link to a note that does not exist. It commits the note (and pushes it if the person allowed it). You commit nothing yourself.

## 5. Confirm in one line

> Captured in `ideas/`, domain work, linked to [[slug-a]] and [[slug-b]].

If the person corrects the classification, apply it right away by editing the file.
