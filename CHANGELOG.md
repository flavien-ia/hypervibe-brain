# Changelog

## 0.2.0 (2026-09-30)

- **Components**, chosen at the start of `create-brain` with what each one implies: search by meaning, online backup, evening save, weekly review, work journal (a hook of the plugin, nothing written into Claude's settings), mail and calendar (through the person's own Claude connectors), watched folders, cold copy (a weekly, verified git bundle).
- **`brain-viz`**: a map of the brain as a page on the computer; with Hypervibe, a private web app fed every evening.
- **The person's language**: the brain's documents, the weekly report, the history and the scheduled task are in French or English, from the computer's settings.
- **macOS and Linux**: synced folders as they are really named, a full PATH for the evening save, a check that Claude reaches the brain's server.
- The automatic tasks are proposed at the end of `create-brain`, in plain words.
- Test bench: 96 checks, run on Windows, macOS and Linux by the CI.

## 0.1.0 (2026-09-30)

First version.

- Seven skills: `start-hyperbrain`, `create-brain`, `brain`, `brain-ingest`, `brain-review`, `brain-status`, `brain-routines`.
- MCP server with five read-only tools (`brain_search`, `brain_get`, `brain_neighbors`, `brain_timeline`, `brain_stats`) and session instructions.
- Evening save armed in the computer's own scheduler (Windows, macOS, Linux); weekly review as a Claude scheduled task.
- Zero dependency: SQLite from Node, MCP protocol spoken by hand.
- Test bench: 63 checks, offline.
