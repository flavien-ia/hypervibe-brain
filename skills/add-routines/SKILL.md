---
name: add-routines
description: Set up, check or stop what happens without you asking - the evening save of your second brain (no AI, no cost), its weekly review by Claude, and the review sent to you by email.
---

# /brain:add-routines - What happens without the person asking

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

**When they do not want the evening save** (or, with the live reading on, not the background program of the last section), say in one sentence what they do without (nothing is saved or sent by itself; nothing is read during the day), then record it, so that `/brain:start` stops offering this step and can go on:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark routines declined
```

`mark routines later` instead, when they only want to decide another day: the start goes on and comes back to it at the end. `start.mjs mark routines todo` brings the step back the day they change their mind. Nothing to mark when the evening save is armed (and the background program is on, if they have the live reading): the start reads that from the facts.

## Set up the evening save

Ask the time if they want another one than 21:00, then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" arm --time 21:00
```

Then run it once right away, so that the person sees it work:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" run-now
```

`lastRun` must show `build.mjs exit 0` and `save.mjs exit 0` (and `cold-copy.mjs`, `viz.mjs` lines, which do nothing when not chosen). Otherwise read the trace (`~/.hypervibe-brain/logs/`, and on a Mac `launchd.err.log` there too), explain in plain words, fix.

**On a Mac, say two things before the first evening**:
- macOS shows a notification "Background Items Added: node". It is this save; if it is switched off in System Settings, Login Items, the save stops without a word.
- If the brain, a watched folder, the cold copy folder or the app sits in a protected place (Desktop, Documents, Downloads, iCloud, an external drive), macOS will ask, **the first evening at 9 pm**, whether `node` may access it. Nobody may be there to answer: suggest they keep the computer awake the first evening, or accept the question the next morning. Until it is accepted, that step is skipped (the cold copy then reports the drive as unreachable).

**If they keep keys in a Hypervibe vault** (the keys of their own sources, of the cloud copy, of the alert email), say what the evening does with it: when the vault is closed at that hour, a notice and the vault's own window ask for its password; without an answer in six minutes, what needs a key is skipped that evening and taken up at the next run that finds the vault open. The save itself is always made. A closed vault is a wait, never a failure.

`routines.mjs state` on a Mac also says whether launchd really has the task loaded (`armed`), how its last run ended (`lastResult`), and whether the node it starts still exists (`nodeFound`).

Record the component: `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set save on`.

## Set up the weekly review

Ask the day and time (for instance Sunday 6 pm).

**If this session offers a tool to create scheduled tasks** (the Claude desktop app has one, on Windows and on Mac), create a weekly task with exactly this prompt:

> Run the skill /brain:review in automatic mode: nobody is at the screen, ask no question, modify no trusted note. End with the five-line summary.

Name it `brain-weekly-review`. Then record it, so that `/brain:status` can report it:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" note-review --when "<day and time, in plain words>" --id "<the task's id or name>"
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set review on
```

**If no such tool is available** (terminal only, or another app): say it plainly, and offer the manual habit instead: once a week, the person says "review my brain". Record that choice with `note-review --when "manual, <day>" --id manual`.

## The weekly letter

Once the weekly review is set up, propose the letter, in these words (translated):

> Every week, the review can also be **sent to you by email**: a short letter with what came into your brain, the notes the machine wrote, what it proposes, and how to answer in one sentence ("remove seeds 3 and 8"). You read it on your phone, without opening anything.

On a yes, **the channel**: invoke `/brain:_alert-channel`. It is the one place where the channel is chosen, since the same channel carries the letter and the alerts (a save that failed, a judge down). It puts the choice to them (a Brevo or Resend account of theirs, which can also carry an alert; their own mail through their Claude's connector, which carries the letter only; or none), takes their explicit agreement, sets it up and sends a test. If a channel is already set (`letter` in `brain.json`), keep it and go on.

**A first letter, right now**, so that they see it and say whether it suits them: write a short one from the brain's current state (the structure is in `/brain:review`, Step 6), send it with `letter.mjs send`, and ask them to check their inbox (and the spam folder, the first time). Their taste (shorter, another tone) is noted in `BRAIN.md`, and the review follows it.

To stop it: `node "${CLAUDE_SKILL_DIR}/../../scripts/letter.mjs" setup --channel none`.

## The background program, for the live reading

If the person turned on the live reading of their conversations with Claude or of their watched folders (`/brain:sources`, which hands it to `/brain:_live-sources`), a third thing happens without them asking: a small program starts with their session and, every half hour, looks at what has settled and wakes the background Claude that reads it. It uses no AI by itself; what the reading costs is said when the live reading is offered. That background Claude needs a lasting token to run, kept in a file of this computer and not in a vault (a vault closes itself after a few hours, and the reading would stop with it): without one it fails and says so (`/brain:_judge-token` gives it, `/brain:_repair-judge` repairs a judge that is down). A source of their own whose key is in their Hypervibe vault is another matter: while the vault is closed it waits, without failing, and runs by itself once the vault is open.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" hub state
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" hub on
```

`state` says whether it is on, whether it runs, and when it last looked. `hub off` stops it: the brain then keeps the evening's rhythm, and nothing is read during the day.

## Stop a task

- Evening save: `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" disarm`, then `components.mjs set save off`.
- Weekly review: delete the scheduled task with the same tool (or tell the person where it is in their app), then `routines.mjs note-review --off` and `components.mjs set review off`.

## End

Two lines: what is set up, when the next run is.
