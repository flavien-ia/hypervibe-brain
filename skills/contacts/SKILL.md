---
name: contacts
description: A directory of the people you exchange with by email - who they are, since when, about what - searchable by Claude in every conversation. Only those who matter become notes, by your decision.
---

# /brain:contacts - The people you exchange with

## Communication
- Reply in the person's language. Plain words: "a directory of the people you write to", never "an upsert of email metadata".

## Step 1 - What it is, and what it implies

> Your brain can keep a directory of the people you exchange with by email: who they are, how much you write to each other, since when, about what. Then "who is my accountant?", "who did I talk to at that company?" get an answer in any conversation.
> What it implies: the directory is read from your mail, through the Gmail or Outlook connector of your Claude; it stores names, addresses, dates, numbers of messages and subjects, never the text of an email; it stays on your computer and in your brain's private copies. Only the people who matter become notes, and only with your agreement.

Where things stand: `node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" stats`. Already on: say how many people it holds, then go to Step 4.

On their yes:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" enable
```

## Step 2 - The first fill

It needs the mail connector in this session (Gmail or Outlook tools). Without it: tell them where to connect it in their Claude app (Settings, Connectors), and come back.

The period first: **this month and the three before it**, or the one they chose when the first big session of `/brain:start` called you, up to a year (say first that a longer period takes longer to read). **Say what it will use before anything is read**: no program can count this block and nothing was measured, so say so plainly, with the order of size the connector shows (how many messages they sent over the period, without opening any). The period is decided once, and read **one month after the other, the most recent first**, so that nothing is counted twice and nothing is forgotten:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" months --back 3
```

`--back 3` is this month and the three before it (four months in all). It answers the months of the period, which are in, and the `next` one. For each month, from the sent messages first (the people they write to are the ones that count): for each person, their address, name, how many messages were sent to them and received from them over the period, the first and last dates, and a few subjects. Never the text of the messages. Leave out newsletters, notifications, automatic senders, and mass mailings.

Write the month in, one JSON line per person, with the counts of that month alone:

```bash
printf '%s\n' '{"address":"...","name":"...","sent":4,"received":3,"first":"2026-07-02","last":"2026-09-28","subjects":["..."]}' ... | node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" upsert --month 2026-09
```

The answer says what is left (`fill.left`, `fill.next`): go on with the next month until `left` is 0. A month is read whole: every message they sent in it, page after page of the connector's results, not the first page. A month already in is refused, which is what keeps a second reading from doubling the counts. If they stop before the end, say which months are in and which wait: `contacts.mjs months` keeps it, and the next session starts at `next`.

For the people they exchange the most with, add what the mail tells of them in one line (`"summary": "their accountant"`), and a few `themes`. Nothing private (health, money, family) unless the person wants it.

## Step 3 - Who deserves a note

The directory sorts people in three tiers: the core, those who matter (exchanges in both directions), and the rest (data only). The thresholds are the brain's own: `contacts.mjs enable --core <n> --matters <n>` changes them. A source of the person's own (a CRM, a harvest with rules of its own) may also place people: its definition says `"setsTier": true`, it gives a `tier` per contact, and that tier is a floor the counts can raise but never lower (0 removes it).

Show the person the core and the first of those who matter, and ask which ones deserve a note. `stats` only counts each tier (`byTier`); the people themselves are listed by tier (2 is the core, 1 those who matter):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" list --tier 2
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" list --tier 1
```

Never open the directory's file yourself to find them. For each yes:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" promote <address> --domains <domain>
```

The note is written in the brain's type for people; the address stays in its source, never in its text.

## Step 4 - Afterwards

- **Every week**, the weekly review adds the week's exchanges (if the mail source is on), and proposes a note for anyone who rose to the core without one.
- **In any conversation**, Claude answers "who is...", "who works at..." with the `brain_contact` tool.
- A person to leave out for good (a colleague's personal address, a family member): add it to `contacts.exclude` in `brain.json`; it will never enter again.

## End

Two lines: how many people the directory holds, how many became notes.
