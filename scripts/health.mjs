#!/usr/bin/env node
// health.mjs - Is everything connected to the brain still there? (2026-11-08)
//
// A source that keeps failing, a database deleted with its project, a key
// revoked, a folder gone: without this, they stay drawn as if nothing had
// happened. Each evening (and on demand), every connection gets one tiny
// check, without reading its data:
//   a source        its program is there, its folders exist, its last runs
//   a database      its address can be read, it answers SELECT 1
//   an API          its keys can be read (and an OAuth token is granted)
//   a folder        it exists on this computer
//
// MARKED, NEVER REMOVED BY ITSELF: a passing outage (a database asleep, the
// network down, the vault locked) looks like a disappearance. After two failed
// checks in a row, the connection is "disconnected" (index/health.json); the
// live view draws it greyed, its card says why and offers to reconnect or to
// remove it, and the weekly letter lists it. One that answers again is
// connected again by itself.
//
//   node scripts/health.mjs [--only <key>] [--json]
//   node scripts/health.mjs remove <key>     take a connection out of the brain

import { existsSync, readdirSync, readFileSync, renameSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { INDEX, ROOT, config, hypervibeVault, readJsonFile, requireBrain, userConfig, writeFileAtomic } from "./lib.mjs";
import { logEvent } from "./journal.mjs";
import { envFileOf } from "./fetch.mjs";
import { dataPending } from "./trust.mjs";

requireBrain();
const args = process.argv.slice(2);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const FILE = join(INDEX, "health.json");
const readJson = (f, d) => {
  try {
    return JSON.parse(readFileSync(f, "utf8"));
  } catch {
    return d;
  }
};
const brainFile = join(ROOT, "brain.json");
// The reasons are read by the person (the live view, the letter): in their language.
const FR = (config().lang ?? config().format) === "fr";
const say = (en, fr) => (FR ? fr : en);

function readEnv(file, key) {
  // Only ever a file inside the brain's folder (fetch.mjs, envFileOf).
  const p = envFileOf(file);
  if (!p) return { missing: say(`the file ${file} is outside the brain's folder: a key's .env lives in the brain, it was not read`, `le fichier ${file} est hors du dossier du brain : le .env d’une clé vit dans le brain, il n’a pas été lu`) };
  if (!existsSync(p)) return { missing: say(`the file ${file} no longer exists`, `le fichier ${file} n’existe plus`) };
  const m = new RegExp(`^${key}=["']?([^"'\\r\\n]+)`, "m").exec(readFileSync(p, "utf8"));
  return m ? { value: m[1] } : { missing: say(`${key} is no longer in ${file}`, `${key} n’est plus dans ${file}`) };
}
function readSecret(spec) {
  if (!spec) return { missing: say("no key declared", "aucune clé déclarée") };
  if (spec.env) return readEnv(spec.env.file, spec.env.key);
  if (spec.vault) {
    const v = hypervibeVault(spec.vault[0], spec.vault[1]);
    return v ? { value: v } : { missing: say(`the vault item ${spec.vault.join(" / ")} could not be read (vault locked, or the item is gone)`, `l’élément ${spec.vault.join(" / ")} du coffre n’a pas pu être lu (coffre fermé, ou élément disparu)`), vault: true };
  }
  return { missing: say("a key of an unknown kind", "une clé d’un genre inconnu") };
}

async function checkPostgres(base) {
  const u = readSecret(base.url);
  if (!u.value) return { ok: false, reason: u.missing, vault: u.vault };
  const m = /^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^/?]+)\/([^?]+)/.exec(u.value);
  if (!m) return { ok: false, reason: say("the database address is not a postgres address", "l’adresse de la base n’est pas une adresse postgres") };
  try {
    const r = await fetch(`https://${m[3]}/sql`, { method: "POST", headers: { "Neon-Connection-String": u.value, "Content-Type": "application/json" }, body: JSON.stringify({ query: "SELECT 1", params: [] }), signal: AbortSignal.timeout(30_000) });
    if (r.ok) return { ok: true };
    const t = await r.text();
    return { ok: false, reason: say(`the database answered ${r.status}`, `la base a répondu ${r.status}`) + `: ${(/"message":"([^"]+)/.exec(t)?.[1] ?? t).slice(0, 160)}` };
  } catch (e) {
    return { ok: false, reason: say(`the database did not answer (${e.message})`, `la base n’a pas répondu (${e.message})`), network: true };
  }
}
async function checkHttp(entity) {
  for (const [k, s] of Object.entries(entity.secrets ?? {})) {
    const v = readSecret(s);
    if (!v.value) return { ok: false, reason: `${k}: ${v.missing}`, vault: v.vault };
  }
  const cc = entity.auth?.clientCredentials;
  if (cc) {
    const id = readSecret(cc.id);
    const sec = readSecret(cc.secret);
    // A LOCKED VAULT IS NOT A DISCONNECTION (2026-11-18). This branch forgot
    // to say that its keys come from the vault: three evenings with the vault
    // locked, and a service that answered perfectly was drawn as disconnected.
    if (!id.value || !sec.value) return { ok: false, reason: id.missing ?? sec.missing, vault: id.vault ?? sec.vault };
    try {
      const t = await fetch(cc.tokenUrl, { method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id.value}:${sec.value}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=client_credentials${cc.scope ? `&scope=${encodeURIComponent(cc.scope)}` : ""}`, signal: AbortSignal.timeout(30_000) });
      if (!t.ok) return { ok: false, reason: say(`the service refused its keys (${t.status})`, `le service a refusé ses clés (${t.status})`) };
    } catch (e) {
      return { ok: false, reason: say(`the service did not answer (${e.message})`, `le service n’a pas répondu (${e.message})`), network: true };
    }
  }
  return { ok: true };
}
function checkFlex(entity) {
  const t = readSecret(entity.token);
  if (!t.value) return { ok: false, reason: t.missing, vault: t.vault };
  for (const q of Object.values(entity.queries ?? {})) {
    const v = readSecret(q);
    if (!v.value) return { ok: false, reason: v.missing, vault: v.vault };
  }
  return { ok: true };
}
function checkFiles(def) {
  const name = def.root?.sourceRoot;
  const base = name ? userConfig().sourceRoots?.[name] : def.root;
  if (!base) return { ok: false, reason: say(`no folder for "${name}" on this computer`, `aucun dossier pour « ${name} » sur ce poste`) };
  return existsSync(base) ? { ok: true } : { ok: false, reason: say(`the folder ${base} no longer exists`, `le dossier ${base} n’existe plus`) };
}

/** Every connection of the brain: [key, label, check()]. */
function connections() {
  const out = [];
  const bj = readJson(brainFile, {});
  for (const [scheme, def] of Object.entries(bj.data ?? {})) {
    // NOT APPROVED ON THIS COMPUTER (2026-11-27, trust.mjs): nothing is asked
    // of it, no key is read for it, and it is said as waiting, never as
    // disconnected (the check before sent the person's keys to whatever
    // address the registry named, each evening).
    const waits = dataPending(scheme, def);
    if (waits) {
      out.push([`data:${scheme}`, def.tool ?? scheme, () => ({ ok: false, waiting: true, reason: say(`waits for your approval on this computer (${waits})`, `attend votre accord sur cet ordinateur (${waits})`) })]);
      continue;
    }
    if (def.adapter === "postgres") {
      if (def.projects) for (const [p, base] of Object.entries(def.projects)) out.push([`data:${scheme}/${p}`, base.label ?? `${scheme}://${p}`, () => checkPostgres(base)]);
      else out.push([`data:${scheme}`, def.tool ?? scheme, () => checkPostgres(def)]);
    } else if (def.adapter === "http") {
      for (const [e, entity] of Object.entries(def.entities ?? {})) out.push([`data:${scheme}/${e}`, `${def.tool ?? scheme} (${e})`, () => checkHttp(entity)]);
    } else if (def.adapter === "flex") {
      for (const [e, entity] of Object.entries(def.entities ?? {})) out.push([`data:${scheme}/${e}`, `${def.tool ?? scheme} (${e})`, () => checkFlex(entity)]);
    } else if (def.adapter === "files") out.push([`data:${scheme}`, def.tool ?? scheme, () => checkFiles(def)]);
    else if (def.adapter === "file") {
      const p = isAbsolute(def.file) ? def.file : join(ROOT, def.file);
      out.push([`data:${scheme}`, def.tool ?? scheme, () => (existsSync(p) ? { ok: true } : { ok: false, reason: say(`the file ${def.file} no longer exists`, `le fichier ${def.file} n’existe plus`) })]);
    }
  }
  const dir = join(ROOT, "sources");
  for (const n of existsSync(dir) ? readdirSync(dir) : []) {
    const d = readJson(join(dir, n, "source.json"), null);
    if (!d || d.enabled === false) continue;
    out.push([`source:${n}`, n, async () => {
      if (["script", "step"].includes(d.kind) && !existsSync(join(dir, n, "run.mjs"))) return { ok: false, reason: say("its program (run.mjs) is gone", "son programme (run.mjs) a disparu") };
      const st = readJson(join(dir, n, "state.json"), {});
      // A source whose last run failed after its last success: in trouble.
      if (st.lastError && (!st.lastSuccess || st.lastRun > st.lastSuccess)) return { ok: false, reason: say("its last run failed: ", "son dernier passage a échoué : ") + String(st.lastError).slice(0, 200), vault: /vault|coffre|locked|verrouill/i.test(String(st.lastError)) };
      return { ok: true };
    }]);
  }
  return out;
}

// Written whole or not at all (lib.mjs, 2026-11-21): the live view reads
// health.json, and brain.json and a source.json are read by everything.
const writeJson = (f, o, indent) => writeFileAtomic(f, `${JSON.stringify(o, null, indent)}\n`);
/**
 * What the checks before this one found. The file is rebuilt at every check
 * and holds nothing that cannot be found again: one that cannot be read is put
 * aside (health.json.unreadable) rather than written over, and the counts
 * start again.
 */
function previous() {
  const r = readJsonFile(FILE, {});
  if (r.unreadable) {
    try {
      renameSync(FILE, `${FILE}.unreadable`);
    } catch {
      // in use: the next check puts it aside
    }
    return {};
  }
  return r.value && typeof r.value === "object" && !Array.isArray(r.value) ? r.value : {};
}

async function check(only) {
  const prev = previous();
  const now = new Date().toISOString();
  const next = { ...prev };
  for (const [key, label, fn] of connections()) {
    if (only && key !== only) continue;
    let r;
    try {
      r = await fn();
    } catch (e) {
      r = { ok: false, reason: e.message };
    }
    const p = prev[key] ?? {};
    // The vault locked or the network down says nothing about the connection
    // itself; nor does an entry that waits for the person's approval.
    if (!r.ok && (r.vault || r.network || r.waiting)) {
      next[key] = { ...p, label, checkedAt: now, pending: r.reason };
      continue;
    }
    if (r.ok) next[key] = { label, ok: true, checkedAt: now, since: p.ok ? p.since ?? now : now };
    else {
      const fails = (p.ok === false ? p.fails ?? 1 : 0) + 1;
      next[key] = { label, ok: false, checkedAt: now, reason: r.reason, fails, since: p.ok === false ? p.since ?? now : now, disconnected: fails >= 2 || undefined };
      if (fails === 2 || (only && fails >= 1)) logEvent({ act: "signal", who: "health", what: "disconnected", key, reason: r.reason });
    }
    if (r.ok && p.disconnected) logEvent({ act: "signal", who: "health", what: "reconnected", key });
  }
  // A connection that no longer exists in the brain leaves the file.
  const keys = new Set(connections().map(([k]) => k));
  for (const k of Object.keys(next)) if (!keys.has(k)) delete next[k];
  writeJson(FILE, next, 1);
  return next;
}

/** Takes a connection out of the brain: a data entry leaves the registry, a source is switched off. */
function remove(key) {
  const [kind, rest] = [key.split(":")[0], key.slice(key.indexOf(":") + 1)];
  if (kind === "source") {
    const f = join(ROOT, "sources", rest, "source.json");
    const d = readJson(f, null);
    if (!d) return { ok: false, error: `no source ${rest}` };
    d.enabled = false;
    writeJson(f, d, 2);
  } else if (kind === "data") {
    const bj = readJson(brainFile, null);
    const [scheme, sub] = rest.split("/");
    const def = bj?.data?.[scheme];
    if (!def) return { ok: false, error: `no data ${scheme}` };
    if (sub && def.projects?.[sub]) delete def.projects[sub];
    else if (sub && def.entities?.[sub]) delete def.entities[sub];
    else delete bj.data[scheme];
    if (def.projects && !Object.keys(def.projects).length) delete bj.data[scheme];
    if (def.entities && !Object.keys(def.entities).length) delete bj.data[scheme];
    writeJson(brainFile, bj, 2);
  } else return { ok: false, error: `unknown connection ${key}` };
  // The connection leaves health.json too; a file that cannot be read is left
  // for the next check to put aside.
  const h = readJsonFile(FILE, {});
  if (!h.unreadable && h.value && typeof h.value === "object") {
    delete h.value[key];
    writeJson(FILE, h.value, 1);
  }
  logEvent({ act: "signal", who: "person", what: "connection-removed", key });
  return { ok: true, removed: key };
}

if (args[0] === "remove") console.log(JSON.stringify(remove(args[1])));
else {
  const r = await check(opt("--only"));
  const down = Object.entries(r).filter(([, v]) => v.disconnected).map(([k, v]) => ({ key: k, label: v.label, reason: v.reason }));
  const failing = Object.entries(r).filter(([, v]) => v.ok === false && !v.disconnected).map(([k, v]) => ({ key: k, reason: v.reason }));
  console.log(JSON.stringify(args.includes("--json") ? { ok: true, disconnected: down, failing, checked: Object.keys(r).length } : { ok: true, disconnected: down.length, failing: failing.length, checked: Object.keys(r).length }));
}
