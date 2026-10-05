# Grammar v1

The finite grammar the Universal Data Workbench searches for each table (spec.md, sections 5 and 6, and "Finite
grammar v1" in section 15). It is code: `src/grammar.js` (classes, candidates, the count), `src/chartspec.js` (the
specification, its JSON Schema and its rules), `src/charts.js` and `src/chartsql.js` (the fixed rules on the data)
and `src/render.js` (the figure). A change to any rule here bumps the version, which every specification records,
and updates the fixtures in `tests/fixtures/`.

## Field classes

Each column of a table gets one class, from its profile (type, role, distinct values), with its reason. The first
rule that applies wins.

| Rule | Class |
| --- | --- |
| Not profiled, could not be profiled, a nested or binary type, every value missing, or one value only | excluded |
| The role identifier (identifiers are never measures) | excluded |
| Text whose dates fit two layouts or mix layouts, waiting for the person's choice | excluded |
| The role event label on text | L |
| The role category or ordered category, yes or no, or categorical text: at most 1,000 levels | C |
| Dates and date-times (dates known only to the year or month included) | T |
| Times of day | excluded |
| Whole numbers from 1000 to 2999 with the role time: years | T |
| Numbers with 2 to 12 distinct values: levels | C |
| Numbers with the role measure and at least 13 distinct values | Q |
| Text with at least half its values distinct | L |
| Other text with at most 1,000 levels | C |
| Anything else | excluded |

A category of more than 1,000 levels, or numbers in another role, is excluded with that reason.

## Candidates

In this order, then by column order. For two fields of one class the earlier column is x; a category is x against
a measure; time is x.

| Kind | Fields | Per table |
| --- | --- | --- |
| Histogram | Q | q |
| Box plot | Q | q |
| Bar chart of counts | C | c |
| Count time series | T | t |
| Scatter plot | Q, Q | C(q,2) |
| Binned heatmap | Q, Q | C(q,2) |
| Box plot by group | C, Q | qc |
| Mean bar with 95% CI | C, Q | qc |
| Count heatmap | C, C | C(c,2) |
| Mean time series | T, Q | tq |
| Period-by-category heatmap | T, C | tc |
| Point timeline | T, L | tl |
| Interval timeline | T start, T end, L | C(t,2)·l |

Count per table: 2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + tl + C(t,2)·l. An interval timeline takes each
pair of time fields once: the one whose role is interval start is the start, otherwise the earlier column.

A candidate's id is `table.kind.field...`, each field name in lower case with other characters as `_`, cut to 60
characters; a name that changes that way gets the first six hex digits of its FNV-1a hash, so ids stay unique and
usable as file names.

The first 10,000 candidates of a table are generated; the rest are incomplete, counted by kind.

## Outcomes

Every candidate ends with one outcome:

- **valid**: its specification passed validation, and it was computed and drawn;
- **excluded**: its specification is invalid, no row has a value for every field, or an interval timeline's end
  is at or after its start in fewer than 90% of the rows with both (a year or month counts its whole span);
- **failed**: the engine or the drawing failed, with the error;
- **incomplete**: cancelled before it was computed, beyond the 10,000 cap, or stopped at the memory budget.

Step 3 adds the ranking's rejection rules (fewer than 5 complete rows, zero variance on an encoded field).

## Fixed rules

- **Rows.** A chart uses the rows where every encoded field has a value present: blanks, markers such as NA and
  values that do not read are left out and counted in the caption. Nothing is filled.
- **Bins.** Freedman–Diaconis: width 2·IQR·n^(−1/3) over the axis, the count kept within 5 to 100 (100 when the
  quartiles are equal). Binned heatmaps use 40 × 40 equal cells. The person may set 5 to 100 bins.
- **Scales.** A log10 axis only when every value is above 0 and P99/P1 is at least 1,000, else linear; bins,
  boxes and points are computed on the axis. Bars, histograms and counts start at zero on a linear axis; a mean
  bar is always linear from zero. The person may choose linear or log10, and log10 is refused over values at or
  below 0.
- **Levels.** Bars keep the 29 most frequent levels; groups and heatmap axes keep 12; the rest is one bar, box or
  row "Other (k levels)". Categories are ordered by count; numbers, yes or no and dates by value.
- **Periods.** The coarsest of year, quarter, month, week (from Monday), day or hour that gives at least 20
  periods; never finer than the values (a date has no hours, years only years), never more than 500 periods: a
  span of more than 500 years is counted by decade, century or millennium, and the figure says so. With
  dates known only to the year or month, a unit is used only when at most 5% of the values are too coarse for it;
  those are counted and not drawn. Periods are in UTC for values with an offset; values without one are not
  shifted.
- **Aggregation.** The mean with n per group or period and its 95% t interval (mean ± t(0.975, n − 1)·sd/√n); a
  sum only of a field the person marks additive.
- **Scatter plots.** Every point up to 50,000, else a seeded reservoir sample of 50,000 (seed 20261005), stated on
  the figure.
- **Box plots.** Quartiles and median; whiskers to the most extreme values within 1.5 × IQR; at most 200 distinct
  values beyond them drawn a box.
- **Facets.** A control of each chart, never searched: a category of at most 12 levels that the chart does not
  encode, one panel a level on shared scales. Timelines are not faceted.

## Timelines

- Values with an offset are ordered in UTC and shown as written; values without one are "zone unknown" and never
  shifted; dates stay dates. The axis says UTC or zone unknown.
- Dates known to the year or month (`1850`, `1851-03`) keep their precision and draw as a hatched span over that
  year or month: no day is invented. Qualifiers (`c.`, `ca.`, `circa`, `about`, `approx.`, `~`, a trailing `?`)
  are kept as written and drawn as open or dashed marks.
- A missing start or end draws open to the axis edge, dashed, and is labelled "start unknown" or "end unknown". A
  row whose end comes before its start is not drawn and is counted.
- The same label at the same date (and precision and qualifier) is one mark with its count (×n); the same label
  at different dates stays apart.
- 500 events a figure, in time order; the next figure holds the next 500. Labels that find no room are left out
  and counted, and their marks drawn in a strip at the bottom.

## Chart specification, version 1

JSON with `version`, `grammar`, `id`, `kind`, `data` (table, rows, a sample), `transform` (the ordered chart
operations, each with an id: complete, bin, bin2d, box, top, period, aggregate, sample, merge-duplicates,
order-check, page), `encoding` (a field and its class per channel: x, y, x2, label; or a count), `scale` (linear,
log10, band, time with its zone, sequential), `layout` (width and height in mm, facet), `annotation` (title, labels,
units only from the source or the person, caption, notes, findings) and `edits` (each change the person made).
`ChartSpec.SCHEMA` is its JSON Schema; `ChartSpec.validate` checks it, then the rules above, before every figure is
drawn. Figures are 180 mm wide (the general preset), 110 mm tall (timelines 140 mm), on white paper.
