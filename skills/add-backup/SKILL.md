---
name: add-backup
description: Protect your second brain - a private online copy on GitHub, a weekly cold copy in a place you choose, or both. Asks which one first.
---

# /brain:add-backup - Protect the brain

## Communication
- Reply in the person's language. Plain words: "a copy of your whole brain, with its history", never "a git remote" or "a bundle".

## Step 1 - Which protection

Explain the two, then ask: **the online copy, the cold copy, or both?** (Both is recommended: they protect against different losses.)

> - **The online copy (GitHub)**: a private copy of your whole brain and its history, on GitHub. If the computer is lost or broken, nothing is lost, and you can go back to any past version of a note. It needs a free GitHub account; your notes are stored there, in a private space only you can open.
> - **The cold copy**: once a week, the whole brain and its history in a single file, in a place you choose: an external drive, a USB key, your Dropbox or iCloud. It is the copy that survives even the loss of both the computer and GitHub, and it needs no account. The last eight are kept.

Check first what already exists: `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" show --json` (`modules.backup`, `modules.coldCopy`) and `git -C "<brain folder>" remote -v`. Say what is already in place and offer only the rest.

## The online copy (GitHub)

1. **The account and the connection**: `gh auth status`. Not installed: Windows `winget install GitHub.cli`; Mac, the person installs it from https://cli.github.com (or `brew install gh` in their Terminal if they use Homebrew). Not connected: `gh auth login --web --git-protocol https`, which prints a one-time code and opens the browser; give them the code, they sign in (creating a free account if needed), then check `gh auth status` again.
2. **The private repository, with their explicit agreement** (it creates something on their GitHub account):

```bash
cd "<brain folder>" && gh repo create <name> --private --source . --push
```

   Without the GitHub command: they create an empty **private** repository on github.com, then you run `git remote add origin <address>` and `git push -u origin main`. **Always private**: the brain holds their life.
3. **Sending by itself?** Ask whether the brain may send its saves to GitHub by itself (at each capture and every evening), or only when they ask. It is a permission. If yes, set `"autoPush": true` in `brain.json`.
4. Record: `node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set backup on`.

## The cold copy

1. **Where**: ask the place. An external drive or a USB key is the safest (it is not permanently connected); a synced folder (Dropbox, iCloud Drive, OneDrive) is fine too: a single file is safe there, unlike a live brain. It must not be inside the brain itself.
2. Record it, and make the first one right away:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" cold-copy "<folder>"
node "${CLAUDE_SKILL_DIR}/../../scripts/cold-copy.mjs" --force
```

   The answer gives the file and how many saves it holds. It is verified before being kept.
3. **How it runs afterwards**: the evening save makes a new one every seven days. If the evening save is not set up, say so and offer `/brain:add-routines`; until then, the cold copy is made when they ask ("make a cold copy of my brain").
4. **How to restore**, in one sentence to keep: "open a conversation, say *restore my brain from its cold copy*, and give the file". (Technically: `git clone <file> <new folder>`, then `node "${CLAUDE_SKILL_DIR}/../../scripts/adopt.mjs" --dir "<new folder>"`, which makes it the brain of this computer again; the index rebuilds itself at the first question.)

A drive that is not plugged in at the evening is not an error: that week has no copy, the next one will.

## End

Two lines: what is now protected, and how.
