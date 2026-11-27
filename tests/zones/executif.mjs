// tests/zones/executif.mjs - the executive floor (scripts/executive.mjs,
// scripts/hook-executive.mjs), on a throwaway home and brain: a skill and a
// guard adopted, still callable and still wired; the guards locked against
// the AI's writes, the skills not.
//
//   node tests/zones/executif.mjs

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = join(tmpdir(), `hvb-executif-${process.pid}`);
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
const env = { ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: BRAIN };
const run = (...args) => {
  const r = spawnSync(process.execPath, [join(PLUGIN, "scripts", "executive.mjs"), ...args], { env, encoding: "utf8" });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { out = null; }
  return { code: r.status, out, raw: r.stdout + r.stderr };
};
const hook = (tool, input) => {
  const r = spawnSync(process.execPath, [join(PLUGIN, "scripts", "hook-executive.mjs")], { env, input: JSON.stringify({ tool_name: tool, tool_input: input }), encoding: "utf8" });
  return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision : "pass";
};

try {
  // A home with one skill, one guard wired twice, and a brain.
  mkdirSync(join(HOME, ".claude", "skills", "essai", "scripts"), { recursive: true });
  writeFileSync(join(HOME, ".claude", "skills", "essai", "SKILL.md"), "---\nname: essai\ndescription: Une skill d'essai.\n---\n\n# Essai\n", "utf8");
  writeFileSync(join(HOME, ".claude", "skills", "essai", "scripts", "x.mjs"), "console.log('x');\n", "utf8");
  mkdirSync(join(HOME, ".claude", "hooks"), { recursive: true });
  const guard = "// Garde-fou d'essai : demande avant tout envoi.\nconst i = JSON.parse(require('fs').readFileSync(0, 'utf8'));\n";
  writeFileSync(join(HOME, ".claude", "hooks", "envoi-guard.mjs"), guard, "utf8");
  const g = fwd(join(HOME, ".claude", "hooks", "envoi-guard.mjs"));
  writeFileSync(join(HOME, ".claude", "settings.json"), JSON.stringify({ model: "x", hooks: { PreToolUse: [{ matcher: "mcp__.*__send", hooks: [{ type: "command", command: `node ${g}`, timeout: 30 }] }, { matcher: "Bash", hooks: [{ type: "command", command: `node "${g}"` }, { type: "command", command: "node other.mjs" }] }] } }, null, 2), "utf8");
  mkdirSync(join(HOME, ".hypervibe-brain"), { recursive: true });
  writeFileSync(join(HOME, ".hypervibe-brain", "config.json"), JSON.stringify({ brain: fwd(BRAIN) }), "utf8");
  mkdirSync(join(BRAIN, "vault"), { recursive: true });
  writeFileSync(join(BRAIN, "brain.json"), JSON.stringify({ lang: "fr", format: "en" }), "utf8");

  console.log("\nA skill adopted");
  let r = run("adopt-skill", "essai");
  check("it moves into the brain", r.out?.ok === true && existsSync(join(BRAIN, "executive", "skills", "essai", "SKILL.md")) && existsSync(join(BRAIN, "executive", "skills", "essai", "scripts", "x.mjs")), r.raw);
  const at = join(HOME, ".claude", "skills", "essai");
  check("and the platform's place is a link to it, read through as before", lstatSync(at).isSymbolicLink() && fwd(realpathSync(at)).toLowerCase() === fwd(realpathSync(join(BRAIN, "executive", "skills", "essai"))).toLowerCase() && readFileSync(join(at, "SKILL.md"), "utf8").includes("name: essai"));
  check("a copy was kept first", existsSync(join(r.out?.backup ?? "", "SKILL.md")), r.out?.backup);
  check("adopting it again changes nothing", run("adopt-skill", "essai").out?.already === true);
  check("a skill that is not there is refused", run("adopt-skill", "absente").code === 1);
  r = run("state");
  check("the state names it, placed", r.out?.skills?.[0]?.name === "essai" && r.out.skills[0].description === "Une skill d'essai." && r.out.skills[0].placed === "linked", r.raw);

  console.log("\nA guard adopted");
  r = run("adopt-guard", "envoi-guard.mjs");
  const settings = JSON.parse(readFileSync(join(HOME, ".claude", "settings.json"), "utf8"));
  const commands = settings.hooks.PreToolUse.flatMap((x) => x.hooks.map((h) => h.command));
  // Through the launcher beside the settings, which checks the guard's fingerprint at each run (2026-11-27).
  const want = `node "${fwd(join(HOME, ".hypervibe-brain", "guard.mjs"))}" "${fwd(join(BRAIN, "executive", "guards", "envoi-guard.mjs"))}"`;
  check("it moves into the brain, the original gone, a copy kept", r.out?.ok === true && existsSync(join(BRAIN, "executive", "guards", "envoi-guard.mjs")) && !existsSync(join(HOME, ".claude", "hooks", "envoi-guard.mjs")) && existsSync(r.out?.backup ?? ""), r.raw);
  check("both its wirings now run it from the brain, at the same places", commands.filter((c) => c === want).length === 2 && commands.includes("node other.mjs") && settings.model === "x", JSON.stringify(commands));
  check("the timeout is kept", settings.hooks.PreToolUse[0].hooks[0].timeout === 30);
  const manifest = JSON.parse(readFileSync(join(BRAIN, "executive", "guards.json"), "utf8"));
  check("its wiring is kept in the brain, with what it does", manifest["envoi-guard.mjs"]?.hooks?.length === 2 && manifest["envoi-guard.mjs"].what.startsWith("Garde-fou d'essai"), JSON.stringify(manifest));
  r = run("state");
  check("the state says it is placed", r.out?.guards?.[0]?.placed === true, r.raw);

  console.log("\nPut back on a new computer");
  rmSync(at, { recursive: true, force: true });
  if (existsSync(at)) rmSync(at);
  writeFileSync(join(HOME, ".claude", "settings.json"), JSON.stringify({ model: "x" }), "utf8");
  r = run("place");
  const again = JSON.parse(readFileSync(join(HOME, ".claude", "settings.json"), "utf8"));
  check("place links the skill again and wires the guard again", r.out?.ok === true && lstatSync(at).isSymbolicLink() && again.hooks?.PreToolUse?.length === 2 && again.model === "x", r.raw);
  check("and a second place changes nothing", (run("place").out?.done ?? [1]).length === 0);
  check("the skill's folder in the brain survived its link being removed", existsSync(join(BRAIN, "executive", "skills", "essai", "SKILL.md")));

  console.log("\nThe guards are locked, the skills are not");
  const gfile = fwd(join(BRAIN, "executive", "guards", "envoi-guard.mjs"));
  check("Edit of a guard: refused", hook("Edit", { file_path: gfile }) === "deny");
  check("Edit of a guard by a Windows path: refused", hook("Edit", { file_path: gfile.replaceAll("/", "\\") }) === "deny");
  check("Write of the wiring: refused", hook("Write", { file_path: fwd(join(BRAIN, "executive", "guards.json")) }) === "deny");
  check("rm, sed -i, a redirection, Remove-Item: refused", ["rm " + gfile, "sed -i s/a/b/ " + gfile, "echo x > " + gfile].every((c) => hook("Bash", { command: c }) === "deny") && hook("PowerShell", { command: `Remove-Item ${gfile.replaceAll("/", "\\")}` }) === "deny");
  check("reading a guard: let through", hook("Bash", { command: `cat ${gfile}` }) === "pass" && hook("Bash", { command: `grep ask ${gfile}` }) === "pass");
  check("Edit of a skill of the floor: let through", hook("Edit", { file_path: fwd(join(BRAIN, "executive", "skills", "essai", "SKILL.md")) }) === "pass");
  check("the floor's own commands: let through", hook("Bash", { command: "node scripts/executive.mjs state" }) === "pass");
  // (2026-11-27: a command that names the guards is let through only when it is one plain reading. Until then a check that wrote its result elsewhere passed, and so did a writer the list of words did not know.)
  check("a program that is handed a guard and writes somewhere: refused, a plain reading piped into another: let through", hook("Bash", { command: `node check.mjs ${gfile} > C:/tmp/out.txt` }) === "deny" && hook("Bash", { command: `cat ${gfile} | head -5` }) === "pass" && hook("Bash", { command: `git -C ${fwd(BRAIN)} log --oneline -- executive/guards` }) === "pass");
  check("a redirection into the guards: refused", hook("Bash", { command: `node make.mjs > ${gfile}` }) === "deny");

  console.log("\nThe two locks in one program (2026-11-24)");
  {
    const locks = (tool, input) => {
      const r = spawnSync(process.execPath, [join(PLUGIN, "scripts", "hook-locks.mjs")], { env, input: JSON.stringify({ tool_name: tool, tool_input: input }), encoding: "utf8" });
      return r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision : "pass";
    };
    const memoryFile = fwd(join(HOME, ".claude", "projects", "C--essai", "memory", "note.md"));
    const config = join(HOME, ".hypervibe-brain", "config.json");
    const kept = readFileSync(config, "utf8");
    check("the memory's lock off: a memory file is let through, a guard still refused", locks("Write", { file_path: memoryFile }) === "pass" && locks("Edit", { file_path: gfile }) === "deny");
    writeFileSync(config, JSON.stringify({ ...JSON.parse(kept), memory: { lock: true } }), "utf8");
    check("both locks on: a memory file and a guard refused, a skill let through, by one program", locks("Write", { file_path: memoryFile }) === "deny" && locks("Bash", { command: `rm ${gfile}` }) === "deny" && locks("Edit", { file_path: fwd(join(BRAIN, "executive", "skills", "essai", "SKILL.md")) }) === "pass" && locks("Bash", { command: "ls" }) === "pass");
    check("each lock still answers alone", hook("Edit", { file_path: gfile }) === "deny" && spawnSync(process.execPath, [join(PLUGIN, "scripts", "hook-memory.mjs")], { env, input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: memoryFile } }), encoding: "utf8" }).stdout.includes("deny"));
    writeFileSync(config, kept, "utf8");
    const declared = JSON.parse(readFileSync(join(PLUGIN, "hooks", "hooks.json"), "utf8")).hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
    check("the plugin declares one program for the locks, not two", declared.some((c) => c.includes("hook-locks.mjs")) && !declared.some((c) => /hook-(memory|executive)\.mjs/.test(c)), JSON.stringify(declared));
  }

  console.log("\nA skill in use is noted for the live view");
  const used = join(HOME, ".hypervibe-brain", "skills-used.jsonl");
  const skillHook = (input) => spawnSync(process.execPath, [join(PLUGIN, "scripts", "hook-skill.mjs")], { env, input: JSON.stringify(input), encoding: "utf8" });
  skillHook({ tool_name: "Skill", tool_input: { skill: "devis" }, session_id: "s1" });
  skillHook({ hook_event_name: "UserPromptSubmit", prompt: "/hypervibe:seo audit du site", session_id: "s1" });
  skillHook({ hook_event_name: "UserPromptSubmit", prompt: "Fais-moi un devis", session_id: "s1" });
  const lines = existsSync(used) ? readFileSync(used, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  check("the Skill tool and a /command typed are noted, a plain message is not", lines.length === 2 && lines[0].skill === "devis" && lines[1].skill === "hypervibe:seo", JSON.stringify(lines));
  check("only the name of the skill, never the text of the message", lines.every((l) => !JSON.stringify(l).includes("audit")));
} finally {
  for (let tries = 0; tries < 5; tries++) {
    try { rmSync(BASE, { recursive: true, force: true }); break; } catch { /* a file still held */ }
  }
}

console.log(`\n${total - failures} ok, ${failures} FAIL (${total} checks)\n`);
process.exit(failures ? 1 : 0);
