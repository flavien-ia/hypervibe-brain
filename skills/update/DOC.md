# /brain:update

Brings the Hypervibe Brain plugin up to its latest published version. Claude checks whether a newer one exists, tells you which, and installs it with your agreement. **The update never touches your brain**: only the plugin's own files change. Afterwards, Claude may offer to bring a setting of your background reading in step with the new version, and does it only on your yes.

## When to use it

- You want to know whether a new version of the plugin came out
- You installed the plugin by uploading a zip in the Claude app, and nobody tells you about new versions
- You heard of a fix or a new feature and want it

## How it goes

1. **The check**: Claude compares your version with the latest one published on the plugin's public repository, and tells you where you stand.
2. **Depending on your install**: if you uploaded a zip, Claude downloads the new version and checks it. If you installed it from the public repository, Claude runs Claude Code's own update commands.
3. **The download is checked**: the file received is compared with the fingerprint GitHub computed when the version was published. If they differ, nothing is installed.
4. **The swap**: the new version is unpacked and checked aside, then takes the place of the old one, which is kept aside. At the slightest problem, the old one comes back. On Claude Desktop, that copy only serves during the swap itself: Desktop deletes it on its own a few minutes later, so Claude never promises it there.
5. **The evening save**: Claude arms it again at the same time, so that it runs the new version.
6. **The live view**: if it is on, it moves to the new version by itself and its window reloads. Claude checks that it did.
7. **The background reading**, if you have it: an update never rewrites what was installed in your brain, so Claude looks at whether its two readers have what the new version counts on (the proof that each item was read to its end, the reading of PDFs) and offers to add what is missing. If their access to Claude is kept only in your Hypervibe vault, Claude offers to copy it to a file on your computer, without ever showing it: a vault closes itself after a few hours, and the reading would stop with it.

## What it creates for you

- The plugin up to date, with its new skills and fixes
- A copy of the previous version, kept aside until you ask for it to be deleted (except on Claude Desktop, which deletes it on its own)
- An evening save that runs the new version

## Prerequisites

- An internet connection
- The plugin installed on this computer (it is the one that updates itself)

## Tips

{{callout:info|Close and reopen Claude}}
Once the update is done, close and reopen Claude: that is when it loads the new version. On Claude Desktop, the Plugins screen keeps showing the number of the version you uploaded: that is normal, and Claude tells you which version runs.
{{/callout}}

{{callout:tip|What changed}}
Every published version has its page on the public repository, with the list of its changes. Claude gives you the link when an update is available.
{{/callout}}

{{callout:warning|If the download does not match}}
Claude stops and installs nothing. Try again later; if the difference persists, do not force the install.
{{/callout}}
