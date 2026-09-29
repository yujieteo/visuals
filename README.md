# Visuals

Self-contained, source-backed data visualizations. Each page tells one focused
story from a dataset committed under `data/`, and every page is a single
standalone HTML file with its CSS, data, and JavaScript inlined.

## Quick start

Python 3 standard library only; there is nothing to install. Open `index.html`
(the gallery) or any `viz/<slug>/index.html` directly in a browser, then:

```sh
# verify every builder against the committed data and pages (writes nothing)
for s in scripts/build*.py; do python3 "$s" --verify || break; done
```

## Repository layout

| Path | Role |
| --- | --- |
| `data/<slug>/raw.csv` or `raw.json` | The unchanged source data for one visualization. |
| `data/<slug>/meta.json` | Source label or URL, ISO fetch date, and whether a key file was used. |
| `scripts/build*.py` | Dependency-free Python builders and verifiers. |
| `scripts/gallery.py` | Shared helper that rebuilds the root gallery from every `viz/*/index.html`. |
| `viz/<slug>/index.html` | Generated standalone visualization page. |
| `index.html` | Generated root gallery that links the visualization pages. |
| `design-tokens.json` | Shared colors, spacing, radius, and fonts used by the builders. |
| `SKILLS.md` | Agent router: maps task types to the focused sub-skills below. |
| `.agents/skills/visuals-*/SKILL.md` | Sub-skills loaded on demand: new visualization, refresh data, page conventions, verify and CI. |
| `CONTRIBUTING.md` | Human contributor guide. |
| `.github/workflows/verify.yml` | CI that runs every verifier on push and pull requests. |

## Visualizations

| Slug | Builder | Story |
| --- | --- | --- |
| `airbnb` | `scripts/build_stock_cases.py` | Airbnb cash conversion |
| `arm` | `scripts/build_stock_cases.py` | Arm cash conversion |
| `breeden-litzenberger-density` | `scripts/build_breeden_litzenberger_density.py` | The risk-neutral density is the curvature of the call-price curve |
| `convex-payoffs` | *(none committed)* | Find a convex 15-minute bet |
| `energy-email-productivity` | `scripts/build_energy_email_productivity.py` | Your energy dips mid-afternoon; your inbox doesn't |
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
regenerate. The root gallery is rebuilt from `viz/*/index.html` by the shared
`render_gallery()` in `scripts/gallery.py`, which every builder imports. The
builders are the source of
truth for page content.

## Generation

Builders use only the Python standard library, so no install step is required.
Running a builder writes its visualization page and refreshes the root gallery:

```sh
python3 scripts/build_stock_cases.py          # 4 stock pages + gallery
python3 scripts/build_breeden_litzenberger_density.py  # breeden-litzenberger-density
python3 scripts/build_ges.py                  # graduate-employment-survey
python3 scripts/fetch_haze.py                 # optional: refresh haze-singapore raw data
python3 scripts/build_haze_singapore.py       # haze-singapore
python3 scripts/build_manchester_city_finances.py
python3 scripts/build_singapore_covid_governance_hindsight.py
python3 scripts/build_social_values.py
python3 scripts/build_energy_email_productivity.py
python3 scripts/build.py                      # tourist-attractions
```

See `CONTRIBUTING.md` for adding a visualization. Agents start at `SKILLS.md`,
which routes to the story-first workflow in
`.agents/skills/visuals-new-visualization/SKILL.md`.

## Verification

Every builder has a `--verify` mode that re-reads the committed source data,
rebuilds the in-memory model, and asserts the committed HTML and metadata match.
`--verify` never writes files, so it is safe to run anywhere:

```sh
python3 scripts/build.py --verify
python3 scripts/build_breeden_litzenberger_density.py --verify
python3 scripts/build_ges.py --verify
python3 scripts/build_haze_singapore.py --verify
python3 scripts/build_manchester_city_finances.py --verify
python3 scripts/build_singapore_covid_governance_hindsight.py --verify
python3 scripts/build_social_values.py --verify
python3 scripts/build_energy_email_productivity.py --verify
python3 scripts/build_stock_cases.py --verify
```

Each verifier checks the story's invariants, the embedded data tables, the
read-only tool registrations, and (where applicable) that the page has no
external assets. `.github/workflows/verify.yml` runs every command above on every
push and pull request.
