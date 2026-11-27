// cloud-wrangler.mjs - Which `wrangler` the cloud copy runs (cloud.mjs), and
// what it finds in its environment.
//
// Three ways, in this order: the script of HVBRAIN_WRANGLER (the test bench's
// fake), the wrangler installed globally, else npx.
//
// THE NPX WAY, TIGHTENED (2026-11-27). `npx --yes wrangler` downloaded
// whatever version was the latest that day, and ran its install with the
// person's Cloudflare token in its environment: a bad release, or a bad
// dependency of one, would have read it. Two rules now:
//   - a precise major version is asked for (WRANGLER_MAJOR), never "the latest";
//   - the download is a step of its own, WITHOUT any Cloudflare access in its
//     environment (`npx --yes wrangler@N --version`); the commands that carry
//     the token then run with `npx --no`, which never downloads.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const WRANGLER_MAJOR = "4";
export const NPX_PACKAGE = `wrangler@${WRANGLER_MAJOR}`;

/** An environment without any Cloudflare access. @param {Record<string, string | undefined>} env */
export const withoutCloudflare = (env) => Object.fromEntries(Object.entries(env).filter(([k]) => !/^(CLOUDFLARE|CF)_(API_TOKEN|API_KEY|API_USER_SERVICE_KEY|EMAIL|ACCOUNT_ID)$/i.test(k)));

/** Where pnpm and npm keep what is installed globally. */
const globalRoots = () => ["pnpm", "npm"].map((pm) => spawnSync(pm, ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32", windowsHide: true }).stdout?.trim()).filter(Boolean);

/**
 * The command to run wrangler with: `cmd`, the arguments that come before
 * wrangler's own (`pre`), and for npx the download to do first (`fetch`).
 * @param {{ fake?: string, roots?: string[], platform?: string, exists?: (p: string) => boolean }} [o]
 * @returns {{ cmd: string, pre: string[], npx: boolean, fetch?: string[] }}
 */
export function wranglerPlan({ fake = process.env.HVBRAIN_WRANGLER, roots, platform = process.platform, exists = existsSync } = {}) {
  if (fake) return { cmd: process.execPath, pre: [fake], npx: false };
  for (const root of roots ?? globalRoots()) {
    const js = join(root, "wrangler", "bin", "wrangler.js");
    if (exists(js)) return { cmd: process.execPath, pre: [js], npx: false };
  }
  return { cmd: platform === "win32" ? "npx.cmd" : "npx", pre: ["--no", "--", NPX_PACKAGE], npx: true, fetch: ["--yes", "--", NPX_PACKAGE, "--version"] };
}

/**
 * The download of wrangler through npx, with no Cloudflare access in its
 * environment. Nothing to do for the two other ways.
 * @param {{ cmd: string, npx: boolean, fetch?: string[] }} plan
 * @param {{ spawn?: typeof spawnSync, env?: Record<string, string | undefined> }} [o]
 */
export function fetchWrangler(plan, { spawn = spawnSync, env = process.env } = {}) {
  if (!plan.npx || !plan.fetch) return true;
  const r = spawn(plan.cmd, plan.fetch, { env: withoutCloudflare(env), encoding: "utf8", windowsHide: true, timeout: 600_000, shell: plan.cmd.endsWith(".cmd") });
  return r.status === 0;
}
