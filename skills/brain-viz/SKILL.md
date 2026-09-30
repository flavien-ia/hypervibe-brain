---
name: brain-viz
description: See your second brain as a map - notes, links, domains. A simple page on your computer right away, or, if Hypervibe is installed, a private web app you can open anywhere.
---

# /brain-viz - See the brain

## Communication
- Reply in the person's language. Plain words: "a page on your computer", "an app on the internet protected by your login", never "a static HTML export" or "a Next.js deployment".

## Step 1 - What is possible here

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/viz.mjs" detect
```

- `brain` is null: no brain yet. Offer `/hyperbrain:create-brain` and stop.
- `hypervibe` is false: go to **The simple viewer**. At the end, tell them in one sentence that with the Hypervibe plugin (hypervibe.fr) the same map can become a private app they open from their phone, and that `/hyperbrain:brain-viz` will offer it once Hypervibe is installed.
- `hypervibe` is true: offer the choice, in these words (translated):

> Two ways to see your brain:
> - **a page on this computer**, ready in a few seconds. Nothing leaves your computer. It refreshes every evening if the evening save is set up;
> - **a private app on the internet**, built with Hypervibe, that you open from anywhere, your phone included, protected by your own login. It takes about half an hour to build. What it implies: the titles and short excerpts of your notes are stored online, behind your login (the content of your private notes never is); the app is updated every evening; it runs on the free plans of the services Hypervibe uses.
>
> Which one? (You can do the page now and the app later.)

## The simple viewer

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/viz.mjs" build
```

It writes `viz/brain.html` in the brain's folder (kept out of the brain's history: it is rebuilt from the notes). Open it for the person: `start "" "<file>"` on Windows, `open "<file>"` on a Mac, `xdg-open "<file>"` on Linux.

Explain in three lines what they see: colour = domain, size = number of links, dashed = seed (not validated yet); the search box and the filters at the top; a click on a note opens it on the right, with its links. The page needs an internet connection to load its display library. The evening save refreshes it by itself.

**The test is theirs**: ask them to open it, click around, and tell you what they think. Do not judge it in their place.

## The persistent app (with Hypervibe)

1. **The data sample**, for the app to be built against the real shape of the data:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/viz.mjs" export "<a temporary folder>/brain-graph.json"
```

2. **Build the app**: invoke `/hypervibe:bootstrap` with this brief (in the person's language, with the path of the sample):

> A private app to explore my second brain. **Admin-only interface**: a single account, mine, no sign-up, no public page at all. The data is one JSON file, `data/brain-graph.json` in the repository (a sample is at `<path>`, copy it there). It is read **only on the server**, never placed in `public/`, never sent to a browser without a valid session. Its shape: `{ name, lang, domains[], generated, nodes: [{ id, title, type, domains[], status ("seed" or "trusted" or "archived"), private (boolean: show the title only), created, excerpt, source }], edges: [{ source, target }] }`. Screens: an interactive map of the notes (colour by domain, size by number of links, seeds drawn dashed), a search, filters by domain and by type, a panel to read a note and move along its links, and a timeline of the notes by date. It must work well on a phone. No database: the file is the data.

Follow Hypervibe's own flow to the end (it deploys the app and gives its address).

3. **Plug it into the brain**: ask the person whether the evening save may **update the app online by itself** (each update is a new deployment of their app). Then:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/components.mjs" viz-app "<the app's folder>" [--auto-push]
node "${CLAUDE_SKILL_DIR}/../../scripts/viz.mjs" publish-app
```

`--auto-push` only on their explicit yes. Without it, the data is prepared every evening in the app's folder, and sent online when they ask.

4. **The test is theirs**: they open the app's address, log in, and tell you what they see.

## What never leaves

The content of a private note: neither the page nor the app ever holds it (title and links only). The app's data holds no path of the computer. Say it if the person asks what is online.
