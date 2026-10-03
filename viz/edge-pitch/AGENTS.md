# Fastener edge margin and pitch visualiser

`index.html` is assembled by `build.py` from `template.html`, `engine.js` (the pure calculation core, `EdgePitch`, with the self-test and the joint's beamdswitch report; no DOM access) and `raw.json`; never edit or hand-merge it.

The page keeps its permanent “Not for certification” banner, and every export repeats it.

Numeric defaults carry a source tag (`Niu`, NASA RP-1228 or “unsourced default”); keep the tags honest.

Its tests are in `tests/`; `python3 ../../scripts/check.py edge-pitch` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
