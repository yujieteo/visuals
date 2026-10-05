/* Universal Data Workbench: the SQL that computes what each chart of grammar v1 draws.
 *
 * Like src/sql.js, every chart query the page runs is written here as a plain function of names, readings and
 * numbers, so the Node checks run exactly the page's SQL against the pinned engine. Each query reads the imported
 * table through the column's reading (Sql.typed), keeps only rows where every encoded field has a value present
 * (blanks, markers and values that do not read are left out and counted), and returns only DOUBLE, BOOLEAN and
 * VARCHAR columns.
 *
 *   relation    the rows a chart uses: r (the source row), then one column per channel, by alias
 *   numbers     count, extremes and quartiles of a measure (Freedman–Diaconis bins, axes)
 *   histogram   counts per bin; bins2d counts per cell of a 40 × 40 grid
 *   box         Tukey box statistics per group, then the values beyond the whiskers (at most 200 a box)
 *   levels      the most frequent levels of a category, with the count of every level
 *   grouped     counts, means, standard deviations and sums per group, period or cell
 *   timeRange   the first and last time and how many values are known only to the year or month
 *   check       the complete rows and whether an encoded field holds one value only (the ranking's rejections)
 *   points      the points of a scatter plot: all of them, or a seeded sample of 50,000
 *   events      a page of timeline events, duplicates merged; intervalCheck the share of ends at or after starts
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"));
  else root.DWChartSql = factory(root.DWSql);
})(typeof self !== "undefined" ? self : this, function (Sql) {
  "use strict";

  const { ident, literal, number } = Sql;

  /**
   * A field as a chart reads it: its name, class, reading and type from the profile.
   * @typedef {{ name: string, cls: string, reading: any, textSource: boolean, type: string, precision?: string | null, log?: boolean }} Field
   */

  /** The expression of a measure: a finite DOUBLE, or its base-10 logarithm on a log axis; NULL when not present. @param {Field} f */
  function measure(f) {
    const v = `CAST((${Sql.typed(f.name, f.reading)}) AS DOUBLE)`;
    const ok = `${Sql.valued(f.name, f.textSource)} AND isfinite(${v})${f.log ? ` AND ${v} > 0` : ""}`;
    return `CASE WHEN ${ok} THEN ${f.log ? `log10(${v})` : v} END`;
  }

  /** A category's label as text and its sort key (a number for numbers and dates, else NULL). @param {Field} f */
  function category(f) {
    const typed = `(${Sql.typed(f.name, f.reading)})`;
    const ok = Sql.valued(f.name, f.textSource);
    if (f.type === "integer" || f.type === "decimal") {
      const v = `CAST(${typed} AS DOUBLE)`;
      return {
        label: `CASE WHEN ${ok} AND isfinite(${v}) THEN (CASE WHEN ${v} = round(${v}) AND abs(${v}) < 1e15 THEN CAST(CAST(${v} AS BIGINT) AS VARCHAR) ELSE CAST(${v} AS VARCHAR) END) END`,
        key: `CASE WHEN ${ok} AND isfinite(${v}) THEN ${v} END`,
      };
    }
    if (f.type === "date" || f.type === "datetime") return { label: `CASE WHEN ${ok} THEN CAST(${typed} AS VARCHAR) END`, key: `CASE WHEN ${ok} THEN epoch(CAST(${typed} AS TIMESTAMP)) END` };
    if (f.type === "boolean") return { label: `CASE WHEN ${ok} THEN CAST(${typed} AS VARCHAR) END`, key: `CASE WHEN ${ok} THEN CAST(CAST(${typed} AS INTEGER) AS DOUBLE) END` };
    return { label: `CASE WHEN ${ok} THEN CAST(${typed} AS VARCHAR) END`, key: "NULL::DOUBLE" };
  }

  /** A time field: the TIMESTAMP that orders it (UTC for zoned values), its precision, a qualifier flag and the value as written. @param {Field} f */
  function time(f) {
    const ok = Sql.valued(f.name, f.textSource);
    const typed = `(${Sql.typed(f.name, f.reading)})`;
    const t = f.precision === "year" ? `CAST(make_date(CAST(${typed} AS INTEGER), 1, 1) AS TIMESTAMP)` : `CAST(${typed} AS TIMESTAMP)`;
    const precision = f.precision === "mixed" ? Sql.partialPrecision(f.name) : literal(f.precision ?? "day");
    return {
      t: `CASE WHEN ${ok} THEN ${t} END`,
      precision,
      qualified: f.precision === "mixed" ? Sql.partialQualified(f.name) : "false",
      raw: `trim(CAST(${ident(f.name)} AS VARCHAR))`,
    };
  }

  /** A label: the value as written, trimmed. @param {Field} f */
  const label = (f) => `CASE WHEN ${Sql.valued(f.name, f.textSource)} THEN trim(CAST(${ident(f.name)} AS VARCHAR)) END`;

  /**
   * The rows a chart uses, as a subquery with r and one column per alias. `require` names the aliases that must not
   * be NULL; `either` names aliases of which at least one must not be NULL (interval timelines).
   * @param {{ table: string, rowColumn: string, columns: Record<string, string>, require: string[], either?: string[] }} o
   */
  function relation(o) {
    const cols = Object.entries(o.columns).map(([alias, expr]) => `${expr} AS ${ident(alias)}`);
    const conds = o.require.map((a) => `${ident(a)} IS NOT NULL`);
    if (o.either?.length) conds.push(`(${o.either.map((a) => `${ident(a)} IS NOT NULL`).join(" OR ")})`);
    return `SELECT * FROM (SELECT ${ident(o.rowColumn)}::DOUBLE AS r, ${cols.join(", ")} FROM ${ident(o.table)})${conds.length ? ` WHERE ${conds.join(" AND ")}` : ""}`;
  }

  /** Count, extremes and quartiles of the given measure aliases, over the rows of a relation. @param {string} rel @param {string[]} aliases */
  function numbers(rel, aliases) {
    const parts = aliases.flatMap((a) => [`min(${ident(a)}) AS ${ident(`${a}_lo`)}`, `max(${ident(a)}) AS ${ident(`${a}_hi`)}`,
      `quantile_cont(${ident(a)}, 0.25) AS ${ident(`${a}_q1`)}`, `quantile_cont(${ident(a)}, 0.75) AS ${ident(`${a}_q3`)}`]);
    return `WITH d AS (${rel}) SELECT count(*)::DOUBLE AS n, ${parts.join(", ")} FROM d`;
  }

  /** Counts per equal-width bin of x (bins numbered from 0), per facet f when the relation has one. */
  function histogram(rel, lo, width, bins, facet) {
    const bin = `least(${bins - 1}, greatest(0, floor((x - ${number(lo)}) / ${number(width)})))::DOUBLE`;
    return `WITH d AS (${rel}) SELECT ${facet ? "f, " : ""}${bin} AS bin, count(*)::DOUBLE AS n FROM d GROUP BY ALL ORDER BY ALL`;
  }

  /** Counts per cell of a grid over x and y (cells numbered from 0). */
  function bins2d(rel, x, y, cells, facet) {
    const cell = (a, lo, w, n) => `least(${n - 1}, greatest(0, floor((${a} - ${number(lo)}) / ${number(w)})))::DOUBLE`;
    return `WITH d AS (${rel}) SELECT ${facet ? "f, " : ""}${cell("x", x.lo, x.width, cells[0])} AS i, ${cell("y", y.lo, y.width, cells[1])} AS j, count(*)::DOUBLE AS n FROM d GROUP BY ALL ORDER BY ALL`;
  }

  /* The groups of a box plot: the relation's f and g, or NULL when it has none. */
  const keys = (facet, group) => `${facet ? "f" : "NULL::VARCHAR AS f"}, ${group ? "g" : "NULL::VARCHAR AS g"}`;
  const same = "d.f IS NOT DISTINCT FROM k.f AND d.g IS NOT DISTINCT FROM k.g";

  /**
   * Tukey box statistics of x per facet f and group g: count, mean, quartiles, the whiskers (the most extreme values
   * within 1.5 × IQR of the quartiles) and how many values lie beyond them.
   */
  function box(rel, facet, group, whisker = 1.5) {
    return `WITH d0 AS (${rel}), d AS (SELECT ${keys(facet, group)}, x FROM d0),
s AS (SELECT f, g, count(*)::DOUBLE AS n, avg(x) AS mean, quantile_cont(x, [0.25, 0.5, 0.75]) AS q FROM d GROUP BY f, g),
k AS (SELECT f, g, n, mean, q[1] AS q1, q[2] AS med, q[3] AS q3, q[1] - ${number(whisker)} * (q[3] - q[1]) AS flo, q[3] + ${number(whisker)} * (q[3] - q[1]) AS fhi FROM s)
SELECT k.f, k.g, any_value(k.n) AS n, any_value(k.mean) AS mean, any_value(k.q1) AS q1, any_value(k.med) AS med, any_value(k.q3) AS q3,
  min(d.x) FILTER (WHERE d.x >= k.flo) AS wlo, max(d.x) FILTER (WHERE d.x <= k.fhi) AS whi, count(*) FILTER (WHERE d.x < k.flo OR d.x > k.fhi)::DOUBLE AS outn
FROM d JOIN k ON ${same} GROUP BY k.f, k.g ORDER BY k.f, k.g`;
  }

  /** The distinct values beyond the whiskers, at most `limit` a box, most extreme first, with their counts. */
  function outliers(rel, facet, group, whisker = 1.5, limit = 200) {
    return `WITH d0 AS (${rel}), d AS (SELECT ${keys(facet, group)}, x FROM d0),
s AS (SELECT f, g, quantile_cont(x, [0.25, 0.5, 0.75]) AS q FROM d GROUP BY f, g),
k AS (SELECT f, g, q[2] AS med, q[1] - ${number(whisker)} * (q[3] - q[1]) AS flo, q[3] + ${number(whisker)} * (q[3] - q[1]) AS fhi FROM s),
o AS (SELECT d.f, d.g, d.x, count(*)::DOUBLE AS n, any_value(abs(d.x - k.med)) AS dist FROM d JOIN k ON ${same} WHERE d.x < k.flo OR d.x > k.fhi GROUP BY d.f, d.g, d.x)
SELECT f, g, x, n FROM o QUALIFY row_number() OVER (PARTITION BY f, g ORDER BY dist DESC, x) <= ${limit} ORDER BY f, g, x`;
  }

  /**
   * The `limit` most frequent levels of the category alias c (with its sort key k), and how many levels and rows
   * there are in all, so the rest can be drawn as one Other.
   */
  function levels(rel, alias, keyAlias, limit) {
    return `WITH d AS (${rel}), lv AS (SELECT ${ident(alias)} AS level, any_value(${ident(keyAlias)}) AS sort_key, count(*)::DOUBLE AS n FROM d GROUP BY ${ident(alias)})
SELECT level, sort_key, n, (SELECT count(*) FROM lv)::DOUBLE AS levels, (SELECT sum(n) FROM lv)::DOUBLE AS rows FROM lv ORDER BY n DESC, level LIMIT ${limit}`;
  }

  /** A category mapped to its kept levels: the level, or NULL for Other. */
  const kept = (alias, list) => (list.length ? `CASE WHEN ${ident(alias)} IN (${list.map(literal).join(", ")}) THEN ${ident(alias)} END` : "NULL::VARCHAR");

  /**
   * Counts (and, with a measure y, means, sample standard deviations and sums) per group. `by` maps output aliases to
   * expressions over the relation's columns.
   * @param {string} rel @param {Record<string, string>} by @param {boolean} withY
   */
  function grouped(rel, by, withY) {
    const cols = Object.entries(by).map(([a, e]) => `${e} AS ${ident(a)}`);
    const stats = withY ? ", avg(y) AS mean, stddev_samp(y) AS sd, sum(y) AS total" : "";
    return `WITH d AS (${rel}) SELECT ${cols.join(", ")}, count(*)::DOUBLE AS n${stats} FROM d GROUP BY ALL ORDER BY ALL`;
  }

  /* Periods of several years, which date_trunc would count from year 1 (its centuries start in 2001). */
  const YEARS = { decade: 10, century: 100, millennium: 1000 };

  /** The period a time value falls in, as seconds since 1970 (UTC). */
  function period(alias, unit) {
    const k = YEARS[/** @type {keyof typeof YEARS} */ (unit)];
    if (k) return `epoch(make_timestamp(CAST(floor(year(${ident(alias)}) / ${k}) * ${k} AS BIGINT), 1, 1, 0, 0, 0))::DOUBLE`;
    return `epoch(date_trunc(${literal(unit)}, ${ident(alias)}))::DOUBLE`;
  }

  /** Which precisions a period can place: a value known only to the year cannot be placed in a month. */
  const ALL = ["year", "month", "day", "time"];
  const PLACEABLE = { millennium: ALL, century: ALL, decade: ALL, year: ALL, quarter: ["month", "day", "time"], month: ["month", "day", "time"], week: ["day", "time"], day: ["day", "time"], hour: ["time"] };
  const placeable = (precisionAlias, unit) => `${ident(precisionAlias)} IN (${PLACEABLE[/** @type {keyof typeof PLACEABLE} */ (unit)].map(literal).join(", ")})`;

  /** The first and last time, and how many values are known only to the year or the month (dates with their precision). */
  function timeRange(rel, alias = "t", precisionAlias = "p") {
    const t = ident(alias), p = ident(precisionAlias);
    return `WITH d AS (${rel}) SELECT count(*)::DOUBLE AS n, epoch(min(${t}))::DOUBLE AS lo, epoch(max(${t}))::DOUBLE AS hi,
  count(*) FILTER (WHERE ${p} = 'year')::DOUBLE AS p_year, count(*) FILTER (WHERE ${p} = 'month')::DOUBLE AS p_month FROM d`;
  }

  /** The number of rows of a relation. */
  const count = (rel) => `WITH d AS (${rel}) SELECT count(*)::DOUBLE AS n FROM d`;

  /** The rows of a relation, and for each alias whether it holds one value only among them (`alias_one`). */
  const check = (rel, aliases) => `WITH d AS (${rel}) SELECT count(*)::DOUBLE AS n${aliases.map((a) => `, (min(${ident(a)}) = max(${ident(a)})) AS ${ident(`${a}_one`)}`).join("")} FROM d`;

  /** The points of a scatter plot in source order: every point, or a seeded reservoir sample of `rows`. */
  function points(rel, facet, sample) {
    const cols = `${facet ? "f, " : ""}x, y`;
    if (!sample) return `WITH d AS (${rel}) SELECT ${cols} FROM d ORDER BY r`;
    return `WITH d AS (${rel}) SELECT ${cols} FROM (SELECT r, ${cols} FROM d) USING SAMPLE reservoir(${Math.floor(sample.rows)} ROWS) REPEATABLE (${Math.floor(sample.seed)}) ORDER BY r`;
  }

  /** The end of the span a value names: a year or a month for values known only that far, the value itself otherwise. */
  const spanEnd = (t, p) => `CASE ${ident(p)} WHEN 'year' THEN ${ident(t)} + INTERVAL 1 YEAR WHEN 'month' THEN ${ident(t)} + INTERVAL 1 MONTH ELSE ${ident(t)} END`;

  /**
   * Whether an end is at or after its start: an end known only to the year or month counts when its span reaches
   * past the start (1850-03 ends after 1850-03-01; 1849 does not end after 1850), any other end when it is not before
   * the start.
   */
  const endsAfter = (e, pe, s) => `(CASE ${ident(pe)} WHEN 'year' THEN ${ident(e)} + INTERVAL 1 YEAR > ${ident(s)} WHEN 'month' THEN ${ident(e)} + INTERVAL 1 MONTH > ${ident(s)} ELSE ${ident(e)} >= ${ident(s)} END)`;

  /** For an interval timeline: rows with both ends, and how many end at or after their start (the end's whole span counts). */
  function intervalCheck(rel) {
    return `WITH d AS (${rel}) SELECT count(*)::DOUBLE AS rows, count(*) FILTER (WHERE s IS NOT NULL AND e IS NOT NULL)::DOUBLE AS both_ends,
  count(*) FILTER (WHERE s IS NOT NULL AND e IS NOT NULL AND ${endsAfter("e", "pe", "s")})::DOUBLE AS ordered,
  count(*) FILTER (WHERE s IS NULL)::DOUBLE AS no_start, count(*) FILTER (WHERE e IS NULL)::DOUBLE AS no_end FROM d`;
  }

  /**
   * One page of point events in time order: one row per label, time, precision and qualifier, with how many rows it
   * merges and the first source row; with the number of events and of merged events in all.
   */
  function pointEvents(rel, page, size) {
    return `WITH d AS (${rel}), ev AS (SELECT label, t, p, q, min(raw) AS raw, count(*)::DOUBLE AS n, min(r) AS first FROM d GROUP BY label, t, p, q)
SELECT label, epoch(t)::DOUBLE AS t, p, q, raw, n, first, (SELECT count(*) FROM ev)::DOUBLE AS events, (SELECT count(*) FROM ev WHERE n > 1)::DOUBLE AS merged,
  (SELECT count(*) FROM d)::DOUBLE AS rows FROM ev ORDER BY ev.t, first, label LIMIT ${size} OFFSET ${(page - 1) * size}`;
  }

  /** The number of point events once duplicates merge (label, time, precision and qualifier). */
  const pointEventCount = (rel) => `WITH d AS (${rel}) SELECT count(*)::DOUBLE AS n FROM (SELECT DISTINCT label, t, p, q FROM d)`;

  /** One page of intervals in order of their start (an unknown start by its end); an end before its start is left out and counted. */
  function intervalEvents(rel, page, size) {
    const reversed = `s IS NOT NULL AND e IS NOT NULL AND NOT ${endsAfter("e", "pe", "s")}`;
    return `WITH d AS (${rel}), ok AS (SELECT * FROM d WHERE NOT (${reversed})),
ev AS (SELECT label, s, e, ps, pe, qs, qe, min(sraw) AS sraw, min(eraw) AS eraw, count(*)::DOUBLE AS n, min(r) AS first FROM ok GROUP BY label, s, e, ps, pe, qs, qe)
SELECT label, epoch(s)::DOUBLE AS s, epoch(e)::DOUBLE AS e, ps, pe, qs, qe, sraw, eraw, n, first, (SELECT count(*) FROM ev)::DOUBLE AS events,
  (SELECT count(*) FROM ev WHERE n > 1)::DOUBLE AS merged, (SELECT count(*) FROM d WHERE ${reversed})::DOUBLE AS reversed, (SELECT count(*) FROM d)::DOUBLE AS rows
FROM ev ORDER BY coalesce(ev.s, ev.e), first, label LIMIT ${size} OFFSET ${(page - 1) * size}`;
  }

  /** The time range of an interval timeline's events: both ends, with the end's whole span. */
  function intervalRange(rel) {
    const reversed = `s IS NOT NULL AND e IS NOT NULL AND NOT ${endsAfter("e", "pe", "s")}`;
    return `WITH d AS (${rel}) SELECT epoch(least(min(s), min(e)))::DOUBLE AS lo, epoch(greatest(max(${spanEnd("s", "ps")}), max(${spanEnd("e", "pe")})))::DOUBLE AS hi FROM d WHERE NOT (${reversed})`;
  }

  return { measure, category, time, label, relation, numbers, histogram, bins2d, box, outliers, levels, kept, grouped, period, PLACEABLE, placeable, timeRange, count, check, points, intervalCheck, pointEvents, pointEventCount, intervalEvents, intervalRange };
});
