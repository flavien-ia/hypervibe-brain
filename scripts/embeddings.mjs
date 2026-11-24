// embeddings.mjs - Turns text into vectors, for "search by meaning".
//
// Optional: without a key, everything works except that one search. Any
// OpenAI-compatible endpoint will do (EMBEDDINGS_BASE_URL), the default being
// OpenAI itself. The key lives in the brain's own .env, never in a note.
//
// Cost, for scale: a few thousand notes cost a few cents once; afterwards
// only the notes whose text changed are sent again.

import { hypervibeVault } from "./lib.mjs";

const BATCH = 64;

// The key: from the brain's .env, or else from the Hypervibe vault (item
// OPENAI, field api_key), read once per process and kept in memory: a server
// that stays up (the MCP) asks the vault once, not at every search. A locked
// vault: no key, the search goes on by words, the vectors wait for the evening.
// A vault that gave no key (none there, or locked) is not asked again at once
// (2026-11-21): each question walked the plugins' folder and started the
// vault's program once more, several times per build. Asked again after ten
// minutes, for a server that stays up while the person unlocks their vault.
let fromVault;
let vaultAskedAt = 0;
const VAULT_RETRY_MS = 10 * 60_000;
const key = () => {
  const env = process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY;
  if (env) return env;
  if (fromVault) return fromVault;
  if (vaultAskedAt && Date.now() - vaultAskedAt < VAULT_RETRY_MS) return "";
  vaultAskedAt = Date.now();
  fromVault = hypervibeVault("OPENAI", "api_key") || undefined;
  return fromVault ?? "";
};
export const embeddingsAvailable = () => Boolean(key());

/**
 * `timeout`: how long one call to the API may take. Ninety seconds for a
 * batch of notes; the vector of a question asks for far less (engine.mjs).
 * `onBatch(start, vectors)` is called as each batch comes back, so that a
 * caller can keep what is already paid for when a later batch fails.
 * @param {string[]} texts
 * @param {object} cfg
 * @param {{ timeout?: number, onBatch?: (start: number, vectors: number[][]) => void }} [o]
 */
export async function embed(texts, cfg, { timeout = 90_000, onBatch } = {}) {
  const base = (process.env.EMBEDDINGS_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const out = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    // The API caps an input around 8,000 tokens: a very long note is cut, its
    // beginning carries its meaning.
    const input = texts.slice(i, i + BATCH).map((t) => t.slice(0, 24000));
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key()}` },
      body: JSON.stringify({ model: cfg.embeddings.model, input, dimensions: cfg.embeddings.dims }),
      // A whole number of milliseconds: AbortSignal.timeout refuses 1280.3
      // (what is left of the hook's budget), and the hook then suggested
      // nothing, without a call (2026-11-21).
      signal: AbortSignal.timeout(Math.max(1, Math.round(Number(timeout) || 90_000))),
    });
    if (!res.ok) throw new Error(`embeddings API answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const data = [...json.data].sort((a, b) => a.index - b.index);
    const batch = data.map((d) => d.embedding);
    out.push(...batch);
    if (onBatch) onBatch(i, batch);
  }
  return out;
}
