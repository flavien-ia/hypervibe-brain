---
name: capture
description: Capture a thought, a decision or a fact into your second brain, classified right away. When you say "note this in my brain", "remember this idea", or /brain:capture followed by the thought.
---

# /brain:capture - Capture into the second brain

You write **one new note** into the person's brain, classified. Works from any folder.

## Communication
- Reply in the person's language (from the conversation; the OS locale if nothing else). The note itself is written in the language the person used.
- One line of confirmation at the end, nothing more.

## 0. Is there a brain?

If the `brain_stats` tool of the brain MCP server answers that no brain is set up, say so and offer `/brain:create`. Stop.

## 1. Word it, faithfully

One to three sentences saying what the person just thought. You rephrase for clarity, never to embellish: it is their thought, not yours. A phrase that belongs to them is kept word for word. Invoked with no argument after an exchange: capture what was just said, and say so.

**Never capture**: a secret (key, password, `.env` content), even rephrased; the body of an email (at most a summary); a task or a reminder (the brain keeps what one wants to find again in six months).

## 2. Search what exists, always

With `brain_search` as it is: its default mixes words and meaning, and finds a name as well as an idea (`meaning: true` alone misses names). For a rule or a pitfall, also with `nature: "lesson"`.

- A note already covers exactly this: **create nothing**, offer to enrich it. The person decides; if they agree, write the enriched body in front of them with `node "${CLAUDE_SKILL_DIR}/../../scripts/rewrite.mjs" --note <slug> --file <the new body> --why "<what they agreed>"` (it sets `updated` to today and keeps the change in the brain's journal; never a plain file write).
- Neighbouring notes exist: they become the links of the new one (two or three good ones, not eight approximate ones).
- Nothing exists: create.

**The brain's rule** (say it when it matters): the machine creates notes; on a validated note it never rewrites the person's text: it may only add a fact that says where it comes from, and keep its own machine zones up to date. On a validated concept or idea, or a validated note of nature decision or lesson, which is the person's thinking, it adds nothing: it proposes the change in the weekly letter. Enriching a note here is done on the person's word, never on yours.

## 3. Classify

- `--type`: one of **this brain's own types**, listed by `brain_stats` (`types`) and described in the brain's `vault/CLAUDE.md`. Its intuitions and hypotheses go to its type for ideas, facts and decisions to its type for notes. When in doubt: the notes type. A kind of thing that fits no type: capture it in the closest one and propose a new type to the person (`types.mjs add`), never invent one in the command.
- **First read the brain's writing rules**: `WRITING_RULES.md` at the brain's root, one page. They prevail over this procedure, which does not copy them (one decision = its own note, routing to where the data lives, links that say why...).
- `--domains`: one or two of the brain's domains (`brain_stats` lists them in `byDomain`). Nothing else: the script refuses.
- `--status`: `seed` if you worded it; `trusted` only if the person just validated the text word for word. (A French brain writes them `graine` and `fiable`: both spellings are understood.)
- `--visibility private` if the person asks: the note is read by their AI like any other; it is only kept out of what is shared (its text goes to the cloud copy only if they chose it with `/brain:add-cloud`, and never into the shared map). Something their AI must not read does not go in the brain at all: say so.

## 4. Write

```bash
printf '%s' "<the body>" | node "${CLAUDE_SKILL_DIR}/../../scripts/capture.mjs" --title "<short, telling title>" --type <type> --domains <domain> --links <slug-a>,<slug-b> --source "<where it comes from>"
```

The script refuses a name already taken, an unknown domain, a link to a note that does not exist. It commits the note (and pushes it if the person allowed it). You commit nothing yourself.

## 5. Confirm in one line

> Captured in `ideas/`, domain work, linked to [[slug-a]] and [[slug-b]].

If the person corrects the classification, apply it right away by editing the file.

A note captured as a seed stays one until it is validated. Three ways, and none of them is your own judgment: the person reads it and says it is right (`node "${CLAUDE_SKILL_DIR}/../../scripts/promote.mjs" --note <slug>`), they validate it themselves in the live view (`/brain:live`: the "Validate" button on a note the machine wrote, the "Seeds" filter, "Next seed"), or the weekly review finds it has taken root. Say it once, the first time you capture a seed for them, not at every capture.
