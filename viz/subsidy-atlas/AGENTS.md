# Subsidy Atlas

`author.py` is the curated data source and writes `raw.json`; `build.py` inlines it with `style.css`, the design tokens in `site-tokens.css`, `engine.js` and `beamdswitch.js` (the site's template, unchanged) into `index.html`: never hand-edit it. After editing the evidence run `python3 author.py`, then `python3 build.py`.

Every factual claim carries source ids and every forecast `speculative: true`; never infer a per-token subsidy from company losses. [README.md](README.md) gives the evidence rules.

Its tests are in `tests/`; `python3 ../../scripts/check.py subsidy-atlas` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
