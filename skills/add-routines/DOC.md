# /add-routines

Sets up what happens without you asking: **the evening save** (no AI, no cost), **the weekly review** by Claude, and, if you want it, a letter by email that sums it up. The same skill is used to check these tasks, change their time or stop them.

## When to use it

- You want your brain to save itself every evening
- You want Claude to reread your brain every week and leave you a report
- You want to receive that report by email, readable on your phone
- You want to change a time, check that a task is running, or stop one

## How it goes

1. **The presentation**: Claude explains the two tasks, which are of different natures, before touching anything.
2. **Where things stand**: in two lines, what is already set up, the next run and how the last one went. Then you choose: set both up (recommended), change a time, stop a task, or nothing.
3. **The evening save**: Claude asks for the time if 9 pm does not suit you, then hands the task to your computer's scheduler. Every evening, the computer records the day's changes, rebuilds the search, and sends everything to your online copy if you have one.
4. **The immediate trial**: Claude runs the save a first time, so that you see it work. If something fails, it reads the trace, explains it in plain words and fixes it.
5. **The weekly review**: you choose the day and time (for instance Sunday 6 pm). Claude creates a scheduled task in the Claude app. If your setup does not allow it, it says so and offers the manual habit instead: once a week, you say "review my brain".
6. **The weekly letter**: Claude offers to send you the review by email. It leaves from your own mailbox (Gmail or Outlook connected to Claude), or from a Brevo or Resend account you already have. Your explicit agreement is asked before anything is sent.
7. **A first letter**: Claude sends one right away, so that you can say whether it suits you. Your preferences (shorter, another tone) are noted and followed afterwards.

## What it creates for you

- A **daily task** in your computer's scheduler, at the time you chose
- A **weekly task** in the Claude app, which runs the review without asking any question and without changing any trusted note
- If you agree to it, a **weekly letter**: what came into the brain, the seeds the machine wrote, what it proposes, and how to answer in one sentence
- Two closing lines: what is set up, and when the next run is

## Prerequisites

- A brain already created (`/create-brain`)
- For the automatic review: the Claude desktop app, open at the scheduled time
- For the letter: your mail connected to Claude, or a Brevo or Resend account with a verified sender address

## Tips

{{callout:info|Computer off in the evening}}
If the computer was off or asleep at the scheduled time, the save catches up at the next wake-up or start, and does nothing if the evening was already saved. The review, for its part, waits until the Claude app is open: your brain is on your computer, not on the internet.
{{/callout}}

{{callout:warning|On a Mac, the first evening}}
macOS shows a notification saying that an item named "node" was added in the background: it is this save, and switching it off in the settings stops it without a word. If the brain or the cold copy sits on the Desktop, in Documents, Downloads, iCloud or on an external drive, macOS will ask for a permission the first evening: keep the computer awake, or accept the question the next morning.
{{/callout}}

{{callout:tip|What each task costs}}
The evening save uses no AI and costs nothing. The weekly review uses a little of your Claude subscription. For a letter sent through Brevo or Resend, you paste the key into a file that Claude opens for you, never into the conversation.
{{/callout}}
