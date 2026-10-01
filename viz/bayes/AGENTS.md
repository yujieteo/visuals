# Bayesian reasoning in plain English: notes for coding agents

A Bayesian reasoning trainer and back-of-envelope calculator: probability phrases such as “likely” read against Sherman Kent's 1964 scale and a survey of real readers, then updated with evidence. Live at <https://teoyujie.org/visuals/bayes/>; its data is
published at <https://teoyujie.org/visuals/bayes/data.json>.

## Where changes go

The standalone repository [yujieteo/bayes](https://github.com/yujieteo/bayes) is where this visualisation and its tests develop and where CI runs them. `visuals/bayes/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/bayes) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/bayes checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/bayes.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: catalogue data published as `data.json` (the Kent scale, the survey answers, the example scenarios and the initial state). The page never fetches it; the test fails when it drifts from the page.
- `probly.csv`: the survey file as published (zonination/perceptions at commit `51207062`); the test checks the answers embedded in `index.html` against it.
- Inside `index.html`: `<script id="bayes-data">` (embedded data), `<script id="bayes-engine">` (pure core, `self.Bayes`), `<script id="bayes-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/bayes.test.mjs`: the engine, the phrase data against `probly.csv`, `raw.json`, the static reference rows, the offline promises, the WebMCP tools and the beamdswitch deck buttons.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine (`<script id="bayes-engine">`) has no DOM, storage, clock or network use, so Node can load it.
- The static reference-table rows are the output of `Bayes.staticRows()`; regenerate them when the engine changes (the test fails when they drift).
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/bayes.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo), followed by the survey data's own MIT notice and a note that Kent's essay is a US government work.
