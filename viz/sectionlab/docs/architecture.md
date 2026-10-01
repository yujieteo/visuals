# Architecture

Sectionlab is one static page. `build.py` inlines the engine modules, the page
script and two JSON files into `template.html` to write `index.html`.

```text
raw.json ─────────────────────────────┐
reference/torsion-accuracy.json ──────┤
src/geometry.js  exact boundaries     │
src/shapes.js    catalogue            ├─ build.py ─→ index.html
src/section.js   model + properties   │
src/torsion.js   formulas             │
src/plastic.js   M–κ                  │
src/yaml.js      YAML subset          │
src/report.js    report + exports     │
src/engine.js    compute()            │
beamdswitch.js   deck template        │
src/ui.js        page                 ┘
```

## Data flow

1. The page edits one **model** (see [model-format.md](model-format.md)).
2. `engine.compute(model, { accuracy })` validates it (`section.normalize`), builds
   every part's exact contours (`section.partContours` via the shape catalogue),
   checks overlaps and void hosts (`section.assemble`), and computes
   `section.properties`, `torsion.torsion` and `plastic.analyse`.
3. `report.build` turns the results into one report object. Markdown, the PDF, the
   print view, the SVG figures (and so the PNGs) and the beamdswitch deck
   (`report.beamdswitch`, written out by `beamdswitch.js`) are all rendered from it, so
   the exports cannot disagree with each other.

## Modules

| Module | Responsibility |
| --- | --- |
| `geometry.js` | Lines and circular arcs; filleted polygons; Green's-theorem moments of a region, optionally restricted to a slab lo ≤ v ≤ hi; frames; extents; polygonisation and overlap areas; SVG paths |
| `shapes.js` | The catalogue: dimensions, corner names, default radii, `build(dims, radii)` to exact contours, resize rules |
| `section.js` | Model validation with field paths, part placement (turn then move), overlap and void-host checks, transformed-section properties |
| `torsion.js` | Torsion formulas and their domains; availability from the accuracy table |
| `plastic.js` | Ramberg–Osgood law, strip fibres, the ε0 and neutral-axis solves, the ε_lim search, M_el and the σ0.2-block M_p |
| `yaml.js` | Reader and writer for the YAML subset |
| `report.js` | Report object, Markdown, the beamdswitch report, import, HTML, SVG figures and the PDF writer |
| `engine.js` | `compute()`, `buildReport()` and `buildBeamdswitch()` |
| `beamdswitch.js` | The standard beamdswitch template: `deck(report)` writes the narrated Markdown deck |
| `ui.js` | Editor, panels, charts, exports, share link, WebMCP tools |

Every engine module is a UMD file: in the browser it attaches to `SectionLab`, and
in Node it is `require`d, which is how the tests run it.

## Invariants

- Geometry is exact: parts are lines and circular arcs, never polygons standing in
  for curves. Polygonisation is used only to detect overlaps.
- Contours keep the region on their left (outer counter-clockwise, holes clockwise).
- A shape's local bounding box is centred on the origin; a part turns about that
  centre and then moves to (x, y).
- Every property is about the (transformed) centroid.
- Torsion is reported only from the accuracy table; no formula is shown without a
  measured accuracy, and a withdrawn formula shows "n/a".
- Adding a shape changes `shapes.js`, `reference/sectionref.py` (independent
  geometry), `reference/cases.py`, and optionally the torsion files. Nothing else.
