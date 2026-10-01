---
name: vgc-trainer
description: Use the VGC turn lab (Win the turn: Protect, Fake Out and pivots) to solve a Pokémon VGC turn position with Justin Tang's Delphox + Blastoise team in Regulation M-C and read both sides' equilibrium mixes and the expected value of each plan.
---

# Use the VGC turn lab

Live at <https://teoyujie.org/visuals/vgc-protect-fakeout-pivot-trainer/>. Turn-by-turn drills with Justin Tang's Delphox + Blastoise team in Regulation M-C: Protect beats Fake Out at +4 to +3, Quick Guard ties it, and a Parting Shot pivot only works when it connects. Each position is solved as a matrix game. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Solve one position: each side's equilibrium mix and each plan's expected value | `query` with `position` |
| Find moves or team members by name | `query` with `name` |
| Get both team sheets, species, moves, items and the positions | `get_data` |
| Read the format, sources, assumptions and what is not modelled | `get_metadata` |
| Play a turn on the page | pick a position, then Play the turn or Sample from the equilibrium |

## Inputs

A position id: `intimidate-white-herb`, `mega-choice`, `defiant-tax`, `trick-room-turn`, `veil-endgame` or `spicy-rage-powder`; or a name to search moves and team members (for example `Fake Out`).

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | Both teams, species, moves, items, the positions and the player |
| `get_metadata` | none | The title, format, sources, fetch date, assumptions, what is not modelled and the featured match |
| `query` | `position` (a position id), `name` (both optional) | For a position: both sides' equilibrium mixes with each plan's expected value. For a name: matching moves and team members |

## Exports

None: the page has no download, deck or copy button. The dataset is published as [data.json](https://teoyujie.org/visuals/vgc-protect-fakeout-pivot-trainer/data.json) (`raw.json` here).

## Worked example

`query({"position": "intimidate-white-herb"})` solves that turn and returns each side's mix over its plans with the expected value of each. `query({"name": "Protect"})` lists every team member that carries Protect.
