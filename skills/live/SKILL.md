---
name: live
description: See your second brain live - the map of your notes in a window of its own, lighting up as Claude reads and writes them, with what feeds the brain and what it costs. Turn the view on, open it, or turn it off.
---

# /brain:live - See the brain live

A window on this computer that shows the brain as it lives. Present it in these words (translated), before turning anything on:

> You can watch your brain live, in a window of its own:
> - **the map of your notes**, by domain or by meaning, where a note lights up the moment Claude reads it or writes it;
> - **around it, what feeds your brain** (your conversations, your folders, your own sources) and what each is doing right now;
> - **what it all costs**: what Claude reads in your brain, and what the background reading of your conversations and documents uses;
> - **the settings**: how often each source runs, a pause, a limit per day, what must never be read;
> - **a history**, where anything the machine wrote can be taken back in one click;
> - **your say on what the machine wrote**: a note it wrote is a seed until you validate it, and a "Validate" button on the note does it.
>
> It is a page on this computer only: nothing leaves it, no other computer can open it, and on this one it answers only with a key that your account alone holds, which its window receives by itself. Once turned on, it starts with your session and stays ready; it uses no AI by itself.

## Communication
- Reply in the person's language. Plain words: "a window on your computer", "it starts when you open your session", never "a local server", "a port" or "a process", unless the person asks how it works.
- The view shows, and lets the person settle a few things by themselves (a pause, a limit, a write taken back, a seed validated). What it suggests to say ("turn on the reading of my conversations"...) is for you: when the person repeats one of these sentences, do it with the skill it belongs to (`/brain:sources`, `/brain:add-routines`, `/brain:capture`, `/brain:add-embeddings`).

## Where things stand

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/live.mjs" state
```

One JSON line:

- `brain` is null: no brain yet. Offer `/brain:create` and stop.
- `installed` (it starts with the session) and `running` (it is up right now): say it in one sentence, then ask what the person wants: see it, turn it on, turn it off.
- `turnedOff`: they turned it off themselves, on that date. Nothing turns it on again in their place; this skill does, when they ask.
- `standalone: true`: an older copy of the view, from before it was part of the plugin, already shows this brain. Say so plainly, open it if they want to see it (**Open it**), and change nothing else: switching to the plugin's own view is done by hand, by the person who installed that copy.
- `otherBrain` or `portTaken`: the view's usual address on this computer is used by something else (another account's brain, another program). Say so, and offer another one: every command below then takes `BRAIN_LIVE_PORT=<a free port, for instance 47616>` in front of it; `on` remembers it.
- `current: false` while `running`: the view that runs comes from another version of the plugin (after an update). **Turn it on** again brings it in step.

## Turn it on

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/live.mjs" on
```

It makes the view start with the session from now on (one small file where the computer looks when the session opens, `startup` in the answer), starts it right away, and answers `running: true` with its `url`. Then open it (next section), so that the person sees it at once.

The view asks for a key on every request but its ping: made the first time it starts and kept in `~/.hypervibe-brain/live-token.json` (readable by this account alone), it reaches the page by itself when the page is opened, and the plugin's own programs read it from the file. Nothing for the person to do: never show the key nor paste it anywhere.

- `ok: false` with `error`: say it in plain words. A view that is installed but whose server did not start: read the end of `~/.hypervibe-brain/logs/live-server.log`, explain, fix.
- `standalone: true`: as above, nothing was changed.
- On a Mac, the first time, macOS may show a notice that an item named "node" was added in the background: it is this view. Tell them before they wonder.

## Open it

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/live.mjs" open
```

It starts the view if it is not running, then opens it in a window of its own (Chrome or Edge without an address bar; otherwise the default browser). `opened` says which. Tell the person the window is open, and in one sentence what they are looking at.

If the view was never turned on, `open` still works: the view then stops by itself a few minutes after its window is closed. Offer to turn it on so that it is always ready.

In Chrome or Edge the page offers "Install the app": the view then has its own icon, which can be pinned to the taskbar or the Dock. Worth saying once.

## Validate the seeds from the view

A note the machine wrote enters as a seed, drawn as such on the map, and stays one until the person validates it or the weekly review finds it has taken root. The view is where they do it at their pace: the "Seeds" filter shows only the notes not validated yet, a "Validate" button on a note the machine wrote makes it trusted (the V key does the same on an open note), and "Next seed" goes to the following one (the N key). There is no button to validate in bulk, on purpose: a note is validated once read. Say it once when the view opens on a brain that has seeds.

What a validation means, to say with it: the machine creates notes; on a validated note it never rewrites the person's text: it may only add a fact that says where it comes from, and keep its own machine zones up to date. On a validated concept or idea, or a validated note of nature decision or lesson, which is the person's thinking, it adds nothing: it proposes the change in the weekly letter. It is the person's act, never yours: when they ask you to validate a note they name, after reading it, the same thing is done by

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/promote.mjs" --note <slug>
```

Never validate a note on your own judgment: a note is trusted because the person said so (the command refuses an AI that says it is one). A note validated by mistake goes back the same way: a button of the view, or `promote.mjs --note <slug> --to seed`. Either way the change is written in the brain's journal and can be undone.

## A small key beside a source

A source whose key is in their Hypervibe vault does not run while the vault is closed, and the view shows a small key beside it. It is a wait, not a breakdown: nothing is lost, the source runs by itself at the first pass that finds the vault open, and opening the vault is all there is to do. The Claude that reads in the background never waits for the vault: its token is kept in a file of this computer.

## What they see on a new brain

A brain just created has little to show, and the view says so itself, each time with the sentence to say to Claude: no note yet, no source that feeds it, the program that runs the sources not started, the search by meaning not turned on. When the person comes back with one of these sentences, it is a request like any other: do it.

## Turn it off

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/live.mjs" off
```

The view no longer starts with the session, and the one that runs is stopped (`stopped`). Nothing of the brain changes: the view only showed it. Say that `/brain:live` brings it back.

## After a plugin update

Nothing to do: a view that runs moves to the new version by itself, and the next session starts the new one. To check, `state` must say `current: true`; if not, run `on` again.
