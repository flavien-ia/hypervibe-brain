---
name: _limits
description: Internal - sets how much a second brain's live reading may use of the person's Claude plan in a day, and records their answer when a background Claude waits before a big catch-up (read everything, only the latest, nothing). Called by /brain:start, /brain:sources and /brain:_live-sources. Not meant to be invoked directly by users.
user-invocable: false
---

# The limits of the live reading

## Communication
- Reply in the person's language. Speak of "the Claude that reads in the background" and of "its cap for the day"; give the numbers as a person says them ("five million", "about thirty conversations").

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" state
```

For each judge: `waiting` (what is on its pile), `dailyTokens` and `spentToday` (its cap and what it used today), `capped` (stopped for today), `held` (it waits for the person before a big catch-up, with `items` and `estimate`).

## A cap for the day

What to say, in their words: reading one conversation or one document costs about 100,000 to 200,000 tokens of their Claude plan, nine tenths of them context read again, and a busy day comes to several million. Nothing is billed for it under a subscription, but it counts toward the plan's limits, the ones their own conversations use too. So each judge has a cap: once its runs of the day have used that many tokens (all of them counted), it stops until the next day. Its pile waits, nothing is lost, and the weekly review says it happened.

**Propose the default and say what it means**: five million tokens a day for each judge, about thirty conversations or documents. Enough for an ordinary day, and a day of heavy work is finished the next morning. Lower (two million, about a dozen items) if their plan is small or they often reach its limits; higher or none if they would rather have everything read the same day.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" set <judge> dailyTokens <n>
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" set --all dailyTokens <n>
```

`--all` gives every judge the same cap; 0 means no cap. Their own "now" still runs a capped judge once. When the cap is settled, even at its default, and `/brain:start` is under way: `node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark cap done`.

## A big catch-up waits for them

When more than thirty items wait at once (older conversations brought in, a return from holiday), the judge reads nothing and waits for their answer. `node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" catch-up <judge>` says how many wait and about what reading them would cost (`held`). Put the choice to them in one sentence, with both numbers, and say that the cost is an estimate. Then record their answer:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" catch-up <judge> all
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" catch-up <judge> latest <n>
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" catch-up <judge> drop
```

`latest <n>` keeps the n most recent and leaves the others unread, `drop` leaves them all. What is left unread does not come back; a conversation taken up again later is read from there. A pile agreed in full is read over as many days as its cap allows. The threshold is theirs to move: `sources.mjs set <judge> catchUp <n>` (0: never ask).

## End

One line: the cap of each judge, and what was decided for a pile that waited. Then hand back to the skill that called you.
