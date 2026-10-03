# Bayesian reasoning in plain English

No build step: edit `index.html` directly. Its blocks are `bayes-data` (the embedded Kent scale, every survey answer and the example scenarios), `bayes-engine` (the pure core, `self.Bayes`: no DOM, storage, clock or network, so Node loads it), `bayes-ui` (the page and the WebMCP tools) and `beamdswitch`, the inlined `beamdswitch.js`. Type annotations go in the page; the size budget in `tests/bayes.test.mjs` leaves out JSDoc blocks.

`tests/bayes.test.mjs` checks the engine's numerical cases and every 0/1 edge case, the embedded answers against `probly.csv` (zonination/perceptions at commit `51207062`, as published), `raw.json` against the page, the static reference rows (the output of `Bayes.staticRows()`: regenerate them when the engine changes), the offline promises, the WebMCP tools and the deck buttons. Rules for every visual: [SKILLS.md](../../SKILLS.md).
