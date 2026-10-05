/* Universal Data Workbench: the report of what was imported and inspected, as plain data.
 *
 * report(snapshot) turns the page's snapshot (the tables and their column profiles, never their rows) into the
 * report the kit writes as the Markdown record and the site's beamdswitch template writes as a narrated deck.
 * Names and values from the data go only into list items and table cells, escaped, and never into narration,
 * which beamdswitch reads aloud and which must hold plain words. Piece 5 replaces the deck with the full export
 * package; this one records the inspection.
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

  /** @param {any} d the page's snapshot */
  function report(d) {
    const tables = d.tables ?? [];
    const rows = tables.reduce((a, t) => a + t.rows, 0);
    const errors = (t) => t.rejected.count + t.profiled.reduce((a, c) => a + c.errors.reduce((b, e) => b + e.count, 0), 0);
    const open = (t) => t.profiled.reduce((a, c) => a + c.suggestions.length, 0);
    const subtitle = tables.length ? `${count(tables.length, "table", "tables")}, ${count(rows, "row", "rows")}` : "No table imported yet";
    return {
      meta: { title: "Universal Data Workbench: import and inspect", subtitle, voice: "bf_emma" },
      narration: tables.length ? `This deck records ${count(tables.length, "table", "tables")} imported and inspected on one device.` : "This deck records an empty workbench: no table is imported yet.",
      setup: [{
        title: "What was imported",
        body: tables.length ? tables.map((t) => `- ${cell(t.name)}: ${cell(t.file.name)}, ${count(t.rows, "row", "rows")}, ${count(t.columns, "column", "columns")}; ${t.sample ? `a seeded sample (seed ${t.sample.seed})` : t.columnsKept ? `${t.columnsKept.length} columns kept` : "all rows"}; ${t.status}${t.file.sha256 ? `; SHA-256 ${t.file.sha256}` : ""}`).join("\n") : "- Nothing yet. Choose a CSV or Parquet file, or open an example.",
        narration: tables.length ? `${count(tables.length, "table was", "tables were")} imported, with ${count(rows, "row", "rows")} in all. The files stayed on the device.` : "No file was imported yet.",
      }],
      method: [{
        title: "How each column is read",
        body: [
          "- A CSV is imported as text, every value as written; a Parquet file keeps its own types.",
          "- A column reads as a type when at least 95% of the values present fit it: yes or no, whole number, decimal, ISO date, ISO date-time, time, or one other date layout. Else it is categorical (at most 1,000 levels, under half distinct) or text.",
          "- Empty values and markers such as NA count as missing apart; nothing becomes missing without approval.",
          "- Unusual values: robust z = |x − median| / (1.4826 × MAD) above 3.5. They stay in the data.",
          "- Roles: measure, identifier, category, ordered category, time, event label, interval start or end, unknown. A storage type alone never makes a measure.",
          `- Engine: DuckDB ${cell(d.engine?.duckdb)} (DuckDB-WASM ${cell(d.engine?.duckdbWasm)}) in this browser, memory budget ${cell(d.engine?.budget)}.`,
        ].join("\n"),
        narration: "A column is read as a type when at least ninety five percent of its values fit that type. Missing values, markers and unusual values are counted, and none is removed or filled.",
      }],
      results: tables.length ? tables.map((t) => ({
        title: `${cell(t.name)}: ${count(t.rows, "row", "rows")}`,
        body: [
          "| Column | Read as | Fits | Role | Missing | Distinct |",
          "| --- | --- | --- | --- | --- | --- |",
          ...t.profiled.map((c) => `| ${cell(c.name)} | ${LABEL[c.type] ?? cell(c.type)} | ${pct(c.share)} | ${cell(c.role)} | ${n(c.missing.nulls + c.missing.blanks + c.missing.markers + (c.missing.madeMissing ?? 0))} | ${n(c.distinct)} |`),
          "",
          ...(t.rejected.count ? [`- ${count(t.rejected.count, "line", "lines")} of the CSV could not be read and are listed in the page.`] : []),
          ...t.profiled.flatMap((c) => c.errors.map((e) => `- ${cell(c.name)}: ${cell(e.text)}`)),
          ...(t.notProfiled.length ? [`- Not profiled: ${t.notProfiled.map(cell).join(", ")}`] : []),
        ].join("\n"),
        narration: `This table has ${count(t.rows, "row", "rows")} and ${count(t.columns, "column", "columns")}. ${errors(t) ? `${count(errors(t), "value or line is", "values or lines are")} suspected data errors.` : "No suspected data error was found."} ${open(t) ? `${count(open(t), "correction waits", "corrections wait")} for approval.` : ""}`,
      })) : [{ title: "No table yet", body: "- Import a file or open an example to see its profile.", narration: "There is no table to profile yet." }],
      checks: [{
        title: "Conversions and what comes next",
        body: [
          ...(d.log?.length ? d.log.map((line, i) => `${i + 1}. ${cell(line)}`) : ["- No conversion yet."]),
          "",
          `- Still to come: ${(d.pieces ?? []).map((p) => cell(p.title)).join("; ")}.`,
        ].join("\n"),
        narration: `The log records ${count(d.log?.length ?? 0, "conversion or choice", "conversions or choices")}. This is a preview: charts, statistics, publication figures, the export package, SQL and the phone checks are still to come.`,
        key: tables.length && tables.every((t) => t.status === "complete") ? "Every value stays as written; each change is approved and logged." : "The inspection is not complete yet.",
      }],
    };
  }

  return { report };
});
