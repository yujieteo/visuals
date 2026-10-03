---
name: convexity-action-engine
description: Use the Convexity Action Engine to look up an everyday action in a Singapore context, screen it for ruin, and compare it with alternatives under a decision lens, through the page or its read-only WebMCP tools.
---

# Use the Convexity Action Engine

Live at <https://teoyujie.org/visuals/convexity-action-engine/>. 1,374 everyday actions and 26 to avoid, each screened for extreme downside first and then compared on reliable upside, right-tail upside, timing and opportunity cost. Every number is labelled judgement, model or personal; how common an action is comes from American Time Use Survey microdata. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Find actions that fit a phrase, time budget or mood | `search_actions`, or Ctrl/⌘ K on the page |
| See one action's spec, ruin screen, alternatives and actions to avoid | `get_action` |
| Compare two to ten actions under one decision lens | `compare_actions` |
| Read the counts, sources, assumptions and the list of lenses | `get_metadata` |
| Keep the analysis as a talk | the beamdswitch button (or Copy deck) |
| Get the spreadsheet views | the DATA tab's CSV buttons |

## Inputs

A natural-language query (for example `swim tonight`, `I have 30 minutes`, `what should I avoid`), parsed into time available, energy, manner, timing and mode. Action ids look like `swim`, `swim~friend` (with a manner) or `swim@tonight` (with a timing).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, counts of canonical, avoid and contextual actions, sources with retrieval status, assumptions, the date written, every lens (id, name, description) and the views |
| `search_actions` | `query` (required), `limit` 1-20 (default 8) | The parsed constraints and the ranked action specs |
| `get_action` | `id` (required) | The action's spec and facts, its opportunity-cost alternatives (class, id, name, why) and related actions to avoid |
| `compare_actions` | `ids` (2-10, required), `lens` (one of the lens ids, such as `convex`, `eu`, `regret`, `ruin`, `opt`, `oppcost`) | The top choice under the lens, each action's spec, per-lens words for every lens, and which actions are Pareto-dominated and on what |

## Exports

- **beamdswitch deck:** `convexity-action-engine-beamdswitch.md`, a narrated Markdown deck of the page in your context (voice `bf_emma`), or Copy deck.
- **CSV:** `actions.csv`, `aliases.csv`, `sources.csv`, `contextual_instances.csv` and `unknowns.csv` from the DATA tab.
- **JSON:** the dataset is published as [data.json](https://teoyujie.org/visuals/convexity-action-engine/data.json) (`raw.json` here).

## Worked example

1. `search_actions({"query": "I have 30 minutes"})` returns `parsed.time_available_min` and a ranked list of specs.
2. Take two ids from the list and call `compare_actions({"ids": ["<id1>", "<id2>"], "lens": "ruin"})`: `top` names the safer choice, `lenses` gives each action's words under every lens, and `dominated` says whether one beats the other on every criterion.
3. Call `get_action({"id": "<top>"})` for its alternatives before acting on it.
