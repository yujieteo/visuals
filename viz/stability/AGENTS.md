# AGENTS.md: Structural Stability Visualiser

Four stability checks with every formula tagged by source: column buckling, second-order beam-columns, flat-plate shear buckling and NACA TN 2661 diagonal tension on plane webs. Not for certification. Live at <https://teoyujie.org/visuals/stability/>.

## Source of truth

This repository, [yujieteo/stability](https://github.com/yujieteo/stability), is the source of truth: the Structural Stability Visualiser and its tests are developed here, and its CI runs them here. `visuals/stability/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/stability) is a port of the page files, refreshed whenever the visualiser is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

Change and test here first, then port. The site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the procedure: run this repository's tests, an end-to-end check of the page in a browser and the first no-mistakes pass here; then port the page files into yujieteo/site and run the second pass there with site-level tests only. Logic and browser tests stay here, never in the site; time every test you add (`time node --test tests/<file>`).

## Files and data

See [README.md](README.md). `engine.js` is the pure calculation core (no DOM; `Stability` in the browser, `require` in Node), `template.html` the page and WebMCP tools, `raw.json` the sources and digitised NASA figure points (published as `data.json`), and `build.py` inlines `raw.json`, `engine.js` and `beamdswitch.js` into `template.html` to write `index.html`, which is generated.

The tests are in `tests/`: `tests/stability.test.mjs` (the engine, exports and the page's WebMCP tools), `tests/beamdswitch.test.mjs` (every tab's beamdswitch deck) and `tests/test_stability.py` (build reproducibility and the self-test under Node), with read-only copies of beamdswitch's deck parsers and the site's shared template in `tests/fixtures/beamdswitch/`.

## Build, test and verify

From the repository root:

```sh
python build.py                                     # regenerate index.html
node --test 'tests/*.test.mjs'
python -m unittest discover -s tests -p 'test_*.py'
```

CI (`.github/workflows/ci.yml`) runs the two test commands on every push and pull request; `tests/test_stability.py` fails if `index.html` is stale. In yujieteo/site no logic test runs for this page; the site only checks its own integration (the published copy matches the ported files, the catalogue stub and the folder docs). The page also runs its self-test on every load and shows a pass/fail badge.

## Conventions

- `index.html` is one self-contained HTML file with no dependencies; it makes no external requests and works offline.
- Every formula carries a source tag (`NASA`, `classical` or `fit`); a chart relation outside its figure shows "unavailable", never an extrapolated number. Keep the "Not for certification" banner and its repeat in every export.
- Values are stored in N, mm and MPa whatever units are displayed.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template (`beamdswitch.js`, a copy of the site's `templates/beamdswitch.js`) and declares `voice: bf_emma` in its front matter.
