---
name: fpl-expected-goals
description: Use the How much of the early FPL points are repeatable? visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# How much of the early FPL points are repeatable?

Fantasy Premier League outfield players after Gameweek 5 of 2026/27, plotting actual goal involvements against expected goal involvements (xGI) to show whose points are least likely to repeat.

Open `index.html` in a browser, or https://teoyujie.org/visuals/fpl-expected-goals/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Find players outscoring their expected goal involvement | `query` with filters, or the position buttons |
| Get every plotted player | `get_data` |
| Present the players shown as a narrated talk | beamdswitch or Copy deck |

## Inputs

- Embedded data: every outfield player with at least 300 minutes, from the FPL `bootstrap-static` API, fetched 2026-09-28.
- Controls: the All / Defenders / Midfielders / Forwards buttons.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding plain pipe-delimited text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | Pipe-delimited rows `name\|team\|pos\|cost\|points\|minutes\|goal_involvements\|expected_goal_involvements`, then `total` and `next` lines. |
| `get_metadata` | none | Pipe-delimited `title`, `source`, `fetched`, `gameweek`, `measure`, `population` and `next` lines. |
| `query` | `position` (`DEF`, `MID`, `FWD`), `team` (code), `min_xgi`, `min_gi`, `limit` (1 to 153, default 25); all optional | The same pipe-delimited rows for the matching players, then `total`, `returned` and `next` lines. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `fpl-expected-goals-beamdswitch.md`: a narrated talk about the players shown, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/fpl-expected-goals/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"position":"FWD","limit":3}`.
2. It returns three of the 15 forwards, starting `João Pedro|CHE|FWD|7.7|33|360|6|2.36`: six goal involvements from 2.36 expected.
3. Call `get_metadata` for the gameweek and the xGI definition.
