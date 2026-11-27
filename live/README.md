# The live view

The live view of a second brain: the map of its notes in a local window, where
the notes light up as an AI reads them, conversation by conversation, with the
tools around the brain (the sources that feed it, the data it reads on demand)
and what each of them is doing.

It is part of the plugin: `/brain:live` turns it on, and `scripts/live.mjs`
installs it, starts it, opens it and stops it. This page is for someone who
works on it.

It reads the brain; it never writes a note itself. The few things it can
change (the rhythm or the pause of a source, a judge's settings and its cap of
tokens per day, what a judge never reads, the answer to a judge that holds a
pile too big to read without asking, "run now", the name of a territory, one
write of the machine taken back from the history window, a seed the person
validates with the "Validate" button of its card, which the plugin's
`promote.mjs` does) go
through the plugin's own files and scripts.

A source whose key is in a closed Hypervibe vault (the person's password
vault, not the brain's `vault/` folder) is drawn with a small key: it waits in
`~/.hypervibe-brain/queue.json` and runs at the first beat that finds the vault
open. It is a wait, not a failure.

## Start

Node 22.16 or later, and a brain created by the plugin. No install step: the
view has no runtime dependency.

```bash
node scripts/live.mjs open     # starts the server if needed, then opens the window
node scripts/live.mjs on       # starts it with the session from now on, and now
node scripts/live.mjs off      # no longer with the session, and stops it
node scripts/live.mjs state    # installed, running, port, brain, version
node live/server.mjs           # the server alone, in the foreground (to see an error)
```

The window opens in application mode (no address bar) in Chrome, else Edge,
else the default browser. The server listens on `127.0.0.1:47615` only, and
stops by itself three minutes after the last window is closed, unless it was
started with `--permanent` (what `on` and the start with the session do).

Everything under `/api/` but the ping asks for the view's token. It is made
the first time a server starts and kept in `~/.hypervibe-brain/live-token.json`
(readable by the person's account alone where the system has such rights); the
page gets it in a cookie when it is itself asked for, and a program of the
computer (the plugin's suggestion hook) reads the file and sends it in the
header `x-brain-token`.

The brain is the one the plugin's own scripts find: `HVBRAIN_DIR`, else the one
noted in `~/.hypervibe-brain/config.json` (`brain`). The plugin is the folder
above this one: its scripts are loaded from `../scripts`.

## Where it runs from, and what an update does

The server holds nothing of the plugin's folder: it stands in
`~/.hypervibe-brain`, and looks at the date of its own files every two seconds
instead of watching them (on Windows a folder with a watched file inside cannot
be renamed, and an update of the plugin renames it). So:

- its code changes where it is (a developer's edit, an uploaded update that
  swaps the plugin's folder): it checks the syntax, hands the port over to a
  successor, and only leaves once the successor answers;
- a newer version of the plugin appears in another folder (an update through
  Claude Code's own commands), named by Claude Code's registry of plugins or by
  `pluginRoot` in the plugin's settings: it hands the port over to that copy;
- its own folder is removed: it moves to the copy that is left, or to whatever
  the launcher (`~/.hypervibe-brain/live-launch.mjs`) finds;
- the brain moves (`brain` changes in the settings): it starts again on it.

The open pages see another server when they reconnect, and reload.

## Environment variables

| Variable | What it does |
|---|---|
| `BRAIN_LIVE_PORT` | The port (47615 by default). `live.mjs on` keeps it in the settings, where the launcher and the plugin's suggestion hook read it. |
| `HVBRAIN_DIR` | The brain's folder, instead of the one in the plugin's settings. |
| `HVBRAIN_HOME` | Where `.hypervibe-brain/` is, instead of the home folder. |
| `HVBRAIN_CLAUDE` | The `claude` command used to propose the names of the territories. |

## Language

Everything in the code is English. What the person reads is in the brain's
language: `lang` in its `brain.json`, French or English, anything else falls
back to English. The texts the server words are in `i18n/en.mjs` and
`i18n/fr.mjs`; those the page words are in `page/i18n/en.js` and
`page/i18n/fr.js` (a key missing from French falls back to English). The
page learns the language from the server (`vocabulary.lang`, with the map or
alone at `/api/vocabulary`) and remembers it, so that it starts in it at
once the next time.

## The files

- `server.mjs`: the local server. It serves the page, the map and the tools
  as JSON, one note on a click (through the plugin's engine, private notes
  included: the brain is there to be read), and the live feed as Server-Sent
  Events. It watches the plugin's journal and the vault, and only reads the
  lines added. It refuses any request without the view's token, or that does
  not come from its own page or from a program of the computer (`Host`,
  `Origin`, `Sec-Fetch-Site`), and everything that has an effect is POST only. `/api/ping` says who answers: `brain-live`, the brain,
  then one JSON line (its process, the plugin's version and folder).
- `brain.mjs`: the brain as the plugin's index gives it (notes, links,
  vectors, weights), and its words (`brain.json`).
- `territories.mjs`: the territories of meaning of the Semantic view, kept in
  the brain's `index/territories.json`.
- `tools.mjs`: the tools around the brain, from what the sources and the data
  registry declare, and the folders the brain watches.
- `journal.mjs`: the brain's journal, read once and then only its new lines.
- `activity.mjs`: what a tool did, when its sources run next, what a write
  changed in a note (from git), and which writes can be taken back.
- `judges.mjs`: what the judges cost (their runs, from the journal), where
  each stands today (its cap, a pile it holds), and what is asked to them
  through the plugin (`sources.mjs exclude`, `judge.mjs catch-up`).
- `i18n.mjs`, `i18n/`: the texts in the person's language.
- `logo-claude-code.json`: the logo of the one tool every brain has.
- `contract.d.ts`: the shapes of everything the server and the page exchange.
- `page/`: the page, with no library and no build step: plain files, loaded
  as modules.
  - `index.html`, `base.css`, `style.css`: the page of the brain; `base.css`
    holds what every page shares (the colours, the tooltip, the modal).
  - `main.js`: starts everything; its header lists the modules.
  - `lang.js`, `i18n.js`, `i18n/en.js`, `i18n/fr.js`: the language and the
    texts; `storage.js`: what the browser remembers.
  - `api.js`: one function per route, typed with `contract.d.ts`; `data.js`
    reads what the page keeps, `stream.js` applies what arrives afterwards.
  - `state.js`: what the page knows at a given moment.
  - `map.js`: where everything sits on the map (pure computation);
    `arrange.js`: the map for the current view and layers.
  - `canvas.js`, `paint-background.js`, `paint-live.js`: the two canvases;
    `camera.js`, `pointer.js`: the framing, and the hand on the map.
  - `panel.js`, `note-card.js`, `tool-card.js`: the cards on the right.
  - `search.js`, `filters.js`, `activity.js`: the search, the filters box,
    the activity panel.
  - `usage.js`, `settings.js`, `index-page.js`, `legend.js`: the four full
    pages (usage, settings, index, legend).
  - `judges.js`: where the judges stand, and the judge that waits for an
    answer (on the activity panel, in the settings, on the usage page).
  - `validate.js`: a seed validated from its card, and the seeds the filters
    leave validated at once (the plugin's `promote.mjs` does it).
  - `setup.js`: what the brain still lacks (no note, no source, no judge, the
    hub off, a judge without its key), said where it shows, each with what to
    say to Claude.
  - `shortcuts.js`, `install.js`, `tooltip.js`, `modal.js`, `dom.js`,
    `format.js`: the keys, the installed app, the tooltip, the dialogs,
    reaching the elements, writing texts, numbers and dates.
  - `history.html`, `history.js`: the history window of a tool, where a
    write of the machine is undone (the plugin's `undo.mjs` does it);
    `legend.html`, `legend-page.js`: the legend alone.
  - `manifest.webmanifest`, `manifest.fr.webmanifest`, `icon-*.png`,
    `icon.ico`: the installed app, in each language.

## Development

```bash
cd live
pnpm install   # typescript and the Node types, for checking only
pnpm check     # type-checks the server files, then the page, against contract.d.ts
```

`pnpm check:server` and `pnpm check:page` check one of the two alone.

Nothing at runtime needs `node_modules`. The files of this check
(`package.json`, `pnpm-lock.yaml`, the two `tsconfig.json`, `contract.d.ts`)
and this page are left out of the published plugin (`.gitattributes`).

The server restarts itself when one of its files changes, and the open pages
reload when anything under `page/` changes.
