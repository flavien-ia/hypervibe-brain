# /brain:start

The start of your second brain, from a computer that has nothing yet to a brain that already knows your work. Claude builds it part after part: each part is set up then filled before the next one begins, and it picks up where you left off, the same day or a month later. You type nothing: Claude does everything and shows its progress as a short checklist.

## When to use it

- Right after installing the plugin, before any other skill.
- To take the start up again where you stopped: Claude tells you which part you are in and goes on from there.
- When another skill tells you the computer is not ready.
- On a new computer, even if you already have a brain elsewhere: Claude finds it before creating anything.

## How it goes

1. **Is there a brain already?** Before anything, Claude looks, without changing anything, whether you already have a brain: on this computer (in your personal folder and its sub-folders, in `C:\DEV` or `~/dev`), or on your GitHub if it is connected there (one question asked of GitHub, nothing is copied). It only tells you about it when it finds something.
  - A brain in a folder of this computer: Claude tells you where, and takes it up as it is with your agreement.
  - A brain on your GitHub: it is the same brain on a second computer, and Claude hands over to `/brain:add-second-computer`.
  - Nothing found: Claude asks you once whether you keep a brain elsewhere, for instance a cold copy on a drive, which it restores rather than starting from nothing.
2. **The computer**: Node in version 22.16 or later (the engine that runs the brain's search), git (the tool that keeps the history of your notes) and your git identity (the name and email that sign every save) are checked, then installed or updated if needed. On Windows, Claude installs and the app asks for your approval at each step. On a Mac, you install and Claude guides, because the installers ask for the Mac's password in a window of their own. On Linux, anything that needs administrator rights is typed by you. As long as the brain does not exist, Claude opens a page in your browser that shows the whole start: every part, what is done, what is being done, what waits.
3. **The brain itself**: Claude asks you what it will be for, its domains and its types of notes, then where you want it to live, proposing a folder named `brain` in your personal folder and writing its full path. It builds it with you through `/brain:create`, with its first notes.
  - Its live view then opens in a window of its own. Keep it beside the conversation: it follows the rest of the start by itself, and Claude does not open it again at each part.
  - Its panel "Building the brain", at the top right, shows the parts and, for the knowledge, each block with its total, what is in, what is left and the notes added. You can fold it.
  - In the view, the bubbles of your domains appear: each note will go in one of them.
4. **The tools**: what will feed the brain, set up before any knowledge comes in, so that you always know where what it knows comes from.
  - Your sources, chosen with `/brain:sources`: your mail and calendar, the folders you work in, your work with Claude, sources of your own.
  - The live reading: a Claude in the background can read your conversations and your documents the same day. Claude tells you what it uses of your Claude plan before turning it on. If you want it, you create its access yourself, in a window that Claude opens for you, and you choose how much it may use in a day. If you cannot create that access right away, it can wait, and the start goes on.
  - In the view, the ring of the tools appears around your brain.
5. **The knowledge**: what already exists comes into the brain, block by block.
  - Claude counts everything first, without reading anything: your writings, what Claude already remembers of you (the memory it keeps by itself, from one conversation to the next), your conversations with Claude of the last thirty days, the documents of your watched folders, the people you exchange with by email.
  - For each block it gives an estimate of what reading it would use of your Claude plan and how long it would take, and you choose: now, later, or never.
  - Your writings come first, so that your brain holds your own words within the hour. Each block is followed element by element: how many are in, how many are left, how many notes they added. A block is only said to be in once a program has counted it.
  - Conversations and documents are read in the background, a few at a time, over as many days as it takes: the start goes on meanwhile, and the notes arrive on the map as they are written.
6. **The executive floor**: your own skills and the guards that frame them, left in Claude Code's folders, are kept in your brain with `/brain:executive`, and Claude finds them as before. If you have none, Claude says nothing of it. In the view, the crown of the harnesses appears.
7. **The life of the brain**: the alert, which tells you the same day when something goes wrong (with a test email so that you see where it arrives), then the evening save and the weekly review, set up with `/brain:add-routines`. The last modules of the creation are then offered, such as the online copy or the search by meaning. On the ring of the view, each tool then shows when it runs next.
8. **Stopping and coming back**: you can stop at any moment. What is done stays done, what you kept for later waits, and `/brain:start` takes it up from there.

## What it creates for you

- A computer ready: Node and git installed or updated if needed
- Your **identity** (name and email) recorded, to sign the brain's saves
- If you already had a brain, that brain taken up as it is, and never a second one beside it
- Your **brain**, in the place you chose, built with `/brain:create`
- Its **live view**, with the panel of the building for the whole start
- What you chose along the way: your sources, the live reading with its access and its cap for the day, what already existed, your skills and guards, the alert email, the automatic tasks
- A **record of how your start stands**, kept on this computer: what is in place, what you declined, what you kept for later, and what each block of the knowledge counted at the outset
- The **page of the start**, in your browser, which shows that record and follows it by itself
- The place of the plugin, noted for the evening save

## Prerequisites

- Claude Code (the desktop app or the command line), with the Hypervibe Brain plugin installed
- An internet connection, for the installations
- On Windows: Windows' app installer ("App Installer", free in the Microsoft Store). If it is missing, Claude tells you, you install it, then you run `/brain:start` again.
- On a Mac: your Mac's password, which the installers will ask for
- To find a brain on GitHub: the GitHub command-line program, connected to your account (optional: without it, Claude asks you the question)
- For the live reading only: a Claude subscription, and the Claude command-line program, which Claude helps you install if it is missing

## Tips

{{callout:warning|After an installation, really quit the app}}
The Claude app only looks for Node when it starts. If Claude cannot reach the brain, it asks you to quit the app completely (on a Mac: the Claude menu, Quit, not just closing the window), to open it again, then to run `/brain:start` again.
{{/callout}}

{{callout:info|On a Mac, prefer the official Node installer}}
The official installer puts Node where the Claude app finds it. With Homebrew, the app sometimes does not see it, even after a restart: going through the official installer usually settles it.
{{/callout}}

{{callout:warning|Never paste the access token into the conversation}}
The background Claude works with a token, a lasting access to your Claude account. You create it and store it yourself, in a window Claude opens: it stays on your computer, in a file only your account can read, and Claude never sees it. It is not kept in a vault, on purpose: a vault closes itself after a few hours, and the background reading would stop with it. If it ever ends up in a conversation, Claude tells you to revoke it and create another one.
{{/callout}}

{{callout:info|The costs given are estimates}}
Reading a conversation or a document uses about 100,000 to 200,000 tokens of your Claude plan, most of it context read again. With a subscription nothing is billed for it, but it counts toward your plan's limits. That is why the knowledge is counted before anything is read, and why the background reading stops by itself each day at a cap you choose.
{{/callout}}

{{callout:tip|You can stop at any moment}}
Answering "later" loses nothing. Every step and every block can wait, and `/brain:start` always begins by telling you where you stand.
{{/callout}}
