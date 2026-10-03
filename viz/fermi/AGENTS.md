# Fermi estimator

No build step: edit `index.html`. `<script id="fermi-engine">` is the pure core (`self.Fermi`: no DOM, storage, clock or network), with in-source self-tests run on the page with `?selftest`.

`raw.json` must match the engine's default estimate, examples, rules and messages; the test fails when it drifts.

`index.html` stays under 100,000 bytes; the test enforces it.

Its tests are in `tests/`; `python3 ../../scripts/check.py fermi` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
