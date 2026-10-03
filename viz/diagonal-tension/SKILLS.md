---
name: diagonal-tension
description: Use Diagonal Tension to compare an aluminium skin-and-stringer panel in shear with and without a bonded doubler, by a linear elastic finite-element solve in the browser, and read mass, compliance, probe displacements and stresses, region maxima of principal tension and stringer forces, or export the model as JSON, the results as CSV and a beamdswitch deck.
---

# Use Diagonal Tension

Live at <https://teoyujie.org/visuals/diagonal-tension/>. A one-file finite-element tool: a rectangular aluminium skin of four-node plane-stress quadrilaterals, longitudinal stringers as axial bars on the skin nodes, and a doubler as a local increase in membrane thickness, loaded by a uniform shear flow on all four edges and held only against rigid-body motion. It solves variant A (skin + stringers) and variant B (A + doubler) on the same mesh and load and compares them. Linear elastic and pre-buckling only. Runs offline. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Compare a panel with and without a doubler without touching the page | `run_comparison` |
| Read the inputs on the page, whether its results are stale, and the last comparison | `get_current_state` |
| Check the implementation | `run_self_tests`, or Run self-check |
| Read the question, units, assumptions, limits, regions and probes | `get_metadata` |
| See where stress moves | the A and B views (principal tension, shear, von Mises, directions, displaced shape) on one colour scale |
| Read stresses at a point | tap a view, or type x and y under Probe |
| Save the model or the results | Export model (JSON) or Export results (CSV) |
| Keep the comparison as a talk | the beamdswitch button (or Copy deck), after a run |

## Inputs

A state in mm, N, MPa and kg/m³: `panel` {L, W, t}; `stringers` [{y, A}] along x over the full length; `doubler` {x0, y0 (lower-left corner), Lx, Ly, t}; `material` {E, nu, rho}; `load` {q}, the shear flow in N/mm on every edge; `mesh` {h}, the target element size; `regions` {exclude, band}, the excluded distance at panel edges and doubler corners and the width of the doubler-edge band. Missing blocks take the demonstration values: 600 × 400 × 1 mm skin, stringers at y = 100, 200 and 300 mm of 50 mm², a central 200 × 200 × 1 mm doubler, E = 70,000 MPa, ν = 0.33, 2,700 kg/m³, q = 50 N/mm, h = 20 mm, exclude 40 mm, band 50 mm. Dimensions and E must be positive, −1 < ν < 0.5, stringer areas and doubler thickness non-negative (zero is allowed for comparison checks), and the doubler inside the panel; at most 40,000 nodes.

## WebMCP tools

All read-only. The two run tools solve in a Web Worker of their own, apart from the page's job, and stop it when they answer or after 300 s.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The question, units, assumptions, limits, convergence tolerances, comparison regions, probes and the example |
| `get_current_state` | none | The page's inputs, `stale`, and the last valid comparison (rows, probes, region maxima, stringer forces, mass, solver diagnostics) or the last error |
| `run_comparison` | a state (above) | The same comparison for that state without changing the page, or validation or solver errors |
| `run_self_tests` | none | Passed and total counts and each result: patch test, bar FL/EA, pure shear, closed-form references, equilibrium, scaling, zero and full-panel doublers, added mass, mesh convergence, failure detection |

## Exports

- **Model:** `diagonal-tension-model.json`: schema version, units, assumptions, limits, the inputs, the mesh (grid lines, counts, restraints, load totals) and the last run's solver diagnostics.
- **Results:** `diagonal-tension-results.csv`: units, assumptions, inputs, mesh and solver diagnostics as `#` lines, then the comparison table, the probes, the region maxima and the stringer forces for A and B.
- **beamdswitch deck:** `diagonal-tension-beamdswitch.md`, a narrated Markdown deck (voice `bf_emma`) of the set-up, method, results and checks, or Copy deck; offered only after a validated run.
- **Data:** the metadata and default model are published as [data.json](https://teoyujie.org/visuals/diagonal-tension/data.json).

## Worked example

`run_comparison({})` solves the example on 651 nodes. The doubler adds 0.108 kg (0.891 to 0.999 kg, +12.1%) and lowers the compliance by 8.93%. Shear stress inside the patch (P3) falls from 50 to 27.42 MPa, but the largest principal tension in the skin at the doubler edges rises from 50 to 56.28 MPa (+12.6%), and the stringers at y = 100 and 300 mm, which run along the doubler edges, pick up 402.6 N each from nothing.
