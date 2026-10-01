# /brain

Captures a thought, a decision or a fact into your second brain, as a note classified right away. Claude always searches what already exists first, so that nothing is ever duplicated. The skill works from any folder and any conversation.

## When to use it

- When you say "note this in my brain", "remember this idea", or `/brain` followed by the thought.
- Right after an exchange, with `/brain` on its own: Claude captures what was just said, and tells you so.
- For what you will want to find again in six months. Not for a task or a reminder: that is not what the brain is for.

## How it goes

1. **Check**: Claude looks at whether a brain exists on this computer. If not, it says so, offers `/create-brain`, and stops there.
2. **Faithful wording**: one to three sentences saying what you just thought. Claude rephrases for clarity, never to embellish: it is your thought, not Claude's. A phrase that belongs to you is kept word for word.
3. **Searching what exists**: by words, then by meaning when the words may differ.
  - A note already covers exactly this: nothing is created. Claude offers to enrich it, you decide, and the change is made in front of you.
  - Neighbouring notes exist: they become the links of the new one (two or three good links, not eight approximate ones).
  - Nothing exists: Claude creates the note.
4. **Classification**: Claude picks one of your brain's types (when in doubt, the notes type), one or two of your domains, and the note's status. If you ask for it, the note is marked private.
5. **Writing**: the note is written and recorded in the brain's history, then sent to your online copy if you allowed it. A title already taken, an unknown domain, or a link to a note that does not exist are refused.
6. **Confirmation**: a single line, saying where the note is filed, in which domain, and which notes it is linked to. If you correct the classification, Claude applies it right away.

## What it creates for you

- A **new note**, with a short, telling title, a type, one or two domains, its links and its source (where the thought comes from)
- The **seed** status by default, since Claude worded the text
- Its **record** in the brain's history
- Or, with your agreement, the **enrichment** of an existing note rather than a duplicate

## Prerequisites

- A brain already created on this computer (otherwise, `/create-brain`)
- The note is written in the language you used to express the thought

## Tips

{{callout:warning|What never goes in}}
Claude never captures a secret (key, password), even rephrased, nor the text of an email (at most a summary), nor a task or a reminder.
{{/callout}}

{{callout:info|Seed or trusted}}
A note worded by Claude enters as a seed: it is not validated yet. It only enters as trusted if you have just validated its text word for word. A private note, for its part, will never be shown to an AI again.
{{/callout}}

{{callout:tip|When no type fits}}
Claude does not invent a type on the fly. It files the note in the closest type and proposes to create a new one, which you accept or not.
{{/callout}}
