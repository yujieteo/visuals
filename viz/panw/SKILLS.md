---
name: panw
description: Use the Palo Alto Networks cash conversion visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# Palo Alto Networks cash conversion

Palo Alto Networks's (PANW) annual revenue and operating cash-flow margin from audited SEC filings, as a bar chart with a Revenue / Operating cash margin toggle.

Open `index.html` in a browser, or https://teoyujie.org/visuals/panw/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Read revenue and operating cash flow by fiscal year | `get_data`, or the chart's Revenue / Operating cash margin toggle |
| Check the source filing and fetch date | `get_metadata` |
| Present the figures as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: four fiscal years of audited revenue and operating cash flow from SEC company facts for PANW; no network fetch at runtime.
- Controls: the Revenue / Operating cash margin toggle.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding plain pipe-delimited text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | Pipe-delimited (TOON) rows `fy\|revenue_usd\|operating_cash_flow_usd\|cash_margin_pct`, then `total` and `next` lines. |
| `get_metadata` | none | Pipe-delimited `ticker`, `source` (SEC company-facts URL), `fetched` and `next` lines. |
| `query` | `fy` (string, optional) | The `get_data` header and the row for fiscal year `fy`, then `total` and `next` lines; every row when `fy` is absent. An unknown `fy` returns `total\|0` and a `next` line listing the available years. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `panw-beamdswitch.md`: a narrated talk about the figures shown, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/panw/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `get_data` with `{}`.
2. Pick the `fy` 2026 line from the result: `2026|11480000000|4553000000|39.7` (revenue in USD, operating cash flow in USD, cash margin in percent).
3. Call `get_metadata` for the SEC source URL and fetch date to cite.
