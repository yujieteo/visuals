# Good food in Tampines

`build.py` ranks the outlets in `outlets.csv` (with `sources.json`, `directories.csv`, `yeo2021.csv`, `fndds.csv` and `map.json`), writes `raw.json` and rewrites only the `dataset`, `beamdswitch` and `report` script blocks of `index.html`; edit the rest of the page directly, then run `python3 build.py`. `beamdswitch.js` is the site's template, unchanged. Rerun `python3 extract_fndds.py <FoodData Central survey zip>` only when `outlets.csv` names a new FNDDS food (its docstring gives the download).

Calorie figures are estimates for reference dishes, not measurements of an outlet's food; a dish without a fixed portion stays unestimated, with its reason.

Its tests are in `tests/`; `python3 ../../scripts/check.py tampines-food` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
