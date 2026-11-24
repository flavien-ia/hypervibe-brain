# /brain:status

Tells you where your brain stands in a few numbers: how many notes, in what state, whether it is protected, whether its automatic tasks are running. Claude ends with **a single recommendation**, the most useful one right now, and offers to take care of it at once.

## When to use it

- You want to know where your brain stands after a few days or weeks of use
- You are not sure the evening save or the weekly review really ran
- You do not know what the next useful step is
- Your brain lives on two computers and you want to check that they are up to date with each other
- You received an email saying that something went wrong, or that a judge of your brain is down

## How it goes

1. **The reading**: Claude queries the brain and its automatic tasks. If there is no brain on this computer yet, it says so, offers `/brain:start`, and stops there.
  - What needs you is said before any number: a Claude that reads in the background and can no longer work (which one, since when, the likely cause in plain words), or an alert of the week. Claude then offers to repair it at once.
2. **The brain**: the number of notes, how many are seeds and how many are trusted, and your domains with the number of notes in each. A domain left empty is pointed out. When many seeds wait, Claude reminds you how they are validated: in the live view (the "Seeds" filter, then the "Validate" button on each note), or by telling Claude which note is right.
3. **Its health**: errors (there must be zero), warnings, and whether search by meaning is on or off.
4. **Its safety**: whether it is saved online or only on this computer, the date of the last save, and the files not saved yet.
5. **Its life**: the evening save (set up or not, its last run and the result) and the weekly review (set up or not, its last report).
6. **What feeds it and what it does**: the sources that are on (mail and calendar, work with Claude, watched folders) and the modules in place (online copy, cold copy, search by meaning, map), in plain words.
7. **Its start**: if the start was not carried through to the end, Claude tells you which part it is in (the brain itself, the tools that feed it, the knowledge that comes in, your skills and guards, the routines) and which step comes next. `/brain:start` picks it up from there.
8. **The recommendation**: one sentence, one action, and the offer to do it now.

## What it creates for you

- A **short dashboard**, in the conversation: numbers first, then a recommendation
- If the brain lives on two computers: which one runs it, and how far behind or ahead the one you are on is
- The state of your directory: how many people, how many in the core circle, how many have a note
- Nothing else: this skill reads, it creates and changes no note

## Prerequisites

- A brain already created on this computer (otherwise Claude offers to create it)

## Tips

{{callout:info|Zero errors is the rule}}
An error in a note prevents the brain from updating its index, and therefore its search. That is why fixing it comes before everything else in Claude's recommendation. Warnings, on the other hand, block nothing.
{{/callout}}

{{callout:tip|The order Claude recommends in}}
Always the same: fix errors, repair a background reading that is down or a source in trouble, go on with the start where it stands (`/brain:start`), protect the brain (`/brain:add-backup`), set up the automatic tasks (`/brain:add-routines`), add a source (`/brain:sources`) or bring in a piece of writing (`/brain:ingest`), then search by meaning (`/brain:add-embeddings`).
{{/callout}}

{{callout:warning|What is said first}}
A background reading that is down and an alert of the week come before everything else, with the offer to repair. On two computers, a conflict (the same note changed on both sides) or changes set aside and still waiting are announced first too. The same goes for one of your own sources that is in error, or not yet approved on this computer, along with what to do about it. A source that only waits for your Hypervibe vault to be opened is not in error: Claude says it as a wait, and it runs by itself once the vault is open.
{{/callout}}
