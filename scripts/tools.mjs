// tools.mjs - The six tools of the brain and what every session is told
// about it: the same words for the MCP server on this computer (mcp.mjs) and
// for the cloud Worker (templates/cloud/worker.js). Pure data, no import.

/**
 * What a session is told about the brain, through the MCP handshake: the
 * plugin never edits the person's CLAUDE.md, the server says it itself.
 * `name` is null when no brain is set up.
 */
export function instructionsFor(name) {
  if (!name) {
    return "Hyperbrain is installed but no second brain is set up on this computer yet. If the person talks about a second brain, notes to keep or ideas to remember, suggest /hyperbrain:start-hyperbrain (checks the prerequisites) then /hyperbrain:create-brain.";
  }
  return [
    `${name} has a second brain: their ideas, projects, the people who matter to them, their publications and decisions, as linked notes.`,
    `Query it WITHOUT BEING ASKED whenever an answer depends on what ${name} thinks, has already written or decided, or on who they know: before writing in their voice, summarising one of their positions, or talking about one of their projects. Search by words first, then by meaning (meaning: true) if nothing comes up.`,
    "Read it by its rules: a `trusted` note (`fiable` in a French brain) can be quoted as it is; a `seed` (`graine`) was written by a machine and not validated yet, handle it with care and say so; follow the `source` before asserting anything important.",
    "Write to it ONLY through the /hyperbrain:brain skill (capture), never by writing a file by hand.",
  ].join(" ");
}

export const TOOLS = [
  {
    name: "brain_search",
    description: "Search the person's second brain (their notes, ideas, projects, people, publications). Full text by default: every word must appear, anywhere, accents ignored. Set meaning=true to search by meaning when the notes may use other words than the question. Returns slugs to open with brain_get.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for" },
        meaning: { type: "boolean", description: "Search by meaning instead of by words" },
        limit: { type: "number", description: "How many results (default 10)" },
        type: { type: "string", description: "Only this type (the brain's own types: brain_stats lists them)" },
        domain: { type: "string", description: "Only this domain" },
      },
      required: ["query"],
    },
  },
  {
    name: "brain_get",
    description: "Open one note of the second brain: its full text, where it comes from (source), how trustworthy it is (status: seed, or graine in a French brain = written by a machine and not yet validated; trusted, or fiable = validated), its links and the notes that link to it.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "brain_neighbors",
    description: "What surrounds a note: the notes it links to, the notes that link to it, and the closest notes by meaning. Use it to understand a context rather than a single fact.",
    inputSchema: { type: "object", properties: { slug: { type: "string" }, limit: { type: "number" } }, required: ["slug"] },
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
