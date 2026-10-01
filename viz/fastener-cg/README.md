# Fastener Pattern CG Tracker

Centroids, section properties and elastic load distribution for a fastener
group, with a general 3D eccentric load. `index.html` is one self-contained
page that works offline; it is built from modular sources.

All six milestones (M1 to M6) of the Draft v0.1 specification are implemented (tool version 0.6.0-m6); the published-reference cases are described under [Published references](#published-references). M1 covers geometry, the three
centroids (shear Cs, axial Ca, area Cg), J, Ixx, Iyy, Ixy and principal axes,
3D load reduction, elastic in-plane shear and axial method (a), canvas and
table entry with generators, live recalculation, the unit toggle, and JSON and
Markdown persistence with a browser library. M2 adds keyed shear and tension
allowables (group defaults with per-fastener overrides), the shear-tension
interaction with separate exponents and presets, the exact load-scale-factor
margin (MS = k* − 1 by a bracketed Brent search, shown beside IF(1)), the
governing MS and critical fastener, and the warnings framework: all three tiers
listed with the full catalogue and flagged inline beside the field or fastener
they name. M3 adds T-stub prying (keyed B and Fp, a limited to 1.25·b, with a
manual amplification factor override), preload with P_max, P_min and a
required load-sharing factor φ, the separation state, and a torque
convenience fill (T = K·D·P); the resulting bolt load replaces the tension in
the interaction and is re-evaluated at every load multiplier. M4 adds up to two
plates (axis-aligned rectangles with thickness and keyed allowables), bearing
(Fbr·D·t or a direct allowable) and tear-out (ray cast along the bearing
direction to the plate edge) per plate with the governing plate reported, the
contact-edge axial method (b), and the geometry consistency checks (fastener
outside a plate, overlapping fasteners, edge distance below D/2, load point
outside the loaded plate, e/D below the keyed minimum). M5 adds the
instantaneous-centre-of-rotation (ICR) method with Crawford-Kulak and
elastic-perfectly-plastic responses (in-plane shear only, ks ignored), the
ultimate capacity multiplier γ_ult and proportionally scaled reactions, the
design-basis selector (elastic or ICR reactions feed the checks) and the
side-by-side elastic vs ICR comparison. M6 adds the reports: PDF by browser
print (dedicated print stylesheet, A4 or Letter, sections kept on one page,
inline SVG diagram), a 2× PNG of the annotated pattern diagram only (with legend and scale),
and a Markdown report with the same sections as tables. The PDF and Markdown
reports carry the tool version, the verification set and tolerance, the full
warnings list and the "Preliminary sizing" line. M6 also adds the calculation trace, built
from the solver's own intermediate values for the governing fastener (and for
any fastener from the UI); the SVG and canvas painters, which both draw from
the shared scene model and are checked against it by a test; and the full
verification panel, which runs every case including the published-reference
cases VR-01 to VR-03.

The Hand calculations section works the current pattern by hand, step by step:
each formula, the solver's own numbers substituted into it, and the solver's
result, in the pattern's units. It covers the three centroids, J, Ixx, Iyy,
Ixy and the principal axes, the load reduction to Cs and Ca, every fastener's
elastic direct and torsional shear and its tension (method (a) or the contact
edge), the bolt-load chain with any prying and preload, bearing and tear-out,
the interaction and its margin, and equilibrium. The per-fastener steps are the
calculation trace, for the governing fastener or the one picked on the page.
The ICR solve is iterative, so its method and result are stated rather than
derived, and no table values are used. Save Markdown and Copy Markdown export
the steps as a Markdown document that beamdswitch also opens as a narrated
deck. The beamdswitch and Copy deck buttons under Reports export a narrated
talk about the pattern for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/),
written with the site's standard report template (`beamdswitch.js`, a copy of
`templates/beamdswitch.js` inlined in the page): set-up, method, results with
every hand-calculation step as a slide, and checks, with voice `bf_emma`.

| Path | Role |
| --- | --- |
| `src/core/*.mjs` | Dependency-free calculation core (ES modules): units, model, geometry, load reduction, elastic distribution, interaction and exact-k solve, prying and preload tension chain, plates (bearing, tear-out, geometry checks), contact-edge method (b), ICR solver, per-fastener checks, calculation trace, hand calculations, beamdswitch report, SVG painter, report, warnings catalogue, solve, generators, persistence, scene model, verification set |
| `src/ui/*.mjs` | Page controller, canvas painter, localStorage library and WebMCP tools |
| `src/template.html` | Markup and styles, with one `/*@APP@*/` marker and one `/*@BEAMDSWITCH@*/` marker |
| `beamdswitch.js` | The site's shared beamdswitch report template, copied unchanged from `templates/beamdswitch.js` |
| `build.mjs` | Inlines every module and `beamdswitch.js` into `index.html` and writes `raw.json` (published metadata) |
| `index.html`, `raw.json` | Build outputs; do not edit |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |

```sh
node build.mjs          # rebuild after editing src/
node build.mjs --check  # fail if the outputs are stale
node --test tests/fastener-cg*.test.mjs     # core, persistence, scene, WebMCP, build, hand-calculation, deck and browser tests
```

The tests use Node's built-in runner, like the site's other Node tests, so the
repository needs no `package.json` or installed packages. They import the same
verification cases the page's "Run verification" button runs
(`src/core/verify.mjs`).

The bundler in `build.mjs` accepts only named relative imports and `export`
on `function`, `const` and `class` declarations, and fails the build on
anything else.

## Published references

The specification asked for the ICR results and the T-stub prying equations to
be checked against the current AISC Manual. That Manual is not used. VR-01 to
VR-03 are keyed instead to two openly readable sources, cited in the
verification panel and in the PDF and Markdown report footers:

1. G. L. Kulak, J. W. Fisher and J. H. A. Struik, *Guide to Design Criteria for
   Bolted and Riveted Joints*, 2nd ed., Wiley, 1987; republished by the Research
   Council on Structural Connections, 2001.
   <https://www.boltcouncil.org/files/2ndEditionGuide.pdf>
2. G. D. Brandt, "Rapid Determination of Ultimate Strength of Eccentrically
   Loaded Bolt Groups", *Engineering Journal*, AISC, Second Quarter 1982,
   pp. 94–100. <https://ej.aisc.org/index.php/engj/article/download/378/377>

| Case | Source | What it checks | Tolerance |
| --- | --- | --- | --- |
| VR-01 | Guide, sections 17.5 and 17.6, Eqs. 17.8 to 17.12 and 17.18 | The T-stub prying equations, written in the Guide's form with a' = a + d/2, b' = b − d/2, a ≤ 1.25·b and α capped at 1, give the same α, Q and bolt force as the tool | 1e-9 relative (algebraic identity) |
| VR-02 | Guide, Table 13.1 (reprinted from the AISC Manual, 8th ed., 1980), b = 3 in block | ICR coefficient C = P_u/Rult for one row of 2 to 12 bolts at 14 eccentricities (154 values), Crawford-Kulak curve with μ = 10 /in, λ = 0.55, Δmax = 0.34 in as given by Brandt | 2%, or half a unit in the table's last printed digit where that is larger |
| VR-03 | Brandt, Examples 1 and 2; Guide Eq. 13.12 | C_u = 1.40 (three bolts, vertical load) and 1.10 (six bolts, inclined load); the ICR lies on the far side of the group from the load line; the governing bolt; P(e + r0) = Σ r·R | 2% on C_u (Brandt's values are iterated to about 1%); exact for the rest |

What this does not cover: the ICR coefficients have not been checked against
the current AISC Manual's tables, and the prying equations have not been
checked against the current AISC Manual's procedure (with its resistance
factors). The Guide gives no numerical prying example, so VR-01 confirms the
equation form and constants only. The tool's treatment of α' < 0 as no prying
is its own convention; the Guide is silent on it. Spec open question 3 (ICR
side convention) is closed by VR-03; open question 2 (prying constants) is
closed only against the Guide's Struik–de Back equations.
