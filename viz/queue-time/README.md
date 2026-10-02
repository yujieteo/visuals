# Queue time

How long will this queue take? A phone-first estimator for someone standing in
a real queue, with a second mode for food orders. `index.html` is one
self-contained file with no dependencies, no network requests and no build
step; it works from `file://`, offline and inside a sandboxed iframe, and it
shows the rule and a worked example when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="site-theme">` in the head applies the reader's site-wide Light or Dark choice (`localStorage` `theme`) before paint. `<script id="queue-time-engine">` is the pure core (`self.QueueTime`): the seeded queue simulation, wording and rounding, comparison statements, back-estimation of pace, timestamp timers, food ranges, the visible-orders estimate and the beamdswitch report. It has no DOM, storage, clock or network use. `<script id="queue-time-ui">` is the page, the remembered mode and pace preset (`localStorage`, optional) and the four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `raw.json` | Catalogue data, published as `data.json`: the initial state, presets, limits, model constants and assumptions. The page never fetches it; the test says when it has drifted from the engine. |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, how to port to yujieteo/site, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |

## Model

The people ahead wait in line while every open counter is busy. Service times
are gamma-distributed around the pace (shape 3), and whoever is at a counter is
part-way through a length-biased service. You reach a counter when one frees
after everyone ahead has started. 400 runs with a fixed seed give the middle
run ("About") and the 10th to 90th percentiles ("Likely"), so the same inputs
always show the same numbers. With a line per counter only your own counter
serves your line. Food orders compare elapsed time with 0.8 to 1.3 times the
expected wait; an estimate of the time left appears only from orders the
visitor counted finishing, using that rate alone.

## Tests

`tests/queue-time.test.mjs` runs with Node's built-in runner (`node --test`).
It loads the engine from `index.html` and covers the estimator, edge cases
(no people, no counters, 999 people, more counters than people, very fast
service), rounding, comparison wording, back-estimation, timers across a
simulated pause, food ranges and visible orders, `raw.json` and the stub. It
also boots the page in `node:vm` against a stand-in DOM to check the WebMCP
tools and that the beamdswitch and Copy deck buttons export the deck of the
page as set, parsed with beamdswitch's own parser.
