# AGENTS.md: Everyday Actions

Everyday activities plotted by how often people do them (ATUS 2014-2016) and how they feel doing them (Kahneman et al. 2004), with 100 common actions placed on regret, downside, upside and information axes. Live at <https://teoyujie.org/visuals/everyday-actions/>.

## Source of truth

The standalone repository [yujieteo/everyday-actions](https://github.com/yujieteo/everyday-actions) is where this visualisation and its tests develop and where CI runs them. `visuals/everyday-actions/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/everyday-actions) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

| File | Role |
| --- | --- |
| `drm_table1.csv` | Transcription of Kahneman et al. (2004), Science 306:1777, Table 1 |
| `atus_estimates.csv` | Output of `derive_atus.py` (ATUS 2014-2016 microdata) |
| `derive_atus.py` | Derives `atus_estimates.csv` from a CRAN `atus` checkout (needs pandas and rdata) |
| `crosswalk.csv` | Activity ↔ DRM row ↔ ATUS tier codes |
| `decisions.csv` | 100 actions with authored ordinal codes (not measurements) |
| `evidence.json` | Studies cited by `decisions.csv` and the reconsideration section |
| `methodology.md` | How the numbers were derived |
| `report.js` | The page's axes and current view as a beamdswitch report |
| `beamdswitch.js` | The site's standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js` |
| `build.py` | Writes `data.csv` and `sources.json` and rewrites the dataset, template and report blocks of `index.html` |
| `data.csv` | Generated: one row per activity, missing values empty (the published data file) |
| `sources.json` | Generated: the citations plus one record per number shown in the graph |

Tests live in `tests/` of yujieteo/everyday-actions: `tests/everyday-actions-beamdswitch.test.mjs`, `tests/site-theme.test.mjs` and `tests/test_everyday_actions.py`.

## Build, test and verify

Run from the root of a yujieteo/everyday-actions checkout (Python 3 standard library and Node 22; nothing to install):

```sh
python3 build.py   # regenerate data.csv, sources.json and index.html
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

CI (`.github/workflows/ci.yml`) runs the last two commands on Node 22 and Python 3.13 for every push and pull request.

## Porting to yujieteo/site

Change and test this repository first, then port it; the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the full workflow.

1. Run the suite above, check the page end to end in a browser (load `index.html`, use what changed, call the WebMCP tools and the exports), and run no-mistakes here.
2. Copy this repository minus `tests/` and `.github/`, byte for byte, into `visuals/everyday-actions/` of yujieteo/site, and run no-mistakes again on that pull request, which runs only the site-level tests. Never add logic tests to the site; its test cost must stay flat.

## Conventions

- `index.html` is one self-contained HTML file with its CSS, JavaScript and data inlined; it makes no external requests.
- Empty means not measured: never fill a missing value. Authored codes in `decisions.csv` stay labelled as codes, not measurements.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template and declares `voice: bf_emma` in its front matter.
