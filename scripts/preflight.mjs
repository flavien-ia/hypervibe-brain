// preflight.mjs - Before a brain is created, is there one already? (2026-11-23)
//
// The first thing /brain:start does, before the computer and before the
// brain: a person who already has a brain (on another computer, in a folder of
// this one that the settings forgot, on their GitHub) must never end up with a
// second, empty one beside it. This only LOOKS, and writes nothing:
//
//   the brain this computer's settings name (~/.hypervibe-brain/config.json)
//   a folder that holds a brain.json, in the usual places, without going deep:
//     the personal folder itself and its direct sub-folders, then the direct
//     sub-folders of ~/dev and, on Windows, of C:/DEV, when they exist
//   a repository of the person on GitHub that holds a brain.json at its root,
//     when the GitHub CLI is there and connected: ONE question to GitHub's
//     API (GraphQL), the person's own hundred repositories most recently
//     pushed, each asked for its brain.json; nothing is cloned
//
// What the start does with it (skills/start): a brain active here is taken up
// where it stands; a brain found in a folder of this computer is made active
// (adopt.mjs --dir); a brain found on GitHub only is the same brain on a
// second computer (/brain:add-second-computer); nothing found, the person is
// asked once whether they keep a cold copy (add-backup), then the brain is
// created.
//
// UNDER A HOME OF ITS OWN (HVBRAIN_HOME, the test bench), the places of the
// computer outside that home (C:/DEV) are not looked at: they are the real
// person's. HVBRAIN_GH names a script run by node in place of the GitHub CLI
// (the bench's), HVBRAIN_NO_GITHUB=1 or --no-github leaves GitHub out.

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { HOME, ROOT, hasBrain, userConfig, userConfigProblem } from "./lib.mjs";

const fwd = (p) => String(p).replace(/\\/g, "/");
const key = (p) => fwd(resolve(p)).toLowerCase();
// The folders never worth opening: hidden ones, dependencies, the system's own.
const SKIP = /^(\.|node_modules$|AppData$|Library$|Applications$|\$Recycle\.Bin$|OneDrive|Dropbox$|iCloud)/i;
const PER_PLACE = 400;

/**
 * What a brain.json says of its brain, or null when the file is not a brain's
 * (another tool may name a file brain.json: a brain has a name and a shape).
 * @param {string} text
 */
export function brainOf(text) {
  try {
    const raw = String(text);
    const b = JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
    if (!b || typeof b !== "object" || Array.isArray(b) || typeof b.name !== "string") return null;
    if (!("domains" in b || "format" in b || "lang" in b || "stage" in b || "created" in b)) return null;
    return { name: b.name, ...(b.created ? { created: String(b.created) } : {}), ...(b.lang ? { lang: String(b.lang) } : {}), ...(b.stage !== undefined ? { stage: b.stage } : {}) };
  } catch {
    return null;
  }
}

/** The address of a folder's GitHub copy, read from its git settings (no git run). */
function remoteOf(dir) {
  try {
    const text = readFileSync(join(dir, ".git", "config"), "utf8");
    const url = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(text)?.[1];
    return url ?? null;
  } catch {
    return null;
  }
}

/** The direct sub-folders of a folder, the ones worth a look. */
function children(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory() && !SKIP.test(e.name)).slice(0, PER_PLACE).map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

/** The folders of this computer that hold a brain, the active one aside. */
function local() {
  const places = [HOME, ...children(HOME)];
  const containers = [join(HOME, "dev"), join(HOME, "DEV"), ...(process.platform === "win32" && !process.env.HVBRAIN_HOME ? ["C:/DEV"] : [])];
  for (const c of containers) if (existsSync(c)) places.push(...children(c));
  const seen = new Set();
  const found = [];
  const active = hasBrain() ? key(ROOT) : null;
  for (const dir of places) {
    const k = key(dir);
    if (seen.has(k)) continue;
    seen.add(k);
    for (const file of ["brain.json", "hyperbrain.json"]) {
      if (!existsSync(join(dir, file))) continue;
      let text = "";
      try {
        text = readFileSync(join(dir, file), "utf8");
      } catch {
        continue;
      }
      const b = brainOf(text);
      if (!b) continue;
      if (k !== active) found.push({ dir: fwd(dir), ...b, ...(remoteOf(dir) ? { remote: remoteOf(dir) } : {}) });
      break;
    }
  }
  return { looked: seen.size, found };
}

const QUERY = `query { viewer { login repositories(first: 100, ownerAffiliations: OWNER, orderBy: {field: PUSHED_AT, direction: DESC}) { nodes { nameWithOwner isPrivate isArchived url pushedAt brain: object(expression: "HEAD:brain.json") { ... on Blob { text } } legacy: object(expression: "HEAD:hyperbrain.json") { ... on Blob { text } } } } } }`;

/** Runs the GitHub CLI (or the bench's stand-in), the request given on its input: no quoting through a shell. */
function gh(args, input) {
  const fake = process.env.HVBRAIN_GH;
  const [cmd, all] = fake ? [process.execPath, [fake, ...args]] : ["gh", args];
  const how = { encoding: "utf8", timeout: 30_000, windowsHide: true, input };
  let r = spawnSync(cmd, all, how);
  // (Installed as a script rather than a program, on Windows it is found through the shell: the words are plain, one line is enough.)
  if (!fake && r.error?.code === "ENOENT" && process.platform === "win32") r = spawnSync(["gh", ...args].join(" "), { ...how, shell: true });
  if (r.error?.code === "ETIMEDOUT") return { status: "timeout", out: "", err: "" };
  if (r.error || r.status === null) return { status: "missing", out: "", err: String(r.error?.message ?? "") };
  return { status: r.status === 0 ? "ok" : "error", out: r.stdout ?? "", err: r.stderr ?? "" };
}

/** The person's repositories on GitHub that hold a brain. */
function github() {
  if (process.env.HVBRAIN_NO_GITHUB === "1") return { looked: false, why: "off", brains: [] };
  const version = gh(["--version"]);
  // (A shell that does not know the command answers with an error, not a missing program.)
  if (version.status === "missing" || (version.status === "error" && !/gh version/i.test(version.out))) return { looked: false, why: "not-installed", brains: [] };
  const r = gh(["api", "graphql", "--input", "-"], JSON.stringify({ query: QUERY }));
  if (r.status !== "ok") {
    const said = `${r.err}${r.out}`;
    const why = /auth login|not logged|authenticat|401|bad credentials/i.test(said) ? "not-connected" : r.status === "timeout" ? "timeout" : "error";
    return { looked: false, why, brains: [], ...(why === "error" ? { error: said.trim().split(/\r?\n/)[0]?.slice(0, 200) ?? "" } : {}) };
  }
  let answer = null;
  try {
    answer = JSON.parse(r.out);
  } catch {
    return { looked: false, why: "error", error: "GitHub's answer could not be read", brains: [] };
  }
  const viewer = answer?.data?.viewer;
  const nodes = viewer?.repositories?.nodes ?? [];
  const brains = [];
  for (const n of nodes) {
    const b = brainOf(n?.brain?.text ?? "") ?? brainOf(n?.legacy?.text ?? "");
    if (b) brains.push({ repo: n.nameWithOwner, private: n.isPrivate === true, url: n.url, ...(n.pushedAt ? { pushedAt: n.pushedAt } : {}), ...(n.isArchived ? { archived: true } : {}), ...b });
  }
  return { looked: true, login: viewer?.login ?? null, repositories: nodes.length, brains };
}

/**
 * Is there a brain already, here or elsewhere?
 * @param {{ github?: boolean }} [o]
 */
export function preflight({ github: withGithub = true } = {}) {
  const problem = userConfigProblem();
  if (problem) return { ok: false, error: `the settings of this computer (${fwd(join(HOME, ".hypervibe-brain", "config.json"))}) cannot be read (${problem}): repair that file by hand (nothing was written over it), then run /brain:start again` };
  const named = userConfig().brain;
  let active = null;
  if (hasBrain()) {
    let b = null;
    try {
      b = brainOf(readFileSync(join(ROOT, "brain.json"), "utf8"));
    } catch {
      b = null;
    }
    active = { dir: fwd(ROOT), ...(b ?? {}) };
  }
  const here = local();
  // (A brain active here is taken up where it stands: GitHub is not asked.)
  const hub = active ? { looked: false, why: "active", brains: [] } : withGithub ? github() : { looked: false, why: "off", brains: [] };
  // A repository that a folder of this computer already holds is that folder's copy, not another brain.
  const remotes = [...(active ? [remoteOf(ROOT)] : []), ...here.found.map((f) => f.remote)].filter(Boolean).map((u) => String(u).toLowerCase());
  for (const b of hub.brains) b.here = remotes.some((u) => u.includes(String(b.repo).toLowerCase()));
  const elsewhere = hub.brains.filter((b) => !b.here);
  const verdict = active ? "active" : here.found.length ? "local" : elsewhere.length ? "github" : "none";
  const hand = { active: "resume", local: "adopt", github: "add-second-computer", none: "create" }[verdict];
  return {
    ok: true,
    verdict,
    hand,
    active,
    ...(!active && named ? { missing: { dir: fwd(named) } } : {}),
    local: here.found,
    github: hub,
    looked: here.looked,
  };
}
