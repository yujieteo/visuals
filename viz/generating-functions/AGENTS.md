# Generating functions lab

`index.html` is built by `python3 build.py` from `template.html`, `raw.json`, `engine.js` (the exact core, `self.GF`), `lessons.js` (curriculum, problems, verification and decks, `self.GFLab`), `beamdswitch.js` and `ui.js` (the page and WebMCP tools); never hand-edit it. After changing `lessons.js`, run `node raw.mjs > raw.json` before building.

Counting is exact (BigInt, rationals, ℤ[ζ_N]); floating point is only for pictures and asymptotics. OGF A(x) = Σ aₙxⁿ, EGF Σ aₙxⁿ/n!, F₀ = 0, and the DFT uses ω = e^{+2πi/N}, so numpy's `fft` entry k is entry N − k here. The tests check the mathematics against independent enumerations, every deck with beamdswitch's parser, every route in a stand-in DOM with the WebMCP tools, and the build's reproducibility. Rules for every visual: [SKILLS.md](../../SKILLS.md).
