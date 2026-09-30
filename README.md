# Hyperbrain

**A second brain for Claude Code.** Your ideas, projects, the people who matter to you, what you have written and decided, as linked markdown notes. Claude consults them from any conversation, without being asked, and knows how to write to them properly.

*[Version française](README.fr.md)*

## What you get

- **Your notes are yours**: plain markdown files in a folder of your choice, in your own git repository (private GitHub backup recommended). No cloud service, no lock-in.
- **Claude reads your brain everywhere**: the plugin's MCP server tells every session that your brain exists and when to consult it.
- **Search by words and by meaning**: every word, anywhere, accents ignored; and, with an OpenAI key (a few cents for thousands of notes), by meaning.
- **A trust model**: what the machine writes enters as a `seed`, never overwrites what you validated, and becomes `trusted` once it has taken root. Private notes are never shown to an AI.
- **It lives on its own**: a save every evening (no AI, no cost) and a weekly review by Claude.
- **You choose what it does**: search by meaning, online backup, evening save, weekly review, work journal, mail and calendar, watched folders, cold copy. Each one is explained with what it implies before you choose.
- **You see it**: a map of your notes, as a page on your computer, or as a private web app if you use Hypervibe.
- **In your language**: Claude speaks yours, and everything the plugin writes for you (your brain's documents, the weekly report, the history, the notes' own format) is in French or English, from your computer's settings.
- **Your own types of notes**: talks, books, clients, artworks... proposed from what your computer shows, and validated with you.
- **Windows, macOS and Linux**.

## Install

Requirements: Claude Code (desktop app or CLI). Node 22.13+ and git are checked, and installed if needed, by the first skill.

```
/plugin marketplace add flavien-ia/hyperbrain-harness
/plugin install hyperbrain@hyperbrain-harness
```

Then, in a new session: **`/hyperbrain:start-hyperbrain`**.

## The skills

**The core**, what every brain has:

| Skill | What it does |
|---|---|
| `/hyperbrain:start-hyperbrain` | Checks this computer (Node, git, your git identity), installs what is missing, offers to create the brain. |
| `/hyperbrain:create-brain` | The guided construction, like Hypervibe's `/bootstrap`: the decisions, the creation and first notes, the sources, then the modules you want. Resumes where you left off. |
| `/hyperbrain:brain-sources` | What feeds the brain: your mail and calendar, the folders you work in, your work with Claude, your existing writings, and sources of your own, defined with you. |
| `/hyperbrain:brain-contacts` | A directory of the people you exchange with by email, searchable in every conversation; only those who matter become notes. |
| `/hyperbrain:brain-ingest` | Bring one of your writings in (notes, articles, documents), three trial notes first. |
| `/hyperbrain:brain` | Capture a thought, classified right away (searches first, never duplicates). |
| `/hyperbrain:brain-review` | The weekly review: what is new, what the sources brought, promotions, orphans, proposed links. |
| `/hyperbrain:brain-status` | Where the brain stands, and the next useful step. |

**The modules**, proposed at the end of `create-brain`, or added whenever you want:

| Family | Skill | What it does |
|---|---|---|
| Protect | `/hyperbrain:add-backup` | A private copy on GitHub, a weekly cold copy in a place you choose, or both. |
| Make it live | `/hyperbrain:add-routines` | A save every evening (no AI, no cost), a review every week by Claude, and a letter by email that sums it up. |
| Use | `/hyperbrain:add-meaning` | Search by meaning. |
| | `/hyperbrain:brain-viz` | See the brain as a map: a page on your computer, or a private web app if Hypervibe is installed. |
| Extend | `/hyperbrain:add-second-computer` | The same brain on a second computer, kept in sync through its private GitHub copy. |
| | `/hyperbrain:add-cloud` | The brain readable from the cloud, read only, by the online agents you give a key to (your own Cloudflare account, in Europe). |

## How it is built

- **The code lives in the plugin, the brain is only data**: a plugin update repairs every brain at once. The brain is found through `~/.hyperbrain/config.json`.
- **Zero dependency**: the database is the SQLite built into Node, the MCP server speaks its protocol by hand. Nothing to install, nothing that breaks on install.
- **The index is rebuilt from the notes**, by itself, whenever a note moved. The vectors of the search by meaning are versioned in git, one small file per note: a clone gets its semantic search back without a single paid call.
- `tests/banc.mjs` plays the whole journey in a throwaway folder, with a fake home and a fake embeddings API; `tests/banc-sync.mjs` plays two computers around a local GitHub; `tests/banc-cloud.mjs` plays the cloud copy with a fake wrangler and the real Worker. Run all three after any change.

## Related

**Hyperbrain entreprise** is a separate tool: mapping a company's data and building its business ontology.

## License

Apache-2.0.
