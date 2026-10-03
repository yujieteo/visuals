# Mohr's Circle Visualiser

No build step: edit `index.html`. `<script id="mohr-engine">` is the numeric core (`self.Mohr`: no DOM, storage, clock or randomness) and `<script id="mohr-beamdswitch">` is `beamdswitch.js` inlined; `raw.json` must equal the engine's `META` and `toJSON(defaultState())`, and the test says when it drifts.

Stress is stored in MPa, tension positive; strain is dimensionless with tensor shear. Display, input and export convert.

When the site's `templates/beamdswitch.js` changes, copy it to both `beamdswitch.js` and `tests/fixtures/beamdswitch/template.js` and paste it into `<script id="mohr-beamdswitch">`.

Its tests are in `tests/`; `python3 ../../scripts/check.py mohr` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
