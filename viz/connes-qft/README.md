# Quantum Electrodynamics: a visual laboratory

A visual laboratory for quantum fields, operator algebras, noncommutative geometry and
renormalization, with QED as the running example. One static page, `index.html`, holds
76 interactive views organised as three synchronized lenses that are related but never
identified:

| Lens | Chain |
| --- | --- |
| Perturbative QFT | fields → propagators → diagrams → amplitudes |
| Noncommutative / spectral geometry (with Connes–Kreimer renormalization) | algebra → Hilbert space → Dirac operator → inner fluctuations → action |
| Operator-algebraic QFT | spacetime regions → local von Neumann algebras → modular structure |

Every number on the page is computed in the browser by the engine in `src/`. Finite
matrix and lattice models stand in for infinite-dimensional objects and are labelled
wherever they appear; toy Feynman rules are labelled as toy; literature values that are
quoted rather than computed say so and name their source. MIT licence.

## What it does

- **Master visual.** Four synchronized panels — SPACETIME, FIELD CONFIGURATION,
  MOMENTUM / DIAGRAM, ALGEBRA / SPECTRUM — redrawn by every view, with a status strip
  for the current scale μ, the one-loop MS-bar coupling e(μ), the loop order, the
  regulator (cutoff, dimensional regularization with ε, Pauli–Villars) and the
  renormalization state (bare → regularized → renormalized → observable). Hovering a
  labelled object highlights its analogue in every panel; diagram and formula are linked
  both ways.
- **Navigation.** The concept graph of spec §3 (with the NCG and AQFT tracks) is the menu;
  a scene list groups the views by lens; Ctrl/Cmd+K opens a palette with the 25 commands
  of spec §126; the ontology switch (fields, particles, graphs, operators) and the five
  lens tabs (spacetime, momentum, Feynman graph, Hopf algebra, spectral/operator) are
  persistent; spacetime, spatial-slice and Euclidean modes switch globally.
- **Flagships.** The one-loop vacuum polarization carried through momentum integral,
  d = 4 − ε, Laurent series, 1/ε pole, counterterm, finite amplitude, μ-dependence,
  running e(μ), β(e), Hopf-algebra element and Birkhoff factorization, with the
  conventional and Connes–Kreimer descriptions in synchronized columns
  (`flagship-vp`); a spectral triple whose inner fluctuation produces a U(1) field, its
  curvature and spectral action (`flagship-ncg`); a spacetime region whose local algebra
  and vacuum give S = JΔ<sup>1/2</sup> and modular flow (`flagship-aqft`).
- **Presentation mode** with the 27 steps of spec §124; a **Connes view** (§119); a
  **reference drawer** with every source attached to the views that use it; a final
  animation (§135) and the acceptance chains (§136).
- **Exports.** Export Markdown and Copy Markdown write the current view with its
  parameters as front matter; the beamdswitch button (the "Switch" of spec §125) saves a
  narrated deck for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/) in the
  `bf_emma` voice, with Copy deck beside it.
- **WebMCP tools** (when the browser offers `navigator.modelContext`, all read-only):
  `get_metadata`, `get_current_state`, `compute_vacuum_polarization`,
  `analyse_feynman_graph`, `birkhoff_decomposition`, `finite_spectral_triple`,
  `modular_theory`, `run_self_tests`. See [SKILLS.md](SKILLS.md).

## Required computations (spec §130)

| Computation | View | Engine | Checked against |
| --- | --- | --- | --- |
| tree-level photon exchange and its amplitude | `tree` | `qed.emuAmplitude` (explicit spinors, 16 spin choices) | Mandelstam trace formula (P&S §5.1), Python reference |
| loop number of a graph | `builder` | `graphs.loopNumber` | hand counts, L = I − V + C |
| identify 1PI graphs | `builder` (cut a line) | `graphs.bridges`, `graphs.is1PI` | catalogue graphs, a reducible chain |
| identify divergent QED subgraphs | `subgraphs`, `builder` | `graphs.divergentSubgraphs` | ω = 4 − (3/2)E_e − E_γ (P&S §10.1) |
| Laurent pole in dimensional regularization | `dimreg`, `flagship-vp` | `qed.vacuumPolarizationSeries` | residue −2α/3π (P&S eq. 7.90), Python closed-form coefficients |
| a minimal-subtraction example | `dimreg` (spec example 3/ε + 7 + 2ε, and QED) | `laurent.pole`, `laurent.regular` | hand split |
| one-loop running, qualitative and numerical | `running`, `rgflow`, `flagship-vp` | `qed.alphaRun`, `qed.betaFromCounterterm` | β = e³/12π² from Z₃'s pole |
| coproduct of a graph | `coproduct` | `hopf.coproduct` | Connes–Kreimer; m(S ⊗ id)Δ = 0 |
| counterterm recursion on a nested example | `antipode`, `subgraphs` | `hopf.birkhoff` | exact rationals in Python |
| finite Laurent-series Birkhoff decomposition | `birkhoff`, `sphere` | `hopf.birkhoff` | γ₋^{⋆−1} ⋆ γ₊ = φ |
| renormalized positive part at ε = 0 | `birkhoff`, `flagship-vp` | `laurent.at0` | (−L)ⁿ/n! for ladders; MS finite part |
| Connes distance in a tiny finite spectral triple | `twopoint`, `distance` | `spectral.connesDistance` | 1/\|m\| |
| inner fluctuation in a 2 × 2 model | `fluctuation` (2 × 2 model) | `spectral.twoPointFluctuation` | m ↦ m(1 + φ) by hand |
| finite spectral action ∑ f(λ_i/Λ) | `specaction` | `spectral.spectralAction` | Poisson summation on the circle |
| finite-dimensional analogue of a local operator algebra | `net`, `matrices` | `aqft.siteAlgebraGenerators` | isotony and locality on a qubit chain |
| commutant and bicommutant | `commutant` | `aqft.commutant`, `aqft.analyseAlgebra` | M₂ ⊗ 1 and abelian examples |
| modular evolution on a matrix surrogate | `modflow`, `tomita`, `flagship-aqft` | `aqft.tomita`, `aqft.modularFlow` | S = JΔ<sup>1/2</sup>, KMS |

## Required visualisations (spec §129)

Each row is checked twice: `tests/page.test.mjs` draws the view in a stand-in DOM and
finds the figure, and `tests/e2e/browser-check.mjs` finds it visible in Chrome. The list
is [docs/visualisations.json](docs/visualisations.json).

| # | Visualisation (spec §129) | View | How to reach it |
| --- | --- | --- | --- |
| 1 | a Minkowski light cone | `spacetime` | Concept graph: CLASSICAL FIELDS → Spacetime and light cones; drag events A and B |
| 2 | classical E and B fields | `em` | Classical electromagnetism → EM wave (static charges show E field lines) |
| 3 | a local U(1) gauge transformation | `gauge` | SYMMETRY → Local U(1) gauge symmetry; slide the transformation strength |
| 4 | a fibre-bundle connection | `bundle` | SYMMETRY → Geometry of gauge theory |
| 5 | Fourier field modes | `modes` | QUANTIZATION → From classical field to quantum field |
| 6 | creation/annihilation operators | `ladder` | OPERATORS → Creation and annihilation operators; press a† and c† |
| 7 | Fock sectors | `fock` | FOCK SPACE → Fock-space visualizer |
| 8 | vacuum correlations | `vacuum` | FOCK SPACE → Vacuum fluctuations and correlations; drag the probes |
| 9 | electron and photon propagators | `propagators` | FEYNMAN GRAPHS → Propagators, on and off shell; drag the momentum |
| 10 | tree-level QED scattering | `tree` | FEYNMAN GRAPHS → Tree-level e⁻μ⁻ → e⁻μ⁻ |
| 11 | Wick contractions | `genfunc` | PATH INTEGRAL → Generating functional and Wick contractions |
| 12 | loop momentum | `selfenergy` | LOOPS → Electron self-energy (loop momentum k highlighted); also flagship step 2 |
| 13 | electron self-energy | `selfenergy` | LOOPS → Electron self-energy |
| 14 | vacuum polarization | `vacpol` | LOOPS → Vacuum polarization; the flagship carries it to Birkhoff |
| 15 | vertex correction | `vertex` | LOOPS → Vertex correction and g − 2 |
| 16 | UV divergence | `uv` | DIVERGENCES → UV divergence microscope; raise Λ |
| 17 | dimensional regularization | `dimreg` | DIVERGENCES → Dimensional regularization; slide ε |
| 18 | Laurent pole subtraction | `dimreg` | Dimensional regularization → 'extract the pole' (palette: show Laurent pole) |
| 19 | running charge | `running` | RENORMALIZATION → Running coupling and the scale microscope |
| 20 | Wilsonian shell integration | `wilson` | WILSON RG → Wilsonian shell integration; step through the shell |
| 21 | 1PI graphs | `builder` | CONNES–KREIMER → Diagram builder and 1PI detector; cut a line |
| 22 | divergent subgraphs | `subgraphs` | HOPF ALGEBRA → Divergent subgraphs |
| 23 | Hopf coproduct | `coproduct` | HOPF ALGEBRA → Hopf coproduct |
| 24 | graph contraction | `coproduct` | Hopf coproduct → the collapsing panel |
| 25 | forest subtraction | `forests` | HOPF ALGEBRA → Zimmermann forests; toggle boxes |
| 26 | convolution of characters | `characters` | HOPF ALGEBRA → Characters and their convolution |
| 27 | Birkhoff decomposition | `birkhoff` | RIEMANN–HILBERT / BIRKHOFF → Birkhoff decomposition |
| 28 | Riemann sphere around ε = 0 | `sphere` | RIEMANN–HILBERT / BIRKHOFF → Riemann sphere and Riemann–Hilbert |
| 29 | RG flow and β-vector field | `rgflow` | WILSON RG → Renormalization-group flow |
| 30 | a spectral triple | `triple` | HILBERT SPACE → Spectral triples and reconstruction |
| 31 | Connes' distance formula | `distance` | DIRAC OPERATOR → Connes distance formula; drag x and y |
| 32 | two-point finite geometry | `twopoint` | SPECTRAL TRIPLE → Two-point spectral geometry |
| 33 | inner fluctuation of D | `fluctuation` | INNER FLUCTUATIONS → Inner fluctuations make a U(1) field |
| 34 | a generated U(1) gauge potential | `fluctuation` | GAUGE FIELDS → link phases (particle and antiparticle copies) |
| 35 | spectral-action eigenvalue weighting | `specaction` | SPECTRAL ACTION → Spectral action; slide Λ |
| 36 | local spacetime-region algebras | `net` | REGION OF SPACETIME → Haag–Kastler net |
| 37 | algebra inclusion | `net` | Haag–Kastler net with 𝒪₁ inside 𝒪₂: the boxes nest |
| 38 | locality/commutation | `net` | Haag–Kastler net with spacelike diamonds: [A, B] = 0 |
| 39 | type I/II/III distinctions | `types` | TYPE III → Type I, II and III; switch the type |
| 40 | Tomita polar decomposition | `tomita` | MODULAR FLOW → Vacuum vector and the Tomita operator |
| 41 | modular flow | `modflow` | MODULAR FLOW → Modular flow and the modular Hamiltonian |
| 42 | wedge-region modular geometry | `wedge` | MODULAR FLOW → Wedge region and boosts |
| 43 | axial anomaly triangle | `anomaly` | QFT (synthesis) → QED axial anomaly |
| 44 | spectral flow | `specflow` | QFT (synthesis) → Spectral flow and index |

## Correctness constraints (spec §128)

| Constraint | How the page keeps it |
| --- | --- |
| Feynman diagrams are not spacetime histories | Graphs live only in the diagram panel; the spacetime panel of `tree` shows asymptotic states around an undrawn interaction region; a persistent note on every graph view. |
| No "virtual particle violates energy conservation" | `propagators` describes internal lines as propagators, off shell, with conservation at every vertex. |
| Regularization ≠ renormalization | `regularization` carries the warning; the status strip separates REGULARIZED from RENORMALIZED. |
| Counterterms are constrained by symmetry | `ward` (Z₁ = Z₂), `bare`, and the Hopf-ideal note. |
| Spectrum ≠ eigenvalues for general operators | `triple`, `specflow` say when spectra are discrete (compact resolvent) and that they need not be. |
| QFT is not perturbation theory | `loops` and the scale microscope say so. |
| Spectral triples, Connes–Kreimer and AQFT are not one formalism | The lens note under the header, the Connes view and the grand synthesis. |
| Local algebras are not one factor without hypotheses | `why3` and the reference drawer state the hypotheses (Buchholz–D'Antoni–Fredenhagen; Yngvason). |
| Type III is not "infinite-dimensional matrices" | `types` details. |
| NCG does not mean coordinates fail to commute | Persistent warning on every spectral-geometry view (§73). |
| The spectral Standard Model is not a complete quantization | `sm`. |
| The bare coupling is never shown as measurable | `bare` and the BARE INPUT stage. |
| Numerical running carries loop order and scheme | Every running number reads "one-loop QED, MS-bar, electron loop only". |

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The built page (generated: run `python build.py`) |
| `template.html` | Page markup and styles |
| `src/*.js` | Engine modules (`core`, `linalg`, `laurent`, `tex`, `qed`, `graphs`, `hopf`, `spectral`, `aqft`, `report`, `engine`); each loads in Node |
| `src/ui/*.js` | The page: `base` (state, controls, events), `draw` (SVG vocabulary), six scene files, `app` (shell, palette, presentation, exports, WebMCP) |
| `raw.json` | References, concept graph, presentation, palette commands, dictionaries and other text (inlined; published as `data.json`) |
| `beamdswitch.js` | The site's standard beamdswitch report template, unchanged |
| `reference/` | Independent Python reference values (`build_reference.py` → `reference.json`) |
| `tests/` | Node tests of the engine and independent reference values |
| `docs/` | [Architecture](docs/architecture.md), [verification](docs/verification.md), the visualisation list |
| `SKILLS.md`, `playbooks/` | Router and step-by-step playbooks |

## Build and test

Run from this folder.

```sh
python3 build.py
python3 build.py --check
python3 reference/build_reference.py --check
node --test tests/*.test.mjs
python3 ../../scripts/check.py --toon connes-qft
node ../../e2e/bin/page-axi.js check connes-qft
```

The engine tests run its self-tests. The reference test compares vacuum polarization with the independent Python values. The browser tests cover navigation, presentation, the palette, reset, and exports.

## Repository location

This laboratory lives in `viz/connes-qft/` of yujieteo/visuals. The sources and Python references came from the site copy. The former standalone repository is unavailable. Follow [Verify](playbooks/verify.md) for the current commands.
