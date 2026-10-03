---
name: information-gain
description: Compare the checks you could make on a yes-or-no belief by expected information gain and information per minute, on the Information gain page or through its read-only WebMCP tools.
---

# Information gain

What should you check next to reduce your uncertainty? Start from a yes-or-no belief, list the checks you could make, and compare them by expected information gain and by information per unit of time before observing a result and updating. Open it at <https://teoyujie.org/visuals/information-gain/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Score one yes-or-no check: expected information, each result's posterior, belief change and surprise | `analyze_check` |
| Read the belief, every check, both rankings, the best next check and the learning trail the page shows | `get_current_state` |
| List the examples, time units, limits and wording thresholds | `get_metadata` |
| Run the self-tests | `run_self_tests` |
| Copy the analysis or save it as a narrated talk | The page's Copy analysis and beamdswitch buttons |

## Inputs

- A hypothesis and a starting belief, as a phrase such as “likely” (with Kent's range and the survey) or a percentage.
- Each check: its name, its time cost, and how likely its result is if the hypothesis is true and if it is false.
- Optionally an objective (learn the most or learn fastest), a time budget and observed results.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title and URL, the examples and teaching presets, time units in minutes, the wording thresholds and the limits. |
| `get_current_state` | none | The page's hypothesis, starting and current belief, uncertainty in bits, every check with its expected information and rate, the most informative and fastest checks, the best next check, the budget and the learning trail. |
| `analyze_check` | `prior`, `p_result_if_h`, `p_result_if_not_h` (each 0–1); optional `minutes` (0 is free) | Entropy before and expected after, expected information (equal to the mutual information and the expected KL divergence), the rate, a diagnosis, and for each result its probability, posterior, belief change and surprise; or an error for invalid input. |
| `run_self_tests` | none | Each built-in deterministic self-test with its name and pass flag. |

## Exports

- Copy analysis (text).
- beamdswitch deck (`information-gain-beamdswitch.md`) from the beamdswitch button; Copy deck puts it on the clipboard.
- JSON: `raw.json`, published as `data.json`, holds the phrase data, scenarios, examples, units, limits and thresholds.

## Worked example

Call `analyze_check` for an even starting belief and a check that gives its
result 85% of the time if the hypothesis is true and 20% if it is false, taking
one minute:

```json
{"prior": 0.5, "p_result_if_h": 0.85, "p_result_if_not_h": 0.2, "minutes": 1}
```

It returns `expected_information_bits` 0.332 (the same as the mutual
information), `rate` “0.33 bits/min” and the diagnosis “highly diagnostic”:
the result (probability 0.525) moves the belief to 0.81, its opposite to 0.16.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. The wording (small, moderate, large; highly diagnostic) comes from the page's thresholds; it is UI guidance, not an information-theory category.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
