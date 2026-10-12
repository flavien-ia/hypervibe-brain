#!/usr/bin/env node
// letter.mjs - The weekly letter: the review, delivered where the person reads,
// their phone included, without opening anything. It is their one appointment
// with what the machine added to their brain: the seeds, the proposals, the
// promotions, each numbered so that they can answer in one sentence.
//
// The letter is written in markdown by the weekly review (Claude), then:
//   - it is ALWAYS kept in the brain (reviews/<date>-letter.md): an answer such
//     as "apply proposals 1 and 4" must find what 1 and 4 were;
//   - it is rendered into an email that Gmail and phones display reliably
//     (inline styles and layout tables, no <style>, no remote font);
//   - it is sent by the channel the person chose: their own mail connector
//     (Claude sends it, to themselves), a Brevo or Resend key of theirs, or
//     not at all (the report stays in the brain).
//
// The markdown it knows: `# title` (the first one: the letter's header),
// `## section` (its accent colour comes from its words), `1.` numbered lists
// (round badges), `-` lists, **bold**, [links](url), `code`, `---` a separator,
// `> ` a light box (consecutive lines make one), `>> ` a dark box, `^ ` small
// grey text at the foot (the brain's health).
//
//   node scripts/letter.mjs setup --channel connector|brevo|resend|none [--to <address>] [--from <address>] [--from-name "<name>"]
//   cat letter.md | node scripts/letter.mjs send [--dry] [--html <file>] [--week N]
//   echo '{"failed":[...]}' | node scripts/letter.mjs alert --since <ISO date> [--dry]
//
// The alert: the evening save calls it when a step or a source failed, so that
// a failure on Monday is not learnt from Sunday's letter. A short email by the
// letter's own channel (Brevo or Resend: a script can send it alone); with the
// connector or no channel, it is only kept in ~/.hypervibe-brain/alert.json,
// which status.mjs and the weekly review show.
//
// Brevo and Resend read their key from the brain's .env (BREVO_API_KEY,
// RESEND_API_KEY), pasted there by the person, never through the conversation.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, ROOT, config, loadEnv, requireBrain, today } from "./lib.mjs";
import { brainLang } from "./i18n.mjs";

requireBrain();
const args = process.argv.slice(2);
const command = args[0];
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const out = (o) => console.log(JSON.stringify(o));
const fail = (error) => {
  out({ ok: false, error });
  process.exit(1);
};
const cfg = config();
const lang = brainLang(ROOT);
const WORDS = {
  fr: {
    brand: "Le brain",
    week: "semaine",
    subject: (n, name) => `Revue du brain de ${name}, semaine ${n}`,
    alertSubject: (name) => `Brain de ${name} : la sauvegarde du soir a un problème`,
    alertTitle: "La sauvegarde du soir a un problème",
    alertIntro: (n) => `${n} problème(s) ce soir. Le reste de la sauvegarde a tourné, et ce qui a échoué sera repris au prochain passage s'il le peut.`,
    step: "Étape",
    colon: " : ",
    source: "Source",
    alertFoot: (f) => `^ Le détail est dans ${f}. Pour en parler : « /brain:status » dans une conversation Claude.`,
  },
  en: {
    brand: "The brain",
    week: "week",
    subject: (n, name) => `${name}'s brain review, week ${n}`,
    alertSubject: (name) => `${name}'s brain: the evening save has a problem`,
    alertTitle: "The evening save has a problem",
    alertIntro: (n) => `${n} problem(s) this evening. The rest of the save ran, and what failed is taken up again next time if it can be.`,
    step: "Step",
    colon: ": ",
    source: "Source",
    alertFoot: (f) => `^ The details are in ${f}. To talk about it: "/brain:status" in a Claude conversation.`,
  },
}[lang === "fr" ? "fr" : "en"];

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
}

const PAPER = "#f3f1ec";
const INK = "#1f2430";
const TEXT = "#2a2f3a";
const SOFT = "#6b7280";
const SERIF = "Georgia,'Times New Roman',serif";
const SANS = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

/** A section's colour is read in its title, in either language. */
function accentOf(title) {
  const t = title.toLowerCase();
  if (/graine|seed/.test(t)) return { strong: "#2f7d5b", pale: "#eaf4ee" };
  if (/proposition|proposal/.test(t)) return { strong: "#b7791f", pale: "#fbf3e4" };
  if (/promotion|mûre|ripe|collision/.test(t)) return { strong: "#6b46c1", pale: "#f1ecfb" };
  return { strong: "#3b5bdb", pale: "#edf1fd" };
}

export function toHtml(md, week) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let accent = accentOf("");
  const inline = (s, dark = false) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" style="color:${dark ? "#9ec5ff" : accent.strong};text-decoration:underline">$1</a>`)
      .replace(/\*\*([^*]+)\*\*/g, `<strong style="color:${dark ? "#ffffff" : INK}">$1</strong>`)
      .replace(
        /`([^`]+)`/g,
        dark
          ? `<code style="font-family:Menlo,Consolas,monospace;font-size:12.5px;background:#343a48;color:#e8e3d8;padding:1px 6px;border-radius:5px">$1</code>`
          : `<code style="font-family:Menlo,Consolas,monospace;font-size:12.5px;background:${accent.pale};color:${accent.strong};padding:1px 6px;border-radius:5px">$1</code>`,
      );

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  // The first level-one title becomes the header; it is not repeated in the body.
  let title = WORDS.brand;
  const iTitle = lines.findIndex((l) => /^#\s+/.test(l));
  if (iTitle >= 0) {
    title = lines[iTitle].replace(/^#\s+/, "").trim();
    lines.splice(iTitle, 1);
  }

  const body = [];
  const foot = [];
  let block = null; // "ul" | "ol" | "box" | "dark"
  const close = () => {
    if (block === "ul") body.push("</ul>");
    else if (block === "ol") body.push("</table>");
    else if (block === "box" || block === "dark") body.push("</td></tr></table>");
    block = null;
  };
  const open = (what) => {
    if (block === what) return;
    close();
    block = what;
    if (what === "ul") body.push(`<ul style="margin:8px 0 8px;padding-left:20px;color:${TEXT}">`);
    else if (what === "ol") body.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0">');
    else if (what === "box") body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:${accent.pale};border-radius:10px;padding:12px 16px;font-size:14px;line-height:1.5;color:${TEXT}">`);
    else if (what === "dark") body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0"><tr><td style="background:${INK};border-radius:12px;padding:18px 20px;font-size:14.5px;line-height:1.55;color:#e8e3d8">`);
  };

  for (const raw of lines) {
    const l = raw.trimEnd();
    if (!l.trim()) {
      close();
      continue;
    }
    if (/^-{3,}$/.test(l.trim())) {
      close();
      body.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 8px"><tr><td align="center" style="color:#c9c2b3;font-size:14px;letter-spacing:8px">&#8226;&#8226;&#8226;</td></tr></table>`);
      continue;
    }
    const dark = l.match(/^>>\s?(.*)$/);
    if (dark) {
      open("dark");
      body.push(`<p style="margin:5px 0">${inline(dark[1], true)}</p>`);
      continue;
    }
    const box = l.match(/^>\s?(.*)$/);
    if (box) {
      open("box");
      body.push(`<p style="margin:4px 0">${inline(box[1])}</p>`);
      continue;
    }
    const small = l.match(/^\^\s+(.*)$/);
    if (small) {
      close();
      foot.push(`<p style="margin:4px 0">${inline(small[1])}</p>`);
      continue;
    }
    const heading = l.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      close();
      const n = heading[1].length;
      if (n <= 2) {
        accent = accentOf(heading[2]);
        body.push(
          `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:30px 0 10px"><tr>` +
            `<td width="4" style="background:${accent.strong};border-radius:2px">&nbsp;</td>` +
            `<td style="padding-left:12px;font-family:${SERIF};font-size:21px;line-height:1.25;color:${INK};font-weight:normal">${inline(heading[2])}</td>` +
            `</tr></table>`,
        );
      } else body.push(`<h${n} style="font-size:15px;margin:20px 0 6px;color:${INK};font-weight:600">${inline(heading[2])}</h${n}>`);
      continue;
    }
    const num = l.match(/^\s*(\d+)\.\s+(.*)$/);
    if (num) {
      open("ol");
      body.push(
        `<tr><td valign="top" width="34" style="padding:7px 0">` +
          `<div style="width:24px;height:24px;border-radius:12px;background:${accent.strong};color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:24px;font-family:${SANS}">${num[1]}</div></td>` +
          `<td valign="top" style="padding:7px 0 7px 2px;border-bottom:1px solid #f0ede6;color:${TEXT};font-size:14.5px;line-height:1.55">${inline(num[2])}</td></tr>`,
      );
      continue;
    }
    const item = l.match(/^\s*[-*]\s+(.*)$/);
    if (item) {
      open("ul");
      body.push(`<li style="margin:4px 0;font-size:14.5px">${inline(item[1])}</li>`);
      continue;
    }
    close();
    body.push(`<p style="margin:10px 0;color:${TEXT}">${inline(l)}</p>`);
  }
  close();

  const header =
    `<tr><td style="background:${INK};padding:28px 32px 26px;border-radius:16px 16px 0 0">` +
    `<div style="font-family:${SANS};font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#a9b1c3">${esc(WORDS.brand)} &#183; ${WORDS.week} ${week}</div>` +
    `<div style="font-family:${SERIF};font-size:28px;line-height:1.2;color:#ffffff;margin-top:8px">${esc(title)}</div>` +
    `</td></tr>`;
  const footHtml = foot.length
    ? `<tr><td style="background:#faf8f4;border-top:1px solid #ece7dc;padding:16px 32px 20px;border-radius:0 0 16px 16px;font-family:${SANS};font-size:12px;line-height:1.5;color:${SOFT}">${foot.join("")}</td></tr>`
    : "";
  const bodyEnd = foot.length ? "" : ";border-radius:0 0 16px 16px";
  return (
    `<div style="background:${PAPER};padding:28px 12px;margin:0">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:660px;margin:0 auto;border-collapse:separate">` +
    header +
    `<tr><td style="background:#ffffff;padding:10px 32px 26px;font-family:${SANS};font-size:15px;line-height:1.6;color:${TEXT}${bodyEnd}">${body.join("\n")}</td></tr>` +
    footHtml +
    `</table></div>`
  );
}

const writeConfig = (patch) => {
  const file = join(ROOT, "brain.json");
  const raw = JSON.parse(readFileSync(file, "utf8"));
  raw.letter = { ...(raw.letter ?? {}), ...patch };
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return raw.letter;
};

/**
 * The key of the mail service: the brain's .env first; otherwise, for a person
 * who keeps their keys in the Hypervibe vault (Bitwarden, item BREVO or RESEND,
 * field api_key), read from it, silently, never printed nor written anywhere.
 */
function serviceKey(channel) {
  loadEnv();
  const fromEnv = channel === "brevo" ? process.env.BREVO_API_KEY : process.env.RESEND_API_KEY;
  if (fromEnv) return fromEnv;
  const vaults = [];
  const walk = (dir, depth) => {
    if (depth > 6 || !existsSync(dir)) return;
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory() || e.name === "node_modules" || e.name.startsWith(".git")) continue;
      const p = join(dir, e.name);
      if (existsSync(join(p, "scripts", "vault", "vault.mjs"))) vaults.push(join(p, "scripts", "vault", "vault.mjs"));
      else walk(p, depth + 1);
    }
  };
  if (process.env.HVBRAIN_VAULT !== "off") walk(join(HOME, ".claude", "plugins"), 0);
  for (const v of vaults) {
    const r = spawnSync(process.execPath, [v, "get", channel === "brevo" ? "BREVO" : "RESEND", "api_key"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

/** Sends by Brevo or Resend, the channels a script can use alone; null for the others. */
async function deliver(letter, subject, html, text) {
  if (letter.channel !== "brevo" && letter.channel !== "resend") return null;
  const key = serviceKey(letter.channel);
  if (!key) fail(`no ${letter.channel === "brevo" ? "BREVO_API_KEY" : "RESEND_API_KEY"} in the brain's .env (nor in an open Hypervibe vault)`);
  const res =
    letter.channel === "brevo"
      ? await fetch(`${process.env.HVBRAIN_BREVO_URL ?? "https://api.brevo.com/v3"}/smtp/email`, {
        method: "POST",
        headers: { "api-key": key, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ sender: { name: letter.fromName ?? WORDS.brand, email: letter.from }, to: [{ email: letter.to }], subject, htmlContent: html, textContent: text }),
        signal: AbortSignal.timeout(60_000),
      })
      : await fetch(`${process.env.HVBRAIN_RESEND_URL ?? "https://api.resend.com"}/emails`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${letter.fromName ?? WORDS.brand} <${letter.from}>`, to: [letter.to], subject, html, text }),
        signal: AbortSignal.timeout(60_000),
      });
  if (!res.ok) fail(`the mail was refused by ${letter.channel} (HTTP ${res.status}): ${(await res.text()).slice(0, 250)}`);
  return true;
}

if (command === "setup") {
  const channel = opt("--channel");
  if (!["connector", "brevo", "resend", "none"].includes(channel)) fail("--channel connector, brevo, resend or none");
  const to = opt("--to");
  const from = opt("--from");
  if (channel !== "none" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(to ?? ""))) fail("--to: the person's own address");
  if ((channel === "brevo" || channel === "resend") && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(from ?? ""))) fail("--from: a sender address verified at the service");
  out({ ok: true, letter: writeConfig({ channel, to: to ?? null, from: from ?? null, fromName: opt("--from-name") ?? WORDS.brand, since: today() }) });
} else if (command === "send") {
  const md = readFileSync(0, "utf8");
  if (!md.trim()) fail("the letter is empty (it comes from stdin)");
  const week = Number(opt("--week") ?? isoWeek());
  const html = toHtml(md, week);
  const subject = WORDS.subject(week, cfg.name ?? "");
  // Always kept in the brain: the answers to it must find its numbers.
  mkdirSync(join(ROOT, "reviews"), { recursive: true });
  const kept = join(ROOT, "reviews", `${today()}-letter.md`);
  writeFileSync(kept, md, "utf8");
  const htmlFile = opt("--html") ?? join(ROOT, "reviews", `${today()}-letter.html`);
  writeFileSync(htmlFile, `<!doctype html><meta charset="utf-8"><title>${subject}</title><body style="margin:0">${html}</body>`, "utf8");
  const letter = cfg.letter ?? { channel: "none" };
  const base = { subject, to: letter.to ?? null, kept: kept.replace(/\\/g, "/"), html: htmlFile.replace(/\\/g, "/") };
  if (args.includes("--dry")) {
    out({ ok: true, dry: true, channel: letter.channel, ...base });
    process.exit(0);
  }
  if (letter.channel === "none" || !letter.channel) {
    out({ ok: true, sent: false, reason: "no letter channel: the report stays in the brain", ...base });
    process.exit(0);
  }
  if (letter.channel === "connector") {
    // The script cannot reach the person's mail: Claude sends it, with their
    // own connector, to their own address, using the HTML file above.
    out({ ok: true, sent: false, sendWithConnector: true, ...base });
    process.exit(0);
  }
  await deliver(letter, subject, html, md);
  out({ ok: true, sent: true, channel: letter.channel, ...base });
} else if (command === "alert") {
  // What failed this evening: the steps the launcher saw fail (on stdin), and
  // the sources whose run since the start of the evening ended in an error.
  let failed = [];
  try {
    failed = JSON.parse(readFileSync(0, "utf8") || "{}").failed ?? [];
  } catch {
    failed = [];
  }
  const since = opt("--since") ?? new Date(Date.now() - 6 * 3600_000).toISOString();
  const problems = failed.map((f) => `${WORDS.step} ${f.step}${WORDS.colon}${String(f.message ?? "").slice(0, 300)}`);
  const sourcesDir = join(ROOT, "sources");
  if (existsSync(sourcesDir)) {
    for (const n of readdirSync(sourcesDir)) {
      try {
        const st = JSON.parse(readFileSync(join(sourcesDir, n, "state.json"), "utf8"));
        if (st.lastError && st.lastRun && st.lastRun >= since) problems.push(`${WORDS.source} ${n}${WORDS.colon}${String(st.lastError).slice(0, 300)}`);
      } catch {
        // no state yet
      }
    }
  }
  if (!problems.length) {
    out({ ok: true, alert: false });
    process.exit(0);
  }
  const md = [`# ${WORDS.alertTitle}`, WORDS.alertIntro(problems.length), ...problems.map((p, i) => `${i + 1}. ${p}`), WORDS.alertFoot(`~/.hypervibe-brain/logs/nightly-${today()}.log`)].join("\n");
  const subject = WORDS.alertSubject(cfg.name ?? "");
  const letter = cfg.letter ?? { channel: "none" };
  const sent = args.includes("--dry") ? null : await deliver(letter, subject, toHtml(md, isoWeek()), md);
  // Kept on this computer either way: status.mjs and the weekly review show it.
  mkdirSync(join(HOME, ".hypervibe-brain"), { recursive: true });
  writeFileSync(join(HOME, ".hypervibe-brain", "alert.json"), `${JSON.stringify({ date: new Date().toISOString(), problems, sent: Boolean(sent) }, null, 2)}\n`, "utf8");
  out({ ok: true, alert: true, sent: Boolean(sent), channel: letter.channel ?? "none", subject, problems });
} else {
  console.log("usage: letter.mjs setup | send | alert (see the top of scripts/letter.mjs)");
  process.exitCode = 2;
}
