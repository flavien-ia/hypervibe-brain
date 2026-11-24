// tools.mjs - The seven tools of the brain and what every session is told
// about it: the same words for the MCP server on this computer (mcp.mjs) and
// for the cloud Worker (templates/cloud/worker.js, which serves six of them:
// every one but brain_fetch). Pure data, no import.

/**
 * What a session is told about the brain, through the MCP handshake: the
 * plugin never edits the person's CLAUDE.md, the server says it itself.
 * `name` is null when no brain is set up.
 */
export function instructionsFor(name, summary = "") {
  if (!name) {
    return "Hypervibe Brain is installed but no second brain is set up on this computer yet. If the person talks about a second brain, notes to keep or ideas to remember, suggest /brain:start (checks the prerequisites) then /brain:create.";
  }
  return [
    `${name} has a second brain: their ideas, projects, the people who matter to them, their publications and decisions, as linked notes.`,
    `Query it WITHOUT BEING ASKED whenever an answer depends on what ${name} thinks, has already written or decided, or on who they know: before writing in their voice, summarising one of their positions, or talking about one of their projects. One search is enough, as it is: by default it looks by words and by meaning at once, which finds a name as well as an idea; meaning alone (meaning: true) misses names, keep it for an idea that shares no word with the notes. Before a task, search its lessons (nature: "lesson"). Ask for few results (5 to 10), open only the notes that matter with brain_get, and prefer the brain to a database when the question is about what the person thinks, decided or learned.`,
    "Read it by its rules: a `trusted` note (`fiable` in a French brain) can be quoted as it is; a `seed` (`graine`) was written by a machine and not validated yet, handle it with care and say so; follow the `source` before asserting anything important.",
    "Write to it ONLY through the /brain:capture skill (capture), never by writing a file by hand.",
    // The table of contents (summary.mjs): what the brain holds, so that the AI
    // sees when it has something to say. Empty in the cloud copy for now.
    ...(summary ? [`\n\nTHE BRAIN AT A GLANCE (titles, then [slug] for brain_get):\n${summary}`] : []),
  ].join(" ");
}

export const TOOLS = [
  {
    name: "brain_search",
    description: "Search the person's second brain (notes, ideas, projects, people, publications). Hybrid by default: by words (accents ignored) and by meaning, fused, so a question in plain language and an exact name both work in one call: keep this default; `found` says how each result was found. Open a result with brain_get and its slug. Results may end with CATALOGUE entries (catalogue: true): data the brain finds again without keeping it (a post, an artwork...), with an address instead of a slug, read in full by brain_fetch.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for" },
        meaning: { type: "boolean", description: "By meaning only: for an idea that shares no word with the notes, never for a name (meaning alone misses names)" },
        words: { type: "boolean", description: "By words only: every word must appear (an exact name, a number, a code)" },
        limit: { type: "number", description: "How many results (default 10)" },
        type: { type: "string", description: "Only this type, or its folder (brain_stats lists the brain's types)" },
        domain: { type: "string", description: "Only this domain, by its id or its label" },
        nature: { type: "string", description: "Only notes of this nature: lesson, decision, feedback (also understood in French: lecon, retour)" },
        entries: { type: "boolean", description: "false for notes only, without the catalogue" },
        everything: { type: "boolean", description: "Also the folders this brain keeps out of search by default (its contacts' notes, for instance)" },
      },
      required: ["query"],
    },
  },
  {
    name: "brain_get",
    description: "Open one note: its text, its source, its status (seed, or graine in a French brain = written by a machine, not validated yet; trusted, or fiable = validated), its nature when it has one, its links and backlinks. `data` lists the addresses of the data it routes to (brain_fetch reads them). `next` proposes the linked notes closest to the question being asked, with the sentence that links them: follow them to build a synthesis or a context, not for a single fact. A long note comes cut, and its links stop at 20 each way: `omitted` says what was left out and how to get it.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, full: { type: "boolean", description: "The whole text and every link (default: cut past 6,000 characters and 20 links)" } }, required: ["slug"] },
  },
  {
    name: "brain_fetch",
    description: "Read the data at an address (scheme://path), where it lives, read only: an address from a note's `data`, or from a catalogue entry found by brain_search. Use it after brain_get, when the answer needs a figure, a record or a full text the note does not hold.",
    inputSchema: { type: "object", properties: { address: { type: "string", description: "For instance crm://post/1624 or neon://hypervibe/participant. A database that can be explored also answers <scheme>://[project/]tables, <scheme>://[project/]<table> (columns and latest rows, ?column=value to filter) and <scheme>://[project/]<table>/<id> (one row)." } }, required: ["address"] },
  },
  {
    name: "brain_neighbors",
    description: "What surrounds a note: the notes it links to, the notes that link to it, and the closest notes by meaning. Use it to understand a context rather than a single fact.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, limit: { type: "number" }, everything: { type: "boolean", description: "Also the folders hidden from search by default" } }, required: ["slug"] },
  },
  {
    name: "brain_timeline",
    description: "The notes in the order of time (most recent first), optionally between two dates (YYYY, YYYY-MM or YYYY-MM-DD) or of one type.",
    inputSchema: { type: "object", properties: { since: { type: "string" }, until: { type: "string" }, type: { type: "string" }, limit: { type: "number" } } },
  },
  {
    name: "brain_contact",
    description: "Search the person's contacts directory: the people they exchange with by email, with how much, since when, about what, and what is known of them. Every word must appear, anywhere (name, address, organisation, subjects, what is known), accents ignored: \"accountant\", \"Dupont Acme\". Tier 2 = the core, 1 = matters, 0 = the rest. A contact with a `note` has a note in the brain (brain_get).",
    inputSchema: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
  },
  {
    name: "brain_stats",
    description: "The state of the second brain: how many notes, by type, domain and status, its own types (with their folders) and the language of its format, and whether search by meaning is available. Read it before capturing a note.",
    inputSchema: { type: "object", properties: {} },
  },
];

// WHAT ONLY THIS COMPUTER'S SERVER DOES (2026-11-21): a long note read in
// pieces. The cloud Worker does not have it yet, so it is not in the words
// both share: mcp.mjs serves LOCAL_TOOLS, the Worker serves TOOLS.
const LOCAL = {
  brain_get: {
    full: { type: "boolean", description: "A longer piece of the text (30,000 characters) and up to 200 links each way (default: cut past 6,000 characters and 20 links)" },
    offset: { type: "number", description: "Read the text from this character on: `omitted.body.next` of the piece before gives it" },
  },
};
export const LOCAL_TOOLS = TOOLS.map((t) => (LOCAL[t.name] ? { ...t, inputSchema: { ...t.inputSchema, properties: { ...t.inputSchema.properties, ...LOCAL[t.name] } } } : t));
