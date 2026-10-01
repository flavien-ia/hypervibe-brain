# /add-second-computer

Puts the **same brain on two computers** (a desktop and a laptop, for instance). What you write on one is on the other the same evening, or at once when you capture a thought. The two meet on your private online copy on GitHub.

## When to use it

- You work on two computers and want the same brain on both
- You are replacing the computer that ran the brain with another one
- The synchronisation seems stuck and you want to know why
- You want to stop synchronising on one of the two

## How it goes

1. **The explanation**: Claude tells you how the two computers share the work and what it implies, before changing anything.
2. **The role of each**: one of the two **runs the brain** (it follows your sources, computes the search by meaning, keeps the directory, makes the weekly review and the letter). The other one reads and writes notes, and receives all of that. Choose the one that is on most often.
3. **The online copy**: if the brain has no copy on GitHub yet, Claude runs `/add-backup` first, then comes back here.
4. **On the first computer**: on your word, Claude marks it as the one that runs the brain. With your agreement, the brain now records and sends its changes there by itself, and Claude sends what is there a first time.
5. **On the second computer**: you open Claude there, with Hyperbrain installed (`/start-hyperbrain` first), and say "add this computer to my brain". Claude checks the access to GitHub, fetches the brain into a folder of your home space, and asks for the same agreement.
6. **The evening save, there too**: Claude runs `/add-routines` on the second computer, for the evening save only. Its evening does less: it saves its notes and synchronises, nothing else.
7. **The trial, together**: you capture a thought on one computer, say "synchronise my brain" on the other, and the note is there.

## What it creates for you

- The **whole brain on the second computer**, connected to your private GitHub copy
- A **designated computer** that runs the brain, recorded in the brain itself
- **Automatic synchronisation** on each computer where you agreed to it: every evening, and at each capture
- Two closing lines: which computer runs the brain, and when the two meet

## Prerequisites

- A brain already created, with its online copy on GitHub (`/add-backup`)
- Hyperbrain installed on both computers
- On the second one, access to the GitHub account that holds your private brain
- Your agreement, given on each computer, for the brain to send its changes by itself

## Tips

{{callout:info|A conflict overwrites nothing}}
If the same note was changed on both computers before they met, the synchronisation stops and tells you. Nothing is lost. Claude shows you the two versions, you choose or merge, and it writes the result in front of you. It never chooses in your place.
{{/callout}}

{{callout:warning|Not in a synced folder}}
On the second computer, the brain goes in a folder of your home space, never in Dropbox, iCloud or OneDrive. The synchronisation goes through GitHub, not through those services.
{{/callout}}

{{callout:tip|Changing the main computer}}
To have the other computer run the brain in turn, tell Claude: it stops the evening save and the review on the old one, gives the role to the new one, then sets the tasks up there with `/add-routines`. When offline, there is nothing to do: the delay is caught up at the next run.
{{/callout}}
