# /brain-contacts

Builds the contacts directory: the people you exchange with by email, who they are, since when, how often, about what. Claude can then query it in every conversation. Only the people who matter become notes, and only by your decision.

## When to use it

- When you want "who is my accountant?" or "who did I talk to at that company?" to get an answer in any conversation.
- During `/create-brain`, which offers it after the sources are chosen.
- To decide which people deserve a note in the brain.
- If the directory is already in place: Claude tells you how many people it holds and recalls how it lives afterwards.

## How it goes

1. **What it is, and what it implies**: Claude explains it in a few lines, then waits for your yes before turning the directory on.
2. **The first fill**: Claude reads the last three months of your mail, starting with the sent messages (the people you write to are the ones that count).
  - For each person: their address, their name, the number of messages sent and received, the first and last dates, and a few message subjects.
  - Never the text of the messages.
  - Newsletters, notifications, automatic senders and mass mailings are left out.
  - For the people you exchange with the most, Claude adds a one-line description drawn from the mail (for instance "their accountant") and a few themes. Nothing private (health, money, family), unless you want it.
3. **Who deserves a note**: the directory sorts people into three tiers. The core, those who matter (exchanges in both directions), and the rest (data only). Claude shows you the core and the first of those who matter, and asks which ones deserve a note. For each yes, the note is written in your brain's type for people.
4. **Afterwards, without you**: every week, the weekly review adds the week's exchanges (if the mail source is on) and proposes a note for anyone who rose to the core without one. And in any conversation, Claude answers "who is..." or "who works at...".
5. **End**: two lines, how many people the directory holds, how many became notes.

## What it creates for you

- The **contacts directory**: names, addresses, dates, numbers of messages and subjects
- A **note** for each person you chose, in one of your domains
- A directory **Claude can query** in all your conversations
- Its **update** every week by the weekly review

## Prerequisites

- A brain already created
- The Gmail or Outlook connector connected in your Claude app (Settings, Connectors). Without it, Claude tells you where to connect it, and you come back afterwards.
- For the weekly update: the weekly review and the mail source turned on

## Tips

{{callout:info|What the directory keeps, and where}}
Names, addresses, dates, numbers of messages and subjects: never the text of an email. The directory stays on your computer and in your brain's private copies. In a note, a person's address stays in its source, never in its text.
{{/callout}}

{{callout:tip|Leaving someone out for good}}
A colleague's personal address, a family member: tell Claude to exclude it. It is added to the list of excluded addresses and will never enter the directory again.
{{/callout}}

{{callout:tip|Thresholds that fit you}}
The number of exchanges from which a person "matters" or enters the core is your brain's own: Claude can change it at your request. A source of your own (a client tracking tool, for instance) may also place people in a tier, which the exchanges can then raise but never lower.
{{/callout}}
