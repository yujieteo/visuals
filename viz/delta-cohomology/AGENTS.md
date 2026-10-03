# Δ-Complex Cohomology Visualiser

No build step: edit `index.html`. `<script id="delta-cohomology-engine">` is the pure core (`self.DeltaCohomology`: no DOM, storage, clock, randomness or network); the model is in [README.md](README.md).

After changing the engine's metadata or data, regenerate `raw.json` from it; the test fails when it drifts.

`beamdswitch.js` is the site's template, and the tests pin its SHA-256: when the template changes, copy it here, update that hash in `tests/data-visuals-beamdswitch.mjs` and paste it into `<script id="beamdswitch">`.

The page's Content-Security-Policy forbids network requests; keep it.

Its tests are in `tests/`; `python3 ../../scripts/check.py delta-cohomology` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
