# Probabilistic method atlas

`index.html` and `raw.json` are built by `node build.mjs` from `template.html`, `src/engine/*.js` (the pure engine, `self.PM`), `src/ui/*.js` and `beamdswitch.js`; edit the sources, never the built files. The engine has no DOM, clock or network, and randomness only from named seeded streams: a module, its parameters and its seed fix every random object, the URL hash carries that state, and exports are byte-identical for the same state. Simulations illustrate; the proofs rest on the displayed inequalities.

`tests/probabilistic-method.test.mjs` covers the build, the engine's mathematics, the inventory, every deck and the page in a stand-in DOM with its WebMCP tools and exports. Rules for every visual: [SKILLS.md](../../SKILLS.md).
