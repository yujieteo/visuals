---
name: haze-singapore
description: Use the Singapore haze, region by region visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# Singapore haze, region by region

Hourly 24-hour PSI and PM2.5 for Singapore's five NEA regions from 1 April to 29 September 2026: no PSI above 100 until 4 September, then 15 Unhealthy days and a peak of 155 in Central.

Open `index.html` in a browser, or https://teoyujie.org/visuals/haze-singapore/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Read PSI and PM2.5 for a period | `get_data` with `start` and `end`, or scrub the hour strip |
| Find the hours a region was unhealthy | `query` with `filter.region` and `filter.min_psi` |
| Present an hour's map as a narrated talk | beamdswitch or Copy deck for the selected hour |

## Inputs

- Embedded data: hourly readings for the regions `north`, `south`, `east`, `west` and `central` from data.gov.sg (NEA), fetched 2026-09-29, and region boundaries.
- Controls: the hour strip and region map.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | `start`, `end` (ISO dates, SGT); both optional | JSON `{columns, rows, total, truncated, next_steps}`: one row per hour with `timestamp`, `psi_<region>` and `pm25_1h_<region>`; at most 500 rows. |
| `get_metadata` | none | JSON `{title, claim, sources, method, fetched, coverage, caveat}`. |
| `query` | `filter.region` (one of the five), `filter.min_psi` (number); both optional | JSON `{columns, rows, total, truncated, next_steps}` with `timestamp, region, psi_24h, pm25_1h, pm25_24h`; at most 500 rows. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `haze-singapore-beamdswitch.md`: a narrated talk about the selected hour, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/haze-singapore/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"filter":{"region":"central","min_psi":150}}`.
2. The first row is `2026-09-14T18:00:00.000Z` (UTC timestamps; 02:00 on 15 September in Singapore), Central PSI 150 with 1-hour PM2.5 88.
3. Call `get_metadata` for the caveat that these are regional readings and the 24-hour PSI lags conditions.
