// plugin-place.mjs - Where this plugin lives, and what that changes for an update.
//
// An update moves the installed folder aside as a backup, then puts the new version in its
// place. That backup only lasts where the folder sits in a registry we know: a marketplace
// folder, `.../plugins/marketplaces/<marketplace>/<plugin name>`.
//
// Claude Desktop 4.29 (Microsoft Store) keeps the plugins it was given by upload in a registry
// of its own (`...\rpm\<account>\<org>\plugin_<id>`), and tidies that folder by itself a few
// minutes after an update: every folder it does not know is deleted, the backup included. Its
// Plugins screen also shows the version of the upload, never the one on disk. So, outside a
// marketplace folder, an update must not promise a backup, and on Desktop it says which version
// really runs.
//
// No I/O: only the path and the plugin's name are read. Same rule as the Hypervibe plugin (its
// `scripts/plugin-place.mjs`, from the Desktop bench of 28-29/10/2026).

import path from "node:path";

/**
 * @param {string} pluginRoot  the plugin's folder
 * @param {string} name        its name, from .claude-plugin/plugin.json
 * @returns {{place: "marketplace"|"desktop"|"outside_marketplace", backupKept: boolean, desktop: boolean}}
 */
export function pluginPlace(pluginRoot, name) {
  const root = path.resolve(String(pluginRoot || ""));
  const marketplace = path.dirname(root);
  if (path.basename(path.dirname(marketplace)) === "marketplaces" && path.basename(root) === name) {
    return { place: "marketplace", backupKept: true, desktop: false };
  }
  const segments = root.split(/[\\/]+/).map((s) => s.toLowerCase());
  const desktop = segments.includes("rpm") && /^plugin_[a-z0-9]+$/i.test(path.basename(root));
  return { place: desktop ? "desktop" : "outside_marketplace", backupKept: false, desktop };
}
