# AGENTS.md: Convexity Action Engine

A searchable decision engine for everyday actions: press Ctrl/⌘ K, type what you are considering, and see it in your Singapore context, screened for ruin first and then compared on payoff shape against opportunity-cost alternatives. Live at <https://teoyujie.org/visuals/convexity-action-engine/>.

## Source of truth

The standalone repository [yujieteo/convexity-action-engine](https://github.com/yujieteo/convexity-action-engine) is where this visualisation and its tests develop and where CI runs them. `visuals/convexity-action-engine/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/convexity-action-engine) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

| File | Role |
| --- | --- |
| `ontology.txt` | The action ontology, one canonical action per line (author judgement) |
| `author.py` | Writes `raw.json` from `ontology.txt`, every number an ordinal author judgement |
| `raw.json` | The dataset (published as `data.json`) |
| `derive_atus.py` | Derives `atus_observed.csv` from American Time Use Survey microdata (needs pandas and rdata, and a CRAN `atus` checkout) |
| `atus_observed.csv` | Observed ATUS participation and duration per code |
| `engine.js` | The pure decision engine |
| `beamdswitch.js` | The site's standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js` |
| `build.py` | Writes `index.html` and the spreadsheet views `actions.csv`, `aliases.csv` and `sources.csv`; `--verify` checks they are fresh |
| `meta.json` | Catalogue metadata (slug, date and assumptions); `build.py` embeds the date and assumptions and checks the counts they quote against `raw.json` |
| `design-tokens.json` | The colours and type `build.py` writes into the page's CSS |
| `index.html` | Generated: never edit it by hand |

Tests live in `tests/` of yujieteo/convexity-action-engine: `tests/convexity-action-engine.test.mjs`, `tests/convexity-action-engine-beamdswitch.test.mjs` and `tests/test_convexity_action_engine.py`.

## Build, test and verify

Run from the root of a yujieteo/convexity-action-engine checkout (Python 3 standard library and Node 22; nothing to install):

`author.py` (and so `build.py`, which imports it) reads `drm_table1.csv` and `evidence.json` from the sibling folder `../everyday-actions/`: check out [yujieteo/everyday-actions](https://github.com/yujieteo/everyday-actions) beside this repository (in yujieteo/site the two folders are already siblings under `visuals/`). The tests carry read-only copies in `tests/fixtures/everyday-actions/`.

```sh
python3 author.py          # after editing author.py
python3 build.py           # regenerate index.html and the CSVs
python3 build.py --verify  # check they are fresh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

CI (`.github/workflows/ci.yml`) runs the last two commands on Node 22 and Python 3.13 for every push to `main` and every pull request.

## Porting to yujieteo/site

Change and test this repository first, then port it; the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the full workflow.

1. Run the suite above, check the page end to end in a browser (load `index.html`, use what changed, call the WebMCP tools and the exports), and run no-mistakes here.
2. Copy this repository minus `tests/` and `.github/`, byte for byte, into `visuals/convexity-action-engine/` of yujieteo/site, and run no-mistakes again on that pull request, which runs only the site-level tests. Never add logic tests to the site; its test cost must stay flat.

## Conventions

- `index.html` is one self-contained HTML file with its CSS, JavaScript and data inlined; it makes no external requests (source URLs are citations only).
- Label every number as judgement, model or personal, as the page does; do not present a judgement as a measurement.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template and declares `voice: bf_emma` in its front matter.
