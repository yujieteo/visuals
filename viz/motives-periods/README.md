# Motives and periods

A small interactive lab for periods of mixed Tate motives. `index.html` is one self-contained file
with no dependencies, no network access and no build step. Live at
<https://teoyujie.org/visuals/motives-periods/>.

It asks Marcolli’s question, whether residues of Feynman integrals are periods of mixed Tate motives,
and works up to an answer for the smallest graphs through three examples:

1. **2πi, the period of the Tate motive.** Drag the centre of a loop and watch the Riemann sum of
   ∮ dz/z converge to 2πi times the winding number. The motive panel splits h(P¹) = 𝟏 ⊕ 𝟏(−1) and
   counts points of P¹ and G_m over F_q, which reads 𝐋 as q.
2. **ζ(3) and multiple zeta values.** Enter a composition (s₁, …, s_k): the page draws its word in
   dt/t and dt/(1 − t), the dual word, evaluates both by Hölder convolution to double precision,
   compares the slowly converging plain sum, writes even ζ(2n) exactly as a rational multiple of
   (2πi)²ⁿ, and counts compositions against Zagier’s dimensions d_k.
3. **Feynman periods of the wheels.** Choose the one-loop bubble or a wheel WS₃ = K₄ … WS₆: the page
   says whether it is a φ⁴ graph (WS₅ and WS₆ are not: the hub has degree n > 4, though their
   periods follow the same wheel formula), writes the Kirchhoff polynomial Ψ (one monomial per
   spanning tree), the period
   C(2n − 2, n − 1) ζ(2n − 3), an independent position-space quadrature of P(K₄) that converges to
   6ζ(3), and the number of zeros of Ψ over F_q (q⁵ + q³ − q² for K₄).

Every statement on the page carries its sources, listed at the foot of the page and in
`get_metadata`. Each example has a derivation, exercises (predict first, then check), JSON export and
import, Markdown export and a narrated beamdswitch deck. The URL fragment holds the example and its
parameters, so links, Back and Forward work. A self-test runs on every load and shows a badge.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="motives-periods-engine">` is the pure engine (`self.MotivesPeriods`: sources, claims, exact BigInt rationals, the loop integral, point counts, multiple zeta values, graph polynomials, the K₄ quadrature, state, exports and the self-test; no DOM, storage, clock, randomness or network). `<script id="motives-periods-beamdswitch">` is `beamdswitch.js` inlined. `<script id="motives-periods-ui">` is the page and its WebMCP tools. Edit this file directly. |
| `beamdswitch.js` | The site’s standard beamdswitch report template, an unchanged copy of `templates/beamdswitch.js` in yujieteo/site; paste it into `<script id="motives-periods-beamdswitch">` whenever it changes. |
| `raw.json` | Published as `data.json`: the engine’s `META` (examples, graphs, limits, sources) and the default state as exported JSON; must equal `{ meta: META, example: toJSON(defaultState()) }`. |

The tests run with Node’s built-in runner (`node --test 'tests/*.test.{mjs,cjs}'`).
`tests/motives-periods.test.mjs` holds the model tests: Bernoulli numbers and the even zeta
coefficients exactly, ζ(3), ζ(5), ζ(7), ζ(9) against 20-digit references, ζ(5, 3) against an
independent direct sum, duality for every admissible composition up to weight 8, the stuffle product
and the sum theorem, the loop integral in closed form, spanning-tree counts against Lucas numbers, the
wheel periods, the Bloch–Wigner dilogarithm and the convergence of the K₄ quadrature to 6ζ(3), the
point counts (K₄ also at q = 11, beyond the page), state validation and round trips, the claims and
sources, the Markdown export, the no-JavaScript text and the WebMCP tools in a stand-in DOM.
`tests/beamdswitch.test.mjs` parses the decks with beamdswitch’s own parsers (read-only copies in
`tests/fixtures/beamdswitch/`). `tests/motives-periods-page.test.mjs` drives the page in headless
Chrome from `file://`.

The K₄ point count q⁵ + q³ − q² was fitted from q = 2, 3, 5, 7, 11, 13 and confirmed at q = 17 and 19
when the page was built; the page counts q ≤ 7 live and the tests count q = 11.
