# AGENTS.md: Mohr's Circle Visualiser

A teaching tool and calculator for 3D stress and small-strain transformation in an isotropic linear-elastic material: principal values and directions, the three Mohr circles, 2D circles about any axis, failure checks and a strain-gauge rosette helper. Live at <https://teoyujie.org/visuals/mohr/>.

## Source of truth

This repository, [yujieteo/mohr](https://github.com/yujieteo/mohr), is the source of truth: the tool and its tests are developed here, and its CI runs them here. `visuals/mohr/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/mohr) is a port of the page files, refreshed whenever the tool is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). `index.html` is the whole tool with no build step: edit it directly. `<script id="mohr-engine">` is the numeric core (`self.Mohr`; no DOM, storage, clock or randomness), `<script id="mohr-beamdswitch">` is `beamdswitch.js` inlined, and `<script id="mohr-ui">` is the page and the WebMCP tools. `raw.json` (published as `data.json`) must equal the engine's `META` and `toJSON(defaultState())`.

The tests are in `tests/`, with read-only copies of beamdswitch's deck parsers and the site's shared template (`templates/beamdswitch.js` and `templates/beamdswitch-report.md`) in `tests/fixtures/beamdswitch/`.

## Build, test and verify

There is no build step. From the repository root:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

CI (`.github/workflows/ci.yml`) runs the same command on every push and pull request: `tests/mohr.test.mjs` (engine, presets, conventions, import and export, WebMCP tools) and `tests/beamdswitch.test.mjs` (the beamdswitch deck). In yujieteo/site the only Mohr checks are the site's integration tests: the published copy, the catalogue stub and the folder docs. The page also runs its self-test on every load and shows a pass/fail badge. After changing `META` or `defaultState()`, regenerate `raw.json` from the engine; the test says when it has drifted. When the site's `templates/beamdswitch.js` changes, copy it to both `beamdswitch.js` and `tests/fixtures/beamdswitch/template.js` and paste it into `<script id="mohr-beamdswitch">`.

## Conventions

- `index.html` is one self-contained HTML file with no dependencies and no network access.
- Stress is stored in MPa, tension positive; strain is dimensionless with tensor shear. Display, input and export convert.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of `templates/beamdswitch.js`, pasted into `<script id="mohr-beamdswitch">`) and declares `voice: bf_emma` in its front matter.
