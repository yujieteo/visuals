---
name: convex-payoffs
description: Use the Find a convex 15-minute bet visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# Find a convex 15-minute bet

A tappable 2 by 2 for choosing a low-cost experiment that can open a meaningful next step, with research sources for each quadrant.

Open `index.html` in a browser, or https://teoyujie.org/visuals/convex-payoffs/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Choose a kind of 15-minute experiment | Tap a quadrant, or `query` with its `id` |
| List every quadrant with its action, test, reason and verdict | `get_data` |
| Turn a quadrant into a narrated talk | beamdswitch or Copy deck for the selected quadrant |

## Inputs

- Embedded data: four decision-quadrant records with example actions, and the research sources in `meta.json`.
- Controls: the four quadrant cells.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{total, returned, truncated, columns, rows, next_steps}`; columns are `id, label, action, test, why, verdict` and each row ends with its example actions. |
| `get_metadata` | none | JSON `{title, fetched, sources}`. |
| `query` | `id` (string, required, one of the quadrant ids) | JSON `{total, returned, truncated, row, next_steps}`; `row` is `null` for an unknown id. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `convex-payoffs-beamdswitch.md`: a narrated talk about the selected quadrant, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/convex-payoffs/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"id":"reversible-upside"}`.
2. The row is labelled "Run a reversible probe" with the verdict "Do this today" and three example actions.
3. Call `get_metadata` for the sources behind it.
