---
name: connes-qft
description: Use the Connes QFT laboratory to compute and show QED through three lenses — perturbative QFT (propagators, tree amplitudes, the one-loop vacuum polarization in d = 4 − ε with its Laurent series, counterterm, running coupling and β-function), Connes–Kreimer renormalization (graph analysis, coproduct, antipode, forests, Birkhoff decomposition) and noncommutative geometry (Connes distance, inner fluctuations, spectral action), and operator algebras (commutants, Tomita–Takesaki, modular flow) — and to export a view as Markdown or a beamdswitch deck.
---

# Use the Connes QFT laboratory

Live at <https://teoyujie.org/visuals/connes-qft/>. This file routes work; it holds no workflow steps. Read [README.md](README.md) for what the tool does and [docs/architecture.md](docs/architecture.md) for how the pieces fit.

## Tasks

| The request is to... | Use |
| --- | --- |
| Compute the one-loop vacuum polarization, its pole, counterterm, β-function and Birkhoff factors | `compute_vacuum_polarization` |
| Analyse a QED graph (loop number, 1PI, ω, divergent subgraphs, coproduct) | `analyse_feynman_graph` |
| Renormalize a nested or overlapping graph by the Connes–Kreimer recursion | `birkhoff_decomposition` |
| Compute a Connes distance, an inner fluctuation or a spectral action | `finite_spectral_triple` |
| Compute S = JΔ^{1/2}, the modular spectrum and modular flow | `modular_theory` |
| Read what the page shows now | `get_current_state` |
| Read the scope, conventions, views, presentation and references | `get_metadata` |
| Check the implementation | `run_self_tests`, or the self-test badge |
| Keep a view as a document or a talk | Export Markdown, or the beamdswitch button (or Copy deck) |
| Change the page or the engine | the playbooks below |

## WebMCP tools

All read-only; none changes the page.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | Scope, conventions, the three lenses, every view with its spec sections, the presentation and the references |
| `get_current_state` | none | The current view, global state (μ, one-loop MS-bar coupling, loop order, regulator, renormalization state, ontology, lens) and the view's parameters |
| `compute_vacuum_polarization` | `Q2_MeV2` (Q² = −q² > 0), `mu_MeV` | Laurent series of Π₂(q²; ε), pole residue, MS and MS-bar finite parts, μ-derivative, β(e), Hopf data and Birkhoff factors |
| `analyse_feynman_graph` | `graph`: a catalogue id or `{vertices, edges}` | Validity, L = I − V + C, connectedness, 1PI, external legs, ω, divergent subgraphs, overlaps, coproduct and forest count |
| `birkhoff_decomposition` | `graph` (catalogue id), optional `L` = log μ | Nesting trees, coproduct, antipode, character, counterterm γ₋ and renormalized value γ₊(0), with the toy-model label |
| `finite_spectral_triple` | optional `m`, `N`, `amplitude`, `Lambda`, `cutoff` | Two-point distance, link phases and fluxes of the fluctuated doubled ring, spectrum, gauge-invariance error, spectral action, torus curvature |
| `modular_theory` | optional `p` (2–4 weights), `t` | Cyclic/separating test, checks of S = JΔ^{1/2}, Δ and K spectra, KMS error, the flowed observable and the wedge boost |
| `run_self_tests` | none | Passed and total counts and each result |

## Playbooks

| Task | Playbook |
| --- | --- |
| Run or extend the checks; regenerate reference data | [Verify](playbooks/verify.md) |
| Change how something is computed | [Change the engine](playbooks/change-engine.md) |
| Add or change a view (scene) | [Add a view](playbooks/add-view.md) |
| Publish a new version on the host site | [Deploy to the site](playbooks/deploy-to-site.md) |

Rules for every task: `index.html` is generated (edit `template.html`, `src/` or `raw.json`, then run `python build.py`); finite, lattice and toy models stay labelled; every change ends with the [Verify](playbooks/verify.md) playbook passing.
