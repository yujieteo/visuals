---
name: fermi
description: Make a back-of-the-envelope (Fermi) estimate from a chain of rough factors, with an exact range and a sensitivity ranking, on the Fermi estimator page or through its read-only WebMCP tools.
---

# Fermi estimator

A back-of-the-envelope estimation tool: break a hard question into a few rough factors, each with a low, best and high value, and see the estimate, the exact range those values imply and which assumption matters most. Open it at <https://teoyujie.org/visuals/fermi/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Estimate a quantity from low, best and high guesses of a few factors | `estimate` |
| Read the estimate the page shows | `get_current_state` |
| List the built-in example decompositions | `list_examples` |
| Read the rules (precedence, range propagation, sensitivity, significant figures) and limits | `get_metadata` |
| Copy the estimate or save it as a narrated talk | The page's copy and beamdswitch buttons |

## Inputs

- A question and the result's unit.
- A chain of factors joined by ×, ÷ or + (a new term), each with a name, a unit and a best value, optionally with low and high values. Values are zero or positive.
- Optionally a benchmark to compare the result against.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title and URL, the operators, the maximum number of factors, the rules, notes and messages. |
| `get_current_state` | none | The page's estimate: question, factors, best estimate, range from the assumptions, trail, sensitivity ranking, units and the benchmark comparison. |
| `list_examples` | none | The built-in examples: question, result unit and factors with low, best and high values. |
| `estimate` | `factors`: a list of `{op, name, unit, low, best, high}` (`op` is `mul`, `div` or `add`; the first factor's `op` is ignored); optional `question`, `result_unit`, `benchmark` | The best estimate, the exact low and high, display strings, the trail, the sensitivity ranking, which factor to improve first, units and a copyable summary, or the problem with the input. Does not change the page. |

## Exports

- Copy estimate (plain text) and Copy as Markdown.
- beamdswitch deck (`fermi-beamdswitch.md`) from the beamdswitch button; Copy deck puts it on the clipboard.
- JSON: `raw.json`, published as `data.json`, holds the default estimate, the examples, the rules and the messages.

## Worked example

Call `estimate` with a restaurant-queue chain:

```json
{"result_unit": "min", "factors": [
  {"name": "Groups ahead", "low": 8, "best": 12, "high": 16},
  {"op": "mul", "name": "Minutes per table turn", "low": 8, "best": 10, "high": 14},
  {"op": "div", "name": "Tables", "low": 3, "best": 4, "high": 5}]}
```

It returns `best` 30 (“≈ 30 min”, from 12 × 10 ÷ 4), `low` 12.8 and
`high` 74.67 (“≈ 13–75 min”), and `improve_first` “Groups ahead”, the factor
with the largest effect.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. The range is the exact span of the given guesses, never a confidence interval; do not call it one.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
