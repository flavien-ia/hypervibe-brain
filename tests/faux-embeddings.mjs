// faux-embeddings.mjs - A fake OpenAI-compatible embeddings API for the bench.
// Its own process: the bench calls the brain's scripts synchronously, which
// would freeze a server living in the bench's own event loop.
//
// The vector of a text is a stable function of its words, so texts sharing
// words are close. GET /count says how many calls it has answered.

import { createServer } from "node:http";

let calls = 0;
const server = createServer((req, res) => {
  if (req.method === "GET") {
    res.end(String(calls));
    return;
  }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    calls++;
    const { input, dimensions } = JSON.parse(body);
    const data = input.map((t, index) => {
      const v = new Array(dimensions).fill(0);
      for (const w of t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z]+/g) ?? []) {
        let h = 0;
        for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) % dimensions;
        v[h] += 1;
      }
      return { index, embedding: v };
    });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ data }));
  });
});
server.listen(0, "127.0.0.1", () => console.log(server.address().port));
