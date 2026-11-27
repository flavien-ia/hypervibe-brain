---
name: add-cloud
description: Make your second brain reachable from the cloud, read only, by the online agents you choose - a copy on your own Cloudflare account in Europe, behind a door with one token per agent.
---

# /brain:add-cloud - The brain, reachable from the cloud

## Communication
- Reply in the person's language. Plain words: "a copy of your brain on your Cloudflare account, that only the agents you give a key to can read", never "a D1 database behind a Worker".

## What to say first (translated)

> Claude on this computer reads your brain directly. An agent that runs online (or a device without your brain) cannot. This module puts a **copy** of your brain on your own Cloudflare account, in Europe, and a small server in front of it that answers the same questions as here, **read only**.
> Nobody enters without a key. You create one key per agent, and each key has three rights, closed by default: reading the content of your private notes, seeing email addresses, and reading your skills.
> What it implies: a free Cloudflare account; your notes' text, their links, your directory and your search vectors are copied there every evening. Two things only go if you choose it: the text of your private notes, and your skills. It stays on the free plan for a personal brain.

Ask whether they want it. It is set up on the computer that runs the brain.

## What goes, what does not (say it before Step 2, in these plain terms)

- **Goes**: the text of the notes that are not private, their links, the contacts directory, the data of search by meaning.
- **A private note**, unless the person chooses to copy private notes: only its title, its type, its domains and its dates. Not its text, not its source, not the links it makes, not its data of search by meaning (which is the text in another form).
- **The skills** (the person's own know-how, on the executive floor) and the rules of their guards: **nothing, unless the person chooses it**. When they do, each skill is read first: one that seems to hold a key, a password or a server's account **is not sent**, and Claude says which skill and which line. A skill whose head says `cloud: false` never goes.
- **Never**: the scripts and files of a skill's folder (only their names), the danger zone, the keys of the brain's `.env` (but the one key of search by meaning, given to the server as a secret).

## What a key sees without a right (say it when the person chooses the rights)

- **Without the right to private notes**: a private note by its title, its type, its domains and its dates. Never its text, its source, the links it makes, nor the notes close to it by meaning.
- **Without the right to addresses**: for each contact, their name, how many messages and since when, **the subjects of the exchanges** and what is known of them, with every email address in those texts replaced by `[address hidden]`. Never the address nor its domain, and the search does not look into them. The person must know that names and subjects are visible: an agent that should not know who they write to must not be given a key at all, or the directory must stay out (`/brain:contacts`). An address written in the text of a note is note text: it is read like the rest of the note.
- **Without the right to skills**: no skill, not even their names.

## Step 1 - Cloudflare

`npx wrangler@4 whoami`. Not connected: `npx wrangler@4 login` opens the browser; the person signs in (creating a free account at cloudflare.com if needed). Check again. (Always with its version, `wrangler@4`: it is the one the plugin runs, and a tool fetched without a version is whatever was published last.)

## Step 2 - The copy, in Europe

Ask two questions, one after the other. Both default to **no**.

1. **Copy the text of private notes too?** No: a private note then exists in the cloud by its title only (see above): on the computer the person's AI reads it, but it does not leave without this yes. Yes only if an agent really needs them, and that agent will need the right as well.
2. **Copy your skills too?** Only asked if the brain has skills (`executive/skills`). No: no skill and no rule of a guard leaves the computer. Yes only if an online agent must follow them. Before the person answers, show them what would go:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" setup [--include-private] [--include-skills]
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" skills
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" sync
```

`setup` creates a database and a storage space **in the European jurisdiction** (it can only be chosen at creation: never create them by hand in the Cloudflare dashboard). `skills` alone changes nothing: it lists `wouldSend` (or `sends`), `heldBack` (the skills in which something looks like a secret, with the lines) and `keptHere` (those marked `cloud: false`). Read the three lists to the person. They can change their mind at any time: `cloud.mjs skills on` or `cloud.mjs skills off`, then `sync` (off removes the skills from the cloud copy).

The first sync sends everything; the next ones only what changed. The evening save does it every evening on this computer. If their Cloudflare access is a token kept in their Hypervibe vault rather than a `wrangler login`, an evening that finds the vault closed skips the copy without failing, and the next one that finds it open catches up (the copy goes by difference).

**When a sync answers `skillsHeld`** (and a `warning`): one or more skills were NOT sent because they seem to hold a secret; everything else went. Tell the person which skill, which file and which lines, with the kind found ("a password", "a server's address with its SSH account"). **Never read the value aloud nor copy it into the conversation.** Then offer the two ways out: move the secret out of the skill (a key belongs in a vault or a settings file, the skill then names where it is), or keep that skill on the computer by adding `cloud: false` to its head. If the person says it is not a secret (an example, a placeholder), reword that line so it no longer looks like one.

## Step 3 - The server, and its check

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" deploy
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" verify
```

`deploy` gives its address (`url`). Its key for search by meaning is the brain's own (from its `.env`), passed directly with the address of the service it is for, never displayed; `meaning: false` means the brain has none, and the cloud then searches by words only (`/brain:add-embeddings`, then `deploy` again). `meaningRefused` says why a key was not sent: a key only goes to its own service (an OpenAI key is never sent to another host, and nothing is sent to an address that is not https); pass the sentence on and follow it. The door is closed at this point: no key exists (`tokens: 0`). **The server is a copy of the plugin's code**: after each update of the plugin, `deploy` is run again (`/brain:update` does it), and a `sync` that answers `serverBehind: true` says it was not: run `deploy`, it changes no key and no data. `verify` checks it from outside through the real protocol: the door refuses without a key, a throwaway key (that lives only during the check) reaches the six tools and no skill, the copy holds as many notes as the computer and a search answers, private notes and addresses stay closed, then the throwaway key is removed and refused. It takes up to a few minutes (a new version needs some seconds to reach every Cloudflare server). It must answer `ok: true`; otherwise `failed` names each check that did not pass: say which, fix, and run it again.

## Step 4 - A key per agent

For each agent the person wants to open the door to: its name, and the rights it needs (none by default). Say what each right opens, and what the key sees without it (above).

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" token create <agent-name> [--private] [--addresses] [--skills]
```

**The key never appears in the conversation**: it goes to the clipboard (or, if there is none, into a file whose path is given; `value` in the answer says which). `active: false` means the server did not receive it (not deployed yet, or Cloudflare refused): the key opens nothing until `deploy` is run again. Tell the person to paste it right away into the agent's settings, with the address from Step 3, as a header `Authorization: Bearer <key>`, then to copy something else. **If it went into a file, that file holds the key in clear**: tell the person to delete it once pasted (revoking the key deletes it too). For Claude Code on another device, for instance: `claude mcp add --transport http brain <address> --header "Authorization: Bearer <key>"`.

The brain keeps only the print of each key (`cloud/tokens.json`): who was given access, to what, since when. The server receives that list again at every sync.

- Close a door: `node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" token revoke <agent-name>`. `ok: true`: effective at once. **`ok: false`: the key is NOT revoked** (the server could not be told): say so in those words, never "it is done", and follow `next` (check the Cloudflare access and run it again; to close everything at once, delete the secret `TOKENS` of the server in the Cloudflare dashboard).
- The list: `cloud.mjs token list`.

## To stop everything

To keep the door and empty the copy (nobody reads it for now): `cloud.mjs empty` removes everything from it and stops the evening copy; `cloud.mjs resume`, then `cloud.mjs sync --all`, fills it again.

To remove it for good: revoke every key; then, with the person, delete the Worker, the database and the storage space in their Cloudflare dashboard, and remove `cloud` from `brain.json`.

## End

Three lines: the address, which agents have a key (and which rights), and what was chosen for the private notes and the skills.
