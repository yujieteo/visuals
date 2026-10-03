# Pigeonhole → averages

No build step: edit `index.html` directly. `pigeonhole-engine` is the pure core (`self.Pigeonhole`: no DOM, storage, clock, randomness or network; ⌈N/k⌉ and ⌊N/k⌋ use integer arithmetic), `pigeonhole-ui` the page and WebMCP tools, and `beamdswitch` the inlined `beamdswitch.js`. Every inline script needs an `id`, which names its type-checked copy. The page shows its theorems and proofs with JavaScript off.

`tests/pigeonhole.test.mjs` checks the engine, the worked bounds, `raw.json` against the engine, the offline promises, every scene's deck, the WebMCP tools and the deck buttons; `tests/data-visuals-beamdswitch.mjs` holds the deck checks and the stand-in DOM. Rules for every visual: [SKILLS.md](../../SKILLS.md).
