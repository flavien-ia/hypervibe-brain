---
name: _mail-calendar
description: Internal - connects a person's mail and calendar to their second brain as a weekly source, through the connectors of their Claude, and tunes it to their taste. Called by /brain:sources when the person chooses the mail and calendar source. Not meant to be invoked directly by users.
user-invocable: false
---

# Mail and calendar

## Communication
- Reply in the person's language. Say what the source brings and what it implies, never how it works inside.

## What it is

Every week, during the weekly review, Claude reads the week's mail and calendar and writes a note for each new person who matters, each meeting worth remembering and each decision taken. Say what it implies before turning it on: it is read through the connectors of their Claude (Gmail, Google Calendar, Outlook); the text of an email is never copied, at most a sentence of summary; newsletters and notifications are ignored.

## The connectors

**Mail and calendar need the connectors**: check whether this session has Gmail / Google Calendar / Outlook tools. If not, tell them where to connect them in their Claude app (Settings, Connectors), and that the source will only start once they are connected.

## Turn it on

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" source mail on
```

`source mail off` stops it.

## Their taste

Look at them together once: read the last week's meetings and ask which kind of meeting deserves a note, so that the weekly review follows their taste. Write what they say in the brain's `BRAIN.md`, in one or two sentences, in their language: the review reads it.

## What goes with it

- **It stays weekly.** Mail and calendar are read through the connectors of their Claude, and the Claude that reads live in the background, sealed on purpose, has no connector.
- **It needs no key.** Mail and calendar come through the connectors of their Claude, so a closed vault never puts this source on hold. A source of their own that reads the mail by itself with a key (a capture address read every evening) is different: with its key in their Hypervibe vault, it waits while the vault is closed and runs by itself once it is open (the live view shows a small key beside it). It is a wait, not a breakdown.
- **It is read by the weekly review.** If the review is not set up, say so and offer `/brain:add-routines`; until then, the source is read when the person says "review my brain".
- **A capture address**: a thought sent by email to an address of theirs becomes a seed. Offer it now; on a yes, invoke `/brain:_own-source`, which defines it with them.
- **The contacts directory** (who they exchange with, searchable in every conversation) is read from the same mail: `/brain:contacts` sets it up.

## End

One line: the source is on (or waits for the connectors), and when it is next read.
