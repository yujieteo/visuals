# Scientific Modelling and Dimensional Analysis

`build.py` writes `raw.json` from `data/` and `index.html` from the kit's shell (`scripts/kit/shell.html`), `src/` and `beamdswitch.js`. Never edit either by hand: change the sources, then run `python3 build.py`. The engine is classic-script modules that the tests load with `require()`: `rational`, `linalg`, `units`, `expr`, `record`, `check`, `finder`, `model` and `report`. `view.js` runs only in the browser.

`spec.md` is the captain's specification with the agreed decisions of the build plan at its end; the page is built in nine pieces, and `data/roadmap.json` says which piece brings each family and method. Keep every "exact" status on rational or canonical-form equality, never a floating-point comparison. `data/references.json` comes from `tools/references.py` (SymPy, pinned with `uv run --with`); run it by hand when an example changes, because CI never runs it. Write reader text in ASD-STE100.

Its tests are in `tests/` and `e2e/`. `python3 ../../scripts/check.py scientific-modelling` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
