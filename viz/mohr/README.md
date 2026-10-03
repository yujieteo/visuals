# Mohr's Circle Visualiser

Teaching tool and calculator for 3D stress and small-strain transformation in
an isotropic linear-elastic material. `index.html` is one self-contained file
with no dependencies, no network access and no build step.

It covers the full 3D tensor (principal values and directions by Jacobi
rotation, the three Mohr circles and the admissible region), 2D circles as
rotations about x, y, z or a principal axis with a draggable angle, plane
stress and plane strain, stress- or strain-driven input linked by Hooke's law,
Tresca, Mohr–Coulomb, Rankine and von Mises checks, a rectangular or delta
rosette helper, an orbitable 3D element with a cut plane, JSON and
Markdown import and export with a copy/paste fallback, and a beamdswitch button
that saves the state as a narrated Markdown deck for
[beamdswitch](https://teoyujie.org/visuals/beamdswitch/), with Copy deck beside it.

A Hand calculations section works the current state by hand for the 2D view's
axis: the in-plane components (with the plane-strain σz or plane-stress εz from
Hooke's law), the circle's centre and radius, the in-plane principal values and
angle θp, the maximum in-plane shear and its planes, the element rotated by the
selected θ (or the stress vector on a plane given by direction cosines), then
the 3D principal values (the out-of-plane value when the axis carries no shear,
otherwise the characteristic cubic solved by the trigonometric method) and the
absolute maximum shear. Each line is formula, numbers substituted, result; every
result is the page's own value in its units, sign convention and digits. Save
Markdown and Copy Markdown export the steps as a narrated Markdown document that
beamdswitch also opens as a deck, and the beamdswitch deck carries the same
steps as slides at the end of its Results section.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="site-theme">` is the site's shared head line that applies the reader's Light or Dark choice before paint. `<script id="mohr-engine">` is the numeric core (units, tensor, plane, failure, io, the beamdswitch report, the hand calculations, self-test; no DOM, storage, clock or randomness; `self.Mohr` in the browser). `<script id="mohr-beamdswitch">` is `beamdswitch.js` inlined. `<script id="mohr-ui">` is the page, the canvases and the WebMCP tools. Edit this file directly. |
| `beamdswitch.js` | The site's standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js`; paste it into `<script id="mohr-beamdswitch">` whenever it changes. |
| `raw.json` | Published metadata (`META`) and the default state as exported JSON (`example`); must equal the engine's `META` and `toJSON(defaultState())`. |

The tests are `tests/mohr.test.mjs`, run with Node's built-in runner
(`node --test`). They extract the engine script from `index.html`, run the
in-page self-test and the acceptance checks (presets 1, 6 and 7, unit and sign
round trips, constraints, degenerate states, failure criteria, JSON and
Markdown round trips, import validation), and boot the page against an inert
DOM to exercise the WebMCP tools. `tests/beamdswitch.test.mjs` parses
the beamdswitch decks with beamdswitch's own parsers and keeps the inlined
template identical to the site's `templates/beamdswitch.js` (a copy is in
`tests/fixtures/beamdswitch/`). `tests/mohr-handcalc.test.mjs` checks the
hand calculations: every result written is the page's value, the hand chain
(the same formulas worked from the shown components) reproduces it in every
unit and sign convention, both match closed-form references (presets 1, 3, 6
and 8, plane strain, a plane by direction cosines), and the Markdown and deck
exports open in beamdswitch. `tests/mohr-page.test.mjs` opens the page in
headless Chrome and checks the Hand calculations section and its Markdown
export end to end. The page runs the same self-test on every
load and shows a pass/fail badge. After changing `META` or `defaultState()`,
regenerate `raw.json` from the engine; the test says when it has drifted.

Conventions: stress is stored in MPa, tension positive; strain is
dimensionless with tensor shear (ε_xy = γ_xy/2). Display, input and export
convert. Compression positive negates the whole displayed tensor. Shear
convention A plots tensor-positive τ downward (a counter-clockwise element
rotation turns the point counter-clockwise by 2θ); B plots it upward. Factors
of safety use proportional load scaling.

Exported JSON records values as displayed, in the recorded units and sign
convention, and holds only the driven side's active input block; the other
side is recomputed on import. `strain.gxy`, `gyz` and `gzx` are engineering γ
or tensor ε according to `conventions.strainShear`. Beyond the agreed schema
the file carries `principalStrain` (principal entry when strain-driven) and
`view.digits` (significant digits, 3 to 8, default 4).
