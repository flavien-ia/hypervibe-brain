---
name: _computer
description: Internal - gets a computer ready for a second brain. Installs or updates Node and git, sets the git identity, offers GitHub and Cloudflare, and cures a Claude app that cannot reach the brain's server. Called by /brain:start when its audit says the computer is not ready. Not meant to be invoked directly by users.
user-invocable: false
---

# Get this computer ready

## Communication
- Reply in the person's language. Plain, non-technical words. The person may never have used a terminal: you run every command you can, and when only they can act (a password window, a `sudo` command), you say exactly what to click or type.
- Show progress as a short checklist.

## What is needed

```bash
node --version 2>/dev/null || echo "NO_NODE"
node "${CLAUDE_SKILL_DIR}/../../scripts/prereqs.mjs" --json
```

The audit (it needs Node to run at all) reports `os`, `node` (`ok` = 22.16 or later), `git`, `gitIdentity`, `sqliteFts`, `gh`, `cloudflare` and `ready`.

Required: **Node 22.16+**, **git**, **a git identity**. Optional: **GitHub** (online, versioned backup of the brain, recommended), **Cloudflare** (only for cloud access to the brain, a later option).

## Install what is required

Tell the person in one sentence what you are about to install and why ("Node runs the brain's search, git keeps its history"), then do it. The harness asks their permission for each command: that is expected.

### Windows

Check winget (`winget --version`). If it is missing: the person installs "App Installer" from the Microsoft Store (https://aka.ms/getwinget), then runs /brain:start again.

```bash
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install Git.Git --accept-package-agreements --accept-source-agreements
```

After an install, the current session does not see the new PATH yet: prefix the next commands with `export PATH="/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"`.

### macOS

On a Mac, **the person installs, you guide**: the installers ask for the Mac's password in a window of their own, which you cannot type (and must not).

- **git**: the audit's first `git --version` has already made macOS open a window "The git command requires the command line developer tools". Tell the person to click **Install** and wait for the end (a few minutes). If the window did not appear: `xcode-select --install` opens it.
- **Node**: open the download page for them (`open https://nodejs.org/en/download`), and tell them to take the **macOS installer (.pkg)** of the LTS version, open it, and follow it to the end (it asks for their password). This installer puts `node` where the Claude app finds it, which Homebrew does not always do.
- **Homebrew users**: if the person already uses Homebrew and prefers it, they can type `brew install node` themselves in the Terminal; say that the Claude app may then need the official installer anyway if it cannot find Node (see "Claude cannot reach the brain's server" below).

When they say it is done, run the audit again.

### Linux

Node from the distribution is often too old for the brain (22.16+ needed). Recommend the official instructions at https://nodejs.org (or `nvm`), and `sudo apt install git` / `sudo dnf install git`; commands with `sudo` are typed by the person, never by you.

### Node too old

If Node is present but older than 22.16, update it the same way (Windows: `winget upgrade OpenJS.NodeJS.LTS`; Mac: the person runs the official installer again, or `brew upgrade node` if they use Homebrew).

### Search engine check

The audit's `sqliteFts` must be true: it is the full-text search the brain relies on. The official Node builds always have it. If it is false, Node was built against another SQLite (some package managers do that): have the person install Node from nodejs.org instead.

### Git identity

If `gitIdentity` has no name or no email, ask the person for the name and email that should sign the saves of their brain (their usual ones), then:

```bash
git config --global user.name "<name>"
git config --global user.email "<email>"
```

Run the audit again. **Do not go further until `ready` is true.**

## The options

Present both in two lines each, and let the person choose. Neither blocks anything.

- **GitHub (recommended)**: a private, online, versioned copy of the brain. If `gh` is missing: Windows `winget install GitHub.cli`; Mac, the person installs it from https://cli.github.com (or types `brew install gh` if they use Homebrew); Linux, the distribution's package (`sudo apt install gh`, `sudo dnf install gh`, or the instructions of https://cli.github.com when the distribution has none), typed by the person like every `sudo` command. If it is not connected: `gh auth login --web --git-protocol https`, which prints a one-time code and opens the browser; give the person the code, they sign in, you check with `gh auth status`. If they prefer, this can wait until the brain is created.
- **Cloudflare (optional)**: only needed to reach the brain from the cloud, for online agents (`/brain:add-cloud`). If they want it ready: `npx wrangler login` (opens the browser; nothing to install globally, which fails on a Mac with the official Node installer), then check with `npx wrangler whoami`. The audit sees a connection made this way too (`cloudflare.via` is `npx`). Otherwise, skip.

## Claude cannot reach the brain's server

Call the `brain_stats` tool of the brain MCP server. An answer, even "no brain yet", means Claude reaches it. If the tool is missing or fails, the Claude app started before Node was installed, or cannot see it: desktop apps (on macOS especially) do not read the terminal's settings, and only look for Node when they start. Ask the person to **quit the Claude app completely and reopen it** (on macOS: Claude menu, Quit, not just closing the window), then to run `/brain:start` again. Still failing on macOS after a restart: the app does not see Homebrew's folder; installing Node with the official installer from nodejs.org (it places `node` in `/usr/local/bin`) is the usual cure.

## End

A short table: each item, ✅ ready / ⚠️ optional not set / ❌ missing (there should be no ❌ left). Then go back to `/brain:start`, which goes on from there.
