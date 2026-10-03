# Infer a Theory

From observations to effective actions and renormalisation. A visitor describes a
fluctuating quantity in plain English, one observation per card with its scale and
an estimative-probability phrase, and the page turns the claims into a
probabilistic effective field theory: explicit statistical constraints, a
maximum-entropy effective action with a posterior over its couplings, a Wilsonian
renormalisation-group flow toward large scales, ensembles of compatible
finer-scale theories (inverse RG), predictions with uncertainty, and the next
measurement ranked by expected information gain. It opens on a live-football
bandwidth worked example.

`index.html` is one self-contained file with no dependencies, no network requests
(a Content-Security-Policy forbids them) and no build step; it works from
`file://`, offline and inside a sandboxed iframe, and shows the ideas and the
worked example when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The whole tool, edited directly. `<script id="site-theme">` applies the reader's site-wide Light or Dark choice from `localStorage` before paint. `<script id="infer-a-theory-phrases">` embeds the probability-language data (`self.InferPhraseData`). `<script id="infer-a-theory-engine">` is the pure core (`self.InferTheory`): the parser, solvers, maximum-entropy fits, ensemble inference, RG, inverse RG, experimental design and the beamdswitch report; it has no DOM, storage, clock, randomness or network use. `<script id="infer-a-theory-ui">` is the page and the four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `probly.csv` | The survey answers as published (zonination/perceptions at commit 5120706, sha256 `235c1b22…4ee9`); the page embeds the same numbers and a test keeps them equal. |
| `raw.json` | Catalogue data, published as `data.json`: operators, defaults, limits, the worked example, the dictionary and the phrase-data provenance. The page never fetches it; the test says when it has drifted from the engine. |
| `LICENSE` | MIT for the page; the survey's MIT notice; Kent's essay is a US government work. |
| `AGENTS.md` | What is specific to changing the tool. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |

## Probability language

Two references are shown beside every phrase and never substituted for each other:
Sherman Kent's 1964 CIA essay “Words of Estimative Probability” (a proposed
standard, not a measurement), and the “Perceptions of Probability and Numbers”
survey (46 volunteers, every answer embedded). Only the working probability
enters the calculation. A phrase in neither source (for example “very likely”)
gets no numbers until the visitor gives it a meaning. The two datasets were
copied, with their provenance and transformation notes, from the Bayesian
reasoning visual's branch; this page does not depend on that visual.

## Model and approximations

- **Grammar.** A finite, deterministic parser covers location, spread, persistence,
  correlation, anti-correlation, lag, tails, symmetry, skew, conditionals,
  thresholds, scale dependence, comparisons, trends and numerical statements.
  Unsupported sentences are reported, not guessed. Vague words get page-default
  readings that are shown on the card and editable. Proposition uncertainty is
  virtual evidence with odds q : (1 − q); magnitude uncertainty is a mixture.
- **Theories.** `S = Σ gᵢ Oᵢ` over a scalar chain: polynomial site terms to φ⁶,
  Student-t tail potentials `log(1 + φ²/w²)` (separately below and above the
  reference level), lag couplings `kᵣ(φₜ₊ᵣ − φₜ)²` to r = 4, and an Ising chain
  `−hΣσ − ΣJᵣσσ` for binary fields. Gaussian chains are solved exactly
  (spectral quadrature); non-Gaussian chains with a transfer matrix on a
  56–64-point grid (only k₁ with non-Gaussian site terms); binary chains with an
  exact transfer matrix. Unless an observation gives numbers, φ is measured in
  standard deviations at the observed scale.
- **Posterior.** A deterministic importance-weighted ensemble (Halton points over
  a stated prior, a second stage around the first-stage posterior, balance
  heuristic), or an explicit grid for at most two free couplings. Identifiability
  from posterior-to-prior spreads, principal directions and a local Hessian.
- **RG.** Exact coarse observables of factor-two block averages (block-mean
  distributions by forward recursion) and minimum-KL projections back into the
  basis with diagnostics; literal decimation for the binary field, closed form for
  nearest neighbours. Beta estimates are finite differences. Relevance is a
  numerical linearisation around the Gaussian (or free-spin) fixed point.
- **Inverse RG and design.** Finer-scale candidates are run forward and weighted
  by the same evidence, stopping when the evidence no longer narrows their
  predictions. Expected information gain is computed exactly over the weighted
  ensemble by summing over measurement outcomes.

## Tests

`tests/infer-a-theory.test.mjs` runs with Node's built-in runner (`node --test`).
It loads the engine from `index.html` and covers the parser (every grammar class,
scales stated or not, unsupported sentences, numbers), phrase calibration against
`probly.csv` and Kent's table, the solvers (transfer matrix against exact
Gaussian results, Gaussian block averages staying Gaussian, positive φ⁴ lightening
tails), maximum-entropy fits, binary decimation (`tanh J′ = tanh² J`), relevance
eigenvalues, identifiability of a singular Hessian, conflicts, model inadequacy,
the worked example end to end, determinism and the absence of NaN or Infinity,
expected information gain, `raw.json` and the stub. It also boots the page in
`node:vm` against a stand-in DOM to check the WebMCP tools and that the
beamdswitch and Copy deck buttons export the deck of the page as set.
