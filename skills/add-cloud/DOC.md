# /brain:add-cloud

Makes your brain **readable from the cloud, read only**, by the online agents you choose. A copy is placed on your own Cloudflare account, in Europe, behind a small server that answers only the agents you gave a key to.

## When to use it

- An agent that runs online needs to consult your brain
- You want to query your brain from a device that does not have it
- You want to give each agent a separate access, which you can close at any time
- You want to see the list of keys handed out, or remove one
- You want to choose again what leaves your computer: your private notes, your skills

## How it goes

1. **The explanation**: Claude tells you what this module does, what goes online and what does not, then asks whether you want it. It is set up on the computer that runs the brain.
2. **The Cloudflare account**: Claude checks that your computer is connected to Cloudflare. If not, it opens your browser: you sign in, or create a free account.
3. **Private notes**: a first question. Should the text of private notes be copied too? By default no: a private note then exists online by its title only, with its type and its dates. Nothing drawn from its text leaves.
4. **Your skills**: a second question, if your brain holds skills. Should they be copied too? By default no. Before you answer, Claude shows you which ones would go. Each skill is read first: one that seems to hold a key, a password or a server's account is not sent, and Claude tells you which one and at which line.
5. **The copy in Europe**: Claude creates a database and a storage space on your account, in the European jurisdiction, then sends the brain there. The first sending holds everything, the next ones only what changed. Nothing of what was sent stays in a file on your disk.
6. **The server**: Claude puts it online and gives you its address. At this point the door is closed: no key exists.
7. **The check**: Claude verifies from outside that the door refuses without a key, that a throwaway key gets the same answers as on the computer, that private notes, addresses and skills stay closed, then that the throwaway key, once removed, is refused.
8. **A key per agent**: for each agent, you give its name and the rights it needs (none by default). Claude creates the key and puts it in your clipboard. You paste it right away into the agent's settings, with the server's address.

## What it creates for you

- A **cloud copy** of your brain, on your account, in Europe, updated every evening by the evening save
- A **small read-only server**, with its address, which answers the same questions as the brain on your computer
- **A key per agent**, with three rights closed by default: reading the content of private notes, seeing email addresses, and reading your skills
- A **record of accesses** in the brain: to whom, to what, since when (the print of each key, never the key itself)

## Prerequisites

- A brain already created, and being on the computer that runs it
- A free Cloudflare account (Claude guides you to create it)
- The evening save (`/brain:add-routines`) for the copy to stay up to date
- For search by meaning online: that it is already on in the brain (`/brain:add-embeddings`), the server uses the same key, and only ever sends it to the service it belongs to

## Tips

{{callout:info|What is copied online}}
The text of your notes, their links, your directory and the data of search by meaning. Two things only if you chose it: the text of private notes, and your skills. Never the files of a skill's folder, and never a skill in which Claude found what looks like a secret: add `cloud: false` to the head of a skill to keep it on your computer whatever happens. A personal brain stays within Cloudflare's free plan.
{{/callout}}

{{callout:info|What a key sees without a right}}
Without the right to private notes: their title, type and dates, never their text nor anything drawn from it. Without the right to addresses: the name of each contact, how much you exchange, the subjects of your exchanges and what is known of the person, with every email address masked; names and subjects are therefore visible. Without the right to skills: none, not even their names.
{{/callout}}

{{callout:warning|The key is never displayed}}
It goes to the clipboard (or, failing that, into a file that Claude points you to, which holds it in clear). Paste it right away into the agent's settings, then copy something else or delete the file. Never create the database or the storage space yourself in Cloudflare: the European jurisdiction can only be chosen at creation.
{{/callout}}

{{callout:tip|Closing a door or stopping everything}}
Ask Claude to remove an agent's key: the effect is immediate, and if the server could not be reached Claude tells you the key still opens, instead of saying it is done. To stop everything, Claude removes every key, then together you delete the server, the database and the storage space in your Cloudflare dashboard. You can also empty the copy and keep its door, for the day an agent needs it.
{{/callout}}
