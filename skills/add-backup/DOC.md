# /add-backup

Protects your brain against loss: **a private online copy on GitHub**, **a cold copy** every week in a place you choose, or both. Both are recommended, because they do not protect against the same accidents.

## When to use it

- Your brain exists only on your computer and you do not want to lose it to a breakdown, a theft or an accident
- You want to be able to go back to a past version of a note
- You want a complete offline archive that depends on no account
- You are preparing to put the brain on a second computer (`/add-second-computer` needs the online copy)

## How it goes

1. **What already exists**: Claude looks at which protection is already in place, tells you, and offers only the rest.
2. **The choice**: Claude explains the two protections, then asks which one you want: the online copy, the cold copy, or both.
3. **The online copy, the account**: Claude checks that your computer is connected to GitHub. If not, it gives you a one-time code and opens your browser: you sign in, or create a free account. On a Mac, the GitHub tool is installed first from GitHub's website.
4. **The online copy, the private space**: with your explicit agreement, Claude creates a private space on your account and sends the whole brain there with its history. Always private, never public.
5. **Sending by itself**: Claude asks whether the brain may send its saves to GitHub by itself (at each capture and every evening), or only when you ask. It is a permission you give or not.
6. **The cold copy, the place**: you say where to keep it. An external drive or a USB key is the safest; a synced folder (Dropbox, iCloud Drive, OneDrive) is fine too. One constraint: not inside the brain itself.
7. **The first cold copy**: Claude makes it right away, verifies it before keeping it, and gives you the file created and the number of saves it holds.
8. **Afterwards**: the evening save makes a new one every seven days. If it is not set up, Claude says so and offers `/add-routines`.

## What it creates for you

- A **private space on your GitHub account**, with your whole brain and its history
- If you agree to it, **automatic sending** of the saves to GitHub
- A **cold copy**: the whole brain and its history in a single file, in the place you chose
- A new cold copy every week, with the **last eight** kept
- Two closing lines: what is now protected, and how

## Prerequisites

- A brain already created (`/create-brain`)
- For the online copy: a free GitHub account (Claude guides you to create it)
- For the cold copy: a place to keep it, and no account
- For the cold copy to renew itself: the evening save (`/add-routines`)

## Tips

{{callout:tip|Why both}}
The online copy saves you if the computer is lost or broken, and lets you get back any past version of a note. The cold copy survives even the loss of both the computer and the GitHub account at the same time.
{{/callout}}

{{callout:info|Restoring from a cold copy}}
One sentence to keep: open a conversation, say "restore my brain from its cold copy", and give the file. Claude puts the brain back in place on the computer, and the search rebuilds itself at the first question.
{{/callout}}

{{callout:warning|Drive not plugged in: not an error}}
If the external drive is not plugged in on the evening the cold copy was due, nothing breaks: that week has no copy, the next one will. Without the evening save, the cold copy is only made when you ask for it.
{{/callout}}
