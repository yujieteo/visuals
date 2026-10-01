# Bayesian reasoning in plain English

A practical Bayesian reasoning trainer and back-of-envelope calculator. Pick a
probability phrase such as “likely”, see what Sherman Kent's reference scale and
a survey of real readers say it means, choose the number you mean, then update
it with evidence by answering two questions: how likely the evidence would be if
your hypothesis were true, and if it were false. `index.html` is one
self-contained file with no dependencies, no network requests and no build
step; it works from `file://`, offline, inside an iframe and with storage
blocked, and without JavaScript it still shows the reference chart, the three
quantities of an update, the formula and the source notes.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="bayes-data">` holds the embedded data (`KENT_DATA`, `EMPIRICAL_PHRASE_DATA` with every survey answer, `EXAMPLE_SCENARIOS`) as `self.BayesData`. `<script id="bayes-engine">` is the pure core (`self.Bayes`): survey statistics, the merged phrase vocabulary, default working values, Bayes' rule with every 0/1 edge case, sequential updates, range propagation, rounding, natural frequencies, wording, the beamdswitch report and the self-checks. It has no DOM, storage, clock or network use. `<script id="bayes-ui">` is the page, the current scenario in `localStorage` (optional) and the four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. The static reference-table rows are the output of `Bayes.staticRows()`; a test fails when they drift. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `probly.csv` | The survey file exactly as published (zonination/perceptions at commit `51207062`, sha256 `235c1b22…4ee9`); the test checks the embedded answers against it. |
| `raw.json` | Catalogue data, published as `data.json`: the Kent scale, the survey answers, the example scenarios and the initial state. The page never fetches it; the test says when it has drifted from the page. |
| `LICENSE` | MIT for the page; the survey data's own MIT notice; Kent's essay is a US government work. |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |

## Data

- **Kent:** “Words of Estimative Probability”, Sherman Kent, *Studies in
  Intelligence* 8(4), 1964 (CIA, approved for release 1993),
  <https://www.cia.gov/resources/csi/static/Words-of-Estimative-Probability.pdf>.
  The chart's five phrases are copied with their centre and “give or take”
  margin; range = centre ± margin. Synonyms take their group's range. It is a
  proposed standard, not a measurement.
- **Survey:** “Perceptions of Probability and Numbers”, zonination,
  <https://github.com/zonination/perceptions>. 46 Reddit r/samplesize
  volunteers (2015) each gave a number for 17 phrases. All 782 answers are
  embedded unchanged; medians, quartiles (type-7 interpolation), percentiles and
  10-point bins are computed in the page.

A phrase's default working value is the survey median, else the middle of
Kent's range, and the page always says which. A phrase in neither source gets
no numbers; the user can give it their own, labelled “your calibration”.

## Tests

`tests/bayes.test.mjs` runs with Node's built-in runner (`node --test`). It
loads the data and engine from `index.html` and checks the spec's numerical
acceptance cases (neutral evidence, a 50% prior with likelihood ratio 3 giving
75%, the sequential hand-off, both range ends computed independently), every
0/1 combination of prior and likelihoods, rounding and odds, the phrase
vocabulary against both sources and `probly.csv`, `raw.json` and the catalogue
stub, the static reference rows, the page's offline promises, and the
beamdswitch deck of every example. It also boots the page in `node:vm` against
a stand-in DOM to call the WebMCP tools and check that the beamdswitch and Copy
deck buttons export the deck of the scenario as set.
