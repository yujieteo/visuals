# Phasor and Impedance Visualiser: notes for coding agents

What a series or parallel RLC circuit does in sinusoidal steady state: a rotating phasor diagram, the impedance (and admittance) plane, waveforms and an optional power triangle, with every number in a readout. Live at <https://teoyujie.org/visuals/phasors/>; its data is
published at <https://teoyujie.org/visuals/phasors/data.json>.

## Where changes go

The standalone repository [yujieteo/phasors](https://github.com/yujieteo/phasors) is where this visualisation and its tests develop and where CI runs them. `visuals/phasors/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/phasors) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/phasors checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/phasors.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: published metadata (`META`: scope, conventions, ranges, presets, default state, degenerate cases, sources), `schemaVersion` and the default inputs as `example`; it must equal the engine's `META` and `defaultInputs()`, and the test fails when it drifts.
- Inside `index.html`: `<script id="ph-engine">` (pure core, `self.Phasors`: circuit, formatter, diagram scenes, SVG, hash, JSON, report, deck and self-tests) and `<script id="ph-ui">` (page, animation and WebMCP tools).
- `tests/phasors.test.mjs`: the self-tests, the hand-calculated default, presets, degenerate cases, range corners, formatter boundaries, hash and JSON round trips, deck and report structure and determinism, the WebMCP tools and that no network request is attempted.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine makes no DOM, storage, clock, randomness, `Intl` or locale calls, so its report and deck are byte-for-byte deterministic.
- `index.html` stays under 120 KB; the test enforces it.
- Files hold canonical units only: Ω, H, F, Hz, V (RMS) and degrees.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- The engine builds the beamdswitch deck itself and declares the narration voice `bf_emma` in its front matter; `tests/beamdswitch-voice.test.mjs` checks it.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/phasors.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
