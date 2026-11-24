// judge-errors.mjs - Why a judge failed, as a class a person can be told
// (2026-11-17). A judge's error is whatever Claude or the system said: "exit
// 1: OAuth token has expired", "spawn claude ENOENT"... The alert mail, the
// status and the repair skill all need the same reading of it, so it is made
// once, here. No import: pure functions.
//
// The classes, from the most certain sign to the least:
//   no-token      no lasting token is found on this computer (judge.mjs's own sentence)
//   instructions  its instructions.md cannot be read (judge.mjs's own sentence)
//   no-claude     the `claude` program itself was not found
//   token         the token is refused: expired (it lasts a year) or revoked
//   limit         the limit of the Claude plan was reached
//   network       Claude could not be reached
//   other         anything else: the raw error is shown as it is
//
// The texts matched are the ones Claude Code documents for its errors, plus
// the ones seen in real use. A text nobody has seen yet falls in "other",
// which is said as such: a wrong class would send the person the wrong way.

const SIGNS = [
  ["no-token", /no lasting token/i],
  ["instructions", /instructions\.md/i],
  ["no-claude", /\bENOENT\b|is not recognized as|command not found|claude: not found/i],
  ["token", /OAuth token (?:has )?(?:revoked|expired)|token (?:has )?(?:expired|revoked)|login expired|Failed to authenticate|Invalid authentication credentials|Invalid (?:API key|bearer token)|authentication_error|Please run \/login|\b401\b/i],
  ["limit", /hit your (?:session|weekly|usage) limit|usage limit|limit reached|Request rejected \(429\)|\b429\b|rate[ _-]?limit|Credit balance is too low|temporarily limiting requests/i],
  ["network", /Unable to connect|Connection refused|Connection error|Request timed out|Socket is closed|No response from API|\bENOTFOUND\b|\bECONNREFUSED\b|\bECONNRESET\b|\bEAI_AGAIN\b|\bENETUNREACH\b|fetch failed|getaddrinfo/i],
];

export const JUDGE_ERROR_CLASSES = [...SIGNS.map(([c]) => c), "other"];

/**
 * How long a judge rests after a failure before it tries again. An hour: a
 * token refused or a limit reached does not mend in a minute, and each try
 * costs a start of Claude. Ten minutes when Claude could not be reached: a
 * network that drops for a minute (seen 2026-11-18, three judges failed in the
 * same minute on a certificate refused) should not cost an hour of reading.
 * @param {string | null | undefined} error the judge's last error
 * @returns {number} milliseconds
 */
export const restAfter = (error) => (judgeErrorClass(error) === "network" ? 10 : 60) * 60_000;

/** The class of a judge's error ("other" when nothing is recognised, or there is no text). */
export function judgeErrorClass(error) {
  const text = String(error ?? "");
  for (const [cause, sign] of SIGNS) if (sign.test(text)) return cause;
  return "other";
}
