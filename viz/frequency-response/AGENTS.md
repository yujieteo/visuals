# Frequency-Response Visualiser: notes for coding agents

An exploration tool for linear feedback loops in the frequency domain: SISO or MIMO, continuous or discrete time, with Bode, singular-value, Nyquist, Nichols and pole-zero views and their margins. Not a substitute for a verified control-design toolchain. Live at <https://teoyujie.org/visuals/frequency-response/>; its data is
published at <https://teoyujie.org/visuals/frequency-response/data.json>.

## Where changes go

The standalone repository [yujieteo/frequency-response](https://github.com/yujieteo/frequency-response) is where this visualisation and its tests develop and where CI runs them. `visuals/frequency-response/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/frequency-response) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. The copy is byte for byte, so AGENTS.md and SKILLS.md must not link into either. `README.md` lists every file here and its role.

Change and test here first, then port. The site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the procedure: run this repository's tests, an end-to-end check of the page in a browser and the first no-mistakes pass here; then port the page files into yujieteo/site and run the second pass there with site-level tests only. Logic and browser tests stay here, never in the site; time every test you add (`time node --test tests/<file>`).

## Build, test and verify

Run these from the root of the yujieteo/frequency-response checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/frequency-response.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: published metadata (scope, conventions, assumptions, sources, presets, threshold defaults) and the default example; it must equal the engine's `META` and `defaultInputs()`, and the test fails when it drifts.
- Inside `index.html`: `<script id="fr-engine">` (pure core, `self.FreqResponse`) and `<script id="fr-ui">` (page, plots and WebMCP tools).
- `tests/frequency-response.test.mjs` extracts the engine from `index.html`, runs the in-page self-tests and further analytic checks, and exercises the WebMCP tools.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine has no DOM, storage, clock or randomness; the linear-algebra kernel is hand-written.
- The page keeps its permanent “exploration only” banner, and every export repeats it.
- Files hold canonical units (rad/s, seconds, absolute magnitude, degrees); display toggles change only what is shown.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- This tool exports no beamdswitch deck. A deck added later uses the site's standard template, `templates/beamdswitch.js`, and declares the narration voice `bf_emma`.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/frequency-response.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
