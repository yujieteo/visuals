/* Universal Data Workbench: the SQL that computes what the statistics need, the sufficient statistics of each test.
 *
 * Like src/chartsql.js, each query is a plain function of a relation (ChartSql.relation: the source row r and one
 * column per alias, rows with every required alias present), so the Node checks run exactly the page's SQL
 * against the pinned engine. Only DOUBLE, BOOLEAN and VARCHAR come back. No query returns a row of the table:
 * counts, means, variances, ranks' correlations, medians and tables of counts only.
 *
 *   spearman    n, rho (the correlation of average ranks) and the distinct values of x and y
 *   groups      per level of c: n, mean, variance, skewness, median, MAD and the farthest value from the median;
 *               keptLevels maps c to the levels a chart keeps and Other first
 *   shape       n, skewness, excess kurtosis, median, MAD and the values with robust z above 3.5
 *   serial      the lag-1 autocorrelation of x in the order of t (ties by source row)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./sql.js"));
  else root.DWStatSql = factory(root.DWSql);
})(typeof self !== "undefined" ? self : this, function (Sql) {
  "use strict";

  const { ident, literal, number } = Sql;

  /** A measure expression with the values the profile flags as suspected stand-ins (open sentinels) left out. */
  const usable = (expr, sentinels) => (sentinels.length ? `CASE WHEN (${expr}) NOT IN (${sentinels.map(number).join(", ")}) THEN ${expr} END` : expr);

  /** A relation's rows where the alias s equals one level: a subset family. */
  const within = (rel, level) => `SELECT * FROM (${rel}) WHERE ${ident("s")} = ${literal(level)}`;

  /** A relation's category c mapped to the levels a chart keeps, the rest to one Other label, as the chart draws them. */
  const keptLevels = (rel, levels, other) =>
    `SELECT r, coalesce(${levels.length ? `CASE WHEN c IN (${levels.map(literal).join(", ")}) THEN c END` : "NULL::VARCHAR"}, ${literal(other)}) AS c, k, x FROM (${rel})`;

  /** The average rank of an alias: rank() plus half the other rows tied with it. */
  const avgRank = (a) => `(rank() OVER (ORDER BY ${ident(a)}) + (count(*) OVER (PARTITION BY ${ident(a)}) - 1) / 2.0)`;

  /** Spearman's rho of x and y: the Pearson correlation of their average ranks, with n and their distinct values. */
  function spearman(rel) {
    return `WITH d AS (${rel}), k AS (SELECT x, y, ${avgRank("x")} AS rx, ${avgRank("y")} AS ry FROM d)
SELECT count(*)::DOUBLE AS n, corr(rx, ry)::DOUBLE AS rho, count(DISTINCT x)::DOUBLE AS dx, count(DISTINCT y)::DOUBLE AS dy FROM k`;
  }

  /**
   * Per level of the category c (with its sort key k): n, mean, sample variance, sample skewness, median, the
   * median absolute deviation and the farthest value from the median, for Welch's tests and their checks.
   */
  function groups(rel) {
    return `WITH d AS (${rel}), s AS (SELECT c, any_value(k) AS k, count(*)::DOUBLE AS n, avg(x) AS mean, var_samp(x) AS var, skewness(x) AS skew, median(x)::DOUBLE AS med FROM d GROUP BY c),
a AS (SELECT d.c, median(abs(d.x - s.med))::DOUBLE AS mad, max(abs(d.x - s.med)) AS far FROM d JOIN s ON d.c = s.c GROUP BY d.c)
SELECT s.c AS level, s.k AS sort_key, s.n, s.mean, s.var, s.skew, s.med, a.mad, a.far FROM s JOIN a ON s.c = a.c ORDER BY s.n DESC, s.c`;
  }

  /** The shape of a measure x: n, skewness and excess kurtosis (both bias-corrected), median, MAD and the values with robust z above 3.5. */
  function shape(rel) {
    return `WITH d AS (${rel}), s AS (SELECT count(*)::DOUBLE AS n, skewness(x) AS skew, kurtosis(x) AS kurt, median(x)::DOUBLE AS med, mad(x)::DOUBLE AS mad FROM d)
SELECT n, skew, kurt, med, mad, (SELECT count(*) FROM d WHERE s.mad > 0 AND abs(d.x - s.med) / (1.4826 * s.mad) > 3.5)::DOUBLE AS rare FROM s`;
  }

  /** The lag-1 autocorrelation of x in the order of t, ties by the source row: its numerator, denominator and n. */
  function serial(rel) {
    return `WITH d AS (${rel}), s AS (SELECT avg(x) AS m FROM d), o AS (SELECT d.x - s.m AS e, lag(d.x) OVER (ORDER BY d.t, d.r) - s.m AS pe FROM d, s)
SELECT count(*)::DOUBLE AS n, sum(e * pe) AS num, sum(e * e) AS den FROM o`;
  }

  return { usable, within, keptLevels, spearman, groups, shape, serial };
});
