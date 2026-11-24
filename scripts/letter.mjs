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
//   echo '{"judge":{"name":"...","error":"...","failures":2,"waiting":5,"since":"<ISO date>"}}' | node scripts/letter.mjs alert [--dry]
//   echo '{"settings":{"error":"...","file":"..."}}' | node scripts/letter.mjs alert [--dry]   (the hub: this computer's settings cannot be read)
//   node scripts/letter.mjs test [--dry]
//
// The alert: the evening save calls it when a step or a source failed, so that
// a failure on Monday is not learnt from Sunday's letter. A short email by the
// letter's own channel (Brevo or Resend: a script can send it alone); with the
// connector or no channel, it is only kept in ~/.hypervibe-brain/alert.json,
// which status.mjs and the weekly review show. The hub sends the same alert,
// with its own words, when a judge failed twice in a row ("judge" on stdin).
//
// A JUDGE'S ALERT IS WRITTEN FOR SOMEONE WHO IS NOT TECHNICAL (2026-11-17):
// which judge, since when, how many items wait, what most likely happened in
// plain words (the class of its error, judge-errors.mjs), and the one sentence
// to say to their AI to have it repaired. The raw error comes last.
//
// The test: one short mail by the same channel, so that the person sees where
// their alerts will arrive before the day one is needed.
//
// Brevo and Resend read their key from the brain's .env (BREVO_API_KEY,
// RESEND_API_KEY), pasted there by the person, never through the conversation.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, ROOT, config, hypervibeVault, loadEnv, readJsonFile, requireBrain, today, writeFileAtomic } from "./lib.mjs";
import { brainLang } from "./i18n.mjs";
import { judgeErrorClass } from "./judge-errors.mjs";

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
    alertIntro: (n) => `${n === 1 ? "1 problème" : `${n} problèmes`} ce soir. Le reste de la sauvegarde a tourné, et ce qui a échoué sera repris au prochain passage s'il le peut.`,
    step: "Étape",
    colon: " : ",
    source: "Source",
    alertFoot: (f) => `^ Le détail est dans ${f}. Pour en parler : « /brain:status » dans une conversation Claude.`,
    judgeSubject: (name, judge) => `Brain de ${name} : le juge « ${judge} » est en panne`,
    judgeTitle: (judge) => `Le juge « ${judge} » est en panne`,
    judgeWhat: { conversations: " (celui qui lit vos conversations avec Claude)", documents: " (celui qui lit les documents de vos dossiers suivis)" },
    judgeIntro: (judge, what, since, n) => `Le juge « ${judge} »${what} n'arrive plus à travailler${since ? ` depuis ${since}` : ""}. Ses ${n} derniers passages ont échoué.`,
    judgeWaiting: (w) => `Rien n'est perdu. ${w === 0 ? "Sa pile est vide pour l'instant, et ce qui arrivera l'attendra" : w === 1 ? "1 élément l'attend dans sa pile et il le lira une fois réparé" : `${w} éléments l'attendent dans sa pile et il les lira une fois réparé`}. En attendant, il réessaie toutes les heures.`,
    judgeCauseTitle: "Ce qui s'est probablement passé",
    judgeCause: {
      "no-token": () => "Ce juge est un Claude qui travaille en arrière-plan, sans personne devant lui. Pour cela il lui faut un jeton, c'est-à-dire un accès durable à votre compte Claude, et il n'en trouve aucun sur cet ordinateur. Soit ce jeton n'a jamais été créé, soit il est rangé dans un coffre resté fermé.",
      token: () => "Le jeton qui lui donne accès à votre compte Claude n'est plus accepté. Soit il a expiré (un jeton dure un an), soit il a été révoqué. Il en faut un nouveau, que vous créez vous-même en deux minutes.",
      network: () => "Il n'a pas réussi à joindre Claude. L'ordinateur était sans connexion internet, ou le service de Claude ne répondait pas à ce moment-là. Si la connexion est revenue, il repartira tout seul à son prochain essai.",
      limit: () => "La limite de votre forfait Claude a été atteinte. Le juge utilise le même forfait que vos propres conversations. Il repartira tout seul quand la limite sera remise à zéro. Si cela se répète, son plafond du jour peut être abaissé.",
      instructions: (judge) => `Ses consignes sont introuvables. Le fichier qui lui dit quoi lire et quoi garder (instructions.md, dans le dossier sources/${judge} de votre brain) a été déplacé, renommé ou supprimé.`,
      "no-claude": () => "Le programme Claude en ligne de commande (« claude ») est introuvable sur cet ordinateur. Il a été désinstallé ou déplacé, ou le programme d'arrière-plan du brain ne sait plus où il se trouve.",
      other: () => "La cause n'est pas de celles que le brain sait reconnaître. Le message d'erreur est recopié à la fin de ce mail, et Claude saura le lire.",
    },
    judgeFixTitle: "Pour le réparer",
    judgeFixSay: "> Ouvrez Claude et dites : « le juge de mon brain est en panne, répare-le »",
    judgeFixThen: "Claude regarde ce qui s'est passé, vous confirme la cause et fait la réparation avec vous, pas à pas. Il ne vous demandera jamais de coller un jeton ou un mot de passe dans la conversation.",
    judgeRaw: (e) => `^ Le message d'erreur, tel quel : ${e}`,
    judgeFoot: (f) => `^ Le détail technique est dans ${f}.`,
    testSubject: (name) => `Brain de ${name} : essai de l'alerte`,
    testTitle: "Essai de l'alerte",
    testBody: [
      "Si vous lisez ce message, les alertes de votre brain arrivent bien ici.",
      "Vous en recevrez une quand quelque chose demande votre attention : une sauvegarde du soir qui a échoué, un juge en panne. Chacune dit ce qui s'est passé en mots simples, et la phrase à dire à Claude pour le réparer.",
      "^ Ce message est un essai. Il n'y a rien à faire.",
    ],
    vaultLocked: "Le coffre Hypervibe était fermé et personne ne l'a ouvert dans les 6 minutes : ce qui a échoué ci-dessous en dépendait peut-être. Les sources qui y prennent une clé n'ont pas échoué, elles attendent son ouverture.",
    settingsSubject: (name) => `Brain de ${name} : les réglages de cet ordinateur ne se lisent plus`,
    settingsTitle: "Les réglages de cet ordinateur ne se lisent plus",
    settingsIntro: (file) => `Le fichier des réglages du brain sur cet ordinateur (${file}) est toujours là, mais il ne se lit plus, le plus souvent après une modification à la main. Rien n'a été écrit par-dessus, et une copie est gardée à côté (config.json.bad).`,
    settingsWait: "Vos notes ne sont pas touchées. En attendant la réparation, le programme de fond ne fait plus tourner les sources ni les juges : ce qui arrive attend, rien n'est perdu.",
    settingsFixSay: "> Ouvrez Claude et dites : « les réglages de mon brain ne se lisent plus, répare-les »",
    settingsProblem: "Réglages de cet ordinateur",
  },
  en: {
    brand: "The brain",
    week: "week",
    subject: (n, name) => `${name}'s brain review, week ${n}`,
    alertSubject: (name) => `${name}'s brain: the evening save has a problem`,
    alertTitle: "The evening save has a problem",
    alertIntro: (n) => `${n === 1 ? "1 problem" : `${n} problems`} this evening. The rest of the save ran, and what failed is taken up again next time if it can be.`,
    step: "Step",
    colon: ": ",
    source: "Source",
    alertFoot: (f) => `^ The details are in ${f}. To talk about it: "/brain:status" in a Claude conversation.`,
    judgeSubject: (name, judge) => `${name}'s brain: the judge "${judge}" is down`,
    judgeTitle: (judge) => `The judge "${judge}" is down`,
    judgeWhat: { conversations: " (the one that reads your conversations with Claude)", documents: " (the one that reads the documents of your watched folders)" },
    judgeIntro: (judge, what, since, n) => `The judge "${judge}"${what} has not been able to work${since ? ` since ${since}` : ""}. Its last ${n} runs failed.`,
    judgeWaiting: (w) => `Nothing is lost. ${w === 0 ? "Its pile is empty for now, and what arrives will wait for it" : w === 1 ? "1 item waits in its pile and it will read it once repaired" : `${w} items wait in its pile and it will read them once repaired`}. Meanwhile it tries again every hour.`,
    judgeCauseTitle: "What most likely happened",
    judgeCause: {
      "no-token": () => "This judge is a Claude that works in the background, with nobody in front of it. For that it needs a token, a lasting access to your Claude account, and it finds none on this computer. Either the token was never created, or it is kept in a vault that stayed locked.",
      token: () => "The token that gives it access to your Claude account is no longer accepted. Either it has expired (a token lasts one year), or it was revoked. It needs a new one, which you create yourself in two minutes.",
      network: () => "It could not reach Claude. The computer had no internet connection, or Claude's service was not answering at that moment. If the connection is back, it will start again by itself at its next try.",
      limit: () => "The limit of your Claude plan was reached. The judge uses the same plan as your own conversations. It will start again by itself when the limit is reset. If this happens again, its cap for the day can be lowered.",
      instructions: (judge) => `Its instructions cannot be found. The file that tells it what to read and what to keep (instructions.md, in the folder sources/${judge} of your brain) was moved, renamed or deleted.`,
      "no-claude": () => 'The Claude command-line program ("claude") cannot be found on this computer. It was uninstalled or moved, or the brain\'s background program no longer knows where it is.',
      other: () => "The cause is not one the brain knows how to recognise. The error message is copied at the end of this mail, and Claude will know how to read it.",
    },
    judgeFixTitle: "To repair it",
    judgeFixSay: '> Open Claude and say: "the judge of my brain is down, repair it"',
    judgeFixThen: "Claude looks at what happened, confirms the cause and does the repair with you, step by step. It will never ask you to paste a token or a password into the conversation.",
    judgeRaw: (e) => `^ The error message, as it is: ${e}`,
    judgeFoot: (f) => `^ The technical details are in ${f}.`,
    testSubject: (name) => `${name}'s brain: a test of the alert`,
    testTitle: "A test of the alert",
    testBody: [
      "If you are reading this message, the alerts of your brain arrive here.",
      "You will get one when something needs your attention: an evening save that failed, a judge that is down. Each says what happened in plain words, and the sentence to say to Claude to have it repaired.",
      "^ This message is a test. There is nothing to do.",
    ],
    vaultLocked: "The Hypervibe vault was locked and nobody opened it within 6 minutes: what failed below may have depended on it. The sources that take a key in it did not fail, they wait for it to be opened.",
    settingsSubject: (name) => `${name}'s brain: the settings of this computer can no longer be read`,
    settingsTitle: "The settings of this computer can no longer be read",
    settingsIntro: (file) => `The file of the brain's settings on this computer (${file}) is still there, but it can no longer be read, most often after a change made by hand. Nothing was written over it, and a copy is kept beside it (config.json.bad).`,
    settingsWait: "Your notes are untouched. Until it is repaired, the background program runs no source and no judge: what arrives waits, nothing is lost.",
    settingsFixSay: '> Open Claude and say: "the settings of my brain can no longer be read, repair them"',
    settingsProblem: "Settings of this computer",
  },
}[lang === "fr" ? "fr" : "en"];

/** A date as a person reads it in a sentence: "lundi 16 novembre à 14:05", "Monday, November 16 at 2:05 PM". */
function sinceWords(iso) {
  const d = new Date(iso ?? "");
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "fr" ? "fr-FR" : "en-US", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(d);
}

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
  // Whole or not at all (lib.mjs): every script reads brain.json.
  writeFileAtomic(file, `${JSON.stringify(raw, null, 2)}\n`);
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
  return hypervibeVault(channel === "brevo" ? "BREVO" : "RESEND", "api_key");
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
  // Or, from the hub: ONE judge that failed twice in a row ("judge" on stdin:
  // its name, its error, how many runs failed, how many items wait in its
  // pile). Same record, same channel, its own words; the states of the other
  // sources stay the evening's business.
  let failed = [];
  let vaultLocked = false;
  let judge = null;
  // Or, from the hub (2026-11-21): this computer's settings, there and
  // unreadable ("settings" on stdin: { error, file }). The hub then runs
  // nothing at all; said once, in words of its own.
  let settings = null;
  try {
    const input = JSON.parse(readFileSync(0, "utf8") || "{}");
    failed = input.failed ?? [];
    vaultLocked = input.vaultLocked === true;
    judge = input.judge?.name ? input.judge : null;
    settings = !judge && input.settings?.error ? input.settings : null;
  } catch {
    failed = [];
  }
  const since = opt("--since") ?? new Date(Date.now() - 6 * 3600_000).toISOString();
  const problems = judge
    ? [`${WORDS.source} ${judge.name}${WORDS.colon}${String(judge.error ?? "").slice(0, 300)}`]
    : settings
      ? [`${WORDS.settingsProblem}${WORDS.colon}${String(settings.error).slice(0, 300)}`]
      : failed.map((f) => `${WORDS.step} ${f.step}${WORDS.colon}${String(f.message ?? "").slice(0, 300)}`);
  const sourcesDir = join(ROOT, "sources");
  if (!judge && !settings && existsSync(sourcesDir)) {
    for (const n of readdirSync(sourcesDir)) {
      try {
        const st = JSON.parse(readFileSync(join(sourcesDir, n, "state.json"), "utf8"));
        if (st.lastError && st.lastRun && st.lastRun >= since) problems.push(`${WORDS.source} ${n}${WORDS.colon}${String(st.lastError).slice(0, 300)}`);
      } catch {
        // no state yet
      }
    }
  }
  // The cause first when it explains the rest: a locked vault takes the keys
  // of several steps at once, and their own messages rarely say so.
  // A VAULT THAT STAYED CLOSED IS NOT A PROBLEM BY ITSELF (2026-11-21): the
  // sources that take a key in it wait in the queue, without an error, and it
  // made an alert of every evening the person was away. It is said only
  // beside what did fail.
  if (vaultLocked && problems.length) problems.unshift(WORDS.vaultLocked);
  if (!problems.length) {
    out({ ok: true, alert: false });
    process.exit(0);
  }
  // The hub names its log by the UTC day, the evening save by the local one.
  const logFile = judge || settings ? `hub-${new Date().toISOString().slice(0, 10)}.log` : `nightly-${today()}.log`;
  // A judge down: which one, since when, what waits, the likely cause in
  // plain words, the sentence that has it repaired; the raw error last.
  const cause = judge ? judgeErrorClass(judge.error) : null;
  const md = judge
    ? [
        `# ${WORDS.judgeTitle(judge.name)}`,
        WORDS.judgeIntro(judge.name, WORDS.judgeWhat[judge.name] ?? "", sinceWords(judge.since), Number(judge.failures) || 2),
        "",
        WORDS.judgeWaiting(Number(judge.waiting) || 0),
        `## ${WORDS.judgeCauseTitle}`,
        WORDS.judgeCause[cause](judge.name),
        `## ${WORDS.judgeFixTitle}`,
        WORDS.judgeFixSay,
        "",
        WORDS.judgeFixThen,
        WORDS.judgeRaw(String(judge.error ?? "").replace(/\s+/g, " ").trim().slice(0, 300) || "?"),
        WORDS.judgeFoot(`~/.hypervibe-brain/logs/${logFile}`),
      ].join("\n")
    : settings
      ? [
          `# ${WORDS.settingsTitle}`,
          WORDS.settingsIntro(String(settings.file ?? "~/.hypervibe-brain/config.json")),
          "",
          WORDS.settingsWait,
          `## ${WORDS.judgeFixTitle}`,
          WORDS.settingsFixSay,
          WORDS.judgeRaw(String(settings.error).replace(/\s+/g, " ").trim().slice(0, 300)),
          WORDS.judgeFoot(`~/.hypervibe-brain/logs/${logFile}`),
        ].join("\n")
      : [`# ${WORDS.alertTitle}`, WORDS.alertIntro(problems.length), ...problems.map((p, i) => `${i + 1}. ${p}`), WORDS.alertFoot(`~/.hypervibe-brain/logs/${logFile}`)].join("\n");
  const subject = judge ? WORDS.judgeSubject(cfg.name ?? "", judge.name) : settings ? WORDS.settingsSubject(cfg.name ?? "") : WORDS.alertSubject(cfg.name ?? "");
  const letter = cfg.letter ?? { channel: "none" };
  // Kept on this computer either way, BEFORE sending: status.mjs and the weekly
  // review show it, and a mail that cannot leave (its key in a locked vault)
  // must not take the record with it.
  // SEVERAL JUDGES DOWN (2026-11-21). Each alert wrote over the one before: of
  // three judges down the same day, the record kept one. The record is still
  // the last alert, as before, and "judges" beside it lists every judge an
  // alert named in the last seven days (the latest of each), this one included.
  const alertFile = join(HOME, ".hypervibe-brain", "alert.json");
  const before = readJsonFile(alertFile, null).value;
  const earlier = (Array.isArray(before?.judges) ? before.judges : before?.judge ? [{ judge: before.judge, cause: before.cause ?? null, since: before.since ?? null, waiting: before.waiting ?? 0, date: before.date, sent: before.sent === true }] : [])
    .filter((j) => j && typeof j.judge === "string" && j.judge !== judge?.name && Date.now() - Date.parse(j.date) < 7 * 86400_000);
  const keep = (sent) => {
    const date = new Date().toISOString();
    const mine = judge ? { judge: judge.name, cause, since: judge.since ?? null, waiting: Number(judge.waiting) || 0 } : settings ? { settings: true } : {};
    const judges = [...earlier, ...(judge ? [{ ...mine, date, sent: Boolean(sent) }] : [])];
    writeFileAtomic(alertFile, `${JSON.stringify({ date, ...mine, problems, sent: Boolean(sent), ...(judges.length ? { judges } : {}) }, null, 2)}\n`);
  };
  keep(false);
  let sent = null;
  try {
    sent = args.includes("--dry") ? null : await deliver(letter, subject, toHtml(md, isoWeek()), md);
  } catch (e) {
    out({ ok: false, alert: true, sent: false, error: String(e.message ?? e).slice(0, 300), problems });
    process.exit(1);
  }
  keep(sent);
  out({ ok: true, alert: true, sent: Boolean(sent), channel: letter.channel ?? "none", subject, ...(cause ? { cause } : {}), problems });
} else if (command === "test") {
  // One short mail by the channel of the alerts. Brevo or Resend: it leaves
  // from here. The connector: a script cannot use it, so the alerts will stay
  // on the computer; Claude may send this text with it, for the letter's sake.
  const letter = cfg.letter ?? { channel: "none" };
  const md = [`# ${WORDS.testTitle}`, ...WORDS.testBody].join("\n");
  const subject = WORDS.testSubject(cfg.name ?? "");
  const base = { subject, to: letter.to ?? null, channel: letter.channel ?? "none" };
  if (!letter.channel || letter.channel === "none") out({ ok: true, sent: false, alertsByMail: false, reason: "no channel: an alert is kept on this computer (alert.json), and the status shows it first", ...base });
  else if (letter.channel === "connector") out({ ok: true, sent: false, alertsByMail: false, sendWithConnector: true, text: md, reason: "the connector is Claude's: a script cannot send an alert with it, so alerts stay on this computer", ...base });
  else if (args.includes("--dry")) out({ ok: true, dry: true, alertsByMail: true, ...base });
  else {
    await deliver(letter, subject, toHtml(md, isoWeek()), md);
    out({ ok: true, sent: true, alertsByMail: true, ...base });
  }
} else {
  console.log("usage: letter.mjs setup | send | alert | test (see the top of scripts/letter.mjs)");
  process.exitCode = 2;
}
