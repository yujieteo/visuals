---
name: multi-armed-bandit
description: Use the Multi-armed Bandit tool and its read-only WebMCP tools to read an experiment's evidence, Thompson Sampling and UCB1 recommendations and simulation results, plan next week's hours among activities, or export a narrated beamdswitch deck or a Markdown plan.
---

# Multi-armed Bandit: Thompson Sampling and UCB

Choose the next trial among variants with uncertain binary success rates. Enter successes and trials for 2 to 10 variants, compare the Thompson Sampling and UCB1 recommendations, record each resolved outcome, and run a seeded simulation of Thompson Sampling, UCB1 and equal allocation. The **Next week's hours** tab treats 2 to 12 activities as variants and their past hour-blocks as trials (worthwhile or not) and splits the hours available by Thompson Sampling, with UCB1 alongside.

Open `index.html` in a browser, or https://teoyujie.org/visuals/multi-armed-bandit/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Read the evidence, posterior summaries and both recommendations | `get_data` |
| List templates, assumptions, limits and method references | `get_metadata` |
| Find a variant or template by name | `query` with `text` |
| Present the experiment as a narrated talk | Save deck or Copy deck |
| Read next week's hours plan: chance best, Thompson and UCB1 hours, explanations | `get_data` (`hours`) |
| Keep the hours plan as Markdown | Save plan or Copy plan |

## Inputs

- Embedded data: 5 templates (four with the same fictional counts, 8/100, 12/100 and 3/20, plus a blank custom experiment), assumptions and 3 method references; no network fetch at runtime.
- Embedded hours example: five activities (Mathematics, Structural engineering, FPL, Notes, Agent work) with fictional block counts, 20 hours, loaded only by **Load example**. The hours tab starts blank (two activities, no blocks); **Clear example** or **Start blank** returns to that.
- The user's experiment and hours plan, kept in the browser's `localStorage` when available, under separate keys.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{experiment, recommendations, simulation, hours}`: the committed definition and per-variant rows (counts, observed rate, posterior mean, 95% interval, Thompson sample, UCB1 score) as displayed, both recommendations with their explanations, the simulation summary, and the hours plan (basis, hours, per-activity past blocks, posterior mean, 95% interval, chance best, Thompson and UCB1 hours, UCB1 score, explanations and sensitivity). |
| `get_metadata` | none | JSON `{title, url, format, version, templates, assumptions, references, limits, hours}`, where `hours` is `{format, version, assumptions, limits}` of the hours plan. |
| `query` | `text` (string, optional) | JSON `{results, total, truncated}`: variants and templates whose name contains the text; at most 50 results. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **Save deck** button | Saves `multi-armed-bandit-beamdswitch.md`: a narrated talk (Set-up, Method, Results, Checks and takeaway) with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | **Export JSON** | `multi-armed-bandit-experiment.json`: the experiment, samples, generator states and simulation settings and progress (no undo history); **Import JSON** validates and restores it. |
| Text fallback | **Export as text** | The last export as selectable text, for contexts that block downloads or the clipboard. |
| Markdown hours plan | **Save plan (Markdown)** on the hours tab | Saves `multi-armed-bandit-hours-plan.md`: Inputs, Assumptions, Derived quantities, Result (Thompson and UCB1 hours), Sensitivity and Notes. |
| Same plan on the clipboard | **Copy plan** | The same Markdown. |
| Hours JSON | **Export JSON** on the hours tab | `multi-armed-bandit-hours.json`: the activities, their blocks, the hours and the basis (`blank` for a plan started blank, `example` for the fictional example as loaded, `edited` for the example after any change); **Import JSON** there validates and restores it. |

The page has no image export.

## Worked example

1. On the website template, call `get_data`.
2. `experiment.variants[0]` is Page A: 8 successes, 92 failures, posterior mean `8.82%` (Beta(9, 93), mean 9/102).
3. If any variant had no trials, `recommendations.ucb1.score` would read `Untried — explore first`; otherwise it is the UCB1 score, which is not a probability and can exceed 1.
4. On the hours tab, select **Load example** (20 hours); `get_data` then gives `hours.basis` `example` and `hours.activities[3]`, Notes: 6 past blocks, posterior mean `75.0%` (Beta(6, 2)), chance best `51.2%`, 10 Thompson hours and 16 UCB1 hours.
