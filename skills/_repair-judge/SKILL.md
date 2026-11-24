---
name: _repair-judge
description: Internal - repairs a background Claude of a second brain (a judge) that is down. Reads its state and its last error, names the cause in plain words, walks the fix with the person (a new token, a missing file, a limit reached), then tries it on one item. Called by /brain:status when a judge is down, and when the person says "the judge of my brain is down, repair it". Not meant to be invoked directly by users.
user-invocable: false
---

# Repair a judge

The person received an email saying that a judge of their brain is down, or `/brain:status` found one. A judge is the Claude that reads their conversations or their documents in the background. Your job: say what happened, repair it with them, and prove that it works again.

## Communication
- Reply in the person's language, as to someone who is not technical. Say "the Claude that reads your conversations in the background" before you say "the judge"; name the cause as a fact of life ("its access to your Claude account has expired"), never as an error code.
- Nothing is lost, and say so first: what it could not read waits on its pile.
- Never ask them to paste a token, a key or a password into the conversation.

## Read what happened

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" state
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" hub state
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" state
```

For each judge, the first gives `failures` (runs failed in a row), `down` (two or more: the alert was sent), `failingSince`, `lastError` (the raw error), `cause` (its class), `waiting` (what is on its pile), and `paused`, `held`, `capped` when they apply. The second says whether the background program is on and running. The third says where a token is found, never its value.

**No judge is failing** and yet nothing is read? Look at the other reasons before anything else, and say the one that applies:

- the background program is not on, or not running (`on` false, `running` null): `node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" hub on`;
- the judge is `paused`: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" resume <judge>`, if they want it back;
- it is `held` before a big catch-up, or `capped` for today: invoke `/brain:_limits`;
- it waits for their Hypervibe vault (the token is found only there, `judge-token.mjs state` says `found: "vault"` or `places.vault: "locked"` with nothing else): not a failure, it reads again once the vault is open. Recopy the token outside so that it no longer depends on the vault: `/brain:_judge-token`;
- nothing waits (`waiting` is 0), or it is night: it reads between 7 am and 11 pm, once something has settled.

## Name the cause

Say which judge, since when (`failingSince`, as a day and an hour), how many items wait, and the cause in one or two sentences:

| `cause` | What happened, in plain words |
|---|---|
| `no-token` | it has no access to their Claude account on this computer: the token was never created, or it was kept only in a vault, which closes itself after a few hours |
| `token` | its access to their Claude account is no longer accepted: the token expired (it lasts a year) or was revoked |
| `network` | it could not reach Claude: no internet at that moment, or Claude's service was not answering |
| `limit` | the limit of their Claude plan was reached; the judge uses the same plan as their own conversations |
| `instructions` | the file that tells it what to read and what to keep is gone |
| `no-claude` | Claude's command-line program is not found by the background program |
| `other` | not a cause the brain recognises: read `lastError` yourself, and the end of the day's log in `~/.hypervibe-brain/logs/` (`hub-<date>.log`) |

When `cause` is `other` and you cannot tell what happened from the error and the log, say so plainly. A guess presented as a diagnosis sends them the wrong way.

## Walk the fix

- **`no-token`, `token`**: invoke `/brain:_judge-token`. The token's place is a file of this computer, outside any vault: a vault closes itself after a few hours, and every background reader stops with it. The skill first looks whether their Hypervibe vault holds the token: then the repair is to have the vault opened once and to recopy the token outside (`judge-token.mjs keep-outside`, which never shows it), so that it does not happen again. Otherwise (never created, expired, revoked) the person creates a new token in a window you open for them, and it is kept in that file.
- **`network`**: nothing is broken in the brain. Ask whether the connection is back, and go to the try below.
- **`limit`**: nothing to repair either: the judge starts again by itself once the plan's limit is reset. Say when they can expect it if the error says so. If it keeps happening, offer to lower the judge's cap for the day, so that it leaves more of the plan to their own work: invoke `/brain:_limits`. Do not try it now: the try would hit the same limit.
- **`instructions`**: `sources/<judge>/instructions.md` is missing in the brain's folder. If the brain's history has it, bring it back as it was (`git -C "<brain folder>" log --oneline -- sources/<judge>/instructions.md`, then `git -C "<brain folder>" restore --source <commit> -- sources/<judge>/instructions.md`): their own adjustments come back with it. Otherwise, for one of the two standard judges (`conversations`, `documents`), copy the plugin's own (`${CLAUDE_SKILL_DIR}/../../templates/sources/<judge>/instructions.<fr|en>.md`, in the brain's language) to that place, and say that it is the standard text. For a judge of their own with no history, write it again with them.
- **`no-claude`**: `claude --version`. No answer: the program was removed; install it again with them from Claude Code's official installation page (https://code.claude.com/docs/en/setup). It answers here: the background program started before it was installed, or does not look where it is; turn the background program off and on again (`routines.mjs hub off`, then `hub on`), so that it starts with what this session sees.

## Try it on one item

Once the cause is dealt with:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" resume <judge>
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" now <judge> --one
```

`resume` only if it was paused. `now --one` asks the background program to have the judge read a single item at its next beat, within a minute, without waiting for the hour a failed judge otherwise waits; it agrees to nothing more (a pile held before a big catch-up stays held). The background program must be on. Reading one item takes a few minutes: tell them, wait, then look again:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge.mjs" state
```

- **`failures` is back to 0**: it is repaired. Say it, and say what happens next: the rest of its pile is read at its usual rhythm, under its cap for the day.
- **It failed again**: read the new `cause`. Another cause: deal with it once. The same cause: stop, say plainly what you tried and what the error still says, and do not loop.
- **Nothing waited on its pile** (`waiting` was 0): there is no item to try it on. When the repair was about the token, a real check proves it, with their agreement: `node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" check --live` (a few dozen tokens of their plan).

## End

Three lines: what had happened, what was done, and that the judge reads again (or what still stands in the way). The alert itself stays on record; the next `/brain:status` no longer shows the judge as down.
