# Phasor and Impedance Visualiser

No build step: edit `index.html`. `<script id="ph-engine">` is the pure core (`self.Phasors`): it makes no DOM, storage, clock, randomness, `Intl` or locale calls, so its report and deck are byte-for-byte deterministic. It builds the beamdswitch deck itself.

`raw.json` must equal the engine's `META` and `defaultInputs()`; the test fails when it drifts. `index.html` stays under 120 KB; the test enforces it.

Files hold canonical units only: Ω, H, F, Hz, V (RMS) and degrees.

Its tests are in `tests/`; `python3 ../../scripts/check.py phasors` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
