# Sectionlab

Build a structural cross-section from library shapes and read its section
properties, torsion constant and Ramberg–Osgood moment–curvature curve. Everything
runs in the browser from one static file, `index.html`, with no runtime
dependencies. MIT licence.

> **Verify independently.** Sectionlab reports its own calculation. It is not a
> design-code compliance check.

Units are mm, MPa (N/mm²), N and N·mm throughout.

## What it does

- **Model.** A section is a parts list. Each part has a library shape with numeric
  dimensions, a position, a 0° or 90° turn, a material and a void flag (voids are
  holes cut from the one solid part that contains them). Every corner has its own
  radius (0 = sharp). There are no free-form polygons.
- **Editing.** Drag shapes in from the palette, drag parts to move them, drag the
  square handles to resize them, and click a corner dot (or use the corner list) to
  set its radius. Parts snap to the grid and to each other's edges; arrow keys nudge;
  touch works through pointer events. Undo and redo cover every edit.
- **Catalogue.** Phase 1: solid rectangle, circle, semicircle, triangle, trapezoid and
  regular polygon; rectangular and circular hollow sections. Phase 2: parallel-flange I/H,
  channel, angle, tee, Z and cross sections, with root fillets and toe radii as corner radii.
  Phase 3: cold-formed angle, plain or lipped channel and Z, and top hat, each given by its
  outer dimensions, wall t and inside bend radius.
- **Section properties.** Area, centroid, I_x, I_y, I_xy, principal values and
  angle, S_x±, S_y±, r_x, r_y, polar I_p and r_p, and first moments Q_x and Q_y,
  about the centroid. Composites use modular ratios n = E / E_base with a selectable
  E_base.
- **Torsion.** Given only for a single library shape with a formula verified against a
  numerical Prandtl solution, with that formula's measured accuracy; otherwise "n/a".
- **Plastic bending.** Ramberg–Osgood law per material (E, σ0.2, n, ε_lim, optional
  separate compression law). Fibre integration gives the M–κ curve up to the first
  fibre reaching ε_lim and the allowable moment there, plus Z_p and the shape factor
  (at N = 0) and, with an axial force, M_p(N) and M_el(N) at the applied axial force N. Bending
  about x, y or a principal axis with an axial force N; the neutral axis either rotates
  for zero cross moment (b, default) or stays parallel to the axis (a).
- **Hand calculations.** Under the results, the closed-form properties worked by hand,
  step by step (formula, then the numbers substituted, then the result), by composite
  parts: each part's area, centroid and modular ratio; A = Σ n_i A_i; the centroid from
  first moments; each part's own second moments (in closed form for sharp rectangles,
  circles, tubes and sharp boxes, otherwise from its exact boundary); I_x, I_y and I_xy
  by the parallel-axis theorem; the principal values and angle; section moduli, radii of
  gyration and the polar moment; and, where the page has a verified formula, the torsion
  constant with its numbers substituted. Q, M_el, M_p and the M–κ curve come from the
  solver's numerical integration and are quoted, not derived. Every number is the
  engine's, as the page shows it. Save Markdown and Copy Markdown export the steps as a
  Markdown document with LaTeX equations that beamdswitch also opens as a narrated deck.
- **Exports.** PNG of the section and of the curve; a one-file PDF report written by a
  small generator (standard Helvetica, no embedded fonts); a print view from the same
  report; Markdown with readable tables and a fenced YAML block of the whole model,
  which imports back; a share link carrying the model in the URL fragment; and a
  beamdswitch button that saves the section as a narrated Markdown deck for
  [beamdswitch](https://teoyujie.org/visuals/beamdswitch/) (slides, narration and a
  video), with Copy deck beside it. Its results end on the hand calculations, and it is
  read in the `bf_emma` voice.
- **WebMCP tools** (when the browser offers `navigator.modelContext`):
  `get_metadata`, `get_current_section`, `compute_section`, `export_markdown`.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The built page (do not edit; run `build.py`) |
| `template.html` | Page markup and styles |
| `src/` | Engine modules (`geometry`, `shapes`, `section`, `torsion`, `plastic`, `yaml`, `report`, `handcalc`, `engine`) and the page script `ui.js`; each engine module also loads in Node |
| `beamdswitch.js` | The standard beamdswitch report template (Markdown deck writer), an unchanged copy of the host site's `templates/beamdswitch.js` |
| `raw.json` | Examples, material presets, method text and assumptions |
| `reference/` | Independent Python references, fixtures and their results |
| `tests/` | Node (`*.test.mjs`) and Python (`test_*.py`) tests |
| `docs/` | Architecture, model format and verification notes |
| `SKILLS.md`, `playbooks/` | Router and step-by-step playbooks for agents and contributors |

## Build and test

```sh
python build.py                                     # write index.html
node --test 'tests/*.test.mjs'                                  # Node 22+
pip install -r requirements-test.txt                # numpy, scipy, PyYAML (tests only)
python -m unittest discover -s tests -p 'test_*.py'
```

Regenerate the reference data after changing `reference/cases.py` or a formula:

```sh
python reference/build_reference.py      # fixtures.json and reference.json
python reference/torsion_accuracy.py     # torsion-accuracy.json (about 30 s)
python build.py                          # the page inlines torsion-accuracy.json
```

Open `index.html` in a browser to use it; no server is needed.

## Verification in one paragraph

Geometric properties from the engine (Green's theorem on exact line-and-arc
boundaries) agree with an independent Python decomposition into polygons, circular
segments and disks to about 1e-15, and the tests require 1e-9. Torsion formulas (exact
cases, the Saint-Venant series, Bredt–Batho and the Vlasov thin-walled open-section
formula) are measured against a linear finite-element Prandtl solution with Richardson
extrapolation; the page states each formula's accuracy and drops any formula that
misses it. The M–κ curve agrees with an independent Python width-integration
reference to about 1e-8 (tests require 1e-6). See [docs/verification.md](docs/verification.md).
