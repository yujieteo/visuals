# Pigeonhole → Averages

One argument at three levels of abstraction: the pigeonhole principle, the
generalised pigeonhole principle (max nᵢ ≥ ⌈N/k⌉, min nᵢ ≤ ⌊N/k⌋) and the
principle of averages (min xᵢ ≤ x̄ ≤ max xᵢ). A fixed global total forces a
local maximum and a local minimum. One persistent row of containers morphs
from pigeons in boxes to stacked unit cells, to integer bars, to real heights.
`index.html` is one self-contained file with no dependencies, no network
requests and no build step; it works from `file://`, offline and inside a
sandboxed iframe, and it shows the whole chain of theorems and their proofs
when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="pigeonhole-engine">` is the pure core (`self.Pigeonhole`): ⌈N/k⌉ and ⌊N/k⌋ in integer arithmetic, the balanced configuration, the counting obstructions, balancing moves, means, deviations, weighted means and convex combinations, liquid equalisation, the lock-total rule (whole units, so the total is exact), graph degrees, the walking-speed partitions, the convex hull, the examples, scenes and challenges, the beamdswitch report and the self-tests. It has no DOM, storage, clock, randomness or network use. `<script id="pigeonhole-ui">` is the page: the SVG stage and its deterministic, interruptible tweens, the scenes, the command palette, the concept map, the remembered scene, theme and Advanced setting (`localStorage`, optional) and the five read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of yujieteo/site's `templates/beamdswitch.js`. |
| `raw.json` | Catalogue data, published as `data.json`: the scenes, modes, examples, challenges, starting values and the worked bounds. The page never fetches it; the test says when it has drifted from the engine. |
| `AGENTS.md`, `SKILLS.md` | Notes for coding agents changing the tool, and for agents using it. |
| `LICENSE` | MIT. |

## Scenes

The guided journey (Next idea →) runs: ordinary pigeonhole with a
try-to-defeat-it challenge and the counting obstruction; the generalised
principle with N and k; the balanced configuration and the threshold line;
the forced maximum and forced minimum by contradiction; counts becoming real
heights; proof by impossible configuration with a draggable line; liquid
equalisation; deviations from the average; why this is pigeonhole; equality
(weak and strict); and the synthesis animation. Outside the journey: the
theorem constructor and minimax balancing, seven applications (socks, birth
months, exam scores, workload, graph degrees, distances, continuous time),
the Advanced modules (weighted averages with width as weight, centre of mass
and convex combinations, the convex hull), the free-play lab with Preserve
total, and challenges A to D.

Continuous time is labelled as a continuous analogue: each partition of the
walk obeys the finite principle exactly (the interval averages of
v(t) = 5 + 3 sin(πt) average exactly 5 km/h), but passing to the integral
statement is an analysis step, not counting.

Challenge C answers simply yes: a value of 19 against an average of 12 is a
deviation of +7, deviations sum to zero, so some value lies strictly below 12.

## Tests

`tests/pigeonhole.test.mjs` runs with Node's built-in runner (`node --test`).
It loads the engine from `index.html` and covers the self-tests, the bounds
and balanced configurations of every worked example (23/5, 13/4, 25/12,
100/9, 101/10, 31/7), balancing moves reaching ⌈N/k⌉ from any start, the real
example's mean of 4, zero-sum deviations, weighted-average bounds, average
degree = 2|E|/|V|, lock-total preserving the sum exactly, the speed
partitions, the hull, the challenge answers and `raw.json`. It also
boots the page in `node:vm` against a stand-in DOM to visit every scene, check
the WebMCP tools and that the beamdswitch and Copy deck buttons export the
deck of the scene as set, parsed with beamdswitch's own parser.
`tests/data-visuals-beamdswitch.mjs` holds the deck checks and the stand-in
DOM, and `tests/fixtures/beamdswitch/` holds read-only copies of
beamdswitch's deck parser and the site's `templates/beamdswitch.js` and
`templates/beamdswitch-report.md`. The tests and CI live in
[yujieteo/pigeonhole](https://github.com/yujieteo/pigeonhole); the site's
`visuals/pigeonhole/` is a port of the page files without them.
