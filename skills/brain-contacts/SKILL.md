---
name: brain-contacts
description: A directory of the people you exchange with by email - who they are, since when, about what - searchable by Claude in every conversation. Only those who matter become notes, by your decision.
---

# /brain-contacts - The people you exchange with

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

Read the **last three months** of their mail, from the sent messages first (the people they write to are the ones that count): for each person, their address, name, how many messages were sent to them and received from them over the period, the first and last dates, and a few subjects. Never the text of the messages. Leave out newsletters, notifications, automatic senders, and mass mailings.

Write them in, one JSON line per person:

```bash
printf '%s\n' '{"address":"...","name":"...","sent":4,"received":3,"first":"2026-07-02","last":"2026-09-28","subjects":["..."]}' ... | node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" upsert
```

For the people they exchange the most with, add what the mail tells of them in one line (`"summary": "their accountant, at Easton"`), and a few `themes`. Nothing private (health, money, family) unless the person wants it.

## Step 3 - Who deserves a note

The directory sorts people in three tiers: the core, those who matter (exchanges in both directions), and the rest (data only). The thresholds are the brain's own: `contacts.mjs enable --core <n> --matters <n>` changes them. A source of the person's own (a CRM, a harvest with rules of its own) may also place people: its definition says `"setsTier": true`, it gives a `tier` per contact, and that tier is a floor the counts can raise but never lower (0 removes it).

Show the person the core and the first of those who matter (`contacts.mjs search` by name, or the list from `stats`), and ask which ones deserve a note. For each yes:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" promote <address> --domains <domain>
```

The note is written in the brain's type for people; the address stays in its source, never in its text.

## Step 4 - Afterwards

- **Every week**, the weekly review adds the week's exchanges (if the mail source is on), and proposes a note for anyone who rose to the core without one.
- **In any conversation**, Claude answers "who is...", "who works at..." with the `brain_contact` tool.
- A person to leave out for good (a colleague's personal address, a family member): add it to `contacts.exclude` in `hyperbrain.json`; it will never enter again.

## End

Two lines: how many people the directory holds, how many became notes.
