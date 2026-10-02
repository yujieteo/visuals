# AGENTS.md: FBD Drawer

A scaled free body diagram drawing tool in which loads are data, not pictures: beams, rods, lines and plates share joints; point forces, moments, distributed loads, self-weight and reactions attach to them, with pin, roller and fixed supports, all stored in mm, N and N·mm and shown in SI or imperial against one rotatable axes triad. There is no solver. Live at <https://teoyujie.org/visuals/fbd/>.

## Source of truth

This repository, [yujieteo/fbd](https://github.com/yujieteo/fbd), is the source of truth: the tool and its tests are developed here, and its CI runs them here. `visuals/fbd/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/fbd) is a port of the page files, refreshed whenever the tool is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). `index.html` is the whole tool with no build step: edit it directly. Its `<script data-core>` blocks are the DOM-free model (units, validation, serialisation, rendering, export, the aircraft presets and the beamdswitch report; `self.FBD`), `<script id="fbd-beamdswitch" data-core>` is `beamdswitch.js` inlined, and its `<script data-ui>` blocks are the interface and the WebMCP tools. `examples.json` (published as `data.json`) holds reference drawings 1 to 5; `tools/make-examples.mjs` rebuilds it through the tool's own loader and `tools/sync-examples.mjs` copies it into `<script id="fbd-examples">`. `tools/core.mjs` loads the core scripts into Node for the tests and the builders, and `tools/touch-build.js` is reference drawing 6, run in a browser.

The tests are in `tests/`, with read-only copies of beamdswitch's deck parsers and the site's shared template (`templates/beamdswitch.js` and `templates/beamdswitch-report.md`) in `tests/fixtures/beamdswitch/`.

## Build, test and verify

There is no build step. From the repository root:

```sh
node --test 'tests/*.test.mjs'
```

CI (`.github/workflows/ci.yml`) runs the same command on every push and pull request: `tests/fbd.test.mjs` (the specification's definition of done: round trips, units, scale, axes presets, validation errors and the WebMCP tools) and `tests/fbd-beamdswitch.test.mjs` (each drawing's beamdswitch deck, parsed with beamdswitch's own parsers, and the File menu items). In yujieteo/site the only FBD checks are the site's integration tests: the published copy, the catalogue stub and the folder docs. Drawing 6, building drawing 1 by touch alone, runs in a browser as the README describes. After changing the reference drawings, run `node tools/make-examples.mjs` then `node tools/sync-examples.mjs`; the tests say when the page and `examples.json` have drifted. When the site's `templates/beamdswitch.js` changes, copy it to both `beamdswitch.js` and `tests/fixtures/beamdswitch/template.js` and paste it into `<script id="fbd-beamdswitch" data-core>`.

## Workflow

Every change follows the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md):

1. Change and test it here first: run the commands above and check the page end to end in a browser.
2. Run the first no-mistakes pass in this repository. It also checks the page in a shallow clone of yujieteo/site (`git clone --depth 1 https://github.com/yujieteo/site`) with the change ported in; build and browse only this page there, never the site's full build or test suite.
3. Once this repository's pull request merges, port the page files byte for byte into `visuals/fbd/` in yujieteo/site (this repository minus `tests/` and `.github/`) and run the second no-mistakes pass on that pull request, which runs only the site-level tests.

Logic, end-to-end and other heavy tests live here, where they run only when this tool changes; the site adds none for it, so its test time stays flat.

## Conventions

- `index.html` is one self-contained HTML file with no dependencies and no network access.
- Geometry is stored in mm, N, N·mm and N/mm, y up; SI and imperial are display and input systems only, and the axes triad and its presets never move stored geometry.
- Loading validates everything and rejects a file with errors that name the exact path, rather than silently dropping content.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of `templates/beamdswitch.js`, pasted into `<script id="fbd-beamdswitch" data-core>`) and declares `voice: bf_emma` in its front matter.
