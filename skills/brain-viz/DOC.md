# /brain-viz

Shows your brain as a **map**: the notes, their links, the domains. A page on your computer, ready in a few seconds, or, if the Hypervibe plugin is installed, a private web app you open from anywhere, your phone included.

## When to use it

- You want to see at a glance what your brain holds and how the notes connect
- You want to spot isolated notes, dense domains, seeds not validated yet
- You want to move through your brain by clicking from note to note rather than by asking questions
- You want to consult your brain from your phone (with Hypervibe)

## How it goes

1. **What is possible**: Claude checks that a brain exists (otherwise it offers `/create-brain` and stops) and looks at whether Hypervibe is installed.
2. **The choice**: without Hypervibe, Claude makes the page directly. With Hypervibe, it presents both forms and what each one implies. You can do the page now and the app later.
3. **The page on the computer**: Claude builds it from your notes and opens it for you. Nothing leaves your computer.
4. **Reading the map**: Claude explains it in three lines. Colour shows the domain, size the number of links, a dashed outline a seed. At the top, a search box and filters; a click on a note opens it on the right, with its links.
5. **The private app (with Hypervibe)**: Claude prepares a sample of your data, then hands the build over to Hypervibe, which puts the app online and gives you its address. Allow about half an hour.
6. **Updating the app**: Claude asks whether the evening save may update the app online by itself. Without your explicit yes, the data is prepared every evening and sent only when you ask.
7. **The test is yours**: you open it, click around, and tell Claude what you think. It does not judge the result in your place.

## What it creates for you

- A **map page** in your brain's folder, rebuilt from the notes (it does not enter the brain's history)
- Its automatic refresh every evening, if the evening save is set up
- With Hypervibe: a **private web app**, with a single account (yours), no sign-up and no public page, with a map, a search, filters by domain and by type, a note reader and a timeline

## Prerequisites

- A brain already created (`/create-brain`)
- An internet connection to display the page (it loads its display tool online)
- For the app: the Hypervibe plugin installed
- For the automatic refresh: the evening save (`/add-routines`)

## Tips

{{callout:info|What never leaves}}
The content of a private note is never in the page nor in the app: only its title and its links are. The app's data holds no location on your computer.
{{/callout}}

{{callout:warning|What the app puts online}}
The titles and short excerpts of your notes are stored online, behind your login. The app runs on the free plans of the services Hypervibe uses, and each update is a new publication of the app.
{{/callout}}

{{callout:tip|Without Hypervibe today}}
Start with the page. Once Hypervibe is installed, run `/brain-viz` again: the app will be offered to you.
{{/callout}}
