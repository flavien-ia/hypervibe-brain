---
name: add-meaning
description: Let your second brain find a note even when you search with other words than its own - search by meaning, for a few cents. Sets up the key without it ever going through the conversation.
---

# /brain:add-meaning - Search by meaning

## Communication
- Reply in the person's language. Plain words: "search by meaning", never "embeddings" or "vectors" unless they ask.

## Step 1 - What it is, and what it implies

> Today your brain finds a note when you use its words. With search by meaning, it also finds it when you use other words: "the book I want to write" finds your note titled "Novel project".
> What it implies: an account at OpenAI and a key; a few cents for thousands of notes, then only the changed notes; the text of your notes that are not private is sent to OpenAI to be turned into numbers (private notes never are).

Ask whether they want it. Check first: `node "${CLAUDE_SKILL_DIR}/../../scripts/status.mjs" --json` (`searchByMeaning` already true: say so and stop).

## Step 2 - The key, never through the conversation

1. No account or key yet: platform.openai.com, sign in, "API keys", create a key, and add a small credit in "Billing" (a few dollars last for years).
2. Create `<brain folder>/.env` with the single line `OPENAI_API_KEY=` (the file is already kept out of the history and of every copy), and open it in their text editor: `start "" "<file>"` on Windows, `open -e "<file>"` on a Mac, `xdg-open "<file>"` on Linux.
3. Ask them to paste the key after the `=`, save, close, and tell you when done. **Never ask them to paste it in the conversation.** If they do anyway, tell them to create a new key and delete that one.

Another OpenAI-compatible service works too: add `EMBEDDINGS_BASE_URL=<its address>` and `EMBEDDINGS_API_KEY=<its key>` instead.

## Step 3 - First computation, and proof

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/build.mjs"
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" set meaning on
```

The `vectors` line says how many were computed. Then show it: `brain_search` with `meaning: true` and words that appear in none of their notes, and let them see the right note come up.

## End

One line: search by meaning is on, and what it cost (the number of notes; a few thousand cost a few cents).
