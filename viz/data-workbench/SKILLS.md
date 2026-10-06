---
name: data-workbench
description: Use the Universal Data Workbench to read what a CSV or Parquet table holds - each column's source type, inferred type with its share, role, missing values, values that do not read, unusual values, suspected data errors and suggested corrections - which charts of grammar v1 it gives, each valid, excluded, failed or incomplete with its reason, and its findings - the hypothesis family tested by catalogue v1 with Benjamini–Yekutieli adjusted p-values, and the two ranked lists of unusual and statistically supported patterns with their distinct highlights explained - through its read-only WebMCP tools. Profiles hold example values, never whole rows; chart candidates hold specifications, never plotted points; findings hold statistics. Figures are written as SVG, PDF and PNG under General, Nature or Science presets with checks at final size. A preview: step 4 of 7 (publication figures).
---

# Use the Universal Data Workbench

Live at <https://teoyujie.org/visuals/data-workbench/>. A person imports CSV or Parquet files, or opens a built-in example; DuckDB reads them in the browser and the files never leave the device. Each column gets a profile: its source type (a CSV is read as text, as written), the type it reads as with the share of values that fit, a role (measure, identifier, category, ordered category, time, event label, interval start, interval end, unknown) with reasons, missing values and markers such as NA, values that do not read, a summary, unusual values (robust z above 3.5), suspected data errors and suggested corrections that wait for the person's approval. Once a table is profiled, every chart of grammar v1 ([grammar.md](grammar.md)) is generated without a question: each column is a measure (Q), a category (C), a time (T), a label (L) or excluded with its reason, and every single-field chart, pair chart and timeline of those classes is a candidate with an outcome. The person can open any figure full size and change its fields, transformations, labels, scales and layout, or add facets. Then each table's hypotheses (every pair of measures, category and measure, pair of categories, and time and measure) are tested by test catalogue v1 ([catalog.md](catalog.md)) where a test's checks pass, with raw and Benjamini–Yekutieli adjusted p-values, and the valid charts are ranked in two lists: "Unusual patterns" by unusualness, and "Statistically supported patterns" (an adjusted p-value at most 0.05, exploratory evidence). Each list highlights 6 distinct figures by default, each explained: what was observed, apart from why it is highlighted, its statistical status and fixed cautions. Optional study details (independent observations, repeated measurements, sample design) decide which tests apply; without them independence is assumed, not confirmed, and tests are refused where the data contradicts it. To change the page, read [AGENTS.md](AGENTS.md); the rules are in [spec.md](spec.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the imported tables, their sources, rows, samples and status | `get_tables` |
| Read one table's column profiles, suspected errors and open suggestions | `get_profile` |
| Read one table's chart candidates: the search scope, the accounting and each outcome with its reason | `get_candidates` |
| Read one chart's specification (data, transform, encoding, scale, layout, annotation) | `get_candidates` with `id` |
| Read one table's findings: the family, both lists and their highlights explained | `get_findings` |
| Read every hypothesis of the family: its test, statistic, effect, raw and adjusted p-value, or why it was not tested | `get_findings` with `list: "family"` |
| Read one list in order, or one chart's finding | `get_findings` with `list: "unusual"` or `"supported"`, or with `id` |
| Read the whole state, including every table's profile and the conversion log | `get_state` |
| Read the record as Markdown | `get_markdown` |
| Read the page's state schema | `get_metadata` |
| Keep the inspection as a talk | the "Save beamdswitch deck" button |

## Inputs

Table names are lower-case letters, digits and `_`, as `get_tables` lists them. The URL holds only the open example (`#example=planted`, `messy`, `quakes` or `weather`) and the number of distinct highlights per list when it is not 6 (`&highlights=10`, 0 to 50). No imported value enters the URL.

## WebMCP tools

All read-only. None returns a row; profiles hold example values, such as the most frequent values and values that do not read.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, summary, state schema version and the state field (`example`) |
| `get_state` | none | The state, every table with its column profiles, the engine, the budget, the publication settings with the preset's rules and their sources, the steps to come and the conversion log, with the URL |
| `get_markdown` | none | The Markdown record: what was imported, how columns are read, one table of columns per table, suspected errors and the log |
| `get_tables` | none | Each table: name, source file with size and SHA-256, rows, columns, sample or all rows, status, CSV dialect, the lines the CSV reader could not read |
| `get_profile` | `table` (required) | That table with each column's source type, type, reading, share, role and reasons, missing values, failures with examples, errors, unusual values, summary and open suggestions |
| `get_candidates` | `table` (required); `outcome`, `offset`, `id` (optional) | The table's chart accounting (fields of each class, the count formula, valid, excluded, failed and incomplete, time to the first figure) and up to 1,000 candidates from `offset`, each with its id, kind, fields, outcome, reason and title; with `id`, that candidate's chart specification |
| `get_findings` | `table` (required); `list` (`unusual`, `supported` or `family`), `offset`, `id` (optional) | The table's family (definition, size, m, members not tested, flagged, study details, independence checks, values left out) and its subset families; both lists with each highlight explained (Observed, Why highlighted, statistical status, cautions, fields, transformations); with `list`, up to 1,000 entries of that list or of the family's hypotheses from `offset`; with `id`, one chart's finding and its hypotheses |

## Exports

- **Markdown record:** `data-workbench-record.md`, the same frames as the deck without narration, with each table's findings (the family's counts and each list's highlights).
- **beamdswitch deck:** `data-workbench-beamdswitch.md` (voice `bf_emma`): Set-up, Method, Results (one frame a table), Checks and takeaway.
- **Publication figures:** from a chart's full-size view, `<candidate id>-<preset>.svg`, `.pdf` and `.png` under the General, Nature or Science preset, at the set size in millimetres, PNG resolution and font: the SVG with its text as `<text>` and its font subset inside, the PDF with every text in an embedded TrueType subset (FontFile2) and a MediaBox of the size, the PNG with its resolution in a pHYs chunk. Each file is read back and checked against the preset's rules, each named with its source and the date it was read (Nature's figure guide on 2026-10-06; every Science rule unverified). `get_state` holds the settings and the preset's rules under `publication`; no tool writes a figure.
- **Data:** [data.json](https://teoyujie.org/visuals/data-workbench/data.json) (`raw.json` here): the examples' sources, licences and SHA-256, and the steps still to come.

## Worked example

Open `#example=planted` and wait for its charts, then `get_candidates({"table": "planted"})`: 7 measures, 5 categories, 1 time and 1 label give 155 candidates (2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + tl + C(t,2)·l), all valid; `order_id` is excluded as an identifier. `get_candidates({"table": "planted", "id": "planted.scatter.dose.response"})` returns that scatter plot's specification.

After the charts, `get_findings({"table": "planted"})`: a family of 80 hypotheses (C(7,2) + 7·5 + C(5,2) + 2·1·7), 62 tested and 18 not tested (the 11 tests of independent rows with sales, whose lag-1 autocorrelation of 0.46 in order_date order contradicts independence; the 6 other group differences by units, one of whose groups has a single row; and score by region, whose Atlantis group of 10 rows lacks support for normality), 2 with an adjusted p-value at or below 0.05: the dose and response (Spearman's rho 0.96) and score by segment (Welch's t, Hedges' g −0.82). The 6 highlights of "Unusual patterns" include the rare region Atlantis (0.5% of rows), the dose–response relation, the score difference by segment and the cluster of unusual weights; temp_c's -999 stand-ins are left out of the statistics and counted.

Open `#example=messy`, then `get_profile({"table": "messy"})`: `amount` reads as integer with thousands separators removed (100.0% of 28 values); `junk` reads as integer with 96.4%, and its one failure is `"abc"` at row 7; `when` has one impossible date, `2026-02-30`; `temp` holds `-999` twice, suggested as missing; `amb` waits for a choice between DD/MM/YYYY and MM/DD/YYYY; lines 19 and 20 of the file have too few and too many fields.
