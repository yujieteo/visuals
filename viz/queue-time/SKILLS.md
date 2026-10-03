---
name: queue-time
description: Estimate how long a queue or a food order will take, with a likely range from seeded simulation, on the Queue time page or through its read-only WebMCP tools.
---

# Queue time

How long will this queue take? A phone-first estimator for someone standing in a real queue, with a second mode for food orders. Open it at <https://teoyujie.org/visuals/queue-time/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Estimate a queue's wait from people ahead, counters and pace | `estimate_queue` |
| Judge a food order's wait against the expected time | `estimate_food_wait` |
| Read the mode, estimate, comparison and timers the page shows | `get_current_state` |
| Read the paces, food presets, limits, model and assumptions | `get_metadata` |
| Save the estimate as a narrated talk | The page's beamdswitch or Copy deck button |

## Inputs

- Queue: people ahead (0–999), counters open (0–50), and a pace preset (Fast, Typical or Slow) or minutes per person; a shared line or a line per counter.
- Food order: the expected wait in minutes, optional complexity and busyness what-ifs, the time already waited, and counts of orders ahead and completed over a watched time.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title and URL, modes, pace presets in minutes per person, weights, food presets, complexity and busyness options, limits, model and assumptions. |
| `get_current_state` | none | The page's mode, queue estimate, comparison, waiting timers and recorded waits, and the food-order range. |
| `estimate_queue` | `people`, `counters`; optional `pace`, `minutes_per_person`, `structure` (`shared` or `separate`) | The scenario, the headline (“About … min”) and likely range, a description, the middle, low and high minutes and the rough-rule minutes. |
| `estimate_food_wait` | `expected_minutes`; optional `complexity`, `busy`, `elapsed_minutes`, `orders_ahead`, `orders_completed`, `minutes_watched` | The expected range, the what-if range, the status for the time already waited, and an estimate from counted orders when given. The kitchen is never modelled. |

## Exports

- beamdswitch deck (`queue-time-beamdswitch.md`) from the beamdswitch button; Copy deck puts it on the clipboard.
- JSON: `raw.json`, published as `data.json`, holds the initial state, presets, limits, model constants and assumptions.

## Worked example

Call `estimate_queue` with 12 people ahead, 3 counters and 1.5 minutes per person:

```json
{"people": 12, "counters": 3, "minutes_per_person": 1.5}
```

It returns “About 6 min”, “Likely 4–8 min” (middle 6.28, low 4.95, high 7.86
minutes, the 10th to 90th percentiles of 400 seeded runs).

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. What-ifs are never measurements: an estimate of the time left for a food order comes only from orders the visitor counted finishing.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md).
