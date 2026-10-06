# Monte Carlo Probability Workbench

`build.py` writes `index.html` and `raw.json` from `data/` (the catalogue), `src/` (body, CSS and the classic-script modules), `beamdswitch.js` and the shared kit. Never edit `index.html` or `raw.json` by hand. The engine modules (`rng`, `special`, `expr`, `continuous`, `laws`, `engine`, `dsl`) are pure and run in Node, in the page and in its workers; `pool.js` and `view.js` run in the browser only. A workflow's model is its `dsl` text in `data/models.json`: change the text, then run `python3 build.py` and `node --test tests/*.test.mjs`.

Keep the rules of `spec.md`: every law keeps three workflows of its own, every method keeps a suitable example, a failure example and a comparison, every result keeps its claim tag, a moment that does not exist is never shown as a number, and synthetic parameters are never presented as calibrated evidence. A change to the engine keeps the results of group 1 the same: compare them before and after. Check the reader text with the ASD-STE100 checker; the page claims no certified conformance.

Its tests are in `tests/`, its browser checks in `e2e/`. `python3 ../../scripts/check.py monte-carlo-workbench` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
