# Pigeonhole → Averages: notes for coding agents

One argument at three levels of abstraction: the pigeonhole principle, the generalised pigeonhole principle (some box holds at least ⌈N/k⌉, some at most ⌊N/k⌋) and the principle of averages (min ≤ mean ≤ max), with a narrated beamdswitch deck. Live at <https://teoyujie.org/visuals/pigeonhole/>; its data is published at <https://teoyujie.org/visuals/pigeonhole/data.json>.

## Where changes go

The standalone repository [yujieteo/pigeonhole](https://github.com/yujieteo/pigeonhole) is where this visualisation and its tests develop and where CI runs them. `visuals/pigeonhole/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/pigeonhole) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/pigeonhole checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/pigeonhole.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

In yujieteo/site the only Pigeonhole checks are the site's integration tests: the catalogue stub `data/visuals/pigeonhole.yaml` points into the folder and names the tools the page registers, the published copy equals the port, and the folder docs keep their links inside the folder. The page also runs its self-tests through `run_self_tests`.

## Data and tests

- `raw.json`: catalogue data published as `data.json` (scenes, modes, examples, challenges, the real example, the lab's starting values and the worked bounds). The page never fetches it; the test fails when it drifts from the engine.
- Inside `index.html`: `<script id="pigeonhole-engine">` (pure core, `self.Pigeonhole`), `<script id="pigeonhole-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/pigeonhole.test.mjs`: the engine, the worked bounds, `raw.json`, the offline promises, every scene's deck, the WebMCP tools and the beamdswitch and Copy deck buttons. `tests/data-visuals-beamdswitch.mjs` holds the deck checks and a stand-in DOM that boots the page in `node:vm`.
- `tests/fixtures/beamdswitch/`: read-only copies of beamdswitch's deck parsers and the site's `templates/beamdswitch.js` (as `template.js`) and `templates/beamdswitch-report.md`.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline, from `file://` and in a sandboxed iframe, and shows the theorems and proofs with JavaScript off.
- The engine has no DOM, storage, clock, randomness or network use, so Node can load it. ⌈N/k⌉ and ⌊N/k⌋ use integer arithmetic.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check it against `tests/fixtures/beamdswitch/template.js`. When the site's template changes, copy it to both and paste it into `<script id="beamdswitch">`. Every deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/pigeonhole.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
