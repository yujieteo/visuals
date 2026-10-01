# Queue time: notes for coding agents

How long will this queue take? A phone-first estimator for someone standing in a real queue, with a second mode for food orders. Live at <https://teoyujie.org/visuals/queue-time/>; its data is
published at <https://teoyujie.org/visuals/queue-time/data.json>.

## Where changes go

The standalone repository [yujieteo/queue-time](https://github.com/yujieteo/queue-time) is where this visualisation and its tests develop and where CI runs them. `visuals/queue-time/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/queue-time) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/queue-time checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/queue-time.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: catalogue data published as `data.json` (the initial state, presets, limits, model constants and assumptions). The page never fetches it; the test fails when it drifts from the engine.
- Inside `index.html`: `<script id="queue-time-engine">` (pure core, `self.QueueTime`, with the seeded queue simulation), `<script id="queue-time-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/queue-time.test.mjs`: the estimator and its edge cases, rounding, comparison wording, back-estimation, timers, food ranges, `raw.json`, the WebMCP tools and the beamdswitch deck buttons.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine has no DOM, storage, clock or network use; 400 runs with a fixed seed give the same numbers for the same inputs.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/queue-time.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
