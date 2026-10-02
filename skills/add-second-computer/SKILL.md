---
name: add-second-computer
description: The same second brain on two computers (a desktop and a laptop), kept in sync through its private GitHub copy. One computer runs the routines, the other reads and writes notes.
---

# /brain:add-second-computer - The brain on two computers

## Communication
- Reply in the person's language. Plain words: "your laptop gets the brain, and what you write on one appears on the other", never "a rebase" or "a fast-forward".

## What to say first (translated)

> Your brain can live on two computers. What you write on one is on the other the same evening (or at once when you capture a thought). They meet on your private GitHub copy.
> One of them **runs the brain**: it follows your sources, computes the search by meaning, keeps the directory, makes the weekly review and the letter. The other one reads and writes notes, and receives all of that. Choose the one that is on most often.
> What it implies: on each computer, the brain commits and sends its changes by itself (you agree to it on each). If the same note is changed on both before they meet, nothing is overwritten: it stops, tells you, and you choose.

## Step 1 - The computer that runs it (where the brain already is)

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/computers.mjs" state
```

- No online copy (`remote: null`): the two computers meet on GitHub. Invoke `/brain:add-backup` first (the online copy), then come back.
- Then, on the person's word that this computer runs the brain:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/computers.mjs" make-runner
```

- **Their agreement on this computer** that the brain commits and sends by itself, in their words, then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/computers.mjs" allow-sync on
node "${CLAUDE_SKILL_DIR}/../../scripts/sync.mjs"
```

  The last line sends what is here; it must answer `ok` or `nothing`.

## Step 2 - On the other computer

The person opens Claude on the other computer, with Hypervibe Brain installed (`/brain:start` there first), and says "add this computer to my brain". There:

1. The GitHub access: `gh auth status` (connected to an account that can read their private brain; the person signs in if needed, as in `/brain:add-backup`).
2. The brain, from GitHub, in a folder of their home (never a synchronised folder):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/computers.mjs" clone --url <the brain's GitHub address> --dir "<folder>"
```

3. **Their agreement on this computer too**, then `computers.mjs allow-sync on`.
4. **The evening save** on this computer as well, so that it sends and receives every evening: `/brain:add-routines`, the evening save only (the weekly review and the letter stay on the computer that runs the brain). Its evening does less: it saves its notes and synchronises; it never runs the sources, the cold copy or the app.
5. Test it together: a capture here (`/brain:capture`), then on the other computer, "synchronise my brain" (`sync.mjs`), and the note is there.

## When something is off

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sync.mjs" --state
```

It says who runs the brain, how far behind or ahead this computer is, and whether something waits:

- **A conflict** (`conflict`): the same note changed on both computers before they met. Nothing is lost and nothing was overwritten. Show the person the two versions (`git diff`, and `git diff HEAD...origin/main -- <file>`), let them choose or merge, write the result in front of them, then `sync.mjs` again. Never choose for them.
- **A stash waiting** (`stash`): the synchronisation set changes aside and could not give them back. `git stash show --stat` shows them; give them back with `git stash pop --index` (by the hash it names), then `sync.mjs`.
- **Offline**: nothing to do, it catches up at the next run.

To stop synchronising on a computer: `computers.mjs allow-sync off`. To make the other computer the one that runs the brain (the first one is replaced, for instance): stop the evening save and the weekly review on the old one, then on the new one `computers.mjs make-runner --take-over`, and set its routines up with `/brain:add-routines`.

## End

Two lines: which computer runs the brain, and when the two meet (every evening, and at each capture).
