---
name: _judge-token
description: Internal - gives the background Claude of a second brain (a judge) its lasting token, without the token ever passing through the conversation. Opens a terminal window where the person creates it and stores it themselves, then checks that it is found. Called by /brain:start, /brain:_live-sources and /brain:_repair-judge. Not meant to be invoked directly by users.
user-invocable: false
---

# The judge's token

## Communication
- Reply in the person's language. Say "a token" and explain it once: a lasting access to their Claude account, valid for one year, that lets the Claude in the background work without them. Never "OAuth".
- **The token never passes through this conversation.** You never ask for it, never read it, never run a command that would print it. The person creates it and stores it themselves, in a terminal window of their own. This is not a formality: a conversation is kept on the computer, and conversations are exactly what the background Claude reads.

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" state
```

One line, never the token itself: `found` says where one is found (`env`: set in the computer's environment; `file`: in a file of the plugin's own on this computer, which their account alone reads; `vault`: in their Hypervibe vault; `null`: nowhere), and `places` each place (`env` and `file` true or false; `vault`: `none`, `locked`, `has` or `empty`).

**The token's place is the file, outside any vault.** A vault closes itself after a few hours, and every reader that works in the background would stop with it: the access of the judges must not depend on a door that shuts by itself. The keys of their own sources are another matter and stay in the vault.

- **`found` is `file` or `env`**: it is where it must be. Say so in their words, and go to "Check it".
- **`found` is `vault`** (it is in their Hypervibe vault, and `places.file` is false): it works only while the vault is open. Say why in one sentence (the one above), then recopy it outside, without ever showing it:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" keep-outside
```

  The token is copied from the vault into the plugin's file; nothing is printed but where it went (`ok: true`, `from: "vault"`, `to: "file"`). `ok: false` says why: `vault-locked` (have the vault opened once, then run it again), `not-in-vault` or `no-vault` (there is none to copy: go on below and create one). Look at the state again: `places.file` must be true. The copy left in the vault is theirs to keep or to remove there.
- **`places.vault` is `locked`** and nothing else is found: they have a Hypervibe vault, it is closed, and the token may well be in it. Have it opened once (with Hypervibe, its unlock window), look again, and if it is there, recopy it outside as above: from then on the vault can close without stopping anything. Do not create a second token for nothing.
- **Nothing is found**: go on below.

## What to say before

> The Claude that reads in the background needs to work when you are not there. For that it needs a token: a lasting access to your Claude account, valid for one year. You create it yourself, in two minutes: I open a window, it sends you to your browser to sign in to Claude, then it asks you to paste the token it shows. The token stays on this computer, in a file your account alone can read. It is not kept in a vault, on purpose: a vault closes itself after a few hours, and the reading would stop with it. I never see it, and you must never paste it here, in our conversation.

One thing to check first: the token is made by Claude's own command-line program, and the background Claude runs with the same.

```bash
claude --version
```

If it does not answer, that program is not installed on this computer (the Claude desktop app alone does not bring it): install it with them from Claude Code's official installation page (https://code.claude.com/docs/en/setup), then go on.

## Open the window

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" window
```

It comes back at once.

- **`opened: true`**: a terminal window has just opened on their screen. Tell them what will happen in it, so that nothing surprises them:
  1. Their browser opens: they sign in to Claude and accept.
  2. Back in the window, the token is shown. They copy it.
  3. The window asks for it: they paste it (right click, or Ctrl+V) and press Enter. **Nothing shows while they paste: that is on purpose.**
  4. The window says where the token is kept, and they can close it.
- **`opened: false`**: no window could be opened from here. Have them open a terminal themselves (Windows: the Start menu, "Terminal"; Mac: Spotlight, "Terminal"; Linux: their usual terminal) and paste the two lines of `byHand`, one after the other. The first creates the token and shows it; the second asks for it without showing it.

Then wait for them to say it is done. If something goes wrong in the window, they tell you what they see in their own words: never ask them to copy what the window shows.

## If it cannot be done now

They may not be able to create the token right away (no time, Claude's command-line program to install first, a browser that is not theirs). It is theirs to postpone: say in one sentence what waits meanwhile (the background Claude reads nothing, and what arrives stays on its pile: nothing is lost), then pause the readers so that they wait without failing and without sending an alert, and record the postponement, so that `/brain:start` goes on to its next step:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" pause conversations
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" pause documents
node "${CLAUDE_SKILL_DIR}/../../scripts/start.mjs" mark token later
```

Pause only the readers that are installed. The day the token is there, `sources.mjs resume <judge>` starts them again, and the start reads the token from the facts; until then `/brain:start` brings the step back by itself once nothing else is left to do. A person who decides they want no token at all is giving up the reading during the day: leave the readers paused, say so in one sentence, and record `start.mjs mark token declined` instead (`mark token todo` brings it back).

## Check it

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" state
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" check
```

`found` must be `file` (or `env`, for someone who set it in the computer's environment themselves). `check` verifies that the token is found and has the shape of one (`shape`: `oauth` is the usual one; `unusual` is kept and may still work; `bad` is not a token). It makes no call to Claude.

**A real check, with their agreement.** One real question to Claude with the token, a few dozen tokens of their plan, says for certain that it works:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" check --live
```

Ask first ("shall I try it for real? It uses a few tokens of your plan"). `works: true`: it is settled. `works: false` comes with a `cause`: `token` (it is refused: create another), `no-claude` (the background program does not find the `claude` command), `limit` (their plan's limit is reached: the token itself may be fine, try later), `network` (no connection at that moment). Say it plainly and act on it.

If their Hypervibe vault also holds a token (`places.vault` is `has` while `places.file` is true), say it once: the one in the file is the one the background Claude runs with, and an older one left in the vault is theirs to remove there.

## If the token is pasted in the conversation

Stop. Do not use it, do not store it, do not repeat it, not even in part. Tell them plainly: it is now written in this conversation, which is kept on the computer, so it must be considered exposed. They **revoke it and create another**: the revoking is done in their Claude account's settings on claude.ai, where the accesses given to Claude Code are listed (Anthropic documents no command for it: look for the place with them, and never say a token is revoked unless they saw it removed). Then open the window again for a new one.

## Forget it

`node "${CLAUDE_SKILL_DIR}/../../scripts/judge-token.mjs" forget` removes the plugin's own file. A token kept in their vault or in the computer's environment is theirs to remove there; the answer says where one is still found.

## End

One line: a token is in place and where it is kept (never its value), that it was postponed and the readers wait, or what still stands in the way. Then hand back to the skill that called you.
