---
name: toto-frequency
description: Use TOTO ball frequency to count how often each Singapore Pools TOTO ball (1 to 49) was a winning number in the last 3 months, 6 months or 1 year, look up one ball, or list the draws, with the caveat that past counts do not predict future draws.
---

# Use TOTO ball frequency

Live at <https://teoyujie.org/visuals/toto-frequency/>. Counts from 105 published draws up to draw 4221 on 28 September 2026, in three windows (3 months: 27 draws; 6 months: 53; 1 year: 105). Balls run from blue (drawn least) to red, with bands at more than 3, 5 and 10 draws. Every draw is random, so past counts do not predict future draws. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Count every ball in a window, by number or most drawn first | `get_ball_counts` |
| See one ball's counts in every window and the draws that included it | `get_ball` |
| List the draws in a window with their winning numbers | `list_draws` |
| Read the windows, bands, method, caveat and sources | `get_metadata` |
| Keep the window shown as a talk | the beamdswitch button (or Copy deck) |

## Inputs

A window id, `3m`, `6m` or `1y`, counted back from the latest draw; a ball number 1-49.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | What the page counts, the latest draw, the windows with draw counts and date ranges, the colour bands, the method, the randomness caveat and the sources |
| `get_ball_counts` | `window` (required), `sort` `number` or `most`, `limit` 1-49 | Each ball's count, rank and band in that window, and the caveat |
| `get_ball` | `number` (required) | The ball's counts and bands in every window, when it was last drawn, and the draws in the last year that included it, each with its Singapore Pools page |
| `list_draws` | `window` (required), `limit` 1-200 | The draws in the window, newest first, with winning numbers, the additional number and the Singapore Pools results page |

## Exports

- **beamdswitch deck:** `toto-frequency-beamdswitch.md`, a narrated Markdown deck of the window shown (voice `bf_emma`), or Copy deck.
- **JSON:** the dataset is published as [data.json](https://teoyujie.org/visuals/toto-frequency/data.json) (`raw.json` here); `draws.csv` is the raw draw list.

## Worked example

`get_ball({"number": 1})` returns `counts` of 1, 4 and 8 for `3m`, `6m` and `1y`, last drawn in draw 4201 on 20 July 2026, and the eight draws in the last year that included it. Those counts are history, not a forecast.
