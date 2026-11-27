// tests/zones/mcp-skills.mjs - the skills of the executive floor served by
// the MCP server to an AI that is not Claude Code (scripts/skills-mcp.mjs),
// on a throwaway brain: prompts and brain_skill for another client, nothing
// more for Claude Code, Claude Code's words translated, the guards given as
// rules.
//
//   node tests/zones/mcp-skills.mjs

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = join(tmpdir(), `hvb-mcp-skills-${process.pid}`);
const HOME = join(BASE, "home");
const BRAIN = join(BASE, "brain");
rmSync(BASE, { recursive: true, force: true });

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 700)}` : ""}`);
  }
};
const fwd = (p) => p.replaceAll("\\", "/");
const env = { ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: BRAIN, HVBRAIN_RULES_BLOCK: "off" };

/** A conversation with the server, as a client named `name`. */
async function session(name) {
  const child = spawn(process.execPath, [join(PLUGIN, "scripts", "mcp.mjs")], { cwd: BASE, env, windowsHide: true });
  const lines = [];
  let buffer = "";
  child.stdout.on("data", (d) => {
    buffer += d;
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      lines.push(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
  });
  child.stderr.resume();
  let n = 0;
  const ask = async (method, params) => {
    const id = ++n;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    for (let t = 0; t < 300; t++) {
      const hit = lines.map((l) => JSON.parse(l)).find((m) => m.id === id);
      if (hit) return hit;
      await new Promise((res) => setTimeout(res, 50));
    }
    return null;
  };
  const init = await ask("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name, version: "1" } });
  return { ask, init, close: () => child.kill() };
}

try {
  mkdirSync(join(HOME, ".hypervibe-brain"), { recursive: true });
  writeFileSync(join(HOME, ".hypervibe-brain", "config.json"), JSON.stringify({ brain: fwd(BRAIN) }), "utf8");
  mkdirSync(join(BRAIN, "vault"), { recursive: true });
  writeFileSync(join(BRAIN, "brain.json"), JSON.stringify({ name: "Camille", lang: "fr", format: "en" }), "utf8");
  const skill = join(BRAIN, "executive", "skills", "devis");
  mkdirSync(join(skill, "scripts"), { recursive: true });
  writeFileSync(
    join(skill, "SKILL.md"),
    "---\nname: devis\ndescription: >\n  Fait un devis depuis un mail,\n  sans rien envoyer.\n---\n\n# Devis\n\nLance `node ${CLAUDE_SKILL_DIR}/scripts/devis.mjs` avec Bash, demande le tarif avec AskUserQuestion, puis /mail. Demande : $ARGUMENTS\n",
    "utf8",
  );
  writeFileSync(join(skill, "scripts", "devis.mjs"), "console.log('devis');\n", "utf8");
  mkdirSync(join(BRAIN, "executive", "skills", "_partage"), { recursive: true });
  writeFileSync(join(BRAIN, "executive", "skills", "_partage", "modele.md"), "un modèle\n", "utf8");
  mkdirSync(join(BRAIN, "executive", "guards"), { recursive: true });
  writeFileSync(join(BRAIN, "executive", "guards", "achat-guard.mjs"), "// achat-guard.mjs - Refuse tout achat chez l'hébergeur : un achat se fait à la main, dans son espace client, par la personne.\n//\n// Détails qui ne sont pas la règle.\nprocess.exit(0);\n", "utf8");
  writeFileSync(join(BRAIN, "executive", "guards", "messages-guard.mjs"), "// La messagerie, pour Claude.\n//\n// Lecture seule : aucun envoi sans la personne.\n//\n// Encore autre chose.\n", "utf8");
  writeFileSync(join(BRAIN, "executive", "guards", "son.mjs"), "// Un son à la fin de la session.\n", "utf8");
  writeFileSync(
    join(BRAIN, "executive", "guards.json"),
    JSON.stringify({ "achat-guard.mjs": { hooks: [{ event: "PreToolUse", matcher: "Bash" }] }, "messages-guard.mjs": { hooks: [{ event: "PreToolUse", matcher: "Bash" }] }, "son.mjs": { hooks: [{ event: "Stop", matcher: "" }] } }),
    "utf8",
  );

  console.log("\nAnother AI");
  const other = await session("codex-mcp-client");
  check("it is offered prompts", Boolean(other.init?.result?.capabilities?.prompts), JSON.stringify(other.init));
  check("its instructions name the skills", other.init?.result?.instructions?.includes("devis") && other.init.result.instructions.includes("brain_skill"), other.init?.result?.instructions);
  const tools = await other.ask("tools/list", {});
  check("it has brain_skill beside the seven tools", tools?.result?.tools?.length === 8 && tools.result.tools.some((t) => t.name === "brain_skill"), JSON.stringify(tools?.result?.tools?.map((t) => t.name)));
  const prompts = await other.ask("prompts/list", {});
  const p = prompts?.result?.prompts ?? [];
  check("one prompt per skill, none for a shared folder", p.length === 1 && p[0].name === "devis", JSON.stringify(p));
  check("a folded description is read whole", p[0]?.description === "Fait un devis depuis un mail, sans rien envoyer.", p[0]?.description);
  const got = await other.ask("prompts/get", { name: "devis", arguments: { request: "le devis de l'ACME" } });
  const text = got?.result?.messages?.[0]?.content?.text ?? "";
  check("the skill's folder is its real path", text.includes(`${fwd(skill)}/scripts/devis.mjs`) && !text.includes("${CLAUDE_SKILL_DIR}"), text);
  check("what the person asked takes the place of $ARGUMENTS", text.includes("Demande : le devis de l'ACME") && !text.includes("$ARGUMENTS"), text);
  check("Claude Code's tools are translated", text.includes("AskUserQuestion: ask the person in the chat") && text.includes("Bash / PowerShell"), text);
  check("its files are listed", text.includes("scripts/"), text);
  check("the guards come as rules, the first paragraph only", text.includes("Refuse tout achat chez l'hébergeur") && !text.includes("Détails qui ne sont pas la règle") && !text.includes("achat-guard.mjs -"), text);
  check("a first paragraph that only names the guard takes the next one", text.includes("La messagerie, pour Claude. Lecture seule : aucun envoi sans la personne.") && !text.includes("Encore autre chose"), text);
  check("a hook that guards no step is not a rule", !text.includes("Un son à la fin"), text);
  check("the skill's head is not repeated in its text", !text.includes("description: >"), text);
  const list = await other.ask("tools/call", { name: "brain_skill", arguments: {} });
  check("brain_skill without a name lists the skills", JSON.parse(list?.result?.content?.[0]?.text ?? "{}").skills?.[0]?.name === "devis", JSON.stringify(list));
  const one = await other.ask("tools/call", { name: "brain_skill", arguments: { name: "/devis" } });
  check("brain_skill with a name gives the skill, the / understood", one?.result?.content?.[0]?.text?.includes("# The skill devis, from the brain"), JSON.stringify(one));
  const none = await other.ask("tools/call", { name: "brain_skill", arguments: { name: "inconnue" } });
  check("an unknown skill is refused with the list", none?.result?.isError === true && none.result.content[0].text.includes("devis"), JSON.stringify(none));
  const missing = await other.ask("prompts/get", { name: "inconnue" });
  check("an unknown prompt is an error of the protocol", missing?.error?.code === -32602, JSON.stringify(missing));
  other.close();

  console.log("\nClaude Code");
  const native = await session("claude-code");
  check("no prompts offered", !native.init?.result?.capabilities?.prompts, JSON.stringify(native.init?.result?.capabilities));
  check("its instructions do not list the skills", !native.init?.result?.instructions?.includes("brain_skill"), native.init?.result?.instructions);
  const ntools = await native.ask("tools/list", {});
  check("no brain_skill: it finds the skills by itself", ntools?.result?.tools?.length === 7, JSON.stringify(ntools?.result?.tools?.map((t) => t.name)));
  const ncall = await native.ask("tools/call", { name: "brain_skill", arguments: {} });
  check("brain_skill is an unknown tool for it", ncall?.result?.isError === true, JSON.stringify(ncall));
  const nprompts = await native.ask("prompts/list", {});
  check("prompts/list is empty for it", Array.isArray(nprompts?.result?.prompts) && nprompts.result.prompts.length === 0, JSON.stringify(nprompts));
  native.close();

  // A SKILL THE PERSON SWITCHED OFF IS SERVED NOWHERE (2026-11-27): the
  // brain keeps the switch (executive.mjs switch), so another AI plugged
  // into the brain leaves the skill out too.
  console.log("\nA skill switched off");
  mkdirSync(join(BRAIN, "executive", "skills", "lettre"), { recursive: true });
  writeFileSync(join(BRAIN, "executive", "skills", "lettre", "SKILL.md"), "---\nname: lettre\ndescription: Écrit une lettre.\n---\n\nÉcris la lettre.\n", "utf8");
  const flip = (to) => JSON.parse(spawnSync(process.execPath, [join(PLUGIN, "scripts", "executive.mjs"), "switch", "skill", "devis", to], { env, encoding: "utf8" }).stdout || "{}");
  const offAnswer = flip("off");
  check("the switch is kept in the brain", offAnswer.ok === true && JSON.parse(readFileSync(join(BRAIN, "executive", "switches.json"), "utf8")).skills.devis === "off", JSON.stringify(offAnswer));
  const quiet = await session("codex-mcp-client");
  const qPrompts = (await quiet.ask("prompts/list", {}))?.result?.prompts ?? [];
  check("no prompt for it, the other skill still offered", qPrompts.length === 1 && qPrompts[0].name === "lettre", JSON.stringify(qPrompts));
  check("the instructions no longer name it", quiet.init?.result?.instructions?.includes("lettre") && !/\bdevis\b/.test(quiet.init.result.instructions.split("brain too")[1] ?? ""), quiet.init?.result?.instructions);
  const qList = JSON.parse((await quiet.ask("tools/call", { name: "brain_skill", arguments: {} }))?.result?.content?.[0]?.text ?? "{}");
  check("brain_skill does not list it", JSON.stringify(qList.skills?.map((s) => s.name)) === '["lettre"]', JSON.stringify(qList));
  const qOne = await quiet.ask("tools/call", { name: "brain_skill", arguments: { name: "devis" } });
  const qGet = await quiet.ask("prompts/get", { name: "devis" });
  check("nor gives it by its name, as a tool or as a prompt", qOne?.result?.isError === true && !qOne.result.content[0].text.includes("devis.mjs") && qGet?.error?.code === -32602, JSON.stringify([qOne, qGet]));
  quiet.close();
  check("switched on again, it is served again", flip("on").ok === true);
  const back = await session("codex-mcp-client");
  const bPrompts = (await back.ask("prompts/list", {}))?.result?.prompts ?? [];
  check("its prompt is back", bPrompts.map((x) => x.name).sort().join() === "devis,lettre", JSON.stringify(bPrompts));
  back.close();
  rmSync(join(BRAIN, "executive", "skills", "lettre"), { recursive: true, force: true });

  console.log("\nA floor without skills");
  rmSync(join(BRAIN, "executive", "skills", "devis"), { recursive: true, force: true });
  const bare = await session("codex-mcp-client");
  const btools = await bare.ask("tools/list", {});
  check("another AI gets the seven tools only, and no prompts", btools?.result?.tools?.length === 7 && !bare.init?.result?.capabilities?.prompts, JSON.stringify(btools?.result?.tools?.map((t) => t.name)));
  bare.close();
} finally {
  await new Promise((res) => setTimeout(res, 300));
  rmSync(BASE, { recursive: true, force: true });
}

console.log(`\n${total - failures}/${total} ${failures ? "FAILED" : "passed"}`);
process.exitCode = failures ? 1 : 0;
