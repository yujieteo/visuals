/* Universal Data Workbench: the report of what was imported and inspected, as plain data.
 *
 * report(snapshot) turns the page's snapshot (the tables and their column profiles, never their rows) into the
 * report the kit writes as the Markdown record and the site's beamdswitch template writes as a narrated deck.
 * Names and values from the data go only into list items and table cells, escaped, and never into narration,
 * which beamdswitch reads aloud and which must hold plain words. The export package's deck.md, with the
 * highlighted figures, is src/package.js's; this one records the inspection, the accounting of each table's charts and its findings: the family of
 * hypotheses with its counts, and each list's highlights with their adjusted p-values.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWReport = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const whole = new Intl.NumberFormat("en-US");
  const n = (x) => (Number.isFinite(x) ? whole.format(Math.round(x)) : "–");
  const count = (x, one, many) => `${n(x)} ${x === 1 ? one : many}`;
  const pct = (share) => (Number.isFinite(share) ? `${(Math.floor(share * 1000) / 10).toFixed(1)}%` : "–");
  /** Text from the data inside Markdown: no line breaks, no table bars, no markup that starts a line. */
  const cell = (text) => String(text ?? "").replace(/\s+/g, " ").replace(/\|/g, "\\|").replace(/^([#:>-])/, "\\$1").slice(0, 120);
  const LABEL = { integer: "integer", decimal: "decimal", boolean: "boolean", date: "date", datetime: "date-time", time: "time", categorical: "categorical", text: "text", empty: "no values", unsupported: "not analysed" };

  /** A frame of the derived views and tables and their transformation records, when there are any. @param {any} x */
  function transformFrames(x) {
    if (!x?.records?.length) return [];
    const rows = (r) => (r.rowsOut === null || r.rowsOut === undefined ? "" : `${r.rowsIn.length ? `${r.rowsIn.map((i) => n(i.rows)).join(" + ")} → ` : ""}${count(r.rowsOut, "row", "rows")}`);
    return [{
      title: "Transformations",
      body: [
        ...x.derived.map((o) => `- ${cell(o.name)}: a derived ${o.kind} from ${cell(o.inputs.join(", "))}, ${count(o.rows, "row", "rows")}; records ${cell(o.lineage.join(", "))}${o.analysed ? "; analysed as its own table and family" : ""}`),
        "",
        "| Record | Kind | Inputs | Rows | Joins |",
        "| --- | --- | --- | --- | --- |",
        ...x.records.map((r) => `| ${r.id} | ${cell(r.kind)} | ${cell(r.inputs.join(", "))} | ${rows(r)} | ${r.joins.filter((j) => j.computed && j.kind !== "cross").map((j) => `${cell(j.left)}–${cell(j.right)}: ${n(j.unmatchedLeft.keys)} and ${n(j.unmatchedRight.keys)} unmatched keys, factor ${Number(j.factor.toFixed(3))}${j.flagged ? " (rows repeated)" : ""}`).join("; ") || "–"} |`),
      ].join("\n"),
      narration: `${count(x.records.length, "transformation is", "transformations are")} recorded, each with its inputs, its SQL and its rows in and out. Joins list their unmatched and repeated keys.`,
    }];
  }

  /** @param {any} d the page's snapshot */
  function report(d) {
    const tables = d.tables ?? [];
    const rows = tables.reduce((a, t) => a + t.rows, 0);
    const errors = (t) => t.rejected.count + t.profiled.reduce((a, c) => a + c.errors.reduce((b, e) => b + e.count, 0), 0);
    const open = (t) => t.profiled.reduce((a, c) => a + c.suggestions.length, 0);
    const subtitle = tables.length ? `${count(tables.length, "table", "tables")}, ${count(rows, "row", "rows")}` : "No table imported yet";
    return {
      meta: { title: "Universal Data Workbench: import, inspect, chart and rank", subtitle, voice: "bf_emma" },
      narration: tables.length ? `This deck records ${count(tables.length, "table", "tables")} imported and inspected on one device.` : "This deck records an empty workbench: no table is imported yet.",
      setup: [{
        title: "What was imported",
        body: tables.length ? tables.map((t) => t.derived ? `- ${cell(t.name)}: a derived table, ${cell(t.derived.from)}, made by the transformation records ${cell(t.derived.records.join(", "))}; ${count(t.rows, "row", "rows")}, ${count(t.columns, "column", "columns")}; ${t.status}` : `- ${cell(t.name)}: ${cell(t.file.name)}, ${count(t.rows, "row", "rows")}, ${count(t.columns, "column", "columns")}; ${t.sample ? `a seeded sample (seed ${t.sample.seed})` : t.columnsKept ? `${t.columnsKept.length} columns kept` : "all rows"}; ${t.status}${t.file.sha256 ? `; SHA-256 ${t.file.sha256}` : ""}`).join("\n") : "- Nothing yet. Choose a CSV or Parquet file, or open an example.",
        narration: tables.length ? `${count(tables.length, "table was", "tables were")} imported, with ${count(rows, "row", "rows")} in all. The files stayed on the device.` : "No file was imported yet.",
      }],
      method: [{
        title: "How each column is read",
        body: [
          "- A CSV is imported as text, every value as written; a Parquet file keeps its own types.",
          "- A column reads as a type when at least 95% of the values present fit it: yes or no, whole number, decimal, ISO date, ISO date-time, time, or one other date layout. Else it is categorical (at most 1,000 levels, under half distinct) or text.",
          "- Missing: empty values, and values made missing by approval. Markers such as NA are counted apart; nothing becomes missing without approval.",
          "- Unusual values: robust z = |x − median| / (1.4826 × MAD) above 3.5. They stay in the data.",
          "- Roles: measure, identifier, category, ordered category, time, event label, interval start or end, unknown. A storage type alone never makes a measure.",
          "- Charts: grammar v1. Each column is a measure (Q), a category (C), a time (T), a label (L) or excluded with its reason; every single-field chart, pair chart and timeline of those classes is a candidate, valid, excluded, failed or incomplete.",
          "- Statistics: test catalogue v1. Each table is one family of hypotheses, listed before any test; a test runs only when its checks pass, and raw p-values are adjusted by Benjamini–Yekutieli over the tests that ran. An adjusted p-value at or below 0.05 is exploratory evidence. Without study details, independence is assumed, not confirmed, and tests are refused where the data contradicts it.",
          "- Ranking: unusualness = usefulness × the share of complete rows − penalties. Two lists, unusual patterns and statistically supported patterns, each with distinct highlights.",
          `- Engine: DuckDB ${cell(d.engine?.duckdb)} (DuckDB-WASM ${cell(d.engine?.duckdbWasm)}) in this browser, memory budget ${cell(d.engine?.budget)}.`,
          ...(d.publication ? [`- Publication figures: the ${cell(d.publication.preset)} preset, ${d.publication.width ? `${n(d.publication.width)} mm wide` : "each chart's own width"}, ${n(d.publication.dpi)} dpi PNG, ${cell(d.publication.font)}; its rules: ${n(d.publication.rules.filter((/** @type {any} */ r) => r.status === "verified").length)} read in their source, ${n(d.publication.rules.filter((/** @type {any} */ r) => r.status === "unverified").length)} unverified, ${n(d.publication.rules.filter((/** @type {any} */ r) => r.status === "workbench").length)} the workbench's own. No compliance is claimed while a check is unverified.`] : []),
        ].join("\n"),
        narration: "A column is read as a type when at least ninety five percent of its values fit that type. Missing values, markers and unusual values are counted, and none is removed or filled.",
      }, ...transformFrames(d.transforms)],
      results: tables.length ? tables.map((t) => ({
        title: `${cell(t.name)}: ${count(t.rows, "row", "rows")}`,
        body: [
          "| Column | Read as | Fits | Role | Missing | Markers | Distinct |",
          "| --- | --- | --- | --- | --- | --- | --- |",
          ...t.profiled.map((c) => `| ${cell(c.name)} | ${LABEL[c.type] ?? cell(c.type)} | ${pct(c.share)} | ${cell(c.role)} | ${n(c.missing.missing)} | ${n(c.missing.markers)} | ${n(c.distinct)} |`),
          "",
          ...(t.rejected.count ? [`- ${count(t.rejected.count, "line", "lines")} of the CSV could not be read and are listed in the page.`] : []),
          ...t.profiled.flatMap((c) => c.errors.map((e) => `- ${cell(c.name)}: ${cell(e.text)}`)),
          ...(t.notProfiled.length ? [`- Not profiled: ${t.notProfiled.map(cell).join(", ")}`] : []),
          ...(t.charts ? [`- Charts (grammar v${cell(t.charts.grammar)}): ${count(t.charts.total, "candidate", "candidates")} from ${t.charts.fields.q} measures, ${t.charts.fields.c} categories, ${t.charts.fields.t} times and ${t.charts.fields.l} labels; ${n(t.charts.valid)} valid, ${n(t.charts.excluded)} excluded, ${n(t.charts.failed)} failed, ${n(t.charts.incomplete)} incomplete${t.charts.edited ? `; ${n(t.charts.edited)} edited by you` : ""}.`] : ["- Charts: not generated yet."]),
          ...findings(t.findings),
        ].join("\n"),
        narration: `This table has ${count(t.rows, "row", "rows")} and ${count(t.columns, "column", "columns")}. ${errors(t) ? `${count(errors(t), "value or line is", "values or lines are")} suspected data errors.` : "No suspected data error was found."} ${open(t) ? `${count(open(t), "correction waits", "corrections wait")} for approval.` : ""}${t.charts ? ` ${count(t.charts.valid, "chart is", "charts are")} valid.` : ""}${t.findings?.family?.status === "complete" ? ` The statistics tested ${count(t.findings.family.m, "hypothesis", "hypotheses")}, and ${count(t.findings.family.flagged, "has", "have")} an adjusted p value at or below 0.05, which is exploratory evidence, not proof.` : ""}`,
      })) : [{ title: "No table yet", body: "- Import a file or open an example to see its profile.", narration: "There is no table to profile yet." }],
      checks: [{
        title: "Conversions and what comes next",
        body: [
          ...(d.log?.length ? d.log.map((line, i) => `${i + 1}. ${cell(line)}`) : ["- No conversion yet."]),
          "",
          `- Still to come: ${(d.pieces ?? []).map((p) => cell(p.title)).join("; ")}.`,
        ].join("\n"),
        narration: `The log records ${count(d.log?.length ?? 0, "conversion or choice", "conversions or choices")}. This is a preview: the phone checks and the acceptance tests are still to come.`,
        key: tables.length && tables.every((t) => t.status === "complete") ? "Every value stays as written; each change is approved and logged." : "The inspection is not complete yet.",
      }],
    };
  }

  /** What the study details say of independence, in words. */
  function independence(study) {
    if (study?.independent === "no" || String(study?.repeated ?? "").startsWith("field:") || study?.design === "clustered") return "the tests of independent rows are off, as the study details say";
    return study?.independent === "yes" ? "independence stated by you" : "independence assumed, not confirmed";
  }

  /**
   * A table's findings as list items: the family's counts, then each list's highlights (titles name fields, so they
   * stay in the body, escaped, and never in narration).
   * @param {any} f the findings of the snapshot
   */
  function findings(f) {
    if (!f?.family) return ["- Findings: the statistics have not run yet."];
    const fam = f.family;
    const head = `- Findings (catalogue v${cell(fam.catalogue)}), family ${cell(fam.name)}, run ${n(fam.run)}: ${count(fam.size, "hypothesis", "hypotheses")}, ${n(fam.m)} tested, ${n(fam.notTested)} not tested; ${fam.status === "complete" ? `${n(fam.flagged)} with an adjusted p-value at or below 0.05 (Benjamini–Yekutieli)` : "incomplete, so no adjusted p-values"}; ${independence(fam.study)}.`;
    if (!f.unusual) return [head];
    const p = (x) => (x < 1e-4 ? (x === 0 ? "< 1e-300" : x.toExponential(1)) : String(Math.round(x * 1e4) / 1e4));
    return [head,
      `- Unusual patterns (${n(f.unusual.charts)} charts), highlighted: ${f.unusual.highlighted.length ? f.unusual.highlighted.map(cell).join("; ") : "none"}.`,
      `- Statistically supported patterns (${n(f.supported.charts)} charts), highlighted: ${f.supported.highlighted.length ? f.supported.highlighted.map((t, i) => `${cell(t)} (adjusted p-value ${p(f.supported.adjusted[i])})`).join("; ") : "none"}.`];
  }

  return { report };
});
