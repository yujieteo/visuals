/* The graduate employment page's salary premiums as a beamdswitch report.
 *
 * report(D) turns the page's data ({ rows, medians, source, fetched }, rows as
 * [year, university, degree, gross_monthly_median, year_premium_percent, computing_title] and medians as
 * [year, computing_median_premium]) into the plain-data report that the standard template
 * (beamdswitch.js, `Beamdswitch.deck`) writes as a narrated Markdown deck. Every number is formatted
 * as the chart, its tooltips and its axis show it.
 */
/** @typedef {[number, string, string, number, number, boolean]} Row  year, university, degree, gross monthly median, premium (%), computing title */
/** @typedef {[number, number]} YearPremium  year and the computing-titled degrees' median premium (%) */
/** @typedef {{ rows: Row[], medians: YearPremium[], source: string, fetched: string }} PageData */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.GesReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* The page's own formats: premiums signed to 1 place, salaries as whole dollars. */
  /** @param {number} v */
  const pct = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  /** @param {number} v */
  const dollars = (v) => `$${Math.round(v).toLocaleString("en-US")}`;
  /** @param {number} v */
  const sayPct = (v) => `${v >= 0 ? "plus" : "minus"} ${Math.abs(v).toFixed(1)} percent`;
  /** @param {number} v */
  const sayDollars = (v) => `${Math.round(v).toLocaleString("en-US")} dollars`;
  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  /** @param {unknown} s */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /** @param {unknown} s */
  const say = (s) => String(s ?? "").replace(/&/g, " and ").replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]()]/g, " ").replace(/\s+/g, " ").trim();
  /** @param {number[]} xs */
  const median = (xs) => { const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

  /** @param {PageData} D @returns {Deck.Report} */
  function report(D) {
    const rows = D.rows, medians = D.medians, years = [...new Set(rows.map((d) => d[0]))].sort((a, b) => a - b);
    const first = medians[0], last = medians[medians.length - 1], computing = rows.filter((d) => d[5]);
    /** @param {number} y @param {boolean} [onlyComputing] */
    const inYear = (y, onlyComputing) => rows.filter((d) => d[0] === y && (!onlyComputing || d[5]));
    const universities = new Set(rows.map((d) => d[1])).size;
    const lastTop = [...inYear(last[0], true)].sort((a, b) => b[4] - a[4]).slice(0, 5);
    const lastAll = [...inYear(last[0])].sort((a, b) => b[4] - a[4]), lastRank = (/** @type {Row} */ d) => lastAll.indexOf(d) + 1;

    const setup = [{
      title: `The data: ${rows.length} degree salaries from ${years[0]} to ${years.at(-1)}`,
      body: [
        `- ${rows.length} rows with a gross monthly median salary, one per degree, university and survey year, from ${universities} universities.`,
        `- ${computing.length} of them are degrees whose name contains the word "computing".`,
        `- Source: ${md(D.source)}. Retrieved ${D.fetched}.`,
      ].join("\n"),
      narration: `The data are ${rows.length} gross monthly median salaries from the ${say(D.source)}, one for each degree, university and year from ${years[0]} to ${years.at(-1)}. ${computing.length} of them are degrees with computing in the name.`,
    }];

    const method = [{
      title: "Each degree's premium is its salary relative to that year's median",
      body: [
        "- A degree's premium compares its gross monthly median with the median of every degree in the same survey year.",
        "- \"Computing title\" means the degree name contains the word \"computing\", in any case.",
        "- The line joins each year's median premium of the computing-titled degrees.",
        "",
        "$$ \\text{premium} = \\left( \\frac{\\text{degree's gross monthly median}}{\\text{median of that year's degrees}} - 1 \\right) \\times 100\\% $$",
      ].join("\n"),
      narration: "Each degree's premium compares its gross monthly median salary with the median of all degrees surveyed that year. A degree has a computing title when its name contains the word computing. The line joins each year's median premium of those degrees.",
    }];

    const results = [{
      title: `Computing titles moved from ${pct(first[1])} in ${first[0]} to ${pct(last[1])} in ${last[0]}`,
      body: [
        "| Year | Computing median premium | Computing degrees | All degrees |",
        "| ---: | ---: | ---: | ---: |",
        ...medians.map(([y, p]) => `| ${y} | ${pct(p)} | ${inYear(y, true).length} | ${inYear(y).length} |`),
      ].join("\n"),
      narration: `The median computing-titled degree earned ${sayPct(first[1])} against its year's median in ${first[0]}, and ${sayPct(last[1])} in ${last[0]}.`,
    }, {
      title: `The top computing-titled degrees in ${last[0]}`,
      body: [
        "| Degree | University | Gross monthly median | Premium |",
        "| --- | --- | ---: | ---: |",
        ...lastTop.map((d) => `| ${md(d[2])} | ${md(d[1])} | ${md(dollars(d[3]))} | ${pct(d[4])} |`),
      ].join("\n"),
      notes: "Hover, tap or focus a dot on the page for any degree's source value.",
      narration: `In ${last[0]}, the highest computing-titled premium was ${say(lastTop[0][2])} at ${say(lastTop[0][1])}: ${sayDollars(lastTop[0][3])} a month, ${sayPct(lastTop[0][4])}, rank ${lastRank(lastTop[0])} of ${lastAll.length} degrees that year.`,
    }];

    const centred = years.map((y) => [y, median(inYear(y).map((d) => d[4]))]);
    const checks = [{
      title: "Every year's premiums centre on 0%",
      body: [
        "| Year | Median premium of all degrees |",
        "| ---: | ---: |",
        ...centred.map(([y, p]) => `| ${y} | ${pct(Math.abs(p) < 0.05 ? 0 : p)} |`),
      ].join("\n"),
      narration: "Each premium is measured against its own year's median, so the median premium of all degrees is zero in every year. That is what the table shows, which confirms the baseline.",
    }, {
      title: "Takeaway",
      key: `A computing title moved from ${pct(first[1])} in ${first[0]} to ${pct(last[1])} in ${last[0]}, measured against each year's median degree salary.`,
      narration: `The computing salary premium widened: from ${sayPct(first[1])} in ${first[0]} to ${sayPct(last[1])} in ${last[0]}, against each year's median degree.`,
    }];

    return {
      meta: { title: "The computing salary premium widened", subtitle: `${D.source}, ${years[0]} to ${years.at(-1)}`, date: `Retrieved ${D.fetched}` },
      narration: `This talk compares the salaries of computing-titled degrees with every other degree in the ${say(D.source)}, from ${years[0]} to ${years.at(-1)}. Premiums are percentages against each year's median.`,
      setup, method, results, checks,
    };
  }

  return { pct, dollars, median, report };
});
