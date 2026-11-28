# Changelog

## 0.18.0 (2026-11-27)

A security release, after a full audit of the plugin, of the cloud copy and of the update.

- **Nothing in your brain runs on a computer before you said yes there.** Your guards, your skills, your brain's programs, its background readers, the services your keys are sent to and the folders it watches are each approved on each computer, in a window that shows what each one does, and asked again when they change. What was already running is approved once, as it is, at the update.
- **A guard that changed no longer decides.** Your guards run through a small launcher that checks they are the ones you approved; one that was changed is not run, and what it guards is refused until you have looked at it.
- **A background reader can do less with what it reads.** It only gets tools of known kinds, cannot copy a file of your computer into your brain, starts without the keys of your session, cannot choose where a note says it comes from, and a lesson or a decision it draws is a proposal the weekly letter shows you, never a rule.
- **What your AI is shown from your brain says what it is.** A suggestion written by a machine says "seed, not validated" and where it comes from, and a lesson a background reader drew from a document is no longer listed among your lessons before you validate it.
- **An update is installed only if it carries the author's signature.** Each version is signed and the plugin carries the matching public key: neither the site nor GitHub can sign in the author's place. An update never goes back to an older version. Your current version reaches this one the old way; from here on, every update is checked.
- **The locks hold against the ways around them.** The memory's lock and the guards' lock read a path as the disk does, and let only a plain reading name a locked place; lifting a lock or approving something is yours alone, in your own terminal.
- **The live view gives its key only to the window you open.** `/brain:live` opens it with a code that serves once; any other program that asks for the page gets a screen that says how to open the view. Your AI no longer reads that key, nor the background readers' access, with a tool or a command that names them.
- **Your skills no longer go to the cloud copy unless you choose it, and never with a secret in them.** A skill that seems to hold a key, a password or a server's account stays on your computer, and Claude tells you which line. `cloud: false` at the head of a skill keeps it there whatever happens.
- **The cloud copy gives away less.** An online agent without the right to email addresses can no longer work them out, a private note you did not choose to copy leaves by its title only, removing an agent's key tells the truth when Cloudflare cannot be reached, and nothing readable stays on your disk after a sync. `cloud.mjs empty` empties a copy nobody reads yet.
- **You can switch off one of your skills, or a whole plugin, without losing it.** Ask Claude ("switch off the skill X") or use the switch in its card in the live view. A skill leaves Claude Code at once and stays in your brain; a plugin goes off at your next session, or at once when you type /reload-plugins, which a conversation already open reminds you of. Your brain remembers it on your other computers, and another AI plugged into your brain leaves those skills out too. What is off stays visible in the live view, and a plugin that checks your AI's actions is never switched off without your yes. A guard has no switch at all.
- **Your brain tells you when one of your skills seems to hold a key or a password**: when you bring a skill in, in `/brain:status` and in the skill's card. Where it is, never its value.
- **The live view has one design, Hypervibe, and you choose the background it stands on**: Black, Night blue or Hypervibe night, in the settings, under Appearance.
- **The brain needs Node 22.16 or later.** The full-text search it relies on is not in Node before that version.
- **macOS and Linux are tested as Windows is.** Every test now runs on the three systems and on Node 22.16 and 24, and the first run found what one Windows computer could not: a skill brought into a brain reached through a link (as a Mac's temporary folder is) is seen in its place, the locks read a path written with backslashes on macOS and Linux, the journal no longer counts an event twice when its file is replaced (Linux), two backups of Claude's memory made in the same second no longer overwrite each other, and on Node 22 the reason of a failure is no longer hidden behind a warning.
- **Smaller things**: the usage journal no longer keeps the first words of your messages and forgets after ninety days; `/brain:status` tells you when other accounts of the computer can write in your brain's folder; after an update of the plugin, the online server is updated too; in the live view, a click on an empty place closes the card and unmarks what it showed, and the name of a plugin lights up under the pointer.
- **To update**: `/brain:update`, or download the new zip from https://hypervibe.fr/brain and upload it in the Claude app.

## 0.16.2 (2026-11-24)

- **Your brain keeps what your AI knows how to do.** `/brain:executive` moves your own skills and guards (hooks) into your brain, beside your notes: Claude Code still calls each skill by its /command, your AI may improve a skill but can never change a guard, and a second computer gets them all back.
- **Another AI plugged into your brain gets your skills.** Codex, Cursor, Claude Desktop or an online agent (through the cloud copy) receives them as prompts and through a `brain_skill` tool, translated for it, with your guards as rules to keep.
- **`/brain:start` builds the brain part after part**: a look for a brain you already have, the computer, the brain and its live view, its sources, the knowledge you already have (each block counted, its cost said first), your skills and guards, then its routines. It picks up where you stopped.
- **The live view shows your brain living**: notes light up as your AI reads and writes them, the sources and what each costs, a crown of what your AI knows how to do where a skill lights up when it is used, the activity of the day, and a Hypervibe design beside the Night one.
- **The Hypervibe design fits the design system to the last control**, and no hover moves anything: the checkboxes, choices, fields, menus, dialogs and tables are the design system's, and no panel of the map covers another, whatever the size of the window.
- **The catalogue and the directory**: what the brain must find again without thinking with it (posts, works, events) goes to a catalogue found by search, and a source sorts its items between notes and catalogue with you; the contacts directory keeps only real people.
- **The brain reads by itself during the day**, if you want: every half hour, a Claude in the background reads your finished conversations and the documents you changed, and writes what they teach, within a daily cap you set.
- **Faster and lighter answers**: searches usually answer in under a second, the brain's own background work reads notes short, and the plugin's locks run as one program.
- **The cloud copy answers as the computer does** and serves your skills too.
- **The plugin downloads and updates from hypervibe.fr**: `/brain:update` checks the fingerprint of the zip before installing anything; the releases of this repository carry the same zip.
- **The plugin is fully generic**: nothing of its author's life in its code, docs or tests, checked at each release.
- **To update**: `/brain:update`, or download the new zip from https://hypervibe.fr/brain and upload it in the Claude app.

## 0.6.1 (2026-10-22)

- **The cloud copy rides out a passing fault on Cloudflare's side**: when Cloudflare answers with a temporary error (502, 503, 504, or a network cut), the upload of your notes and vectors is tried again twice, after 5 and then 20 seconds, instead of failing the evening and sending an alert for nothing. Only what can safely be done twice is tried again; if the fault lasts, the alert goes as before and the next run sends what was kept back.
- To update: `/brain:update`, or upload the new zip in place of the previous one.

## 0.6.0 (2026-10-14)

- **The plugin is open source**: its repository, `flavien-ia/hypervibe-brain`, is public, and every version is published there as a release carrying the plugin as a zip.
- **`/brain:update` updates the plugin**: it reads the latest release, downloads the zip, checks it against the fingerprint GitHub computed when it was published, and swaps it in place, keeping the previous version aside. Installed from the repository, it runs Claude Code's own update commands instead. Either way, it then arms the evening save again so that it runs the new version.
- **The published zip is the plugin only**: the tests and the CI stay in the repository.
- To update: `/brain:update` (from 0.6.0 on), or upload the new zip in place of the previous one.

## 0.5.0 (2026-10-14)

- **The evening save warns you, even without a key**: when something fails, a notice appears on the computer (Windows, macOS, Linux), whether the alert email could leave or not. The alert is kept on the computer before it is sent, so `/brain:status` shows it even when the mail could not go.
- **A locked Hypervibe vault is asked for, not failed on**: if your keys live in the Hypervibe vault and it is locked at the time of the save, a notice and the vault's password window appear, with six minutes to open it. Otherwise the save goes on, and the alert says plainly that the vault was locked and that what needs it is taken up at the next run. A computer without a vault is never asked anything.
- **An alert the same evening** when a step or a source fails, by the letter's channel.
- **The work journal is shared by your computers**, one file per computer in git, with the titles of the Claude sessions; the reads of the brain by Claude too.
- **The weekly review catches up a missed evening**, follows every living source, and ends on three questions.
- **The Hypervibe vault serves the keys** of the letter, the alert and the cloud copy, for those who keep them there rather than in the brain's `.env`.
- **Windows**: the evening save catches up every 30 minutes when the computer was asleep, at local time.
- **Search**: a brain may keep folders out of search unless asked (a directory of contacts, for instance), on the computer and in the cloud copy alike.
- **Vectors** carry a note's type and domains with its title: search by meaning groups an idea with ideas, a person with people. The vectors are recomputed once, at the first evening.
- A source's own name for a note is kept whole, and its date fields are written bare.
- To install: upload this zip in place of the previous one.

## 0.4.0 (2026-10-03)

- **The plugin is now Hypervibe Brain, and its commands start with `brain`**: `/brain:start`, `/brain:create`, `/brain:capture`, `/brain:review`, `/brain:status`, `/brain:sources`, `/brain:ingest`, `/brain:contacts`, `/brain:viz`, and the `/brain:add-...` modules.
- A brain's own file is now `brain.json`, the settings of the computer live in `~/.hypervibe-brain`, and the variables of the scripts start with `HVBRAIN_`.
- **A setup made before is carried over by itself**: the settings folder and the brain's file are renamed the first time a script runs. Only the evening save has to be armed again (`/brain:start` says so and does it), which removes the task of before.
- To install: remove the previous plugin, then upload this zip.

## 0.3.1 (2026-10-01)

- **The documentation of every skill is in the plugin**: a `DOC.fr.md` and a `DOC.md` next to each `SKILL.md`, written for people who are not developers (when to use it, how it goes, what it creates, prerequisites, tips). The bench checks that every skill has both, with all their sections.
- The weekly review, when it runs by itself, only creates the seeds its living sources bring; the skill said "no note" in one place and the opposite in another.

## 0.3.0 (2026-10-01)

- **Architecture like Hypervibe's `/bootstrap`**: `create-brain` builds the core (decisions, creation, first notes, sources, Claude reading it everywhere), then proposes the modules by family, each a skill of its own that can also be added later.
- **The sources are the core**: `brain-sources` sets up the living sources (mail and calendar, watched folders, work with Claude) and lists the writings to bring in.
- **`add-backup`** gathers the GitHub copy and the cold copy (one, the other, or both); **`add-routines`** replaces `brain-routines`; **`add-embeddings`** sets up search by meaning.
- **Work with Claude**: the same event format as the sensors of the brain Hypervibe Brain grew from, and the week's commits read from each project's own history, without any global git hook.
- **`adopt.mjs`**: makes an existing brain (restored, cloned, or built before the plugin) the active one.
- **The format speaks the brain's language**: a French brain writes `titre`, `domaines`, `statut: graine`, `visibilite: prive`, `cree`, `touche`; everything it returns speaks those words. Read into one canonical shape inside the scripts.
- **The types belong to the brain**: listed in `brain.json` (type and folder), proposed at the creation from what the computer shows (`discover.mjs`: folder names and kinds of files, never a content) and validated with the person; `types.mjs add` adds one later. The types never promoted by the machine are the brain's choice too. A brain may declare paths of its vault that are not notes (`exclude`).
- Proof: the 3,048 notes of the brain Hypervibe Brain grew from pass the plugin's validation and indexing as they are, without a letter changed.
- **Steps** (`sources.mjs add --kind step --when before|after`): a brain's own programs that write no note (a mirror, a publication, a check), every evening or week, approved per computer like a source, their output kept as a report.
- **Finished records** (`--finished`): a source of posts, articles or talks given may write them already trusted and keep them up to date, only while nobody has touched the file since it wrote it. Any other source writes seeds. An item whose `source` is already a note's is that note, never a twin; a note may go into a subfolder of its type.
- **Promotion by usage**: what Claude reads through the tools is journaled on each computer (never in git), and a seed read rises like a seed linked by hand; links written by a program (`:auto` lines, or from types and folders declared as plumbing in `promotion`) do not count; every promotion is kept with its reason in `index/promotions.jsonl`.
- **Machine zones**: a source may keep a few lines up to date inside an existing note, even a validated one, only between the marks of a zone it declared (`--zones`), never a character outside. And a finished record may have no text; a thought without text is still refused.
- **A capture address** is offered among the sources: thoughts sent by email become seeds.
- **Contacts**: a source may place people in a tier (`setsTier`, kept as a floor), or a brain may leave the tiers entirely to its sources (`contacts.tiersFrom`).
- **A brain's own rules**: files any computer or only the runner commits (`ownership`, with `{computer}` for a per-computer journal), types or folders never promoted, and where the index and the vectors live (`index.db`, `index.embeddings`) when the brain already has files of its own there.
- Fixed: the evening launcher now passes its settings folder to its scripts; what a source just wrote is saved the same evening instead of waiting like a note being edited.
- **Your own sources**: each person defines, with Claude, the sources only they have (posts in a database, a reading list, an export...), kept in the brain under `sources/<name>/`. Read automatically by a small program (it only prints the notes; the plugin writes them, with every check, never twice the same) or done by Claude during the weekly review. A program runs only once approved on this computer, and again after any change. A failed run writes nothing and the next one starts from the last success. A source may refresh its own seeds, never a validated note. The evening save runs the ones that are due; the weekly report tells what each brought.
- One path to write a note (`notes.mjs`), for a capture and for a source.
- **The contacts directory** (`brain-contacts`, proposed at the creation): the people the person exchanges with, as data (`index/annuaire.json` in a French brain, `index/directory.json` in English, in git), filled from the mail through the person's own Claude connector and every week by the review, or by a source of their own. Three tiers by the brain's own thresholds; nobody rises without exchanges in both directions. A contact becomes a note only by the person's decision, its address kept in the source. A sixth MCP tool, `brain_contact`.
- Proof: the 4,649-contact directory of the brain Hypervibe Brain grew from is read, searched and rewritten by the plugin as it is.
- **The weekly letter** (in `add-routines`): the review, sent by email where the person reads, in the brain's language, with the structure of the letter of the brain Hypervibe Brain grew from (the week, the new seeds, the proposals, promotions and collisions, "Oh, by the way", the health), each item numbered so that the person answers in one sentence ("brain-review: remove seeds 3 and 8"). Sent by the person's own mail connector, to themselves, or by a Brevo or Resend key of theirs; always kept in `reviews/` for the answers to find its numbers. Rendered for Gmail and phones (inline styles, layout tables).
- **Two computers** (`add-second-computer`): the same brain on two computers, meeting on its private GitHub copy. One computer runs the brain (sources, vectors, directory, reviews, cold copy) and only it commits what it computes; the other reads and writes notes. Each computer commits and sends by itself only with the person's agreement on that computer. The synchronisation carries the rules of the brain Hypervibe Brain grew from: the overlap check before taking anything, taking without touching the index of other sessions (a fast-forward, or a stash given back with `--index`, never dropped), no conflict ever resolved alone, never a forced push. A capture is sent at once; every evening, each computer saves then synchronises.
- **The cloud copy** (`add-cloud`): the brain readable by online agents, READ ONLY, on the person's own Cloudflare account: a D1 database and an R2 bucket created in the EU jurisdiction, updated by difference every evening, and a Worker serving the same six tools behind a door with one token per consumer (the Worker only knows their prints; with no token, everyone gets 401). Two rights, closed at creation: the content of private notes (copied to the cloud only if the person chose it) and the email addresses. Everything through `wrangler` and the person's own login: no Cloudflare key kept. A token's value never goes through the conversation. No dependency: the Worker speaks MCP by hand.
- **One engine, not two**: the calculations (full-text query, excerpts, proximity by meaning, directory search), the note vocabulary and the tools' descriptions live in `pure.mjs` and `tools.mjs`, run by the computer AND copied next to the Worker. `tests/banc-cloud.mjs` (38 checks, a fake wrangler, the real Worker run in Node) proves the answers are the same, tool by tool.
- Fixed: the contacts directory could not be written in a brand new brain (no `index/` folder yet); notes of the same day now come in a stable order in the timeline.
- Checked on a real Cloudflare account (setup, sync, deploy, `verify` 9 of 9, then everything deleted), which fixed three things the fake could not show: a read from the cloud database now goes as a command (an import from a file only ever answers with statistics, never with rows); the warning a file import always prints is no longer taken for an error; and `verify` waits for a new version to reach every Cloudflare server (up to a minute and a half) instead of failing on its first seconds. The bench's fake wrangler now behaves like the real one on all three points.
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

- Seven skills: `start`, `create-brain`, `brain`, `brain-ingest`, `brain-review`, `brain-status`, `brain-routines`.
- MCP server with five read-only tools (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`) and session instructions.
- Evening save armed in the computer's own scheduler (Windows, macOS, Linux); weekly review as a Claude scheduled task.
- Zero dependency: SQLite from Node, MCP protocol spoken by hand.
- Test bench: 63 checks, offline.
