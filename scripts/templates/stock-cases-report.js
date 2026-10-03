/* A stock cash-conversion page's numbers as a beamdswitch report.
 *
 * report(C, view) turns one company's case (C: the page's headline, context, source and its four
 * audited annual rows) and the page's current view ({ metric: "revenue" | "cash_margin" }) into the
 * plain-data report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as a
 * narrated Markdown deck. Every number comes from the rows the page charts, formatted with the
 * page's own formatters, so the deck says exactly what the page shows.
 */
/**
 * @typedef {{ fy: string, end: string, revenue: number, operating_cash_flow: number, cash_margin: number }} Row
 * @typedef {{ name: string, entity: string, source: string, fetched: string, title: string, headline: string, competitors: string,
 *   macro: string, swot: string, rows: Row[] }} Case
 * @typedef {"revenue" | "cash_margin"} Metric
 * @typedef {{ title: string, body: string, narration: string, notes?: string, key?: string }} Frame
 */
/** @param {any} root the global object @param {() => any} factory */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StockReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* The page's formatters: revenue in billions of US dollars, margins to one decimal. */
  /** @param {number} v */
  const money = (v) => "$" + (v / 1e9).toFixed(2) + "B";
  /** @param {number} v */
  const pct = (v) => v.toFixed(1) + "%";
  /* The same numbers, spoken. */
  /** @param {number} v */
  const sayMoney = (v) => (v / 1e9).toFixed(2) + " billion dollars";
  /** @param {number} v */
  const sayPct = (v) => v.toFixed(1) + " percent";
  /** @type {Record<Metric, { label: string, axis: string, fmt: (v: number) => string, say: (v: number) => string }>} */
  const METRICS = {
    revenue: { label: "Revenue", axis: "Annual revenue", fmt: money, say: sayMoney },
    cash_margin: { label: "Operating cash margin", axis: "Operating cash flow / revenue", fmt: pct, say: sayPct },
  };

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  /** @param {unknown} s */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  /** @param {unknown} s */
  const say = (s) => String(s ?? "")
    .replace(/\$(\d+(?:\.\d+)?)B\b/g, "$1 billion dollars").replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/[’‘]/g, "'").replace(/[“”"]/g, "")
    .replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  /** @param {string} iso */
  const sayDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  /** @param {string[]} xs */
  const list = (xs) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

  /** @param {Case} C @param {{ metric?: string }} [view] */
  function report(C, view = {}) {
    const whose = C.name + (C.name.endsWith("s") ? "'" : "'s");
    // @ts-expect-error a case always has its four annual rows
    const rows = C.rows, first = rows[0], /** @type {Row} */ last = rows.at(-1);
    /** @type {Metric} */
    // @ts-expect-error an unknown or missing metric reads undefined and falls back to revenue
    const metric = METRICS[view.metric] ? view.metric : "revenue";
    const other = metric === "revenue" ? "cash_margin" : "revenue";
    const span = `fiscal ${first.fy} to fiscal ${last.fy}`;
    const lo = rows.reduce((a, r) => (r.cash_margin < a.cash_margin ? r : a));
    const hi = rows.reduce((a, r) => (r.cash_margin > a.cash_margin ? r : a));

    const setup = [{
      title: `The data: ${md(whose)} four latest audited fiscal years, ${span}`,
      body: [
        `- Annual revenue and net cash from operating activities, as filed on Form 10-K or 20-F, for the four latest fiscal years with both figures.`,
        `- Fiscal years end on: ${rows.map((r) => r.end).join(", ")}.`,
        `- Source: [SEC Company Facts for ${md(C.entity)}](${C.source}). Fetched ${C.fetched}.`,
        `- Descriptive information, not investment advice.`,
      ].join("\n"),
      notes: "Where a fiscal year was refiled, the newest annual filing for that year-end is used.",
      narration: `The data are ${say(whose)} audited annual revenue and operating cash flow for ${span}, from the SEC Company Facts filings, fetched on ${sayDate(C.fetched)}. This is descriptive information, not investment advice.`,
    }, {
      title: "The context the page gives",
      body: [
        `- Competitors: ${md(C.competitors)}`,
        `- Macro: ${md(C.macro)}`,
        `- SWOT: ${md(C.swot)}`,
      ].join("\n"),
      narration: `${say(C.competitors)} ${say(C.macro)}`,
    }];

    const method = [{
      title: "Cash margin is operating cash flow as a share of revenue",
      body: [
        "$$ \\text{operating cash margin} = \\frac{\\text{operating cash flow}}{\\text{revenue}} \\times 100\\% $$",
        "",
        "- Both figures are for the same fiscal year; the margin is rounded to one decimal.",
        "- Revenue is in US dollars, shown in billions to two decimals.",
      ].join("\n"),
      narration: "For each fiscal year, the operating cash margin is the cash the business generated from operations, divided by its revenue for the same year. It shows how much of each dollar of sales turned into operating cash.",
    }];

    /** @param {Metric} id @returns {Frame} */
    const frameFor = (id) => {
      const m = METRICS[id];
      return {
        title: `${m.label}: ${md(rows.map((r) => m.fmt(r[id])).join(", "))} for ${span}`,
        body: [
          `| Fiscal year | Year end | ${m.label} |`,
          "| --- | --- | ---: |",
          ...rows.map((r) => `| ${r.fy} | ${r.end} | ${md(m.fmt(r[id]))} |`),
        ].join("\n"),
        narration: `${m.label} was ${list(rows.map((r) => `${m.say(r[id])} in fiscal ${r.fy}`))}.`,
      };
    };
    const results = [frameFor(metric), frameFor(other)];
    results[0].notes = `This is the measure selected on the page: ${METRICS[metric].axis}.`;

    const checks = [{
      title: "Each margin is the year's operating cash flow over its revenue",
      body: [
        "| Fiscal year | Operating cash flow | Revenue | Cash margin |",
        "| --- | ---: | ---: | ---: |",
        ...rows.map((r) => `| ${r.fy} | ${md(money(r.operating_cash_flow))} | ${md(money(r.revenue))} | ${md(pct(r.cash_margin))} |`),
      ].join("\n"),
      narration: `Each margin is recomputed from the filed figures. In fiscal ${last.fy}, operating cash flow of ${sayMoney(last.operating_cash_flow)} on revenue of ${sayMoney(last.revenue)} gives ${sayPct(last.cash_margin)}. Across the four years the margin ranged from ${sayPct(lo.cash_margin)} in fiscal ${lo.fy} to ${sayPct(hi.cash_margin)} in fiscal ${hi.fy}.`,
    }, {
      title: "Takeaway",
      key: `${md(C.headline)} Fiscal ${last.fy}: revenue ${md(money(last.revenue))}, operating cash margin ${md(pct(last.cash_margin))}.`,
      narration: `${say(C.headline)} In fiscal ${last.fy}, revenue was ${sayMoney(last.revenue)} and the operating cash margin was ${sayPct(last.cash_margin)}.`,
    }];

    return {
      meta: { title: C.title, subtitle: `Audited revenue and operating cash flow, ${span}`, date: `Fetched ${C.fetched}` },
      narration: `This talk reads ${say(whose)} audited revenue and operating cash flow for ${span}. Revenue is in US dollars and the cash margin is a percentage of revenue.`,
      setup, method, results, checks,
    };
  }

  return { METRICS, money, pct, report };
});
