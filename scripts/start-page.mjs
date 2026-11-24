// start-page.mjs - The start of a brain, as a page the person keeps open
// (2026-11-20).
//
// /brain:start is long: it builds the brain part after part (2026-11-23):
// the check for a brain that exists already, the computer, the brain itself,
// the tools that feed it, the knowledge that comes in, the executive floor,
// the life of the brain. In the chat, where things stand scrolls away. This
// page shows every part, what is done, what is being done and what waits, and
// says that stopping loses nothing.
//
// A FILE, NOT A SERVER. The page must exist before the brain does (the first
// parts come before it), so it cannot be the live view's. It is one
// self-contained file in this computer's settings (~/.hypervibe-brain/
// start.html), written again each time the start moves; the page reads itself
// again every few seconds while something is left to do. Nothing is sent
// anywhere, and nothing in it can be clicked to change the brain: it shows.
// Once the live view is open (the second part), it shows the same building in
// a panel of its own (live/page/build.js), beside the brain as it fills.

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// A count with its word, agreed: English says "1 file, 0 files", French "0 fichier, 1 fichier".
const en = (n, one, more) => `${n} ${n === 1 ? one : more}`;
const fr = (n, one, more) => `${n} ${n < 2 ? one : more}`;

const TEXT = {
  en: {
    title: "The start of your second brain",
    lives: (p) => `Your brain lives in ${p}`,
    noBrain: "Your brain does not exist yet: it comes in the third part.",
    doing: "Now",
    paused: (d) => `Paused on ${d}`,
    resume: "You can stop at any moment, close this page, even run out of your Claude plan for the day: nothing is lost. In Claude, type /brain:start and the start picks up exactly here.",
    finished: "Every part is done. Your brain is built and filled: /brain:status tells you where it stands at any time.",
    count: (done, all) => `${done} of ${all}`,
    updated: (t) => `Updated at ${t}. This page reads itself again while the start goes on.`,
    states: { done: "done", now: "now", todo: "to do", declined: "set aside", na: "does not apply", waiting: "next", later: "later", never: "never", running: "being read" },
    part: (n) => `Part ${n}`,
    parts: {
      preflight: ["Before anything", "Is there a brain of yours already, on this computer, on another one, on your GitHub?"],
      computer: ["The computer", "It has what a brain needs"],
      container: ["The brain", "Where it lives, its domains, its types, then the live view, which stays open beside the rest"],
      tools: ["The tools", "What feeds it, before any knowledge comes in: so that you know where it comes from"],
      knowledge: ["The knowledge", "What you have already written and done comes in, one block at a time, each counted first and its cost said before anything is read"],
      executive: ["The executive floor", "Your skills and the guards that frame them, kept in your brain"],
      life: ["The life of the brain", "What keeps it alive without you"],
    },
    steps: {
      computer: ["Your computer", "It has what a brain needs"],
      brain: ["The brain itself", "What it is for, where it lives, its domains and its types"],
      view: ["The live view", "Watching the brain fill, in a window of its own"],
      sources: ["What feeds it", "Mail and calendar, folders, your work with Claude"],
      live: ["Reading the same day", "A Claude in the background reads your conversations and documents"],
      token: ["The access of that Claude", "What lets it work without you"],
      cap: ["The cap for the day", "How much of your Claude plan the reading may use"],
      executive: ["Your skills and guards", "Brought from Claude Code's folders into your brain"],
      alert: ["The alert", "Being told the same day when something goes wrong"],
      routines: ["The routines", "The evening save, the weekly review"],
    },
    blocks: {
      writings: "Your writings",
      memory: "What Claude remembers of you",
      conversations: "Your conversations with Claude",
      documents: "The documents of your folders",
      contacts: "The people of your mail",
    },
    units: { files: ["file", "files"], conversations: ["conversation", "conversations"], documents: ["document", "documents"], months: ["month", "months"] },
    notCounted: "not counted yet",
    figures: (p, u) => `${p.done} of ${en(p.total, u[0], u[1])} in, ${p.left} left${p.notes === null ? "" : `, ${en(p.notes, "note", "notes")} added`}`,
  },
  fr: {
    title: "Le démarrage de ton second brain",
    lives: (p) => `Ton brain vit dans ${p}`,
    noBrain: "Ton brain n’existe pas encore : il vient dans la troisième partie.",
    doing: "En ce moment",
    paused: (d) => `En pause depuis le ${d}`,
    resume: "Tu peux arrêter à tout moment, fermer cette page, même arriver au bout de ton forfait Claude du jour : rien n’est perdu. Dans Claude, tape /brain:start et le démarrage reprend exactement ici.",
    finished: "Toutes les parties sont faites. Ton brain est construit et rempli : /brain:status te dit où il en est à tout moment.",
    count: (done, all) => `${done} sur ${all}`,
    updated: (t) => `Mis à jour à ${t}. Cette page se relit toute seule tant que le démarrage avance.`,
    states: { done: "fait", now: "en cours", todo: "à faire", declined: "écarté", na: "sans objet", waiting: "ensuite", later: "plus tard", never: "jamais", running: "en lecture" },
    part: (n) => `Partie ${n}`,
    parts: {
      preflight: ["Avant tout", "As-tu déjà un brain, sur cet ordinateur, sur un autre, sur ton GitHub ?"],
      computer: ["La machine", "Ton ordinateur a ce qu’il faut à un brain"],
      container: ["Le brain", "Où il vit, ses domaines, ses types, puis la vue en direct, qui reste ouverte à côté pour la suite"],
      tools: ["Les outils", "Ce qui le nourrit, avant que le savoir entre : pour savoir d’où il vient"],
      knowledge: ["Le savoir", "Ce que tu as déjà écrit et fait entre, un bloc à la fois, chacun compté d’abord et son coût dit avant toute lecture"],
      executive: ["L’exécutif", "Tes skills et les garde-fous qui les encadrent, rangés dans ton brain"],
      life: ["La vie du brain", "Ce qui le fait vivre sans toi"],
    },
    steps: {
      computer: ["Ton ordinateur", "Il a ce qu’il faut à un brain"],
      brain: ["Le brain lui-même", "Ce à quoi il sert, où il vit, ses domaines et ses types"],
      view: ["La vue en direct", "Regarder le brain se remplir, dans sa propre fenêtre"],
      sources: ["Ce qui le nourrit", "Courrier et agenda, dossiers, ton travail avec Claude"],
      live: ["La lecture le jour même", "Un Claude en fond lit tes conversations et tes documents"],
      token: ["L’accès de ce Claude", "Ce qui lui permet de travailler sans toi"],
      cap: ["Le plafond du jour", "La part de ton forfait Claude que la lecture peut utiliser"],
      executive: ["Tes skills et tes garde-fous", "Rangés des dossiers de Claude Code dans ton brain"],
      alert: ["L’alerte", "Être prévenu le jour même quand quelque chose cloche"],
      routines: ["Les routines", "La sauvegarde du soir, la revue de la semaine"],
    },
    blocks: {
      writings: "Tes écrits",
      memory: "Ce que Claude retient de toi",
      conversations: "Tes conversations avec Claude",
      documents: "Les documents de tes dossiers",
      contacts: "Les personnes de ton courrier",
    },
    units: { files: ["fichier", "fichiers"], conversations: ["conversation", "conversations"], documents: ["document", "documents"], months: ["mois", "mois"] },
    notCounted: "pas encore compté",
    figures: (p, u) => `${p.done} sur ${fr(p.total, u[0], u[1])} ${p.done < 2 ? "entré" : "entrés"}, ${p.left} ${p.left < 2 ? "restant" : "restants"}${p.notes === null ? "" : `, ${fr(p.notes, "fiche ajoutée", "fiches ajoutées")}`}`,
  },
};

const CSS = `
:root { --bg: #0b0c18; --panel: #131429; --border: rgba(154, 160, 208, 0.25); --text: #e8e9f5; --muted: #9aa0c0; --done: #7ee36b; --now: #ffe500; --off: #5b5f85; color-scheme: dark; }
@media (prefers-color-scheme: light) { :root { --bg: #f6f6fb; --panel: #ffffff; --border: rgba(40, 44, 90, 0.18); --text: #15162b; --muted: #5a5f82; --done: #1f9d3a; --now: #b78a00; --off: #a4a8c4; color-scheme: light; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 720px; margin: 0 auto; padding: 40px 16px 56px; }
h1 { margin: 0 0 6px; font-size: 26px; line-height: 1.2; text-wrap: balance; }
.where { margin: 0 0 22px; color: var(--muted); font-size: 13.5px; overflow-wrap: anywhere; }
.now { margin: 0 0 14px; padding: 14px 16px; border: 1px solid var(--now); border-radius: 12px; background: var(--panel); }
.now .label { display: block; margin-bottom: 2px; color: var(--now); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.resume { margin: 0 0 30px; color: var(--muted); font-size: 13.5px; }
section { margin: 0 0 30px; }
.head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 4px; }
.eyebrow { color: var(--muted); font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
h2 { margin: 0; font-size: 18px; }
.count { margin-left: auto; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.bar { height: 4px; margin: 8px 0 12px; border-radius: 2px; background: var(--border); overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--done); }
.intro { margin: 0 0 12px; color: var(--muted); font-size: 13.5px; }
ol { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); }
li { display: grid; grid-template-columns: 22px 1fr auto; gap: 4px 12px; align-items: start; padding: 12px 16px; border-top: 1px solid var(--border); }
li:first-child { border-top: 0; }
.mark { width: 12px; height: 12px; margin-top: 5px; border-radius: 50%; border: 2px solid var(--off); }
.done .mark { border-color: var(--done); background: var(--done); }
.now-row .mark { border-color: var(--now); box-shadow: 0 0 0 4px color-mix(in srgb, var(--now) 22%, transparent); }
.running .mark { border-color: var(--now); }
.name { font-weight: 600; }
.what { display: block; color: var(--muted); font-size: 13.5px; font-weight: 400; }
.state { color: var(--muted); font-size: 12.5px; white-space: nowrap; padding-top: 2px; }
.done .state { color: var(--done); }
.now-row .state, .running .state { color: var(--now); }
.na, .declined, .never { opacity: 0.55; }
.total { display: flex; align-items: center; gap: 12px; margin: 0 0 26px; color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.total .bar { flex: 1; margin: 0; }
li .bar { margin: 8px 0 0; }
.part-waiting, .part-na { opacity: 0.6; }
.part-now h2 { color: var(--now); }
.part-done .count { color: var(--done); }
footer { color: var(--muted); font-size: 12.5px; }
`;

/**
 * The page, from the state of the start (start.mjs startState).
 * @param {any} state
 * @param {{ lang?: string, doing?: { text?: string, at?: string } | null, paused?: { note?: string, at?: string } | null, now?: Date }} [o]
 * @returns {string} a whole HTML document
 */
export function startPage(state, { lang = "en", doing = null, paused = null, now = new Date() } = {}) {
  const T = TEXT[lang === "fr" ? "fr" : "en"];
  const steps = state.steps ?? [];
  const blocks = state.session?.blocks ?? [];
  const parts = state.parts ?? [];
  const finished = state.phase === "done";
  // (A part whose every piece is settled is done; one that does not apply at all is too.)
  const partsDone = parts.filter((p) => p.state === "done" || p.state === "na").length;
  const stateOf = (id, s) => (id === state.next && !finished && (s === "todo" || s === "later") ? "now" : s);
  const row = (s, name, what, extra = "") => `<li class="${esc(s === "now" ? "now-row" : s)}"><span class="mark"></span><span class="name">${esc(name)}${what ? `<span class="what">${esc(what)}</span>` : ""}${extra}</span><span class="state">${esc(T.states[s] ?? s)}</span></li>`;
  // A block of the knowledge: its total counted first, then what is in, what is left, the notes it added.
  const detail = (b) => {
    const p = b.progress;
    if (!p || b.state === "waiting" || b.state === "na") return "";
    if (p.total === null) return T.notCounted;
    return T.figures(p, T.units[p.unit] ?? [p.unit, p.unit]);
  };
  const bar = (done, all) => `<div class="bar"><i style="width:${all ? Math.round((Math.min(done, all) / all) * 100) : 0}%"></i></div>`;
  const section = (p, n) => {
    const s = p.id === state.part && !finished && p.state !== "done" ? "now" : p.state;
    const rows = p.blocks
      ? blocks.map((b) => row(stateOf(b.id, b.state), T.blocks[b.id] ?? b.id, detail(b), b.progress?.total ? bar(b.progress.done, b.progress.total) : "")).join("\n")
      : (p.steps ?? []).map((id) => steps.find((x) => x.id === id)).filter(Boolean).map((x) => row(stateOf(x.id, x.state), T.steps[x.id]?.[0] ?? x.id, T.steps[x.id]?.[1] ?? "")).join("\n");
    const [name, what] = T.parts[p.id] ?? [p.id, ""];
    return `<section class="${esc(s === "now" ? "part-now" : `part-${s}`)}">
<div class="head"><span class="eyebrow">${esc(T.part(n))}</span><h2>${esc(name)}</h2><span class="count">${esc(T.states[s] ?? s)}</span></div>
<p class="intro">${esc(what)}</p>
${rows ? `<ol>\n${rows}\n</ol>` : ""}
</section>`;
  };
  const day = (iso) => {
    const d = new Date(iso ?? "");
    return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long" });
  };
  const banner = finished
    ? `<p class="now"><span class="label">${esc(T.states.done)}</span>${esc(T.finished)}</p>`
    : paused
      ? `<p class="now"><span class="label">${esc(T.paused(day(paused.at)))}</span>${esc(paused.note ?? "")}</p>`
      : doing?.text
        ? `<p class="now"><span class="label">${esc(T.doing)}</span>${esc(doing.text)}</p>`
        : "";
  const time = now.toLocaleTimeString(lang === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
  return `<!doctype html>
<html lang="${lang === "fr" ? "fr" : "en"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${finished ? "" : '<meta http-equiv="refresh" content="5">'}
<title>${esc(T.title)}</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>${esc(T.title)}</h1>
<p class="where">${esc(state.brain ? T.lives(state.brain) : T.noBrain)}</p>
${banner}
${finished ? "" : `<p class="resume">${esc(T.resume)}</p>`}
<div class="total"><span>${esc(T.count(partsDone, parts.length))}</span>${bar(partsDone, parts.length)}</div>
${parts.map((p, n) => section(p, n)).join("\n")}
<footer>${esc(T.updated(time))}</footer>
</main>
</body>
</html>
`;
}
