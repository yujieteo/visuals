---
name: tampines-food
description: Use Good food in Tampines to list the 50 most-recommended food outlets across Tampines Mall, Tampines 1, Century Square and Our Tampines Hub, filter by cuisine or mall, and read each signature dish's sourced calorie estimate.
---

# Use Good food in Tampines

Live at <https://teoyujie.org/visuals/tampines-food/>. The 50 places food writers recommend most across four Tampines malls, ranked by how many independent guides name them and checked against the malls' own directories as of 30 September 2026, with a sourced calorie estimate (carbohydrate, protein, fat) for most signature dishes. Estimates describe reference dishes, not measurements of an outlet's food. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the top outlets, optionally by cuisine and mall | `query_outlets` |
| See who recommends one outlet, how its presence was checked and its dish's nutrition | `get_outlet` |
| Compare dishes by energy, carbohydrate, protein and fat | `get_calorie_breakdown`, or Most energy on the page |
| Read the method, cuisines, malls and sources | `get_metadata` |
| Keep the places shown as a talk | the beamdswitch button (or Copy deck) |

## Inputs

Cuisine ids `chinese`, `malay`, `indian`, `japanese`, `korean`, `southeast-asian`, `western`, `cafe-bakery`, `dessert`; mall ids `tampines-mall`, `tampines-1`, `century-square`, `our-tampines-hub`; outlet ids such as `lolas-cafe` (from `query_outlets`).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, as-of date, ranking and calorie methods, cuisines and malls with summaries, and every source |
| `query_outlets` | `cuisine`, `mall`, `limit` 1-50 (all optional) | Outlets in rank order: rank, id, name, mall, unit, cuisine, dish, publishers and estimated kcal |
| `get_outlet` | `id` (required) | The outlet record and the guides that recommend it |
| `get_calorie_breakdown` | `cuisine`, `mall` (optional) | Estimated energy and macronutrients per dish, and the dishes that cannot be estimated with the reason |

## Exports

- **beamdswitch deck:** `tampines-food-beamdswitch.md`, a narrated Markdown deck of the places shown (voice `bf_emma`), or Copy deck.
- **JSON:** the dataset is published as [data.json](https://teoyujie.org/visuals/tampines-food/data.json) (`raw.json` here).

## Worked example

1. `query_outlets({"mall": "our-tampines-hub", "cuisine": "malay"})` lists the Malay outlets there in rank order.
2. `get_outlet({"id": "<id>"})` shows which guides name it and how its presence in the mall was checked.
3. `get_calorie_breakdown({"mall": "our-tampines-hub"})` gives the dish estimates for that mall; anything under `not_estimable` has no fixed portion, and the reason says why.
