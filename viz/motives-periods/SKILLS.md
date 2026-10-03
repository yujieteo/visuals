---
name: motives-periods
description: Use Motives and periods to compute 2πi as the period of the Tate motive, multiple zeta values with their duals and dimension counts, and the Feynman periods, Kirchhoff polynomials and point counts of the wheel graphs, and export the state as JSON, Markdown or a beamdswitch deck.
---

# Use Motives and periods

Live at <https://teoyujie.org/visuals/motives-periods/>. A small lab that asks whether residues of Feynman integrals are periods of mixed Tate motives, and answers it for the smallest graphs through three examples: the loop integral ∮ dz/z = 2πi with point counts of P¹ and G_m, multiple zeta values as iterated integrals, and the wheel graphs WS₃ = K₄ … WS₆ with the one-loop bubble. Runs offline. To change the tool, read [AGENTS.md](AGENTS.md); for what each file is, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Compute a loop integral, a multiple zeta value or a graph period without touching the page | `compute_period` |
| Read the state on the page and its derived values | `get_current_state` |
| Read the examples, graphs, input limits and sources | `get_metadata` |
| Keep the shown example as a talk | `get_beamdswitch_deck`, or the beamdswitch button |
| Check the implementation | `run_self_tests`, or the Self-test badge |
| Save or reload a state | Save or Copy JSON, then Import |
| Keep the reasoning as text | Save or Copy Markdown |

## Inputs

A state shaped like the page's JSON export's `state`: `example` (`tate`, `zeta` or `feynman`); `tate` with `centre` (−2 to 2 in steps of 0.25), `turns` (−2, −1, 1 or 2) and `steps` (3 to 512); `zeta` with `composition` (positive integers, the first at least 2, weight at most 16) and `terms` (1 to 100000); `feynman` with `graph` (`bubble`, `ws3`, `ws4`, `ws5` or `ws6`), `nodes` (4 to 200, used for K₄ only) and `q` (a prime the page can count for that graph). Missing fields take the defaults: centre 0, one turn, 16 steps; ζ(3) with 100 terms; K₄ with 40 nodes and q = 5.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The examples, graphs, input limits and every source |
| `get_current_state` | none | The page's state (as its JSON export) and the shown example's derived values |
| `compute_period` | a state (above) | The derived values for that state without changing the page, or validation errors |
| `get_beamdswitch_deck` | none | The shown example as a narrated beamdswitch Markdown deck |
| `run_self_tests` | none | Passed and total counts and each result |

## Exports

- **JSON:** `motives-periods-state.json`, `{ schemaVersion, visual, state }`; imports back.
- **Markdown:** `motives-periods.md`: inputs, derived quantities, result, the sourced notes and the sources.
- **beamdswitch deck:** `motives-periods-beamdswitch.md`, a narrated deck of the shown example (voice `bf_emma`), or Copy deck.
- **Data:** the metadata and default state are published as [data.json](https://teoyujie.org/visuals/motives-periods/data.json).

## Worked example

`compute_period({"example": "feynman", "feynman": {"graph": "ws3", "nodes": 80}})` returns the period 6ζ(3) = 7.212341418958, the position-space quadrature at 80 × 80 nodes converging to it, the 16 monomials of Ψ, and the zeros of Ψ over F_q for q = 2, 3, 5, 7: 36, 261, 3225 and 17101, which is q⁵ + q³ − q². `compute_period({"example": "zeta", "zeta": {"composition": [2, 1]}})` returns ζ(2, 1) = 1.202056903159594 with its dual (3), so ζ(2, 1) = ζ(3).
