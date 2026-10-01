# Kent: Words of Estimative Probability

A reasoning instrument built on Sherman Kent's 1964 essay "Words of Estimative
Probability": one claim, one 0–100% ruler that stays on screen, Kent's word for
the number with its anchor and band kept distinct, and the same estimate as a
natural frequency, odds and complement. Around it: three ways in (number, Kent
word, free English), the writer/reader demonstration, an ambiguity experiment
with clearly labelled simulated readers, evidence notes, updates, decision
thresholds, append-only forecasts with calibration and the Brier score, the Kent
laboratory, a reverse test, a sentence composer, a personal dictionary and the
1951 example that started it. `index.html` is one self-contained file with no
dependencies, no network requests and no build step; it works from `file://`,
offline and inside a sandboxed iframe, and shows Kent's table and the 1951
story when JavaScript is off. It does not depend on any other visual.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="kent-engine">` is the pure core (`self.Kent`): the Kent 1964 scale, term and band lookup (gaps between bands are named as gaps), probability formatting without false precision, frequency, odds and complement, decision thresholds, the append-only forecast ledger, calibration bins and groups with the minimum-group rule, the Brier score, URL encoding and decoding, the seeded simulated-reader generator, phrase detection, the sentence composer, export and import, and the beamdswitch report. It has no DOM, storage, clock or network use. `<script id="kent-ui">` is the page, `localStorage` persistence (`kent:v1`), the command palette and the five read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `raw.json` | Catalogue data, published as `data.json`: the scale, examples, worked example, glossary and messages. The page never fetches it; the test says when it has drifted from the engine. |

## Kent 1964

Taken from the essay as republished by the CIA Center for the Study of
Intelligence (<https://www.cia.gov/resources/csi/static/Words-of-Estimative-Probability.pdf>),
*Studies in Intelligence* 8(4), Fall 1964. Kent's chart gives each gradation a
number "give or take" a margin; the bands here are exactly those margins:

| Word | Anchor | Kent's margin | Band |
| --- | --- | --- | --- |
| Certain (Kent: "certainty") | 100% | — | 100% |
| Almost certain | 93% | give or take almost 6% | 87–99% |
| Probable | 75% | give or take about 12% | 63–87% |
| Chances about even | 50% | give or take about 10% | 40–60% |
| Probably not | 30% | give or take about 10% | 20–40% |
| Almost certainly not | 7% | give or take about 5% | 2–12% |
| Impossible (Kent: "impossibility") | 0% | — | 0% |

Notes on fidelity: the bands leave gaps (0–2, 12–20, 60–63 and 99–100%), which
the tool names as gaps between two words rather than filling in; the shared
edges 40% and 87% go to the word with the nearer anchor (a tie to the word
nearer 50%). Synonyms recognised in free English are only those in the essay's
synonym table; its CIA transcription has no row for "almost certainly not", so
none are claimed for it. Kent also notes that "unlikely" meant odds of about
three to one against, a little under the 30% anchor of its row.

## Tests

`tests/kent.test.mjs` runs with Node's built-in runner (`node --test`). It loads
the engine from `index.html` and checks the scale against the essay, the lookup
at 0, 50 and 100% and at every band edge and gap, the translation lens, false
precision, thresholds, the append-only ledger (editing after commit, resolving
after the deadline, corrections, imports), calibration with tiny samples, the
Brier score, URL state, the simulated readers, phrase detection, the composer,
`raw.json` and the page's metadata. It also boots the page in `node:vm` against
a stand-in DOM to check the WebMCP tools and that the beamdswitch and Copy deck
buttons export the deck of the page as set, parsed with beamdswitch's own parser
(read-only copies of it and of the site's shared template are in
`tests/fixtures/beamdswitch/`). CI runs them on every push and pull request; the
site's copy in `visuals/kent/` runs none of them, and the site checks only the
catalogue stub and the port.
