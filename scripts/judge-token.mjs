#!/usr/bin/env node
// judge-token.mjs - The lasting token a judge runs with (2026-11-17).
//
// A judge is a `claude -p` that runs with nobody in front of it: the login of
// an interactive session expires, so it needs the one-year token the person
// creates with `claude setup-token`. Until today that token could only come
// from the environment or from the Hypervibe vault (another plugin's): a
// person without that vault had no clean way to give it, and a judge without
// one simply failed.
//
// WHERE THE TOKEN IS LOOKED FOR, in this order:
//   1. the environment (CLAUDE_CODE_OAUTH_TOKEN)
//   2. a file of this plugin's own, on this computer only:
//      ~/.hypervibe-brain/judge-token.json. Never in the brain's folder, never
//      in git. On macOS and Linux it is created with mode 600 (the person
//      alone reads it). On Windows the mode means nothing: the file gets an
//      access list of its own that names the person alone (icacls), and when
//      that cannot be done it stays under their profile folder, which Windows
//      keeps from the other accounts of the computer.
//   3. the Hypervibe vault, when there is one and it is open
//      (item CLAUDE_CODE, field oauth_token)
//
// THE FILE IS THE TOKEN'S PLACE, NOT THE VAULT (2026-11-21, the person's
// decision). The vault closes itself after some hours: with the token in it,
// every judge stopped each night until somebody opened it again. `set` now
// writes the file, the file is read before the vault, and a token found only
// in the vault is still read (nothing breaks for whoever put it there);
// `keep-outside` copies it from the vault into the file, without showing it.
// The keys of the person's own sources are another matter: they stay in the
// vault, and a source waits for it (vault-queue.mjs).
//
// THE TOKEN NEVER PASSES THROUGH A CONVERSATION. The person creates it and
// gives it in THEIR terminal: `window` opens one with `guide` running in it
// (the two steps in a row), or gives the two lines to paste. Nothing here
// ever prints the token: `state` says where one is found, never its value.
//
//   node scripts/judge-token.mjs state            one JSON line: where a token is found
//   node scripts/judge-token.mjs set              the token from stdin, or asked without echo
//   node scripts/judge-token.mjs check [--live]   found, and of the right shape; --live: one real turn
//   node scripts/judge-token.mjs keep-outside     copies the vault's token into the plugin's file (prints { ok, from, to })
//   node scripts/judge-token.mjs forget           removes the plugin's own file
//   node scripts/judge-token.mjs window [--dry]   opens a terminal on `guide` (or says the two lines)
//   node scripts/judge-token.mjs guide            what that terminal runs: setup-token, then set

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HOME, PLUGIN_ROOT, hypervibeVault, hypervibeVaultScripts, userConfig } from "./lib.mjs";
import { brainLang, osLang } from "./i18n.mjs";
import { judgeErrorClass } from "./judge-errors.mjs";

const DIR = join(HOME, ".hypervibe-brain");
export const TOKEN_FILE = join(DIR, "judge-token.json");
const ITEM = ["CLAUDE_CODE", "oauth_token"];
const WINDOWS = process.platform === "win32";

function fileRecord() {
  try {
    const r = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
    return typeof r?.token === "string" && r.token.trim() ? { token: r.token.trim(), at: r.at ?? null } : null;
  } catch {
    return null;
  }
}

/** A token kept outside the vault (the environment, the plugin's file): a judge then needs no vault to be open. */
export const tokenOutsideVault = () => Boolean(String(process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim() || fileRecord());

/**
 * The token a judge runs with, and where it was found: "env", "file", "vault",
 * or null. The value is for the judge's own process alone: never print it.
 * The file before the vault (2026-11-21): a judge whose token is in the file
 * never asks the vault anything, so a vault that closed does not stop it.
 * @returns {{ token: string | null, from: "env" | "vault" | "file" | null }}
 */
export function judgeToken() {
  const env = String(process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim();
  if (env) return { token: env, from: "env" };
  const file = fileRecord();
  if (file) return { token: file.token, from: "file" };
  const vault = hypervibeVault(...ITEM);
  if (vault) return { token: vault, from: "vault" };
  return { token: null, from: null };
}

/**
 * Does it look like what `claude setup-token` gives? Anthropic documents no
 * format: the tokens seen start with "sk-ant-oat", so that is "oauth", and
 * anything else that could be a token is "unusual" (accepted, and said). Only
 * what cannot be one is "bad": nothing, a space inside, a few characters, or an
 * API key (sk-ant-api...), which a judge cannot use in the token's place.
 */
export function tokenShape(token) {
  const s = String(token ?? "");
  if (!s) return { shape: "bad", why: "empty" };
  if (/\s/.test(s)) return { shape: "bad", why: "spaces" };
  if (/^sk-ant-api/i.test(s)) return { shape: "bad", why: "api-key" };
  if (s.length < 40) return { shape: "bad", why: "short" };
  return { shape: /^sk-ant-oat\d+-[A-Za-z0-9_-]+$/.test(s) ? "oauth" : "unusual" };
}

/** The Hypervibe vault of this computer: its script and whether it is open; null without one. */
function vault() {
  const script = hypervibeVaultScripts()[0];
  if (!script) return null;
  const r = spawnSync(process.execPath, [script, "status"], { encoding: "utf8", windowsHide: true, timeout: 60_000 });
  return { script, open: String(r.stdout ?? "").trim() === "unlocked" };
}

/** Where a token is found, without its value. */
export function tokenState() {
  const env = Boolean(String(process.env.CLAUDE_CODE_OAUTH_TOKEN ?? "").trim());
  const v = vault();
  const vaultToken = v?.open ? hypervibeVault(...ITEM) : null;
  const inVault = Boolean(vaultToken);
  const file = fileRecord();
  // The order a judge reads them in (judgeToken): the file before the vault.
  const found = env ? "env" : file ? "file" : inVault ? "vault" : null;
  const used = env ? process.env.CLAUDE_CODE_OAUTH_TOKEN.trim() : file ? file.token : vaultToken;
  return {
    ok: true,
    found,
    places: { env, vault: !v ? "none" : !v.open ? "locked" : inVault ? "has" : "empty", file: Boolean(file) },
    ...(file ? { fileSince: file.at } : {}),
    ...(found ? { shape: tokenShape(used).shape } : {}),
  };
}

/** Writes the plugin's own file, for the person alone where the system allows it. Says how it is kept. */
function writeFile(token) {
  mkdirSync(DIR, { recursive: true });
  // WRITTEN BESIDE, RESTRICTED THERE, THEN RENAMED OVER THE OLD ONE
  // (2026-11-21). The file was removed and written again in place: a judge
  // that started at that instant found no token at all. A new file takes the
  // mode it is created with (one that already existed would keep its own),
  // and the token is never in a file wider than the person's own.
  const tmp = `${TOKEN_FILE}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, `${JSON.stringify({ at: new Date().toISOString(), token })}\n`, { encoding: "utf8", mode: 0o600 });
  let kept = "profile folder";
  if (!WINDOWS) {
    chmodSync(tmp, 0o600);
    kept = "mode 600";
  } else {
    // Windows: an access list that names the person alone (a file renamed
    // within its folder keeps its own list). Granted FIRST, the inherited
    // entries removed only once that worked: the other order could leave a
    // file nobody reads. Then an entry of its own for a group that is
    // everybody (Everyone, Authenticated Users, Users, by their identifiers)
    // is removed too. The system and the administrators may stay on the list
    // (a file made by an administrator's account is born with them): both
    // read any file of the computer whatever its list says (2026-11-27).
    const who = process.env.USERDOMAIN && process.env.USERNAME ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}` : process.env.USERNAME;
    if (who) {
      const icacls = (a) => spawnSync("icacls", [tmp, ...a], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).status === 0;
      if (icacls(["/grant:r", `${who}:(F)`]) && icacls(["/inheritance:r"]) && icacls(["/remove:g", "*S-1-1-0", "*S-1-5-11", "*S-1-5-32-545"])) kept = "access list: this account only";
    }
  }
  // On Windows a rename over a file being read is refused for an instant.
  for (let tries = 0; ; tries++) {
    try {
      renameSync(tmp, TOKEN_FILE);
      break;
    } catch (e) {
      if (tries >= 20 || !["EPERM", "EBUSY", "EACCES"].includes(e.code)) {
        rmSync(tmp, { force: true });
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  return kept;
}

/**
 * Keeps a token: in the plugin's file, always (2026-11-21). It went to the
 * Hypervibe vault when one was open, and the vault closes itself after some
 * hours: every judge then waited for somebody to open it. A token left in the
 * vault is the person's to remove there; the file is read before it.
 * @returns {{ ok: boolean, stored?: "file", shape?: string, why?: string, kept?: string }}
 */
export function setToken(raw) {
  // A terminal that pastes "between brackets" leaves its marks around the text.
  const token = String(raw ?? "").replace(/\x1b?\[20[01]~/g, "").trim();
  const { shape, why } = tokenShape(token);
  if (shape === "bad") return { ok: false, why };
  const kept = writeFile(token);
  return { ok: true, stored: "file", shape, kept };
}

/**
 * Copies the token found in the Hypervibe vault into the plugin's file, so
 * that the judges no longer wait for a vault that closes itself. Never shows
 * it: the answer is { ok, from, to } and nothing else. A token already in the
 * file is left as it is: the file is where `set` writes, so it holds the
 * latest one.
 * @returns {{ ok: true, from: "vault" | "file", to: "file" } | { ok: false, why: string, error: string }}
 */
export function keepOutside() {
  if (fileRecord()) return { ok: true, from: "file", to: "file" };
  const v = vault();
  if (!v) return { ok: false, why: "no-vault", error: "no Hypervibe vault on this computer, and no token in the plugin's file: the person gives one with `node scripts/judge-token.mjs set`, in their own terminal" };
  if (!v.open) return { ok: false, why: "vault-locked", error: "the Hypervibe vault is locked: have it opened once, then run this again" };
  const token = String(hypervibeVault(...ITEM) ?? "").trim();
  if (!token) return { ok: false, why: "not-in-vault", error: `the Hypervibe vault holds no token for the judges (item ${ITEM[0]}, field ${ITEM[1]}): the person gives one with \`node scripts/judge-token.mjs set\`, in their own terminal` };
  const { shape, why } = tokenShape(token);
  if (shape === "bad") return { ok: false, why: `bad-token-${why}`, error: "what the vault holds cannot be a token: nothing was copied" };
  writeFile(token);
  return { ok: true, from: "vault", to: "file" };
}

/** Removes the plugin's own file. A token in the vault or in the environment is the person's to remove there. */
export function forgetToken() {
  const had = existsSync(TOKEN_FILE);
  rmSync(TOKEN_FILE, { force: true });
  const s = tokenState();
  return { ok: true, removed: had, stillFound: s.found, places: s.places };
}

/**
 * ONE REAL TURN, to know that the token works (check --live): the smallest
 * model, one turn, no tool, no settings, a few dozen tokens of the person's
 * plan. Only on their agreement. An API key or another token of the
 * environment is left out of that run: with one, Claude would use it rather
 * than the token, and the check would prove nothing.
 */
function liveCheck(token) {
  const claude = process.env.HVBRAIN_CLAUDE || "claude";
  const viaNode = /\.[cm]?js$/i.test(claude);
  const room = join(DIR, "judge", "room");
  mkdirSync(room, { recursive: true });
  const { ANTHROPIC_API_KEY: _key, ANTHROPIC_AUTH_TOKEN: _auth, ...env } = process.env;
  const r = spawnSync(viaNode ? process.execPath : claude, [
    ...(viaNode ? [claude] : []),
    "-p", "--model", "haiku", "--max-turns", "1", "--output-format", "json",
    "--setting-sources", "", "--disable-slash-commands", "--strict-mcp-config", "--tools", "",
    "--system-prompt", "Answer with the single word: ok",
    // Started as a judge is (no shell between): the check then also says
    // whether the background program finds `claude` at all.
  ], { cwd: room, input: "Are you there?", encoding: "utf8", windowsHide: true, timeout: 3 * 60_000, env: { ...env, CLAUDE_CODE_OAUTH_TOKEN: token } });
  let answer = null;
  try {
    answer = JSON.parse(String(r.stdout ?? "").trim());
  } catch {
    answer = null;
  }
  if (!r.error && r.status === 0 && answer?.is_error !== true) return { works: true };
  // The error, never the command line: nothing of the token can be in it.
  const error = `${r.error ? `${r.error.code ?? r.error.message}: ` : `exit ${r.status}: `}${String(r.stderr || (answer ? answer.result : r.stdout) || "").trim().slice(-300)}`;
  return { works: false, cause: judgeErrorClass(error), error };
}

// ------------------------------------------------------------ the terminal
const lang = () => {
  const brain = userConfig().brain;
  return (brain ? brainLang(brain) : osLang()) === "fr" ? "fr" : "en";
};
const SAY = {
  fr: {
    title: "Le jeton du juge",
    intro: [
      "Le juge est un Claude qui lit votre travail en arrière-plan, sans vous.",
      "Pour cela il lui faut un jeton : un accès durable à votre compte Claude, valable un an.",
      "Ce jeton reste sur cet ordinateur. Ne le collez jamais dans une conversation.",
    ],
    step1: ["Étape 1 sur 2", "Votre navigateur va s'ouvrir : connectez-vous à Claude et acceptez.", "Le jeton s'affichera ensuite ici, dans cette fenêtre. Copiez-le."],
    noClaude: ["Le programme « claude » n'a pas pu être lancé d'ici.", "Dans une autre fenêtre de terminal, tapez : claude setup-token", "Copiez le jeton qu'il affiche, puis revenez ici."],
    step2: ["Étape 2 sur 2", "Collez le jeton ci-dessous (clic droit, ou Ctrl+V), puis appuyez sur Entrée.", "Rien ne s'affiche pendant que vous collez : c'est voulu."],
    ask: "Jeton : ",
    again: "Collez-le à nouveau : ",
    bad: { empty: "Rien n'a été collé.", spaces: "Ce texte contient des espaces : ce n'est pas le jeton seul.", short: "Ce texte est trop court pour être le jeton.", "api-key": "Ceci est une clé d'API, pas le jeton que donne « claude setup-token »." },
    file: (kept) => `C'est fait. Le jeton est rangé dans un fichier de cet ordinateur${kept === "profile folder" ? ", dans votre dossier personnel" : ", que votre compte est seul à pouvoir lire"}.`,
    unusual: "Ce jeton n'a pas la forme habituelle. Il est gardé tel quel : si le juge échoue, recommencez avec « claude setup-token ».",
    gaveUp: "Aucun jeton n'a été enregistré. Vous pouvez relancer cette fenêtre quand vous voulez.",
    back: "Vous pouvez fermer cette fenêtre et retourner dans Claude.",
    close: "Appuyez sur Entrée pour fermer.",
    noTty: "Cette commande attend le jeton sur son entrée, ou se lance dans une fenêtre de terminal.",
  },
  en: {
    title: "The judge's token",
    intro: [
      "The judge is a Claude that reads your work in the background, without you.",
      "For that it needs a token: a lasting access to your Claude account, valid for one year.",
      "This token stays on this computer. Never paste it into a conversation.",
    ],
    step1: ["Step 1 of 2", "Your browser is about to open: sign in to Claude and accept.", "The token will then show here, in this window. Copy it."],
    noClaude: ['The "claude" program could not be started from here.', "In another terminal window, type: claude setup-token", "Copy the token it shows, then come back here."],
    step2: ["Step 2 of 2", "Paste the token below (right click, or Ctrl+V), then press Enter.", "Nothing shows while you paste: that is on purpose."],
    ask: "Token: ",
    again: "Paste it again: ",
    bad: { empty: "Nothing was pasted.", spaces: "This text has spaces in it: it is not the token alone.", short: "This text is too short to be the token.", "api-key": 'This is an API key, not the token that "claude setup-token" gives.' },
    file: (kept) => `Done. The token is kept in a file on this computer${kept === "profile folder" ? ", in your personal folder" : ", which your account alone can read"}.`,
    unusual: 'This token does not have the usual shape. It is kept as it is: if the judge fails, start again with "claude setup-token".',
    gaveUp: "No token was recorded. You can open this window again whenever you want.",
    back: "You can close this window and go back to Claude.",
    close: "Press Enter to close.",
    noTty: "This command takes the token on its input, or runs in a terminal window.",
  },
};

/** Asks for a line WITHOUT echo: nothing of what is typed or pasted reaches the screen. */
function askHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (typeof stdin.setRawMode !== "function") return reject(new Error("no terminal"));
    process.stdout.write(question);
    let buf = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (value) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const ch of chunk) {
        const code = ch.charCodeAt(0);
        if (code === 13 || code === 10) return done(buf);
        if (code === 3) {
          stdin.setRawMode(false);
          process.stdout.write("\n");
          process.exit(130);
        }
        if (code === 8 || code === 127) buf = buf.slice(0, -1);
        else if (code >= 32) buf += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Says, in the person's terminal, how a `set` ended. Never the token. */
function sayStored(r, W) {
  console.log(W.file(r.kept));
  if (r.shape === "unusual") console.log(W.unusual);
}

/** `set` in a terminal: asked without echo, three tries for a text that cannot be a token. */
async function askAndSet(W) {
  for (let i = 0; i < 3; i++) {
    const r = setToken(await askHidden(i ? W.again : W.ask));
    if (r.ok) {
      sayStored(r, W);
      return r;
    }
    console.log(W.bad[r.why] ?? W.bad.empty);
  }
  console.log(W.gaveUp);
  return { ok: false, why: "gave-up" };
}

/** The two lines the person pastes in a terminal when no window could be opened for them. */
const handLines = () => ["claude setup-token", `node "${join(PLUGIN_ROOT, "scripts", "judge-token.mjs")}" set`];

/**
 * Opens a terminal window on `guide`, and comes back at once: the person
 * works in it at their pace, and `state` says afterwards whether a token is
 * there. Says whether a window opened; the two lines to paste by hand are
 * given either way.
 */
function openWindow(dry) {
  const script = join(PLUGIN_ROOT, "scripts", "judge-token.mjs");
  const base = { ok: true, opened: false, byHand: handLines() };
  // The bench, a run without a screen: never a window.
  if (dry || process.env.HVBRAIN_NO_WINDOW) return base;
  try {
    if (WINDOWS) {
      // Each element in double quotes inside its single quotes: Start-Process
      // joins its arguments with spaces and never quotes one itself, so a
      // profile folder with a space in its name would reach node in two pieces.
      const q = (s) => `'"${String(s).replace(/"/g, '\\"').replace(/'/g, "''")}"'`;
      const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `Start-Process -FilePath ${q(process.execPath)} -ArgumentList @(${[script, "guide"].map(q).join(",")})`], { windowsHide: true, timeout: 30_000 });
      return { ...base, opened: r.status === 0 };
    }
    const sh = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
    const line = `${sh(process.execPath)} ${sh(script)} guide`;
    if (process.platform === "darwin") {
      // osascript's answer says whether macOS let us drive Terminal at all.
      const r = spawnSync("osascript", ["-e", `tell application "Terminal"\n  activate\n  do script ${JSON.stringify(line)}\nend tell`], { encoding: "utf8", timeout: 30_000 });
      return { ...base, opened: r.status === 0 };
    }
    for (const [bin, a] of [["x-terminal-emulator", ["-e", "bash", "-lc", line]], ["gnome-terminal", ["--", "bash", "-lc", line]], ["konsole", ["-e", "bash", "-lc", line]], ["xterm", ["-e", "bash", "-lc", line]]]) {
      if (spawnSync("bash", ["-lc", `command -v ${bin}`], { stdio: "ignore", timeout: 15_000 }).status !== 0) continue;
      spawn(bin, a, { stdio: "ignore", detached: true }).unref();
      return { ...base, opened: true };
    }
  } catch {
    // no window: the two lines remain
  }
  return base;
}

/** What the window runs: `claude setup-token` in this very terminal, then the token asked without echo. */
async function guide() {
  const W = SAY[lang()];
  const say = (lines) => console.log(`\n${[].concat(lines).join("\n")}`);
  say([W.title, "", ...W.intro]);
  say(W.step1);
  console.log("");
  // In this terminal, with its keyboard and its screen: the token is printed
  // by Claude's own program, for the person's eyes only.
  const r = spawnSync("claude", ["setup-token"], { stdio: "inherit", shell: WINDOWS });
  if (r.error || r.status !== 0) say(W.noClaude);
  say(W.step2);
  const done = await askAndSet(W);
  say(done.ok ? W.back : "");
  // The window closes with this program: leave the person the time to read.
  await askHidden(W.close).catch(() => {});
}

const isMain = process.argv[1] && process.argv[1].replaceAll("\\", "/").endsWith("/scripts/judge-token.mjs");
if (isMain) {
  const a = process.argv.slice(2);
  const out = (o) => console.log(JSON.stringify(o));
  if (a[0] === "state") out(tokenState());
  else if (a[0] === "set") {
    if (process.stdin.isTTY) {
      const r = await askAndSet(SAY[lang()]);
      if (!r.ok) process.exitCode = 1;
    } else {
      const r = setToken(readFileSync(0, "utf8"));
      out(r.ok ? r : { ...r, error: `not a token (${r.why}): nothing was kept` });
      if (!r.ok) process.exitCode = 1;
    }
  } else if (a[0] === "check") {
    const { token, from } = judgeToken();
    if (!token) {
      out({ ok: false, found: null, error: "no token is found on this computer: the person gives one with `node scripts/judge-token.mjs set`, in their own terminal" });
      process.exitCode = 1;
    } else {
      const { shape, why } = tokenShape(token);
      const live = a.includes("--live") && shape !== "bad" ? liveCheck(token) : null;
      const ok = shape !== "bad" && live?.works !== false;
      out({ ok, found: from, shape, ...(why ? { why } : {}), ...(live ? { live: true, ...live } : {}) });
      if (!ok) process.exitCode = 1;
    }
  } else if (a[0] === "keep-outside") {
    const r = keepOutside();
    out(r);
    if (!r.ok) process.exitCode = 1;
  } else if (a[0] === "forget") out(forgetToken());
  else if (a[0] === "window") out(openWindow(a.includes("--dry")));
  else if (a[0] === "guide") {
    if (process.stdin.isTTY) await guide();
    else {
      console.error(SAY[lang()].noTty);
      process.exitCode = 1;
    }
  } else {
    console.log("usage: judge-token.mjs state | set | check [--live] | keep-outside | forget | window [--dry] | guide (see the top of scripts/judge-token.mjs)");
    process.exitCode = 2;
  }
}
