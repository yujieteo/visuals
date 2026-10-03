# TOTO ball frequency

`build.py` counts the draws in `draws.csv`, writes `raw.json` and rewrites only the `dataset`, `beamdswitch` and `report` script blocks of `index.html`; edit the rest of the page directly, then run `python3 build.py`. `python3 refresh.py` shows the new draws from Singapore Pools and `--apply` adds them, then runs `build.py` (it is the only code that touches the network). `beamdswitch.js` is the site's template, unchanged.

Keep the randomness caveat wherever counts are shown or exported.

Its tests are in `tests/`; `python3 ../../scripts/check.py toto-frequency` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
