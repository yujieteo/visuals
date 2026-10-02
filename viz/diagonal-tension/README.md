# Diagonal Tension: Skin, Stringers and Doubler

At the same applied shear load, what changes when a doubler is added to an
aluminium skin-and-stringer panel? `diagonal-tension.html` answers it with a
finite-element model that runs in the browser: one self-contained file with no
dependencies, no network access and no build step, which works offline from
`file://`. `index.html` is the same file, byte for byte, under the name the
site publishes.

The panel lies in the XY plane with x along the stringers. The skin is meshed
with four-node plane-stress quadrilaterals (2 × 2 Gauss integration), the
stringers are two-node axial bars sharing skin nodes, and the doubler is a local
increase in membrane thickness (same material, perfectly attached). Variant A is
skin plus stringers; variant B adds the doubler. Both use one conforming mesh,
split at every stringer and doubler edge, with the same minimal restraints
(ux = uy = 0 at (0, 0), uy = 0 at (L, 0)) and the same load: a uniform shear flow
q on all four edges, integrated consistently into nodal forces. The global sparse
stiffness is assembled, the prescribed degrees of freedom eliminated, and the
system solved by Jacobi-preconditioned conjugate gradient in a Blob Web Worker;
Cancel terminates the worker. Non-positive curvature, non-finite values, the
iteration limit, a failed residual check, inverted or degenerate elements, a
disconnected mesh and missing restraints all stop a run, and a failed run shows
no results.

This is a linear elastic, pre-buckling model. It gives the diagonal principal
tension and how stress redistributes; it does not calculate a post-buckling
tension field, stringer bending or crippling, fastener slip or one-sided
doubler bending. Background: [NACA, diagonal tension](https://ntrs.nasa.gov/citations/19930083335).

Units are mm, N, MPa and kg (density in kg/m³); tension is positive. Principal
values follow m = (σx + σy)/2, r = hypot((σx − σy)/2, τxy), σ1,2 = m ± r,
θ1 = ½ atan2(2τxy, σx − σy) and von Mises = √(σx² − σxσy + σy² + 3τxy²), all at
unsmoothed Gauss points. The comparison covers mass, compliance fᵀu = 2U, fixed
probe displacements and stresses (P1 to P4; P4, in the skin beside
the patch, is left out when the doubler leaves none), the largest principal tension in
three regions (patch interior, skin at the doubler edges, surrounding skin) and
the stringer axial forces. Zones within the exclusion distance of the panel
edges and of each doubler corner are hatched and left out of region maxima,
since stresses there are singular or load-introduction effects.

The editable example uses demonstration values: a 600 × 400 × 1 mm skin,
stringers at y = 100, 200 and 300 mm of 50 mm² each, a central
200 × 200 × 1 mm doubler, E = 70,000 MPa, ν = 0.33, 2,700 kg/m³ and
q = 50 N/mm. Alloy allowables are the user's to supply.

| File | Role |
| --- | --- |
| `diagonal-tension.html` | The whole tool. `<script id="site-theme">` is the site's shared theme line. `<script id="dt-engine">` is the numeric core (`self.DiagonalTension`: validation, mesh, element stiffness, sparse assembly, conjugate gradient, recovery, comparison, exports, the beamdswitch report and the self-check; no DOM, storage, clock or randomness). `<script id="dt-beamdswitch">` is `beamdswitch.js` inlined. `<script type="text/plain" id="dt-worker">` is the worker's message loop, which the page joins to the engine text in a Blob to start its Web Worker. `<script id="dt-ui">` is the page and the WebMCP tools. Edit this file directly. |
| `index.html` | A byte-identical copy of `diagonal-tension.html`, the name the site publishes; copy it again after every edit. |
| `beamdswitch.js` | The site's standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js` in yujieteo/site; paste it into `<script id="dt-beamdswitch">` whenever it changes. |
| `raw.json` | Published metadata (`meta`, the engine's `META`) and the default model export (`model`, the engine's `modelJSON(defaultState())`). |

After changing `META`, `defaultState()` or `modelJSON`, regenerate `raw.json`:

```sh
node -e 'const fs=require("fs"),vm=require("vm"),h=fs.readFileSync("diagonal-tension.html","utf8"),c={};c.self=c;vm.createContext(c);vm.runInContext(/<script id="dt-engine">([\s\S]*?)<\/script>/.exec(h)[1],c);const D=c.DiagonalTension;fs.writeFileSync("raw.json",JSON.stringify({meta:D.META,model:JSON.parse(D.modelJSON(D.defaultState(),null))},null,2)+"\n")'
cp diagonal-tension.html index.html
```

The tests in `tests/` run with Node's built-in runner, `node --test 'tests/*.test.{mjs,cjs}'`.
They extract the engine from the page at test time. `diagonal-tension.test.mjs`
covers every acceptance item: the in-page self-check, a distorted-patch test, a
bar against FL/EA, pure shear at ±|τ| and 45°, equilibrium and load scaling,
zero and full-panel doublers, added mass, three-level mesh convergence, failure
detection, input validation, the mesh, regions, probes, exports, the artifact and
the worker. `reference.test.mjs` compares the solver with references written
separately from it: a dense finite-element solve coded in the test for small
panels, and Timoshenko and Goodier's closed-form cantilever under a parabolic end
shear on a skewed mesh. `beamdswitch.test.mjs` parses the narrated deck with
beamdswitch's own parsers and boots the page against a stand-in DOM to exercise
its WebMCP tools. `diagonal-tension-page.test.mjs` opens the page from `file://`
in a fresh headless Chrome taken offline first, and meshes, solves, compares,
cancels, refines and exports there; it is the interim stand-in for the dedicated
technical end-to-end repository, and writes its downloads under
`/tmp/diagonal-tension-v1/downloads` (or `DT_DOWNLOAD_DIR`).

Limits, from browser benchmarks (Chrome 154 on an Apple M5): 40,000 nodes
(38,801 nodes solve both variants in 6.5 s) and 20,000 conjugate-gradient
iterations (about 2,400 at that size); a run past either stops with a message
saying what to change.
