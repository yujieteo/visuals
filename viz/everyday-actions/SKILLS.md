---
name: everyday-actions
description: Use Everyday Actions to look up how often people do an ordinary activity (ATUS 2014-2016), how it feels (Kahneman et al. 2004), and how 100 coded everyday decisions sit on regret, downside, upside and information axes.
---

# Use Everyday Actions

Live at <https://teoyujie.org/visuals/everyday-actions/>. Everyday activities plotted by how often people do them and how they feel doing them, with 100 common actions placed on regret, downside, upside and information axes, and a "considered, never done" ledger. An empty value means not measured. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Get the whole activity table (frequency and affect) | `get_data` |
| See every source measurement behind one activity | `query` with an `activity_id` |
| Read one of the 100 coded decisions | `query` with a decision id |
| Find the sources, populations and activity crosswalk | `get_metadata` |
| Tally the time spent reconsidering things never done | the page's ledger (Add a row, Restore examples) |
| Keep the charts, as set, as a talk | the beamdswitch button (or Copy deck) |

## Inputs

Activity ids from `data.csv` (for example `socializing`) and decision ids from `decisions.csv` (for example `text-friend`, `reply-message`, `say-thanks`). On the page, the ledger takes your own items, times considered and minutes.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | Every activity row: DRM proportion, hours, positive, negative and net affect, and ATUS participation and minutes by population; empty string means not measured |
| `get_metadata` | none | The sources, populations and the activity crosswalk |
| `query` | `id` (required) | Every source measurement for that activity, and the coded decision with that id (or `null`) |

## Exports

- **beamdswitch deck:** `everyday-actions-beamdswitch.md`, a narrated Markdown deck of the charts as set (voice `bf_emma`), or Copy deck.
- **JSON:** the activity table is published as [data.json](https://teoyujie.org/visuals/everyday-actions/data.json) (`data.csv` here, one object per row); `sources.json` holds the citations and one record per number shown.

## Worked example

1. `get_data()` and find the `socializing` row: its DRM net affect and its ATUS participation share and minutes when performed.
2. `query({"id": "socializing"})` returns each source measurement behind those numbers, with its source.
3. `query({"id": "text-friend"})` returns no measurements but the coded decision, whose ordinal codes are authored, not measured.
