# /brain:create

The guided construction of your second brain, one step at a time: the decisions, the creation and the first notes, the sources that feed it, then the modules you want. Each step ends with a check before the next one starts, and the journey resumes where you left off. The brain is yours: Claude proposes and explains, you decide.

## When to use it

- After `/brain:start`, to create your brain.
- To resume an interrupted construction: Claude says where the brain stands in two sentences and picks up at the next step, without redoing anything.
- When you already have a brain folder (restored, or coming from another computer) that is not active here yet: Claude attaches it, then resumes.

## How it goes

1. **Starting point**: Claude checks that the computer is ready (otherwise it goes through `/brain:start` first), then presents the path in five lines.
2. **The decisions**: the most important step, about ten minutes of questions asked one at a time.
  - Why this brain: what you expect from it, in one or two sentences.
  - Your domains: the 3 to 8 big areas of your life and work. Every note will carry one or two.
  - Your types of notes: 5 to 12 types proposed from what your computer shows, with your agreement (Claude only reads folder names and counts files, it never opens one). You remove, rename, add.
  - What never goes in, and what stays private.
  - Where the brain lives on your computer.
  - Claude summarises your answers and you validate the summary.
3. **Creation and first notes**: Claude creates the brain and writes its founding document, which it shows you. Then it asks three or four open questions (your current projects, three ideas you care about, five people who matter, a recent decision), shows you the list of titles with their type and domain, and writes the notes once the list is corrected. A search then finds one of them: it is the first time your brain answers you.
4. **The sources**: Claude runs `/brain:sources` to choose what feeds the brain, offers the contacts directory (`/brain:contacts`), and offers to bring in a first writing (`/brain:ingest`), now or later.
5. **Claude reads it everywhere**: nothing to configure. You open a new conversation, ask a question about yourself there, and come back to say whether Claude answered from your notes. You run this test yourself.
6. **The modules**: presented by family, each in one sentence. You choose, Claude runs the chosen skills one after the other.
  - Protect: `/brain:add-backup`.
  - Make it live: `/brain:add-routines`, after a first review done together with `/brain:review`.
  - Use it better: `/brain:add-meaning` and `/brain:viz`.
  - Extend: `/brain:add-second-computer` and `/brain:add-cloud`.

## What it creates for you

- Your **brain's folder**, in the place you chose, with its history
- Its **founding document**: what it is for, its domains, what stays private, then the sources and modules in place
- Your **domains** and your **types of notes**, each described in one sentence
- About twenty **first notes**, trusted since you have just validated their content, and linked together
- Your chosen **sources**, and the list of your writings to bring in
- The **modules** you kept (the others can be added whenever you want, each through its own skill)

## Prerequisites

- A computer that is ready: `/brain:start` takes care of it
- Ten to fifteen minutes ahead of you for the decisions
- A location that is not inside a synchronised folder (see below)

## Tips

{{callout:warning|Never inside a synchronised folder}}
Dropbox, OneDrive, Google Drive or iCloud Drive damage the brain's history and search index: the creation refuses such a folder. Careful, Windows often places Documents and Desktop inside OneDrive without saying so, and a Mac may store Desktop and Documents in iCloud. By default, the brain lives in a folder of its own, in your home folder.
{{/callout}}

{{callout:info|Two levels of privacy}}
A private note exists in the brain, but its content is never shown to an AI, neither by the search nor to Claude. A "danger zone" folder is not even read, nor backed up: it is the last resort.
{{/callout}}

{{callout:tip|Less, but running}}
Twenty right notes and a brain that answers beat an ambitious plan that stops at the second step. You can stop at any time: run `/brain:create` again and the journey resumes. And once the brain is built, the reflex to keep is `/brain:capture` for every thought worth keeping.
{{/callout}}
