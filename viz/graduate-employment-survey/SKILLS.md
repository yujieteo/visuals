---
name: graduate-employment-survey
description: Use the The computing salary premium widened visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# The computing salary premium widened

Graduate Employment Survey degrees' gross monthly medians relative to each year's median: computing-titled degrees moved from 0.6% below it in 2013 to 36.4% above it in 2024.

Open `index.html` in a browser, or https://teoyujie.org/visuals/graduate-employment-survey/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Compare a degree's salary with its survey year's median | `query` by year, or hover the chart |
| Separate computing-titled degrees from the rest | `query` with `computing_title` |
| Present the premiums as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: plotted rows of year, university, degree, gross monthly median and premium percent from the Graduate Employment Survey.
- Controls: hover or tap points on the chart.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{columns, rows, total, truncated}`; columns are `year, university, degree, gross_monthly_median, year_premium_percent, computing_title`. |
| `get_metadata` | none | JSON `{claim, measure, computing_title_rule, medians, truncated}`, where `medians` are the annual computing medians. |
| `query` | `year` (integer), `computing_title` (boolean); both optional | JSON `{columns, rows, total, truncated}` with the matching rows. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `graduate-employment-survey-beamdswitch.md`: a narrated talk about the premiums, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/graduate-employment-survey/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"year":2024,"computing_title":true}`.
2. The first row is NUS Bachelor of Computing (Computer Science): a gross monthly median of 6500, 47.7% above the 2024 median.
3. Call `get_metadata` for how the premium and the computing-title rule are defined.
