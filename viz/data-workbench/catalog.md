# Test catalogue v1

The statistical tests of the Universal Data Workbench, how a table's hypotheses are chosen and adjusted, and how its
charts are ranked (spec.md, sections 7 and 8, and "Ranking" and "Hypothesis families and test catalogue v1" in
section 15). It is code: `src/stats.js` (the tests and their distributions), `src/statsql.js` (what the engine
computes for them), `src/family.js` (the family, eligibility, the adjustment) and `src/rank.js` (the ranking and the
two lists). A change to a rule here bumps the catalogue version, which every hypothesis id holds.

Statistical tests are required where their assumptions have support. They do not show that a pattern is real, and
an adjustment never repairs a test whose assumptions fail: each test is checked before the correction.

## The family

One family per analysed table per run: each imported table once its charts are drawn, and each subset the person
opens (one level of a category of at most 12 levels) as a family of its own. Its members are enumerated from the
fields' classes of grammar v1 before any test, ranking or highlight:

| Pattern | Fields | Members | Test |
| --- | --- | --- | --- |
| Monotone association | two measures (Q, Q) | C(q,2) | T1 |
| Group difference | a category and a measure (C, Q) | qc | T2 (2 groups) or T3 (3 to 12) |
| Association of categories | two categories (C, C) | C(c,2) | T4, else T5 (2 × 2), else T6 |
| Trend over time | a time and a measure (T, Q) | tq | T7 |
| Level shift over time | a time and a measure (T, Q) | tq | T8 |

The family has C(q,2) + qc + C(c,2) + 2tq members. Each hypothesis id is `h` and the first 12 hex digits of
SHA-256 of `[family, pattern, sorted fields, grammar version, catalogue version]`, so the scatter plot and the binned
heatmap of one pair, or the box plot and the mean bar of one category and measure, show one hypothesis, tested once.
A mean time series shows two: a trend and a level shift.

A member whose test does not apply is listed "Not tested" with its reason and is not counted. m is the number of
tests that passed their checks and ran. Raw p-values are adjusted by Benjamini–Yekutieli over the m tests of the
family (tests share rows and fields), as SciPy's `false_discovery_control(method="by")`: p(k) · m · c(m) / k with
c(m) = 1 + 1/2 + … + 1/m, made monotone from the largest and capped at 1. The page calls the result the
**adjusted p-value**, never a q-value. An adjusted p-value at or below 0.05 is exploratory evidence. A family that
stopped before every member was computed is incomplete and gets no adjusted p-values.

Single-field charts, count series, period-by-category heatmaps and timelines carry no hypothesis: they are ranked
by descriptive measures only, and say so.

## The data the statistics use

The rows of the chart with every field present, as the profile reads them. Values the profile flags as stand-ins for
no value (an open sentinel suggestion, such as -999) are left out of every statistic and counted on the finding;
the figure still draws them, and approving the suggestion in Inspect makes them missing. Nothing else is removed or
filled. A category of more than 12 levels is tested with its 12 most frequent levels and Other, as the count
heatmap draws it. A time is read by the period rule of the mean time series (the coarsest of hour, day, week,
month, quarter or year that gives at least 20 periods), and its tests use the period means.

## Independence

Without study details, every test of independent rows (T1 to T6) runs tagged "Independence assumed, not confirmed",
and is refused where the data contradicts independence:

- **An identifier that repeats**: a column with the role identifier whose values repeat an earlier one in at least
  10% of its values (repeated measurements). Every T1 to T6 member is refused.
- **Serial correlation**: a measure whose lag-1 autocorrelation in the order of a time field (ties by source row) is
  above 0.3 with p below 0.01, p = P(Z > (r1 + 1/n) √n) under independence. Every T1 to T6 member with that measure
  is refused. Without a time field, row order is not time order and is not checked.

The optional study details (each table's own) add to these: independent observations "no", repeated measurements by
a field, or a clustered sample design refuse every T1 to T6 member with that reason; "yes" tags the tests
"Independence stated by you" (the checks of the data still apply); a stratified or convenience design adds a caution
to every result. T7 and T8 allow for dependence in time and run either way.

## The tests

| Test | Applies when | Assumptions checked | Effect | Reference |
| --- | --- | --- | --- | --- |
| T1 Spearman's rank correlation | at least 10 complete pairs; each field at least 5 distinct values among them | independence | rho with a 95% interval: tanh(atanh(rho) ± 1.96 SE), SE = √((1 + rho²/2) / (n − 3)) (Bonett and Wright, 2000) | SciPy `spearmanr`: average ranks for ties, p from t = rho √((n − 2) / ((1 + rho)(1 − rho))) with n − 2 df, two-sided |
| T2 Welch's t-test | 2 groups, each at least 5 rows and variance above 0 | independence; normality support in each group: at least 30 rows, or \|skewness\| at most 1 and no value with robust z above 5 | the mean difference with a Welch 95% interval; Hedges' g = J · d, J = 1 − 3 / (4(n1 + n2) − 9), with SE = J √((n1 + n2) / (n1 n2) + d² / (2(n1 + n2))) (Borenstein et al., 2009) | SciPy `ttest_ind(equal_var=False)`, first group minus second, the groups in the chart's order |
| T3 Welch's one-way ANOVA | 3 to 12 groups, each as T2 | as T2 | omega-squared, (SSB − (k − 1) MSW) / (SST + MSW), shown as 0 when negative | statsmodels `anova_oneway(use_var="unequal")` |
| T4 Pearson's chi-square of independence | n at least 20; every expected count at least 1 and at least 80% of them at least 5 | independence | bias-corrected Cramér's V (Bergsma, 2013) | SciPy `chi2_contingency(correction=False)`: no continuity correction |
| T5 Fisher's exact test | a 2 × 2 table that fails T4's rule | independence | the sample odds ratio ad / bc with Woolf's 95% interval, unbounded when a cell is 0 | SciPy `fisher_exact`, two-sided: tables no more likely than the observed one (relative tolerance 1e-7) |
| T6 Permutation test of independence | a larger table that fails T4's rule | independence | bias-corrected Cramér's V | 10,000 random tables with the observed margins (a random permutation of one field against the other, drawn as multivariate hypergeometric rows), seeded by the hypothesis id; p = (b + 1) / (R + 1), b the tables whose chi-square is at least the observed one, with its Monte Carlo SE √(p(1 − p)/R); checked against 400,000 tables of SciPy's `random_table` |
| T7 Mann–Kendall trend test with the Hamed–Rao correction | at least 12 periods with rows, at most 10% of the periods between the first and last empty | none beyond the series: the correction allows for autocorrelation | Kendall's tau; Sen's slope a period with Gilbert's (1987) 95% interval from the corrected variance | pymannkendall `hamed_rao_modification_test(lag=3)`, with the correction never narrowing the variance (see below) |
| T8 CUSUM level-shift test | at least 20 periods, regular as T7 | none beyond the series: the long-run variance allows for autocorrelation | the shift: the means after and before the period where the CUSUM peaks, also in long-run SDs of the series about those two means | max \|S_k\| / √(n σ²) of the centred series, σ² the Bartlett long-run variance of bandwidth floor(4 (n/100)^(2/9)); p from the Kolmogorov distribution (SciPy `kolmogorov`); the statistic checked against an independent Python implementation |

Failure behaviour: a member that fails a check, or whose test cannot be computed (no variance, a correction that
leaves none), keeps its descriptive effect where one can be computed and is listed "Not tested" with the reason. Its
chart is still ranked in the unusual-pattern list; it never enters the statistically supported list.

Reference values: `tests/fixtures/stats-reference.json`, written by `tools/reference_stats.py` with SciPy 1.13.1,
statsmodels 0.14.6, pymannkendall 1.4.3 and NumPy 2.0.2, which the file records. `tests/stats.test.mjs` compares
every test, effect, interval and distribution with them; `tests/findings-engine.test.mjs` runs the same data
through the page's SQL with the pinned engine.

**T7, measured on 2026-10-06.** pymannkendall's default correction uses the autocorrelations of every lag and may
narrow the variance. On 3,000 simulated series without a trend, of 24 and of 60 periods, it rejected 8.4% and 8.5%
of them at the 5% level. With lags 1 to 3, as Hamed and Rao's correction is commonly applied, and no narrowing, it
rejected 4.3% and 4.5%. The catalogue uses the second; tests/calibration.test.mjs holds it within its bound.

**T8.** With few periods the CUSUM test is conservative: on series without a shift it rejected 0.3% of 24-period
series and 1.6% of 60-period series at the 5% level, so a shift over two years of months may stay unsupported even
when it is large. Its effect still ranks the chart among the unusual patterns.

## Calibration

`tests/calibration.test.mjs`: 3 fixed seeds × 200 synthetic tables of 3 measures, 2 categories and a time of 30
periods (16 members a family). Without any relation, the share of families with any adjusted p-value at or below
0.05 was 0% to 2%, and each test's share of raw p-values at or below 0.05 stayed within 0.05 plus three binomial
standard errors (T1 4.3% to 5.2%, T2 4.8% to 5.8%, T3 4.6% to 6.1%, T4 3.5% to 8%, T7 4.7% to 6.7%, T8 0.3%). With two
planted effects, the mean false discovery proportion was 0.8% to 1.3% and 89% to 92% of the effects were found.

## Ranking

Valid charts are ranked; a chart is excluded, never ranked, when its specification is invalid, fewer than 5 rows
have every field present, an encoded field (other than labels) has one value only among them, a log scale covers
values at or below 0, or a bar does not start at zero. Every score is logged with the chart.

- **Usefulness** = min(1, effect / large), the effect of the chart's pattern: Spearman's |rho| against 0.5 (scatter
  plot, binned heatmap); Hedges' |g| against 0.8, or omega-squared against 0.14 for 3 or more groups (box plot by
  group, mean bar); bias-corrected Cramér's V against 0.5 (count heatmap; the period-by-category heatmap with the
  periods as levels); |Kendall's tau| against 0.5 or the level shift against 2 long-run SDs, whichever is larger
  (mean time series; the count time series on its counts). For one measure (histogram, box plot), the largest of
  |skewness| against 2, a bimodality coefficient above 0.555 (1, else 0), and the share of values with robust z
  above 3.5 against 1%. For one category (bar chart), the rarity of its rarest level, 1 − k · its share, against
  0.95, for at most 29 levels. Timelines have no effect measure and score 0.
- **Penalties**: information density (non-empty bins or cells) below 20%, 0.1; label collisions after layout, 0.1
  each, at most 0.3; a category of more than 12 levels, 0.1; scatter overplotting (more than half the points in a
  cell of one mark's width already holding one), 0.1; a group or period of fewer than 5 rows shown, 0.2; more than
  30% of rows missing a field of the chart, 0.2; a sample instead of every row, 0.05.
- **Unusualness** = usefulness × the share of complete rows − penalties; ties by chart id.
- **List 1, "Unusual patterns"**: every ranked chart by unusualness.
- **List 2, "Statistically supported patterns"**: charts with a tested hypothesis whose adjusted p-value is at most
  0.05, by the smallest such adjusted p-value, then usefulness. A chart can be in both lists.
- **Redundancy**: a cluster per pattern of the grammar and field set, with fields that substitute for each other
  (|rho| or V at least 0.95) counted as the first of them in column order. Each chart has a cluster id.
- **Distinct highlights**: from the top of each list, skipping a chart whose cluster is chosen or that shares more
  than one field with a chosen chart; 6 by default, 0 to 50 by choice, fewer when fewer are distinct, stated.

Each highlight shows **Observed** (the numbers: the effect with its interval, the sample count, supporting values)
apart from **Why highlighted** (the rule scores and its places), its statistical status, and fixed cautions that
make no causal claim: an association is not a cause; a third field may drive both; a change in time does not say
why; rare values may be errors or real; possible data errors and samples where they apply; an adjusted p-value is
exploratory evidence. No unit, study design, cause or meaning is added that the source or the person did not give.
