---
name: data-workbench
description: Use the Universal Data Workbench to read what a CSV or Parquet table holds - each column's source type, inferred type with its share, role, missing values, values that do not read, unusual values, suspected data errors and suggested corrections - and which charts of grammar v1 it gives, each valid, excluded, failed or incomplete with its reason, through its read-only WebMCP tools. Profiles hold example values, never whole rows; chart candidates hold specifications, never plotted points. A preview: step 2 of 7 (charts and candidates).
---

# Use the Universal Data Workbench

Live at <https://teoyujie.org/visuals/data-workbench/>. A person imports CSV or Parquet files, or opens a built-in example; DuckDB reads them in the browser and the files never leave the device. Each column gets a profile: its source type (a CSV is read as text, as written), the type it reads as with the share of values that fit, a role (measure, identifier, category, ordered category, time, event label, interval start, interval end, unknown) with reasons, missing values and markers such as NA, values that do not read, a summary, unusual values (robust z above 3.5), suspected data errors and suggested corrections that wait for the person's approval. Once a table is profiled, every chart of grammar v1 ([grammar.md](grammar.md)) is generated without a question: each column is a measure (Q), a category (C), a time (T), a label (L) or excluded with its reason, and every single-field chart, pair chart and timeline of those classes is a candidate with an outcome. The person can open any figure full size and change its fields, transformations, labels, scales and layout, or add facets. To change the page, read [AGENTS.md](AGENTS.md); the rules are in [spec.md](spec.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the imported tables, their sources, rows, samples and status | `get_tables` |
| Read one table's column profiles, suspected errors and open suggestions | `get_profile` |
| Read one table's chart candidates: the search scope, the accounting and each outcome with its reason | `get_candidates` |
| Read one chart's specification (data, transform, encoding, scale, layout, annotation) | `get_candidates` with `id` |
| Read the whole state, including every table's profile and the conversion log | `get_state` |
| Read the record as Markdown | `get_markdown` |
| Read the page's state schema | `get_metadata` |
| Keep the inspection as a talk | the "Save beamdswitch deck" button |

## Inputs

Table names are lower-case letters, digits and `_`, as `get_tables` lists them. The URL holds only the open example: `#example=planted`, `messy`, `quakes` or `weather`. No imported value enters the URL.

## WebMCP tools

All read-only. None returns a row; profiles hold example values, such as the most frequent values and values that do not read.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, summary, state schema version and the state field (`example`) |
| `get_state` | none | The state, every table with its column profiles, the engine, the budget, the steps to come and the conversion log, with the URL |
| `get_markdown` | none | The Markdown record: what was imported, how columns are read, one table of columns per table, suspected errors and the log |
| `get_tables` | none | Each table: name, source file with size and SHA-256, rows, columns, sample or all rows, status, CSV dialect, the lines the CSV reader could not read |
| `get_profile` | `table` (required) | That table with each column's source type, type, reading, share, role and reasons, missing values, failures with examples, errors, unusual values, summary and open suggestions |
| `get_candidates` | `table` (required); `outcome`, `offset`, `id` (optional) | The table's chart accounting (fields of each class, the count formula, valid, excluded, failed and incomplete, time to the first figure) and up to 1,000 candidates from `offset`, each with its id, kind, fields, outcome, reason and title; with `id`, that candidate's chart specification |

## Exports

- **Markdown record:** `data-workbench-record.md`, the same frames as the deck without narration.
- **beamdswitch deck:** `data-workbench-beamdswitch.md` (voice `bf_emma`): Set-up, Method, Results (one frame a table), Checks and takeaway.
- **Data:** [data.json](https://teoyujie.org/visuals/data-workbench/data.json) (`raw.json` here): the examples' sources, licences and SHA-256, and the steps still to come.

## Worked example

Open `#example=planted` and wait for its charts, then `get_candidates({"table": "planted"})`: 7 measures, 5 categories, 1 time and 1 label give 155 candidates (2q + c + t + 2·C(q,2) + 2qc + C(c,2) + tq + tc + tl + C(t,2)·l), all valid; `order_id` is excluded as an identifier. `get_candidates({"table": "planted", "id": "planted.scatter.dose.response"})` returns that scatter plot's specification.

Open `#example=messy`, then `get_profile({"table": "messy"})`: `amount` reads as integer with thousands separators removed (100.0% of 28 values); `junk` reads as integer with 96.4%, and its one failure is `"abc"` at row 7; `when` has one impossible date, `2026-02-30`; `temp` holds `-999` twice, suggested as missing; `amb` waits for a choice between DD/MM/YYYY and MM/DD/YYYY; lines 19 and 20 of the file have too few and too many fields.
