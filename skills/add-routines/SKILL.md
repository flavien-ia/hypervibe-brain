---
name: add-routines
description: Set up, check or stop what happens without you asking - the evening save of your second brain (no AI, no cost), its weekly review by Claude, and the review sent to you by email.
---

# /add-routines - What happens without the person asking

Two automatic tasks, of two different natures. Present them in these words (translated), before setting anything up:

> Two things can happen without you asking:
> - **every evening** (at 9 pm unless you prefer another time), your computer records the day's changes to your brain, rebuilds its search, and sends everything to your online backup if you have one. It uses no AI, costs nothing, stays invisible, and if the computer was off or asleep at that time, it catches up at the next wake-up or start (and does nothing if the evening was already saved);
> - **every week**, on the day and at the time you choose, Claude rereads your brain and leaves you a report: new notes, notes that have proven themselves, forgotten notes, links to add. It uses a little of your Claude subscription, and it runs on this computer (your brain is here, not on the internet): the Claude app must be open at that moment, or the review waits until it is.

## Communication
- Reply in the person's language. Plain words: "your computer records the day's changes", never "a cron job" or "a git commit".

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
```

It says whether the evening save is set up (next run, how the last one went) and what is known of the weekly review. Say it in two lines, then ask what the person wants: set both up (recommended), change a time, stop one, or nothing.

## Set up the evening save

Ask the time if they want another one than 21:00, then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" arm --time 21:00
```

Then run it once right away, so that the person sees it work:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" run-now
```

`lastRun` must show `build.mjs exit 0` and `save.mjs exit 0` (and `cold-copy.mjs`, `viz.mjs` lines, which do nothing when not chosen). Otherwise read the trace (`~/.hyperbrain/logs/`, and on a Mac `launchd.err.log` there too), explain in plain words, fix.

**On a Mac, say two things before the first evening**:
- macOS shows a notification "Background Items Added: node". It is this save; if it is switched off in System Settings, Login Items, the save stops without a word.
- If the brain, a watched folder, the cold copy folder or the app sits in a protected place (Desktop, Documents, Downloads, iCloud, an external drive), macOS will ask, **the first evening at 9 pm**, whether `node` may access it. Nobody may be there to answer: suggest they keep the computer awake the first evening, or accept the question the next morning. Until it is accepted, that step is skipped (the cold copy then reports the drive as unreachable).

`routines.mjs state` on a Mac also says whether launchd really has the task loaded (`armed`), how its last run ended (`lastResult`), and whether the node it starts still exists (`nodeFound`).

Record the component: `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set save on`.

## Set up the weekly review

Ask the day and time (for instance Sunday 6 pm).

**If this session offers a tool to create scheduled tasks** (the Claude desktop app has one, on Windows and on Mac), create a weekly task with exactly this prompt:

> Run the skill /hyperbrain:brain-review in automatic mode: nobody is at the screen, ask no question, modify no trusted note. End with the five-line summary.

Name it `hyperbrain-weekly-review`. Then record it, so that `/hyperbrain:brain-status` can report it:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" note-review --when "<day and time, in plain words>" --id "<the task's id or name>"
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set review on
```

**If no such tool is available** (terminal only, or another app): say it plainly, and offer the manual habit instead: once a week, the person says "review my brain". Record that choice with `note-review --when "manual, <day>" --id manual`.

## The weekly letter

Once the weekly review is set up, propose the letter, in these words (translated):

> Every week, the review can also be **sent to you by email**: a short letter with what came into your brain, the notes the machine wrote, what it proposes, and how to answer in one sentence ("remove seeds 3 and 8"). You read it on your phone, without opening anything.

On a yes, **the channel**, in this order of preference:

1. **Their own mail, through their Claude's connector** (Gmail or Outlook): nothing to set up if the connector is there. The letter is sent from their address to their own address. Check the connector is in this session.
2. **A Brevo or Resend account** they already have (with a sender address verified there): the letter leaves even if their Claude has no mail connector. The key goes in the brain's `.env` (`BREVO_API_KEY` or `RESEND_API_KEY`), pasted by them into the file you open for them, never in the conversation.

**Their explicit agreement**, in their words: "the review will send an email every week to <their address>". Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" setup --channel <connector|brevo|resend> --to <their address> [--from <verified sender>]
```

**A first letter, right now**, so that they see it and say whether it suits them: write a short one from the brain's current state (the structure is in `/hyperbrain:brain-review`, Step 6), send it with `letter.mjs send`, and ask them to check their inbox (and the spam folder, the first time). Their taste (shorter, another tone) is noted in `BRAIN.md`, and the review follows it.

To stop it: `node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" setup --channel none`.

## Stop a task

- Evening save: `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" disarm`, then `components.mjs set save off`.
- Weekly review: delete the scheduled task with the same tool (or tell the person where it is in their app), then `routines.mjs note-review --off` and `components.mjs set review off`.

## End

Two lines: what is set up, when the next run is.
