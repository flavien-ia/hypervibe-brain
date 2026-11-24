---
name: executive
description: Keeps the person's own skills and guards in the brain, beside the notes - brings in what is left in Claude Code's folders, and puts everything back on a new computer. When the person says /brain:executive, "my skills", "range mes skills".
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

`state`: what the floor holds. `skills` (each with `placed`: `linked` when Claude Code finds it, `missing` when it does not, `other` when another skill of the same name holds its place), `shared` (folders other skills use, without a SKILL.md of their own), `guards` (each with `placed`: wired or not, and `what` it does, in its own words), `harnesses` (the plugins installed, with their skills and hooks: shown, never moved).

`candidates`: what is left in Claude Code's folders. `skills` (folders of their own; `hasSkill: false` is a folder other skills use), `hooks` (the ones the settings run, with what each says it does), `loose` (files of the hooks' folder that no setting runs: a file a guard uses beside it, or a leftover).

## Tell

In a few lines: how many skills and guards live in the brain, how many are left in Claude Code's folders, and anything not in place (a skill `missing`, a guard not wired). The plugins are shown, not moved: each is a product with its own repository.

## Bring in what is left

Offer to bring in the skills and the hooks that are left, the person choosing (all of them, some, none). Say what it changes: the skill moves into their brain (a copy is kept first), Claude Code finds it as before, and from now on an improvement of the skill is an improvement in their brain. For a guard: it moves too, the settings run it from the brain, and **their AI can no longer change it**; they change it by hand. That is the point of a guard.

For each skill agreed:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/executive.mjs" adopt-skill <folder>
```

A folder other skills use (`hasSkill: false`): add `--shared`.

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

It puts back the link of every skill and the wiring of every guard the brain holds, and touches nothing that is someone else's (`left` names a folder of its own that holds the place of a skill: say it, never remove it). Claude Code reads its skills when a session opens: say that the new skills will be there at the next session.

## End

Two lines: what lives in the brain now, and that the live view shows it (`/brain:live`, the "Harnesses" layer: the skills in a crown around the tools, lighting up when the AI uses them).
