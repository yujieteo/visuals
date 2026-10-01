# Infer a Theory: notes for coding agents

From observations to effective actions and renormalisation: plain-English observations of a fluctuating quantity become a maximum-entropy effective theory with a posterior over its couplings, a renormalisation-group flow, compatible finer-scale theories and the next measurement ranked by expected information gain. Live at <https://teoyujie.org/visuals/infer-a-theory/>; its data is
published at <https://teoyujie.org/visuals/infer-a-theory/data.json>.

## Where changes go

The standalone repository [yujieteo/infer-a-theory](https://github.com/yujieteo/infer-a-theory) is where this visualisation and its tests develop and where CI runs them. `visuals/infer-a-theory/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/infer-a-theory) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/infer-a-theory checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/infer-a-theory.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: catalogue data published as `data.json` (operators, defaults, limits, the worked example, the dictionary and the phrase-data provenance). The page never fetches it; the test fails when it drifts from the engine.
- `probly.csv`: the survey answers as published (zonination/perceptions at commit `5120706`), published beside the page as an asset; the page embeds the same numbers and a test keeps them equal.
- Inside `index.html`: `<script id="infer-a-theory-phrases">` (probability-language data), `<script id="infer-a-theory-engine">` (pure core, `self.InferTheory`), `<script id="infer-a-theory-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/infer-a-theory.test.mjs`: the parser, phrase calibration against `probly.csv` and Kent's table, the solvers, maximum-entropy fits, decimation, relevance, the worked example end to end, determinism, `raw.json`, the WebMCP tools and the beamdswitch deck buttons.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine has no DOM, storage, clock, randomness or network use; results are deterministic.
- A Content-Security-Policy forbids network requests; keep it.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/infer-a-theory.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo), followed by the survey's MIT notice and a note that Kent's essay is a US government work.
