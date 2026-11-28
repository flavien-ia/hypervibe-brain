// tests/zones/interrupteurs.mjs - the switches of the executive floor
// (scripts/executive.mjs switch, 2026-11-27), on a throwaway home and brain:
// one of the person's skills switched off and on again (its link removed, put
// back, never without its approval), a harness switched off by a program in
// Claude's place and by the settings, the brain's own plugin never, `place`
// keeping the switches on another computer, a guard that no switch reaches,
// and the warning for a skill that seems to hold a secret.
//
//   node tests/zones/interrupteurs.mjs

import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = join(tmpdir(), `hvb-interrupteurs-${process.pid}`);
const HOME = join(BASE, "home");
const BRAIN = join(BASE, "brain");
const PLUGINS = join(BASE, "plugins");
const FAUX = join(PLUGIN, "tests", "faux-claude.mjs");
rmSync(BASE, { recursive: true, force: true });

let failures = 0;
let total = 0;
const check = (name, cond, detail = "") => {
  total++;
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? `\n        ${String(detail).slice(0, 900)}` : ""}`);
  }
};
const fwd = (p) => p.replaceAll("\\", "/");
// Never the person's home, never their brain, never their Claude.
const base = { ...process.env, HVBRAIN_HOME: HOME, HVBRAIN_DIR: BRAIN, HVBRAIN_CLAUDE: "", HVBRAIN_WHO: "", FAUX_CLAUDE_LOG: "", FAUX_CLAUDE_PLUGIN: "" };
if (!HOME.startsWith(tmpdir())) {
  console.error("the zone's checks only run on a throwaway home");
  process.exit(2);
}
const script = (name, args, env = {}) => {
  const r = spawnSync(process.execPath, [join(PLUGIN, "scripts", name), ...args], { env: { ...base, ...env }, encoding: "utf8" });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { out = null; }
  return { code: r.status, out, raw: r.stdout + r.stderr };
};
const run = (args, env = {}) => script("executive.mjs", args, env);
const readJ = (file) => JSON.parse(readFileSync(file, "utf8"));
const SETTINGS = join(HOME, ".claude", "settings.json");
const SWITCHES = join(BRAIN, "executive", "switches.json");
const linkOf = (name) => join(HOME, ".claude", "skills", name);
const isLink = (name) => {
  try { return lstatSync(linkOf(name)).isSymbolicLink(); } catch { return false; }
};
const gone = (name) => {
  try { lstatSync(linkOf(name)); return false; } catch { return true; }
};
const inBrain = (name) => join(BRAIN, "executive", "skills", name);
const skill = (dir, name, body = `# ${name}\n`) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: Une skill d'essai (${name}).\n---\n\n${body}`, "utf8");
};
/** A plugin of the throwaway registry. @param {string} name @param {object | null} hooks */
const plugin = (name, hooks = null) => {
  const root = join(PLUGINS, name);
  skill(join(root, "skills", "faire"), "faire");
  mkdirSync(join(root, ".claude-plugin"), { recursive: true });
  writeFileSync(join(root, ".claude-plugin", "plugin.json"), JSON.stringify({ name, version: "1.2.3" }), "utf8");
  if (hooks) {
    mkdirSync(join(root, "hooks"), { recursive: true });
    mkdirSync(join(root, "scripts"), { recursive: true });
    writeFileSync(join(root, "hooks", "hooks.json"), JSON.stringify({ hooks }), "utf8");
    writeFileSync(join(root, "scripts", "avant.mjs"), "// Demande avant tout envoi d'un message.\nprocess.exit(0);\n", "utf8");
  }
  return fwd(root);
};

try {
  // A home with two skills and a guard, four plugins in its registry (one
  // plain, one that checks before an action, the brain's own, and a plugin of
  // another name whose hooks run the brain's locks), and a brain.
  skill(linkOf("essai"), "essai");
  mkdirSync(join(linkOf("essai"), "scripts"), { recursive: true });
  writeFileSync(join(linkOf("essai"), "scripts", "x.mjs"), "console.log('x');\n", "utf8");
  skill(linkOf("autre"), "autre");
  mkdirSync(join(HOME, ".claude", "hooks"), { recursive: true });
  writeFileSync(join(HOME, ".claude", "hooks", "envoi-guard.mjs"), "// Garde-fou d'essai : demande avant tout envoi.\nprocess.exit(0);\n", "utf8");
  const before = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: `node ${fwd(join(HOME, ".claude", "hooks", "envoi-guard.mjs"))}` }] }] } };
  const pre = (command) => ({ PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command }] }] });
  const registry = {
    version: 2,
    plugins: {
      "outils@place": [{ scope: "user", installPath: plugin("outils"), version: "1.2.3" }],
      "veille@place": [{ scope: "user", installPath: plugin("veille", pre('node "${CLAUDE_PLUGIN_ROOT}/scripts/avant.mjs"')), version: "1.2.3" }],
      "brain@hypervibe-brain": [{ scope: "user", installPath: fwd(PLUGIN), version: "0" }],
      "sosie@ailleurs": [{ scope: "user", installPath: plugin("sosie", pre('node "${CLAUDE_PLUGIN_ROOT}/scripts/hook-locks.mjs"')), version: "1.2.3" }],
    },
  };
  mkdirSync(join(HOME, ".claude", "plugins"), { recursive: true });
  writeFileSync(join(HOME, ".claude", "plugins", "installed_plugins.json"), JSON.stringify(registry, null, 2), "utf8");
  writeFileSync(SETTINGS, JSON.stringify({ model: "x", ...before, enabledPlugins: { "outils@place": true, "veille@place": true, "brain@hypervibe-brain": true, "sosie@ailleurs": true } }, null, 2), "utf8");
  mkdirSync(join(HOME, ".hypervibe-brain"), { recursive: true });
  writeFileSync(join(HOME, ".hypervibe-brain", "config.json"), JSON.stringify({ brain: fwd(BRAIN) }), "utf8");
  mkdirSync(join(BRAIN, "vault"), { recursive: true });
  writeFileSync(join(BRAIN, "brain.json"), JSON.stringify({ lang: "fr", format: "en" }), "utf8");
  let r = run(["adopt-skill", "essai"]);
  check("the skill is in the brain, linked and approved here", r.out?.ok === true && isLink("essai") && !r.out.secrets, r.raw);
  run(["adopt-skill", "autre"]);
  r = run(["adopt-guard", "envoi-guard.mjs"]);
  check("the guard is in the brain and wired", r.out?.ok === true, r.raw);
  const guardWired = () => JSON.stringify(readJ(SETTINGS).hooks ?? {}).includes("envoi-guard.mjs");

  console.log("\nA skill of the person's, switched off");
  r = run(["state"]);
  check("with no switch, the state says every skill and every harness is on", r.out?.skills?.every((s) => s.on === true) && r.out.harnesses.every((h) => h.on === true && h.enabledHere === true) && JSON.stringify(r.out.switches) === '{"skills":[],"harnesses":[]}' && !existsSync(SWITCHES), r.raw);
  r = run(["switch", "skill", "essai", "off"]);
  check("its link in the platform's folder is removed", r.out?.ok === true && r.out.here === "unlinked" && gone("essai"), r.raw);
  check("the skill stays in the brain, untouched", readFileSync(join(inBrain("essai"), "SKILL.md"), "utf8").includes("name: essai") && existsSync(join(inBrain("essai"), "scripts", "x.mjs")));
  check("the switch is written in the brain", readJ(SWITCHES).skills.essai === "off" && JSON.stringify(readJ(SWITCHES).harnesses) === "{}", readFileSync(SWITCHES, "utf8"));
  check("the answer says when it takes effect", /session under way/.test(r.out?.effect ?? ""), r.raw);
  r = run(["state"]);
  const essai = () => r.out?.skills?.find((s) => s.folder === "essai");
  check("the state says it is off, and that it waits for nothing", essai()?.on === false && essai().placed === "missing" && essai().pending === null && !r.out.pending.some((p) => p.name === "essai") && JSON.stringify(r.out.switches.skills) === '["essai"]', r.raw);
  check("the other skill is untouched", r.out?.skills?.find((s) => s.folder === "autre")?.on === true && isLink("autre"));
  r = run(["place"]);
  check("place does not put its link back", r.out?.ok === true && r.out.done.length === 0 && gone("essai") && JSON.stringify(r.out.skillsOff) === '["essai"]', r.raw);
  check("switching it off again changes nothing", run(["switch", "skill", "essai", "off"]).out?.ok === true && gone("essai"));
  {
    // The start of the brain (start.mjs) counts what is not in place: a skill that is off is not that.
    const start = script("start.mjs", ["state"]);
    const step = start.out?.steps?.find((s) => s.id === "executive");
    check("the start does not take a skill that is off for one that is not in place", step?.skills === 2 && !("unplaced" in step) && step.state === "done", JSON.stringify(step ?? start.raw.slice(0, 300)));
  }
  {
    const { listSkills } = await import(pathToFileURL(join(PLUGIN, "scripts", "skills-mcp.mjs")).href);
    check("another AI is no longer served it (the list every server starts from)", listSkills(BRAIN).map((s) => s.folder).join() === "autre", JSON.stringify(listSkills(BRAIN)));
  }

  console.log("\nSwitched on again");
  r = run(["switch", "skill", "essai", "on"]);
  check("its link is put back, since it is approved on this computer", r.out?.ok === true && r.out.here === "linked" && isLink("essai") && readFileSync(join(linkOf("essai"), "SKILL.md"), "utf8").includes("name: essai"), r.raw);
  check("and the brain no longer keeps it off", JSON.stringify(readJ(SWITCHES).skills) === "{}", readFileSync(SWITCHES, "utf8"));
  check("called by its name with a slash, or by its folder", run(["switch", "skill", "/essai", "off"]).out?.ok === true && gone("essai") && run(["switch", "skill", "ESSAI", "on"]).out?.here === "linked" && isLink("essai"));

  console.log("\nNever linked without its approval");
  run(["switch", "skill", "essai", "off"]);
  // It changes while it is off, as a synchronisation would bring it.
  writeFileSync(join(inBrain("essai"), "SKILL.md"), "---\nname: essai\ndescription: Une skill d'essai (essai).\n---\n\n# Essai\n\nUne ligne arrivée d'ailleurs.\n", "utf8");
  r = run(["switch", "skill", "essai", "on"]);
  check("a skill that changed while it was off is not linked: it waits for the person", r.out?.ok === true && r.out.here === "pending" && r.out.pending?.why === "changed since its approval" && /trust\.mjs" window$/.test(r.out.approve ?? "") && gone("essai"), r.raw);
  r = run(["state"]);
  check("the state lists it as waiting, on in the brain", essai()?.on === true && essai().placed === "missing" && r.out.pending.some((p) => p.kind === "skill" && p.name === "essai"), r.raw);
  check("place does not link it either", run(["place"]).out?.pending?.some((p) => p.name === "essai") && gone("essai"));
  r = run(["trust", "skill", "essai"]);
  check("once the person approved it (in the bench's own home), it is linked", r.out?.ok === true && isLink("essai"), r.raw);
  // A skill that arrived with the brain and was never approved here.
  skill(inBrain("arrivee"), "arrivee");
  check("a skill that arrived, switched off then on, still waits for its first approval", run(["switch", "skill", "arrivee", "off"]).out?.ok === true && run(["switch", "skill", "arrivee", "on"]).out?.pending?.why === "never approved on this computer" && gone("arrivee"));
  rmSync(inBrain("arrivee"), { recursive: true, force: true });
  // A skill improved while it was linked is the one the AI was shown: it comes back as it stood.
  writeFileSync(join(inBrain("essai"), "SKILL.md"), "---\nname: essai\ndescription: Une skill d'essai (essai).\n---\n\n# Essai\n\nAméliorée pendant qu'elle était reliée.\n", "utf8");
  run(["switch", "skill", "essai", "off"]);
  r = run(["switch", "skill", "essai", "on"]);
  const kept = Object.entries(readJ(join(HOME, ".hypervibe-brain", "config.json")).trusted ?? {}).find(([k]) => k.endsWith("::skill::essai"))?.[1];
  check("a skill improved while it was linked comes back at once, as it stood when it was switched off", r.out?.here === "linked" && isLink("essai") && kept?.how === "switched-off", JSON.stringify([r.out, kept]));

  console.log("\nWhat has no switch of its own");
  r = run(["switch", "skill", "faire", "off"]);
  check("a skill of a plugin is refused, and its harness is named", r.code === 1 && r.out?.ok === false && r.out.harness === "outils@place" && /follows its harness/.test(r.out.error), r.raw);
  check("called as plugin:skill too", run(["switch", "skill", "veille:faire", "off"]).out?.harness === "veille@place");
  mkdirSync(inBrain("_partage"), { recursive: true });
  writeFileSync(join(inBrain("_partage"), "modele.md"), "un modèle\n", "utf8");
  check("a folder other skills use is refused", /not a skill/.test(run(["switch", "skill", "_partage", "off"]).out?.error ?? ""));
  check("an unknown skill is refused with the list", run(["switch", "skill", "inconnue", "off"]).out?.skills?.includes("essai"));
  check("nothing of all that was written in the switches", JSON.stringify(readJ(SWITCHES)) === '{"skills":{},"harnesses":{}}', readFileSync(SWITCHES, "utf8"));

  console.log("\nA harness switched off by a program in Claude's place");
  const log = join(BASE, "faux-claude.log");
  const withClaude = { HVBRAIN_CLAUDE: FAUX, FAUX_CLAUDE_LOG: log };
  r = run(["switch", "harness", "outils@place", "off"], withClaude);
  const asked = () => readFileSync(log, "utf8").trim().split("\n").map((l) => JSON.parse(l).args);
  check("the platform's own command is run", r.out?.ok === true && r.out.how === "claude plugin disable" && JSON.stringify(asked().at(-1)) === '["plugin","disable","outils@place","--scope","user"]', r.raw);
  check("the plugin is disabled in the platform's settings, the rest of them untouched", readJ(SETTINGS).enabledPlugins["outils@place"] === false && readJ(SETTINGS).enabledPlugins["veille@place"] === true && readJ(SETTINGS).model === "x" && guardWired());
  check("the switch is written in the brain, and the answer says when it takes effect", readJ(SWITCHES).harnesses["outils@place"] === "off" && /next session/.test(r.out.effect) && /reload-plugins/.test(r.out.effect), r.raw);
  r = run(["state"]);
  const harness = (key) => r.out?.harnesses?.find((h) => h.key === key);
  check("the state says it is off, here and in the brain, and the others on", harness("outils@place")?.on === false && harness("outils@place").enabledHere === false && harness("veille@place").on === true && harness("veille@place").protects === 1 && harness("outils@place").protects === 0 && JSON.stringify(r.out.switches.harnesses) === '["outils@place"]', r.raw);
  check("it stays listed, with its skills", harness("outils@place")?.skills?.length === 1 && harness("outils@place").name === "outils");
  const calls = asked().length;
  check("switching it off again runs nothing more", run(["switch", "harness", "outils@place", "off"], withClaude).out?.how === "already" && asked().length === calls);
  r = run(["switch", "harness", "outils", "on"], withClaude);
  check("on again by its name alone: enabled by the command, and on in the brain", r.out?.ok === true && r.out.how === "claude plugin enable" && readJ(SETTINGS).enabledPlugins["outils@place"] === true && JSON.stringify(readJ(SWITCHES).harnesses) === "{}", r.raw);

  console.log("\nA harness switched off by the settings");
  r = run(["switch", "harness", "outils@place", "off"], { ...withClaude, FAUX_CLAUDE_PLUGIN: "absent" });
  check("a Claude without that command: the settings are written instead", r.out?.ok === true && r.out.how === "settings" && readJ(SETTINGS).enabledPlugins["outils@place"] === false && readJ(SETTINGS).model === "x" && guardWired(), r.raw);
  check("a copy of the settings was kept first, as they were", existsSync(r.out?.backup ?? "") && readJ(r.out.backup).enabledPlugins["outils@place"] === true, String(r.out?.backup));
  run(["switch", "harness", "outils@place", "on"], { ...withClaude, FAUX_CLAUDE_PLUGIN: "absent" });
  const callsNow = asked().length;
  r = run(["switch", "harness", "outils@place", "off"]);
  check("on a throwaway home with no program in Claude's place, the real command is never run", r.out?.ok === true && r.out.how === "settings" && asked().length === callsNow && readJ(SETTINGS).enabledPlugins["outils@place"] === false, r.raw);
  check("nor a real program named in its place", run(["switch", "harness", "outils@place", "on"], { HVBRAIN_CLAUDE: "claude" }).out?.how === "settings");

  console.log("\nThe brain's own plugin, and a harness that protects");
  const settingsBefore = readFileSync(SETTINGS, "utf8");
  const switchesBefore = readFileSync(SWITCHES, "utf8");
  r = run(["switch", "harness", "brain@hypervibe-brain", "off", "--confirmed"], withClaude);
  check("the brain's own plugin is refused, in clear words", r.code === 1 && r.out?.ok === false && r.out.own === true && /never switched off/.test(r.out.error) && /locks/.test(r.out.error), r.raw);
  r = run(["switch", "harness", "sosie@ailleurs", "off", "--confirmed"], withClaude);
  check("so is a plugin of another name whose hooks run the brain's locks", r.out?.ok === false && r.out.own === true, r.raw);
  r = run(["switch", "harness", "veille@place", "off"], withClaude);
  check("a harness that checks before an action is not switched off without the person's word", r.code === 1 && r.out?.ok === false && r.out.confirm === true && r.out.protects?.length === 1 && r.out.protects[0].event === "PreToolUse" && r.out.protects[0].script === "avant.mjs" && /Demande avant tout envoi/.test(r.out.protects[0].what ?? "") && /--confirmed only on their yes/.test(r.out.error), r.raw);
  check("nothing changed meanwhile, in the settings nor in the brain", readFileSync(SETTINGS, "utf8") === settingsBefore && readFileSync(SWITCHES, "utf8") === switchesBefore);
  r = run(["state"]);
  check("the state marks the brain's own plugin, and how many hooks each harness runs before an action", harness("brain@hypervibe-brain")?.own === true && harness("sosie@ailleurs").own === true && harness("veille@place").own === false && harness("veille@place").protects === 1, r.raw);
  r = run(["switch", "harness", "veille@place", "off", "--confirmed"], withClaude);
  check("with their word, it is switched off, and the answer names the protection that goes", r.out?.ok === true && r.out.protectionRemoved?.[0]?.script === "avant.mjs" && readJ(SETTINGS).enabledPlugins["veille@place"] === false && readJ(SWITCHES).harnesses["veille@place"] === "off", r.raw);
  check("switching it on again asks for nothing", run(["switch", "harness", "veille@place", "on"], withClaude).out?.ok === true && readJ(SETTINGS).enabledPlugins["veille@place"] === true);
  check("a harness that is not installed is refused", run(["switch", "harness", "absent@place", "off"]).out?.ok === false && run(["switch", "harness", "rien du tout", "off"]).out?.ok === false);
  check("a switch that is neither on nor off is refused", run(["switch", "harness", "outils@place", "peut-etre"]).code === 1 && run(["switch", "skill", "essai"]).code === 1);

  console.log("\nAnother computer: place keeps the switches");
  // The switches arrive with the brain (a synchronisation): a skill off that
  // this computer still links, a harness off that is installed and on here.
  writeFileSync(SWITCHES, JSON.stringify({ skills: { autre: "off" }, harnesses: { "outils@place": "off", "ailleurs@place": "off" } }), "utf8");
  check("before place, the state says the skill is off in the brain and still linked here", run(["state"]).out?.skills?.find((s) => s.folder === "autre")?.on === false && isLink("autre"));
  const st = script("status.mjs", ["--json"]);
  check("the status says so, with what is off", st.out?.executive?.skillsOff?.join() === "autre" && st.out.executive.offButLinkedHere?.join() === "autre" && st.out.executive.harnessesOff.join() === "ailleurs@place,outils@place", st.raw.slice(0, 600));
  r = run(["place"]);
  check("place takes the link of the skill away, and keeps the one of a skill that is on", r.out?.ok === true && r.out.done.includes("skill autre: off") && gone("autre") && isLink("essai") && existsSync(join(inBrain("autre"), "SKILL.md")), r.raw);
  check("it names the harness that is off in the brain and on here, with the command that switches it off", r.out?.harnessesToOffer?.length === 1 && r.out.harnessesToOffer[0].harness === "outils@place" && /switch harness outils@place off$/.test(r.out.harnessesToOffer[0].switchOff) && /that computer's choice/.test(r.out.offer), r.raw);
  check("and switches nothing off by itself", readJ(SETTINGS).enabledPlugins["outils@place"] === true);
  check("a second place changes nothing", run(["place"]).out?.done?.length === 0);
  check("a harness that is not installed here can still be switched on again in the brain", run(["switch", "harness", "ailleurs@place", "on"]).out?.here === "not installed" && !("ailleurs@place" in readJ(SWITCHES).harnesses));
  run(["switch", "harness", "outils@place", "on"]);
  run(["switch", "skill", "autre", "on"]);
  check("everything on again", isLink("autre") && JSON.stringify(readJ(SWITCHES)) === '{"skills":{},"harnesses":{}}', readFileSync(SWITCHES, "utf8"));

  console.log("\nA guard has no switch");
  r = run(["switch", "guard", "envoi-guard.mjs", "off"]);
  check("the command refuses, whoever asks", r.code === 1 && r.out?.ok === false && /a guard has no switch/.test(r.out.error) && guardWired(), r.raw);
  check("with the person's word claimed too", run(["switch", "guard", "envoi-guard.mjs", "off", "--confirmed"]).out?.ok === false && guardWired());
  // A switch written by hand for a guard is not read: the guard stays wired, and place wires it again.
  writeFileSync(SWITCHES, JSON.stringify({ skills: {}, harnesses: {}, guards: { "envoi-guard.mjs": "off" } }), "utf8");
  r = run(["state"]);
  check("a switch written by hand for a guard switches nothing off", r.out?.guards?.[0]?.placed === true && r.out.guards[0].approved === true && guardWired() && !JSON.stringify(r.out.switches).includes("guard"), r.raw);
  writeFileSync(SETTINGS, JSON.stringify({ model: "x" }), "utf8");
  check("and place wires the guard again", run(["place"]).out?.done?.some((d) => d.startsWith("guard envoi-guard.mjs")) && guardWired());
  check("a guard named as a skill or as a harness is not one", run(["switch", "skill", "envoi-guard.mjs", "off"]).out?.ok === false && run(["switch", "harness", "envoi-guard.mjs", "off"]).out?.ok === false && guardWired());
  {
    // The lock still keeps the AI out of the guard itself and its wiring.
    const lock = (tool, input) => {
      const l = spawnSync(process.execPath, [join(PLUGIN, "scripts", "hook-locks.mjs")], { env: base, input: JSON.stringify({ tool_name: tool, tool_input: input }), encoding: "utf8" });
      return l.stdout.trim() ? JSON.parse(l.stdout).hookSpecificOutput?.permissionDecision : "pass";
    };
    check("the AI still cannot write the guard nor its wiring", lock("Edit", { file_path: fwd(join(BRAIN, "executive", "guards", "envoi-guard.mjs")) }) === "deny" && lock("Write", { file_path: fwd(join(BRAIN, "executive", "guards.json")) }) === "deny");
    check("the switches of the skills and the harnesses are the AI's to ask for", lock("Bash", { command: `node "${fwd(join(PLUGIN, "scripts", "executive.mjs"))}" switch skill essai off` }) === "pass");
    // WHY THE LIVE VIEW HAS NO BUTTON THAT PAUSES A GUARD (docs/executive.md).
    // Such a button would be worth what the view's token is worth against the
    // AI. Since 2026-11-28 a lock refuses the AI's tools and commands that name
    // the token's file; but the token is still a file of the person's account
    // that a program of theirs reads (the plugin's own suggestion hook does),
    // and a program written to find it is not a command that names it. Still
    // no button: the lock slows, it does not keep.
    const tokenFile = fwd(join(HOME, ".hypervibe-brain", "live-token.json"));
    check("the view's token is refused to the AI's tools and commands that name it (a lock that slows: the view still pauses no guard)", lock("Bash", { command: `cat ${tokenFile}` }) === "deny" && lock("Read", { file_path: tokenFile }) === "deny");
  }
  run(["switch", "skill", "essai", "on"]);
  check("the script writes only its own keys in the switches", JSON.stringify(readJ(SWITCHES)) === '{"skills":{},"harnesses":{}}', readFileSync(SWITCHES, "utf8"));
  writeFileSync(SWITCHES, "{ not json", "utf8");
  r = run(["state"]);
  check("switches that cannot be read switch nothing off, and it is said", r.out?.ok === true && r.out.skills.every((s) => s.on) && /cannot be read/.test(r.out.switchesError ?? ""), r.raw);
  check("and they are never written over", run(["switch", "skill", "essai", "off"]).code === 1 && readFileSync(SWITCHES, "utf8") === "{ not json" && isLink("essai"));
  r = run(["place"]);
  check("place still puts everything back, and says the switches could not be read", r.out?.ok === true && /cannot be read/.test(r.out.switchesError ?? "") && isLink("essai") && guardWired(), r.raw);
  rmSync(SWITCHES);

  console.log("\nA skill that seems to hold a secret");
  // (Written in pieces: nothing here is a secret, and no scan of this file should think so.)
  const word = ["Tr0ub4dor", "!x"].join("");
  const key = ["sk", "live", "a1B2c3D4e5F6g7H8"].join("_");
  skill(linkOf("serveur"), "serveur", ["# Serveur\n\nLe mot de passe", ` : ${word}\n`].join(""));
  mkdirSync(join(linkOf("serveur"), "scripts"), { recursive: true });
  writeFileSync(join(linkOf("serveur"), "scripts", "appel.mjs"), `// Appelle le service.\nconst k = "${key}";\nconsole.log(k.length);\n`, "utf8");
  r = run(["adopt-skill", "serveur"]);
  check("adopting it warns, with the file, the line and the kind", r.out?.ok === true && r.out.secrets?.count === 2 && r.out.secrets.lines.some((l) => l.file === "SKILL.md" && l.line === 8 && l.kind === "a password") && r.out.secrets.lines.some((l) => l.file === "scripts/appel.mjs" && l.line === 2 && l.kind === "a payment key") && /SKILL\.md line 8: a password/.test(r.out.warning), r.raw);
  check("never with the value", !r.raw.includes(word) && !r.raw.includes(key));
  check("it is only a warning: the skill is in the brain and linked", isLink("serveur") && existsSync(join(inBrain("serveur"), "SKILL.md")));
  r = run(["state"]);
  const serveur = r.out?.skills?.find((s) => s.folder === "serveur");
  check("the state carries, for each skill, how many and which lines", serveur?.secrets?.count === 2 && serveur.secrets.lines.length === 2 && essai()?.secrets?.count === 0 && !r.raw.includes(word) && !r.raw.includes(key), JSON.stringify(serveur));
  const status = script("status.mjs", ["--json"]);
  check("the status says it", status.out?.executive?.skillSecrets?.length === 1 && status.out.executive.skillSecrets[0].skill === "serveur" && status.out.executive.skillSecrets[0].count === 2 && !status.raw.includes(word), status.raw.slice(0, 600));
  const plain = spawnSync(process.execPath, [join(PLUGIN, "scripts", "status.mjs")], { env: base, encoding: "utf8" }).stdout;
  check("in its plain words too", /A SKILL SEEMS TO HOLD A SECRET.*serveur \(SKILL\.md line 8: a password/.test(plain) && !plain.includes(word), plain.slice(0, 600));
  check("the start asks the floor without that reading", (() => {
    const quick = spawnSync(process.execPath, ["--input-type=module", "-e", `const m = await import(${JSON.stringify(pathToFileURL(join(PLUGIN, "scripts", "executive.mjs")).href)}); console.log(JSON.stringify(m.state({ harnesses: false }).skills.map((s) => "secrets" in s)));`], { env: base, encoding: "utf8" });
    return quick.stdout.trim() === JSON.stringify(readdirSync(join(BRAIN, "executive", "skills"), { withFileTypes: true }).filter((d) => existsSync(join(BRAIN, "executive", "skills", d.name, "SKILL.md"))).map(() => false));
  })());

  console.log("\nThe journal of the brain");
  {
    const journal = join(HOME, ".hypervibe-brain", "events.jsonl");
    const lines = existsSync(journal) ? readFileSync(journal, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((e) => e.what === "switched") : [];
    check("each switch is noted, with who asked", lines.some((e) => e.kind === "skill" && e.name === "essai" && e.to === "off" && e.who === "ai") && lines.some((e) => e.kind === "harness" && e.name === "veille@place" && e.to === "off" && e.confirmed === true), JSON.stringify(lines.slice(0, 4)));
  }
  // (Kept for the eye: a link made by hand to something else is never removed.)
  run(["switch", "skill", "autre", "off"]);
  mkdirSync(join(BASE, "ailleurs"), { recursive: true });
  symlinkSync(join(BASE, "ailleurs"), linkOf("autre"), "junction");
  r = run(["switch", "skill", "autre", "off"]);
  check("a link that leads elsewhere than the brain holds the place: it is left, and said", r.out?.here === "left" && /left as it is/.test(r.out.left ?? "") && isLink("autre") && existsSync(join(BASE, "ailleurs")), r.raw);

  console.log("\nThe scan sees a password behind a few words, and an address that works as a key (2026-11-27)");
  {
    // (Written in pieces: nothing here is a secret.)
    const { scanSecrets } = await import(pathToFileURL(join(PLUGIN, "scripts", "secret-scan.mjs")).href);
    const kinds = (t) => scanSecrets(t).map((f) => f.kind).join("|");
    const value = ["Ab3x", "Y9zQ", "!"].join("");
    check("a password with words between its name and its value", kinds(`Mot de pa${"sse"} de dev : \`${value}\`.`) === "a password" && kinds(`pass${"word"} for the admin: ${value}`) === "a password");
    check("a deposit address whose name ends with a random part", kinds(`- purchases: acme-shop-${"y9k2" + "m4p7q1"}@suppliers.example.com`) === "an email address that works as a key");
    check("a sentence about passwords, plain addresses and a year in an address are left alone", !kinds("Le mot de passe se saisit dans la fenêtre : jamais dans le chat.") && !kinds("marie.durand@example.com, jean-pierre@example.com") && !kinds("contact-2026@example.com, team-support@example.com"));
  }

  console.log("\nA plugin switched while a conversation is open: its next message says to type /reload-plugins (2026-11-28)");
  {
    const talk = join(BASE, "talks");
    mkdirSync(talk, { recursive: true });
    const before = join(talk, "before.jsonl");
    writeFileSync(before, "", "utf8");
    await new Promise((r) => setTimeout(r, 60));
    const note = spawnSync(process.execPath, ["--input-type=module", "-e", `import { noteSwitch } from ${JSON.stringify(pathToFileURL(join(PLUGIN, "scripts", "reload-reminder.mjs")).href)}; noteSwitch("demo-plugin@a-market", "off");`], { env: base, encoding: "utf8" });
    await new Promise((r) => setTimeout(r, 60));
    const after = join(talk, "after.jsonl");
    writeFileSync(after, "", "utf8");
    const said = (session, transcript) => {
      const r = spawnSync(process.execPath, [join(PLUGIN, "scripts", "hook-suggest.mjs")], { env: { ...base, HVBRAIN_SUGGEST: "off" }, input: JSON.stringify({ prompt: "Where were we?", session_id: session, transcript_path: transcript }), encoding: "utf8" });
      try { return String(JSON.parse(r.stdout).hookSpecificOutput.additionalContext); } catch { return ""; }
    };
    const first = said("talk-1", before);
    check("a conversation open before the switch is told, with the plugin's name", note.status === 0 && /\/reload-plugins/.test(first) && /demo-plugin switched off/.test(first), `${note.stderr} ${first}`);
    check("told once: its next message says nothing more", said("talk-1", before) === "");
    if (statSync(after).birthtimeMs > 0) check("a conversation that started after the switch has it already: it is not told", said("talk-2", after) === "");
    else console.log("  (this disk gives no birth time to a file: a conversation started later is told too, which does no harm)");
  }
} finally {
  for (let tries = 0; tries < 5; tries++) {
    try { rmSync(BASE, { recursive: true, force: true }); break; } catch { /* a file still held */ }
  }
}

console.log(`\n${total - failures} ok, ${failures} FAIL (${total} checks)\n`);
process.exit(failures ? 1 : 0);
