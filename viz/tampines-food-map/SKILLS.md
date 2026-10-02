---
name: tampines-food-map
description: Use the Tampines hub food map and its read-only WebMCP tools to answer where to eat in Tampines Mall, Century Square and Tampines 1, with ratings, review summaries and estimated calories and macros per main.
---

# Where to eat in Tampines hub

The 20 best-rated places to eat across Tampines Mall, Century Square and Tampines 1, ranked by Google Maps rating among picks from eight 2025-26 food guides, with review summaries and HPB SGFoodID-based calorie and macro estimates for their mains.

Open `index.html` in a browser. It works offline. It is not published on teoyujie.org; the site's current Tampines food page is <https://teoyujie.org/visuals/tampines-food/>. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| List the ranked places with their mains | `get_data` |
| Find places in one mall, of one cuisine group or with a lighter main | `query` with `mall`, `group` or `max_kcal`, or the mall chips on the page |
| Read how places were ranked and calories estimated, the sources and limitations | `get_metadata` |

## Inputs

- Embedded data: the ranked places (mall, unit, floor, cuisine, Google Maps rating, guide quotes, review summary, Google Maps link) and each main's estimated kcal, protein, carbohydrate and fat with the HPB SGFoodID dishes it is matched to; the hub's OpenStreetMap streets and buildings. Fetched 2026-09-29.
- Controls: the mall chips, and the numbered dots on the map and the place cards, which open a place's details.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{rows, total, truncated, next_steps}`: the 20 ranked places with their mains, kcal and macros. |
| `get_metadata` | none | JSON with the headline claim, ranking method, calorie method, sources and limitations. |
| `query` | `mall` (`Tampines Mall`, `Century Square` or `Tampines 1`), `group` (`Chinese`, `Japanese`, `Korean`, `Local` or `Western`), `max_kcal` (number); all optional | JSON `{rows, total, truncated, next_steps}`: the places that match, where `max_kcal` keeps places with at least one main at or under it. |

## Exports

The page has no export: the data is in `get_data` and in `raw.json`, `sgfoodid.json` and `meta.json` in this repository.

## Worked example

1. Call `query` with `{"mall":"Tampines 1"}`: 7 of the 20 places are in Tampines 1, and the first row is TANYU (rank 1, rated 4.8).
2. Call `get_metadata` for the caveat that calorie figures are estimates for HPB's standard servings, not each outlet's recipe.
