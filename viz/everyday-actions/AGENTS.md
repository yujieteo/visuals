# Everyday Actions

`build.py` writes `data.csv` (the published data) and `sources.json` and rewrites the dataset, template and report blocks of `index.html` from `drm_table1.csv` (Kahneman et al. 2004, Table 1), `atus_estimates.csv`, `crosswalk.csv`, `decisions.csv`, `evidence.json` and `report.js`. `derive_atus.py` rederives `atus_estimates.csv` from ATUS microdata (needs pandas and rdata); `methodology.md` says how the numbers were derived.

Empty means not measured: never fill a missing value. The authored codes in `decisions.csv` stay labelled as codes, not measurements.

Its tests are in `tests/`; `python3 ../../scripts/check.py everyday-actions` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
