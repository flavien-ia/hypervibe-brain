---
name: update
description: Update the Hypervibe Brain plugin to its latest published version, whether it was installed from the public repository or uploaded as a zip, then bring the evening save in step.
---

# /brain:update - Update the plugin

Brings **this plugin** to the latest version published on its public repository (`flavien-ia/hypervibe-brain`, one GitHub release per version, with the plugin as a zip and its fingerprint). The person's brain is never touched: only the plugin's own files.

## Communication
- Reply in the person's language. Plain sentences, no jargon: "I am checking whether a newer version exists", "I am replacing the plugin's files and keeping the previous ones aside", never "unzip" or "backup directory" without saying what it is.

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

The script unpacks the archive aside and checks it is a whole plugin **before** touching the installed one; then it moves the current folder aside as a backup and puts the new one in its place. On any failure the previous version is put back.

- `ok: true` → note `version`, `oldVersion` and `backup`. Step 4.
- `ok: false` → nothing was replaced, or the previous version was put back. Say so with `message`. **Stop.**

## Step 4 - Bring the evening save in step

The evening save runs a small launcher written when it was armed, and it knows where the plugin was at that moment. After an update, that launcher may be an old one, or point to the old copy. Re-arming it at the same time is harmless and fixes both:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/routines.mjs" state --json
```

If `armed` is true, re-arm it at its `time`, **with this command run from the new version of the plugin** (after a marketplace or folder update, the new copy lives in a new folder: run the command from the plugin folder that `claude plugin list` or the registry names for the new version, never from the old one):

```bash
node "<plugin folder of the new version>/scripts/routines.mjs" arm --time <time>
```

Say it in one sentence ("the evening save now runs the new version"). If nothing was armed, say nothing.

## Step 5 - Wrap up

> **Hypervibe Brain is up to date (version `<version>`).** Close and reopen Claude so it loads the new version.

After an upload install, add: the previous version is kept aside (`backup`); once everything works, it can be deleted, on request. If a backup from an **earlier** update is still there and the plugin works, offer to delete that one too.
