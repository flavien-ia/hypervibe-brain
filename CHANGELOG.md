# Changelog

## 0.3.0 (in progress)

- **Architecture like Hypervibe's `/bootstrap`**: `create-brain` builds the core (decisions, creation, first notes, sources, Claude reading it everywhere), then proposes the modules by family, each a skill of its own that can also be added later.
- **The sources are the core**: `brain-sources` sets up the living sources (mail and calendar, watched folders, work with Claude) and lists the writings to bring in.
- **`add-backup`** gathers the GitHub copy and the cold copy (one, the other, or both); **`add-routines`** replaces `brain-routines`; **`add-meaning`** sets up search by meaning.
- **Work with Claude**: the same event format as the sensors of the brain Hyperbrain grew from, and the week's commits read from each project's own history, without any global git hook.
- **`adopt.mjs`**: makes an existing brain (restored, cloned, or built before the plugin) the active one.
- **The format speaks the brain's language**: a French brain writes `titre`, `domaines`, `statut: graine`, `visibilite: prive`, `cree`, `touche`; everything it returns speaks those words. Read into one canonical shape inside the scripts.
- **The types belong to the brain**: listed in `hyperbrain.json` (type and folder), proposed at the creation from what the computer shows (`discover.mjs`: folder names and kinds of files, never a content) and validated with the person; `types.mjs add` adds one later. The types never promoted by the machine are the brain's choice too. A brain may declare paths of its vault that are not notes (`exclude`).
- Proof: the 3,048 notes of the brain Hyperbrain grew from pass the plugin's validation and indexing as they are, without a letter changed.
- **Your own sources**: each person defines, with Claude, the sources only they have (posts in a database, a reading list, an export...), kept in the brain under `sources/<name>/`. Read automatically by a small program (it only prints the notes; the plugin writes them, with every check, never twice the same) or done by Claude during the weekly review. A program runs only once approved on this computer, and again after any change. A failed run writes nothing and the next one starts from the last success. A source may refresh its own seeds, never a validated note. The evening save runs the ones that are due; the weekly report tells what each brought.
- One path to write a note (`notes.mjs`), for a capture and for a source.
- **The contacts directory** (`brain-contacts`, proposed at the creation): the people the person exchanges with, as data (`index/annuaire.json` in a French brain, `index/directory.json` in English, in git), filled from the mail through the person's own Claude connector and every week by the review, or by a source of their own. Three tiers by the brain's own thresholds; nobody rises without exchanges in both directions. A contact becomes a note only by the person's decision, its address kept in the source. A sixth MCP tool, `brain_contact`.
- Proof: the 4,649-contact directory of the brain Hyperbrain grew from is read, searched and rewritten by the plugin as it is.
- **The weekly letter** (in `add-routines`): the review, sent by email where the person reads, in the brain's language, with the structure of the letter of the brain Hyperbrain grew from (the week, the new seeds, the proposals, promotions and collisions, "Oh, by the way", the health), each item numbered so that the person answers in one sentence ("brain-review: remove seeds 3 and 8"). Sent by the person's own mail connector, to themselves, or by a Brevo or Resend key of theirs; always kept in `reviews/` for the answers to find its numbers. Rendered for Gmail and phones (inline styles, layout tables).
- **Two computers** (`add-second-computer`): the same brain on two computers, meeting on its private GitHub copy. One computer runs the brain (sources, vectors, directory, reviews, cold copy) and only it commits what it computes; the other reads and writes notes. Each computer commits and sends by itself only with the person's agreement on that computer. The synchronisation carries the rules of the brain Hyperbrain grew from: the overlap check before taking anything, taking without touching the index of other sessions (a fast-forward, or a stash given back with `--index`, never dropped), no conflict ever resolved alone, never a forced push. A capture is sent at once; every evening, each computer saves then synchronises.
- `computers.mjs` (runner, agreement, clone) and a second bench, `tests/banc-sync.mjs` (27 checks, two fake computers and a local GitHub), run by the CI on Windows, macOS and Linux.
- Test bench: 173 checks.

## 0.2.0 (2026-09-30)

- **Components**, chosen at the start of `create-brain` with what each one implies: search by meaning, online backup, evening save, weekly review, work journal (a hook of the plugin, nothing written into Claude's settings), mail and calendar (through the person's own Claude connectors), watched folders, cold copy (a weekly, verified git bundle).
- **`brain-viz`**: a map of the brain as a page on the computer; with Hypervibe, a private web app fed every evening.
- **The person's language**: the brain's documents, the weekly report, the history and the scheduled task are in French or English, from the computer's settings.
- **macOS and Linux**: synced folders as they are really named, a full PATH for the evening save, a check that Claude reaches the brain's server.
- The automatic tasks are proposed at the end of `create-brain`, in plain words.
- macOS audit applied: a node path that survives `brew upgrade`, catch-up at login after a shutdown (and at boot on Linux), never two saves at once, launchd really checked, the Mac's language read from its settings, iCloud Desktop and Documents refused, Node and git installed by the person on a Mac, FTS5 checked.
- Test bench: 101 checks, run on Windows, macOS and Linux by the CI.

## 0.1.0 (2026-09-30)

First version.

- Seven skills: `start-hyperbrain`, `create-brain`, `brain`, `brain-ingest`, `brain-review`, `brain-status`, `brain-routines`.
- MCP server with five read-only tools (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`) and session instructions.
- Evening save armed in the computer's own scheduler (Windows, macOS, Linux); weekly review as a Claude scheduled task.
- Zero dependency: SQLite from Node, MCP protocol spoken by hand.
- Test bench: 63 checks, offline.
