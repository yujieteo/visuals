---
name: edge-pitch
description: Check edge distance, end distance and pitch margins of a riveted or bolted sheet joint with the fastener edge margin and pitch visualiser or its read-only WebMCP tools. Exploration and preliminary sizing only, not for certification.
---

# Fastener edge margin and pitch visualiser

An exploration tool for edge distance, end distance and pitch in riveted and bolted single-lap and double-shear sheet joints. Not for certification. Open it at <https://teoyujie.org/visuals/edge-pitch/>; everything
runs in the browser and works offline. The page registers read-only WebMCP
tools through the browser's `modelContext` API when the browser offers it;
each returns its result as JSON text and none changes the page.

## Tasks

| The request is to... | Use |
| --- | --- |
| Get strength and geometric margins for a joint | `solve_joint` |
| Read the joint and margins the page shows | `get_current_joint` |
| Read the checks, formulas, source tags, assumptions and test-vector format | `get_metadata` |
| Run the self-test, including imported test vectors | `run_self_tests` |
| Save a report, the inputs or a narrated talk | The page's export buttons (below) |

## Inputs

- Fastener: type (solid rivet, blind rivet or bolt), diameter D, hole diameter, head type and countersink depth.
- Sheet thickness and width, single or double shear; material allowables (Ftu, Fty, Fcy, Fsu, Fbru at e/D 1.5 and 2.0, E, ν).
- Geometry: pattern (single, aligned or staggered), rows, fasteners per row, end and side edge distances, pitch and row spacing.
- Load P and its direction, the buckling end fixity and the geometric rules. The tools use mm, N and MPa; the page also shows US units.

## WebMCP tools

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The disclaimer, units, checks with their formulas and source tags, assumptions, scope, sources and the test-vector format. |
| `get_current_joint` | none | The page's joint (mm, N, MPa) with every strength and geometric margin, the governing modes, warnings and assumptions. |
| `solve_joint` | A joint in mm, N and MPa: `fastener`, `sheet`, `material`, `geometry`, `load`, `buckling`, `rules`; fields left out take the placeholder values | The strength and geometric margins, governing modes and warnings, or the blocking errors. Does not change the page. |
| `run_self_tests` | none | `passed`, `total` and each result (hand calculations, bearing interpolation end points, SI/US round trips, column function branches and imported test vectors). |

## Exports

- Markdown report (`edge-pitch-report.md`): inputs, results, formula sources, warnings, assumptions and the disclaimer; download or copy.
- JSON: results JSON (inputs, results and `schemaVersion`) and inputs-only JSON, to share or reload; both download or copy, and the page imports JSON and test vectors.
- beamdswitch deck (`edge-pitch-beamdswitch.md`): set-up, method, results (with a margin plot) and checks, narrated; Copy deck puts it on the clipboard.

## Worked example

Call `solve_joint` with the placeholder joint and a shorter end distance:

```json
{"geometry": {"eEnd": 8.4}}
```

It returns end-row bearing `allowable` 5184 N (e/D 1.75, Fbru 675 MPa) against
`applied` 1000 N, MS 4.18; the governing strength mode is inter-rivet buckling
(MS 3.49) and the governing geometric margin is end distance e_end/D (MS 0.17).
Every result carries the “Not for certification” disclaimer.

## Rules

1. Quote the tool's own numbers; do not re-derive them by hand.
2. Quote the disclaimer with any result: the tool is for exploration and preliminary sizing only.

For how the tool is built and tested, see [AGENTS.md](AGENTS.md); for each file's role, [README.md](README.md).
