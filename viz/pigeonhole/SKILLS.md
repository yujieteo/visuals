---
name: pigeonhole
description: Use Pigeonhole → Averages to compute the forced maximum ⌈N/k⌉, forced minimum ⌊N/k⌋ and balanced configuration of N objects in k boxes, check min ≤ mean ≤ max (optionally weighted) for a list of values, read the scene on the page, and export it as a narrated beamdswitch deck.
---

# Use Pigeonhole → Averages

Live at <https://teoyujie.org/visuals/pigeonhole/>. One argument at three levels of abstraction: a fixed global total forces a local extreme. The guided journey runs from the pigeonhole principle through the generalised principle, the balanced configuration, proofs by contradiction, real heights, liquid equalisation and deviations to equality and a synthesis; outside it are a theorem constructor, minimax balancing, seven applications, weighted averages, centre of mass, a convex-hull teaser, a free-play lab and challenges. Runs offline. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Bound the fullest and emptiest box for N objects in k boxes | `compute_bounds` |
| Check min ≤ average ≤ max for a list of numbers, with optional weights | `analyze_values` |
| Read the scene on the page, its counts or values and bounds | `get_current_state` |
| List the scenes, modes, examples and challenges | `get_metadata` |
| Check the implementation | `run_self_tests` |
| Keep the scene as a talk | the beamdswitch button (or Copy deck) |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, URL, the scenes in journey order, modes, examples and challenges |
| `get_current_state` | none | The scene as set: counts with N, k and the forced bounds, or values (and weights) with min, average and max, plus the conserved invariant |
| `compute_bounds` | `N` (whole, 0 or more), `k` (whole, 1 to 100000) | The average N/k, ⌈N/k⌉, ⌊N/k⌋, the most balanced configuration and the counting check behind them, or an error |
| `analyze_values` | `values` (non-empty list of numbers), optional `weights` (one positive number per value) | Average, minimum, maximum, deviations and their zero sum, and whether min ≤ average ≤ max holds weakly and strictly, or an error |
| `run_self_tests` | none | Each built-in deterministic self-test and whether it passed |

## Exports

- **beamdswitch deck:** `pigeonhole-beamdswitch.md`, a narrated Markdown deck of the scene as set (voice `bf_emma`), or Copy deck.
- **Data:** the scenes, examples, challenges and worked bounds are published as [data.json](https://teoyujie.org/visuals/pigeonhole/data.json).

## Worked example

`compute_bounds({"N": 23, "k": 5})` gives the average 4.6, so some box holds at least ⌈23/5⌉ = 5 and some at most ⌊23/5⌋ = 4; the most balanced configuration is 5, 5, 5, 4, 4, and the counting check is 5 · 4 = 20 < 23. `analyze_values({"values": [3, 7, 4, 9], "weights": [3, 1, 2, 1]})` gives the weighted average 33/7 ≈ 4.71, which lies between the minimum 3 and maximum 9.
