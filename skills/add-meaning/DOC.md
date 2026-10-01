# /add-meaning

Turns on **search by meaning**: your brain finds a note even when you look for it with other words than its own. It needs an OpenAI key and costs a few cents for thousands of notes. The key never goes through the conversation.

## When to use it

- You often look for a note without remembering the exact words it contains
- Your brain is growing and searching by words is no longer enough
- You want Claude to find by itself the notes close to a subject, even when it is phrased differently

## How it goes

1. **The explanation**: Claude tells you what search by meaning changes and what it implies. Example: "the book I want to write" finds your note titled "Novel project".
2. **The check**: if search by meaning is already on, Claude says so and stops there. Otherwise, it asks whether you want it.
3. **The account and the key**: if you do not have them yet, Claude guides you on OpenAI's website to create an account, a key, and add a small credit (a few dollars last for years).
4. **The key, outside the conversation**: Claude prepares a file in your brain and opens it in your text editor. You paste the key there, save, close, and tell Claude it is done.
5. **The first computation**: Claude has all your non-private notes processed, and tells you how many were.
6. **The proof**: Claude runs a search with words that appear in none of your notes, and you see the right note come up.

## What it creates for you

- **Search by meaning**, usable by Claude in all your conversations
- A **private file** in your brain, which holds the key and stays out of the history and of every copy
- One closing line: the search is on, and what it cost (the number of notes processed)

## Prerequisites

- A brain already created (`/create-brain`)
- An OpenAI account with a key and a small credit (Claude guides you to create them)
- Another OpenAI-compatible service works too: tell Claude, and it records that service's address and key instead

## Tips

{{callout:warning|Never paste the key in the conversation}}
The key is pasted only into the file that Claude opens for you. If you paste it in the conversation anyway, Claude will ask you to create a new one and delete that one.
{{/callout}}

{{callout:info|What goes to OpenAI}}
The text of your non-private notes is sent to OpenAI to be turned into numbers. Your private notes never are.
{{/callout}}

{{callout:tip|A very low cost, then almost none}}
A few thousand notes cost a few cents at the first computation. After that, only the notes that changed are computed again.
{{/callout}}
