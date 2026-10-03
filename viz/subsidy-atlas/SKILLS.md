---
name: subsidy-atlas
description: Use the Subsidy Atlas to find sourced subsidised offers (free LLM tokens, cloud credits, ride and delivery promotions, policy rebates, merchant-funded financing), filter them by category, subsidiser, depth and lifecycle, and read the historical lessons and speculative watchlist separately.
---

# Use the Subsidy Atlas

Live at <https://teoyujie.org/visuals/subsidy-atlas/>. Sourced records as of 30 September 2026, a depth × lifecycle count matrix, historical loss-leader lessons and three separately flagged speculative watchlist picks. Depth is a descriptive band, not a comparable cost percentage, and an unknown cost subsidy stays unknown. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Find current offers, optionally by category, subsidiser, depth or stage | `search_products` |
| Include historical evidence (Xbox, Kindle, Uber, MoviePass...) | `search_products` with `includeHistorical: true` |
| Read one record or forecast with its sources | `get_product` |
| Get the as-of date, the vocabularies and every source | `get_metadata` |
| Keep the records shown as a talk | the beamdswitch button (or Copy deck) |

## Inputs

A free-text `q` and the filters, each from the vocabulary: `category` (`llm`, `cloud`, `transport`, `delivery`, `energy`, `hardware`, `streaming`, `finance`), `subsidiser` (`investors`, `cross-subsidy`, `government`, `merchants`), `depth` (`free`, `partial`, `near-cost`, `unknown`) and `stage` (`acquisition`, `ongoing`, `tapering`, `historical`). Record ids look like `chatgpt-free`, `aws-free`, `grab-promos`; forecast ids like `ai-agents`.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | `as_of`, the vocabularies and the source registry |
| `search_products` | `q`, `includeHistorical`, `category`, `subsidiser`, `depth`, `stage` (all optional) | `as_of` and the matching evidenced entries; historical entries only when asked, forecasts never |
| `get_product` | `id` (required) | `as_of`, the entry or the explicitly speculative forecast, and the sources |

## Exports

- **beamdswitch deck:** `subsidy-atlas-beamdswitch.md`, a narrated Markdown deck of the records shown with the current filters (voice `bf_emma`), or Copy deck.
- **JSON:** the dataset is published as [data.json](https://teoyujie.org/visuals/subsidy-atlas/data.json) (`raw.json` here).

## Worked example

1. `search_products({"category": "llm", "depth": "free"})` lists the current free LLM offers, such as `chatgpt-free` and `gemini-free`.
2. `get_product({"id": "gemini-free"})` returns its claims, each with source ids, and `sources` resolves them to titles, URLs and dates.
3. Check live eligibility at the cited source before relying on an offer: the atlas is dated, not live.
