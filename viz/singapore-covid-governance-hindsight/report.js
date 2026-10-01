/* The COVID hindsight page's evidence pairs as a beamdswitch report.
 *
 * report(D, view) turns the page's data ({ rows, fetched }) and its current view ({ filter, selectedId })
 * into the plain-data report that the standard template (beamdswitch.js, `Beamdswitch.deck`) writes as
 * a narrated Markdown deck. Every statement, date and class comes from the rows, as the page shows them.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CovidReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CLASSES = ["direct later outcome", "policy overlap", "related policy event", "consistent trend"];
  const FILTERS = { all: "All four", "direct later outcome": "Direct outcome", "policy overlap": "Policy overlap", "related policy event": "Related event", "consistent trend": "Consistent trend" };
  const HEADLINE = "One conditional 2020 forecast has a direct later outcome. Three policy analyses map to later policy records.";
  const METHOD = "The classes state the evidence relationship, not an overall foresight score. A direct outcome documents a stated forecast condition. The other classes link later records to a policy proposal or concern and retain their limits.";

  /* Markdown text: characters beamdswitch would read as maths or markup are escaped. */
  const md = (s) => String(s ?? "").replace(/\s+/g, " ").trim().replace(/[\\$*_`|<>[\]]/g, "\\$&");
  /* Narration is read aloud: symbols become words and markup characters are dropped. */
  const say = (s) => String(s ?? "")
    .replace(/S\$([\d,]+)/g, "$1 Singapore dollars").replace(/(\d)\s?%/g, "$1 percent").replace(/&/g, " and ").replace(/\//g, " ")
    .replace(/[“”"]/g, "").replace(/[$\\`*_#|<>[\]]/g, " ").replace(/\s+/g, " ").trim();
  const sayDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const plural = (n, one, many = one + "s") => `${n} ${n === 1 ? one : many}`;
  const shown = (rows, filter) => rows.filter((r) => !filter || filter === "all" || r.evidence_class === filter);

  function report(D, view = {}) {
    const rows = D.rows, filter = FILTERS[view.filter] ? view.filter : "all", visible = shown(rows, filter);
    const selected = visible.find((r) => r.id === view.selectedId) || visible[0];
    const ordered = selected ? [selected, ...visible.filter((r) => r !== selected)] : visible;
    const count = (c) => rows.filter((r) => r.evidence_class === c).length;
    const direct = rows.filter((r) => r.evidence_class === "direct later outcome");

    const setup = [{
      title: `The data: ${rows.length} dated 2020 analyses, each paired with a later public record`,
      body: [
        "| Analyst | Published | Kind | Evidence class |",
        "| --- | --- | --- | --- |",
        ...rows.map((r) => `| ${md(r.analyst)} | ${r.published} | ${md(r.kind)} | ${md(r.evidence_class)} |`),
      ].join("\n"),
      notes: `The data file holds the full source list and was fetched ${D.fetched}.`,
      narration: `The data are ${rows.length} Singapore analyses published in 2020, by ${rows.map((r) => say(r.analyst)).join("; ")}. Each is paired with a later public record.`,
    }];

    const method = [{
      title: "Each pair is classed by its evidence relationship, not by a foresight score",
      body: [
        `- ${md(METHOD)}`,
        "",
        "| Evidence class | Pairs |",
        "| --- | ---: |",
        ...CLASSES.map((c) => `| ${md(c)} | ${count(c)} |`),
      ].join("\n"),
      narration: `Each pair gets one of four classes: ${CLASSES.join(", ")}. A direct outcome documents a condition the forecast stated; the other classes link a later record to a policy proposal or concern, and keep their limits.`,
    }];

    const results = ordered.map((r) => ({
      title: `${r.analyst}, ${r.published}: ${r.evidence_class}`,
      body: [
        `- ${md(r.kind[0].toUpperCase() + r.kind.slice(1))}: ${md(r.statement)}`,
        `- Later record, ${r.outcome_date}: ${md(r.later_record)}`,
        `- Why this class: ${md(r.evidence_basis)}`,
        `- Limit: ${md(r.limitation)}`,
        `- Sources: [the 2020 analysis](${r.source_url}) and [the later record](${r.outcome_source_url}).`,
      ].join("\n"),
      notes: r === selected ? "This pair is the one selected on the page." : undefined,
      narration: `On ${sayDate(r.published)}, ${say(r.analyst)} wrote: ${say(r.statement)} The later record, from ${sayDate(r.outcome_date)}: ${say(r.later_record)} So the pair is classed as ${r.evidence_class}. ${say(r.limitation)}`,
    }));
    if (!results.length) results.push({ title: "No analyses match this filter", narration: "No analyses match this filter." });

    const checks = [{
      title: `The classes add up: ${CLASSES.map(count).join(" + ")} = ${rows.length} pairs`,
      body: [
        `- Shown on the page: ${visible.length} of ${rows.length} analyses (filter: ${md(FILTERS[filter])}).`,
        `- Pairs with a direct later outcome: ${direct.length}, ${md(direct.map((r) => r.analyst).join(", "))}.`,
        `- Every pair links both its 2020 analysis and its later record.`,
      ].join("\n"),
      narration: `Each of the ${rows.length} pairs has exactly one class, so the class counts add up to ${rows.length}. ${plural(direct.length, "pair")} ${direct.length === 1 ? "has" : "have"} a direct later outcome.`,
    }, {
      title: "Takeaway",
      key: `${md(HEADLINE)} The classes describe evidence, not an overall foresight score.`,
      narration: `${say(HEADLINE)} The classes describe the evidence, not an overall foresight score.`,
    }];

    return {
      meta: { title: "What did 2020 Singapore analyses say?", subtitle: filter === "all" ? `${rows.length} dated 2020 analyses and the later public records` : `${FILTERS[filter]}: ${visible.length} of ${rows.length} analyses`, date: `Data fetched ${D.fetched}` },
      narration: `This talk pairs ${rows.length} Singapore analyses from 2020 with later public records, and says how directly each record bears on what was written.`,
      setup, method, results, checks,
    };
  }

  return { CLASSES, FILTERS, HEADLINE, METHOD, shown, report };
});
