// usage.js: the usage page: what using the brain costs. It is read in the
// journal of the brain's MCP server, read again each time the page opens (a
// local file, no database is asked).
//
// THE USAGE PAGE (2026-11-10): a dashboard (the figure that matters, the
// indicators, two charts), the detail (by tool, the heaviest calls), then the
// whole log of the period. A period chosen at the top holds for everything
// below.

import { attempt, getJudges, getUsage } from "./api.js";
import { $, $all, $input, $select } from "./dom.js";
import { FULL_DAY, clock, compact, dayKey, dollars, duration, escapeHtml, formatDate, median, number, plain } from "./format.js";
import { t } from "./i18n.js";
import { drawHeld, heldSlot, onJudgesDrawn } from "./judges.js";
import { noJudgeNotice, notice } from "./setup.js";
import { state } from "./state.js";
import { USAGE_JUDGE as JUDGE, USAGE_JUDGE_REREAD as JUDGE_REREAD, USAGE_WARNING as WARNING, USAGE_YOU as YOU } from "./theme.js";

/** @typedef {import("../contract.d.ts").UsageLine} UsageLine */
/** @typedef {import("../contract.d.ts").JudgeCost} JudgeCost */
/** @typedef {import("../contract.d.ts").JudgeRun} JudgeRun */
/** How much each reader read. @typedef {{ you: number, judge: number }} Heap */
/** One column of a chart. @typedef {{ label: string, value: number, parts: { value: number, color: string }[], tip: string }} Column */

// Two colours, one per reader, the same everywhere on the page (validated on
// the dark surface, dataviz method): the person in blue (YOU), the judge in
// orange (JUDGE). What a judge costs has two parts, in two steps of its orange
// (validated together on the card's surface): the tokens it reads or writes
// anew, and, darker, those it reads again at each turn (JUDGE_REREAD: nine
// tenths of the volume, about a tenth of the weight). A cap that is reached:
// the warning colour of the page (WARNING, the paused button's). Each is a
// colour of the design (theme.js, 2026-11-23).
const DAY_MS = 86_400_000;

/** What is shown: the period in days (1: today, 0: everything), the journal, and the judges with their runs (null: not read). @type {{ days: number, lines: UsageLine[] | null, judges: JudgeCost[] | null }} */
const usage = { days: 7, lines: null, judges: null };
/** The log under the dashboard: the lines of the period, those the filters keep, how many are shown. */
const log = {
  /** @type {UsageLine[]} */ period: [],
  /** @type {UsageLine[]} */ shown: [],
  count: 0,
  /** @type {Map<string, number>} day -> its number of calls */
  byDay: new Map(),
};

/** A line the judge read (the plugin signs them with `who`), not a conversation of the person. @param {UsageLine} l */
const byJudge = (l) => Boolean(l.who);
/** @param {UsageLine[]} lines @param {string} key */
const sum = (lines, key) => lines.reduce((total, l) => total + (Number(l[key]) || 0), 0);
/** The name of a brain tool, in words. @param {string} tool */
const toolName = (tool) => t("brainToolName", tool);
const chartKey = () => `<span class="chart-key"><i style="background:${YOU}"></i>${t("you")}<i style="background:${JUDGE}"></i>${t("judge")}</span>`;
/** What a call was about, and the notes it gave. @param {UsageLine} l */
const subject = (l) => `${escapeHtml(l.what ?? "")}${l.slugs?.length ? `<small> → ${escapeHtml(l.slugs.join(", "))}</small>` : ""}`;
/** How a search looked (by words, by meaning), and whether its answer was already known. @param {UsageLine} l */
function searchMode(l) {
  const mode = l.by && t("searchMode", l.by);
  return mode ? `<small class="mode">${l.cached ? t("searchModeCached", mode) : mode}</small>` : "";
}

/**
 * A "round" step for the axis: 1, 2 or 5 times a power of ten.
 * @param {number} max
 * @param {number} [n] about how many steps
 * @returns {number}
 */
function roundStep(max, n = 3) {
  const raw = max / n || 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw) ?? raw;
}

/**
 * Stacked columns (the parts of each, from the bottom up) on a baseline, an axis of three marks, a tooltip per column.
 * @param {HTMLElement} el
 * @param {Column[]} columns
 * @param {{ labels?: number, scale?: number }} [how] about how many labels under the columns; the value the axis must reach (charts side by side that compare)
 */
function drawColumns(el, columns, { labels = 8, scale = 0 } = {}) {
  const own = Math.max(...columns.map((c) => c.value), 0);
  if (!own) { el.innerHTML = `<p class="usage-empty">${t("nothingInPeriod")}</p>`; return; }
  const max = Math.max(own, scale);
  const step = roundStep(max);
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let tick = 0; tick <= top + 1e-9; tick += step) ticks.push(tick);
  const every = Math.max(1, Math.ceil(columns.length / labels));
  el.innerHTML = `
      <div class="chart-axis">${ticks.map((tick) => `<span style="bottom:${(100 * tick) / top}%">${compact(tick)}</span>`).join("")}</div>
      <div class="chart-area">
        ${ticks.map((tick) => `<i class="chart-grid" style="bottom:${(100 * tick) / top}%"></i>`).join("")}
        <div class="chart-columns">${columns.map((c) => `<div class="chart-column" tabindex="0" data-tip="${escapeHtml(c.tip)}"><span class="chart-stack" style="height:${c.value ? Math.max(1.5, (100 * c.value) / top) : 0}%">${c.parts.filter((p) => p.value).map((p) => `<b style="flex:${p.value};background:${p.color}"></b>`).join("")}</span></div>`).join("")}</div>
      </div>
      <div class="chart-x">${columns.map((c, i) => `<span>${i % every === 0 || i === columns.length - 1 ? escapeHtml(c.label) : ""}</span>`).join("")}</div>`;
}

/**
 * One column: the person at the bottom, the judge above; the tooltip gives both and the total.
 * @param {Heap | undefined} heap already counted
 * @param {string} label under the column
 * @param {string} when in the tooltip
 * @param {string} unit
 * @returns {Column}
 */
function column(heap, label, when, unit) {
  const { you, judge } = heap ?? { you: 0, judge: 0 };
  return { label, value: you + judge, parts: [{ value: you, color: YOU }, { value: judge, color: JUDGE }], tip: t("stackTip", you + judge, unit, when, you, judge) };
}

// ------------------------------------------------------------ what the judges cost
// THE JUDGES' BLOCK (2026-11-17), above the rest: the reads below are what
// the brain sends back; this is everything a judge uses to do its work, run
// by run, as Claude counted it. One table for the period (a line per judge),
// then one card per judge: where it stands today against its cap, and its
// tokens day by day, all the cards on the same scale.

/** What a set of runs adds up to. @param {JudgeRun[]} runs */
function addUp(runs) {
  const o = { runs: runs.length, failed: 0, judged: 0, fresh: 0, reread: 0, countedJudged: 0, uncounted: 0, nothing: 0, usd: 0, priced: false };
  for (const r of runs) {
    if (!r.ok) o.failed++;
    o.judged += r.judged;
    o.fresh += r.fresh;
    o.reread += r.reread;
    // Tokens per item: only over the runs whose tokens the journal carries.
    if (r.counted) o.countedJudged += r.judged; else o.uncounted++;
    if (!r.writes) o.nothing++;
    if (r.apiUsd !== null) { o.usd += r.apiUsd; o.priced = true; }
  }
  return o;
}

/** The key of the two parts of a judge's tokens. */
const judgeKey = () => `<span class="chart-key"><i style="background:${JUDGE}"></i>${t("tokensNew")}<i style="background:${JUDGE_REREAD}"></i>${t("tokensReread")}</span>`;

/**
 * One line of the judges' table.
 * @param {string} nameHtml
 * @param {ReturnType<typeof addUp>} o
 * @param {number} widest the tokens of the heaviest line: its bar takes the whole length
 */
function judgeRow(nameHtml, o, widest) {
  const tokens = o.fresh + o.reread;
  const bar = widest ? `<span class="share-bar double" tabindex="0" data-tip="${escapeHtml(t("judgeTokensTip", o.fresh, o.reread))}"><i style="width:${(100 * o.fresh) / widest}%;background:${JUDGE}"></i><i style="width:${(100 * o.reread) / widest}%;background:${JUDGE_REREAD}"></i></span>` : "";
  return `<tr><td class="clip">${nameHtml}</td>`
    + `<td class="num"><span tabindex="0" data-tip="${escapeHtml(t("judgeRunsTip", o.runs, o.failed))}">${number(o.runs)}</span></td>`
    + `<td class="num">${number(o.judged)}</td>`
    + `<td class="num">${number(tokens)}<small class="mode">${escapeHtml(`${compact(o.fresh)} ${t("tokensNew")} · ${compact(o.reread)} ${t("tokensReread")}`)}</small></td>`
    + `<td class="share"><div class="share-row">${bar}</div></td>`
    + `<td class="num">${o.countedJudged ? number(tokens / o.countedJudged) : "-"}</td>`
    + `<td class="num">${o.runs ? `<span tabindex="0" data-tip="${escapeHtml(t("judgeNothingTip", o.nothing, o.runs))}">${t("percent", Math.round((100 * o.nothing) / o.runs))}</span>` : "-"}</td>`
    + `<td class="num">${o.priced ? `<span tabindex="0" data-tip="${escapeHtml(t("judgeApiTip"))}">≈ ${escapeHtml(dollars(o.usd))}</span>` : "-"}</td></tr>`;
}

/**
 * The columns of one judge's chart: by hour today, by day otherwise; the new tokens at the bottom, the re-read ones above.
 * @param {JudgeRun[]} runs the runs of the period
 * @param {number} start the start of the period (milliseconds)
 * @param {number} now
 * @returns {Column[]}
 */
function judgeColumns(runs, start, now) {
  /** @type {Map<string | number, { fresh: number, reread: number, runs: number, judged: number }>} hour of today, or day -> what was used */
  const heaps = new Map();
  for (const r of runs) {
    const d = new Date(r.at);
    const key = usage.days === 1 ? d.getHours() : dayKey(d);
    let heap = heaps.get(key);
    if (!heap) heaps.set(key, (heap = { fresh: 0, reread: 0, runs: 0, judged: 0 }));
    heap.fresh += r.fresh;
    heap.reread += r.reread;
    heap.runs++;
    heap.judged += r.judged;
  }
  /** @param {string | number} key @param {string} label @param {string} when @returns {Column} */
  const one = (key, label, when) => {
    const { fresh, reread, runs: n, judged } = heaps.get(key) ?? { fresh: 0, reread: 0, runs: 0, judged: 0 };
    return { label, value: fresh + reread, parts: [{ value: fresh, color: JUDGE }, { value: reread, color: JUDGE_REREAD }], tip: t("judgeColumnTip", when, compact(fresh + reread), compact(fresh), compact(reread), n, judged) };
  };
  /** @type {Column[]} */
  const columns = [];
  if (usage.days === 1) {
    for (let hour = 0; hour <= new Date(now).getHours(); hour++) columns.push(one(hour, t("hour", hour), t("hourRange", hour)));
    return columns;
  }
  const today = dayKey(now);
  for (let time = new Date(new Date(start).setHours(12, 0, 0, 0)).getTime(); time <= now + DAY_MS / 2; time += DAY_MS) {
    const d = new Date(time);
    if (d.getTime() > now && dayKey(d) !== today) break;
    columns.push(one(dayKey(d), formatDate(d, { day: "numeric", month: "short" }).replace(".", ""), formatDate(d, FULL_DAY)));
  }
  return columns;
}

/** Where each judge stands today, in its card: what it used against its cap, and whether it is capped. Drawn again when the judges' state changes. */
function drawJudgesToday() {
  for (const el of $all(".judge-today")) {
    const judge = state.judges.find((x) => x.name === el.dataset.judge) ?? usage.judges?.find((x) => x.name === el.dataset.judge);
    if (!judge || judge.removed) { el.innerHTML = ""; continue; }
    const cap = judge.dailyTokens;
    const figure = cap ? t("spentOfCap", judge.spentToday, cap) : t("spentNoCap", judge.spentToday);
    // A meter only against a limit: its track is a lighter step of the fill.
    const fill = judge.capped ? WARNING : JUDGE;
    const meter = cap ? `<span class="meter" role="img" aria-label="${escapeHtml(figure)}" style="--fill:${fill}"><i style="width:${Math.min(100, (100 * judge.spentToday) / cap)}%"></i></span>` : "";
    const status = judge.held ? t("heldWaiting") : judge.capped ? t("capReached") : "";
    el.innerHTML = `<div class="judge-today-line"><span class="judge-today-label">${t("judgeToday")}</span><span class="judge-today-figure">${escapeHtml(figure)}</span></div>${meter}${status ? `<p class="judge-status">${escapeHtml(status)}</p>` : ""}`;
  }
}

/**
 * Draws the judges' block for the period.
 * @param {number} start the start of the period (milliseconds; 0 for everything)
 * @param {number} now
 */
function drawJudges(start, now) {
  const card = $("#usage-judges-card");
  // A judge the brain no longer declares only shows for a period it worked in.
  const shown = (usage.judges ?? []).map((judge) => ({ judge, runs: judge.runs.filter((r) => Date.parse(r.at) >= start) })).filter(({ judge, runs }) => !judge.removed || runs.length);
  card.hidden = !shown.length;
  // A brain without any judge, now or before: said, with how to get one (setup.js).
  const none = $("#usage-no-judge");
  none.hidden = !(usage.judges && !usage.judges.length);
  if (!none.hidden) none.innerHTML = noJudgeNotice();
  if (!shown.length) return;
  const totals = shown.map(({ judge, runs }) => ({ judge, o: addUp(runs) }));
  const all = addUp(shown.flatMap(({ runs }) => runs));
  const widest = Math.max(...totals.map(({ o }) => o.fresh + o.reread), 0);
  $("#usage-judges-meta").innerHTML = judgeKey();
  $("#usage-judges").innerHTML = `<thead><tr><th>${t("thJudge")}</th><th class="num">${t("thRuns")}</th><th class="num">${t("thJudgedHtml")}</th><th class="num">${t("thTokens")}</th><th class="share">${t("thNewAndReread")}</th><th class="num">${t("thPerItemHtml")}</th><th class="num">${t("thNothingHtml")}</th><th class="num">${t("thApiHtml")}</th></tr></thead><tbody>`
    + totals.map(({ judge, o }) => judgeRow(`${escapeHtml(judge.name)}${judge.removed ? `<small class="mode">${t("judgeRemoved")}</small>` : ""}`, o, widest)).join("")
    + (totals.length > 1 ? judgeRow(`<b>${t("allJudges")}</b>`, all, 0) : "") + `</tbody>`;
  $("#usage-judges-note").textContent = [t("judgesNote"), all.uncounted ? t("judgesUncounted", all.uncounted) : ""].filter(Boolean).join(" ");
  // One card per judge the brain declares (a judge removed since keeps its line of the table).
  // The charts compare: they share the scale of the heaviest column.
  const first = Math.min(...shown.flatMap(({ runs }) => (runs.length ? [Date.parse(runs[0].at)] : [])), now);
  const charts = shown.filter(({ judge }) => !judge.removed).map(({ judge, runs }) => ({ judge, columns: judgeColumns(runs, start || first, now) }));
  const scale = Math.max(...charts.flatMap(({ columns }) => columns.map((c) => c.value)), 0);
  $("#usage-judge-cards").innerHTML = charts.map(({ judge }, i) => `<div class="judge-card"><h4>${escapeHtml(judge.name)}</h4><div class="judge-today" data-judge="${escapeHtml(judge.name)}"></div>${heldSlot(judge.name)}<p class="judge-chart-title">${usage.days === 1 ? t("judgeTokensByHour") : t("judgeTokensByDay")}</p><div class="chart compact" data-chart="${i}"></div></div>`).join("");
  charts.forEach(({ columns }, i) => drawColumns($(`#usage-judge-cards [data-chart="${i}"]`), columns, { labels: 5, scale }));
  // The slots just written are filled (a judge that waits for an answer), then the state of today.
  drawHeld();
}

/** Reads the journal (again when `force`), then draws the page. */
async function openUsage(force = false) {
  if (!usage.lines || force) {
    // The frame stays, dimmed, during the reading: no jump, no flash.
    const body = $("#usage-body");
    body.classList.add("loading");
    try {
      // The whole journal (without "since"): the periods and the comparison are computed here.
      // The judges come with it, every run of each; without them, their block stays away.
      const [lines, judges] = await Promise.all([getUsage(), attempt(getJudges())]);
      if (!Array.isArray(lines)) throw new Error(/** @type {any} */ (lines)?.error ?? t("answerUnreadable"));
      usage.lines = lines;
      usage.judges = Array.isArray(judges?.judges) ? judges.judges : null;
      if (usage.judges) state.judges = usage.judges;
    } catch (e) {
      body.classList.remove("loading");
      $("#usage-hero").innerHTML = `<p class="usage-empty">${escapeHtml(t("usageUnreadable", e.message))}</p>`;
      return;
    }
    body.classList.remove("loading");
  }
  drawUsage();
}

function drawUsage() {
  const all = usage.lines ?? [];
  const now = Date.now();
  // "Today" starts at midnight, the other periods from now; "All" from the first call.
  const first = all.length ? Date.parse(all[0].at) : now;
  const start = usage.days === 1 ? new Date(new Date().setHours(0, 0, 0, 0)).getTime() : usage.days ? now - usage.days * DAY_MS : first;
  const lines = all.filter((l) => Date.parse(l.at) >= start);
  // The judges first: what they cost does not depend on the calls to the brain.
  drawJudges(usage.days ? start : 0, now);
  // A journal with nothing in it at all (a brain just created): one notice, and
  // the charts and tables that would be empty boxes stay away.
  $("#usage-body").classList.toggle("journal-empty", !all.length);
  if (!lines.length) {
    $("#usage-hero").innerHTML = all.length ? `<p class="usage-empty">${t("noCallsInPeriod")}</p>` : notice(t("journalEmpty"), t("journalEmptySay"));
    for (const selector of ["#usage-kpis", "#usage-chart1", "#usage-chart2", "#usage-tools", "#usage-heaviest", "#usage-log"]) $(selector).innerHTML = "";
    $("#usage-log-count").textContent = "";
    $("#usage-log-more").hidden = true;
    return;
  }
  const calls = lines.filter((l) => l.tool !== "(connection)");
  const input = sum(lines, "tokIn");
  const connection = sum(lines.filter((l) => l.tool === "(connection)"), "tokIn");
  const searches = calls.filter((l) => l.tool === "brain_search");
  const withMeaning = searches.filter((l) => l.by === "both" || l.by === "meaning").length;
  const suggestions = lines.filter((l) => l.tool === "(suggestion)");
  const failures = lines.filter((l) => l.ok === false).length;

  // ---- 1. The figure that matters, and its comparison when the period before is whole in the journal.
  // "Today" is compared with the same span of yesterday (from midnight to the
  // same time); 7 and 30 days, with the window of the same length just before.
  let delta = "";
  if (usage.days) {
    const dayBefore = (/** @type {number} */ time) => { const d = new Date(time); d.setDate(d.getDate() - 1); return d.getTime(); };
    const beforeStart = usage.days === 1 ? dayBefore(start) : start - (now - start);
    const beforeEnd = usage.days === 1 ? dayBefore(now) : start;
    if (first <= beforeStart) {
      const before = sum(all.filter((l) => { const at = Date.parse(l.at); return at >= beforeStart && at < beforeEnd; }), "tokIn");
      if (before) {
        const percent = Math.round((100 * (input - before)) / before);
        delta = `<p class="hero-delta">${t("usageDelta", percent > 0 ? "▲" : percent < 0 ? "▼" : "=", Math.abs(percent), t("periodBefore", usage.days))}</p>`;
      }
    } else delta = `<p class="hero-delta">${t("noComparison")}</p>`;
  }
  // The person and the judge: the share of each, in figures and in one bar.
  const yours = lines.filter((l) => !byJudge(l)), judges = lines.filter(byJudge);
  const tokensYou = sum(yours, "tokIn"), tokensJudge = sum(judges, "tokIn");
  const conversations = new Set(yours.map((l) => l.conv)).size;
  const judgeRuns = new Set(judges.map((l) => `${l.conv}|${l.at.slice(0, 10)}`)).size;
  const judgeShare = input ? (100 * tokensJudge) / input : 0;
  $("#usage-hero").innerHTML = `
      <span class="hero-label">${t("tokensRead", t("period", usage.days))}</span>
      <b class="hero-number">${number(input)}</b>
      <span class="share-bar double" role="img" aria-label="${escapeHtml(t("heroLabel", tokensYou, tokensJudge))}"><i style="width:${100 - judgeShare}%;background:${YOU}"></i><i style="width:${judgeShare}%;background:${JUDGE}"></i></span>
      <div class="hero-who">
        <span><i style="background:${YOU}"></i>${t("you")}<b>${number(tokensYou)}</b><small>${t("sharePerConversation", Math.round(100 - judgeShare), conversations ? tokensYou / conversations : 0)}</small></span>
        <span><i style="background:${JUDGE}"></i>${t("judge")}<b>${number(tokensJudge)}</b><small>${t("sharePerRun", Math.round(judgeShare), judgeRuns ? tokensJudge / judgeRuns : 0)}</small></span>
      </div>${delta}`;

  const kpis = [
    [t("kpiCalls"), number(calls.length), t("kpiCallsNote", conversations, judgeRuns)],
    [t("kpiTokensPerCall"), number(calls.length ? (input - connection) / calls.length : 0), t("kpiTokensPerCallNote")],
    [t("kpiMedian"), duration(median(calls.map((l) => l.ms ?? 0))), t("kpiMedianNote")],
    [t("kpiMeaning"), searches.length ? t("percent", Math.round((100 * withMeaning) / searches.length)) : "-", t("kpiMeaningNote", searches.length)],
    [t("kpiSuggestions"), number(suggestions.length), t("kpiSuggestionsNote", compact(sum(suggestions, "tokIn")))],
    [t("kpiConnection"), compact(connection), t("kpiConnectionNote")],
  ];
  if (failures) kpis.push([t("kpiFailures"), number(failures), t("kpiFailuresNote")]);
  $("#usage-kpis").innerHTML = kpis.map(([title, value, note]) => `<div class="kpi"><span>${title}</span><b>${value}</b><small>${escapeHtml(note)}</small></div>`).join("");

  // ONE SINGLE PASS over the lines of the period: each is put in its hour and
  // in its day, the person and the judge apart. The two charts read these
  // heaps, instead of filtering every line again for each column.
  /** @returns {Heap} */
  const emptyHeap = () => ({ you: 0, judge: 0 });
  const tokensByHour = Array.from({ length: 24 }, emptyHeap), callsByHour = Array.from({ length: 24 }, emptyHeap);
  /** @type {Map<string, Heap>} */
  const tokensByDay = new Map();
  for (const l of lines) {
    const d = new Date(l.at);
    const who = byJudge(l) ? "judge" : "you";
    const tokens = Number(l.tokIn) || 0;
    const day = dayKey(d);
    tokensByHour[d.getHours()][who] += tokens;
    let heap = tokensByDay.get(day);
    if (!heap) tokensByDay.set(day, (heap = emptyHeap()));
    heap[who] += tokens;
    if (l.tool !== "(connection)") callsByHour[d.getHours()][who]++;
  }

  // ---- Chart 1: the tokens read, by hour today, by day otherwise.
  /** @type {Column[]} */
  const chart1 = [];
  if (usage.days === 1) {
    $("#usage-chart1-title").textContent = t("tokensByHour");
    const hour = new Date().getHours();
    for (let i = 0; i <= hour; i++) chart1.push(column(tokensByHour[i], t("hour", i), t("hourRange", i), t("unitTokensRead")));
  } else {
    $("#usage-chart1-title").textContent = t("tokensByDay");
    const today = dayKey(now);
    for (let time = new Date(new Date(start).setHours(12, 0, 0, 0)).getTime(); time <= now + DAY_MS / 2; time += DAY_MS) {
      const d = new Date(time);
      if (d.getTime() > now && dayKey(d) !== today) break;
      chart1.push(column(tokensByDay.get(dayKey(d)), formatDate(d, { day: "numeric", month: "short" }).replace(".", ""), formatDate(d, FULL_DAY), t("unitTokensRead")));
    }
  }
  $("#usage-chart1-meta").innerHTML = chartKey();
  drawColumns($("#usage-chart1"), chart1);

  // ---- Chart 2: at what time, the calls (connection aside) added up over the period.
  $("#usage-chart2-meta").innerHTML = chartKey();
  drawColumns($("#usage-chart2"), callsByHour.map((heap, i) => column(heap, t("hour", i), t("hourBetween", i), t("unitCalls"))), { labels: 6 });

  // ---- 2. By tool: one share bar per line, aligned.
  /** @type {Map<string, { n: number, tokens: number, judgeTokens: number, ms: number[] }>} */
  const byTool = new Map();
  for (const l of lines) {
    const o = byTool.get(l.tool) ?? { n: 0, tokens: 0, judgeTokens: 0, ms: [] };
    o.n++;
    o.tokens += Number(l.tokIn) || 0;
    if (byJudge(l)) o.judgeTokens += Number(l.tokIn) || 0;
    if (l.tool !== "(connection)") o.ms.push(l.ms ?? 0);
    byTool.set(l.tool, o);
  }
  // The bars compare with each other: the heaviest takes the whole length,
  // the percentage beside it keeps the true share of the total.
  const scale = 100 / Math.max(...[...byTool.values()].map((o) => o.tokens), 1) * (input / 100);
  $("#usage-tools").innerHTML = `<thead><tr><th>${t("thTool")}</th><th class="num">${t("thCalls")}</th><th class="num">${t("thTokensReadHtml")}</th><th class="share">${t("thShare")}</th><th class="num">${t("thPerCallHtml")}</th><th class="num">${t("thMedianHtml")}</th></tr></thead><tbody>` +
    [...byTool].sort((x, y) => y[1].tokens - x[1].tokens).map(([tool, o]) => {
      const share = input ? (100 * o.tokens) / input : 0;
      // The bar keeps the two colours: the share of each in the share of the tool.
      const judgePart = input ? (100 * o.judgeTokens) / input : 0;
      const name = escapeHtml(toolName(tool));
      const tip = t("toolShareTip", toolName(tool), o.tokens ? Math.round((100 * (o.tokens - o.judgeTokens)) / o.tokens) : 0, o.tokens ? Math.round((100 * o.judgeTokens) / o.tokens) : 0);
      return `<tr><td class="clip" tabindex="0" data-tip="${name}">${name}</td><td class="num">${number(o.n)}</td><td class="num">${number(o.tokens)}</td><td class="share"><div class="share-row"><span class="share-bar double" tabindex="0" data-tip="${escapeHtml(tip)}"><i style="width:${(share - judgePart) * scale}%;background:${YOU}"></i><i style="width:${judgePart * scale}%;background:${JUDGE}"></i></span><span class="share-percent">${t("percent", share < 1 && share > 0 ? "< 1" : Math.round(share))}</span></div></td><td class="num">${number(o.tokens / o.n)}</td><td class="num">${o.ms.length ? duration(median(o.ms)) : "-"}</td></tr>`;
    }).join("") + `</tbody>`;

  // As many heavy calls as tools (between 5 and 10): the two cards side by side have the same height.
  const heaviest = Math.min(10, Math.max(5, byTool.size));
  $("#usage-heaviest-meta").textContent = t("heaviestCount", heaviest);
  $("#usage-heaviest").innerHTML = `<thead><tr><th>${t("thWhen")}</th><th>${t("thTool")}</th><th>${t("thObject")}</th><th class="num">${t("thTokensReadHtml")}</th></tr></thead><tbody>` +
    [...calls].sort((x, y) => (y.tokIn ?? 0) - (x.tokIn ?? 0)).slice(0, heaviest).map((l) => {
      const name = escapeHtml(toolName(l.tool));
      return `<tr><td class="when">${formatDate(l.at, { day: "2-digit", month: "2-digit" })}<small>${clock(l.at)}</small></td><td class="clip" tabindex="0" data-tip="${name}">${name}</td><td class="what" data-tip="${escapeHtml(l.what ?? "")}">${subject(l)}</td><td class="num">${number(l.tokIn ?? 0)}</td></tr>`;
    }).join("") + `</tbody>`;

  // ---- 3. The whole log of the period, which can be filtered, a hundred lines at a time.
  const tools = $select("#usage-log-tool");
  const chosen = tools.value;
  tools.innerHTML = `<option value="">${t("allTools")}</option>` + [...byTool].sort((x, y) => y[1].n - x[1].n).map(([tool, o]) => `<option value="${escapeHtml(tool)}"${tool === chosen ? " selected" : ""}>${escapeHtml(toolName(tool))} (${number(o.n)})</option>`).join("");
  log.period = [...lines].reverse();
  filterLog();
}

/** Keeps the lines of the log the three filters let through (a word, who read, which tool), and shows the first hundred. */
function filterLog() {
  const q = plain($input("#usage-log-search").value.trim());
  const tool = $select("#usage-log-tool").value;
  const who = $select("#usage-log-who").value;
  log.shown = log.period.filter((l) => (!tool || l.tool === tool) && (!who || (who === "judge") === byJudge(l)) && (!q || plain(`${l.what ?? ""} ${toolName(l.tool)} ${(l.slugs ?? []).join(" ")}`).includes(q)));
  log.count = 0;
  // The number of calls of each day, counted once: the day separators read it.
  log.byDay = new Map();
  for (const l of log.shown) { const day = dayKey(l.at); log.byDay.set(day, (log.byDay.get(day) ?? 0) + 1); }
  $("#usage-log").innerHTML = `<thead><tr><th>${t("thTime")}</th><th>${t("thTool")}</th><th>${t("thObject")}</th><th class="num">${t("thTokensRead")}</th><th class="num">${t("thDuration")}</th></tr></thead><tbody></tbody>`;
  const total = log.period.length;
  $("#usage-log-count").textContent = log.shown.length === total ? t("callsInPeriod", total) : t("shownOfTotal", log.shown.length, total);
  showMoreLog();
}

/** Adds the next hundred lines of the log, with a separator at each new day. */
function showMoreLog() {
  const body = $("#usage-log tbody");
  const slice = log.shown.slice(log.count, log.count + 100);
  let previousDay = log.count ? dayKey(log.shown[log.count - 1].at) : "";
  let html = "";
  for (const l of slice) {
    const day = dayKey(l.at);
    if (day !== previousDay) {
      html += `<tr class="day-row"><td colspan="5">${formatDate(l.at, FULL_DAY)}<small>${t("callsCount", log.byDay.get(day) ?? 0)}</small></td></tr>`;
      previousDay = day;
    }
    const judge = byJudge(l);
    html += `<tr${l.ok === false ? ' class="failed"' : ""}><td class="when">${clock(l.at)}</td><td><span class="who-dot" style="background:${judge ? JUDGE : YOU}" data-tip="${escapeHtml(judge ? t("judge") : t("you"))}"></span>${escapeHtml(toolName(l.tool))}${judge ? `<small class="mode">${t("judgeMarkHtml", l.who && l.who !== "ai:" ? escapeHtml(l.who.slice(3)) : "")}</small>` : ""}${searchMode(l)}</td><td class="what" data-tip="${escapeHtml(l.what ?? "")}">${subject(l)}${l.ok === false ? `<small class="failed-word"> · ${t("failedWord")}</small>` : ""}</td><td class="num">${number(l.tokIn ?? 0)}</td><td class="num">${l.tool === "(connection)" ? "-" : duration(l.ms ?? 0)}</td></tr>`;
  }
  body.insertAdjacentHTML("beforeend", html);
  log.count += slice.length;
  const left = log.shown.length - log.count;
  const more = $("#usage-log-more");
  more.hidden = left <= 0;
  more.textContent = t("showMoreLeft", left);
}

/** Whether the usage page is open. */
export const usageIsOpen = () => !$("#usage").hidden;

/**
 * The usage page opens from the activity panel, and closes back on the brain.
 * @param {boolean} open
 */
export function toggleUsage(open) {
  document.body.classList.toggle("page-open", open);
  $("#usage").hidden = !open;
  if (open) openUsage(true);
}

/** Wires the usage page: its periods, its filters, its "show more", and the link that opens it. */
export function setUpUsage() {
  $("#usage-log-search").addEventListener("input", filterLog);
  $("#usage-log-tool").addEventListener("change", filterLog);
  $("#usage-log-who").addEventListener("change", filterLog);
  $("#usage-log-more").addEventListener("click", showMoreLog);
  for (const button of $all("#usage-periods button")) button.addEventListener("click", () => {
    usage.days = Number(button.dataset.days);
    for (const other of $all("#usage-periods button")) other.classList.toggle("active", other === button);
    drawUsage();
  });
  $("#usage-reload").addEventListener("click", () => openUsage(true));
  // A cap reached, a judge that waits or was answered: its card follows.
  onJudgesDrawn(drawJudgesToday);
  $("#open-usage").addEventListener("click", () => toggleUsage(true));
  $("#usage-close").addEventListener("click", () => toggleUsage(false));
}
