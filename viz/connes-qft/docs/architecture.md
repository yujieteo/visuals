# Architecture

The laboratory is one static page. `build.py` inlines the engine modules, the page
modules, `raw.json` and the shared beamdswitch template into `template.html` to write
`index.html`.

```text
raw.json ─────────────────────────────────────┐
src/core.js      constants, quadrature, special functions, formatting
src/linalg.js    complex matrices: Hermitian Jacobi, null spaces, matrix functions
src/laurent.js   truncated Laurent series in ε (the algebra 𝒜 of Connes–Kreimer)
src/tex.js       a small TeX subset → HTML      ├─ build.py ─→ index.html
src/qed.js       perturbative QED and classical/canonical models
src/graphs.js    Feynman graphs: validity, L, 1PI, ω, subgraphs, contraction, isomorphism
src/hopf.js      Hopf algebra of graphs and rooted trees, characters, Birkhoff
src/spectral.js  finite and lattice spectral triples
src/aqft.js      finite operator algebras, Tomita–Takesaki, causal regions
src/report.js    Markdown and beamdswitch report objects
src/engine.js    flagship pipelines, WebMCP-facing computations, self-test
beamdswitch.js   the site's deck template (unchanged)
src/ui/base.js · draw.js · scenes-*.js · app.js   the page ─┘
```

## Data flow

1. The page keeps a global state `G` (scale μ, loop order, regulator, ε, renormalization
   state, ontology, lens, spacetime mode) and one state object per view.
2. A view (registered with `scene({...})`) draws its four panels from that state by
   calling the engine; `app.js` places them in SPACETIME, FIELD CONFIGURATION,
   MOMENTUM / DIAGRAM and ALGEBRA / SPECTRUM, re-rendering on every change. Elements
   with the same `data-link` key are highlighted together across panels.
3. `engine.vacuumPolarization`, `engine.spectralToGauge` and `engine.regionToModular`
   compute the three flagships as plain data; the views, the WebMCP tools and
   `report.js` (Markdown and beamdswitch decks) all read the same objects, so the exports
   cannot disagree with the page.

## Modules

| Module | Responsibility |
| --- | --- |
| `core.js` | CODATA 2022 and PDG 2024 constants (each with its source), Gauss–Legendre quadrature, Γ, ζ, K_ν, the log Γ(1 + z) series, number formatting |
| `linalg.js` | Complex dense matrices; cyclic complex Jacobi for Hermitian eigenproblems; Gaussian elimination, rank, null space; matrix functions through the eigendecomposition; operator norm |
| `laurent.js` | Laurent series with tracked truncation; pole projection T and regular part; Γ(ε/2) and X^{ε/2} expansions |
| `tex.js` | Fractions, scripts, accents, Feynman slash, calligraphic letters, `\link{key}{…}` for cross-highlighting |
| `qed.js` | Minkowski geometry, Dirac matrices and spinors, the e⁻μ⁻ amplitude, propagators, Coulomb/Yukawa transforms, Π₂(q²; ε) as a Laurent series, MS/MS-bar/on-shell parts, α_eff, β from the counterterm, running and RG flow, Uehling, F₂, cutoff/dim-reg/PV comparison, Feynman parameters, ladder operators, Fock counts, vacuum correlators, the stationary-phase family, Wick pairings, classical fields, lattice gauge fields, the effective potential, Wilsonian steps, the anomaly rate |
| `graphs.js` | The graph model and catalogue; validity and charge flow; loop number; bridges and 1PI; superficial degree; residues; cycle basis; enumeration of divergent proper 1PI subgraphs; containment; contraction Γ/γ; canonical form |
| `hopf.js` | Coproduct, antipode and its check; forests; graphs → rooted trees by nesting; the tree coproduct; toy characters; convolution; Birkhoff recursion; inverse characters; formal diffeomorphisms; loops on the ε-circle |
| `spectral.js` | Connes distance by optimisation; the two-point space; circle candidates and the lattice commutator; Weyl's law; product geometry; inner fluctuations (2 × 2 and the doubled ring with real structure J); gauge transformations; torus curvature; spectral action and cutoff moments; spectral flow |
| `aqft.js` | Pauli algebras; generated algebras, commutant, bicommutant, centre, factor test; locality on a chain; cyclic/separating vectors; Tomita–Takesaki on M_n; modular flow and KMS; type data and Araki–Woods modular spectra; diamonds and wedges; harmonic-chain entanglement |
| `report.js` | Front matter and Markdown; the flagship write-ups; beamdswitch report objects (set-up, method, results, checks with a key frame) |
| `engine.js` | The three flagship pipelines, tree amplitudes, graph analysis for the tools, the self-test |

## Invariants

- Engine modules never touch the DOM, storage, the clock, randomness or the network.
- Every number on the page comes from the engine or is a quoted value with its source.
- Finite, lattice and toy models are labelled where they are drawn and in the exports.
- `index.html` is generated and must match `python build.py` exactly.
