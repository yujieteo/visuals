---
name: fastener-cg
description: Analyse a bolt or rivet group (centroids, section properties, elastic or ICR load distribution, interaction margins) with the Fastener Pattern CG Tracker or its read-only WebMCP tools. For preliminary sizing and hand-calculation cross-checks.
---

# Fastener Pattern CG Tracker

Centroids, section properties and elastic load distribution for a bolt or rivet group under a general 3D eccentric load, with interaction margins, prying and preload, plate bearing and tear-out, and an instantaneous-centre-of-rotation (ICR) solve. For preliminary sizing. Open it at <https://teoyujie.org/visuals/fastener-cg/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Get centroids, J, Ixx, Iyy, Ixy, principal axes and per-fastener loads for a pattern | `analyze_pattern` |
| Read the pattern and results the page shows | `get_current_pattern` |
| Get the Markdown export of a pattern | `export_markdown` |
| Read the version, units, conventions, assumptions and warnings catalogue | `get_metadata` |
| Print a PDF report or save the diagram as a PNG | The page's report buttons (below) |

## Inputs

- Fasteners: positions, with per-fastener area and shear and axial stiffness, entered on a canvas or in a table, or made by the generators.
- A general 3D load (forces and moments) applied at a point; keyed shear and tension allowables and the interaction exponents.
- Optional T-stub prying, bolt preload, up to two plates for bearing and tear-out, the contact-edge axial method and the ICR solve.
- Units N·mm or lbf·in. The tools take a pattern in the page's canonical JSON format (`schemaVersion` 1), as `get_current_pattern` returns it.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The tool version, milestone, units, sign conventions, assumptions and the full warnings catalogue (error, warning and note ids). |
| `get_current_pattern` | none | The page's pattern (canonical JSON) and its results: centroids, J, Ixx, Iyy, Ixy, principal axes, reduced load, per-fastener loads, interaction margins (exact-k MS), the critical fastener and warnings. |
| `analyze_pattern` | `pattern` (canonical JSON) | The same results as `get_current_pattern` for that pattern, or `ok: false` with the import issues. Does not change the page. |
| `export_markdown` | optional `pattern` | The Markdown export (input and result tables plus the exact JSON block) for that pattern, or for the page's pattern when none is given. |

## Exports

- Markdown report with a worked calculation trace, from Export Markdown report (or `export_markdown`).
- JSON: Export JSON saves the pattern; Import reads JSON or Markdown back. `raw.json`, published as `data.json`, holds the published metadata.
- PDF by browser print (Print / Save as PDF, A4 or Letter) and a 2× PNG of the annotated pattern diagram (Download PNG).
- Hand calculations: Save Markdown and Copy Markdown export the current pattern worked step by step (formula, substituted numbers, result) as Markdown that beamdswitch also opens as a deck.
- beamdswitch deck: the beamdswitch and Copy deck buttons under Reports export a narrated Markdown talk for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/) (set-up, method, results with every hand-calculation step as a slide, and checks), with voice `bf_emma`.

## Worked example

Call `get_current_pattern` on the page's example, “Bracket A - 2x2”: four
fasteners at (±50, ±30) mm, each 12 mm in diameter, with Fy = −10000 N
applied at (150, 0). It returns all three centroids at (0, 0),
`section.J` 13600, `Ixx` 3600, `Iyy` 10000, a reduced moment `MzAtCs` of
−1500000 N·mm, and for fastener F1 a resultant shear `Rs` of about 8671 N.
With no allowables set, its interaction check is `not-evaluated`.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Results are for preliminary sizing and hand-calculation cross-checks, not certified design.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
