# From Packets to Playback

No build step: edit `index.html`. `<script id="packets-to-playback-engine">` is the pure core (`self.PacketsPlayback`: no DOM, storage, clock or network); every trace comes from a fixed seed.

`raw.json` must match the engine; the test fails when it drifts. `index.html` stays at about 200 kB or less; the test enforces it.

Its tests are in `tests/`; `python3 ../../scripts/check.py packets-to-playback` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
