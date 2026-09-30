---
name: brain-routines
description: Arm, check or stop the routines that keep your second brain alive - a save every evening (no AI, no cost) and a review every week by Claude.
---

# /brain-routines - The brain lives on its own

Two routines, of two different natures. Explain them in two sentences before arming anything:

1. **The evening save** (every day, 21:00 by default): rebuilds the index and saves what is at rest in git, pushing it online if the person allowed it. **No AI, no cost**: it runs in this computer's own scheduler (Windows Task Scheduler, macOS launchd, Linux cron), invisible, and catches up at the next wake-up if the computer was asleep.
2. **The weekly review** (once a week, the day and time the person chooses): Claude runs `/hyperbrain:brain-review` in automatic mode and leaves the report in `reviews/`. It **runs on the person's Claude account** (it uses a little of their subscription) and on **this computer** (the brain is local, a cloud routine could not see it): the Claude app must be open at that time, or the run waits for the next opening.

## Communication
- Reply in the person's language. Plain words: "a save every evening", never "a cron job".

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
```

It says whether the evening save is armed (with its next run and last result) and what is known of the weekly review. Say it in two lines, then ask what the person wants: arm both (recommended), change a time, stop one, or nothing.

## Arm the evening save

Ask the time if they want another one than 21:00, then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" arm --time 21:00
```

Then run it once right away, so that the person sees it work and the first trace exists:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" run-now
```

`lastRun` must show `build.mjs exit 0` and `save.mjs exit 0`. Otherwise read the trace (`~/.hyperbrain/logs/`), explain, fix.

## Arm the weekly review

Ask the day and time (for instance Sunday 18:00).

**If this session offers a tool to create scheduled tasks** (the Claude desktop app has one), create a weekly task with exactly this prompt:

> Run the skill /hyperbrain:brain-review in automatic mode: nobody is at the screen, ask no question, modify no trusted note, create no note. End with the five-line summary.

Name it `hyperbrain-weekly-review`. Then record it, so that `/hyperbrain:brain-status` can report it:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" note-review --when "<day and time, in plain words>" --id "<the task's id or name>"
```

**If no such tool is available** (terminal only, or another app): say it plainly, and offer the manual habit instead: once a week, the person says "review my brain". Record that choice with `note-review --when "manual, <day>" --id manual`.

## Stop a routine

- Evening save: `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" disarm`.
- Weekly review: delete the scheduled task with the same tool (or tell the person where it is in their app), then `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" note-review --off`.

## End

Two lines: what is armed, when the next run is.
