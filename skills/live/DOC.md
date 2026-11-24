# /brain:live

Shows your brain live, in a window of its own on your computer: **the map of your notes**, which light up the moment Claude reads or writes them, **what feeds your brain** around it, and **what it costs**. Once turned on, the view starts with your session and stays ready. The same skill opens it or turns it off.

## When to use it

- You want to see what your brain holds, as a map rather than as a list
- You want to watch what Claude reads in your brain while you work with it
- You want to know what the background reading of your conversations and documents uses, and set a limit
- You want to pause a source, change how often it runs, or say what must never be read
- You want to take back something the machine wrote in a note
- You want to go through the notes the machine wrote and validate the ones that are right

## How it goes

1. **The presentation**: Claude says what the view shows and what it implies, before turning anything on.
2. **Where things stand**: whether the view already starts with your session, and whether it is running right now.
3. **Turning it on**: Claude makes the view start with your session, starts it right away, and opens its window. There is nothing to install: the view comes with the plugin.
4. **The window**: it opens without an address bar, in Chrome or Edge if you have one of them, otherwise in your usual browser. You can install it as an app from the page, to give it its own icon.
5. **On a new brain**: the view says itself what is still missing (no note yet, no source, the reading during the day not started) and gives you each time the sentence to say to Claude.
6. **Turning it off**: you say "turn off the live view". It no longer starts with your session, and the one that runs is stopped. Your brain does not change.

## What it creates for you

- A **window on your brain**, with two views of the map: by domain, and by meaning once the search by meaning is on
- The **sources and data** around the map, each with what it did this week and when it runs next
- An **activity panel**: which conversations are reading the brain right now, and the latest notes written
- A **usage page**: what Claude reads in your brain, and what the background reading costs, day by day
- A **settings page**: the rhythm of each source, its pause, the model and the daily limit of what reads in the background, what it must never read
- An **index** of everything the brain can find again, and a **history** of what each source wrote, where a write of the machine is taken back in one click
- A way to **validate the seeds**: a "Seeds" filter that shows the notes the machine wrote and nobody validated yet, a "Validate" button on each (or the V key), and "Next seed" to go to the following one (or the N key). No validation in bulk: to validate is to say "I read it, it is right". Once a note is validated, the machine never rewrites your text: it may only add a fact that says where it comes from, and on a validated concept, idea, decision or lesson it adds nothing and proposes the change in the weekly letter
- One small file that starts the view when your session opens, removed when you turn it off

## Prerequisites

- A brain already created (`/brain:create`)
- A browser on this computer; Chrome or Edge to have the window without an address bar

## Tips

{{callout:info|It stays on your computer}}
The view is a page that only this computer can open, and even there it answers only with a key kept for your account, which its window receives by itself. Nothing is sent anywhere, and it uses no AI by itself: it shows what the brain and Claude are doing.
{{/callout}}

{{callout:tip|Its own icon}}
In Chrome or Edge, the page offers to install the view as an app. It then has its own icon, which you can pin to the taskbar or the Dock, and opens like any other program.
{{/callout}}

{{callout:info|A small key beside a source}}
A source whose key is kept in your Hypervibe vault does not run while the vault is closed, and the view shows a small key beside it. It is a wait, not a breakdown: the source runs by itself as soon as the vault is open again.
{{/callout}}

{{callout:info|After a plugin update}}
There is nothing to do. A view that is running moves to the new version by itself, and its window reloads.
{{/callout}}

{{callout:warning|The first time on a Mac}}
macOS may show a notification saying that an item named "node" was added in the background: it is this view. Switching it off in the settings stops the view from starting with your session.
{{/callout}}
