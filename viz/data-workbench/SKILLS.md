---
name: data-workbench
description: Use the Universal Data Workbench to read what a CSV or Parquet table holds - each column's source type, inferred type with its share, role, missing values, values that do not read, unusual values, suspected data errors and suggested corrections - through its read-only WebMCP tools. Profiles hold example values, never whole rows. A preview: step 1 of 7 (import and inspect).
---

# Use the Universal Data Workbench

Live at <https://teoyujie.org/visuals/data-workbench/>. A person imports CSV or Parquet files, or opens a built-in example; DuckDB reads them in the browser and the files never leave the device. Each column gets a profile: its source type (a CSV is read as text, as written), the type it reads as with the share of values that fit, a role (measure, identifier, category, ordered category, time, event label, interval start, interval end, unknown) with reasons, missing values and markers such as NA, values that do not read, a summary, unusual values (robust z above 3.5), suspected data errors and suggested corrections that wait for the person's approval. To change the page, read [AGENTS.md](AGENTS.md); the rules are in [spec.md](spec.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the imported tables, their sources, rows, samples and status | `get_tables` |
| Read one table's column profiles, suspected errors and open suggestions | `get_profile` |
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

## Exports

- **Markdown record:** `data-workbench-record.md`, the same frames as the deck without narration.
- **beamdswitch deck:** `data-workbench-beamdswitch.md` (voice `bf_emma`): Set-up, Method, Results (one frame a table), Checks and takeaway.
- **Data:** [data.json](https://teoyujie.org/visuals/data-workbench/data.json) (`raw.json` here): the examples' sources, licences and SHA-256, and the steps still to come.

## Worked example

Open `#example=messy`, then `get_profile({"table": "messy"})`: `amount` reads as integer with thousands separators removed (100.0% of 28 values); `junk` reads as integer with 96.4%, and its one failure is `"abc"` at row 7; `when` has one impossible date, `2026-02-30`; `temp` holds `-999` twice, suggested as missing; `amb` waits for a choice between DD/MM/YYYY and MM/DD/YYYY; lines 19 and 20 of the file have too few and too many fields.
