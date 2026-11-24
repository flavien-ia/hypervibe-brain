---
name: add-cloud
description: Make your second brain reachable from the cloud, read only, by the online agents you choose - a copy on your own Cloudflare account in Europe, behind a door with one token per agent.
---

# /brain:add-cloud - The brain, reachable from the cloud

## Communication
- Reply in the person's language. Plain words: "a copy of your brain on your Cloudflare account, that only the agents you give a key to can read", never "a D1 database behind a Worker".

## What to say first (translated)

> Claude on this computer reads your brain directly. An agent that runs online (or a device without your brain) cannot. This module puts a **copy** of your brain on your own Cloudflare account, in Europe, and a small server in front of it that answers the same questions as here, **read only**.
> Nobody enters without a key. You create one key per agent, and each key has two rights, closed by default: reading the content of your private notes, and seeing email addresses.
> What it implies: a free Cloudflare account; your notes' text, their links, your directory and your search vectors are copied there every evening. Your private notes' text only if you choose it. It stays on the free plan for a personal brain.

Ask whether they want it. It is set up on the computer that runs the brain.

## Step 1 - Cloudflare

`npx wrangler whoami`. Not connected: `npx wrangler login` opens the browser; the person signs in (creating a free account at cloudflare.com if needed). Check again.

## Step 2 - The copy, in Europe

Ask one question: **copy the text of private notes too?** Default no: a private note then exists in the cloud by its title only: on the computer the person's AI reads it, but it does not leave without this yes. Yes only if an agent really needs them, and that agent will need the right as well.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" setup [--include-private]
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" sync
```

The setup creates a database and a storage space **in the European jurisdiction** (it can only be chosen at creation: never create them by hand in the Cloudflare dashboard). The first sync sends everything; the next ones only what changed. The evening save does it every evening on this computer. If their Cloudflare access is a token kept in their Hypervibe vault rather than a `wrangler login`, an evening that finds the vault closed skips the copy without failing, and the next one that finds it open catches up (the copy goes by difference).

## Step 3 - The server, and its check

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" deploy
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" verify
```

`deploy` gives its address (`url`). Its key for search by meaning is the brain's own (from its `.env`), passed directly, never displayed; `meaning: false` means the brain has none, and the cloud then searches by words only (`/brain:add-embeddings`, then `deploy` again). The door is closed at this point: no key exists (`tokens: 0`). `verify` checks it from outside through the real protocol: the door refuses without a key, a throwaway key (that lives only during the check) reaches the six tools, the copy holds as many notes as the computer and a search answers, private notes and addresses stay closed, then the throwaway key is removed and refused. It takes up to a few minutes (a new version needs some seconds to reach every Cloudflare server). It must answer `ok: true`; otherwise `failed` names each check that did not pass: say which, fix, and run it again.

## Step 4 - A key per agent

For each agent the person wants to open the door to: its name, and the rights it needs (none by default).

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" token create <agent-name> [--private] [--addresses]
```

**The key never appears in the conversation**: it goes to the clipboard (or, if there is none, into a file whose path is given; `value` in the answer says which). `active: false` means the server did not receive it (not deployed yet, or Cloudflare refused): the key opens nothing until `deploy` is run again. Tell the person to paste it right away into the agent's settings, with the address from Step 3, as a header `Authorization: Bearer <key>`, then to copy something else (or delete the file). For Claude Code on another device, for instance: `claude mcp add --transport http brain <address> --header "Authorization: Bearer <key>"`.

The brain keeps only the print of each key (`cloud/tokens.json`): who was given access, to what, since when.

- Close a door: `node "${CLAUDE_SKILL_DIR}/../../scripts/cloud.mjs" token revoke <agent-name>` (effective at once).
- The list: `cloud.mjs token list`.

## To stop everything

Revoke every key; then, with the person, delete the Worker, the database and the storage space in their Cloudflare dashboard, and remove `cloud` from `brain.json`.

## End

Two lines: the address, and which agents have a key (and which rights).
