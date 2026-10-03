# FBD Drawer

A scaled free body diagram (FBD) drawing tool in which loads are data, not
pictures. It is one self-contained `index.html` (vanilla JavaScript and SVG,
no build step, no dependencies), published at `/visuals/fbd/index.html` by
the normal site build. There is no solver: reactions are drawn, not computed.

## What it does

- **Always scaled.** Every position is a real coordinate, stored in mm, N,
  N·mm and N/mm. SI and imperial are display and input systems only: `2 m`
  is stored as 2000 mm and `3 ft 6 in` as 1066.8 mm, and switching systems
  never moves anything. Dimension lines always measure.
- **Bodies:** beams (filled bars with a real depth), rods (with pin circles),
  construction, dimension and leader lines, and freeform plates. Members meet
  at shared joints; dragging a joint moves every member on it, and dropping
  an endpoint on another joint merges them.
- **Loads:** point forces (in plane, or out of or into the page), moments
  (about the page normal, or as a double-headed vector), uniform, linear and
  triangular distributed loads, and self-weight at a centroid. Any load can
  be drawn in the reaction style. Supports are pin, roller and fixed.
- **Optional fields:** label (`F_1`, `F_{AB}`, `\alpha`), magnitude, angle or
  components, and units, each with its own visibility toggle. A load with
  nothing set is a clean arrow; arrow length is schematic.
- **Directions:** polar (`10 kN ∠ 30°`), components, a run:rise slope, or
  pointing at another point. Each load stores one canonical world direction,
  so the modes stay in step. Angles are measured from the axes triad's first
  axis, optionally relative to the member.
- **Axes:** one triad that can be shown, moved, rotated and relabelled, with
  engineering and aircraft presets (body axes in top, side and front views,
  PORT and STBD, CG marker, standard L, D, T, W and roll, pitch and yaw
  moments). Presets never move stored geometry.
- **Editing:** precise numeric fields for every coordinate, length, angle
  and load position; undo and redo (100 steps, one drag or edit each);
  delete, duplicate and multi-select; autosave to local storage under
  `fbd-drawer/v1/autosave`.
- **Touch:** pointer events throughout; one finger runs the active tool, two
  fingers pan and zoom; hit areas are at least 44 px; everything is on the
  toolbar or in the properties sheet, with keyboard shortcuts as an extra.
- **Files:** SVG and PNG downloads and PNG to the clipboard, at a
  fit-to-content scale (never the screen zoom), black on white or
  transparent; JSON and Markdown save and load. The Markdown holds the
  drawing as an SVG data URI, schedules of bodies, joints, loads and
  supports (blanks shown as `—`), the axes definition and the full JSON,
  which is the source of truth when the file is opened again.
- **beamdswitch:** File › Save beamdswitch deck saves the drawing as a
  narrated talk for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/):
  a Markdown deck with the drawing, its axes, bodies, loads, supports and
  dimension checks, every value as the schedules write it and a spoken
  narration on every slide, written with the site's standard report template
  ([`templates/beamdswitch-report.md`](https://github.com/yujieteo/site/blob/main/templates/beamdswitch-report.md)).
  There is no solver, so it has no equations. Copy beamdswitch deck puts the
  same deck on the clipboard; if saving is blocked, saving copies it instead.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | The whole tool. `<script id="site-theme">` in the head applies the reader's site-wide Light or Dark choice (`localStorage` `theme`) before paint. `<script data-core>` blocks are the DOM-free model (units, validation, serialisation, rendering, export); `<script data-ui>` blocks are the interface. Each block is one feature, in build order. |
| `beamdswitch.js` | The standard beamdswitch report template (`deck(report)` writes a report as a beamdswitch Markdown deck); a copy of the site's shared [`templates/beamdswitch.js`](https://github.com/yujieteo/site/blob/main/templates/beamdswitch.js), pasted unchanged into the page as `<script id="fbd-beamdswitch" data-core>` and kept identical by the tests. The `fbd-report` core block (`FBD.beamdswitchReport`) fills it from the drawing. |
| `examples.json` | Reference drawings 1 to 5 from the specification, in the saved format. Published as the visualization's `data.json`. |
| `tools/make-examples.mjs` | Rebuilds `examples.json` through the tool's own unit parsing and loader. |
| `tools/sync-examples.mjs` | Copies `examples.json` into the page (File › Examples) so it stays one file. |
| `tools/core.mjs` | Loads the core scripts into Node for the tests and the builders. |
| `tools/touch-build.js` | Reference drawing 6: builds drawing 1 by touch alone in a browser and compares it with the fixture. |

## JSON format

```json
{
  "format": "fbd-drawer",
  "version": 1,
  "title": "…",
  "geometry": { "joints": [], "bodies": [], "loads": [], "supports": [], "markers": [] },
  "view": { "units": {}, "triad": {}, "colourByType": false, "grid": true, "snap": true, "angleSnap": 15 }
}
```

Geometry is in world coordinates (mm, y up). Stored directions are degrees
counter-clockwise from world +x; the triad only changes how they are shown.
View settings (display units, triad, toggles) sit apart from geometry.
Ids may use only letters, digits, `_` and `-`. Loading validates everything and rejects a file with a list of errors that
name the exact path, for example `geometry.loads[1].at.body: unknown body
"b9"`, rather than silently dropping content.

## Update the examples

```sh
node tools/make-examples.mjs
node tools/sync-examples.mjs
```

## Verify

```sh
node --test 'tests/*.test.mjs'
```

The tests live in [yujieteo/fbd](https://github.com/yujieteo/fbd), where CI
runs them; the site's `visuals/fbd/` is a port of the page files and runs
none of them.

The tests load every reference drawing and check that saving is identity and
that JSON and Markdown round trips are identical; that units convert on entry
(2 m stored as 2000 mm, imperial input) and switching systems changes no
geometry; that the 3000 mm member of drawing 1 measures 3000 mm at any zoom
and in exports; that rotating the triad or switching preset never moves
stored geometry; that the aircraft preset relabels its axes and shows PORT
and STBD where the view has them; and that invalid files report clear
errors. `tests/fbd-beamdswitch.test.mjs` parses each drawing's beamdswitch
deck with beamdswitch's own parsers, checks its schedules against the
Markdown file's, and picks both File menu items.

Drawing 6, building drawing 1 by touch alone, needs a browser. Open the page
with touch emulation at phone size (for example 390 × 844) and run
`tools/touch-build.js` in the console. It uses only touch pointer events on
the canvas, a two-finger pinch, taps on the toolbar and properties sheet, and
typed field values. It returns `{ same: true }` only when the result matches
drawing 1 exactly and each pinch really changed the zoom (out, then back in);
a pinch that fails to zoom is listed in `differences`. This simulates touch; it is not a physical device test.
