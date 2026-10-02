# /brain:add-cloud

Makes your brain **readable from the cloud, read only**, by the online agents you choose. A copy is placed on your own Cloudflare account, in Europe, behind a small server that answers only the agents you gave a key to.

## When to use it

- An agent that runs online needs to consult your brain
- You want to query your brain from a device that does not have it
- You want to give each agent a separate access, which you can close at any time
- You want to see the list of keys handed out, or remove one

## How it goes

1. **The explanation**: Claude tells you what this module does and what it implies, then asks whether you want it. It is set up on the computer that runs the brain.
2. **The Cloudflare account**: Claude checks that your computer is connected to Cloudflare. If not, it opens your browser: you sign in, or create a free account.
3. **Private notes**: a single question. Should the text of private notes be copied too? By default no: a private note then exists online by its title only.
4. **The copy, in Europe**: Claude creates a database and a storage space on your account, in the European jurisdiction, then sends the brain there. The first sending holds everything, the next ones only what changed.
5. **The server**: Claude puts it online and gives you its address. At this point the door is closed: no key exists.
6. **The check**: Claude verifies from outside that the door refuses without a key, that a throwaway key gets the same answers as on the computer, that private notes and addresses stay closed, then that the throwaway key, once removed, is refused.
7. **A key per agent**: for each agent, you give its name and the rights it needs (none by default). Claude creates the key and puts it in your clipboard. You paste it right away into the agent's settings, with the server's address.

## What it creates for you

- A **cloud copy** of your brain, on your account, in Europe, updated every evening by the evening save
- A **small read-only server**, with its address, which answers the same questions as the brain on your computer
- **A key per agent**, with two rights closed by default: reading the content of private notes, and seeing email addresses
- A **record of accesses** in the brain: to whom, to what, since when (the print of each key, never the key itself)

## Prerequisites

- A brain already created, and being on the computer that runs it
- A free Cloudflare account (Claude guides you to create it)
- The evening save (`/brain:add-routines`) for the copy to stay up to date
- For search by meaning online: that it is already on in the brain (`/brain:add-meaning`), the server uses the same key

## Tips

{{callout:info|What is copied online}}
The text of your notes, their links, your directory and the data of search by meaning. The text of private notes only if you chose it, and the agent must also have been given that right. A personal brain stays within Cloudflare's free plan.
{{/callout}}

{{callout:warning|The key is never displayed}}
It goes to the clipboard (or, failing that, into a file that Claude points you to). Paste it right away into the agent's settings, then copy something else or delete the file. Never create the database or the storage space yourself in Cloudflare: the European jurisdiction can only be chosen at creation.
{{/callout}}

{{callout:tip|Closing a door, or stopping everything}}
Ask Claude to remove an agent's key: the effect is immediate. To stop everything, Claude removes every key, then together you delete the server, the database and the storage space in your Cloudflare dashboard.
{{/callout}}
