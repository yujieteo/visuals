---
name: mohr
description: Use Mohr's Circle Visualiser to transform a 3D stress or small-strain state, read principal values and directions, Mohr's circles, invariants and Tresca, Mohr-Coulomb, Rankine and von Mises checks, and export the state as JSON, Markdown or a beamdswitch deck.
---

# Use Mohr's Circle Visualiser

Live at <https://teoyujie.org/visuals/mohr/>. A teaching tool and calculator for an isotropic linear-elastic material: principal values and directions by Jacobi rotation, the three Mohr circles with the admissible region, the 2D circle of a rotation about x, y, z or a principal axis, plane stress and plane strain, stress- or strain-driven input linked by Hooke's law, failure checks with envelopes, a strain-gauge rosette helper and an orbitable 3D element. Runs offline. To change the tool, read [AGENTS.md](AGENTS.md); for the conventions, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Analyse a stress or strain state without touching the page | `analyze_stress_state` |
| Read the state on the page and its results | `get_current_state` |
| Check the implementation | `run_self_tests`, or Self-test |
| Read the scope, conventions, units, presets and file schema | `get_metadata` |
| Turn rosette gauge readings into strains | Fill strain from gauges on the page |
| Save or reload a state | Download or Copy JSON or Markdown, then Import pasted text |
| Keep the state as a talk | the beamdswitch button (or Copy deck) |

## Inputs

A state shaped like the page's JSON export: `units` (stress `Pa`, `kPa`, `MPa`, `GPa`, `psi` or `ksi`; strain `ue`, `mm/mm` or `%`), `conventions` (normal sign, 2D shear convention A or B, engineering or tensor strain shear), `driver` (`stress` or `strain`), `entryMode` (`tensor` or `principal`), `constraint` (`general`, `plane-stress` or `plane-strain`), the active stress or strain block, material and failure settings. Missing blocks take the page defaults: preset 1, σx = 80, σy = −40, τxy = 30 MPa, plane stress, E = 200 GPa, ν = 0.3, Tresca with σy = 250 MPa.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Scope, conventions, units, presets and the file schema |
| `get_current_state` | none | The page's state (as its JSON export) and results: principal values and directions, circles, in-plane circle, selected plane, invariants, von Mises, strain and the failure check, in the displayed units and sign convention |
| `analyze_stress_state` | a state (above) | The same results for that state without changing the page, or validation errors |
| `run_self_tests` | none | Passed and total counts and each result: presets 1-8, eigenvector checks, rotation and Hooke round trips, shear-convention geometry, rosette formulas, unit conversions and export round trips |

## Exports

- **JSON:** `mohr-state.json`, the state in the recorded units and sign convention; imports back.
- **Markdown:** `mohr-report.md`; imports back.
- **beamdswitch deck:** `mohr-beamdswitch.md`, a narrated Markdown deck of the state (voice `bf_emma`), or Copy deck.
- **Data:** the metadata and default state are published as [data.json](https://teoyujie.org/visuals/mohr/data.json).

## Worked example

`analyze_stress_state({})` analyses the default plane-stress state (σx = 80, σy = −40, τxy = 30 MPa): principal stresses 87.08, 0 and −47.08 MPa (in-plane angle 13.28°), maximum shear 67.08 MPa, von Mises 117.9 MPa, and a Tresca factor of safety of 1.863 against σy = 250 MPa (PASS). `analyze_stress_state({"constraint": "plane-strain"})` keeps the in-plane stresses and adds σz = 12 MPa, the out-of-plane stress Hooke's law then requires with ν = 0.3.
