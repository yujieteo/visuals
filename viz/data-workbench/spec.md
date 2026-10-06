# Universal Data Workbench

## 1. Purpose

Help an individual analyst explore unfamiliar table data and produce figures ready for publication in one operation.

The user need not supply an analysis question or choose a visualization first.

The main workflow is:

**Import → inspect → generate all valid candidates → rank findings → highlight distinct figures → export all figures**

The workbench is a browser application with local processing. Imported data stays on the device.

The complete workflow must work on desktop and mobile. User review and field changes are optional.

This specification records the decisions from the grill-me interview. It does not authorize implementation or publication.

## 2. Product components

| Component | Responsibility |
|---|---|
| Data Workbench | Import tables, inspect data, and explain findings. |
| Table Algebra | Define explicit, reproducible table transformations. |
| Chart Search Engine | Generate valid candidates, rank findings, and identify distinct figures. |
| Visualization Grammar | Represent charts for generation, comparison, modification, and export. |

These are responsibilities, not a requirement for separate services.

## 3. Inputs and data integrity

Support CSV and Parquet files, including multiple files in one project.

Support numeric, categorical, and date or time fields. Defer text analysis and geographic maps.

The initial desktop targets are 1 million rows, 50 columns, and 250 MB per file. Verify these targets through performance tests.

Measure mobile limits separately. Publish tested limits and report resource constraints before they cause incomplete results.

For each table, show:

- Row count, column names, and source types.
- Inferred types and semantic roles, with uncertainty.
- Missing values, parse failures, and unusual values.
- Summaries appropriate to each field type.
- Whether each result uses all rows or a sample.

Preserve source values. Record conversions and their failures. Require approval for changes that alter meaning.

Suggest type corrections. Generate usable figures without those corrections when possible.

Keep identifiers distinct from numeric measurements. A storage type alone does not establish a semantic role.

Do not automatically remove outliers or fill missing values. Show suspected data errors separately from patterns in usable data.

## 4. SQL and Table Algebra

Provide a SQL editor and visual controls. Both interfaces must produce reproducible transformations.

Show SQL for visual operations. Preserve custom SQL when visual controls cannot represent it.

Support major analytical SQL operations:

- Selection, filtering, sorting, limits, and distinct values.
- Expressions, `CASE`, casts, and null handling.
- Grouping, aggregates, and `HAVING`.
- Inner, outer, cross, semi, and anti joins.
- Subqueries and CTEs, including recursive CTEs.
- `UNION`, `INTERSECT`, and `EXCEPT`.
- Window functions, including rolling aggregates.
- Date, string, numeric, and statistical functions.
- Pivot and unpivot.

Define `reshape` through explicit supported transformations.

Let users name imported tables. Treat imports as read-only. Queries can create derived tables and views.

Defer source updates, transactions, permissions, and database administration.

Each transformation must expose its inputs, parameters, output schema, and effect on row counts.

Define null, duplicate-key, row-order, and type-conversion rules. Report unmatched join keys and row multiplication.

Discover patterns in each imported table automatically. Also inspect query results that the user selects.

Require explicit joins. Matching column names do not establish a valid relationship.

## 5. Visualization Grammar

Represent each chart as:

**data + transform + encoding + scale + layout + annotation**

| Element | Definition |
|---|---|
| `data` | A reference to an imported or derived table. |
| `transform` | The ordered operations that produce the plotted data. |
| `encoding` | The mapping from fields to visual properties. |
| `scale` | The mapping from data values to visual values. |
| `layout` | Dimensions, arrangement, and facets. |
| `annotation` | Labels, units, captions, notes, and supported findings. |

Use this representation throughout generation, comparison, editing, and export. Validate each specification before rendering.

## 6. Candidate generation

Support histograms, box plots, scatter plots, bar charts, heatmaps, time-series charts, and timelines.

Generate all valid candidates within a finite, documented grammar. This includes supported single-field and two-field charts, plus timeline bindings.

Use fixed, documented rules for bins, scales, and aggregation. Do not enumerate unlimited parameter variants or arbitrary SQL programs.

Keep facets available through user controls. Defer automatic searches across facet combinations.

Defer pie charts and 3D charts.

Report the search scope, candidate counts, exclusions, and resource limits. Account for each candidate as valid, excluded, failed, or incomplete.

Export every valid figure by default. Do not replace this with a top-N export.

Keep redundant valid figures in the export. Mark redundancy and highlight 6 distinct figures per list by default.

Let users change the highlight count and chart fields, transformations, labels, scales, and layout.

## 7. Ranking and findings

Evaluate candidates for usefulness, information density, readability, misleadingness, and redundancy.

Define observable rules for each dimension. Separate rejection rules from ranking penalties.

Favor unusual patterns in the main discovery view. Include rare values, unexpected relationships, group differences, and abrupt time changes.

Provide 2 visible lists:

1. **Unusual patterns**, ordered by unusualness.
2. **Statistically supported patterns**, with explicit evidence criteria.

Highlight distinct figures within both lists. A figure can appear in both lists.

Show each finding's fields, transformations, supporting values, effect size, sample count, and statistical status where applicable.

Explain each highlight. Keep observed patterns separate from explanations for those patterns.

Do not invent units, study design, causal claims, or semantic meanings absent from the source or user metadata.

## 8. Statistical evidence

Statistical tests are required when their assumptions have support. They do not guarantee that a discovered pattern is real.

Use an explicit test catalog. Document eligibility rules, assumptions, effect measures, and failure behavior.

Cover these pattern classes:

| Pattern | Required method coverage |
|---|---|
| Numeric relationships | Spearman correlation where appropriate. |
| Group differences | Welch tests where appropriate. |
| Categorical associations | Chi-square or exact tests where appropriate. |
| Time patterns | Methods that account for temporal dependence. |

Ask for optional study metadata about independent observations, repeated measurements, and sample design.

Generate figures without this metadata. If no valid test applies, retain descriptive evidence and explain why the test is unavailable.

Define the hypothesis family before selection or highlighting. Identify each hypothesis once.

Include every tested hypothesis in its family, including hypotheses whose figures receive no highlight.

Use Benjamini–Yekutieli correction by default because tests can share rows and columns.

Report raw p-values and BY-adjusted p-values. Use an adjusted p-value of `0.05` or less as an exploratory evidence flag.

Use the label **adjusted p-value** rather than imply a different q-value estimator.

Report the test method, sample count, effect size, assumptions, family definition, and random seed where applicable.

Validate individual tests before correction. Correction does not repair invalid tests or unsupported study assumptions.

Reference: [SciPy false discovery control documentation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.false_discovery_control.html).

## 9. Publication figures

Produce publication-ready figures automatically. Do not require manual chart review before export.

Provide a general publication preset and separate Nature and Science presets.

Let users set physical dimensions, fonts, and raster resolution. The general defaults are 180 mm width and 300 dpi PNG.

Journal presets override general defaults where required. Record each preset's journal, submission stage, source, and verification date.

Export SVG, PDF, and PNG. Preserve editable vector marks and text in SVG and PDF.

For the Nature preset, keep text editable, embed fonts, and avoid text outlines.

Check dimensions, text size, fonts, line widths, color, raster resolution, clipping, label collisions, and legibility at final size.

Use accessible colors and consistent style. Include captions, source notes, transformations, and statistical methods in the report.

Validate the exact journal scope before locking the Science preset. A Science Partner Journal or Science Immunology guide is insufficient evidence for Science.

Do not claim compliance when a required check remains unverified.

Sources inspected on 2026-10-05:

- [Nature figure specifications](https://research-figure-guide.nature.com/figures/preparing-figures-our-specifications/).
- [Nature figure export guide](https://research-figure-guide.nature.com/figures/building-and-exporting-figure-panels/).
- [Science revised-article instructions](https://www.science.org/content/page/instructions-authors-revised-research-articles). Verify the journal scope before use.

## 10. Timeline export

Include timeline export in the first release when dates and event labels are available.

Support point events and intervals. Define rules for time zones, uncertain dates, missing interval endpoints, and duplicate events.

Preserve date uncertainty rather than invent precise dates.

Export timelines through the same figure, Markdown, and beamdswitch package.

## 11. Export package and beamdswitch

One operation downloads a package with:

- Every valid figure in the requested formats.
- A Markdown report with captions and methods.
- Highlight and redundancy information.
- Chart specifications and transformation definitions.
- Statistical results and validation results.
- A reproducibility manifest.
- A native document for `yujieteo/beamdswitch`.

The manifest includes source hashes, software versions, transformations, statistical methods, and random seeds.

Make source-data inclusion optional. Let users reopen a saved project locally.

The beamdswitch export uses Markdown with LaTeX and embedded SVG figures. Preserve separate editable SVG and PDF assets.

Validate this export through the actual beamdswitch parser and renderer. Defer automatic talk creation.

The export target is [yujieteo/beamdswitch](https://github.com/yujieteo/beamdswitch), not a beamerswitch LaTeX template.

Integration evidence comes from local vendored sources. Their parser supports front matter, sections, frames, and notes or narration blocks.

Recheck the current upstream input contract during implementation. Record the tested version in the manifest.

## 12. Mobile and performance

Support import, inspection, generation, SQL, field changes, and every export on mobile.

Use touch-accessible controls. Provide alternatives to hover. Let users inspect charts at full size.

Show progress, allow cancellation, and preserve completed results if processing stops.

Target initial desktop figures within 10 seconds and complete processing within 2 minutes on a stated reference device.

These are performance targets, not verified guarantees. Measure mobile performance separately.

Never report an incomplete search or export as complete. Include completion status and remaining work in the manifest.

## 13. Acceptance criteria

| Area | Completion evidence |
|---|---|
| Automatic workflow | A fresh import produces figures and an export package without chart selection or a known question. |
| Data integrity | Fixtures show preserved source values, reported parse failures, and explicit conversions. |
| SQL | Fixtures cover each supported operation and verify results, including nulls and duplicate join keys. |
| Candidate coverage | Small fixtures produce the expected complete candidate set for the documented grammar. |
| Candidate accounting | Every generated candidate has an explicit outcome. Exclusions include reasons. |
| Discovery | Known unusual patterns appear in the unusual-pattern list. Distinct highlights include explanations. |
| Statistics | Reference cases verify test selection, assumptions, effect sizes, and BY correction. |
| Statistical calibration | Synthetic null datasets verify false-discovery behavior under the stated assumptions. |
| Publication export | Format checks and visual inspection verify editable artwork and legibility at final size. |
| Journal presets | Every enforced rule has a journal-specific source and a verification date. |
| beamdswitch | The tested parser accepts the document, and the renderer displays its figures correctly. |
| Timelines | Fixtures cover point events, intervals, uncertain dates, and duplicate events. |
| Reproduction | A saved project reproduces figures and statistical results with the recorded inputs and settings. |
| Mobile | Real-browser tests complete the full workflow with touch input and mobile downloads. |
| Performance | Benchmarks state devices, browsers, dataset sizes, elapsed times, and resource limits. |
| Failure recovery | Cancellation and resource-limit tests preserve results and report incomplete work accurately. |

## 14. Handoff

The next agent must turn this specification into a concrete implementation plan before implementation.

The plan must define the finite grammar, ranking rules, hypothesis families, SQL dialect, test catalog, resource policy, and verification fixtures.

Treat these as engineering choices within the agreed requirements. If a choice changes a requirement, return it to the user.

Keep requirements, recommendations, verified facts, and performance targets distinct.

## 15. Agreed decisions

Sections 1 to 14 are the specification as written. This section records the plan the captain approved on
2026-10-05 ("Approve and build"), with his answers, and the engineering choices that section 14 asks for.
Labels: **[Req]** a requirement above, **[Choice]** an engineering choice, **[Fact]** verified on the date given,
**[Target]** a performance target, not a guarantee. A change found while building a step is marked **[Changed in
step n]** with its evidence.

### Answers

1. Build and deploy: build it, and deploy after each merged step. Each version before the last is a preview that
   lists the steps still to come.
2. Home: `viz/data-workbench` in yujieteo/visuals, live at <https://teoyujie.org/visuals/data-workbench/>.
3. Engine: DuckDB-WASM, with the workbench's own JavaScript for charts, statistics and PDF. Statistics are checked
   against SciPy reference values.
4. Seven pull requests, in the order of "Steps" below.
5. Without study details, tests run tagged "independence assumed, not confirmed", and are refused where the data
   contradicts independence (a repeated identifier, serial correlation).
6. Science preset: the captain sends a saved PDF of the Science instructions page; until then every Science rule
   shows as unverified.
7. Phone limits: emulated phones in test browsers, labelled as such, plus a "Measure this device" button; the
   captain runs it once on his phone and the result is published as the real-phone row.

### Steps

| Step | Scope | Status |
| --- | --- | --- |
| 1 | Import and inspect: CSV and Parquet import, profiles, suspected errors, suggested corrections with approval, the resource preflight, progress and Cancel, built-in examples | built |
| 2 | Charts and candidates: the chart specification and its validator, grammar v1, the candidate enumerator and its accounting, the SVG renderer and timelines, the gallery and edits | built |
| 3 | Statistics and ranking: study metadata, test catalogue v1, families, Benjamini–Yekutieli, independence checks, ranking, redundancy, both lists and highlights | built |
| 4 | Publication figures: SVG, PDF and PNG writers, fonts, the General, Nature and Science presets, figure checks | built |
| 5 | Export package and beamdswitch: the one-operation zip, report.md, the JSON files, the manifest, deck.md, project save and reopen | to come |
| 6 | SQL and table algebra: the SQL editor, visual controls, the statement whitelist, transformation records, join diagnostics | to come |
| 7 | Phones, speed and acceptance: touch tests, the 1 million row benchmark, phone limits, "Measure this device", the section 13 table | to come |

### Architecture [Choice]

- One folder, a standard-library `build.py` that joins `src/` modules into `index.html`, with the shared kit
  (`scripts/kit/kit.js`), the style tokens and the beamdswitch template inlined unchanged.
- DuckDB-WASM 1.33.1-dev57.0 (DuckDB v1.5.4), exception-handling build, one thread, in a Web Worker. Its worker,
  its engine file and DuckDB's signed Parquet extension are pinned in `downloads.json` by URL, bytes and SHA-256;
  the site fetches them and publishes them in `runtime/`. The page's main thread runs the DuckDB-WASM client and
  the Apache Arrow 17.0.0 bundle, both vendored unchanged in `vendor/`.
- Lockdown at start: memory limit, `LOAD parquet` from the page's own `runtime/extensions/`, then autoloading and
  autoinstalling off, `allowed_directories = ['dw/']`, external access off, configuration locked. Files are
  registered as browser File handles under `dw/`. **[Changed in step 1]** The plan said to turn external access
  off once files were registered; the engine then refuses the registered files too, so `allowed_directories`
  names the folder of registered files. The plan did not list Parquet as an extension; in DuckDB 1.5.4's browser
  build it is one, fetched from extensions.duckdb.org by default, so it is pinned and served from the folder.
- Pure modules testable in Node with the pinned engine: SQL, inference, profiles, preflight, SHA-256, examples,
  the report. The folder's checks fetch the pinned engine (and DuckDB-WASM's blocking Node build of the same
  release) by SHA-256 into the ignored `build/`, so the engine is exercised in CI, not only locally; the folder's
  browser checks stage the page with its engine and run in every CI browser project.
- No runtime request leaves the folder; the page opens from the site, not from `file://`.
- WebMCP: `get_metadata`, `get_state`, `get_markdown` (the kit), `get_tables`, `get_profile`, and from step 2
  `get_candidates` (the accounting, each candidate's outcome and reason, one specification by id); step 3 adds
  `get_findings`. No tool returns rows or plotted points; the page says that an agent the person connects can read
  what the tools return.
- Charts (step 2): `src/grammar.js` (classes, candidates, the count), `src/chartspec.js` (the specification, its
  JSON Schema, the rules, edits), `src/chartsql.js` (every chart query), `src/charts.js` (the fixed rules on the
  data, one candidate's outcome), `src/render.js` (the scene graph in millimetres and its SVG), `src/gallery.js`
  (the gallery, the full-size view and its edits). [grammar.md](grammar.md) documents grammar v1 and is published
  beside the page.
- Statistics (step 3): `src/stats.js` (the distributions, tests T1 to T8, Benjamini–Yekutieli, the descriptive
  measures), `src/statsql.js` (what the engine computes for them), `src/family.js` (members, independence, the
  tests, the adjustment), `src/rank.js` (features of a drawn chart, scores, both lists, redundancy, highlights,
  explanations), `src/findings.js` (the Findings section, the study details, subset families, `get_findings`).
  [catalog.md](catalog.md) documents test catalogue v1, the family and the ranking, and is published beside the
  page. The highlight count is view state in the URL (`highlights`, 0 to 50, default 6).
- Publication figures (step 4): `src/figure.js` (the presets with their dated sources, settings, size and style,
  every check), `src/fonts.js` (font faces, widths, the SVG file with its font), `src/pdf.js` (the PDF writer
  and reader), `src/png.js` (the canvas painter, pHYs, the PNG reader), `src/publish.js` (the panel of the
  full-size view). pdf-lib 1.17.1 and @pdf-lib/fontkit 1.1.1 are vendored unchanged in `vendor/` and inlined;
  Liberation Sans 2.1.5 (Regular and Bold, from its release archive pinned by SHA-256) is published beside the page
  in `vendor/liberation-fonts/` with its licence and read on first use.

### SQL dialect [Choice]

DuckDB SQL of the pinned version, restricted to a documented whitelist: SELECT, WITH, WITH RECURSIVE, CREATE [OR
REPLACE] VIEW and CREATE TABLE … AS for derived names, PIVOT and UNPIVOT, DROP of derived objects. Refused with a
message: INSERT, UPDATE, DELETE and ALTER on imported tables, ATTACH, COPY, EXPORT, INSTALL, LOAD, PRAGMA, SET
(outside a whitelist), transactions, any URL or file path in table functions, NATURAL JOIN (joins are explicit; JOIN
… USING and ON are allowed). Imports are read-only base tables with a hidden source ordinal column (`__row`).
reshape = PIVOT and UNPIVOT only. Rules: SQL three-valued logic; NULL never matches NULL in joins unless IS NOT
DISTINCT FROM is written; aggregates skip NULL and the record shows COUNT(*) beside COUNT(col); GROUP BY keeps a
NULL group; ORDER BY defaults to NULLS LAST, stated; tables are unordered unless ordered, and every table shown or
exported has an explicit order (by default `__row`); CAST failures fail the query, TRY_CAST failures become NULL
and are counted as conversion failures; visual controls always emit TRY_CAST and log failures. Every
transformation record has its id, kind, inputs, parameters, SQL, output schema, rows in and out, and for joins the
unmatched keys per side (a count and up to 20 examples), duplicate-key counts per side and the row multiplication
factor (flagged above 1). Custom SQL the controls cannot represent is kept verbatim as a custom node. (Step 6.)

### Types and semantic roles [Choice] (step 1)

- Source type: a CSV is read as text, every value kept as written in the source table; a Parquet file keeps its
  physical and logical types.
- Inferred type: the most specific reading that at least 95% of the values present fit, in the order yes or no,
  whole number (also with "," thousands separators), decimal, ISO date, ISO date-time with an offset (ordered in
  UTC) or without one (zone unknown, never shifted), time, one other date layout (DD/MM/YYYY, MM/DD/YYYY,
  YYYY/MM/DD, DD-MM-YYYY, MM-DD-YYYY, DD.MM.YYYY, D Mon YYYY, Mon D YYYY); otherwise categorical (at most 1,000
  levels and fewer than half distinct) or text. The share is shown as the uncertainty. A layout that reads the
  column alone is used; two layouts that both fit (day and month order), or two mixed in one column, wait for
  approval. A reading never changes the table: it is an expression the analysis uses.
- Missing: NULL and blank values. Markers (NA, N/A, #N/A, null, none, NaN, nil, -, --, ?, .) are counted apart and
  become missing only after approval.
- Roles: measure, identifier, category, ordered category, time, event label, interval start, interval end,
  unknown, each with its reasons and how sure the rule is. Identifier: a name with id, key, code, uuid, guid, zip,
  postal, sku and similar words (on whole numbers or text), numbers with leading zeros, UUIDs, or at least 95%
  distinct values that are fixed-length text, whole numbers with the same number of digits, or whole numbers that
  run nearly without gaps. **[Changed in step 1]** The plan's rule "unique ratio at least 0.95 with integer
  values" alone would have made every unique measure, such as a population count, an identifier; the gap and
  digit-count conditions keep those measures. Year-like whole numbers (1000 to 2999) are never identifiers and are
  flagged as possible time, with a suggestion. Numbers with 2 to 12 distinct values are ordered categories. A
  storage type alone never makes a measure.
- Suspected data errors, apart from unusual values: values that do not read as the column's type, impossible
  dates (2026-02-30), sentinels (-1, -9.99, -999 and similar in a field whose other values are all zero or more;
  999 and above when at least ten times the field's other maximum), and CSV lines the reader cannot read (too few
  or too many fields), listed with their line number and the line as written. Unusual values: robust z = |x −
  median| / (1.4826 MAD) above 3.5. Nothing is removed or filled automatically.
- Corrections that change meaning (a date layout, a marker or sentinel as missing, a type, a role, a unit) are
  suggested and applied only after approval, each logged with its effect; "Return to the inferred reading" undoes
  a column's changes.
- **[Changed in step 2]** A text column whose values are dates known to the year, the month or the day (`1850`,
  `c. 1850`, `1851-03`, `1860?`, at least 95% of the values present) reads as dates with the reading "dates to the
  year, month or day": each value keeps its precision and its qualifier as written, and orders by the first day of
  its span. The plan's timeline rules need this precision; without it such columns read as text and no timeline
  could keep "c. 1850" (tests/charts-engine.test.mjs, "timelines: dates known to the year or month").

### Finite grammar v1 [Choice] (step 2)

Field classes: Q (numeric measure, at least 13 distinct values), C (categorical, boolean or numeric with 2 to 12
distinct values; at most 1,000 levels), T (date or date-time, at least 2 distinct), L (label: a text field with a
distinct ratio of at least 0.5), excluded (identifier, text above 1,000 levels, constant, all missing, nested
Parquet types), each exclusion with its reason. Single field: histogram (Q) and box plot (Q); bar of counts (C);
count time series (T). Pairs: scatter (Q, Q) and binned heatmap (Q, Q); box by group (C, Q) and mean bar with 95%
CI (C, Q); count heatmap (C, C); mean time series (T, Q); period-by-category count heatmap (T, C). Timeline bindings:
point timeline (T, L); interval timeline (T start, T end, L) where end is at or after start in at least 90% of rows
with both present. Fixed rules: bins by Freedman–Diaconis clamped to 5–100 (40×40 for binned heatmaps); a log10
axis only when all values are above 0 and P99/P1 is at least 1,000; bars start at zero; categories: the top 29 by
count plus "Other" (top 12 for groups and heatmap axes); time period: the coarsest of hour, day, week, month,
quarter or year giving at least 20 periods, capped at 500; aggregation is the mean with n per bin (a sum only when
the person marks a field additive); scatter draws all points up to 50,000, else a seeded sample of 50,000,
labelled; timelines hold up to 500 events a figure and split by time order beyond. The field earlier in column
order is x. Count per table: 2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + timeline bindings. Facets are a user
control only (a C field with at most 12 levels). Outcomes: valid, excluded (rule and reason), failed (error),
incomplete (cancelled or resource limit). The grammar version is recorded in every specification.

**[Built in step 2]** [grammar.md](grammar.md) holds every rule as built. Where the plan left a choice or changed:

- **[Changed in step 2]** T also holds dates known only to the year or month (the reading above) and whole
  numbers from 1000 to 2999 whose role is time (years). Times of day are excluded: the plan's T is dates and
  date-times. A role decides before the type: an identifier is excluded, an event label on text is L, a category
  or ordered category is C; numbers in another role (interval start, event label) are excluded with that reason.
- **[Changed in step 2]** The plan's "timeline bindings" term is exact: tl point timelines and C(t,2)·l interval
  timelines, each pair of time fields once; the start is the field whose role is interval start, else the earlier
  column. An end's span counts in the 90% rule, so `1850` ends at or after `1850-06-01`.
- Excluded in step 2: an invalid specification, no row with every field present, and the interval rule. The
  ranking's rejections (fewer than 5 complete rows, zero variance) come with step 3.
- Rows with a field missing (empty, a marker, a value that does not read) are left out of that chart and counted
  on the figure; nothing is filled.
- Other is drawn as "Other (k levels)", grey. Ordered categories (numbers, yes or no, dates, the role ordered
  category) keep their value order; others are ordered by count. Bars of an unordered category are horizontal.
- Box plots: whiskers to the most extreme values within 1.5 × IQR of the quartiles; at most 200 distinct values
  beyond them are drawn a box, the rest counted.
- **[Changed in step 2]** Periods: never finer than the values allow (a date has no hours; years only years);
  weeks start on Monday; values with an offset are grouped in UTC. The plan's cap of 500 periods had no unit
  beyond the year, so a span of more than 500 years is counted by decade, century or millennium, stated on the
  figure (tests/charts-engine.test.mjs, "a span of more than 500 years"). With dates of mixed precision, a unit is used
  only when at most 5% of the values are too coarse to place in it, and those are counted on the figure, not
  drawn; otherwise a year-only value would sit in January.
- Facets: one panel a level on shared scales; timelines are not faceted.

### Chart specification [Choice] (step 2)

JSON with data (table id), transform (ordered transformation record ids), encoding, scale, layout (size in mm,
facets) and annotation (title, labels, units only from the source or the person, caption, notes, findings). A JSON
Schema validates each specification before it is drawn; the same specification drives generation, comparison,
editing and export.

**[Built in step 2]** Version 1 (`src/chartspec.js`, `SCHEMA`): `transform` holds the chart's own operations as
records with ids (complete, bin, bin2d, box, top, period, aggregate, sample, merge-duplicates, order-check, page);
step 6 adds references to table transformation records. `edits` lists each change the person made. After the
schema, the rules are checked: each channel's field and class, a log scale only over values above 0, bars from
zero on a linear axis, a facet of at most 12 levels not already encoded, a sum only of a field the person marked
additive. Figures are 180 mm wide (the general preset's width) and 110 mm tall (timelines 140 mm), drawn as a scene
graph in millimetres and written as SVG with every label a `<text>`; step 4 writes the same scene graph as PDF and
PNG. They are white paper with one blue for marks and a light-to-dark blue for counts (the dataviz reference
palette's light steps), text at least 6 pt and lines at least 0.5 pt, in both page themes, as they will export.

### Ranking [Choice] (step 3)

Rejection (excluded, never ranked): an invalid specification; fewer than 5 complete rows; zero variance on an
encoded field; a log scale over values at or below 0; a bar not starting at zero. Scores (each logged): usefulness
= min(1, effect / large), with large = |rho| 0.5, Hedges |g| 0.8, omega-squared 0.14, Cramér's V 0.5, |Kendall tau|
0.5, a level shift of 2 long-run SD; single-field shape: |skewness| at least 2, a bimodality coefficient above
0.555, or a rare-value share. Information density: the share of non-empty bins or cells (a penalty below 20%).
Readability penalties: label collisions after layout (0.1 each, at most 0.3), more than 12 categories (0.1),
scatter overplotting (0.1). Misleadingness penalties: groups with n below 5 shown (0.2), more than 30% missing on
encoded fields (0.2), a sample instead of all rows (0.05). Unusualness = usefulness × complete-row share −
penalties; ties by candidate id. List 1, "Unusual patterns", orders by it. List 2, "Statistically supported
patterns": a valid test with an adjusted p-value of at most 0.05, ordered by adjusted p, then effect. Redundancy:
the same hypothesis (field set and pattern class), or fields that substitute (|rho| or V at least 0.95); each
candidate has a redundancy cluster id. Distinct highlights per list: greedy from the top, skipping a candidate in a
chosen cluster or sharing more than one field with a chosen one; 6 by default, 0 to 50 by choice; fewer when fewer
distinct exist, stated. Each highlight separates "Observed" (the numbers) from "Why highlighted" (the rule scores)
and carries fixed non-causal cautions. No causal claims, invented units or meanings.

**[Built in step 3]** [catalog.md](catalog.md) holds every rule as built. Where the plan left a choice or changed:

- The rejections are chart outcomes (`Charts.evaluate`): fewer than 5 rows with every field present (an interval
  timeline: a label and at least one end), or one value only in an encoded field other than labels, excludes the
  chart with its reason before it is computed. They change outcomes, not the candidate set, so grammar v1 and its
  fixtures stay.
- Sizes the plan left open: the density penalty is 0.1; a rare-value share is large at 1% of values with robust z
  above 3.5; for a bar chart, the rarity of its rarest level, 1 − k · its share, is large at 0.95 (scored for at
  most 29 levels); a bimodality coefficient above 0.555 scores 1, else 0; a count time series is scored by the
  trend and largest shift of its counts, a period-by-category heatmap by Cramér's V with the periods as levels;
  timelines have no effect measure and score 0. Overplotting: more than half the points fall in a cell of one
  mark's width already holding one (`Render.render` counts them). Small groups: a box or mean bar, or a period of a
  mean time series, of fewer than 5 rows.
- A chart in list 2 is ordered by the smallest adjusted p-value of its supported hypotheses (a mean time series has
  two). The lists need a complete family whose charts have not been drawn again since; otherwise they are hidden,
  with a button to run the statistics again. An engine error in any member leaves the family incomplete.
- **[Changed in step 3]** Values the profile flags as stand-ins for no value (open sentinel suggestions, such as
  -999) are left out of every statistic and counted on the finding; the figure still draws them, and dismissing the
  suggestion makes them values again. Section 3 asks to
  show suspected data errors apart from patterns in usable data: with them, the five -999 values of the planted
  example's temp_c gave it a skewness of −19.8, the most skewed field of the table; without them, 0.04
  (tests/findings-engine.test.mjs, "discovery").

### Hypothesis families and test catalogue v1 [Choice] (step 3)

One family per analysed table per run (each imported table automatically, each query result the person selects,
each facet subset the person opens as a new named family). Members are enumerated from the schema and the grammar
before any test, ranking or highlight: Q×Q Spearman; C×Q Welch t (2 groups) or Welch ANOVA (3 to 12 groups); C×C one
independence hypothesis (chi-square, Fisher or permutation by eligibility); T×Q trend and level shift. Hypothesis id
= hash(table, pattern class, sorted field ids, grammar and catalogue versions). Members that fail eligibility are
listed "not tested: reason" and are not counted in m; m = tests that passed validation and ran. BY over the
family; raw and adjusted p reported; the label is "adjusted p-value"; adjusted p at most 0.05 is exploratory
evidence. Catalogue: T1 Spearman (at least 10 complete pairs, each field at least 5 distinct; Fisher-z CI with the
Bonett–Wright SE); T2 Welch t (each group n ≥ 5, variance above 0, normality support: n ≥ 30 a group or |skewness|
≤ 1 and no robust z above 5; Hedges g with CI); T3 Welch one-way ANOVA (3 to 12 groups; omega-squared); T4
chi-square independence (n ≥ 20, every expected count ≥ 1 and 80% ≥ 5, no continuity correction; bias-corrected
Cramér's V); T5 Fisher exact (2×2 failing T4's rule; odds ratio with CI); T6 permutation test (r×c failing T4's
rule; 10,000 permutations, seed recorded, p = (b+1)/(R+1), Monte Carlo SE); T7 Mann–Kendall with Hamed–Rao
correction (at least 12 regular periods; Sen's slope with CI); T8 level shift (at least 20 periods; CUSUM with
Bartlett long-run variance, bandwidth floor(4(n/100)^(2/9)), p from the Kolmogorov distribution). Independence
evidence: an identifier repeating in at least 10% of its values, or lag-1 autocorrelation above 0.3 with p below
0.01, makes T1–T6 for the affected fields "not tested: independence contradicted". Optional study metadata:
independent observations (yes, no, unknown), repeated measurements, sample design. Reference values come from
SciPy, statsmodels and pymannkendall through a pinned `tools/` script; calibration uses at least 200 synthetic null
datasets per seed and 3 fixed seeds.

**[Built in step 3]** [catalog.md](catalog.md) holds every rule as built, with its references and calibration.
Where the plan left a choice or changed:

- **[Changed in step 3]** T7 uses the Hamed–Rao correction of lags 1 to 3, and the correction never narrows the
  variance (pymannkendall `hamed_rao_modification_test(lag=3)`, the original test where the factor falls below 1).
  The plan's reference, pymannkendall's default of every lag, rejected 8.4% and 8.5% of 3,000 simulated trend-free
  series of 24 and 60 periods at the 5% level; this correction rejected 4.3% and 4.5%, and stays within the bound of
  tests/calibration.test.mjs.
- T8 as planned is conservative with few periods (0.3% of trend-free 24-period series rejected at 5%): the planted
  example's sales shift, over 24 months, has a raw p of 0.025 and is not supported after the adjustment; it leads
  the unusual-pattern list by its effect (14 long-run SDs).
- T×Q tests use the period means of the mean time series' rule; a series is regular when at most 10% of the periods
  between its first and last are empty. A category of more than 12 levels is tested with its 12 most frequent
  levels and Other, as drawn. T5's interval is Woolf's, unbounded when a cell is 0 (SciPy answers NaN there). T6
  draws each random table as multivariate hypergeometric rows, seeded by the hypothesis id's first 8 hex digits.
- Serial correlation is checked for each measure in the order of each time field: p = P(Z > (r1 + 1/n) √n). With no
  time field, row order is not taken as time order. The identifier rule counts values that repeat an earlier one.
- Study details are each table's own. "Yes" tags the tests "Independence stated by you" but never overrides the
  data's checks; a stratified or convenience design adds a caution to every result.
- A category of more than 12 levels against a measure is not tested (T3 takes 3 to 12 groups); its effect uses its
  groups as the chart draws them, the 12 most frequent and Other.
- A subset family (one level of a category of at most 12 levels) has its own ids, tests and adjustment, and is shown
  apart: the two lists rank the table's charts only.

### Resource policy [Choice] (step 1)

- Budget: 2 GiB on a desktop; 512 MiB on a phone, provisional until step 7 measures phones; 1 GiB on another
  device; at most a quarter of `navigator.deviceMemory` where the browser reports it. The person may choose a
  smaller budget before the engine starts; the engine's memory limit is the budget.
- Estimate: **[Changed in step 1]** the plan's 1.5 × the CSV size and the Parquet size before compression
  underestimated what DuckDB holds. Measured on 2026-10-05 with the pinned engine (tests/engine.test.mjs, "memory
  estimate"): a CSV read as text takes 2.26–2.35 × its size, and a Parquet file 4.0–4.3 × its size before
  compression. The estimate is therefore 2.5 × a CSV's size, and for Parquet 16 bytes a value (rows × columns, with
  the row column) plus its size before compression.
- **[Changed in step 1]** Imported tables may fill at most half the budget: profiling one 3-million-row column
  needed more than the rest of a 256 MiB budget in a browser while its table took 72 MB. The other half is working
  room for the queries that profile, and queries that hold every value (distinct counts, quantiles, the median
  absolute deviation) run one at a time.
- Preflight before each import: a file whose estimate does not fit what is left is refused before anything is
  imported, with three choices: a seeded sample of rows that fits (seed 20261005, labelled as a sample
  everywhere), fewer columns (chosen by the person), or skip. Never a silent cut. A queued file's choice is checked
  again just before its import, against what earlier imports left: a sample shrinks to fit; any other choice that no
  longer fits waits for a new one.
- Progress with counts; Cancel at any time stops the running query; completed tables and profiled columns are
  kept; a cancelled read keeps nothing; an incomplete table says why and offers to profile the rest. A query that
  reaches the memory limit fails with its reason, never with a partial table. After an import reaches the limit, the
  file is offered again as a sample or fewer columns, sized for twice the estimate that proved too low.
- Caps for later steps: 10,000 candidates a table, 50,000 scatter points, 40×40 or 13×13 heatmaps, 500 timeline
  events a figure, PNG canvases of at most 16.7 megapixels.
- [Target] first figures within 10 s and complete processing within 2 min for 1M rows × 50 columns (250 MB) on the
  reference device (Apple M5, 16 GB, Chrome stable). Step 1 measured, in Node with the pinned engine on that
  machine: 1,000,000 rows × 15 columns (89 MiB CSV) imported in 0.7 s and profiled in 20 s.

### Timelines, publication figures, export, mobile [Choice] (steps 2, 4, 5, 7)

- Timelines: values with an offset are ordered in UTC and shown in their source offset; naive timestamps are "zone
  unknown" and never shifted; date-only values stay dates. Precision (year, month, day, time) and qualifiers (c.,
  circa, ~, ?) are kept; a year-only date draws as a hatched span; no invented day. A missing end or start is drawn
  open to the axis edge and labelled. The same label at the same date merges into one mark with a count.
  **[Built in step 2]** A month-only date is a hatched span over its month too; qualified dates draw open or dashed;
  the merge key is label, date, precision and qualifier; a row whose end comes before its start is counted and not
  drawn; labels that find no room are counted and their marks drawn in a strip at the bottom; 500 events a figure,
  in time order, with the next page in the full-size view.
- Publication figures: a scene graph to SVG (text as `<text>`), PDF (pdf-lib with fontkit, TrueType subsets as real
  text, MediaBox in mm) and PNG (canvas at the set dpi, pHYs set). An Arial-metric open font (Liberation Sans or
  Arimo) is vendored with its licence; the person may load their own. Presets: General (180 mm, 300 dpi, text at
  least 6 pt, lines at least 0.5 pt), Nature (from its figure guide, each rule with journal, stage, source URL,
  date and status), Science (answer 6). Checks per figure; no compliance claim while a required check is
  unverified.
  **[Built in step 4]** The full-size view of a chart has a "Publication figure" panel. Its settings hold for every
  chart of the page: the preset, width and height in mm (empty: the chart's own width, and its proportions), PNG
  dpi, the title and caption in the artwork or in a legend beside it, and the font. The figure is drawn by them, its
  SVG, PDF and PNG are written at once, read back and checked, and each download is the file that was checked.
  - Font: Liberation Sans 2.1.5, chosen over Arimo because its release ships static Regular and Bold TrueType files
    (Arimo's current release is a variable font). Its advance widths, rounded to thousandths of an em, equal the
    Helvetica table step 2 measures with (tests/figures.test.mjs), so a general figure is drawn exactly as step 2
    drew it. The person's TTF or OTF files (a face of weight 600 or more is the bold one) replace it; text is then
    measured in their font.
  - PDF: one page, MediaBox the size in mm at 72 points a 25.4 mm; every text a text-showing operator in an
    embedded subset (Type 0, CIDFontType2, FontFile2 for TrueType outlines), with a ToUnicode map, no ligatures or
    kerning, so the text stays editable and searchable; marks as paths in DeviceRGB; translucency in an ExtGState.
    poppler's `pdffonts` lists the fonts as "CID TrueType, embedded"; its "sub" column says no because pdf-lib names
    a subset without the six-letter tag, though the font file holds only the glyphs used.
  - PNG: the scene painted on a canvas at dpi / 25.4 px a mm, a pHYs chunk (pixels a metre) right after IHDR
    replacing the browser's, every CRC checked when read back; above 16.7 megapixels the PNG is refused with the
    reason and the SVG and PDF stay.
  - **[Changed in step 4]** SVG: the downloaded file holds each face its text uses, whole, in an `@font-face`
    (fontkit's subsets have no character map, so a browser cannot use them). "Fonts embedded" passes for SVG only
    when the file, read back, holds fonts fontkit reads that map every character of its text to a glyph; the text
    stays `<text>` and names the family, which drawing programs that ignore `@font-face` take from the installed
    fonts.
  - Glyphs: a character of the figure that the font has no glyph for fails the scene's "Glyphs" check, and it names
    the characters; without a font file the check is unverified.
  - General preset: the workbench's own rules (sections 9 and 15): 180 mm or the set width, 300 dpi, text at least
    6 pt, lines at least 0.5 pt, fonts embedded and text as text, RGB, a palette that stays distinct with protanopia
    and deuteranopia (Viénot, Brettel and Mollon 1999; ΔE76 at least 10 between mark colours, the colour scale's
    lightness in order), text contrast at least 4.5:1 against what is under it, marks at least 3:1 against the
    paper, nothing past the page edge, no overlapping texts (each text's box from its font, 0.75 em above the
    baseline and 0.21 below, rotation included).
  - **[Fact]** Nature, read on 2026-10-06 from the research figure guide's "Preparing figures – our
    specifications" and "Building and exporting figure panels" (copies kept with the step 4 evidence): widths 89 mm
    (single column) and 183 mm (double column); maximum height 170 mm; all text 5 to 7 pt, panel labels 8 pt bold
    lowercase; standard sans-serif fonts, preferably Helvetica or Arial; do not outline text; embed fonts (TrueType
    2 or 42, not Type 3); avoid coloured text, background gridlines and patterns; axis lines, tick marks and every
    axis labelled with its unit in parentheses; an accessible palette; RGB; main figures as PDF, EPS or AI
    (preferred), SVG acceptable, PNG not accepted; images at least 450 dpi in exported artwork; files at most 50 MB.
    The guide names no submission stage: the preset records "figures of primary research content prepared for
    publication".
  - **[Changed in step 4]** The Nature preset draws in its own style: text 5.5 to 7 pt, black, no gridlines, dates
    known only to the year or month as light spans instead of hatching, and the title and caption in the legend
    beside the figure (the guide keeps legends outside the artwork); 183 mm and 450 dpi by default. A figure in
    Liberation Sans gets "unverified" on the font rule (an Arial-metric substitute, not Arial or Helvetica), and an
    axis of a measure with no unit from the source or the person gets "unverified" on the axis rule: the workbench
    never invents a unit. The check reads the axis title as drawn: a known unit cut off from a shortened title fails.
    So a figure claims Nature compliance only in Arial or Helvetica with every unit given.
  - Science (answer 6): science.org answered HTTP 403 again on 2026-10-06, so every Science rule (sizes, text and
    fonts, formats, resolution, colour and lines) is unverified and no figure claims Science compliance; until the
    captain's saved page is read the figure is drawn with the general preset's values and checked by its rules.
  - **[Changed in step 4]** Translucent scatter points (more than 1,000 points are drawn at 45% or 25% opacity so
    that overlaps show density) make the 3:1 mark check "unverified" rather than a pass or a failure: one point
    alone is below 3:1, overlapping points reach it, and the person judges it at final size.
  - Statuses: pass, fails, unverified, does not apply; each check names its rule, the rule's source and the date
    it was read. A file meets a preset only when every check that applies passes.
- Export package: one zip with every valid figure in the requested formats, report.md, highlights.json,
  specifications, transforms.json, stats.json, validation.json, manifest.json (source SHA-256 and sizes, the build,
  DuckDB-WASM and DuckDB versions, grammar and catalogue versions, preset sources and dates, the beamdswitch parser
  and renderer commits tested, browser, seeds, completion status, remaining work), deck.md (beamdswitch, voice
  bf_emma, highlighted figures as base64 SVG images, statistics in LaTeX), project.json, and the source files only
  when the person opts in. Reopening checks source hashes.
- Mobile: one column under 768 px; touch targets of at least 44 px; every detail also on tap; a full-size chart
  viewer with pinch zoom; the SQL editor as a plain text area; the file input accepts .csv and .parquet; downloads
  through a blob link.

### Verification fixtures (step 1 part)

- Data integrity: `examples/messy.csv` (a byte-order mark, a quoted line break, a short and a long row, thousands
  separators, NA markers, an impossible date, ambiguous and mixed date layouts, zero-padded ids, -999 stand-ins, a
  value that is not a number) and a Parquet file written at test time (decimals, zoned timestamps, a nested column
  and a list, both excluded with their reason, numbers stored as text, a constant column).
- Identifiers against measures: a generated table with an id name, zip codes with leading zeros, a row number,
  fixed-length codes, a unique population count (a measure), prices, years (a measure flagged as possible time),
  ratings and scores.
- The preflight refusal (unit and in every browser project), a seeded sample's determinism, the memory estimate
  against what the engine holds, the memory limit, Cancel while reading, and a first import benchmark.

### Verification fixtures (step 2 part)

- Exact candidate sets with outcomes and reasons: `tests/fixtures/small.csv` (2 Q, 1 C, 1 T, 1 identifier, 1 label:
  16 candidates, all valid) and `tests/fixtures/timeline.csv` (4 T, 1 L: 14 candidates, 4 interval timelines
  excluded by the 90% rule), with `*-candidates.json`; the planted example (155 candidates, all valid).
- Accounting: the enumerated set equals the formula for many class counts, every candidate gets one outcome, and
  candidates beyond the 10,000 cap are counted by kind (tests/charts-rules.test.mjs).
- Timelines: point events, intervals, dates known to the year or month with qualifiers, missing starts and ends,
  an end before its start, duplicates merged with their count, the same label at two dates, offsets ordered in UTC
  and naive values unshifted, 1,200 events in three figures (tests/charts-engine.test.mjs).
- Rules on the engine: the log rule and Freedman–Diaconis bins on the log axis, 29 levels and Other, a seeded
  scatter sample of 50,000, means with their t intervals against direct SQL, a sum of an additive field, facets.
- Time to the first figures, measured on 2026-10-06 on the reference device (Apple M5, 16 GB): the planted example
  (2,000 rows × 15 columns) shows its first figure 1.3 s after the click in Chrome (Playwright Chromium) and all 155
  candidates after 2.3 s; in Node with the pinned engine, 100,000 rows × 15 columns give the first figure 2.5 s
  after the import began and all 160 candidates after 26 s. The 1 million row target is step 7's.
- **[Changed in VISU-46]** The 100,000-row chart benchmark reports both elapsed times, the Node version and
  platform, and whether the 2-minute target was met; timing is informational, not a shared-runner pass condition.
  The target still applies to the stated reference device. Evidence: main commit `2142b65`, CI run `37424906921`,
  generated 160 valid candidates but failed only because completion took 120.61 s. Candidate accounting remains
  required; pending, failed or incomplete charts and a missing or invalid first-figure measurement still fail.
  `tests/chart-benchmark.test.mjs` checks the target boundary and replays 120.61 s and 122.66 s without sleeping.

### Verification fixtures (step 3 part)

- Reference cases (tests/stats.test.mjs): every distribution, test, effect and interval of T1 to T8, and
  Benjamini–Yekutieli, against `tests/fixtures/stats-reference.json` (SciPy 1.13.1, statsmodels 0.14.6,
  pymannkendall 1.4.3, NumPy 2.0.2); the same data through the page's SQL with the pinned engine
  (tests/findings-engine.test.mjs), including DuckDB's skewness and kurtosis against SciPy's.
- Calibration (tests/calibration.test.mjs): 3 seeds × 200 null tables, any adjusted p-value at or below 0.05 in 0% to
  2% of families and each test's raw rate within its binomial bound; with planted effects, a mean false discovery
  proportion of 0.8% to 1.3%.
- Discovery (tests/findings-engine.test.mjs): the planted rare region, cluster of unusual weights, dose–response,
  group difference and level shift each have unusualness 1 and lead the unusual-pattern list; the dose–response and
  the group difference are statistically supported; every highlight is explained, Observed apart from Why
  highlighted; the -999 stand-ins are left out and counted.
- Hypotheses once: the family has C(q,2) + qc + C(c,2) + 2tq members with distinct ids, stable across runs; the
  scatter plot and binned heatmap of a pair share one; m counts the tests that ran; one adjustment over the family.
- Independence, study details, the rejection rules, a subset family (tests/findings-engine.test.mjs); the ranking's
  penalties, orders, clusters and highlights (tests/rank-rules.test.mjs); the page in every browser project
  (e2e/full.test.mjs).

### Verification fixtures (step 4 part)

- tests/figures.test.mjs, on one chart of each of the 12 kinds the planted example gives, through the pinned engine:
  every Nature rule verified with its URL and the date, every Science rule unverified; Liberation Sans' widths equal
  step 2's table and the general style draws the same SVG as step 2; under the general preset every kind meets its
  checks as PDF and SVG (MediaBox 180 mm, Type 0 CIDFontType2 fonts with FontFile2, a text-showing operator for
  every text, no CMYK; a `<text>` for every text and an `@font-face` whose font maps every character in the SVG), except the scatter plot's
  translucent points, unverified; under Nature 183 mm, at most 170 mm, text 5 to 7 pt in black, no gridlines or
  patterns, the title in the legend, the font unverified, PNG refused as a format, Arial and a unit passing, 120 mm
  failing; under Science every rule unverified; a scene with overlapping, clipped, too small and pale text, a thin
  line and red with green fails each check; pHYs written after IHDR, replacing an earlier one, every CRC holding;
  the 16.7 megapixel limit; a timeline's light spans under Nature; an SVG whose font is a fontkit subset with no
  character map fails "Font embedded"; characters with no glyph fail "Glyphs"; a unit cut off a shortened axis
  title fails Nature's axis rule.
- e2e/full.test.mjs in every browser project: the box plot of price meets the general preset, then the Nature preset
  redraws it with the title in the legend; its PDF (MediaBox 183 mm, FontFile2, text as text), PNG (3,242 px wide,
  pHYs of 17,717 pixels a metre, 450 dpi, every CRC) and SVG (183 mm, its font inside) are downloaded and read back
  with the page's own readers, and the PNG fails Nature's format rule.

### Built-in examples (step 1)

"Planted patterns" (2,000 synthetic orders generated in the page from seed 20261005, with a rare region, a cluster
of unusual weights, a monotone dose–response, a group difference, a level shift and -999 stand-ins), "A messy CSV"
(the data-integrity fixture), "Earthquakes of magnitude 5.5 or more in 2024" (USGS, U.S. public domain, fetched
2026-10-05) and "Daily weather in Central Park, New York, 2024" (NOAA NCEI GHCN-Daily USW00094728, U.S. public
domain, fetched 2026-10-05). `tools/fetch_examples.py` fetches the two real datasets and records their SHA-256.
