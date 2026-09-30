// embeddings.mjs - Turns text into vectors, for "search by meaning".
//
// Optional: without a key, everything works except that one search. Any
// OpenAI-compatible endpoint will do (EMBEDDINGS_BASE_URL), the default being
// OpenAI itself. The key lives in the brain's own .env, never in a note.
//
// Cost, for scale: a few thousand notes cost a few cents once; afterwards
// only the notes whose text changed are sent again.

const BATCH = 64;

const key = () => process.env.EMBEDDINGS_API_KEY || process.env.OPENAI_API_KEY || "";
export const embeddingsAvailable = () => Boolean(key());

export async function embed(texts, cfg) {
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
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) throw new Error(`embeddings API answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    const data = [...json.data].sort((a, b) => a.index - b.index);
    for (const d of data) out.push(d.embedding);
  }
  return out;
}
