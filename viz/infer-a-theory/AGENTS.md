# Infer a Theory

No build step: edit `index.html`. `<script id="infer-a-theory-engine">` is the pure core (`self.InferTheory`: no DOM, storage, clock, randomness or network), so results are deterministic; `<script id="infer-a-theory-phrases">` holds the probability-language data.

`raw.json` must match the engine (the test fails when it drifts), and the embedded phrase data must equal `probly.csv`, the survey answers as published (zonination/perceptions at commit `5120706`), which the site publishes beside the page.

A Content-Security-Policy forbids network requests; keep it.

Its tests are in `tests/`; `python3 ../../scripts/check.py infer-a-theory` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
