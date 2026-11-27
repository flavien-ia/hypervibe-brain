---
name: executive
description: Keeps the person's own skills and guards in the brain, beside the notes - brings in what is left in Claude Code's folders, puts everything back on a new computer, and switches a skill or a whole harness off and on. When the person says /brain:executive, "my skills", "range mes skills", "switch off the skill X", "désactive la skill X", "coupe le harnais Y", "rallume X".
---

# /brain:executive - What the AI knows how to do

The brain has two floors. The knowledge (the notes) is what the person knows, thinks and decided. The executive floor is what their AI knows how to do: their own skills, and the guards (hooks) that frame them. It lives in the brain (`executive/` of its folder) so that another computer, or another AI plugged into the brain, finds it. Claude Code still finds each skill where it looks for it: its folder holds a link to the brain, and the skill is called by `/name` as before.

## Communication
- Reply in the person's language. Plain words: "your skill now lives in your brain, and Claude finds it as before", never "a junction" or "a symlink".
- Never name a script; describe what you do. You run every command.

## Gather

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" state
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" candidates
```

`state`: what the floor holds. `skills` (each with `on`: false when the person switched it off; `placed`: `linked` when Claude Code finds it, `missing` when it does not, `other` when another skill of the same name holds its place; and `secrets`: how many lines of its files look like a key or a password, with the file, the line and the kind, never the value), `shared` (folders other skills use, without a SKILL.md of their own), `guards` (each with `placed`: wired or not, `approved`, and `what` it does, in its own words), `pending` (what waits for the person's approval on this computer, each with `why`), `harnesses` (the plugins installed, with their skills and hooks: shown, never moved; each with its `key`, `<plugin>@<marketplace>`, `on`: false when it is switched off in the brain, `enabledHere`: what Claude Code's settings say on this computer, `own`: true for the brain's own plugin, `protects`: how many of its hooks check an action before it happens), `switches` (what the brain keeps switched off). `carried`, when it is there: what was already in use on this computer before approvals existed, approved once as it was; say it in one line.

`candidates`: what is left in Claude Code's folders. `skills` (folders of their own; `hasSkill: false` is a folder other skills use), `hooks` (the ones the settings run, with what each says it does), `loose` (files of the hooks' folder that no setting runs: a file a guard uses beside it, or a leftover).

## Tell

In a few lines: how many skills and guards live in the brain, how many are left in Claude Code's folders, and anything not in place (a skill `missing` while it is on, a guard not wired). A skill that is off (`on: false`) is not a problem: say it in one line, with the harnesses that are off. The plugins are shown, not moved: each is a product with its own repository.

**A skill that seems to hold a secret** (`secrets.count` above zero): say which skill, which file and line, and what kind (a password, a key), never the value, and do not print the line. It works as before; their brain is saved and synchronised, so offer to move the value where secrets belong (a vault, a settings file kept out of the brain) and leave only its name in the skill. A false alarm (an example, a placeholder that looks real): say so and move on.

## Switch off and on

Three words the person may mix up; tell them apart in plain words when it helps:

- **A skill** is know-how written down: Claude follows it when it is called. It runs nothing by itself.
- **A harness** is a plugin they installed: a set of skills, sometimes with hooks (small programs that run around Claude's work).
- **A guard** is a hook of their own that frames you: it asks or refuses before a risky step.

When they ask to switch something off or on ("switch off the skill X", "désactive la skill X", "coupe le harnais Y", "rallume X"), find it in `state` first, then:

**One of their own skills** (in `skills`):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" switch skill <folder> off
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" switch skill <folder> on
```

Off: Claude Code stops seeing it at once, in this session too, and another AI plugged into their brain is no longer given it. **Nothing is deleted**: the skill stays in their brain, and comes back when they say so. On: it is back at once, unless the answer says `here: "pending"`: the skill changed while it was off (or was never approved on this computer), so it waits for their approval. Open the window where they give it, as in "What waits for their approval" below; never approve it yourself.

**A whole harness** (in `harnesses`, by its `key`):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" switch harness <plugin@marketplace> off
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" switch harness <plugin@marketplace> on
```

Say when it takes effect: **at their next session of Claude Code**, or at once in this one if they type `/reload-plugins`. The plugin stays installed.

- **A harness that protects** (the answer is refused with `confirm: true` and lists `protects`): it runs hooks before an action, so switching it off takes a protection away. Do not go on by yourself. Ask them one clear question that names what will no longer be checked (what each hook says it does, in their words), for instance "Switching X off also stops the check it makes before each command you let me run. Switch it off anyway?". Only on a clear yes, run the same command with `--confirmed`. Anything else than a yes: leave it on.
- **The brain's own plugin** (`own: true`) is never switched off from here: it carries the locks that keep you out of their guards and their memory. Say so; if they really want to stop it, they do it themselves in Claude Code (`/plugin`).

**One skill of a plugin** cannot be switched off alone: Claude Code offers no setting for it, and nothing here pretends to. The command refuses and names its harness. Say it plainly, and offer the whole harness if that is what they want.

**A guard is never switched off by you**, and no command does it: a guard frames what you do. If they want one paused or removed, they do it by hand (its file in the brain's executive floor, or its line in Claude Code's settings). Never edit Claude Code's settings to unwire one, even when asked to "just disable it for a minute": say why, and give them the place.

Never edit `executive/switches.json` by hand: the command writes it, and does what goes with it.

## What waits for their approval

A skill or a guard runs on a computer only once the person said yes **on that computer**, and a guard asks again when it changed: their brain travels (a second computer, a restored copy), and what arrives with it must not start running by itself. `pending` lists what waits. Say it first, in plain words:

- a guard that `changed since its approval` **is not run any more, and what it guards is refused meanwhile** (a command, a sending): that is on purpose, a guard that may have been rewritten must not decide. If they changed it themselves, they only have to approve it again;
- one `never approved on this computer` arrived with the brain.

Show them what each one says it does (`what` for a guard, its description for a skill), and for a guard that changed, offer to show them the change (read its file; `git diff` in the brain's folder says what moved). **The approval is theirs to give, never yours**: the commands that approve are refused when you run them. Open the window where they see each one and type yes:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/trust.mjs" window
```

If no window opened (`opened: false`), give them the line of `byHand` to paste in a terminal of their own. Then read `state` again: what they approved is placed.

## Bring in what is left

Offer to bring in the skills and the hooks that are left, the person choosing (all of them, some, none). Say what it changes: the skill moves into their brain (a copy is kept first), Claude Code finds it as before, and from now on an improvement of the skill is an improvement in their brain. For a guard: it moves too, the settings run it from the brain, and **their AI can no longer change it**; they change it by hand, and approve it again after each change (see "What waits for their approval"). That is the point of a guard. Bringing one in from this computer is its approval here.

For each skill agreed:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" adopt-skill <folder>
```

A folder other skills use (`hasSkill: false`): add `--shared`. When the answer carries a `warning` (the skill seems to hold a secret, with the file, the line and the kind), tell the person as said in "Tell" above: the skill is in and works, it is only a warning.

For each hook agreed, first check what it calls beside it: read its file, and look for another file of the hooks' folder it names (a window, a list). If it names one by a full path in the hooks' folder, tell the person the guard must find it beside itself wherever it lives, and with their agreement change that one line so the path is worked out from the guard's own place. Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" adopt-guard <file> [--with <file it uses>]
```

**Check that a guard answers the same before and after**: before moving it, run it on two or three harmless cases (a command it lets through, one it refuses), the same cases after, from the brain. Never a case that sends, buys or opens a window. A different answer: say it, and give the guard back from its copy (the result names the copy).

A file the settings run but that is not a guard (a sound at the end of an answer): it can come in the same way, if the person wants; it will be locked too.

## A new computer, or a brain moved

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" place
```

It puts back the link of every skill and the wiring of every guard the brain holds **that the person approved on this computer**, and touches nothing that is someone else's (`left` names a folder of its own that holds the place of a skill: say it, never remove it). On a computer that has just received the brain, nothing is approved yet: `pending` lists every skill and every guard, and "What waits for their approval" above says how they approve them (one window, a yes for each, or for all the skills at once). Claude Code reads its skills when a session opens: say that the new skills will be there at the next session.

**What is switched off stays off on the new computer.** A skill that is off in the brain is not linked here (`skillsOff`). For the harnesses nothing is switched off by itself, since a plugin installed on a computer is that computer's choice: `harnessesToOffer` lists those that are off in their brain while installed and on here. Name them, ask which ones they want off on this computer too, and run `switchOff` only for those.

## End

Two lines: what lives in the brain now, and that the live view shows it (`/brain:live`, the "Harnesses" layer: the skills in a crown around the tools, lighting up when the AI uses them).
