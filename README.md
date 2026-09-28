# Visuals

Self-contained, source-backed data visualizations. Each page tells one focused
story from a dataset committed under `data/`, and every page is a single
standalone HTML file with its CSS, data, and JavaScript inlined.

## Repository layout

| Path | Role |
| --- | --- |
| `data/<slug>/raw.csv` or `raw.json` | The unchanged source data for one visualization. |
| `data/<slug>/meta.json` | Source label or URL, ISO fetch date, and whether a key file was used. |
| `scripts/build*.py` | Dependency-free Python builders and verifiers. |
| `viz/<slug>/index.html` | Generated standalone visualization page. |
| `index.html` | Generated root gallery that links the visualization pages. |
| `design-tokens.json` | Shared colors, spacing, radius, and fonts used by the builders. |
| `SKILLS.md` | Agent workflow for generating or refreshing a visualization. |
| `.github/workflows/verify.yml` | CI that runs every verifier on push and pull requests. |

## Visualizations

| Slug | Builder | Story |
| --- | --- | --- |
| `airbnb` | `scripts/build_stock_cases.py` | Airbnb cash conversion |
| `arm` | `scripts/build_stock_cases.py` | Arm cash conversion |
| `convex-payoffs` | *(none committed)* | Find a convex 15-minute bet |
| `fpl-expected-goals` | *(none committed)* | How much of the early FPL points are repeatable? |
| `graduate-employment-survey` | `scripts/build_ges.py` | The computing salary premium widened |
| `haze-singapore` | `scripts/build_haze_singapore.py` | Where and when Singapore's air turned hazy |
| `manchester-city-finances` | `scripts/build_manchester_city_finances.py` | What Manchester City's charges and accounts do and do not show |
| `marvell` | `scripts/build_stock_cases.py` | Marvell cash conversion |
| `panw` | `scripts/build_stock_cases.py` | Palo Alto Networks cash conversion |
| `singapore-covid-governance-hindsight` | `scripts/build_singapore_covid_governance_hindsight.py` | What did 2020 Singapore analyses say? |
| `social-values-surveydata` | `scripts/build_social_values.py` | Connection rises as appetite to shape the future falls |
| `tourist-attractions` | `scripts/build.py` | How Singapore attractions are marketed |

`convex-payoffs` and `fpl-expected-goals` were authored directly (page and data
committed together) and have no builder in `scripts/`, so they are not covered
by the verifier suite.

## Generated outputs

`viz/<slug>/index.html` and the root `index.html` gallery are generated. Do not
hand-edit them: change the data, `design-tokens.json`, or the builder, then
regenerate. The root gallery is rebuilt from `viz/*/index.html` by
`scripts/build.py`, `scripts/build_ges.py`, `scripts/build_haze_singapore.py`,
`scripts/build_manchester_city_finances.py`,
`scripts/build_singapore_covid_governance_hindsight.py`, and
`scripts/build_social_values.py`; `scripts/build_stock_cases.py` writes a
gallery containing its own four stock cards. The builders are the source of
truth for page content.

## Generation

Builders use only the Python standard library, so no install step is required.
Running a builder writes its visualization page and refreshes the root gallery:

```sh
python3 scripts/build_stock_cases.py          # 4 stock pages + gallery
python3 scripts/build_ges.py                  # graduate-employment-survey
python3 scripts/fetch_haze.py                 # optional: refresh haze-singapore raw data
python3 scripts/build_haze_singapore.py       # haze-singapore
python3 scripts/build_manchester_city_finances.py
python3 scripts/build_singapore_covid_governance_hindsight.py
python3 scripts/build_social_values.py
python3 scripts/build.py                      # tourist-attractions
```

See `SKILLS.md` for the full story-first workflow used to create a new
visualization.

## Verification

Every builder has a `--verify` mode that re-reads the committed source data,
rebuilds the in-memory model, and asserts the committed HTML and metadata match.
`--verify` never writes files, so it is safe to run anywhere:

```sh
python3 scripts/build.py --verify
python3 scripts/build_ges.py --verify
python3 scripts/build_haze_singapore.py --verify
python3 scripts/build_manchester_city_finances.py --verify
python3 scripts/build_singapore_covid_governance_hindsight.py --verify
python3 scripts/build_social_values.py --verify
python3 scripts/build_stock_cases.py --verify
```

Each verifier checks the story's invariants, the embedded data tables, the
read-only tool registrations, and (where applicable) that the page has no
external assets. `.github/workflows/verify.yml` runs all seven commands on every
push and pull request.
