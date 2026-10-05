/* Universal Data Workbench: the SQL the workbench sends to DuckDB, as plain functions of names and readings.
 *
 * Every query the page runs is written here, so the Node checks run exactly the page's SQL against the pinned
 * engine (tests/engine.mjs). Names are always quoted, and text always passes as a SQL literal, never spliced.
 * Results are only DOUBLE, BIGINT, BOOLEAN and VARCHAR (an ENUM is cast to text), which read the same through the
 * page's streamed answers and the checks' whole ones.
 *
 *   setup        the engine's lockdown: memory limit, the Parquet extension from the page's own folder, then no
 *                extension, URL or file outside the registered files, and the configuration locked
 *   import       a CSV read as text (every value kept as written) or a Parquet file read with its own types,
 *                each row numbered in source order (the hidden row column), optionally a seeded sample
 *   readings     how a text column is read as a type: a full-match pattern, then a cast; the same expression
 *                counts parse failures and feeds every summary
 *   profile      per-column counts, parse failures, numeric, time and category summaries
 *
 * The page loads this file as a plain script (window.DWSql); the checks load it with require().
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DWSql = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /** A quoted SQL identifier. */
  const ident = (name) => `"${String(name).replace(/"/g, '""')}"`;
  /** A SQL string literal. */
  const literal = (text) => `'${String(text).replace(/'/g, "''")}'`;
  /** A SQL number literal, or NULL for a value that is not finite. */
  const number = (value) => (Number.isFinite(value) ? String(value) : "NULL");

  /* Registered files live under dw/, the only folder the engine may read once it is locked. */
  const FOLDER = "dw/";

  /* Text that stands for a missing value in many files. The workbench counts these apart and never treats them
   * as missing without approval. Compared in lower case after trimming. */
  const MARKERS = ["na", "n/a", "#n/a", "null", "none", "nan", "nil", "-", "--", "?", "."];
  const BOOLEAN_TRUE = ["true", "yes", "t", "y"];
  const BOOLEAN_FALSE = ["false", "no", "f", "n"];

  /* Full-match patterns (RE2) for each reading of text. */
  const PATTERN = {
    integer: "[+-]?[0-9]+",
    integerSep: "[+-]?[0-9]{1,3}(,[0-9]{3})+",
    decimal: "[+-]?([0-9]+[.]?[0-9]*|[.][0-9]+)([eE][+-]?[0-9]+)?",
    decimalSep: "[+-]?[0-9]{1,3}(,[0-9]{3})+([.][0-9]+)?",
    zeroPadded: "0[0-9]+",
    date: "[0-9]{4}-[0-9]{2}-[0-9]{2}",
    datetime: "[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)?",
    zoned: "[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)",
    time: "[0-9]{1,2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?",
    uuid: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}",
    // A value that starts like any date, date-time or time the workbench reads (a partial match, from the start).
    dateLike: "^([0-9]{1,4}[-/.][0-9]{1,2}[-/.][0-9]{1,4}|[0-9]{1,2} [A-Za-z]{3} [0-9]{4}|[A-Za-z]{3} [0-9]{1,2} [0-9]{4}|[0-9]{1,2}:[0-9]{2})",
  };

  /* Date layouts other than ISO 8601 that the workbench recognises. A layout is used only when it reads a column
   * on its own, or after approval when two layouts both fit (day and month order) or a column mixes layouts. */
  const DATE_FORMATS = [
    { id: "dmy-slash", format: "%d/%m/%Y", label: "DD/MM/YYYY", shape: "[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}" },
    { id: "mdy-slash", format: "%m/%d/%Y", label: "MM/DD/YYYY", shape: "[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}" },
    { id: "ymd-slash", format: "%Y/%m/%d", label: "YYYY/MM/DD", shape: "[0-9]{4}/[0-9]{1,2}/[0-9]{1,2}" },
    { id: "dmy-dash", format: "%d-%m-%Y", label: "DD-MM-YYYY", shape: "[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" },
    { id: "mdy-dash", format: "%m-%d-%Y", label: "MM-DD-YYYY", shape: "[0-9]{1,2}-[0-9]{1,2}-[0-9]{4}" },
    { id: "dmy-dot", format: "%d.%m.%Y", label: "DD.MM.YYYY", shape: "[0-9]{1,2}[.][0-9]{1,2}[.][0-9]{4}" },
    { id: "d-mon-y", format: "%d %b %Y", label: "D Mon YYYY", shape: "[0-9]{1,2} [A-Za-z]{3} [0-9]{4}" },
    { id: "mon-d-y", format: "%b %d %Y", label: "Mon D YYYY", shape: "[A-Za-z]{3} [0-9]{1,2} [0-9]{4}" },
  ];

  /* Values that files often use for "no value" in numeric fields. -1, -9.99 and -999 count only in a field whose
   * other values are all zero or more; 999 and above only when at least ten times the field's other maximum. */
  const SENTINELS = [-1, -9, -9.9, -9.99, -99, -99.9, -99.99, -999, -999.9, -9999, -99999, 999, 9999, 99999, 999999];

  const inList = (values) => values.map(literal).join(", ");
  const match = (expr, pattern) => `regexp_full_match(${expr}, ${literal(pattern)})`;

  /**
   * The statements that start every engine: its memory limit, the Parquet extension from the page's own folder,
   * then the lockdown. After it no statement may load an extension, read a URL or a file outside dw/, or change
   * the configuration.
   * @param {{ memoryLimitBytes: number, extensionRepository: string }} options
   */
  function setup({ memoryLimitBytes, extensionRepository }) {
    return [
      `SET memory_limit = ${literal(`${Math.max(64, Math.floor(memoryLimitBytes / 2 ** 20))}MiB`)}`,
      "SET threads = 1",
      `SET custom_extension_repository = ${literal(extensionRepository)}`,
      "LOAD parquet",
      "SET autoload_known_extensions = false",
      "SET autoinstall_known_extensions = false",
      `SET allowed_directories = [${literal(FOLDER)}]`,
      "SET enable_external_access = false",
      "SET lock_configuration = true",
    ];
  }

  /** The engine path of the n-th registered file: dw/<n>/<a safe file name>. */
  function filePath(n, name) {
    const safe = String(name).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "") || "file";
    return `${FOLDER}${n}/${safe}`;
  }

  /** The table function that reads a registered file. CSV reads every value as text; Parquet keeps its types. */
  function reader(kind, path, rejects) {
    if (kind === "parquet") return `read_parquet(${literal(path)})`;
    const store = rejects ? `, store_rejects = true, rejects_table = ${literal(rejects.table)}, rejects_scan = ${literal(rejects.scan)}` : "";
    return `read_csv(${literal(path)}, all_varchar = true${store})`;
  }

  /** The columns a file would give, before it is imported, read with the import's own options. */
  function describeFile(kind, path, rejects) {
    return `SELECT column_name, column_type FROM (DESCRIBE SELECT * FROM ${reader(kind, path, kind === "csv" ? rejects : undefined)})`;
  }

  /**
   * Import one registered file as a read-only base table. Each row gets its source position (1, 2, ...) in
   * rowColumn. A sample keeps a seeded reservoir of rows in source order; columns keeps only the named ones.
   * @param {{ kind: "csv" | "parquet", path: string, table: string, rowColumn: string, rejects?: { table: string, scan: string },
   *   columns?: string[] | null, sample?: { rows: number, seed: number } | null }} options
   */
  function importFile({ kind, path, table, rowColumn, rejects, columns, sample }) {
    const picked = columns && columns.length ? columns.map(ident).join(", ") : "*";
    const numbered = `SELECT row_number() OVER () AS ${ident(rowColumn)}, ${picked} FROM ${reader(kind, path, kind === "csv" ? rejects : undefined)}`;
    const body = sample
      ? `SELECT * FROM (${numbered}) USING SAMPLE reservoir(${Math.floor(sample.rows)} ROWS) REPEATABLE (${Math.floor(sample.seed)}) ORDER BY ${ident(rowColumn)}`
      : numbered;
    return `CREATE TABLE ${ident(table)} AS ${body}`;
  }

  /** The dialect DuckDB's CSV reader detects for a file, with the import's own options. */
  const csvDialect = (path) => `SELECT Delimiter AS delimiter, Quote AS quote, Escape AS escape, NewLineDelimiter AS newline_delimiter,
  SkipRows AS skip_rows, HasHeader AS has_header FROM sniff_csv(${literal(path)}, all_varchar = true, ignore_errors = true)`;
  /** Rows the CSV reader could not read, with their line number and the line as written. */
  const csvRejects = (rejects, limit = 20) =>
    `SELECT line::DOUBLE AS line, CAST(arg_min(error_type, column_idx) AS VARCHAR) AS error_type, arg_min(csv_line, column_idx) AS csv_line,
  arg_min(error_message, column_idx) AS error_message FROM ${ident(rejects)} GROUP BY line ORDER BY line LIMIT ${limit}`;
  const csvRejectCount = (rejects) => `SELECT count(DISTINCT line)::DOUBLE AS n FROM ${ident(rejects)}`;

  /** A Parquet file's schema (physical and logical types) and its size before compression. */
  const parquetSchema = (path) =>
    `SELECT name, type, converted_type, logical_type, num_children::DOUBLE AS num_children FROM parquet_schema(${literal(path)})`;
  const parquetSize = (path) =>
    `SELECT sum(total_uncompressed_size)::DOUBLE AS uncompressed, count(DISTINCT row_group_id)::DOUBLE AS row_groups FROM parquet_metadata(${literal(path)})`;
  const parquetRows = (path) => `SELECT num_rows::DOUBLE AS rows FROM parquet_file_metadata(${literal(path)})`;

  /** Drop a temporary table of the reader's, if it exists. */
  const dropTemp = (name) => `DROP TABLE IF EXISTS ${ident(name)}`;

  /** A table's columns in order, with DuckDB's type names. */
  const describeTable = (table) => `SELECT column_name, column_type FROM (DESCRIBE ${ident(table)})`;
  const rowCount = (table) => `SELECT count(*)::DOUBLE AS n FROM ${ident(table)}`;

  /* ---------- readings ---------- */

  /**
   * How a column's values are read for analysis. kind "source" uses a typed source value as it is (Parquet);
   * the others read text: "integer", "integer-sep" (thousands separators ","), "decimal", "decimal-sep",
   * "boolean", "date" (ISO), "date-format" (one layout of DATE_FORMATS), "date-formats" (ISO and one layout),
   * "datetime" (ISO, no zone), "datetime-zoned" (ISO with Z or an offset, ordered in UTC), "time", "text".
   * missingText and missingNumbers are values that approval turned into missing values.
   * @typedef {{ kind: string, format?: string, missingText?: string[], missingNumbers?: number[] }} Reading
   */

  /** The SQL type a reading produces, for summaries. */
  function readingType(reading, sourceType) {
    switch (reading.kind) {
      case "integer": case "integer-sep": case "decimal": case "decimal-sep": return "DOUBLE";
      case "boolean": return "BOOLEAN";
      case "date": case "date-format": case "date-formats": return "DATE";
      case "datetime": return "TIMESTAMP";
      case "datetime-zoned": return "TIMESTAMPTZ";
      case "time": return "TIME";
      case "source": return sourceType;
      default: return "VARCHAR";
    }
  }

  /** The expression that reads one column under a reading, before any value is turned into a missing one.
   * @param {string} column @param {Reading} reading */
  function parse(column, reading) {
    const x = ident(column), y = `trim(${x})`;
    switch (reading.kind) {
      case "source": return x;
      case "integer": return `CASE WHEN ${match(y, PATTERN.integer)} THEN TRY_CAST(${y} AS DOUBLE) END`;
      case "integer-sep": return `CASE WHEN ${match(y, PATTERN.integer)} OR ${match(y, PATTERN.integerSep)} THEN TRY_CAST(replace(${y}, ',', '') AS DOUBLE) END`;
      case "decimal": return `CASE WHEN ${match(y, PATTERN.decimal)} THEN TRY_CAST(${y} AS DOUBLE) END`;
      case "decimal-sep": return `CASE WHEN ${match(y, PATTERN.decimal)} OR ${match(y, PATTERN.decimalSep)} THEN TRY_CAST(replace(${y}, ',', '') AS DOUBLE) END`;
      case "boolean": return `CASE WHEN lower(${y}) IN (${inList(BOOLEAN_TRUE)}) THEN true WHEN lower(${y}) IN (${inList(BOOLEAN_FALSE)}) THEN false END`;
      case "date": return `CASE WHEN ${match(y, PATTERN.date)} THEN TRY_CAST(${y} AS DATE) END`;
      case "date-format": {
        const f = formatOf(reading.format);
        return `CASE WHEN ${match(y, f.shape)} THEN CAST(try_strptime(${y}, ${literal(f.format)}) AS DATE) END`;
      }
      case "date-formats": {
        const f = formatOf(reading.format);
        return `CASE WHEN ${match(y, PATTERN.date)} THEN TRY_CAST(${y} AS DATE) WHEN ${match(y, f.shape)} THEN CAST(try_strptime(${y}, ${literal(f.format)}) AS DATE) END`;
      }
      case "datetime": return `CASE WHEN ${match(y, PATTERN.datetime)} AND NOT ${match(y, PATTERN.zoned)} THEN TRY_CAST(${y} AS TIMESTAMP) END`;
      case "datetime-zoned": return `CASE WHEN ${match(y, PATTERN.zoned)} THEN TRY_CAST(${y} AS TIMESTAMPTZ) END`;
      case "time": return `CASE WHEN ${match(y, PATTERN.time)} THEN TRY_CAST(${y} AS TIME) END`;
      default: return x;
    }
  }

  function formatOf(id) {
    const f = DATE_FORMATS.find((d) => d.id === id);
    if (!f) throw new Error(`unknown date layout ${id}`);
    return f;
  }

  /** Whether a raw value counts as present: not NULL, not blank and not a missing-value marker (text sources). */
  function valued(column, textSource) {
    const x = ident(column);
    return textSource ? `(${x} IS NOT NULL AND trim(${x}) <> '' AND lower(trim(${x})) NOT IN (${inList(MARKERS)}))` : `(${x} IS NOT NULL)`;
  }

  /** The value used for analysis: the parsed value, with approved missing text and numbers turned into NULL.
   * @param {string} column @param {Reading} reading */
  function typed(column, reading) {
    let e = parse(column, reading);
    const text = reading.missingText ?? [], numbers = reading.missingNumbers ?? [];
    if (text.length) e = `CASE WHEN lower(trim(CAST(${ident(column)} AS VARCHAR))) IN (${inList(text.map((t) => t.toLowerCase()))}) THEN NULL ELSE ${e} END`;
    if (numbers.length) e = `CASE WHEN (${e}) IN (${numbers.map(number).join(", ")}) THEN NULL ELSE ${e} END`;
    return e;
  }

  /* ---------- profile ---------- */

  /**
   * Counts that decide how a text column reads, first pass: missing values, markers, numbers, yes or no, UUIDs,
   * lengths, and how many values look like a date or a time at all. The second pass (textDateStats) runs only on a
   * column where at least 5% of the values look like one, which keeps a numeric or text column to one cheap scan.
   */
  function textStats(table, column) {
    const x = ident(column), y = `trim(${x})`;
    const count = (cond) => `count(*) FILTER (WHERE ${cond})::DOUBLE`;
    return `SELECT
  count(*)::DOUBLE AS rows,
  ${count(`${x} IS NULL`)} AS nulls,
  ${count(`${x} IS NOT NULL AND ${y} = ''`)} AS blanks,
  ${count(`lower(${y}) IN (${inList(MARKERS)})`)} AS markers,
  ${count(match(y, PATTERN.integer))} AS int_plain,
  ${count(match(y, PATTERN.integerSep))} AS int_sep,
  ${count(match(y, PATTERN.decimal))} AS dec_plain,
  ${count(match(y, PATTERN.decimalSep))} AS dec_sep,
  ${count(match(y, PATTERN.zeroPadded))} AS zero_padded,
  ${count(`lower(${y}) IN (${inList([...BOOLEAN_TRUE, ...BOOLEAN_FALSE])})`)} AS bool,
  ${count(`length(${y}) = 36 AND ${match(y, PATTERN.uuid)}`)} AS uuid,
  ${count(`regexp_matches(${y}, ${literal(PATTERN.dateLike)})`)} AS date_like,
  coalesce(min(length(${x})), 0)::DOUBLE AS len_min,
  coalesce(max(length(${x})), 0)::DOUBLE AS len_max,
  coalesce(avg(length(${x})), 0)::DOUBLE AS len_mean
FROM ${ident(table)}`;
  }

  /** Counts of the second pass, for a column whose values look like dates or times: ISO dates, date-times and times, and each layout. */
  function textDateStats(table, column) {
    const x = ident(column), y = `trim(${x})`;
    const count = (cond) => `count(*) FILTER (WHERE ${cond})::DOUBLE`;
    const formats = DATE_FORMATS.map((f) => `${count(`${match(y, f.shape)} AND try_strptime(${y}, ${literal(f.format)}) IS NOT NULL`)} AS ${ident(`f_${f.id}`)}`);
    return `SELECT
  ${count(match(y, PATTERN.date))} AS date_shape,
  ${count(`${match(y, PATTERN.date)} AND TRY_CAST(${y} AS DATE) IS NOT NULL`)} AS date_iso,
  ${count(`${match(y, PATTERN.datetime)} AND NOT ${match(y, PATTERN.zoned)} AND TRY_CAST(${y} AS TIMESTAMP) IS NOT NULL`)} AS dt_naive,
  ${count(`${match(y, PATTERN.zoned)} AND TRY_CAST(${y} AS TIMESTAMPTZ) IS NOT NULL`)} AS dt_zoned,
  ${count(`${match(y, PATTERN.time)} AND TRY_CAST(${y} AS TIME) IS NOT NULL`)} AS time_iso,
  ${formats.join(",\n  ")}
FROM ${ident(table)}`;
  }

  /** The counts of the second pass for a column that skips it: no value looks like a date or a time. */
  const NO_DATES = Object.fromEntries(["date_shape", "date_iso", "dt_naive", "dt_zoned", "time_iso", ...DATE_FORMATS.map((f) => `f_${f.id}`)].map((k) => [k, 0]));

  /** Counts for a typed (Parquet) column. */
  const typedStats = (table, column) =>
    `SELECT count(*)::DOUBLE AS rows, count(*) FILTER (WHERE ${ident(column)} IS NULL)::DOUBLE AS nulls FROM ${ident(table)}`;

  /**
   * Distinct values present (markers and blanks left out for text). A query of its own: a distinct count holds
   * every distinct value at once, so it runs alone to keep the engine's peak memory low.
   */
  const distinctCount = (table, column, textSource) =>
    `SELECT count(*)::DOUBLE AS distinct_values FROM (SELECT DISTINCT ${ident(column)} FROM ${ident(table)} WHERE ${valued(column, textSource)})`;

  /** The text values present, by count: the markers a file uses for missing values. */
  const markerValues = (table, column) => {
    const y = `trim(${ident(column)})`;
    return `SELECT ${y} AS value, count(*)::DOUBLE AS n FROM ${ident(table)} WHERE lower(${y}) IN (${inList(MARKERS)}) GROUP BY value ORDER BY n DESC, value`;
  };

  /** The condition that leaves out text that approval turned into missing values. */
  function notApproved(column, reading) {
    const text = reading.missingText ?? [];
    return text.length ? ` AND lower(trim(CAST(${ident(column)} AS VARCHAR))) NOT IN (${inList(text.map((t) => t.toLowerCase()))})` : "";
  }

  /**
   * How the reading went: values present, values that do not read (parse failures), and values that approval
   * turned into missing ones (approved text, or numbers such as -999).
   */
  function readingCounts(table, column, reading, textSource) {
    const ok = valued(column, textSource);
    return `SELECT
  count(*) FILTER (WHERE ${ok})::DOUBLE AS valued,
  count(*) FILTER (WHERE ${ok}${notApproved(column, reading)} AND (${parse(column, reading)}) IS NULL)::DOUBLE AS failures,
  count(*) FILTER (WHERE ${ok} AND (${typed(column, reading)}) IS NULL AND NOT (${ok}${notApproved(column, reading)} AND (${parse(column, reading)}) IS NULL))::DOUBLE AS made_missing
FROM ${ident(table)}`;
  }

  /** Up to `limit` distinct values that do not read under the reading, most frequent first, with the first row. */
  function failureExamples(table, column, reading, rowColumn, textSource, limit = 20) {
    return `SELECT CAST(${ident(column)} AS VARCHAR) AS value, count(*)::DOUBLE AS n, min(${ident(rowColumn)})::DOUBLE AS first_row
FROM ${ident(table)} WHERE ${valued(column, textSource)}${notApproved(column, reading)} AND (${parse(column, reading)}) IS NULL
GROUP BY value ORDER BY n DESC, first_row LIMIT ${limit}`;
  }

  /** Values with an ISO date shape that name no real day, such as 2026-02-30: the most frequent, with the total. */
  function impossibleDates(table, column, limit = 10) {
    const y = `trim(${ident(column)})`;
    return `SELECT ${y} AS value, count(*)::DOUBLE AS n, (sum(count(*)) OVER ())::DOUBLE AS total FROM ${ident(table)}
WHERE ${match(y, PATTERN.date)} AND TRY_CAST(${y} AS DATE) IS NULL GROUP BY value ORDER BY n DESC, value LIMIT ${limit}`;
  }

  /** The finite values of a numeric expression, as the CTE w(v). */
  const finite = (table, e) => `w AS (SELECT v FROM (SELECT CAST(${e} AS DOUBLE) AS v FROM ${ident(table)}) WHERE v IS NOT NULL AND isfinite(v))`;

  /* A numeric column's finite values, read once into a temporary table that the summaries below share, so the
   * text is parsed once rather than once a query. */
  const NUMBERS = "__dw_numbers";
  const stageNumbers = (table, column, reading) => `CREATE OR REPLACE TEMP TABLE ${ident(NUMBERS)} AS WITH ${finite(table, typed(column, reading))} SELECT v FROM w`;
  const dropNumbers = `DROP TABLE IF EXISTS ${ident(NUMBERS)}`;
  const w = `w AS (SELECT v FROM ${ident(NUMBERS)})`;

  /**
   * Numeric summary of the staged values, in three queries so that no two of the aggregates that hold every value
   * (quantiles, the median absolute deviation) run at once: count, extremes, mean, spread, skewness and counts;
   * the quantiles; and the median absolute deviation.
   */
  function numericSummary() {
    return [
      `WITH ${w}
SELECT count(*)::DOUBLE AS n, min(v) AS min, max(v) AS max, avg(v) AS mean, stddev_samp(v) AS sd, skewness(v) AS skew,
  count(*) FILTER (WHERE v = 0)::DOUBLE AS zeros, count(*) FILTER (WHERE v < 0)::DOUBLE AS negatives,
  count(*) FILTER (WHERE v = round(v))::DOUBLE AS whole FROM w`,
      `WITH ${w}, q AS (SELECT quantile_cont(v, [0.01, 0.25, 0.5, 0.75, 0.99]) AS q FROM w)
SELECT q[1] AS p1, q[2] AS q1, q[3] AS median, q[4] AS q3, q[5] AS p99 FROM q`,
      `WITH ${w} SELECT mad(v) AS mad FROM w`,
    ];
  }

  /** Equal-width bins of the staged values between min and max, for the profile's small histogram. */
  function numericBins(min, max, bins = 20) {
    const span = max - min;
    if (!(span > 0)) return null;
    return `WITH ${w}
SELECT least(${bins - 1}, floor((v - ${number(min)}) / ${number(span)} * ${bins}))::DOUBLE AS bin, count(*)::DOUBLE AS n FROM w GROUP BY bin ORDER BY bin`;
  }

  /**
   * Unusual values in usable data: robust z = |x - median| / (1.4826 MAD) above 3.5, counted and the most extreme
   * shown. Nothing is removed.
   */
  function robustOutliers(median, mad, limit = 10) {
    if (!(mad > 0)) return null;
    const z = `(v - ${number(median)}) / (1.4826 * ${number(mad)})`;
    return `WITH ${w}, o AS (SELECT v, ${z} AS z FROM w WHERE abs(${z}) > 3.5)
SELECT (SELECT count(*) FROM o)::DOUBLE AS total, v AS value, any_value(z) AS z, count(*)::DOUBLE AS n FROM o
GROUP BY v ORDER BY abs(any_value(z)) DESC, v LIMIT ${limit}`;
  }

  /** The sentinel candidates a numeric column holds, with the extremes of its other values. */
  function sentinelCounts(table, column, reading) {
    const parsed = parse(column, { kind: reading.kind, format: reading.format });
    const list = SENTINELS.map(number).join(", ");
    return `WITH ${finite(table, parsed)}
SELECT (SELECT min(v) FROM w WHERE v NOT IN (${list})) AS other_min, (SELECT max(v) FROM w WHERE v NOT IN (${list})) AS other_max,
  v AS value, count(*)::DOUBLE AS n FROM w WHERE v IN (${list}) GROUP BY v ORDER BY v`;
  }

  /** Time summary: count, first and last value as text, distinct values and the span in days. */
  function timeSummary(table, column, reading, sourceType = "") {
    const type = readingType(reading, sourceType).toUpperCase();
    // A TIMESTAMPTZ converts to TIMESTAMP in UTC without the time-zone extension, which the engine does not load; a
    // time of day has no span in days.
    const span = type.startsWith("TIME") && !type.startsWith("TIMESTAMP") ? "NULL" : "date_diff('day', CAST(min(v) AS TIMESTAMP), CAST(max(v) AS TIMESTAMP))::DOUBLE";
    return `WITH w AS (SELECT ${typed(column, reading)} AS v FROM ${ident(table)})
SELECT count(v)::DOUBLE AS n, CAST(min(v) AS VARCHAR) AS min, CAST(max(v) AS VARCHAR) AS max,
  count(DISTINCT v)::DOUBLE AS distinct_values, ${span} AS span_days FROM w`;
  }

  /** Equal-width bins over time (dates and date-times), for the profile's small histogram. */
  function timeBins(table, column, reading, bins = 20) {
    const e = `epoch(CAST(${typed(column, reading)} AS TIMESTAMP))`;
    return `WITH w AS (SELECT ${e} AS v FROM ${ident(table)}), r AS (SELECT min(v) AS lo, max(v) AS hi FROM w)
SELECT least(${bins - 1}, floor((v - lo) / (hi - lo) * ${bins}))::DOUBLE AS bin, count(*)::DOUBLE AS n
FROM w, r WHERE v IS NOT NULL AND hi > lo GROUP BY bin ORDER BY bin`;
  }

  /** The most frequent values (as text), with the number of values seen once. */
  function topValues(table, column, reading, limit = 12) {
    return `WITH w AS (SELECT CAST(${typed(column, reading)} AS VARCHAR) AS v FROM ${ident(table)}), c AS (SELECT v, count(*)::DOUBLE AS n FROM w WHERE v IS NOT NULL GROUP BY v)
SELECT v AS value, n, (SELECT count(*) FROM c WHERE n = 1)::DOUBLE AS singletons FROM c ORDER BY n DESC, v LIMIT ${limit}`;
  }

  /** Repeated identifier values: how many values repeat one seen before, and the most repeated. */
  function duplicates(table, column, limit = 5) {
    const x = `CAST(${ident(column)} AS VARCHAR)`;
    return `WITH c AS (SELECT ${x} AS v, count(*)::DOUBLE AS n FROM ${ident(table)} WHERE ${ident(column)} IS NOT NULL GROUP BY v)
SELECT (SELECT coalesce(sum(n - 1), 0) FROM c WHERE n > 1)::DOUBLE AS repeats, v AS value, n FROM c WHERE n > 1 ORDER BY n DESC, v LIMIT ${limit}`;
  }

  /** The first values of a column in source order: examples for text and identifiers. */
  const firstValues = (table, column, rowColumn, limit = 3) =>
    `SELECT CAST(${ident(column)} AS VARCHAR) AS value FROM ${ident(table)} WHERE ${ident(column)} IS NOT NULL ORDER BY ${ident(rowColumn)} LIMIT ${limit}`;

  return {
    FOLDER, MARKERS, BOOLEAN_TRUE, BOOLEAN_FALSE, PATTERN, DATE_FORMATS, SENTINELS,
    ident, literal, setup, filePath, describeFile, importFile, csvDialect, csvRejects, csvRejectCount,
    parquetSchema, parquetSize, parquetRows, dropTemp, describeTable, rowCount, readingType, parse, typed, formatOf,
    textStats, textDateStats, NO_DATES, typedStats, distinctCount, markerValues, readingCounts, failureExamples, impossibleDates, stageNumbers, dropNumbers, numericSummary, numericBins,
    robustOutliers, sentinelCounts, timeSummary, timeBins, topValues, duplicates, firstValues,
  };
});
