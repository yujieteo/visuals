# AGENTS.md: Good food in Tampines

The 50 places food writers recommend most across Tampines Mall, Tampines 1, Century Square and Our Tampines Hub, ranked by how many independent guides name them, with sourced calorie estimates for the signature dishes. Live at <https://teoyujie.org/visuals/tampines-food/>.

## Source of truth

The standalone repository [yujieteo/tampines-food](https://github.com/yujieteo/tampines-food) is where this visualisation and its tests develop and where CI runs them. `visuals/tampines-food/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/tampines-food) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

| File | Role |
| --- | --- |
| `sources.json` | Food guides, official mall directories and nutrition sources |
| `outlets.csv` | Every outlet two or more publishers recommend, with its guides, one signature dish and that dish's nutrition reference |
| `directories.csv` | Food & Beverage listings of the three malls with an official directory |
| `yeo2021.csv` | Yeo et al. (2021) Tables 1-6, transcribed |
| `fndds.csv` | The FNDDS rows `outlets.csv` uses, written by `extract_fndds.py` from the FoodData Central download |
| `map.json` | Attributed, projected OSM geometry |
| `report.js` | The page's numbers as a beamdswitch report |
| `beamdswitch.js` | The site's standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js` |
| `build.py` | Ranks the outlets, writes `raw.json` (published as `data.json`) and rewrites the dataset, template and report blocks of `index.html` |

Tests live in `tests/` of yujieteo/tampines-food: `tests/tampines-food-beamdswitch.test.mjs` and `tests/test_tampines_food.py`.

## Build, test and verify

Run from the root of a yujieteo/tampines-food checkout (Python 3 standard library and Node 22; nothing to install), as CI (`.github/workflows/ci.yml`) does:

```sh
python3 build.py           # regenerate raw.json and the generated blocks of index.html
python3 build.py --verify  # check both are fresh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

`build.py` rewrites only the `dataset`, `beamdswitch` and `report` script blocks of `index.html`; edit the rest of the page directly. Rerun `python3 extract_fndds.py <FoodData Central survey zip>` only when `outlets.csv` names a new FNDDS food (its docstring gives the download).

## Change workflow

Change and test this repository first, end to end (open `index.html` in a browser, filter, open an outlet, save the deck), and run no-mistakes here; then port the page files byte for byte into `visuals/tampines-food/` of yujieteo/site, where a second no-mistakes run covers only the site's own tests. Logic tests stay here; never add them to the site.

## Conventions

- `index.html` is one self-contained HTML file with its CSS, JavaScript and data inlined; it makes no external requests.
- Calorie figures are estimates for reference dishes, not measurements of an outlet's food; a dish without a fixed portion stays unestimated, with its reason.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template and declares `voice: bf_emma` in its front matter.
