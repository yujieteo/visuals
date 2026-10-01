---
name: social-values-surveydata
description: Use the Connection rises as appetite to shape the future falls visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# Connection rises as appetite to shape the future falls

Weighted survey aggregates by age group: older Singapore residents report stronger connection to the country but less interest in shaping its future, widening the gap from 0.09 to 1.07 points.

Open `index.html` in a browser, or https://teoyujie.org/visuals/social-values-surveydata/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Compare connection and appetite to shape the future by age | `get_data`, or hover the chart |
| Read one age group's scores | `query` with `filter.age_group` |
| Present the scores as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: seven weighted age-group aggregates of two 0 to 10 outcomes from a data.gov.sg survey dataset, fetched 2026-09-27.
- Controls: hover or tap the chart marks.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{columns, rows, total, truncated, next_steps}`; columns are `age_group, weighted_n, connection_mean, future_mean, connection_share_8_10, future_share_8_10`. |
| `get_metadata` | none | JSON `{title, claim, source, fetched, method, columns, caveat, total, truncated, next_steps}`. |
| `query` | `filter.age_group` (`16-19`, `20-24`, `25-34`, `35-44`, `45-54`, `55-64`, `65-75`; optional) | JSON `{columns, rows, total, truncated, next_steps}`. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `social-values-surveydata-beamdswitch.md`: a narrated talk about the scores, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/social-values-surveydata/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"filter":{"age_group":"65-75"}}`.
2. It returns a connection mean of 8.037 against 6.969 for shaping the future (weighted n 462.7).
3. Call `get_metadata` for the caveat that a cross-sectional association cannot separate age from cohort effects.
