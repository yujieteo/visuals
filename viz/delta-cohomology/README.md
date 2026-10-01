# Δ-Complex Cohomology Visualiser

An interactive proof that computes simplicial cohomology of S², T² and RP² from
Δ-complexes of two oriented 2-simplices U and L each (with 3, 1 and 2 vertices),
in the order geometry → oriented simplices → boundary maps → coboundary maps
(δᵏ = ∂ₖ₊₁ᵀ) → kernels and images → cohomology. Every matrix entry traces back
to an oriented face. The torus is the default walkthrough.

`index.html` is one self-contained file with no dependencies, no network requests
(a Content-Security-Policy forbids them) and no build step; it works offline and
from `file://`, and shows the result table when JavaScript is off.

| File | Role |
| --- | --- |
| `index.html` | The whole tool, edited directly. `<script id="delta-cohomology-engine">` is the pure core (`self.DeltaCohomology`): the three Δ-complexes as gluing data, the derived boundary matrices, Smith normal form over ℤ and row reduction over 𝔽ₚ, cohomology with generators, cup products by Alexander–Whitney, the self-test and the beamdswitch report; no DOM, storage, clock, randomness or network. `<script id="delta-cohomology-ui">` is the page and its four read-only WebMCP tools. `<script id="beamdswitch">` is `beamdswitch.js` inlined unchanged. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of yujieteo/site's `templates/beamdswitch.js`. |
| `raw.json` | Catalogue data, published as `data.json`: the metadata, the gluing data, the derived matrices and cohomology table, and the matrices and table the specification states. The page never fetches it; `tests/delta-cohomology.test.mjs` says when it has drifted from the engine. |
| `AGENTS.md`, `SKILLS.md` | Notes for coding agents, and how to use the tool and its WebMCP tools. |
| `LICENSE` | MIT. |

## Model

Each space is a unit square P(0,0) Q(1,0) R(1,1) S(0,1) cut along PR into U
(upper-left) and L (lower-right). A triangle lists its corners in Δ-order and its
default orientation; each side lists the edge it is glued to and that edge's
arrow. From these lists alone the engine derives:

- vertex classes, by merging the corners at the same end of every glued edge;
- ∂₂, summing (−1)ⁱ × (face against edge arrow ? −1 : +1) × orientation over the
  faces dᵢ of each triangle; and ∂₁ = head − tail of each edge;
- Hᵏ = ker δᵏ / im δᵏ⁻¹, by a kernel basis of δᵏ, the coordinates of im δᵏ⁻¹ in
  it, and their Smith normal form (free and torsion summands with generators).
  Ranks alone are never used, so H²(RP²; ℤ) comes out as ℤ/2.

The stated matrices are kept only for comparison. S² and T² share their triangle
orders and ∂₂ (∂U = a + b − c, ∂L = −a − b + c, with L's arrow against its vertex
order) and differ only in which sides carry a and b. RP² is Hatcher's: U = [S,P,R],
L = [Q,P,R], a the diagonal loop at w.

## Tests

The tests live in [yujieteo/delta-cohomology](https://github.com/yujieteo/delta-cohomology), where CI
runs them; the site's `visuals/delta-cohomology/` is a port of the page files without `tests/`.

`tests/delta-cohomology.test.mjs` (Node's built-in runner) checks the derived
matrices against the stated ones, ∂₁∂₂ = 0 and δ¹δ⁰ = 0 for every orientation
choice, the cohomology table over ℤ, 𝔽₂ and 𝔽₃ (with the Smith factor 2 checked
independently by determinantal divisors), orientation invariance, the
Alexander–Whitney rings, the beamdswitch decks and raw.json, and boots
the page against a stand-in DOM to call the WebMCP tools and the deck buttons.
After changing the engine's metadata or data, regenerate `raw.json` from it.
