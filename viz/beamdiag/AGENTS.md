# Beam diagram creator (beamdiag): notes for coding agents

An interactive shear-force and bending-moment diagram creator for straight Euler–Bernoulli beams with pinned and fixed supports, including statically indeterminate beams, with step-by-step hand calculations, an MSC Nastran `.bdf` exporter and a narrated beamdswitch deck. Live at <https://teoyujie.org/visuals/beamdiag/>; its data is published at <https://teoyujie.org/visuals/beamdiag/data.json>.

## Where changes go

The standalone repository [yujieteo/beamdiag](https://github.com/yujieteo/beamdiag) is where this visualisation and its tests develop and where CI runs them. `visuals/beamdiag/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/beamdiag) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. It also leaves out the development-only `docs/`, `.gitignore` and `.no-mistakes.yaml`, so AGENTS.md and SKILLS.md must not link into any of them (the site checks that their links resolve). [README.md](README.md) lists every file here and its role.

Every change follows the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md):

1. Change and test it here, including the browser end-to-end test, and run the first no-mistakes pass here, which also checks the page ported into a shallow clone of yujieteo/site (`git clone --depth 1`), building and browsing only beamdiag, never the full site build or suite.
2. After it merges, port the page files byte for byte into the site's `visuals/beamdiag/` in a site pull request, which gets the second no-mistakes pass with site-level tests only.

Heavy and end-to-end tests live here, never in the site. Time every test you add (for example `time node --test tests/handcalc.test.mjs`) and list each with its time in the pull request.

## Build, test and verify

Run these from the root of the yujieteo/beamdiag checkout, with Python 3.10 or later and Node 22 or later. `index.html` is built: edit `template.html`, `engine.js`, `beamdswitch.js`, `handcalc.js` or `raw.json`, then rebuild it; never edit `index.html` by hand.

```sh
python3 build.py              # rebuild index.html
python3 reference.py          # rebuild reference.json after editing fixtures.json
python3 reference.py --check  # fail if reference.json is stale
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

`tests/browser.test.mjs` drags handles in Chrome and lays out every preset's deck in beamdswitch's own page (`tests/fixtures/beamdswitch/beamdswitch.html`); it is skipped unless `BEAMDIAG_BROWSER_URL` points at a Chrome started with remote debugging, as CI does. To run it locally, start Chrome the way `.github/workflows/ci.yml` does (`--headless=new --remote-debugging-port=9227 '--remote-allow-origins=*'`) and set `BEAMDIAG_BROWSER_URL=http://127.0.0.1:9227`. `docs/verification.md` lists what each test checks. In yujieteo/site the only beamdiag checks are the site's integration tests: the catalogue stub `data/visuals/beamdiag.yaml` points into the folder and names the tools the page registers, the published copy equals the port, and the folder docs keep their links inside the folder.

## Code and data

- `engine.js` (`BeamDiag`): the stiffness-method solver, exact V/M recovery, section properties, units, the NASTRAN exporter, number formatting and speech, and `beamReport`, the beam's beamdswitch report. The solver is authoritative.
- `handcalc.js` (`HandCalc`): the hand calculations, a readable derivation of the solver's answer; `deck(report)` writes the template's deck with a Hand calculations section, `slidesOf` splits each step over as many slides as it needs to fit beamdswitch's slide at full size (at most `SLIDE_ROWS` rows, a title of at most 50 characters), and `document` writes the hand calculations' Markdown, which keeps each step whole, with the template's frame rules.
- `template.html`: page markup, styles, UI and the four read-only WebMCP tools. `build.py` inlines `raw.json`, `engine.js`, `beamdswitch.js` and `handcalc.js` into it to write `index.html`.
- `raw.json`: presets, materials, conventions, assumptions, NASTRAN notes and sources, published as `data.json`.
- `reference.py`, `fixtures.json`, `reference.json`: the independent exact-arithmetic Python solver, the shared test beams and its output on them.

## Conventions

- `index.html` is one self-contained HTML file with no network requests; it works from `file://` and offline.
- The engine solves in SI (m, N, Pa); the page converts to and from the chosen unit convention, and the WebMCP tools take and return SI. Loads are positive upward, couples positive counter-clockwise, and M is positive when sagging.
- Tests use Node's built-in runner (`node --test`) and Python's `unittest` only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check it against `tests/fixtures/beamdswitch/template.js`. When the site's template changes, copy it to both and rebuild. Anything beamdiag adds to its decks, such as the Hand calculations section, lives in `handcalc.js`, never in `beamdswitch.js`. Every deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/beamdiag.yaml` in yujieteo/site.
- The page's breadcrumb links back to the site's Visuals page (`../../visuals.html`).
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
