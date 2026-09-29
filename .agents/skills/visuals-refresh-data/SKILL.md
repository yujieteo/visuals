---
name: visuals-refresh-data
description: Refresh source data or regenerate an existing visualization page or the root gallery in the visuals repo.
---

# Refresh or regenerate

Builders are dependency-free (`python3 scripts/<builder>`). Running without `--verify` writes the page and rebuilds the root gallery from every `viz/*/index.html` — except `build_stock_cases.py`, which overwrites the root `index.html` with only its own four cards; run twice and confirm the second run changes nothing (`git diff --stat`).

| Slug(s) | Builder |
| --- | --- |
| `airbnb`, `arm`, `marvell`, `panw` | `build_stock_cases.py` (overwrites the root `index.html` with only its own four cards, not the full gallery) |
| `breeden-litzenberger-density` | `build_breeden_litzenberger_density.py` |
| `energy-email-productivity` | `build_energy_email_productivity.py` |
| `graduate-employment-survey` | `build_ges.py` |
| `haze-singapore` | `fetch_haze.py` (refreshes `raw.json` from data.gov.sg), then `build_haze_singapore.py` (also rewrites its README table row) |
| `manchester-city-finances` | `build_manchester_city_finances.py` |
| `singapore-covid-governance-hindsight` | `build_singapore_covid_governance_hindsight.py` |
| `social-values-surveydata` | `build_social_values.py` |
| `tourist-attractions` | `build.py` |
| `convex-payoffs`, `fpl-expected-goals` | none: edit page and data directly |

Rules:
- Keep fetched source unchanged; update `fetched` in `data/<slug>/meta.json`.
- Editorial text in some builders is derived from the numbers, so a data refresh may rewrite claims; check the diff of the page.
- The README slug/builder/story table is parsed by `build_haze_singapore.py`: keep its header `| Slug | Builder | Story |` and one `` | `slug` | `` row per line, sorted.
- `build_stock_cases.py` overwrites the root `index.html` with only its four cards; re-run another builder such as `python3 scripts/build.py` afterwards to restore the full gallery before running the verify loop.
- Finish with `.agents/skills/visuals-verify-ci/SKILL.md`.
