# Information gain

No build step: edit `index.html`. `<script id="information-gain-engine">` is the pure core (`self.InformationGain`: no DOM, storage, clock or network); `<script id="information-gain-phrases">` holds the probability-language data, which a test checks against `probly.csv` (zonination/perceptions at commit `51207062`).

`raw.json` must match the engine; the test fails when it drifts.

The page's own code stays under 100,500 bytes, not counting the embedded phrase data and the beamdswitch template; the test enforces it.

Its tests are in `tests/`; `python3 ../../scripts/check.py information-gain` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
