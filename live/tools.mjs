// tools.mjs: the tools drawn around the brain, taken from what is connected
// (decided on 2026-11-07). No list is kept by hand: a source declares in its
// source.json the tools it reads (`tools`), with their appearance the first
// time a tool is named; a tool that is only read on demand (brain_fetch)
// carries its own in the `data` registry of brain.json (`appearance`). The
// families and their colours are the brain's (brain.json, viz.families). What
// is not connected is not drawn.
//
// Gives the page's shape ({ families, tools }, contract.d.ts) and, for the
// server alone, the logos, the tools of each source and where each watched
// address comes from.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";
import { language } from "./brain.mjs";
import { rhythm, t } from "./i18n.mjs";

/** @typedef {import("./contract.d.ts").Tool} Tool */
/** @typedef {import("./contract.d.ts").Family} Family */
/** @typedef {import("./contract.d.ts").ToolLevel} ToolLevel */
/** @typedef {import("./i18n.mjs").Dictionary} Dictionary */
/**
 * @typedef {object} ToolLogo A logo as the server keeps it.
 * @property {string} [path]   an SVG path
 * @property {string} [hex]    its colour
 * @property {string} [image]  the address that serves its image
 * @property {boolean} [round]
 * @property {string | null} [file] the image on disk, never sent to the page
 */
/**
 * @typedef {object} ConnectedTools
 * @property {Record<string, Family>} families
 * @property {Tool[]} tools
 * @property {Record<string, ToolLogo>} logos        tool id -> its logo
 * @property {Map<string, string[]>} bySource        source name -> the ids of its tools
 * @property {{ prefix: string, tool: string }[]} origins which tool what carries this address comes from, longest prefix first
 */
/** @typedef {Record<string, any>} Declaration what a source.json or the registry says of a tool (the plugin's keys) */

/**
 * A file declared by a source stays inside that source's folder (never "../..").
 * @param {string} folder
 * @param {unknown} relative
 * @returns {string | null}
 */
const insideFolder = (folder, relative) => {
  const p = resolve(folder, String(relative));
  return p.startsWith(resolve(folder) + sep) ? p : null;
};

// The brain's own channels: always there, with no source to declare them.
const CLAUDE_CODE_LOGO = JSON.parse(readFileSync(new URL("./logo-claude-code.json", import.meta.url), "utf8"));
/** @param {Dictionary} say @returns {Declaration[]} */
const builtIn = (say) => [
  { id: "claude-code", name: "Claude Code", family: "code", in: true, out: true, logo: CLAUDE_CODE_LOGO, targets: [{ domain: "tech", type: "project" }, { domain: "tech", type: "note" }], role: say.claudeCodeRole, access: say.claudeCodeAccess, today: say.claudeCodeToday },
];
/** @param {Dictionary} say @returns {Record<string, { name: string, color: string }>} */
const defaultFamilies = (say) => ({ code: { name: say.familyCode, color: "#4aa3ff" }, files: { name: say.familyFiles, color: "#3fb984" } });

/** @param {string} file @returns {any} a JSON file, or null when it cannot be read */
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};

// THE FOLDERS CIRCLE (2026-11-08): the folders of the computer that the
// sources watch (their `folders` field), gathered in one circle that opens on
// a click, like a database with several projects. It replaced the Dropbox
// circle: the hub does not talk to Dropbox, it looks at folders on the disk
// (dropbox:// is only the name of a root), and someone without Dropbox
// follows their folders the same way.
const FOLDER_LOGO = { path: "M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z", hex: "7EC8FF" };
// The name of a watched folder: its last segment, without its order number.
// Two watched folders with the same name also say what they are the folder of
// (their parent; the project, for a "content" or a "src" of code). A brain
// gives its own names in brain.json (viz.folderNames).
/** @param {string} address */
const segments = (address) => String(address).replace(/^[a-z][a-z0-9+.-]*:\/\//i, "").replace(/\/$/, "").split("/");
/** @param {string | undefined} x */
const withoutNumber = (x) => (x ?? "").replace(/^\d+\.\s*/, "");
/** @param {string} address @param {Set<string>} [homonyms] */
const folderName = (address, homonyms = new Set()) => {
  const parts = segments(address);
  const last = withoutNumber(parts.at(-1));
  if (!homonyms.has(last.toLowerCase()) || parts.length < 2) return last;
  const before = /^(content|src|public|app)$/i.test(parts.at(-2) ?? "") ? parts[0] : withoutNumber(parts.at(-2));
  return `${last} · ${before}`;
};
/** @param {string} address */
const folderId = (address) => `folder-${String(address).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
// The order of the sectors: a tool sits in the sector of its first role.
// NO CLIENTS SECTOR (decided on 2026-11-08): the only real client of the
// brain is the AI it is plugged into, which goes without saying. Claude Code
// is therefore a source (its captures, its facts), and the weekly review an
// internal mechanism.
/** @type {import("./contract.d.ts").ToolRole[]} */
const ROLE_ORDER = ["source", "base"];
// The Folders circle was called "dossiers" until 2026-11-10: a source that
// names it so in its `tools` (a judge that also reads the folders) still
// means this one.
/** @type {Record<string, string>} */
const FORMER_IDS = { dossiers: "folders" };

// Called for every event of the journal and every thirty seconds by each open
// page, while it reads every source.json again: the result is kept for two
// seconds (a burst of events computes it once). Whoever has just learnt that
// a file changed asks for a fresh one.
/** @type {{ brain: string, at: number, value: ConnectedTools } | null} */
let kept = null;
/**
 * { families, tools, logos, bySource, origins } from the brain's sources and registry.
 * @param {string} brain the brain's folder
 * @param {{ fresh?: boolean }} [how]
 * @returns {ConnectedTools}
 */
export function connectedTools(brain, { fresh = false } = {}) {
  if (!fresh && kept?.brain === brain && Date.now() - kept.at < 2000) return kept.value;
  const value = computeTools(brain);
  kept = { brain, at: Date.now(), value };
  return value;
}

/** @param {string} brain @returns {ConnectedTools} */
function computeTools(brain) {
  const say = t(language(brain));
  const internal = builtIn(say);
  const settings = readJson(join(brain, "brain.json")) ?? {};
  /** @type {Record<string, Family>} */
  const families = Object.fromEntries(Object.entries({ ...defaultFamilies(say), ...(settings.viz?.families ?? {}) }).filter(([, v]) => v && typeof v === "object").map(([k, v]) => [k, { name: v.name, color: v.color }]));
  /** @type {Map<string, Declaration>} */
  const declared = new Map();
  // THE LINKS (2026-11-08): the address where each tool opens (viz.links) and
  // its folder on the computer (viz.folders); watched folders that are the
  // same thing under one name (viz.folderNames: the articles of a site and
  // those of the workshop that writes them) make only one.
  const links = settings.viz?.links ?? {};
  const toolFolders = settings.viz?.folders ?? {};
  const folderNames = settings.viz?.folderNames ?? {};
  /** @param {string} f */
  const idOf = (f) => (folderNames[f] ? folderId(`name://${folderNames[f]}`) : folderId(f));
  /** @type {Map<string, string[]>} tool -> one worded line per source that reads it */
  const readers = new Map();
  /** @type {Map<string, string[]>} source -> its tools */
  const bySource = new Map();
  /** @type {Map<string, { id: string, address: string, addresses: string[], sources: string[], name?: string, path?: string }>} */
  const watched = new Map();
  // Where each folder is on this computer (the plugin's roots: dropbox, dev...).
  /** @type {Record<string, string>} */
  const roots = readJson(join(process.env.HVBRAIN_HOME || homedir(), ".hypervibe-brain", "config.json"))?.sourceRoots ?? {};
  // ONE FOLDER OF THE COMPUTER, ONE CIRCLE (2026-11-20). The same folder is
  // written two ways: by its address under a root ("dropbox://Finance/LMNP/",
  // in a source's own folders) and by its path (brain.json, sources.watch).
  // Compared by their text, they made two circles of one folder: "LMNP" and
  // "LMNP · Finance", side by side. They are compared by where they are.
  /** @param {string} p */
  const samePath = (p) => String(p).replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  /** @param {string} address @returns {string | null} where an address is on this computer */
  const pathOf = (address) => {
    const m = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(address);
    if (!m || !roots[m[1]]) return null;
    try {
      return join(roots[m[1]], decodeURIComponent(m[2]));
    } catch {
      return join(roots[m[1]], m[2]); // a "%" of its own in a folder's name
    }
  };
  /** @param {{ addresses: string[], path?: string }} e @returns {string[]} every place a watched folder is at */
  const placesOf = (e) => [...new Set([e.path, ...e.addresses.map(pathOf)].filter((p) => typeof p === "string").map(samePath))];
  // A tool declared under the name of a root ("dropbox") is not a service:
  // it is folders of the computer, which the Folders circle shows.
  /** @param {string} id */
  const isRoot = (id) => Object.hasOwn(roots, id);
  /** @type {{ prefix: string, tool: string }[]} */
  const origins = [];
  const sourceNames = existsSync(join(brain, "sources")) ? readdirSync(join(brain, "sources")) : [];
  for (const n of sourceNames) {
    const d = readJson(join(brain, "sources", n, "source.json"));
    // A DECLARATION OF ANOTHER SHAPE STOPS NOTHING (2026-11-21, audit 5). A
    // source.json edited by hand with "tools": {...} where a list is expected
    // threw from the timer that follows the journal, and the server died: what
    // is not a list is read as an empty one, an entry that is neither a name
    // nor an object is skipped.
    if (!d || typeof d !== "object" || Array.isArray(d) || d.enabled === false) continue;
    /** @type {string[]} */
    const ids = [];
    for (const tool of Array.isArray(d.tools) ? d.tools : []) {
      const declaredId = typeof tool === "string" ? tool : tool && typeof tool === "object" ? tool.id : null;
      if (!declaredId || typeof declaredId !== "string") continue;
      const id = typeof tool === "string" && Object.hasOwn(FORMER_IDS, tool) ? FORMER_IDS[tool] : declaredId;
      ids.push(id);
      if (typeof tool === "object" && !declared.has(id)) declared.set(id, { ...tool, folder: join(brain, "sources", n) });
      const when = [rhythm(say, d.every) ?? d.every ?? "", Array.isArray(d.after) && d.after.length ? say.afterSkillOrSource : ""].filter(Boolean).join(", ");
      const lines = readers.get(id) ?? [];
      readers.set(id, lines);
      lines.push(say.reader(n, when, d.description ?? ""));
    }
    // The folders the source collects from ("folders" since 2026-11-09, when
    // the hub stopped watching them continuously; "files" before): each one a
    // base of the Folders circle; the "dropbox" tool it declared becomes
    // these folders.
    /** @type {string[]} */
    const itsFolders = (Array.isArray(d.folders) ? d.folders : Array.isArray(d.files) ? d.files : []).filter((f) => typeof f === "string");
    for (const f of itsFolders) {
      const id = idOf(f);
      const e = watched.get(id) ?? { id, address: f, addresses: [], sources: [] };
      watched.set(id, e);
      if (!e.addresses.includes(f)) e.addresses.push(f);
      e.sources.push(n);
    }
    const own = itsFolders.map(idOf);
    bySource.set(n, ids.flatMap((id) => (isRoot(id) ? (own.length ? own : ["folders"]) : [id])));
    // What comes from one of its folders comes from its own tool if it has
    // one (the transcripts of meetings come from the meetings tool, not from
    // the folder).
    const itsTool = ids.find((id) => !isRoot(id));
    for (const f of itsFolders) origins.push({ prefix: String(f).replace(/\/$/, ""), tool: itsTool ?? idOf(f) });
  }
  // THE FOLDERS THE BRAIN ITSELF WATCHES (2026-11-17). The standard documents
  // sources declare no folder of their own: they read those of brain.json
  // (sources.watch, set by `components.mjs watch add`) and name the "folders"
  // tool. Each of these folders is a folder of the circle, tied to the sources
  // that name it. Until then such a brain had no Folders circle at all, and
  // its documents judge no card in the settings.
  const readFolders = [...bySource].filter(([, ids]) => ids.includes("folders")).map(([n]) => n);
  if (readFolders.length) {
    for (const folder of /** @type {string[]} */ (Array.isArray(settings.sources?.watch) ? settings.sources.watch : [])) {
      // Its address is the name the folder has on this computer (the plugin's
      // roots.mjs: "writing://"), else its path.
      const scheme = Object.keys(roots).find((k) => samePath(roots[k]) === samePath(folder));
      const address = scheme ? `${scheme}://` : String(folder);
      // (A folder a source already collects from is that folder: its circle
      // gains the sources that read the watched folders.)
      const twin = [...watched.values()].find((o) => placesOf(o).includes(samePath(folder)));
      const id = twin?.id ?? idOf(address);
      const e = twin ?? watched.get(id) ?? { id, address, addresses: [], sources: [], name: withoutNumber(String(folder).replace(/[\\/]+$/, "").split(/[\\/]/).pop()), path: String(folder) };
      watched.set(id, e);
      if (!twin && !e.addresses.includes(address)) e.addresses.push(address);
      for (const n of readFolders) if (!e.sources.includes(n)) e.sources.push(n);
      if (scheme) origins.push({ prefix: address, tool: id });
    }
  }
  // A FOLDER INSIDE ANOTHER WATCHED FOLDER: one circle only, the widest,
  // which wakes up the sources of both.
  /** @param {string} a */
  const withoutSlash = (a) => String(a).replace(/\/$/, "");
  /** @type {Map<string, string>} inner folder id -> the id of the folder that holds it */
  const enclosing = new Map();
  // (Inside by where they are on this computer, whatever the notation of
  // each; by their addresses when this computer does not hold them. A folder
  // known under several places is inside another only if all of them are.)
  /** @param {{ address: string, addresses: string[], path?: string }} a @param {{ address: string, addresses: string[], path?: string }} b */
  const inside = (a, b) => {
    const pa = placesOf(a);
    const pb = placesOf(b);
    if (pa.length && pb.length) return pa.every((x) => pb.some((y) => x.startsWith(`${y}/`)));
    return withoutSlash(a.address).startsWith(`${withoutSlash(b.address)}/`);
  };
  for (const a of watched.values()) {
    const holders = [...watched.values()].filter((b) => b !== a && inside(a, b));
    const parent = holders.find((b) => !holders.some((c) => c !== b && inside(b, c)));
    if (parent) enclosing.set(a.id, parent.id);
  }
  for (const [id, parentId] of enclosing) {
    const p = watched.get(parentId);
    const inner = watched.get(id);
    if (!p || !inner) continue;
    for (const n of inner.sources) if (!p.sources.includes(n)) p.sources.push(n);
    // What is found in it is found in its holder: an address the holder's own
    // do not already cover (another notation) becomes one of the holder's.
    for (const a of inner.addresses) if (!p.addresses.some((o) => withoutSlash(a).startsWith(`${withoutSlash(o)}/`))) p.addresses.push(a);
    watched.delete(id);
  }
  for (const [n, ids] of bySource) bySource.set(n, [...new Set(ids.map((id) => enclosing.get(id) ?? id))]);
  for (const o of origins) o.tool = enclosing.get(o.tool) ?? o.tool;
  origins.sort((a, b) => b.prefix.length - a.prefix.length);
  // The tools declared under the name of a root: replaced by the Folders
  // circle, which takes the family of the first.
  const foldersFamily = [...declared].find(([id]) => isRoot(id))?.[1].family ?? "files";
  for (const id of [...declared.keys()]) if (isRoot(id)) declared.delete(id);
  /** @type {Tool[]} */
  const tools = [];
  /** @type {Record<string, ToolLogo>} */
  const logos = {};
  /**
   * Adds one tool, and returns it.
   * @param {Declaration} d
   * @param {ToolLevel} level
   * @param {string | null} folder where the files it declares are
   * @returns {Tool}
   */
  const add = (d, level, folder) => {
    if (!families[d.family]) families[d.family] = { name: d.family, color: "#9aa0b8" };
    /** @type {Tool} */
    const tool = {
      id: d.id, name: d.name ?? d.id, family: d.family, level,
      // Which side of the brain: what feeds it, or what uses it (a tool that
      // reads the brain without feeding it, and the brain's own channels).
      side: d.side === "uses" || (d.out && d.in === false) || internal.some((x) => x.id === d.id) ? "uses" : "feeds",
      in: d.in ?? true, out: d.out ?? false, targets: d.targets ?? [],
      // THE ROLES (2026-11-08): source (it feeds the brain), base (the brain
      // reads it on demand). The first makes the sector.
      roles: level === "extends" ? ["base"] : ["source"],
      sector: "source",
      role: d.role ?? "", access: d.access ?? "",
      today: d.today ?? (readers.get(d.id) ?? []).join(say.readerSeparator),
      ...(d.idea ? { idea: d.idea } : {}),
      // The addresses this tool serves (pennylane://, neon://<project>/...):
      // what counts its reads on demand.
      ...(d.prefixes?.length ? { prefixes: d.prefixes } : {}),
    };
    tools.push(tool);
    if (d.logo?.path) logos[d.id] = { path: d.logo.path, hex: d.logo.hex };
    else if (d.logo?.image) logos[d.id] = { image: `/api/logo?id=${encodeURIComponent(d.id)}`, round: Boolean(d.logo.round), file: folder ? insideFolder(folder, d.logo.image) : null };
    return tool;
  };
  for (const [id, d] of declared) add({ ...d, id }, "live", d.folder);
  for (const d of internal) if (!declared.has(d.id)) add(d, "live", null);
  // (A source that names the folders while no folder is watched yet still has
  // its circle: it is where its rhythm and its judge are set.)
  if (watched.size || readFolders.length) {
    const family = foldersFamily;
    const count = new Map();
    for (const s of watched.values()) { const k = (s.name ?? withoutNumber(segments(s.address).at(-1))).toLowerCase(); count.set(k, (count.get(k) ?? 0) + 1); }
    const homonyms = new Set([...count].filter(([, n]) => n > 1).map(([k]) => k));
    const parent = add({ id: "folders", name: say.foldersName, family, logo: FOLDER_LOGO, role: say.foldersRole, access: say.foldersAccess }, "live", null);
    const children = (parent.children = /** @type {string[]} */ ([]));
    /** @param {{ address: string, name?: string }} s */
    const shown = (s) => folderNames[s.address] ?? s.name ?? folderName(s.address, homonyms);
    /** @param {string} a */
    const bare = (a) => a.replace(/^[a-z]+:\/\//i, "");
    for (const s of [...watched.values()].sort((a, b) => shown(a).localeCompare(shown(b)))) {
      const child = add({ id: s.id, name: shown(s), prefixes: s.addresses, family, logo: FOLDER_LOGO, role: say.folderRole(s.addresses.length > 1 ? s.addresses.map(bare) : [bare(s.address)]), access: say.folderAccess(s.sources), today: say.folderToday(s.sources) }, "live", null);
      child.parent = parent.id;
      child.paths = s.path ? [s.path] : s.addresses.map(pathOf).filter((p) => p !== null);
      child.addresses = s.addresses;
      children.push(child.id);
    }
  }
  for (const [scheme, entry] of /** @type {[string, Declaration][]} */ (Object.entries(settings.data ?? {}))) {
    if (!entry || typeof entry !== "object") continue;
    const d = entry.appearance;
    // The same service as a tool already there (the registry says so:
    // appearance.id): one more role, not one more circle. Folders of the
    // computer (the "files" adapter) are those of the Folders circle.
    const same = tools.find((o) => o.id === d?.id) ?? (entry.adapter === "files" ? tools.find((o) => o.id === "folders") : undefined);
    if (same) {
      if (!same.roles.includes("base")) same.roles.push("base");
      (same.prefixes ??= []).push(`${scheme}://`);
      continue;
    }
    if (!d?.id) continue;
    // ONE CIRCLE FOR A SCHEME WITH SEVERAL DATABASES (2026-11-08): it shows
    // its databases in a cluster around it, and unfolds them on a click. Each
    // database stays a tool (its panel, its health, its reads), tied to its
    // parent.
    if (entry.projects && Object.keys(entry.projects).length) {
      const parent = add({ ...d, name: d.short ?? d.name ?? scheme, prefixes: [`${scheme}://`] }, "extends", brain);
      const children = (parent.children = /** @type {string[]} */ ([]));
      for (const [project, pr] of /** @type {[string, Declaration][]} */ (Object.entries(entry.projects))) {
        const name = pr.label ?? say.databaseName(`${project.charAt(0).toUpperCase()}${project.slice(1)}`);
        const child = add({ ...d, ...(pr.appearance ?? {}), id: `${scheme}-${project}`, name, prefixes: [`${scheme}://${project}/`], role: pr.role ?? say.databaseRole(project, scheme) }, "extends", brain);
        child.parent = parent.id;
        children.push(child.id);
        if (logos[parent.id]) logos[child.id] = logos[parent.id];
      }
      continue;
    }
    add({ ...d, prefixes: [`${scheme}://`] }, "extends", brain);
  }
  for (const o of tools) o.sector = ROLE_ORDER.find((r) => o.roles.includes(r)) ?? "source";
  for (const o of tools) {
    if (links[o.id]) o.link = links[o.id];
    if (toolFolders[o.id] && !o.paths) {
      const p = pathOf(toolFolders[o.id]);
      if (p) o.paths = [p];
    }
  }
  // THE HEALTH OF EACH CONNECTION (the plugin's health.mjs, index/health.json):
  // a tool whose every tie to the brain is broken is drawn greyed out.
  /** @type {Record<string, Record<string, any>>} */
  const health = readJson(join(brain, "index", "health.json")) ?? {};
  /** @param {string} key a connection of the health check @returns {string[]} the tools it ties */
  const toolsOfKey = (key) => {
    const [kind, rest] = [key.split(":")[0], key.slice(key.indexOf(":") + 1)];
    if (kind === "source") return bySource.get(rest) ?? [];
    const [scheme, sub] = rest.split("/");
    const e = settings.data?.[scheme];
    if (!e) return [];
    if (e.projects && sub) return [`${scheme}-${sub}`];
    return e.appearance?.id ? [e.appearance.id] : [];
  };
  /** @type {Map<string, Record<string, any>[]>} tool id -> its connections */
  const byTool = new Map();
  for (const [key, h] of Object.entries(health)) {
    for (const id of toolsOfKey(key)) {
      const list = byTool.get(id) ?? [];
      byTool.set(id, list);
      list.push({ key, ...h });
    }
  }
  // A parent carries the health of all its databases.
  for (const o of tools) if (o.children) byTool.set(o.id, o.children.flatMap((id) => byTool.get(id) ?? []));
  for (const o of tools) {
    const connections = byTool.get(o.id) ?? [];
    const broken = connections.filter((c) => c.disconnected);
    if (broken.length) o.problems = broken.map((c) => ({ key: c.key, label: c.label, reason: c.reason, since: c.since }));
    if (connections.length && broken.length === connections.length) o.disconnected = true;
  }
  return { families, tools, logos, bySource, origins };
}
