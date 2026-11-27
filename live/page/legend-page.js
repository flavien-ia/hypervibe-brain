// legend-page.js: the legend alone (legend.html), in the brain's language.

import { $ } from "./dom.js";
import { startLanguage } from "./i18n.js";
import { startIcons } from "./icones-hypervibe.js";
import { legendHtml } from "./legend.js";

await startLanguage({ fresh: true });
$("#legend-body").innerHTML = legendHtml();
// The icons of the design system (2026-11-24).
startIcons();
