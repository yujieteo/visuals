# Queue time

No build step: edit `index.html` directly. `queue-time-engine` is the pure core (`self.QueueTime`, with the seeded queue simulation: no DOM, storage, clock or network, so 400 runs with a fixed seed give the same numbers for the same inputs), `queue-time-ui` the page and WebMCP tools, and `beamdswitch` the inlined `beamdswitch.js`.

`tests/queue-time.test.mjs` checks the estimator and its edge cases, rounding, comparison wording, back-estimation, timers, food ranges, `raw.json` against the engine, the WebMCP tools and the deck buttons. Rules for every visual: [SKILLS.md](../../SKILLS.md).
