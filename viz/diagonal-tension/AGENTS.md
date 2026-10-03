# AGENTS.md: Diagonal Tension

A one-file finite-element comparison of an aluminium skin-and-stringer panel in shear, with and without a bonded doubler: plane-stress quadrilaterals and axial bars solved by sparse conjugate gradient in a Web Worker, linear elastic and pre-buckling. Live at <https://teoyujie.org/visuals/diagonal-tension/>.

## Source of truth

This repository, [yujieteo/diagonal-tension](https://github.com/yujieteo/diagonal-tension), is the source of truth: the tool and its tests are developed here, and its CI runs them here. `visuals/diagonal-tension/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/diagonal-tension) is a port of the page files, refreshed whenever the tool is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, and minus the development-only `.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `scripts/extract-inline.mjs`, `.typecheck/` and `node_modules/`, so AGENTS.md and SKILLS.md must not link into any of them (the site checks that their links resolve).

Change and test here first, then port. The site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the procedure: run this repository's tests, an end-to-end check of the page in a browser and the first no-mistakes pass here; then port the page files into yujieteo/site and run the second pass there with site-level tests only. Logic and browser tests stay here, never in the site; time every test you add (`time node --test tests/<file>`).

## Files and data

See [README.md](README.md). `diagonal-tension.html` is the whole tool with no build step: edit it directly, then copy it to `index.html` (the tests require them identical). `<script id="dt-engine">` is the numeric core (`self.DiagonalTension`; no DOM, storage, clock or randomness), `<script id="dt-beamdswitch">` is `beamdswitch.js` inlined, `<script type="text/plain" id="dt-worker">` is the Web Worker's message loop (the page runs it after the engine text in a Blob), and `<script id="dt-ui">` is the page and the WebMCP tools. `raw.json` (published as `data.json`) must equal the engine's `META` and `modelJSON(defaultState())`; the README has the command that regenerates it.

## Build, test and verify

There is no build step. From the repository root:

```sh
npm ci && npm run typecheck
node --test 'tests/*.test.{mjs,cjs}'
```

`npm run typecheck` copies the page's own inline scripts into `.typecheck/inline/` and runs `tsc` (pinned in `package.json`, a development-only tool) over them and the tests; every script except the verbatim beamdswitch template is checked through its JSDoc types. CI (`.github/workflows/ci.yml`) runs both commands on every push and pull request. The model tests cover every acceptance item of the specification, including references written independently of the solver; the browser test (`tests/diagonal-tension-page.test.mjs`, headless Chrome from `file://`, offline) stands in for the dedicated technical end-to-end repository until it exists. Set `CHROME_PATH` if Chrome is not found; locally the browser test skips without one, in CI it fails. Its downloads go under `/tmp/diagonal-tension-v1/downloads` (or `DT_DOWNLOAD_DIR`), never into the user's folders. The page also has a Run self-check button that runs the same self-check in its worker.

## Conventions

- `diagonal-tension.html` is one self-contained HTML file with no dependencies and no network access; it works from `file://`.
- Units are mm, N, MPa and kg (density entered in kg/m³); tension is positive. Comparisons use unsmoothed Gauss-point values.
- The model stays linear elastic and pre-buckling. Post-buckling tension fields, stringer bending or crippling, fastener slip and one-sided doubler bending need new element formulations and validation, not display options.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or any other test framework. `package.json` exists only to pin the type-check tooling (`typescript`, `@types/node`).
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of the site's `templates/beamdswitch.js`, pasted into `<script id="dt-beamdswitch">`), declares `voice: bf_emma`, and is offered only after a validated run.
