---
name: generate-visualization
description: Generate or refresh one story-first, dependency-free visualization from a local data file, website, or API response.
---

# Generate visualization

## Privacy and scope

- Never commit credentials, host details, private paths, or deployment configuration.
- Keep the fetched source unchanged in `data/<slug>/raw.csv` or `raw.json`.
- Store only a public source label, an ISO fetch date, and whether a key file was used in `meta.json`.
- Do not edit another repository, push, or deploy unless the current request asks for it.

## Repository layout

- `data/<slug>/` - the unchanged source (`raw.csv` or `raw.json`) plus `meta.json`.
- `scripts/build*.py` - the builder and verifier for one visualization or family. `scripts/fetch_haze.py` refreshes `data/haze-singapore/raw.json` from the public data.gov.sg API. `scripts/build_stock_cases.py` owns four stock slugs.
- `viz/<slug>/index.html` - the generated page.
- `index.html` - the generated root gallery.
- `design-tokens.json` - shared colors, spacing, radius, and fonts.
- `README.md` - repository overview; `SKILLS.md` - this workflow.

## Generated outputs

- Treat `viz/<slug>/index.html` and the root `index.html` as generated artifacts. Never hand-edit them.
- Change the source data, `design-tokens.json`, or the builder, then regenerate.
- `scripts/build.py`, `scripts/build_breeden_litzenberger_density.py`, `scripts/build_ges.py`, `scripts/build_haze_singapore.py`, `scripts/build_manchester_city_finances.py`, `scripts/build_singapore_covid_governance_hindsight.py`, `scripts/build_social_values.py`, and `scripts/build_energy_email_productivity.py` rebuild the gallery from every `viz/*/index.html`. `scripts/build_stock_cases.py` writes a gallery holding its own four cards.
- `convex-payoffs` and `fpl-expected-goals` have no committed builder; their page and data were authored directly.

## Workflow

1. Derive a kebab-case slug from the source. Use `visualization` as the fallback. Never ask for a slug.
2. Fetch or read the source. Read credentials at runtime and never persist them.
3. Save the unchanged source and `meta.json` under `data/<slug>/`.
4. Survey every field before choosing a story. Record its role, cardinality, null rate, and samples. For non-trivial free text, also record lengths, term frequencies, entropy, and near-duplicates. Treat qualifying text as a primary subject. Otherwise use entropy, concentration, and cardinality surprises.
5. Internally enumerate two to four candidates. Each names its question, fields, and representation. Select by surprise, then write one disputable sentence about the data before choosing the representation.
6. Run exactly one critique. Ask, "Is this the most interesting thing in the data, or just the easiest thing to visualize?" If it fails, select one other candidate, then commit. Never abstain.
7. Read `design-tokens.json`. Generate `viz/<slug>/index.html` with exactly one visible key message and one interactive visualization. Inline all CSS, data, and JavaScript. Use no external assets, dependencies, CDN links, or build step. Use compact row arrays, CSV, or TSV for flat data and minimal JSON for hierarchical data. Every interaction must reveal more of the selected story.
8. Register read-only `get_data`, `get_metadata`, and `query` tools when `modelContext` exists. Keep the page functional without it.
9. Regenerate the root gallery by scanning `viz/*/index.html` for each page title and summary.
10. Run the builder twice, then its `--verify` mode. Validate JSON, run `git diff --check`, and inspect all untracked files.
11. Commit only after every check passes. Report the commit, changed files, checks, source date, and limitations.

Stop if the source, required credentials, or requested publication target cannot be resolved safely.

## Verification

Every builder accepts `--verify`, which re-reads the committed data, rebuilds the model in memory, and asserts the committed HTML and `meta.json` match. `--verify` writes nothing.

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

`.github/workflows/verify.yml` runs all eight commands on every push and pull request. Add a new builder to that workflow when you add one to `scripts/`.
