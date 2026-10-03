---
name: beamdiag
description: Use the beam diagram creator to solve a straight beam with pinned and fixed supports (including statically indeterminate beams) for its reactions, shear force, bending moment and deflection, read the hand calculations step by step, and export the beam as an MSC Nastran .bdf deck, a Markdown document or a narrated beamdswitch deck.
---

# Use the beam diagram creator

Live at <https://teoyujie.org/visuals/beamdiag/>. Build a straight Euler–Bernoulli beam with pinned and fixed supports anywhere along it, point forces, couples and linearly varying distributed loads, a section and a material; the page solves it by the direct stiffness method in the browser and draws the shear force, bending moment and deflection with labelled axes, then works the same answer by hand, segment by segment. Runs offline. To change the tool, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Solve a beam given in SI units for reactions, extremes and values at supports and loads | `solve_beam` |
| Read the beam on the page with its results | `get_current_beam` |
| Get a NASTRAN SOL 101 deck for a beam | `export_nastran_bdf`, or Download .bdf |
| List the method, units, conventions, assumptions, example beams and sources | `get_metadata` |
| Follow the solution by hand | the Hand calculations section, or Save Markdown (or Copy Markdown) |
| Keep the beam as a talk | the beamdswitch button (or Copy deck) |

## WebMCP tools

All read-only, in SI units (m, N, Pa); none changes the page.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Title, method, units and the unit conventions the page offers, sign conventions, assumptions, the example beams, NASTRAN notes and sources |
| `get_current_beam` | none | The beam on the page with its reactions, extremes and the values at every support and load, or an error |
| `solve_beam` | `length`, `supports` (`{kind: "pin" or "fixed", x}`), `loads` (point `{kind, x, F}`, moment `{kind, x, C}`, dist `{kind, x1, x2, q1, q2}`; positive up, couples counter-clockwise), `material` (`{E, nu}`), `section` (`{A, I}`, optional `Iy`, `J`, `c`) | Reactions, extremes and the values at every support and load, or an error (naming the field when one is at fault) |
| `export_nastran_bdf` | optional `model` (as for `solve_beam`; default the page's beam), optional `units` (a unit convention id) | The `.bdf` text, in that unit convention (default the page's) |

## Exports

- **Figure:** the diagrams with every result as PNG, SVG or a one-page PDF.
- **NASTRAN:** `beamdiag.bdf`, an MSC Nastran SOL 101 bulk data deck in the page's unit convention.
- **Hand calculations:** Save Markdown (`beamdiag-hand-calculations.md`, or Copy Markdown), a Markdown document with LaTeX equations that beamdswitch also opens as a narrated deck.
- **beamdswitch deck:** `beamdiag-beamdswitch.md`, a narrated Markdown deck of the set-up, method, results, hand calculations and checks (voice `bf_emma`), or Copy deck.
- **Data:** the presets, materials, conventions and sources are published as [data.json](https://teoyujie.org/visuals/beamdiag/data.json).

## Worked example

`solve_beam` on a 6 m beam pinned at both ends (`supports: [{"kind": "pin", "x": 0}, {"kind": "pin", "x": 6}]`) with a downward 10 kN point force at mid-span (`loads: [{"kind": "point", "x": 3, "F": -10000}]`), `material: {"E": 2e11, "nu": 0.3}` and `section: {"A": 0.02, "I": 6.667e-5}` gives reactions of 5000 N up at each support, the largest shear 5000 N and the largest bending moment 15000 N·m (sagging) at x = 3 m, where the deflection is about 3.37 mm down.
