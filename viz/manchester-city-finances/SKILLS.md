---
name: manchester-city-finances
description: Use the What Manchester City's charges and accounts do and do not show visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# What Manchester City's charges and accounts do and do not show

An evidence-first timeline that separates the Premier League allegations, the distinct 2020 CAS UEFA case, and Manchester City's latest filed accounts.

Open `index.html` in a browser, or https://teoyujie.org/visuals/manchester-city-finances/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Separate the allegations, the UEFA case and the accounts | `query` by lane, or the lane buttons |
| Read each item's dates, detail and source | `get_data`, or select an item on the timeline |
| Present the timeline as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: timeline items with lane, start and end dates, detail, revenue and profit (accounts only) and a source URL.
- Controls: the All / lane buttons and the timeline items.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{total, rows, truncated, next_steps}` with every timeline item. |
| `get_metadata` | none | JSON `{title, claim, status, lanes, truncated}`; `lanes` lists the three lane names. |
| `query` | `lane` (string, optional) | JSON `{total, rows, truncated, next_steps}` with the items in that lane. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `manchester-city-finances-beamdswitch.md`: a narrated talk about the timeline, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/manchester-city-finances/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `get_metadata` for the lane names: Alleged Premier League periods, Separate UEFA case, Filed accounts.
2. Call `query` with `{"lane":"Filed accounts"}`: the FY2023-24 accounts show revenue £715.0m and net profit £73.8m, each with its report URL.
3. Quote the `status` caveat: no final Premier League award was located as of 2026-09-28.
