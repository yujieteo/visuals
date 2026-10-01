---
name: bayes
description: Calibrate probability phrases against Kent's scale and a reader survey, and update an estimate with evidence by Bayes' rule, on the Bayesian reasoning page or through its read-only WebMCP tools.
---

# Bayesian reasoning in plain English

A Bayesian reasoning trainer and back-of-envelope calculator: probability phrases such as “likely” read against Sherman Kent's 1964 scale and a survey of real readers, then updated with evidence. Open it at <https://teoyujie.org/visuals/bayes/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Say what a probability phrase such as “likely” means in numbers | `lookup_phrase` |
| Update a starting probability with one or more pieces of evidence | `bayes_update` |
| Read the hypothesis, evidence and reasoning trail the page shows | `get_current_state` |
| List the sources, phrase vocabulary and example scenarios | `get_metadata` |
| Save the reasoning as a narrated talk | The page's beamdswitch or Copy deck button |

## Inputs

- A hypothesis in plain words and a starting estimate, given as a phrase or a percentage.
- For each piece of evidence: how likely it is if the hypothesis is true, and if it is false (a phrase or a percentage).
- Optionally one of six built-in example scenarios.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title and URL, both sources (Kent and the survey) with provenance, the phrase list, the example scenarios and the self-checks. |
| `get_current_state` | none | The page's hypothesis, starting estimate, each piece of evidence with its two judgements and posterior, the trail and the range from phrase choices. |
| `lookup_phrase` | `phrase` (string) | Kent's range, the survey's median, quartiles and histogram, and the default working value with its basis; an unknown phrase returns `calibrated: false` and suggestions, never invented numbers. |
| `bayes_update` | `prior_percent` (0–100) and `evidence`: a list of `{if_true_percent, if_false_percent}` | One step per piece of evidence, each posterior becoming the next prior: prior and posterior percent, likelihood ratio, odds before and after, and a plain-English explanation. |

## Exports

- beamdswitch deck: the beamdswitch button saves `bayes-beamdswitch.md`, a narrated Markdown deck; Copy deck puts it on the clipboard.
- JSON: `raw.json`, published as `data.json`, holds the Kent scale, the survey answers and the example scenarios.

## Worked example

Call `bayes_update` with:

```json
{"prior_percent": 50, "evidence": [{"if_true_percent": 75, "if_false_percent": 25}]}
```

It returns one step: `posterior_percent` 75 (`≈75%`), `likelihood_ratio` 3,
`prior_odds` “1 : 1” and `posterior_odds` “3 : 1”, with the explanation
that the evidence favours the hypothesis clearly.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. A phrase in neither source has no numbers: ask for the user's own meaning rather than guessing one.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
