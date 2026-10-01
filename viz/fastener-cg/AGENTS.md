# Fastener Pattern CG Tracker: notes for coding agents

Centroids, section properties and elastic load distribution for a bolt or rivet group under a general 3D eccentric load, with interaction margins, prying and preload, plate bearing and tear-out, and an instantaneous-centre-of-rotation (ICR) solve. For preliminary sizing. Live at <https://teoyujie.org/visuals/fastener-cg/>; its data is
published at <https://teoyujie.org/visuals/fastener-cg/data.json>.

## Where changes go

The standalone repository [yujieteo/fastener-cg](https://github.com/yujieteo/fastener-cg) is where this visualisation and its tests develop and where CI runs them. `visuals/fastener-cg/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/fastener-cg) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/fastener-cg checkout. `index.html` and `raw.json` are build outputs. Edit `src/`, then rebuild and
test:

```sh
node build.mjs          # rebuild after editing src/
node build.mjs --check  # fail if the outputs are stale
node --test tests/fastener-cg*.test.mjs     # core, persistence, scene, WebMCP, build, hand-calculation, deck and browser tests
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `src/core/*.mjs`: the dependency-free calculation core (ES modules), including the verification set in `src/core/verify.mjs`.
- `src/ui/*.mjs`: page controller, canvas painter, localStorage library and the WebMCP tools (`src/ui/webmcp.mjs`).
- `src/template.html`: markup and styles with one `/*@APP@*/` marker and one `/*@BEAMDSWITCH@*/` marker, where `build.mjs` inlines `beamdswitch.js`.
- `raw.json`: published metadata written by `build.mjs` (published as `data.json`).
- `tests/fastener-cg.test.mjs` imports the modules under `src/` directly and runs the same verification cases as the page's “Run verification” button, plus persistence, scene, WebMCP and build checks.
- `tests/fastener-cg-handcalc.test.mjs` and `tests/fastener-cg-beamdswitch.test.mjs` check the hand calculations and the beamdswitch deck, parsing them with beamdswitch's own parser; `tests/fixtures/beamdswitch/` holds read-only copies of that parser and of the site's `templates/beamdswitch.js` (as `template.js`) and `templates/beamdswitch-report.md`, and `tests/beamdswitch-deck-checks.mjs` is the site's shared deck checks with paths pointing here.
- `tests/fastener-cg-browser.test.mjs` opens the built `index.html` in headless Chrome and drives the hand calculations and their exports end to end. It runs when `FASTENER_CG_BROWSER_URL` names a Chrome started with `--remote-debugging-port` (CI starts one) and is skipped otherwise.

## Conventions

- One self-contained `index.html`, assembled by the build: no external scripts, stylesheets, fonts or network requests. It works offline.
- Never edit the generated `index.html` or `raw.json`; change `src/` and rerun `build.mjs`.
- The bundler in `build.mjs` accepts only named relative imports and `export` on `function`, `const` and `class` declarations.
- Results are for preliminary sizing and hand-calculation cross-checks; reports carry the “Preliminary sizing” line.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- The beamdswitch deck (`src/core/deck.mjs`) is written with the site's standard template: `beamdswitch.js` stays byte-identical to `templates/beamdswitch.js` in yujieteo/site, so anything specific to this tool goes in `src/`. The deck declares the narration voice `bf_emma`.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/fastener-cg.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
