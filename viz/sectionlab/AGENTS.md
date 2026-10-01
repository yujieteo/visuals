# AGENTS.md: Sectionlab

Build a cross-section from library shapes by dragging and read its section properties, a torsion constant where a formula has been measured against a numerical Prandtl solution, and a Ramberg–Osgood moment–curvature curve. Results must be verified independently; the page is not a design-code check. Live at <https://teoyujie.org/visuals/sectionlab/>.

## Source of truth

This repository, [yujieteo/sectionlab](https://github.com/yujieteo/sectionlab), is the source of truth: Sectionlab and its tests are developed here, and its CI runs them here. `visuals/sectionlab/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/sectionlab) is a port of the page files, refreshed whenever Sectionlab is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve); [playbooks/deploy-to-site.md](playbooks/deploy-to-site.md) gives the steps.

## Files and data

[SKILLS.md](SKILLS.md) routes each task to its playbook, and [docs/architecture.md](docs/architecture.md) explains the modules. `src/` holds the engine modules and `src/ui.js`, `template.html` the page, `raw.json` the presets, materials and method text (published as `data.json`), and `reference/` the Python references and their generated fixtures. `build.py` inlines them with `beamdswitch.js` into `template.html` to write `index.html`, which is generated. The tests are in `tests/`, with read-only copies of beamdswitch's deck parsers and the site's shared template in `tests/fixtures/beamdswitch/`.

## Build, test and verify

From the repository root, as [playbooks/verify.md](playbooks/verify.md) says:

```sh
python build.py                                     # regenerate index.html
python build.py --check                             # fail if index.html is stale
node --test 'tests/*.test.mjs'
pip install -r requirements-test.txt                # once: numpy, scipy, PyYAML
python -m unittest discover -s tests -p 'test_*.py'
```

CI (`.github/workflows/ci.yml`) runs these same commands on every push and pull request, including the torsion accuracy-table test (the slowest, over a minute) the beamdswitch deck test, `tests/beamdswitch.test.mjs`, and the end-to-end test `tests/browser.test.mjs`, which drives the built page in headless Chrome (set `CHROME_PATH` if Chrome is not in a usual place; it is skipped locally without one and required under CI). In yujieteo/site the only Sectionlab test is `tests/test_sectionlab.py`, which checks that the published copy matches the ported files.

## Conventions

- `index.html` is one self-contained HTML file; it makes no external requests.
- The repository must stay self-contained: nothing in it may refer to files outside it.
- Units are mm, MPa, N and N·mm; never add unit conversions inside the engine.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of the site's `templates/beamdswitch.js`) and declares `voice: bf_emma` in its front matter.
