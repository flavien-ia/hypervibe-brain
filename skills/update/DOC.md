# /brain:update

Brings the Hypervibe Brain plugin up to its latest published version. Claude checks whether a newer one exists, tells you which, and installs it with your agreement. **Your brain is never touched**: only the plugin's own files change.

## When to use it

- You want to know whether a new version of the plugin came out
- You installed the plugin by uploading a zip in the Claude app, and nobody tells you about new versions
- You heard of a fix or a new feature and want it

## How it goes

1. **The check**: Claude compares your version with the latest one published on the plugin's public repository, and tells you where you stand.
2. **Depending on your install**: if you uploaded a zip, Claude downloads the new version and checks it. If you installed it from the public repository, Claude runs Claude Code's own update commands.
3. **The download is checked**: the file received is compared with the fingerprint GitHub computed when the version was published. If they differ, nothing is installed.
4. **The swap**: the new version is unpacked and checked aside, then takes the place of the old one, which is kept aside. At the slightest problem, the old one comes back.
5. **The evening save**: Claude arms it again at the same time, so that it runs the new version.

## What it creates for you

- The plugin up to date, with its new skills and fixes
- A copy of the previous version, kept aside until you ask for it to be deleted
- An evening save that runs the new version

## Prerequisites

- An internet connection
- The plugin installed on this computer (it is the one that updates itself)

## Tips

{{callout:info|Close and reopen Claude}}
Once the update is done, close and reopen Claude: that is when it loads the new version.
{{/callout}}

{{callout:tip|What changed}}
Every published version has its page on the public repository, with the list of its changes. Claude gives you the link when an update is available.
{{/callout}}

{{callout:warning|If the download does not match}}
Claude stops and installs nothing. Try again later; if the difference persists, do not force the install.
{{/callout}}
