# /brain:start

The first step with Hypervibe Brain. Claude checks that your computer has what a second brain needs, installs what is missing, then offers to create the brain. You type nothing: Claude does everything and shows its progress as a short checklist.

## When to use it

- Right after installing the plugin, before any other skill.
- When another skill tells you the computer is not ready.
- After an installation or an update, to check that Claude can reach your brain.

## How it goes

1. **Welcome**: Claude recalls in a few lines what a second brain is, and announces the check (about a minute).
2. **Silent check**: Claude looks at what is already in place.
  - Required: Node in version 22.13 or later (the engine that runs the brain's search), git (the tool that keeps the history of your notes), and your git identity (the name and email that sign every save).
  - Optional: GitHub and Cloudflare (see step 5).
  - If a brain already exists on this computer, Claude says so in one sentence and points you to `/brain:status` instead of a creation.
3. **Installing what is missing**: Claude says in one sentence what it is about to install and why, then does it.
  - On Windows, it installs everything itself; the app simply asks for your approval at each step.
  - On a Mac, you install and Claude guides: the installers ask for the Mac's password in a window of their own, which Claude cannot (and must not) type.
  - On Linux, Claude points you to the official instructions; anything that needs administrator rights is typed by you, never by Claude.
4. **Your identity**: if a name or an email is missing, Claude asks you for them (your usual ones) and records them. It goes no further until everything required is in place.
5. **The two options**: each presented in two lines, neither blocks what follows.
  - GitHub (recommended): a private online copy of your brain, with its history. You sign in from your browser, with a one-time code that Claude gives you. This can wait until the brain is created.
  - Cloudflare (optional): only useful to make the brain readable from the cloud, later, with `/brain:add-cloud`.
6. **Report and hand-over**: a short table (ready, option not set, missing), then Claude checks that it can reach the brain. If everything answers, it offers to create your brain right away with `/brain:create`, or later.

## What it creates for you

- A computer that is ready: Node and git installed or updated if needed
- Your **identity** (name and email) recorded, to sign the brain's saves
- If you choose so, the connection to **GitHub** and to **Cloudflare**
- A clear **report** of what is in place
- The plugin's location, recorded for the future evening save
- No brain at this stage: creating it is the job of `/brain:create`

## Prerequisites

- Claude Code (the desktop app or the command line), with the Hypervibe Brain plugin installed
- An internet connection, for the installations
- On Windows: the Windows app installer ("App Installer", free in the Microsoft Store). If it is missing, Claude tells you, you install it, then you run `/brain:start` again.
- On a Mac: your Mac's password, which the installers will ask for

## Tips

{{callout:warning|After an installation, really quit the app}}
The Claude app only looks for Node when it starts. If Claude cannot reach the brain at the end, it asks you to quit the app completely (on a Mac: Claude menu, Quit, not just closing the window), reopen it, then run `/brain:start` again.
{{/callout}}

{{callout:info|On a Mac, prefer the official Node installer}}
The official installer puts Node where the Claude app finds it. With Homebrew, the app sometimes cannot see it, even after a restart: using the official installer is the usual cure.
{{/callout}}

{{callout:tip|The creation can wait}}
Answering "later" at the end loses nothing. `/brain:create` starts whenever you want, begins with about fifteen minutes of questions, and can be interrupted and resumed at any step.
{{/callout}}
