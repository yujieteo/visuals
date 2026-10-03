# Frequency-response visualiser

No build step: edit `index.html` directly. `fr-engine` is the pure core (`self.FreqResponse`: no DOM, storage, clock or randomness; the linear-algebra kernel is hand-written) and `fr-ui` the page, plots and WebMCP tools. `raw.json` must equal the engine's `META` and `defaultInputs()`. Files hold canonical units (rad/s, seconds, absolute magnitude, degrees); display toggles change only what is shown. The page keeps its permanent "exploration only" banner, and every export repeats it.

`tests/frequency-response.test.mjs` loads the engine from the page, runs its self-tests and further analytic checks, and exercises the WebMCP tools. Rules for every visual: [SKILLS.md](../../SKILLS.md).
