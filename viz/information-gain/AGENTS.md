# Information gain: notes for coding agents

What should you check next to reduce your uncertainty? Start from a yes-or-no belief, list the checks you could make, and compare them by expected information gain and by information per unit of time before observing a result and updating. Live at <https://teoyujie.org/visuals/information-gain/>; its data is
published at <https://teoyujie.org/visuals/information-gain/data.json>.

## Where changes go

The standalone repository [yujieteo/information-gain](https://github.com/yujieteo/information-gain) is where this visualisation and its tests develop and where CI runs them. `visuals/information-gain/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/information-gain) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/information-gain checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/information-gain.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Porting to yujieteo/site

Change and test this repository first, then port it; the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the full workflow.

1. Run the suite above, check the page end to end in a browser (load `index.html`, use what changed, call the WebMCP tools and the exports), and run no-mistakes here.
2. Copy this repository minus `tests/` and `.github/`, byte for byte, into `visuals/information-gain/` of yujieteo/site, and run no-mistakes again on that pull request, which runs only the site-level tests. Never add logic tests to the site; its test cost must stay flat.

## Data and tests

- `raw.json`: catalogue data published as `data.json` (the Kent scale, the survey answers, the initial scenario, examples, teaching presets, units, limits and wording thresholds). The page never fetches it; the test fails when it drifts from the engine.
- `probly.csv`: the survey file as published (zonination/perceptions at commit `51207062`); the test checks the embedded answers against it.
- Inside `index.html`: `<script id="information-gain-phrases">` (probability-language data), `<script id="information-gain-engine">` (pure core, `self.InformationGain`), `<script id="information-gain-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/information-gain.test.mjs`: the self-tests, the phrase data against `probly.csv`, the information measures on a grid including every 0 and 1 edge, rankings, the time budget, wording, validation, `raw.json`, the WebMCP tools and the beamdswitch deck buttons.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine has no DOM, storage, clock or network use, so Node can load it.
- The page's own code stays under about 100 KB, not counting the embedded phrase data and the beamdswitch template; the test enforces it.
- The survey's MIT notice travels with the embedded answers, in `LICENSE` and on the page; a test checks both.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/information-gain.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo), followed by the survey data's own MIT notice and a note that Kent's essay is a US government work.
