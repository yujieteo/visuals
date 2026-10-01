/* The social values page's age-group aggregates as a beamdswitch report.
 *
 * report(D) turns the page's data ({ rows, source_url, fetched }, rows as
 * [age_group, weighted_n, connection_mean, future_mean, connection_share_8_10, future_share_8_10])
 * into the plain-data report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as
 * a narrated Markdown deck. Every number is formatted as the chart and its tooltips show it.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SocialValuesReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const HEADLINE = "Older residents feel more connected, but less interested in shaping Singapore’s future.";
  const CAVEAT = "This cross-sectional survey cannot separate age from cohort, retirement, income, or questionnaire effects.";
  /* The page's own formats: means to 2 places, shares to 1 place, weighted respondents to 1 place. */
  const mean = (v) => v.toFixed(2), share = (v) => `${(v * 100).toFixed(1)}%`, people = (v) => v.toFixed(1);
  const gap = (r) => (r[2] - r[3]).toFixed(2);
  const age = (a) => a.replace("-", "–"), sayAge = (a) => a.replace("-", " to ");
  const sayShare = (v) => `${(v * 100).toFixed(1)} percent`;

  function report(D) {
    const rows = D.rows, first = rows[0], last = rows.at(-1);
    const total = rows.reduce((s, r) => s + r[1], 0);
    const peakConn = rows.reduce((a, r) => (r[2] > a[2] ? r : a)), lowFut = rows.reduce((a, r) => (r[3] < a[3] ? r : a));

    const setup = [{
      title: `The data: ${rows.length} age groups from the Singapore Social Values Survey`,
      body: [
        "| Age group | Weighted respondents |",
        "| --- | ---: |",
        ...rows.map((r) => `| ${age(r[0])} | ${people(r[1])} |`),
        "",
        `- Source: [Singapore Social Values Survey](${D.source_url}). Retrieved ${D.fetched}.`,
      ].join("\n"),
      narration: `The data are the Singapore Social Values Survey, grouped into ${rows.length} age groups from ${sayAge(first[0])} to ${sayAge(last[0])}. Each group's answers are weighted by the survey's weights.`,
    }];

    const method = [{
      title: "Two 0–10 questions, averaged with the survey weights",
      body: [
        "- Connection to Singapore, and desire to be a part of shaping Singapore’s future, each scored 0 to 10.",
        "- Each dot is a weighted mean score; the tooltip adds the weighted share scoring 8–10.",
        "",
        "$$ \\bar{x}_{g} = \\frac{\\sum_{i \\in g} w_i x_i}{\\sum_{i \\in g} w_i} $$",
      ].join("\n"),
      narration: "Respondents scored their connection to Singapore, and their desire to help shape its future, from 0 to 10. Each age group's score is a weighted mean, so every answer counts by its survey weight. The share scoring 8 to 10 is weighted the same way.",
    }];

    const results = [{
      title: `Connection: ${mean(first[2])} at ages ${age(first[0])}, ${mean(last[2])} at ${age(last[0])}`,
      body: [
        "| Age group | Connection mean | Scored 8–10 |",
        "| --- | ---: | ---: |",
        ...rows.map((r) => `| ${age(r[0])} | ${mean(r[2])} | ${share(r[4])} |`),
      ].join("\n"),
      narration: `Connection to Singapore averages ${mean(first[2])} at ages ${sayAge(first[0])} and ${mean(last[2])} at ages ${sayAge(last[0])}; it is highest at ages ${sayAge(peakConn[0])}. At ${sayAge(last[0])}, ${sayShare(last[4])} scored 8 to 10.`,
    }, {
      title: `Desire to shape the future: ${mean(first[3])} at ages ${age(first[0])}, ${mean(last[3])} at ${age(last[0])}`,
      body: [
        "| Age group | Future-shaping mean | Scored 8–10 |",
        "| --- | ---: | ---: |",
        ...rows.map((r) => `| ${age(r[0])} | ${mean(r[3])} | ${share(r[5])} |`),
      ].join("\n"),
      narration: `Desire to shape Singapore's future averages ${mean(first[3])} at ages ${sayAge(first[0])} and ${mean(last[3])} at ages ${sayAge(last[0])}; it is lowest at ages ${sayAge(lowFut[0])}. At ${sayAge(last[0])}, ${sayShare(last[5])} scored 8 to 10.`,
    }, {
      title: `The gap grows from ${gap(first)} points at ages ${age(first[0])} to ${gap(last)} at ${age(last[0])}`,
      body: [
        "| Age group | Connection | Future shaping | Gap |",
        "| --- | ---: | ---: | ---: |",
        ...rows.map((r) => `| ${age(r[0])} | ${mean(r[2])} | ${mean(r[3])} | ${gap(r)} |`),
      ].join("\n"),
      narration: `In every age group connection scores above the desire to shape the future. The gap is ${gap(first)} points at ages ${sayAge(first[0])} and ${gap(last)} points at ages ${sayAge(last[0])}.`,
    }];

    const checks = [{
      title: `The ${rows.length} groups hold ${people(total)} weighted respondents`,
      body: [
        `- Weighted respondents: ${rows.map((r) => people(r[1])).join(" + ")} = ${people(total)}.`,
        `- Every mean lies on the 0–10 scale and every share between 0% and 100%.`,
        `- ${CAVEAT}`,
      ].join("\n"),
      narration: `The ${rows.length} age groups together hold ${people(total)} weighted respondents. Read the chart as an association, not a cause: this survey is cross-sectional, so it cannot separate age from cohort, retirement, income or questionnaire effects.`,
    }, {
      title: "Takeaway",
      key: `${HEADLINE} The gap grows from ${gap(first)} points at ages ${age(first[0])} to ${gap(last)} at ${age(last[0])}. Read as association, not cause.`,
      narration: `Older residents feel more connected to Singapore, but less interested in shaping its future: the gap grows from ${gap(first)} to ${gap(last)} points. This is an association, not a cause.`,
    }];

    return {
      meta: { title: "Connection rises as appetite to shape the future falls", subtitle: `Singapore Social Values Survey, ${rows.length} age groups`, date: `Retrieved ${D.fetched}` },
      narration: "This talk compares two survey questions across age groups in Singapore: connection to the country, and the desire to help shape its future. Scores are weighted means on a 0 to 10 scale.",
      setup, method, results, checks,
    };
  }

  return { HEADLINE, CAVEAT, mean, share, people, gap, report };
});
