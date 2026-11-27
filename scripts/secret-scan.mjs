// secret-scan.mjs - Does a text carry a secret? Asked before a text leaves
// this computer (2026-11-27): a skill is the person's know-how, and know-how
// written in a hurry sometimes holds a key, a password or a server's address
// with its account. What is found is said by its LINE and its KIND, never by
// its value: the answer is read by an AI and written in a journal.
//
// Pure: no import, no access to anything. It reads a text and answers.
//
// WHAT IT LOOKS FOR
//   - keys and tokens by their known shape: sk-..., ghp_..., github_pat_...,
//     xox.-..., AKIA..., a JWT, a PEM private key, and a few others
//   - a password written in clear: `password: ...`, `mot de passe : ...`, `pwd=...`
//   - a value given to a key, a token or a secret (`api_key = ...`, `Bearer ...`)
//   - a URL that carries its credentials (`https://user:pass@...`), a token in
//     its address (`https://<token>@host/repo.git`) or in its parameters
//     (`?token=...`, `&key=...`)
//   - a server's IP address with its SSH account (`root@203.0.113.7`)
//
// WHAT IT LEAVES ALONE: a placeholder (`<key>`, `$TOKEN`, `${KEY}`, `xxxx`,
// `...`), and a sentence that only talks about a password ("password: the
// person types it"). It errs on the side of finding: a text wrongly held back
// is reworded in a minute, a key sent cannot be taken back.

/** @typedef {{ line: number, kind: string }} Finding */

/** A value that stands for one, and is none. @param {string} v */
function placeholder(v) {
  const s = String(v ?? "").replace(/^["'`]+|["'`,;.)\]]+$/g, "");
  return (
    !s ||
    /^[<{[(%$]/.test(s) ||
    /^(x+|X+|\*+|\.+|…+|_+|-+|#+)$/.test(s) ||
    /x{4,}|X{4,}|\*{3,}|\.{3}|…/.test(s) ||
    /^(your|my|the|votre|ton|mon|some)[-_]/i.test(s) ||
    /^(password|pass|passwd|pwd|secret|token|key|apikey|api[-_]key|value|valeur|changeme|example|exemple|placeholder|redacted|hidden|none|null|true|false|undefined|motdepasse|mdp)$/i.test(s)
  );
}
const mixed = (s) => /\p{L}/u.test(s) && /\d/.test(s);

// Each rule: a kind in plain words, a pattern, and what makes a match count.
// `value` is the group that holds the secret itself, when the pattern has one.
/** @type {{ kind: string, re: RegExp, value?: number, keep?: (m: RegExpExecArray) => boolean }[]} */
const RULES = [
  { kind: "a private key", re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/g },
  { kind: "an API key (sk-...)", re: /\bsk-(?:ant-|proj-|svcacct-|admin-|or-v1-)?[A-Za-z0-9_-]{20,}/g, value: 0 },
  { kind: "a GitHub token", re: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g, value: 0 },
  { kind: "a Slack token", re: /\bxox[abeoprs]-[A-Za-z0-9-]{10,}/g, value: 0 },
  { kind: "an AWS key", re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
  { kind: "a JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { kind: "a Google API key", re: /\bAIza[0-9A-Za-z_-]{35}/g },
  { kind: "a GitLab token", re: /\bglpat-[A-Za-z0-9_-]{20,}/g, value: 0 },
  { kind: "a payment key", re: /\b(?:[sr]k_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{24,})/g },
  { kind: "a key of a brain's cloud copy", re: /\bhb_[A-Za-z0-9_-]{40,}/g },
  { kind: "a token (npm, Hugging Face)", re: /\b(?:npm_[A-Za-z0-9]{36}|hf_[A-Za-z0-9]{30,})\b/g },
  // A password in clear. Glued to its `=` (PWD=..., as in a settings file)
  // any value counts; elsewhere a sentence or a line of code is told from a
  // value: a value is quoted, or holds a digit or a sign of a password.
  {
    kind: "a password",
    // (A few words may stand between the word and its value: "mot de passe de
    // dev : ...", "password for the admin: ...", found missing on 2026-11-27.)
    re: /(?:^|[^\p{L}])(?:password|passwd|passphrase|mot de passe|mdp|pwd)["'`]?(?:[ \t]+[\p{L}'’-]{1,14}){0,4}?([ \t]*[:=][ \t]*)(\S+)/giu,
    value: 2,
    keep: (m) => {
      // (Markdown's emphasis around a word is not part of it.)
      const raw = m[2].replace(/^[*_]+|[*_]+$/g, "");
      const quoted = /^["'`]/.test(raw);
      // A quote that opens and does not close on the same word: a phrase.
      if (quoted && !/^(["'`])[^"'`]+\1[,;.)]*$/.test(raw)) return false;
      const v = raw.replace(/^["'`]+|["'`,;.)]+$/g, "");
      if (v.length < 4) return false;
      if (m[1] === "=" || quoted) return true;
      return /\d/.test(v) || /[!@#%^&*~]/.test(v);
    },
  },
  {
    kind: "the value of a key or a token",
    re: /(?:^|[^\p{L}])(?:api[_-]?key|apikey|secret|client[_-]?secret|(?:access|auth|refresh|api)?[_-]?token)["'`]?[ \t]*[:=][ \t]*["'`]?([A-Za-z0-9_\-./+=]{20,})/giu,
    value: 1,
    keep: (m) => mixed(m[1]),
  },
  { kind: "the value of a key or a token", re: /\bBearer[ \t]+([A-Za-z0-9_\-.=]{20,})/g, value: 1, keep: (m) => mixed(m[1]) },
  { kind: "a URL carrying credentials", re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]+)@[^\s/]+/gi, value: 1 },
  { kind: "a URL carrying a token", re: /\b[a-z][a-z0-9+.-]*:\/\/([A-Za-z0-9_-]{16,})@[^\s/]+/gi, value: 1, keep: (m) => mixed(m[1]) },
  {
    kind: "a URL carrying a token",
    re: /[?&](?:token|access_token|auth_token|auth|key|api_key|apikey|secret|signature|sig|password|pwd)=([^&\s"'`<>)]+)/gi,
    value: 1,
    keep: (m) => m[1].length >= 8,
  },
  // An email address whose name ends with a random part is a key: whoever
  // knows it can drop things into the inbox it opens (the deposit address of
  // an accounting tool, a capture address). Found missing on 2026-11-27.
  {
    kind: "an email address that works as a key",
    re: /(?:^|[^\w.+-])[a-z0-9][a-z0-9._-]*[-+]([a-z0-9]{8,})@[a-z0-9.-]+\.[a-z]{2,}/gi,
    value: 1,
    keep: (m) => mixed(m[1]),
  },
  {
    kind: "a server's address with its SSH account",
    re: /(?:^|[^\w.-])[a-z_][a-z0-9_.-]{0,31}@((?:\d{1,3}\.){3}\d{1,3})(?![\d.])/gi,
    keep: (m) => !/^(127\.|0\.0\.0\.0$)/.test(m[1]),
  },
];

/**
 * The secrets a text seems to carry: each by its line (from 1) and its kind,
 * never by its value. An empty list: nothing was found.
 * @param {string} text
 * @returns {Finding[]}
 */
export function scanSecrets(text) {
  /** @type {Finding[]} */
  const found = [];
  const seen = new Set();
  const lines = String(text ?? "").split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      for (let m = rule.re.exec(line); m; m = rule.re.exec(line)) {
        if (m[0] === "") rule.re.lastIndex++;
        if (rule.value !== undefined && placeholder(m[rule.value])) continue;
        if (rule.keep && !rule.keep(m)) continue;
        const k = `${i + 1}|${rule.kind}`;
        if (seen.has(k)) continue;
        seen.add(k);
        found.push({ line: i + 1, kind: rule.kind });
      }
    }
  });
  return found;
}

/**
 * The same, in one sentence for a person: "line 12: a password; line 30: a
 * GitHub token". @param {Finding[]} findings
 */
export const sayFindings = (findings) => findings.map((f) => `line ${f.line}: ${f.kind}`).join("; ");
