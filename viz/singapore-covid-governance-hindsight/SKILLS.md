---
name: singapore-covid-governance-hindsight
description: Use the What did 2020 Singapore analyses say? visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# What did 2020 Singapore analyses say?

Four dated 2020 Singapore COVID-19 analyses paired with later public records; one is a direct conditional forecast outcome, the others show policy overlap, a related event, or a consistent trend.

Open `index.html` in a browser, or https://teoyujie.org/visuals/singapore-covid-governance-hindsight/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Compare a 2020 analysis with the later record | `get_data`, or select a pair on the page |
| Filter pairs by how strong the evidence is | `query` with `filter.evidence_class` |
| Present the analyses as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: four analysis-to-record pairs (analyst, publication date, statement, later record, evidence class, source URLs).
- Controls: the source pairs on the page.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{total, rows, truncated, next_steps}` with all four pairs. |
| `get_metadata` | none | JSON `{title, scope, rubric, fields, truncated, next_steps}`. |
| `query` | `filter.evidence_class` (`direct later outcome`, `policy overlap`, `related policy event` or `consistent trend`; optional) | JSON `{total, rows, truncated, next_steps}` with the matching pairs. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `singapore-covid-governance-hindsight-beamdswitch.md`: a narrated talk about the analyses, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/singapore-covid-governance-hindsight/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"filter":{"evidence_class":"direct later outcome"}}`.
2. It returns one pair, `outbreak-threshold`: Hannah Clapham and Alex R. Cook's conditional forecast of 27 February 2020, with the later MOH record.
3. Call `get_metadata` for the scope: a four-item sample, not an overall foresight ranking.
