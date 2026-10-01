# Fermi estimator

A back-of-the-envelope estimation tool: break a hard question into a few rough
factors, give each a low, best and high value, and see the estimate, the range
those values imply, which assumption matters most, and whether the answer makes
sense. `index.html` is one self-contained file with no dependencies, no network
requests and no build step; it works from `file://`, offline and inside a
sandboxed iframe, and it shows the method, the patterns and a worked queue
example when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="fermi-engine">` is the pure core (`self.Fermi`): parsing and validation, evaluation with × and ÷ before +, exact range propagation, sensitivity, significant-figure and order-of-magnitude formatting, the log-scale axis, unit cancellation and warnings, the sanity checks, the copy summary, the beamdswitch report and in-source self-tests (`Fermi.selfTest()`, run on the page only with `?selftest`). It has no DOM, storage, clock or network use. `<script id="fermi-ui">` is the page, the remembered estimate (`localStorage`, optional) and the four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. Edit this file directly. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `raw.json` | Catalogue data, published as `data.json`: the default estimate, the examples, the rules and the messages. The page never fetches it; the test says when it has drifted from the engine. |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |

## Model

An estimate is a chain of factors; each factor after the first multiplies,
divides, or starts a new term with +, so the chain is a sum of multiplicative
terms. Every value is zero or positive, which makes the range exact: the lowest
result takes each multiplied factor at its low and each divisor at its high, the
highest result the opposite. Sensitivity moves one factor across its range with
the others at their best values and scores it by |ln(result at high / result at
low)|. Results show about two significant figures, one when the range spans ten
times or more.

## Tests

`tests/fermi.test.mjs` runs with Node's built-in runner (`node --test`). It loads
the engine from `index.html` and covers the spec's technical self-tests
(multiplication, division, addition, precedence, range propagation including the
queue example, division by zero, single values, large and small quantities,
sensitivity ranking, unit formatting), every invalid input, formatting, units,
the sanity checks, the copy summary, `raw.json` and the stub. It also boots the
page in `node:vm` against a stand-in DOM to check the WebMCP tools and that the
beamdswitch and Copy deck buttons export the deck of the page as set, parsed with
beamdswitch's own parser.
