// install.js: the page as an app. Installed, it becomes an application of
// its own: a shortcut with its own icon, which stays its own once pinned.

import { $ } from "./dom.js";
import { language } from "./lang.js";

/** What the browser hands over when the page can be installed (not in the standard types yet). @typedef {Event & { prompt: () => void, userChoice: Promise<unknown> }} InstallInvitation */

/**
 * Links the manifest of the page's language (the app's name and description
 * are in it). The link is not in the markup: the browser must only ever see
 * the manifest of the right language, else an installed app could be renamed.
 */
export function linkManifest() {
  const href = language() === "fr" ? "manifest.fr.webmanifest" : "manifest.webmanifest";
  let link = /** @type {HTMLLinkElement | null} */ (document.querySelector('link[rel="manifest"]'));
  if (!link) {
    link = document.createElement("link");
    link.rel = "manifest";
    document.head.append(link);
  }
  if (link.getAttribute("href") !== href) link.href = href;
}

/** Wires the install button: shown when the browser offers to install the page as an app. */
export function setUpInstall() {
  /** @type {InstallInvitation | null} */
  let invitation = null;
  const button = $("#install");
  addEventListener("beforeinstallprompt", (ev) => {
    ev.preventDefault();
    invitation = /** @type {InstallInvitation} */ (ev);
    button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!invitation) return;
    invitation.prompt();
    await invitation.userChoice;
    invitation = null;
    button.hidden = true;
  });
  addEventListener("appinstalled", () => { button.hidden = true; });
}
