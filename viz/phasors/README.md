# Phasor and Impedance Visualiser

Shows what a series or parallel RLC circuit does in sinusoidal steady state:
a rotating phasor diagram, the impedance plane (and the admittance plane in
parallel mode), waveforms driven by the rotating phasors, and an optional
power triangle, with every number in a readout. `index.html` is one
self-contained file with no dependencies, no network access and no build step.
Published at `https://teoyujie.org/visuals/phasors`.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="site-theme">` in the head applies the reader's site-wide Light or Dark choice (`localStorage` key `theme`) before paint. `<script id="ph-engine">` is the pure core (circuit, formatter, diagram scenes, SVG, hash, JSON, report, deck, self-tests; no DOM, storage, clock, randomness, `Intl` or locale calls; `self.Phasors` in the browser). `<script id="ph-ui">` is the page, the animation and the WebMCP tools. Edit this file directly. |
| `raw.json` | Published metadata (`META`: scope, conventions, ranges, presets, default state, degenerate cases, sources), `schemaVersion` and the default inputs as `example`; must equal the engine's `META` and `defaultInputs()`. |
| `AGENTS.md` | What is specific to changing the tool. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |

The tests are `tests/phasors.test.mjs`, run with Node's built-in runner
(`node --test`). They extract the engine script from `index.html` and run the
in-page self-tests, the hand-calculated default (Z = 100 + j84.5 Ω,
|Z| = 131 Ω, φ = 40.2°, I = 76.4 mA, V_L = 11.5 V), the presets, every
degenerate case, every range corner, formatter boundaries, the hash and JSON
round trips, deck and report structure and determinism, and the forbidden-call
check. They also boot the page against an inert DOM to exercise the WebMCP
tools and assert that no network request is attempted, and run the site-theme
script against a stub to check it only reads `theme` and applies light or dark.
After changing `META` or `defaultInputs()`, regenerate `raw.json` from the
engine; the test says when it has drifted.

## Conventions

Imaginary unit j; amplitudes RMS; the source voltage is the reference at 0°;
angles in degrees, counter-clockwise positive, normalised to (−180°, 180°].
φ = arg Z, positive when inductive (current lags). Files hold canonical units
only: Ω, H, F, Hz, V (RMS), degrees. An element that is off is absent.

At series resonance with R off (|Z| < 1e-9 Ω) the current, element voltages,
S and Q read "unbounded" and φ is undefined; at parallel resonance with R off
(|Y| < 1e-12 S) the impedance is unbounded and the total current is 0.

## Drawing

Each diagram is a list of primitives with fixed ids built by the engine. The
page writes them once into an SVG with a `viewBox` (themed through CSS
classes), then on each animation frame writes only the attributes that change
with ωt. Downloads and deck snapshots serialise the same primitives with the
light palette written out and an opaque white background. Labels sit on the
side of each arrow that faces away from the figure's centroid. In the series
phasor diagram the faint dashed line from the tip of V_R to the tip of V is the
net reactive voltage V_L + V_C (drawn when R, L and C are all on).

## Determinism

The report and deck are pure functions of the saved state. Numbers go through
`toExponential(11)` (12 significant digits) and are then rounded half up in
decimal to 3 significant figures with a fixed SI prefix table, so no output
depends on a locale or on last-bit differences between engines' trigonometric
functions. Checked byte for byte in Node, Chrome and JavaScriptCore (Safari's
engine) for 13 states.

## beamdswitch export

The deck uses only syntax beamdswitch accepts. Diagram snapshots are embedded
as `![alt](data:image/svg+xml;base64,...)`, encoded by the engine. Checked on
2026-10-01 against the vendored beamdswitch in a local build of the site:
the snapshots render in the slides, in both print layouts (slides and notes
handout) and in a silent 1280 × 720 MP4 rendered by its Video button, and
`::: plot` accepts `sin(x - 0.701478)`.
