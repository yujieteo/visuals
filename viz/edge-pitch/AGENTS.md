# Fastener edge margin and pitch visualiser: notes for coding agents

An exploration tool for edge distance, end distance and pitch in riveted and bolted single-lap and double-shear sheet joints. Not for certification. Live at <https://teoyujie.org/visuals/edge-pitch/>; its data is
published at <https://teoyujie.org/visuals/edge-pitch/data.json>.

## Where changes go

The standalone repository [yujieteo/edge-pitch](https://github.com/yujieteo/edge-pitch) is where this visualisation and its tests develop and where CI runs them. `visuals/edge-pitch/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/edge-pitch) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/edge-pitch checkout. `index.html` is generated. Edit `engine.js`, `template.html`, `raw.json` or
`beamdswitch.js`, then rebuild and test:

```sh
(cd visuals/edge-pitch && python build.py)
node --test tests/edge-pitch.test.mjs tests/edge-pitch-beamdswitch.test.mjs
python3 -m unittest discover -s tests -p 'test_edge_pitch.py'
```

The Python test checks that the build is reproducible and that the built
`site/` copy matches the sources, so run `scripts/build.py` before it.

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Data and tests

- `raw.json`: checks, assumptions, scope, sources, the test-vector format and the placeholder example, inlined by `build.py` and published as `data.json`.
- `engine.js`: the pure calculation core (`EdgePitch` in the browser, `require` in Node), including the self-test and the joint's beamdswitch report.
- `template.html`: markup, styles, UI, schematic, plots and WebMCP tools.
- `tests/edge-pitch.test.mjs`: hand calculations, bearing interpolation end points, unit round trips, validation, exports, test-vector import and the WebMCP tools.
- `tests/edge-pitch-beamdswitch.test.mjs`: the beamdswitch deck, parsed with beamdswitch's own parsers, and its buttons.
- `tests/test_edge_pitch.py`: build reproducibility, the stub, the engine self-test under Node and the published copy.

## Conventions

- One self-contained `index.html`, assembled by the build: no external scripts, stylesheets, fonts or network requests. It works offline.
- Never edit or hand-merge the generated `index.html`; change the sources and rerun `build.py`.
- `engine.js` has no DOM access, so it runs in the browser and in Node.
- The page keeps its permanent “Not for certification” banner, and every export repeats it.
- Numeric defaults carry a source tag (`Niu`, NASA RP-1228 or “unsourced default”); keep the tags honest.
- Tests use Node's built-in runner (`node --test`) and Python `unittest` only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/edge-pitch.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
