# From Packets to Playback: notes for coding agents

Probability, information and renormalisation in a live stream: a streaming calculator chooses the bitrate of the next segment, and Show why unfolds the Euclidean field-theory notation behind it as a language for probability and information theory. Every trace is synthetic and seeded. Live at <https://teoyujie.org/visuals/packets-to-playback/>; its data is
published at <https://teoyujie.org/visuals/packets-to-playback/data.json>.

## Where changes go

The standalone repository [yujieteo/packets-to-playback](https://github.com/yujieteo/packets-to-playback) is where this visualisation and its tests develop and where CI runs them. `visuals/packets-to-playback/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/packets-to-playback) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/packets-to-playback checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/packets-to-playback.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: catalogue data published as `data.json` (the initial scenario, rungs, presets, candidate models, limits, model constants and assumptions). The page never fetches it; the test fails when it drifts from the engine.
- Inside `index.html`: `<script id="packets-to-playback-engine">` (pure core, `self.PacketsPlayback`), `<script id="packets-to-playback-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/packets-to-playback.test.mjs`: the special functions, the decision and its edge cases, determinism for the fixed seed, the Gaussian AR(1) action, block aggregation, the truncated projection, the bottleneck, `raw.json`, the WebMCP tools, Reset and the beamdswitch deck buttons.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine has no DOM, storage, clock or network use; every trace comes from a fixed seed.
- `index.html` stays at about 200 kB or less; the test enforces it.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/packets-to-playback.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
