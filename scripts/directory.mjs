// directory.mjs - The contacts directory: the people the person exchanges
// with, as DATA, not notes. Thousands of addresses as notes would drown every
// search in near-identical texts; a directory answers "who is X", "who works
// at Y", "who handles my accounts", and only the people who matter become
// notes, by the person's decision.
//
// It lives in index/annuaire.json (index/directory.json in an English brain),
// in git: nothing in it can be rebuilt from the notes. Its fields speak the
// brain's language, like the notes: a French brain writes `adresse`, `nom`,
// `envoyes`, `etage`... exactly the format of the brain this plugin grew from.
//
// THE TIERS, recomputed at each change, never set by hand:
//   2  the core: many messages sent, or already a person's note
//   1  who matters: enough exchanges IN BOTH DIRECTIONS (a mass mailing, or
//      someone who never answered, never rises)
//   0  everyone else: kept, searchable, no note
// The thresholds are the brain's own (brain.json, `contacts`).
// A source that declares `"setsTier": true` may give a tier per contact, from
// rules the plugin cannot know (the first people of each client in a CRM...):
// it is kept as a FLOOR (`tierFloor`, `etage_min` in French), so the counts can
// still raise the contact, never drop them below it. A floor of 0 removes it.
// A brain may also leave the tiers entirely to its sources: `"tiersFrom":
// "sources"` in `contacts`, and the plugin never recomputes one.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { INDEX, config } from "./lib.mjs";
import { flat, matchContacts } from "./pure.mjs";

const FIELDS = {
  en: { file: "directory.json", generated: "generated", contacts: "contacts", rule: "rule", address: "address", name: "name", domain: "domain", sent: "sent", received: "received", first: "first", last: "last", subjects: "subjects", tier: "tier", tierFloor: "tierFloor", note: "note", summary: "summary", context: "context", themes: "themes" },
  fr: { file: "annuaire.json", generated: "genere", contacts: "contacts", rule: "regle", address: "adresse", name: "nom", domain: "domaine", sent: "envoyes", received: "recus", first: "premiere", last: "derniere", subjects: "sujets", tier: "etage", tierFloor: "etage_min", note: "fiche", summary: "resume", context: "contexte", themes: "themes" },
};
const CANON = Object.keys(FIELDS.en).filter((k) => !["file", "generated", "contacts", "rule"].includes(k));

// The directory may keep its own format for a while (`"directory": { "format": "fr" }`
// in brain.json): a brain moved to English notes before its directory writer.
export const fieldsOf = (cfg = config()) => FIELDS[cfg.directory?.format ?? cfg.format] ?? FIELDS.en;
export const directoryPath = (cfg = config()) => join(INDEX, fieldsOf(cfg).file);

/** The brain's thresholds, with defaults for a directory fed week by week. */
export function rules(cfg = config()) {
  const c = cfg.contacts ?? {};
  return { core: c.core ?? 30, matters: c.matters ?? 3, exclude: (c.exclude ?? []).map((x) => String(x).toLowerCase()), fromSources: c.tiersFrom === "sources" };
}


/** Reads the directory into the canonical shape (other fields kept as they are). */
export function readDirectory(cfg = config()) {
  const F = fieldsOf(cfg);
  const p = directoryPath(cfg);
  if (!existsSync(p)) return { generated: null, rule: null, contacts: [], extra: {} };
  const raw = JSON.parse(readFileSync(p, "utf8"));
  const { [F.generated]: generated, [F.contacts]: list, [F.rule]: rule, ...extra } = raw;
  const contacts = (list ?? []).map((c) => {
    const o = { ...c };
    for (const k of CANON) {
      if (F[k] !== k) delete o[F[k]];
      o[k] = c[F[k]];
    }
    return o;
  });
  return { generated, rule, contacts, extra };
}

/** Writes it back in the brain's own words, atomically. */
export function writeDirectory(dir, cfg = config()) {
  const F = fieldsOf(cfg);
  const contacts = dir.contacts.map((c) => {
    const o = {};
    for (const [k, v] of Object.entries(c)) {
      const key = CANON.includes(k) ? F[k] : k;
      if (v !== undefined && v !== null && !(Array.isArray(v) && !v.length)) o[key] = v;
    }
    return o;
  });
  const out = { ...dir.extra, [F.generated]: new Date().toISOString().slice(0, 10), [F.rule]: dir.rule, [F.contacts]: contacts };
  const p = directoryPath(cfg);
  // A brand new brain has no index/ folder until its first build.
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(`${p}.tmp`, `${JSON.stringify(out, null, 1)}\n`, "utf8");
  renameSync(`${p}.tmp`, p);
}

// WHAT IS NOBODY (2026-11-22). The AI that fills the directory is told to
// leave out automatic senders, but one brain found 380 of them in its
// directory: 75 Leboncoin relays ("Lucas via leboncoin", one throwaway
// address per ad), hotels through Booking, event guests through Luma, mass
// mail (notification.laposte.fr), order boxes (order-confirmation@...).
// Kept out in two steps: a platform relay or a mass-mail subdomain always;
// a service address, or a sender with no person's name and no name-like
// address, when the person never wrote to it. A contact with a note stays.
const RELAY = /(^|\.)(messagerie\.leboncoin\.fr|marketplace\.amazon\.[a-z.]+|property\.booking\.com|guest\.booking\.com|reply\.airbnb\.com|luma-mail\.com|mailinblack\.com|customer\.io|mailjet\.com|oraclecloud\.com|shopifyemail\.com|send\.relay\.app|facebookmail\.com|amazonses\.com|mcsv\.net|mcdlv\.net|sparkpostmail\.com|exacttarget\.com|lemlist\.com|intercom-mail\.com|zendesk\.com|freshdesk\.com|hubspotemail\.net|sendgrid\.net|mailgun\.org)$/i;
const MASS = /^(mail|email|emails|e|m|t|em|news|newsletter|reply|replies|bounce|bounces|mailer|mailing|mg|mta|sg|send|messagerie|notify|notice|notification|notifications|alerts?|marketing|crm|click|courriel|info|infos|comms?|contact|bnc|ml|mkt|offers?|offres?|promo|deals)\d*\.[^.]+\.[^.]+/i;
const SERVICE = /^(no-?reply|do-?not-?reply|do_not_reply|donotreply|ne-?pas-?repondre|ne_pas_repondre|mailer-daemon|postmaster|bounces?|newsletters?|notifications?|alerts?|service|services|service-?clients?|customer|customers|clients?|support|help|helpdesk|hello|bonjour|contact|contacts|info|infos|team|equipe|communication|communications|invitations?|confirmation|confirmations|confirmation-[a-z-]+|order-confirmation|livraison|delivery|billing|facturation|factures?|invoices?|receipts?|orders?|commandes?|account|accounts|security|updates?|digest|marketing|events?|webinars?|jobs|careers|admin|reservations?|bookings?|automated|system|feedback|survey|welcome|bienvenue|membership|community|partners?|sales|shop|store|subscriptions?|abonnements?|calendar|payments?|paiements?|tickets?|billetterie|registration|inscriptions?|transactions?|press|presse|newsroom|privacy|dpo|legal)([+._-]|\d|$)/i;
const NAME_LIKE = /^[a-z][a-z'-]{1,}[._-][a-z][a-z'-]{1,}\d{0,2}$|^[a-z]{1,2}[._-]?[a-z]{3,}$/i;
const BRAND_NAME = / via |\bteam\b|\bequipe\b|\béquipe\b|\bsupport\b|\bservice\b|\bnewsletter\b|\b(sas|sarl|inc|ltd|gmbh|llc)\b/i;

/** Whether an address is nobody (see above). @param {{ address: string, name?: string, sent?: number, note?: string }} c */
export function notAPerson(c) {
  if (c.note) return false;
  const [local, domain = ""] = String(c.address).toLowerCase().split("@");
  if (RELAY.test(domain) || MASS.test(domain)) return true;
  if (Number(c.sent ?? 0) > 0) return false;
  if (SERVICE.test(local)) return true;
  const name = String(c.name ?? "").trim();
  const person = name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).length >= 2 && !BRAND_NAME.test(name);
  return !person && !NAME_LIKE.test(local);
}

/** The tier of a contact, by the brain's rules. */
export function tierOf(c, r) {
  if (r.exclude.includes(String(c.address).toLowerCase()) || r.exclude.includes(String(c.domain ?? "").toLowerCase())) return 0;
  const floor = Math.min(2, Math.max(0, Number(c.tierFloor ?? 0) || 0));
  // A brain whose tiers are set by its own harvest ("tiersFrom": "sources"):
  // the plugin keeps what the harvest wrote and computes nothing.
  if (r.fromSources) return c.tierFloor !== undefined ? floor : Math.min(2, Math.max(0, Number(c.tier ?? 0) || 0));
  if (c.note) return 2;
  const sent = Number(c.sent ?? 0);
  const received = Number(c.received ?? 0);
  if (sent >= r.core && received > 0) return 2;
  if (sent + received >= r.matters && sent > 0 && received > 0) return Math.max(1, floor);
  return floor;
}

/**
 * Merges what a source or a review observed. `counts: "add"` adds the
 * messages of a new period (a weekly review); `counts: "set"` replaces them
 * (a harvest that recounts everything). The dates widen, the subjects and
 * themes join, a summary or context replaces the old one only if given.
 */
export function upsert(dir, items, { counts = "add", tiers = false } = {}, cfg = config()) {
  const r = rules(cfg);
  const byAddress = new Map(dir.contacts.map((c) => [String(c.address).toLowerCase(), c]));
  let added = 0;
  let changed = 0;
  let skipped = 0;
  for (const it of items) {
    const address = String(it.address ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) continue;
    if (r.exclude.includes(address)) continue;
    let c = byAddress.get(address);
    // Nobody (a relay, a mass mailing, a service box): never added, and an
    // old entry of the kind leaves (notAPerson, above).
    if (notAPerson({ ...c, ...it, address, sent: Number(c?.sent ?? 0) + Number(it.sent ?? 0), note: c?.note ?? it.note })) {
      if (c) { dir.contacts.splice(dir.contacts.indexOf(c), 1); byAddress.delete(address); }
      skipped++;
      continue;
    }
    if (!c) {
      c = { address, domain: address.split("@")[1], sent: 0, received: 0 };
      dir.contacts.push(c);
      byAddress.set(address, c);
      added++;
    } else changed++;
    for (const [k, v] of Object.entries(it)) {
      if (["address", "sent", "received", "first", "last", "subjects", "themes", "tier", "tierFloor"].includes(k) || v === undefined || v === null || v === "") continue;
      c[k] = v;
    }
    // A tier only from a source allowed to set one, and kept as a floor.
    if (tiers && it.tier !== undefined) {
      const t = Math.min(2, Math.max(0, Number(it.tier) || 0));
      if (t) c.tierFloor = t;
      else delete c.tierFloor;
    }
    for (const k of ["sent", "received"]) if (it[k] !== undefined) c[k] = counts === "set" ? Number(it[k]) : Number(c[k] ?? 0) + Number(it[k]);
    if (it.first && (!c.first || it.first < c.first)) c.first = it.first;
    if (it.last && (!c.last || it.last > c.last)) c.last = it.last;
    for (const k of ["subjects", "themes"]) if (it[k]) c[k] = [...new Set([...[].concat(it[k]), ...(c[k] ?? [])])].slice(0, 12);
  }
  for (const c of dir.contacts) c.tier = tierOf(c, r);
  dir.contacts.sort((a, b) => b.tier - a.tier || Number(b.sent ?? 0) - Number(a.sent ?? 0));
  dir.rule = { core: `>= ${r.core} messages sent and an answer, or a person's note`, matters: `>= ${r.matters} messages in both directions`, rest: "everyone else: data, no note" };
  return { added, changed, skipped };
}

/** Every word, anywhere in what is known of the contact, accents ignored (pure.mjs: the cloud Worker runs the same). */
export const searchDirectory = (dir, terms, o) => matchContacts(dir.contacts, terms, o);
