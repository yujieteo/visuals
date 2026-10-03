# AGENTS.md: Motives and periods

A small interactive lab for periods of mixed Tate motives: 2πi from the Tate motive in h(P¹) = 𝟏 ⊕ 𝟏(−1), ζ(3) and multiple zeta values as iterated integrals, and the Feynman periods of the wheel graphs. Live at <https://teoyujie.org/visuals/motives-periods/>; its data is published at <https://teoyujie.org/visuals/motives-periods/data.json>.

## Source of truth

This repository, [yujieteo/motives-periods](https://github.com/yujieteo/motives-periods), is the source of truth: the tool and its tests are developed here, and its CI runs them here. `visuals/motives-periods/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/motives-periods) is a port of the page files, refreshed whenever the tool is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). `index.html` is the whole tool with no build step: edit it directly. `<script id="motives-periods-engine">` is the pure engine (`self.MotivesPeriods`; no DOM, storage, clock, randomness or network), `<script id="motives-periods-beamdswitch">` is `beamdswitch.js` inlined, and `<script id="motives-periods-ui">` is the page and its WebMCP tools. `raw.json` (published as `data.json`) must equal the engine's `{ meta: META, example: toJSON(defaultState()) }`.

The tests are in `tests/`, with read-only copies of beamdswitch's deck parsers and the site's shared template (`templates/beamdswitch.js` as `template.js`, and `templates/beamdswitch-report.md`) in `tests/fixtures/beamdswitch/`.

## Build, test and verify

There is no build step. From the repository root:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

CI (`.github/workflows/ci.yml`) runs the same command on every push and pull request: `tests/motives-periods.test.mjs` (the model: exact and high-precision values, identities, point counts, state, exports, claims and the WebMCP tools in a stand-in DOM), `tests/beamdswitch.test.mjs` (the decks) and `tests/motives-periods-page.test.mjs` (the page in headless Chrome from `file://`; set `CHROME_PATH` if Chrome is not found, and locally it skips without one). The browser test stands in for the technical E2E repository until that exists; when it does, the browser checks move there, never to the site. In yujieteo/site the only checks for this folder are the site's integration tests: the published copy, the catalogue stub and the folder docs. The page also runs its self-test on every load and shows a pass/fail badge. After changing `META` or `defaultState()`, regenerate `raw.json` from the engine; the test says when it has drifted. When the site's `templates/beamdswitch.js` changes, copy it to both `beamdswitch.js` and `tests/fixtures/beamdswitch/template.js` and paste it into `<script id="motives-periods-beamdswitch">`.

## Workflow

Every change follows the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md):

1. Change and test it here first: run the command above and check the page end to end in a browser.
2. Run the first no-mistakes pass in this repository. It also checks the page in a shallow clone of yujieteo/site (`git clone --depth 1 https://github.com/yujieteo/site`) with the change ported in; build and browse only this page there, never the site's full build or test suite.
3. Port the page files byte for byte into `visuals/motives-periods/` in yujieteo/site (this repository minus `tests/` and `.github/`) and run the second no-mistakes pass on that pull request, which runs only the site-level tests.

Logic, end-to-end and other heavy tests live here, where they run only when this tool changes; time every test you add (`time node --test tests/<file>`).

## Conventions

- `index.html` is one self-contained HTML file with no dependencies and no network access (a Content-Security-Policy forbids it).
- Every mathematical statement on the page is a claim in the engine's `CLAIMS` with at least one source in `SOURCES`; every number the page shows is computed by the engine and checked by a test against an exact value, an independent reference or an identity.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of `templates/beamdswitch.js`, inlined as `<script id="motives-periods-beamdswitch">`) and declares `voice: bf_emma` in its front matter.
