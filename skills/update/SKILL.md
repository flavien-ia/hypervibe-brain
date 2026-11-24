---
name: update
description: Update the Hypervibe Brain plugin to its latest published version, whether it was installed from the public repository or uploaded as a zip, then bring the evening save in step.
---

# /brain:update - Update the plugin

Brings **this plugin** to the latest version published on its public repository (`flavien-ia/hypervibe-brain`, one GitHub release per version, with the plugin as a zip and its fingerprint). The update itself never touches the person's brain: only the plugin's own files. Afterwards, Step 4 may offer to bring a setting of the brain's own readers in step, on the person's yes.

## Communication
- Reply in the person's language. Plain sentences, no jargon: "I am checking whether a newer version exists", "I am replacing the plugin's files", never "unzip" or "backup directory" without saying what it is.

## Step 1 - Check

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/update.mjs" check
```

Read the JSON:

- `offline: true` → "I cannot reach the update server right now, try again a little later." **Stop.**
- `ok: false` otherwise → pass on `message` in one sentence. **Stop.**
- `updateAvailable: false` → "Your plugin is up to date (version `localVersion`)." Go to Step 4 (the evening save may still be behind), then stop.
- `updateAvailable: true` → announce the two versions and, if useful, the `releaseNotes` link (what changed). Then, by `mode`:
  - `upload` (the zip uploaded in the Claude app) → ask: "Shall I download and install it?" Wait for the yes, then Step 2.
  - `marketplace` (installed from the public repository) → Claude Code updates it with its own commands, the ones in `commands`. Offer to run them; with the yes, run them one after the other, then Step 4.
  - `folder` (the plugin comes from a folder of this computer, `folder`) → it is the person's own copy, nothing is written in it. Say so: once that folder holds the new version (for a clone of the repository, a `git pull` in it), the two `commands` bring the installed plugin in step. Offer to run them, then Step 4.
  - `unknown` → say this copy was installed in a way the skill does not recognise, and that uploading the new zip in Customize > Plugins replaces it. Give the `releaseNotes` link, where the zip is. **Stop.**

## Step 2 - Download

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/update.mjs" download
```

The JSON gives `file`, `version`, `sha256` and `sha256Verified`. **The download checks itself** against the fingerprint GitHub computed when the version was published:

- `reason: "sha256-mismatch"` → **stop**: the download does not match what was published, nothing was installed. Do not retry blindly, do not install anyway.
- `version` different from the `publishedVersion` of Step 1 → say so plainly and offer to try again later. **Stop.**
- any other `ok: false` → pass on `message`. **Stop.**

## Step 3 - Install

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/update.mjs" install --zip "<file from step 2>"
```

The script unpacks the archive aside and checks it is a whole plugin **before** touching the installed one; then it moves the current folder aside for the swap and puts the new one in its place. On any failure the previous version is put back.

- `ok: true` → note `version`, `oldVersion`, `backup`, `backupKept` and `desktop` (for Step 5). Step 4.
- `ok: false` → nothing was replaced, or the previous version was put back. Say so with `message`. **Stop.**

## Step 4 - Bring the evening save in step

The background program keeps running the version it started with until it is handed over. If `node "<plugin folder of the new version>/scripts/routines.mjs" hub state` says it is on, run `routines.mjs hub on` from the new version's folder: it takes over at once, and the background readers use the new version from their next pass.

The evening save runs a small launcher written when it was armed, and it knows where the plugin was at that moment. After an update, that launcher may be an old one, or point to the old copy. Re-arming it at the same time is harmless and fixes both:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
```

If `armed` is true, re-arm it at its `time`, **with this command run from the new version of the plugin** (after a marketplace or folder update, the new copy lives in a new folder: run the command from the plugin folder that `claude plugin list` or the registry names for the new version, never from the old one):

```bash
node "<plugin folder of the new version>/scripts/routines.mjs" arm --time <time>
```

Say it in one sentence ("the evening save now runs the new version"). If nothing was armed, say nothing.

**The live view** (`/brain:live`), when it is on, follows an update by itself: a view that runs hands over to the new version, and its window reloads. Check it, again from the new version of the plugin:

```bash
node "<plugin folder of the new version>/scripts/live.mjs" state
```

- `installed` is true and the view is not `running`, or `current` is false: run `live.mjs on` from that same folder. It rewrites the small program that starts the view and starts the new one. Say nothing when everything is in step.
- `installed` is false with no `turnedOff` (the person never had the view: it came with this version): run `live.mjs on` from that same folder, and say it in one sentence: "this version comes with a live view of your brain; it is on, `/brain:live` shows it or turns it off".
- `turnedOff` (they turned it off themselves) or `standalone: true` (an older copy of the view, from before it was part of the plugin): change nothing.

**The readers of the live reading**, if the brain has them (`node "<plugin folder of the new version>/scripts/sources.mjs" install --list` shows `conversations` or `documents` as `installed`). An update never rewrites what was installed in the brain, so a reader installed by an earlier version may lack what the new one counts on. Two things to look at in the brain's `sources/<name>/source.json`, each offered in one sentence and done on their yes, with nothing else changed in the file:

- `"proof": true` is missing from `conversations` or `documents`: `node "<plugin folder of the new version>/scripts/sources.mjs" set <judge> proof on`, provided the reader's `instructions.md` is still the standard text. With it, an item that was not read to its last page comes back on the pile instead of being believed read.
- the documents reader does not open PDFs: see `/brain:_live-sources`, "A documents source from before PDFs".

**The token of these readers**, on the same condition: `node "<plugin folder of the new version>/scripts/judge-token.mjs" state`. `found: "vault"` (or `places.vault` `locked` with nothing found elsewhere) means their access to Claude is kept only in the Hypervibe vault, which closes itself after a few hours and stops every background reader with it. Its place is now a file of this computer: invoke `/brain:_judge-token`, which recopies it there without showing it. `found` is `file` or `env`: nothing to do, say nothing.

## Step 5 - Wrap up

> **Hypervibe Brain is up to date (version `<version>`).** Close and reopen Claude so it loads the new version.

After an upload install, depending on the JSON of Step 3:

- `backupKept: true` → add: *"The previous version is kept aside (`brain-backup-<old version>`): once everything works, you can ask me to delete it."* If a backup from an **earlier** update is still there and the plugin works, offer to delete that one too.
- `backupKept: false` → **never promise a backup.** The plugin does not live in a marketplace folder (on Claude Desktop, the registry of uploaded plugins deletes every folder it does not know a few minutes after an update, the backup included). The backup only served to undo the swap if it had failed. Say nothing about it, unless the person asks: then say exactly that.
- `desktop: true` → add one sentence: *"Claude Desktop will keep showing the old number in its Plugins screen, that is normal: the version that runs is `<version>`."* (Desktop shows the version of the upload, never the one on disk.)
