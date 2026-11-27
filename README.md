# Hypervibe Brain

**A second brain for Claude Code.** Your ideas, projects, the people who matter to you, what you have written and decided, as linked markdown notes. Claude consults them from any conversation, without being asked, and knows how to write to them properly.

*[Version française](README.fr.md)*

## What you get

- **Your notes are yours**: plain markdown files in a folder of your choice, in your own git repository (private GitHub backup recommended). No cloud service, no lock-in.
- **Claude reads your brain everywhere**: the plugin's MCP server tells every session that your brain exists and when to consult it.
- **Search by words and by meaning**: every word, anywhere, accents ignored; and, with an OpenAI key (a few cents for thousands of notes), by meaning.
- **A trust model**: what the machine writes enters as a `seed`, and becomes `trusted` once you validate it (a button in the live view, or a word to Claude) or once it has taken root. On a note you validated, the machine never rewrites your text: it may only add a fact that says where it comes from, and keep its own machine zones up to date; on your own thinking (a validated concept, idea, decision or lesson) it adds nothing and proposes the change in the weekly letter.
- **Everything in it is read by your AI**: what it must not read stays out of the brain. A private note is read like any other; its text is only kept out of what you share (the cloud copy, unless you chose it, and the shared map).
- **It lives on its own**: a save every evening (no AI, no cost), a weekly review by Claude, and, if you want it, a reading during the day: every half hour, a Claude in the background reads your settled conversations and the documents you changed, and writes what they teach.
- **You choose what it does**: search by meaning, online backup, evening save, weekly review, work journal, mail and calendar, watched folders, the reading during the day, cold copy. Each one is explained with what it implies before you choose.
- **You see it**: a map of your notes, as a page on your computer, or as a private web app if you use Hypervibe.
- **In your language**: Claude speaks yours, and everything the plugin writes for you (your brain's documents, the weekly report, the history, the notes' own format) is in French or English, from your computer's settings.
- **Your own types of notes**: talks, books, clients, artworks... proposed from what your computer shows, and validated with you.
- **Windows, macOS and Linux**.

## Install

Requirements: Claude Code (desktop app or CLI). Node 22.16+ and git are checked, and installed if needed, by the first skill.

```
/plugin marketplace add flavien-ia/hypervibe-brain
/plugin install brain@hypervibe-brain
```

**From a zip, in the Claude app (the simplest)**: take the file `hypervibe-brain-<version>.zip` from [hypervibe.fr/brain](https://hypervibe.fr/brain) (the same file comes with each [release of the repository](https://github.com/flavien-ia/hypervibe-brain/releases/latest)). Without unzipping it, open **Customize > Plugins**, choose **Upload a plugin** and give it the zip file. No command to type.

**To update**, whatever the install: **`/brain:update`**.

Then, in a new session: **`/brain:start`**. It guides the whole start and resumes where you stopped; the skills below can each be run on their own afterwards.

## The skills

**The core**, what every brain has:

| Skill | What it does |
|---|---|
| `/brain:start` | The whole start, part after part, picked up where you left off: a look for a brain you already have (here or on your GitHub), this computer made ready, the brain itself with its live view, the tools that feed it, then the knowledge that already exists, each block counted and its cost said before it begins, your skills and guards, and the routines that keep it alive. |
| `/brain:create` | The guided construction, like Hypervibe's `/bootstrap`: the decisions, the creation and first notes, the sources, then the modules you want. Resumes where you left off. |
| `/brain:sources` | What feeds the brain: your mail and calendar, the folders you work in, your work with Claude, your existing writings, and sources of your own, defined with you. |
| `/brain:contacts` | A directory of the people you exchange with by email, searchable in every conversation; only those who matter become notes. |
| `/brain:ingest` | Bring one of your writings in (notes, articles, documents), three trial notes first. |
| `/brain:capture` | Capture a thought, classified right away (searches first, never duplicates). |
| `/brain:review` | The weekly review: what is new, what the sources brought, promotions, orphans, proposed links. |
| `/brain:executive` | What your AI knows how to do: your own skills and the guards (hooks) that frame them, kept in the brain next to what it knows, so that another computer or another AI finds them. Claude Code still calls each skill by its `/name`; a guard is locked against the AI's writes. |
| `/brain:status` | Where the brain stands, what needs you first (an alert, a background reading that is down), and the next useful step. |
| `/brain:update` | Brings the plugin to its latest published version, and the evening save with it. |

**The modules**, proposed at the end of `/brain:create`, or added whenever you want:

| Family | Skill | What it does |
|---|---|---|
| Protect | `/brain:add-backup` | A private copy on GitHub, a weekly cold copy in a place you choose, or both. |
| Make it live | `/brain:add-routines` | A save every evening (no AI, no cost), a review every week by Claude, and a letter by email that sums it up. |
| Use | `/brain:add-embeddings` | Search by meaning. |
| | `/brain:viz` | See the brain as a map: a page on your computer, or a private web app if Hypervibe is installed. |
| | `/brain:live` | See the brain live, in a window of its own: the notes light up as Claude reads and writes them, with what feeds the brain and what it costs. |
| Extend | `/brain:add-second-computer` | The same brain on a second computer, kept in sync through its private GitHub copy. |
| | `/brain:add-cloud` | The brain readable from the cloud, read only, by the online agents you give a key to (your own Cloudflare account, in Europe). |

## The live view

`/brain:live` opens a window on your brain as it lives: the map of your notes, which light up the moment Claude reads or writes them; around it, the sources that feed the brain and what each is doing; what the background reading of your conversations and documents costs; the settings of each source (its rhythm, a pause, a limit per day, what must never be read); a history where anything the machine wrote is taken back in one click; and a way to validate what it wrote: a "Seeds" filter, a "Validate" button on each note the machine wrote, and "Next seed". A source that waits for your vault to be opened carries a small key there: it is a wait, not a breakdown.

It is a page that only your computer can open (`127.0.0.1`), and only with the view's own token, kept on your computer (`~/.hypervibe-brain/live-token.json`): another account of the computer, or a web page, cannot read your brain through it. No dependency and no build step. It comes with the plugin (`live/`), starts with your session once you turned it on (`scripts/live.mjs on`, `off`, `open`, `state`), and follows a plugin update by itself. On a brain just created it says what is still missing (no note, no source, the reading during the day not started), each time with the sentence to say to Claude.

## Two floors

The brain has two floors. **The knowledge** (the notes) is what you know, think and decided. **The executive floor** is what your AI knows how to do: your own skills and the hooks that frame them, in the `executive/` folder of your brain. A skill lives in the brain, and Claude Code finds it where it always looks, through a link: an improvement of the skill is an improvement in your brain. A guard lives there too, and the AI can neither change nor move it (only you do). The plugins you install are shown beside them, not moved: each is a product with its own repository. On a new computer, `/brain:executive` puts everything back. **Another AI plugged into your brain** (Codex, Cursor, Claude Desktop...) gets your skills from the brain's server: as prompts it can show you, and through a tool, `brain_skill`, with which it reads one by itself; what in them speaks only to Claude Code is translated for it. Your guards cannot stop another AI's steps (they are hooks of Claude Code): it receives them as rules to keep, and to ask you first. See `docs/executive.md`.

In the live view, the **Harnesses** layer shows the executive floor as a crown around the ring of tools: one arc per harness (your skills, then each plugin), each turned towards the tools its skills use. A skill lights up the moment your AI uses it.

## How it is built

- **The code lives in the plugin, the brain is only data**: a plugin update repairs every brain at once. The brain is found through `~/.hypervibe-brain/config.json`.
- **Zero dependency**: the database is the SQLite built into Node, the MCP server speaks its protocol by hand. Nothing to install, nothing that breaks on install.
- **The index is built from the notes**, by itself, whenever a note moved, and only for what changed: the notes that differ are written again, the others stay. The vectors of the search by meaning are versioned in git, one small file per note: a clone gets its semantic search back without a single paid call.
- `tests/banc.mjs` plays the whole journey in a throwaway folder, with a fake home and a fake embeddings API; `tests/banc-sync.mjs` plays two computers around a local GitHub; `tests/banc-cloud.mjs` plays the cloud copy with a fake wrangler and the real Worker; `tests/banc-update.mjs` plays an update of the plugin without the network; `tests/zones/*.mjs` check each part of the plugin (writes, background program and judges, index and search, live view, skills and documentation). Run them after any change.

## Related

**Hypervibe Brain entreprise** is a separate tool: mapping a company's data and building its business ontology.

## License

Apache-2.0.
