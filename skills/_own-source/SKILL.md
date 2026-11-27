---
name: _own-source
description: Internal - defines with a person a source of their own for their second brain. Something the brain follows by itself (their posts, a CRM, a reading app, a feed, a capture address by email), read by a small program or done by Claude, or a program of theirs that runs with the brain. Called by /brain:sources and /brain:_mail-calendar. Not meant to be invoked directly by users.
user-invocable: false
---

# A source of their own

Beyond what every brain has, each person has sources of their own: their posts kept in some database or export, the talks in their agenda, a reading app, a CRM, a feed... If they have not named one yet, ask: **"is there something else, somewhere, that you would like your brain to follow by itself?"**, and suggest from what you know of them.

## Communication
- Reply in the person's language. Define the source with them in plain words first; the program or the instructions come after.

## Where things stand

`node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" list` shows the ones already defined.

## A capture address

**One to offer to everyone who has the mail source.** A thought on the go, sent by email to an address of theirs (an alias such as `brain@...`, or a label or a subject word such as `[brain]`), becomes a seed. Ask which address or mark they want. If they do, define it as a source done by Claude, every week, type the brain's note type, and write its instructions with them: search the mail sent to that address (or bearing that mark) since the source's last success; each message becomes one seed, its subject as the title, its text reworded as a note (never pasted whole), its source `mail:<message id>`, and nothing else from the mailbox is read. A person who wants it every evening instead needs a small program that reads their mail by itself (a `script` source, with a key of their own): define it with them the same way.

## Define it with them

For each one they want, define it **with them**, in plain words first:

1. **What it reads**, and where (a folder of exports, a web address, a database, an app...).
2. **What becomes a note, what goes to the catalogue, and what is left out** (a comment, a duplicate). Decide it yourself first, then show the person the split in one line each, before anything is written:
   - **A note** is what the brain thinks with: an idea, a decision, a lesson, a project, a person, a text they wrote to say something.
   - **A catalogue entry** is what the brain must find again but not think with: many items alike whose data lives in their own tool (their posts on a network, artworks, products, events of an agenda, videos, orders). The brain keeps its address, title, date and a short excerpt, finds it by search, and reads it again where it lives (`brain_fetch`). The sign: there are tens or hundreds of them, each says little alone, and nobody would link one to an idea.
   - A source may give both (a blog: its articles as notes, its pages of products as entries). In which of the brain's types and domains its notes go.
   Say it plainly, for instance: "Your 400 posts go to the catalogue: your AI finds them by search, without 400 notes; the three posts where you set out your method become notes." The person decides; their word wins.
3. **How often**: every day or every week. A program can also run during the day (`--every hour`, or minutes such as `30m`), when what it reads moves often and the background program is on (`routines.mjs hub on`); a source done by Claude is weekly.
4. **Whether a note may be refreshed later** (the likes of a post, the date of an event): only while it is still a seed, and only by this source. Never a validated note.
   **Unless the source brings finished objects** (their posts, articles, talks given: records of something done, not thoughts): then its notes may be born trusted (`--finished`), and with `--updates` it keeps each record up to date, **as long as nobody has touched that file since**. One edit by hand and the record is the person's, never rewritten. A thought, a draft, anything to judge: seeds, always.
   A record of something done may also have no text at all (a video published without a word): it still gets its note. A thought without text never does.
   **A machine zone**: if the source must keep a few lines up to date inside existing notes, even validated ones (a count of messages in a person's note, a figure), give it a named zone (`--zones figures`). It then rewrites only what is between `<!-- figures:auto -->` and `<!-- /figures:auto -->` in the note, never a character outside. Say it plainly to the person, with the brain's rule: the machine creates notes; on a validated note it never rewrites the person's text: it may only add a fact that says where it comes from, and keep its own machine zones up to date, as this one would, only between its own marks. On a validated concept or idea, or a validated note of nature decision or lesson, which is the person's thinking, it adds nothing: it proposes the change in the weekly letter.
   Whatever it brings, an item whose `source` is already a note's source is that note: nothing is ever doubled, even a note written before the source existed. A note may also go into a subfolder of its type (`"folder": "linkedin"` puts a publication in `publications/linkedin/`).
5. **Which kind**:
   - **read automatically** (`script`): when the source can be read without judgment (a file, an API, a database). You write a small program with them: it reads and prints the notes to create, and the plugin writes them, with every check. A key it needs goes in the brain's `.env`, pasted by the person, never in the conversation. **For a person who has a Hypervibe vault, the key stays in the vault**: the program reads it from there, and the source names the vault items it needs in its `source.json` (`--needs <ITEM>[,<ITEM>]` on the `add` below). Say what that implies: while the vault is closed the source is on hold, which is not a breakdown; the vault's window is offered, the source runs by itself at the first pass that finds the vault open, and the live view shows a small key beside a source that waits.
   - **done by Claude** (`claude`): when it needs judgment or a browser (a website without an API, a feed to sort). You write, with them, the instructions Claude will follow during the weekly review.

Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" add <name> --kind <script|claude> --every <day|week|hour|30m> --type <type> --domains <d1,d2> --description "<one sentence>" [--updates] [--finished] [--zones <name>] [--entries replace] [--needs <ITEM>[,<ITEM>]]
```

For the catalogue, the program prints its entries as `{ "kind": "entry", ... }` lines (the contract at the top of its `run.mjs` gives the fields). `--entries replace` when it sends its whole list at each run: an item it no longer sends then leaves the catalogue. Without it, it sends what is new or changed, and the entries stay.

It creates `sources/<name>/` in the brain, with a `run.mjs` whose contract is written at its top, or an `instructions.md`. Write it with them.

## A script is tested before anything is written

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" test <name>
```

It runs the program, checks every note it would create, and writes nothing. Show the person the count and the three first notes, and the count and the three first catalogue entries (`entries`, `entrySample`) when it has some; adjust until they say "that's it". Then **their approval, on this computer**: a program that comes with the brain (a clone on another computer, a restored copy) never runs by itself, and a program that changed must be approved again (the program itself, and every file of the brain it uses). Explain it in one sentence. **The approval is theirs to give, never yours**: you open a window for them, where they see the program's name and its files and type yes.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/trust.mjs" window
```

If no window opened (`opened: false`), give them the line of `byHand` to paste in a terminal of their own. Once they say it is done (`trust.mjs state` no longer lists it):

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" run <name>
```

The first run brings everything the source holds: say how many notes before running it if there are many, and check five of them together afterwards (same care as `/brain:ingest`). Afterwards, the evening save runs it at its rhythm, from its last success.

## A source done by Claude is done once together

Do it once together now, following its instructions, then record it: `node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" mark <name> --ok --created <n>`. The weekly review does it afterwards.

## A step of their own

A program that brings no note but must run with the brain every evening or week (`step`), such as publishing a copy of the brain for an app of theirs, mirroring some notes elsewhere, or checking something. Same care as a script (written with them, approved on this computer, a key in `.env`, or in their Hypervibe vault named with `--needs`), and one more question: **before** the brain's index is rebuilt, or **after** the evening's save.

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" add <name> --kind step --every <day|week> --when <before|after> --description "<one sentence>" [--needs <ITEM>[,<ITEM>]]
node "${CLAUDE_SKILL_DIR}/../../scripts/trust.mjs" window
node "${CLAUDE_SKILL_DIR}/../../scripts/sources.mjs" run <name>
```

(The window is where they approve the step themselves, as for a script; run it once they have.)

What it prints is its report, kept with its last success or error, and read in the weekly review.

## End

One line: what the new source reads, how often, and when it next runs. Then hand back to the skill that called you.
