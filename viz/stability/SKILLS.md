---
name: stability
description: Use the Structural Stability Visualiser to run column buckling, second-order beam-column, flat-plate shear buckling and NACA TN 2661 diagonal-tension checks with every formula tagged by source, and export the results as JSON, Markdown or a beamdswitch deck. Not for certification.
---

# Use the Structural Stability Visualiser

Live at <https://teoyujie.org/visuals/stability/>. Four tabs: column buckling (Euler, Johnson and an optional Ramberg-Osgood tangent-modulus curve), second-order beam-columns (a secant-type first-yield root finder cross-checked by a beam finite-element eigenvalue solve), flat-plate shear buckling with simply supported or clamped edges and the NACA TN 3781 plasticity factor, and NACA TN 2661 diagonal tension on plane webs. Every formula is tagged `NASA`, `classical` or `fit`; a chart relation outside its figure shows "unavailable" rather than a number. **Not for certification.** To change the tool, read [AGENTS.md](AGENTS.md); for the method, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Solve one analysis without touching the page | `solve_stability` |
| Read the tab on the page with its inputs, results, warnings and sources | `get_current_analysis` |
| Check the implementation against the TN 2661 worked examples | `run_self_tests`, or Run self-test |
| Read the units, source policy, citations, scope and figure-fit errors | `get_metadata` |
| Save or reload an analysis | Inputs JSON, Results JSON or Markdown report, then Import pasted |
| Keep the tab as a talk | the beamdswitch button (or Copy deck) |

## Inputs

A tab, `column`, `beamColumn`, `shear` or `diagonal`, and its inputs in canonical SI (N, mm, MPa): a material {E, Fcy, nu, n} and, for column and beamColumn, a section {shape, ...}. Any field left out takes the tab default. The page also shows US units (lbf, in, ksi), but values are stored in N, mm and MPa.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Purpose, disclaimer, units, source policy, report citations, reference notes, scope and figure-fit errors |
| `get_current_analysis` | none | The tab on the page as its Results JSON: inputs and results in N, mm and MPa, warnings and formula sources |
| `solve_stability` | `tab` (required), `inputs` | The Results JSON for that analysis, or the blocking errors |
| `run_self_tests` | none | Each self-test result with its tolerance: FE Pcr against π²EI/(KL)², the k = 1 limit against pure Wagner, k_s asymptotes, unit and file round trips, and the TN 2661 worked examples |

## Exports

- **JSON:** `stability-<tab>-inputs.json` and `stability-<tab>-results.json`; both import back.
- **Markdown:** `stability-<tab>.md`, a report that repeats the not-for-certification notice.
- **beamdswitch deck:** `stability-<tab>-beamdswitch.md`, a narrated Markdown deck of the tab (voice `bf_emma`), or Copy deck.
- **Data:** the sources and digitised NASA figure points are published as [data.json](https://teoyujie.org/visuals/stability/data.json).

## Worked example

`solve_stability({"tab": "column"})` solves the column tab at its defaults, a 2024-T3 aluminium tube (D = 25 mm, t = 1.5 mm) 800 mm long, pinned-pinned, under P = 5000 N: KL/r = 96.09 exceeds the transition (KL/r)c = 72.75, so Euler governs, with σcr = 77.39 MPa and Pcr = 8570 N against an applied P/A of 45.15 MPa. Change one field, for example `{"tab": "column", "inputs": {"material": {"E": 71000}}}`, and the rest keep their defaults. Read `warnings` and `sources` (each with its kind: NASA, classical or fit) before quoting a result; `get_metadata` gives each fit's error, and an "unavailable" value means the chart data does not cover that input.
