# The sources of the brain

> What goes into the brain, what never does, and in which order. **One source at a time**: the next one only starts when the previous one is ingested and checked. Tick `[x]` when done. (Claude writes it in {{NAME}}'s language, headings included.)

## To ingest, in order

{{SOURCES}}

## Never goes in

- Secrets (keys, passwords, `.env` contents).
- The body of emails: at most a rephrased summary, never the text.
{{EXCLUSIONS}}

## How a source is ingested

1. Agree on its exact scope (which folders, which period).
2. Three trial notes, read by {{NAME}}: format and tone are settled there, not after a hundred notes.
3. The batch, as `seed`, each note with a `source` pointing to the original.
4. Lint, build, five notes drawn at random and read together.
5. Save, and tick the box here.
