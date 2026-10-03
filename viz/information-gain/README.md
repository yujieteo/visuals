# Information gain

What should you check next if you want to reduce your uncertainty? The
companion to the Bayesian reasoning visual: start from a yes-or-no belief, list
the checks you could make, and compare them by expected information gain and by
information per unit of time before observing a result and updating.
`index.html` is one self-contained file with no dependencies, no network
requests and no build step; it works from `file://`, offline and inside a
sandboxed iframe, and it shows a worked example when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="site-theme">` in the head applies the reader's site-wide Light or Dark choice (`localStorage` `theme`) before paint. `<script id="information-gain-phrases">` holds the embedded probability-language data (`KENT_DATA` and `EMPIRICAL_PHRASE_DATA` with every survey answer) as `self.PhraseData`, in the same form as the Bayesian reasoning visual but as this page's own copy. `<script id="information-gain-engine">` is the pure core (`self.InformationGain`): the merged phrase vocabulary, binary entropy, posteriors, expected information gain, mutual information, KL divergence, surprisal, information rate and time units, sequential updates, rankings, the time budget, the best next check, every wording threshold, the examples, Copy analysis, the beamdswitch report and the self-tests. It has no DOM, storage, clock or network use. `<script id="information-gain-ui">` is the page, the remembered scenario (`localStorage`, optional) and the four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `probly.csv` | The survey file exactly as published (zonination/perceptions at commit `51207062`, sha256 `235c1b22…4ee9`); the test checks the embedded answers against it. |
| `LICENSE` | MIT for the page; the survey data's own MIT notice (copyright 2016 Zoni Nation); Kent's essay is a US government work. |
| `raw.json` | Catalogue data, published as `data.json`: the Kent scale, the survey answers, the initial scenario, examples, teaching presets, units, limits and wording thresholds. The page never fetches it; the test says when it has drifted from the engine. |
| `AGENTS.md` | What is specific to changing the tool. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |

## Probability language

Every probability (the starting belief and both conditional probabilities)
can be given as a phrase or a percentage. The phrases come from two sources,
shown separately:

- **Kent:** “Words of Estimative Probability”, Sherman Kent, *Studies in
  Intelligence* 8(4), 1964 (CIA, approved for release 1993),
  <https://www.cia.gov/resources/csi/static/Words-of-Estimative-Probability.pdf>.
  Ranges are his centre ± “give or take” as printed; synonyms take their
  group's range. A proposed standard, not a measurement.
- **Survey:** “Perceptions of Probability and Numbers”, zonination,
  <https://github.com/zonination/perceptions>, MIT licence. 46 Reddit
  r/samplesize volunteers (2015) each gave a number for 17 phrases. All
  answers are embedded unchanged; medians and quartiles (type-7
  interpolation) are computed in the page.

A phrase's working value is the survey median, else the middle of Kent's
range. The user can move it, type a number or go outside both ranges; the
number shown is the one used.

## Model

For a hypothesis H with belief p and a check whose result A has
P(A | H) = a and P(A | not H) = b (result B is the complement), the engine
computes P(A) = ap + b(1 − p), both posteriors, the binary entropy before and
the expected entropy after, and expected information gain as their
difference. It is exact and equals the mutual information between H and the
result and the expected KL divergence from prior to posterior; the likelihood
table works for any number of results, though the page offers binary checks
only. An observed result is scored by D_KL(posterior ‖ prior), kept apart from
its surprisal −log₂ P(result). Observed results update the belief in turn and
every remaining check is recomputed from the new belief.

Times are converted to minutes. Zero time (or "No meaningful time cost") is
shown as essentially free and ranked first among informative checks per unit
time, never as infinity; a check with no time entered is left out of that
ranking. The qualitative words (small, moderate, large; highly diagnostic; very
uncertain) come from the thresholds in `THRESHOLDS`, listed on the page under
Show information theory. They are UI guidance, not information-theory
categories.

## Tests

`tests/information-gain.test.mjs` runs with Node's built-in runner
(`node --test`). It loads the engine from `index.html` and covers the self-tests,
the phrase data against `probly.csv`, 1 bit at 50%, 0 bits for a useless check at every prior, prior entropy for a
perfect check, expected information gain = mutual information = expected KL on
a grid including every 0 and 1 edge, posteriors, belief change and surprise,
rates and units, zero and missing time, sequential recomputation, both
rankings, the time budget and the best next check, the wording, input
validation, Copy analysis, `raw.json` and the stub. It also boots the page in
`node:vm` against a stand-in DOM to check the WebMCP tools and that the
beamdswitch and Copy deck buttons export the deck of the page as set, parsed
with beamdswitch's own parser.
