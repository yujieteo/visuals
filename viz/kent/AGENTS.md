# AGENTS.md: Kent: Words of Estimative Probability

A reasoning instrument built on Sherman Kent's 1964 essay "Words of Estimative Probability": one claim, one 0–100% ruler, Kent's word for the number with its anchor and band kept distinct, the same estimate as a natural frequency, odds and complement, and append-only forecasts that resolve into calibration. Live at <https://teoyujie.org/visuals/kent/>.

## Source of truth

This repository, [yujieteo/kent](https://github.com/yujieteo/kent), is the source of truth: the tool and its tests are developed here, and its CI runs them here. `visuals/kent/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/kent) is a port of the page files, refreshed whenever the tool is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). `index.html` is the whole tool with no build step: edit it directly. `<script id="kent-engine">` is the pure core (`self.Kent`; no DOM, storage, clock or network), `<script id="beamdswitch">` is `beamdswitch.js` inlined, and `<script id="kent-ui">` is the page, `localStorage` persistence (`kent:v1`), the command palette and the WebMCP tools. `raw.json` (published as `data.json`) must equal the engine's scale, examples, worked example, glossary and messages.

The tests are in `tests/`, with read-only copies of beamdswitch's deck parser and the site's shared template (`templates/beamdswitch.js` and `templates/beamdswitch-report.md`) in `tests/fixtures/beamdswitch/`.

## Build, test and verify

There is no build step. From the repository root:

```sh
node --test 'tests/*.test.mjs'
```

CI (`.github/workflows/ci.yml`) runs the same command on every push and pull request: `tests/kent.test.mjs` (the Kent 1964 scale, lookup, ledger, calibration, URL state, phrase detection, `raw.json`, the WebMCP tools and the beamdswitch deck). In yujieteo/site the only Kent checks are the site's integration tests: the published copy, the catalogue stub and the folder docs. After changing the engine's scale, examples, glossary or messages, regenerate `raw.json` from the engine; the test says when it has drifted. When the site's `templates/beamdswitch.js` changes, copy it to both `beamdswitch.js` and `tests/fixtures/beamdswitch/template.js` and paste it into `<script id="beamdswitch">`.

## Conventions

- `index.html` is one self-contained HTML file with no dependencies and no network access; it works from `file://` and offline.
- Probabilities are percentages from 0 to 100. A Kent anchor is a representative point; the band is the region a word covers; gaps between bands are named as gaps.
- Analytic confidence is never combined with probability, simulated readers are always labelled as generated, and the forecast ledger is append-only.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of `templates/beamdswitch.js`, pasted into `<script id="beamdswitch">`) and declares `voice: bf_emma` in its front matter.
