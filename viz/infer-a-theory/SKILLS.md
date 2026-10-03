---
name: infer-a-theory
description: Turn plain-English observations of a fluctuating quantity into explicit statistical claims, an effective theory and a ranking of next measurements, on the Infer a Theory page or through its read-only WebMCP tools.
---

# Infer a Theory

From observations to effective actions and renormalisation: plain-English observations of a fluctuating quantity become a maximum-entropy effective theory with a posterior over its couplings, a renormalisation-group flow, compatible finer-scale theories and the next measurement ranked by expected information gain. Open it at <https://teoyujie.org/visuals/infer-a-theory/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Translate one English observation into explicit statistical claims | `interpret_observation` |
| Rank candidate next measurements by expected information gain | `rank_next_experiments` |
| Read the observations, couplings, conflicts and recommendation the page shows | `get_current_state` |
| Read the grammar classes, operator basis, limits and phrase sources | `get_metadata` |
| Save the analysis as a narrated talk | The page's beamdswitch or Copy deck button |

## Inputs

- Observations in plain English, one per card, each with the time scale it describes (seconds) and an estimative-probability phrase for how sure the observer is.
- A continuous field φ(t) or a binary field σₜ = ±1.
- Optionally direct statistical constraints, or the live-football bandwidth worked example.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title and URL, modes, the operator basis with symbols and meanings, limits, defaults, the phrase sources and the probability–field-theory dictionary. |
| `get_current_state` | none | The page's mode, example, observations with their interpretations, and the inference summary: couplings with intervals and identifiability, conflicts, the UV ladder and the recommended next experiment. |
| `interpret_observation` | `text` (up to 500 characters), `scale_seconds`; optional `mode` (`continuous` or `binary`) | The status, grammar class and explicit claims, notes, and the confidence phrase's calibration; an unsupported sentence comes back unsupported, never guessed. Does not change the page. |
| `rank_next_experiments` | none | The current ranking of candidate measurements: an English recommendation, the mathematical target, expected information in bits, level, cost and what it mainly informs. |

## Exports

- beamdswitch deck (`infer-a-theory-beamdswitch.md`) from the beamdswitch button; Copy deck puts it on the clipboard.
- JSON: `raw.json`, published as `data.json`, holds the operators, defaults, limits, the worked example and the dictionary; `probly.csv` is published beside the page.

## Worked example

Call `interpret_observation` with:

```json
{"text": "It is very likely that a bad interval is followed by another bad interval.", "scale_seconds": 10}
```

It returns `status` “ok” and class “correlation”, with one claim of kind `rho`:
“lag-1 correlation C(1) > 0 (positive dependence; magnitude unspecified)”. The
phrase “very likely” is in neither source, so it comes back `known: false` with
the nearest calibrated phrases “highly likely”, “likely” and “very good chance”.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Approximations (truncated projections, numerical beta estimates) are labelled as such; keep the labels when quoting results.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
