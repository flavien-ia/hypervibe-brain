---
name: status
description: Where your second brain stands - notes by status and domain, errors, search by meaning, backup, routines, last review, where its start stands - and the next useful step. Also what to run when an alert arrived or when a judge of the brain is down.
---

# /brain:status - Where the brain stands

## Communication
- Reply in the person's language. Short and concrete: numbers, then one recommendation.

## Gather

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" state
```

If there is no brain: say so and offer `/brain:start`. Stop.

## What is said first

Before any number, what needs the person:

- **A judge is down** (`judgesFailing`, an entry with `down: true`): a Claude that reads their work in the background failed twice in a row or more. Say which one, since when (`failingSince`), how many items wait, and the cause in plain words (`cause`), then invoke `/brain:_repair-judge`, which walks the repair. When the person arrived saying that a judge of their brain is down ("the judge of my brain is down, repair it" is the sentence its alert email gives them), invoke it at once: the rest of the picture can wait. An entry with `down: false` failed once: often a passing trouble (no network for a moment); say it in one line, without alarm.
- **An alert** (`lastAlert`, less than a week old): an evening save or a judge had a problem, and the email may never have left (`sent: false`: no channel that can carry an alert, or its key was out of reach). Say what it says. `resolved: true` means the judge it named has worked since: say it as something that happened and is over. To be told by email next time: `/brain:_alert-channel`.

- **This computer's settings cannot be read** (an alert with `settings: true`): the background program and the evening save are paused, and nothing is written over the file. Say which file (`~/.hypervibe-brain/config.json`) and that a copy of it was kept beside it (`config.json.bad`); repair it with the person, then everything resumes by itself.
- **Git itself fails** (`gitError`): the saves cannot happen, which is not the same as "no git". Say the reason in plain words.
- **Something waits for their approval on this computer** (`approvals`, or `pending` in the state of the executive floor): a guard, a skill, a program of their brain, a background reader, a data source or a watched folder that arrived with the brain, or changed since they approved it. **It does not run meanwhile**, and a guard that changed refuses what it guards until they have looked at it. Say what waits and why, in plain words, then open the window where they approve each one themselves (never you): `node "${CLAUDE_SKILL_DIR}/../../scripts/trust.mjs" window` (if no window opened, give them the line of `byHand`). `/brain:executive` says more for a guard or a skill.
- **Their brain's folder can be changed by others** (`folderWritableBy`): other accounts of this computer may write in it, so anybody using the computer could change their notes and what runs for them. On a computer they use alone it is only worth knowing; on a shared one, suggest moving the brain inside their own folder (their home) or closing the folder to the others.

## Tell

A compact picture, in this order:

1. **The brain**: how many notes, how many `seed` / `trusted`, the domains with their counts (a domain at zero is worth saying). The seeds are what the machine wrote and nobody validated yet: when there are many, say how they are validated, in one line: in the live view (`/brain:live`), the "Seeds" filter shows them, a "Validate" button is on each note the machine wrote, and "Next seed" goes to the following one; or they tell you which note is right and you run `node "${CLAUDE_SKILL_DIR}/../../scripts/promote.mjs" --note <slug>`. The weekly review promotes by itself the ones that took root.
2. **Its health**: errors (must be zero: an error blocks the index), warnings, search by meaning on or off.
3. **Its safety**: saved online or local only, last save, files not yet saved.
4. **Its life**: the evening save (set up? last run and its result), the weekly review (set up? last report).
5. **What feeds it and what it does** (sources in `waitingForVault` wait for their vault to be opened, since `waitingForVaultSince`: say it as a pause, not a breakdown; they run by themselves once it is open): the living sources that are on (`sources`: mail and calendar, work with Claude, watched folders) and the modules in place (`components`: online backup, cold copy, search by meaning, map), in plain words.
6. **What their AI knows how to do** (the executive floor): how many of their skills and guards live in the brain, and the plugins installed. **Something not in place is said first**: a skill whose `placed` is `missing` (Claude Code does not find it on this computer: `/brain:executive` puts it back) or `other` (another skill of the same name holds its place), a guard whose `placed` is false (it no longer runs: its protection is off until it is wired again, `/brain:executive`). A brain with an empty floor: one line, that `/brain:executive` brings in their skills and hooks.
7. **Its start** (`start`, absent once the start is finished): which part it is in (`part`: the check for a brain that exists already, the computer, the brain itself, the tools that feed it, the knowledge that comes in, the executive floor, the life of the brain), what comes next (`next`), and for the knowledge what each block became (`blocks`: done, being read, kept for later, never). `resting: true` means nothing is left to decide, only something kept for later: say it in one line, without pressing. `stage` below 6 means the construction of the brain itself (`/brain:create`) was not completed; `/brain:start` resumes it at the right step.

## Recommend one thing

If the brain lives on two computers (`runner` in `brain.json`), also `node "${CLAUDE_SKILL_DIR}/../../scripts/sync.mjs" --state`: whether this computer is the one that runs it (`runner`), how far behind or ahead this one is, and above all a conflict or a stash waiting, said first. Also `node "${CLAUDE_SKILL_DIR}/../../scripts/contacts.mjs" stats` (the directory: how many people, how many in the core, how many with a note) and `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list --json`: a source of their own in trouble (an error, or not approved on this computer) is said first, with what to do. **A source that waits for their vault is not in trouble**: a source whose key is in their Hypervibe vault does not run while the vault is closed, and runs by itself at the first pass that finds it open (the live view shows a small key beside it). A source that is `due` with no error while the vault is closed is in that case: say it in one line, as a wait, and that opening the vault is all it needs. The background Claude does not depend on the vault: its token lives in a file of this computer (`/brain:_judge-token` recopies it there when it is found only in the vault).

The single most useful next step, by priority: fix errors > repair a judge that is down (`/brain:_repair-judge`) or a source in trouble > go on with the start where it stands (`/brain:start`) > protect it (`/brain:add-backup`) > set up the automatic tasks (`/brain:add-routines`) > add a source (`/brain:sources`) or bring in the next writing (`/brain:ingest`) > search by meaning (`/brain:add-embeddings`). One sentence, and offer to do it now. **On a computer that does not run the brain** (`sync.mjs --state` answers `runner: false`), most of the start is the other computer's (the live reading, its token and cap, the background program, the first big session): never recommend those here. What this computer needs is its evening save and its synchronisation (`/brain:add-second-computer`).
