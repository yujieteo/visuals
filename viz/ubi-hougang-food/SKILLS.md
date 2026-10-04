---
name: ubi-hougang-food
description: Use Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos to list the 100 most-recommended food places near six MRT stations, filter by cuisine or area, see them on an overview map and one map per area, and read each signature dish's sourced calorie estimate.
---

# Use Good food in Ubi, Hougang, Woodleigh, Paya Lebar and Eunos

Live at <https://teoyujie.org/visuals/ubi-hougang-food/>. The 100 places food writers recommend most within 1 km of Ubi, Hougang, Kovan, Woodleigh, Paya Lebar and Eunos MRT stations, ranked by how many independent publishers and guides name them. Each place was checked against a mall directory, a closure notice or a recent guide as of 4 October 2026. Most signature dishes have a sourced calorie estimate (carbohydrate, protein, fat). Estimates describe reference dishes, not measurements of a place's food. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| List the top places, optionally by cuisine and area | `query_outlets` |
| See who recommends one place, how its presence was checked and its dish's nutrition | `get_outlet` |
| Compare dishes by energy, carbohydrate, protein and fat | `get_calorie_breakdown`, or the calorie bars on the page |
| Read one area: its stations, malls, cuisines, places and the places left out | `get_area` |
| Read the ranking and calorie methods and every source | `get_sources` |
| Read the fields of the view, or the current view and its derived values | `get_metadata`, `get_state` |
| Keep the view as a talk or a document | `get_markdown`, the beamdswitch button (or Copy deck) |

## Inputs

Cuisine ids `chinese`, `malay`, `indian`, `japanese`, `korean`, `southeast-asian`, `western`, `cafe-bakery`, `dessert`. Area ids `ubi`, `hougang` (Hougang and Kovan stations), `woodleigh`, `paya-lebar`, `eunos`. Place ids such as `mami-midah-briyani` (from `query_outlets`).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and every state field with its type, bounds and default |
| `get_state` | none | The current state, the values derived from it, the JSON that "Load view JSON" restores and the URL |
| `get_markdown` | none | The Markdown record: the deck's frames without narration |
| `query_outlets` | `cuisine`, `area`, `limit` 1-100 (all optional) | Places in rank order: rank, id, name, area, venue, unit, cuisine, dish, publishers, guides and estimated kcal |
| `get_outlet` | `id` (required) | The place record, its presence check and the guides that recommend it |
| `get_calorie_breakdown` | `cuisine`, `area` (optional) | Estimated energy and macronutrients per dish, and the dishes that cannot be estimated with the reason |
| `get_area` | `area` (required) | The area's stations, summary, mall directories, cuisines, places in the top 100 and places left out |
| `get_sources` | none | The as-of date, the ranking and calorie methods, and every source |

## Exports

- **beamdswitch deck:** `ubi-hougang-food-beamdswitch.md`, a narrated Markdown deck of the view (voice `bf_emma`), or Copy deck.
- **Markdown record:** `ubi-hougang-food-record.md`, the same frames without narration.
- **JSON view:** `ubi-hougang-food-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Data:** [data.json](https://teoyujie.org/visuals/ubi-hougang-food/data.json) (`raw.json` here).

## Worked example

1. `query_outlets({"area": "eunos", "cuisine": "indian"})` lists the 5 Indian places near Eunos in rank order, from `mami-midah-briyani` (rank 34).
2. `get_outlet({"id": "mami-midah-briyani"})` shows which guides name it and how its presence was checked.
3. `get_calorie_breakdown({"area": "eunos"})` gives the dish estimates for Eunos. A dish under `not_estimable` has no fixed portion, and the reason says why.
4. `get_area({"area": "eunos"})` gives the Eunos summary and the places left out as closed or unverified.
