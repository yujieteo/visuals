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
| `viz/<slug>/AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and MIT licence inside each folder ported from a standalone `yujieteo/<repo>` repository (listed in `tests/test_mirror_docs.py`), where the visualization and its tests develop; the folder is that repository minus `tests/` and `.github/`, with data files under `data/<slug>/`. |
| `viz/<slug>/beamdswitch.js`, `viz/<slug>/report.js` | Sources a builder inlines for a page's narrated beamdswitch deck: the site's unchanged report template and that page's report. |
| `index.html` | Generated root gallery that links the visualization pages. |
| `design-tokens.json` | Shared colors, spacing, radius, and fonts used by the builders. |
| `SKILLS.md` | Agent router: maps task types to the focused sub-skills below. |
| `.agents/skills/visuals-*/SKILL.md` | Sub-skills loaded on demand: new visualization, refresh data, page conventions, verify and CI. |
| `CONTRIBUTING.md` | Human contributor guide. |
| `tests/` | Repository-level checks: mirror docs, the beamdswitch-deck sweep, and the stale action copies' regression tests. |
| `.github/workflows/verify.yml` | CI that runs every verifier and test on push and pull requests. |
| `.no-mistakes.yaml` | Pins the no-mistakes test step to the same commands as CI. |

## Visualizations

| Slug | Builder | Story |
| --- | --- | --- |
| `airbnb` | `scripts/build_stock_cases.py` | Airbnb cash conversion |
| `arm` | `scripts/build_stock_cases.py` | Arm cash conversion |
| `breeden-litzenberger-density` | `scripts/build_breeden_litzenberger_density.py` | The risk-neutral density is the curvature of the call-price curve |
| `convex-payoffs` | *(none committed)* | Find a convex 15-minute bet |
| `convexity-action-engine` | `scripts/build_convexity_action_engine.py` | Search everyday actions, screen for ruin, compare payoff shape and opportunity cost |
| `energy-email-productivity` | `scripts/build_energy_email_productivity.py` | Your energy dips mid-afternoon; your inbox doesn't |
| `english-grammar` | `scripts/build_english_grammar.py` | How English Grammar Works: category, function and structure, following CGEL |
| `everyday-actions` | `scripts/build_everyday_actions.py` | Compare activity frequency and experienced affect, with a source for every plotted value |
| `fpl-expected-goals` | *(none committed)* | How much of the early FPL points are repeatable? |
| `graduate-employment-survey` | `scripts/build_ges.py` | The computing salary premium widened |
| `haze-singapore` | `scripts/build_haze_singapore.py` | Where and when Singapore's air turned hazy |
| `manchester-city-finances` | `scripts/build_manchester_city_finances.py` | What Manchester City's charges and accounts do and do not show |
| `marvell` | `scripts/build_stock_cases.py` | Marvell cash conversion |
| `multi-armed-bandit` | `scripts/build_multi_armed_bandit.py` | Choose the next trial with Thompson Sampling and UCB1, and see how they explore |
| `ooda-orientation` | `scripts/build_ooda_orientation.py` | Orient: destroy the wrong model, act from the better one |
| `panw` | `scripts/build_stock_cases.py` | Palo Alto Networks cash conversion |
| `singapore-covid-governance-hindsight` | `scripts/build_singapore_covid_governance_hindsight.py` | What did 2020 Singapore analyses say? |
| `social-values-surveydata` | `scripts/build_social_values.py` | Connection rises as appetite to shape the future falls |
| `tampines-food-map` | `scripts/build_tampines_food_map.py` | Where to eat in Tampines hub: top 20 places, reviews and calories |
| `tourist-attractions` | `scripts/build.py` | How Singapore attractions are marketed |
| `vgc-protect-fakeout-pivot-trainer` | `scripts/build_vgc_protect_fakeout_pivot_trainer.py` | Win the turn: Protect, Fake Out and pivots |

`convex-payoffs` and `fpl-expected-goals` have no builder in `scripts/`: they are
edited in their standalone repositories and ported unchanged, so they are not
covered by the verifier suite. `convexity-action-engine`, `everyday-actions`,
`tampines-food-map` and `vgc-protect-fakeout-pivot-trainer` (`EXCLUDED` in
`tests/test_mirror_docs.py`) are stale copies; their current versions live in
yujieteo/site `visuals/`.

## Generated outputs

`viz/<slug>/index.html` and the root `index.html` gallery are generated. Do not
hand-edit them: change the data, `design-tokens.json`, or the builder, then
regenerate. The root gallery is rebuilt from `viz/*/index.html` by the shared
`render_gallery()` in `scripts/gallery.py`, which every builder imports. The
builders are the source of truth for page content.

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
python3 scripts/build_english_grammar.py           # english-grammar
python3 scripts/build_multi_armed_bandit.py        # multi-armed-bandit
python3 scripts/build_ooda_orientation.py          # ooda-orientation
python3 scripts/build_convexity_action_engine.py
python3 scripts/build_everyday_actions.py
python3 scripts/build_vgc_protect_fakeout_pivot_trainer.py
python3 scripts/build_tampines_food_map.py        # tampines-food-map
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
python3 scripts/build_english_grammar.py --verify
python3 scripts/build_multi_armed_bandit.py --verify
python3 scripts/build_ooda_orientation.py --verify
python3 scripts/build_convexity_action_engine.py --verify
python3 scripts/build_everyday_actions.py --verify
python3 scripts/build_vgc_protect_fakeout_pivot_trainer.py --verify
python3 scripts/build_tampines_food_map.py --verify
python3 scripts/build_stock_cases.py --verify
```

The copied action visualizations also retain their source regression tests.
The 17 folders ported from a standalone `yujieteo/<repo>` repository (listed in
`tests/test_mirror_docs.py`) keep their logic, deck and WebMCP tests in that
repository, whose CI runs them; here they are checked only by their builders'
`--verify` and by a sweep that keeps the set of pages exporting a beamdswitch
deck known:

```sh
python3 -m unittest discover -s tests -p 'test_*.py'
node --test tests/convexity-action-engine.test.mjs tests/everyday-actions.test.mjs tests/voice-beamdswitch.test.mjs
```

Pages with a narrated beamdswitch report (the beamdswitch and Copy deck buttons)
keep `viz/<slug>/beamdswitch.js`, an unchanged copy of the site's
`templates/beamdswitch.js`, and `viz/<slug>/report.js`, which builds the report
from the page's own data; the page inlines both. `energy-email-productivity`,
`fpl-expected-goals`, `manchester-city-finances`, `graduate-employment-survey`,
`haze-singapore`, `singapore-covid-governance-hindsight`,
`social-values-surveydata`, `tourist-attractions`, the four stock pages, whose
report lives in `scripts/templates/stock-cases-report.js`,
`breeden-litzenberger-density` and `convex-payoffs` offer the same narrated
report for [beamdswitch](https://teoyujie.org/visuals/beamdswitch/): the
beamdswitch button saves the view shown as a Markdown deck, and Copy deck puts
the same deck on the clipboard. `english-grammar` offers both buttons on every
concept page, and its deck is that lesson: the concept, its main example and
analysis, the explanation and its contrasts. `ooda-orientation` offers both
buttons once a situation exists; its deck walks the situation along its current
lineage, from the reality ledger through destruction and the candidates to the
action, its frozen prediction and what happened. `multi-armed-bandit` offers the same
deck as Save deck and Copy deck: the experiment, its assumptions, both methods, the
evidence and recommendations with their displayed scores, the simulation once it
has run, and the next step.

## Action visualization provenance

`convexity-action-engine` and `everyday-actions` were copied from the committed
[yujieteo/site sources at 92159781](https://github.com/yujieteo/site/tree/92159781b66f340d77d34973c02461615cdb8578/visuals).
The originals remain in that repository. Source inputs and derived CSV/JSON
are unchanged; the builders now use this repository's `data/` and `viz/`
layout and refresh the shared gallery. Everyday actions uses a maintainable
HTML template in `scripts/templates/` with the dataset inserted at build time.
The copies retain their original styling, including the engine's design-token
snapshot and everyday actions' dark theme, rather than changing their UI.

The engine's `data/convexity-action-engine/author.py` regenerates `raw.json`
using its ontology, ATUS aggregates, and the DRM table and evidence shared with
`data/everyday-actions/`. Both `derive_atus.py` scripts are retained for optional
microdata rederivation; normal builds and tests need no network or credentials.
Metadata dates describe the source visualization, not a new survey or fetch.
Source regression tests were adapted only for the new layout and standalone
publication (there is no site deployment copy to test here).

Each verifier checks the story's invariants, the embedded data tables, and
(where applicable) that the page has no external assets. The Node tests run each
action page's emitted scripts and check its read-only tool registrations, and
run each deck page's scripts to check its beamdswitch decks.
`.github/workflows/verify.yml` runs every command above on every push and pull
request.
