---
name: energy-email-productivity
description: Use the Your energy dips mid-afternoon. Your inbox doesn't. visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# Your energy dips mid-afternoon. Your inbox doesn't.

A stylised workday alertness curve beside measured email-interruption findings: 70% of emails answered within 6 seconds, 64 seconds to refocus, and less stress at three checks a day.

Open `index.html` in a browser, or https://teoyujie.org/visuals/energy-email-productivity/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Read the evidence behind the chart | `get_data`, or `query` by kind |
| Separate circadian (energy) findings from email findings | `query` with `kind` |
| Present the findings as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: six evidence records (study, venue, year, finding, source URL). The alertness curve is a stylised summary, not one dataset.
- Controls: hover or tap points on the timeline, and Reset view.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{rows, total, truncated, next_steps}` with the six evidence records. |
| `get_metadata` | none | JSON `{title, claim, method, sources, fetched, caveat, truncated}`. |
| `query` | `kind` (`energy` or `email`, optional) | JSON `{rows, total, truncated, next_steps}` with the matching records. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `energy-email-productivity-beamdswitch.md`: a narrated talk about the findings, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/energy-email-productivity/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"kind":"email"}`.
2. The first record, `email-react-6s`, says 70% of emails were reacted to within 6 seconds (Jackson, Dawson and Wilson, 2001), with its `source_url`.
3. Call `get_metadata` for the caveat that the curve is stylised.
