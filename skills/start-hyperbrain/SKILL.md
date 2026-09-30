---
name: start-hyperbrain
description: First step with Hyperbrain. Checks what this computer needs for a second brain (Node, git, your git identity; GitHub and Cloudflare as options), installs what is missing, then offers to create the brain.
---

# Start Hyperbrain - Get this computer ready

You welcome someone who has just installed Hyperbrain. Your job: check that everything a second brain needs is in place, install what is missing, and hand over to the creation of the brain.

## Communication
- Detect the user's language from the conversation (the user's own messages, anywhere in the session, not just this invocation: a bare slash command carries no language signal by itself). If nothing gives a signal, fall back to the OS locale (`node -e "console.log(Intl.DateTimeFormat().resolvedOptions().locale)"`, or English if Node is missing). ALWAYS reply in that language, including any example text quoted in this skill, which is illustrative and must be translated.
- Plain, non-technical language. The person may never have used a terminal: you run every command, they never type one. Never name a script; describe what you do.
- Show progress as a short checklist.

## Step 1 - Welcome

> **Welcome to Hyperbrain.**
>
> You are going to build your **second brain**: your ideas, your projects, the people who matter to you, what you have written and decided, as linked notes that Claude can consult in every conversation, and where it knows how to write properly.
>
> First, I check that this computer has what it needs. It takes a minute.

## Step 2 - The silent audit

Is Node there at all?

```bash
node --version 2>/dev/null || echo "NO_NODE"
```

If Node is present, run the audit (it also records where the plugin lives, for the evening routine):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/prereqs.mjs" --json
```

It reports: `os`, `node` (`ok` = 22.13 or later), `git`, `gitIdentity` (name and email that sign the brain's saves), `gh` (GitHub CLI, connected or not), `cloudflare` (the `wrangler` CLI, connected or not), and `brain` (a brain already set up on this computer, or null).

Required: **Node 22.13+**, **git**, **a git identity**. Optional: **GitHub** (online, versioned backup of the brain, recommended), **Cloudflare** (only for cloud access to the brain, a later option).

If `brain` is not null: a brain already exists here. Say so in one sentence, skip to Step 5 and offer `/hyperbrain:brain-status` instead of a creation.

## Step 3 - Install what is required

Tell the person in one sentence what you are about to install and why ("Node runs the brain's search, git keeps its history"), then do it. The harness asks their permission for each command: that is expected.

### Windows

Check winget (`winget --version`). If it is missing: the person installs "App Installer" from the Microsoft Store (https://aka.ms/getwinget), then runs /hyperbrain:start-hyperbrain again.

```bash
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
winget install Git.Git --accept-package-agreements --accept-source-agreements
```

After an install, the current session does not see the new PATH yet: prefix the next commands with `export PATH="/c/Program Files/nodejs:/c/Program Files/Git/cmd:$PATH"`.

### macOS

Homebrew first if missing (`/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`), then, in the same command block (brew is not on the PATH right after its install):

```bash
BREW=$([ -x /opt/homebrew/bin/brew ] && echo /opt/homebrew/bin/brew || echo /usr/local/bin/brew)
grep -q "brew shellenv" ~/.zprofile 2>/dev/null || echo 'eval "$('"$BREW"' shellenv)"' >> ~/.zprofile
eval "$("$BREW" shellenv)" && brew install node git
```

### Linux

Node from the distribution is often too old for the brain (22.13+ needed). Recommend the official instructions at https://nodejs.org (or `nvm`), and `sudo apt install git` / `sudo dnf install git`; commands with `sudo` are typed by the person, never by you.

### Node too old

If Node is present but older than 22.13, update it the same way (winget `upgrade`, `brew upgrade node`).

### Git identity

If `gitIdentity` has no name or no email, ask the person for the name and email that should sign the saves of their brain (their usual ones), then:

```bash
git config --global user.name "<name>"
git config --global user.email "<email>"
```

Run the audit again. **Do not go further until `ready` is true.**

## Step 4 - The options

Present both in two lines each, and let the person choose. Neither blocks anything.

- **GitHub (recommended)**: a private, online, versioned copy of the brain. If `gh` is missing: `winget install GitHub.cli` / `brew install gh`. If it is not connected: `gh auth login --web --git-protocol https`, which prints a one-time code and opens the browser; give the person the code, they sign in, you check with `gh auth status`. If they prefer, this can wait until the brain is created.
- **Cloudflare (later)**: only needed to reach the brain from the cloud (online agents, another computer without a copy). Not used by anything today. If they want it ready: `npm install -g wrangler`, then `wrangler login` (opens the browser). Otherwise, skip.

## Step 5 - Report and hand-over

A short table: each item, ✅ ready / ⚠️ optional not set / ❌ missing (there should be no ❌ left).

**Can Claude reach the brain's server?** Call the `brain_stats` tool of the hyperbrain MCP server. An answer, even "no brain yet", means yes. If the tool is missing or fails, the Claude app started before Node was installed, or cannot see it: desktop apps (on macOS especially) do not read the terminal's settings, and only look for Node when they start. Ask the person to **quit the Claude app completely and reopen it** (on macOS: Claude menu, Quit, not just closing the window), then to run `/hyperbrain:start-hyperbrain` again. Still failing on macOS after a restart: the app does not see Homebrew's folder; installing Node with the official installer from nodejs.org (it places `node` in `/usr/local/bin`) is the usual cure. Do not hand over to the creation before this answers: a brain Claude cannot read is only a folder.

Then:

> Everything is ready. **Shall we create your brain now?** It starts with about fifteen minutes of questions: what it is for, its main areas, what you have already written, what stays private.

- **Yes**: invoke the skill `/hyperbrain:create-brain` right away.
- **Later**: tell them that `/hyperbrain:create-brain` starts it whenever they want, and that it can be interrupted and resumed at any step.
