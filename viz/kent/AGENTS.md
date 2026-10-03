# Kent: Words of Estimative Probability

No build step: edit `index.html`. `<script id="kent-engine">` is the pure core (`self.Kent`: no DOM, storage, clock or network); the page keeps its state in `localStorage` (`kent:v1`). The layout is in [README.md](README.md).

Probabilities are percentages from 0 to 100. A Kent anchor is a representative point; a band is the region a word covers; gaps between bands are named as gaps.

Analytic confidence is never combined with probability, simulated readers are always labelled as generated, and the forecast ledger is append-only.

Its tests are in `tests/`; `python3 ../../scripts/check.py kent` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
