---
name: multi-armed-bandit
description: Use the Multi-armed Bandit tool and its read-only WebMCP tools to read an experiment's evidence, Thompson Sampling and UCB1 recommendations and simulation results, or export a narrated beamdswitch deck.
---

# Multi-armed Bandit: Thompson Sampling and UCB

Choose the next trial among variants with uncertain binary success rates. Enter successes and trials for 2 to 10 variants, compare the Thompson Sampling and UCB1 recommendations, record each resolved outcome, and run a seeded simulation of Thompson Sampling, UCB1 and equal allocation.

Open `index.html` in a browser, or https://teoyujie.org/visuals/multi-armed-bandit/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Read the evidence, posterior summaries and both recommendations | `get_data` |
| List templates, assumptions, limits and method references | `get_metadata` |
| Find a variant or template by name | `query` with `text` |
| Present the experiment as a narrated talk | Save deck or Copy deck |

## Inputs

- Embedded data: 5 templates (four with the same fictional counts, 8/100, 12/100 and 3/20, plus a blank custom experiment), assumptions and 3 method references; no network fetch at runtime.
- The user's experiment, kept in the browser's `localStorage` when available.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{experiment, recommendations, simulation}`: the committed definition and per-variant rows (counts, observed rate, posterior mean, 95% interval, Thompson sample, UCB1 score) as displayed, both recommendations with their explanations, and the simulation summary. |
| `get_metadata` | none | JSON `{title, url, format, version, templates, assumptions, references, limits}`. |
| `query` | `text` (string, optional) | JSON `{results, total, truncated}`: variants and templates whose name contains the text; at most 50 results. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **Save deck** button | Saves `multi-armed-bandit-beamdswitch.md`: a narrated talk (Set-up, Method, Results, Checks and takeaway) with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | **Export JSON** | `multi-armed-bandit-experiment.json`: the experiment, samples, generator states and simulation settings and progress (no undo history); **Import JSON** validates and restores it. |
| Text fallback | **Export as text** | The last export as selectable text, for contexts that block downloads or the clipboard. |

The page has no image export.

## Worked example

1. On the website template, call `get_data`.
2. `experiment.variants[0]` is Page A: 8 successes, 92 failures, posterior mean `8.82%` (Beta(9, 93), mean 9/102).
3. If any variant had no trials, `recommendations.ucb1.score` would read `Untried — explore first`; otherwise it is the UCB1 score, which is not a probability and can exceed 1.
