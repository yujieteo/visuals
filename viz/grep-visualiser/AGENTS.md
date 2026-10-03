# Grep Visualiser

No build step: edit `index.html`. `<script id="grep-engine">` is the pure core (`self.GrepViz`: no DOM, storage, clock, randomness or network); matching runs in a Worker built from a Blob of it, with a 1.5 s timeout.

`raw.json` must equal the engine's `META`; the test fails when it drifts.

Keep the Content-Security-Policy (`connect-src 'none'`, `worker-src blob:`). The page exports no beamdswitch deck.

Its tests are in `tests/`; `python3 ../../scripts/check.py grep-visualiser` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
