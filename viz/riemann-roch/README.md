# Divisors, Linear Systems & Riemann–Roch Laboratory

A computational laboratory for algebraic curves. Choose a curve, place a divisor, and the page
finds the rational functions whose poles the divisor allows, writes a basis of L(D), counts
ℓ(D), balances Riemann–Roch and draws the map φ_D to projective space:

```text
curve → divisor → L(D) → ℓ(D) → Riemann–Roch → |D| → φ_D : C → Pⁿ
```

It is a companion to the étale fundamental group visual, but stands on its own: it loads
nothing from other pages.

`index.html` is one self-contained file with no network requests (a Content-Security-Policy
forbids them); it works from `file://`, offline and in an iframe, has light and dark themes,
honours reduced motion, works with keyboard and touch, and shows the core computations when
JavaScript is off.

| File | Role |
| --- | --- |
| `src/engine.js` | The pure engine (`self.RiemannRoch`): divisors, L(D) bases, Riemann–Roch, elliptic group law and Abel–Jacobi, hyperelliptic bases and gaps, Riemann–Hurwitz, plane curves, exact intersection multiplicities, projective relations, the beamdswitch report. No DOM, storage, clock, randomness or network. |
| `src/ui.js` | The page: laboratory, modules, command palette, notation and theme toggles, deck export and five read-only WebMCP tools. |
| `src/template.html`, `src/style.css` | Markup, the no-JavaScript fallback and styles. |
| `beamdswitch.js` | The site's standard report template, a verbatim copy of `templates/beamdswitch.js`. |
| `build.mjs` | Inlines everything into `index.html` and writes `raw.json`. Never edit those two by hand. |
| `raw.json` | Catalogue data, published as `data.json`: presets, the minimum computations and their live results, references. |
| `AGENTS.md`, `SKILLS.md` | Notes for coding agents, and how an agent uses the page and its WebMCP tools. |
| `tests/` | The tests, with read-only copies of beamdswitch's deck parser and the site's template and report skeleton in `tests/fixtures/beamdswitch/`. Not ported to the site. |
| `.github/workflows/ci.yml` | CI: the freshness check and the tests on every push and pull request. Not ported to the site. |

Rebuild after editing anything under `src/`:

```sh
node build.mjs          # write index.html and raw.json
node build.mjs --check  # fail if they are stale
```

## What is exact, and what is not

Exact (symbolic bases, proved by the tests):

- **P¹**, any divisor D = Σ n_a[a] + n_∞[∞]: with q = ∏_{n_a>0}(x − a)^{n_a} and
  r = ∏_{n_a<0}(x − a)^{−n_a}, L(D) = { r·s/q : deg s ≤ deg D }.
- **Weierstrass E** y² = x³ + ax + b at O: xⁱyʲ with j ≤ 1 and pole order 2i + 3j ≤ n.
  ℓ(D) for *every* divisor on E is exact: deg D when positive, and in degree 0 one exactly
  when D sums to O in the group law (Abel's theorem in genus one).
- **y² = f(x)**, deg f = 2g + 1, at ∞: xⁱ (pole 2i) and y·xʲ (pole 2j + 2g + 1);
  deg f = 2g + 2: n(∞₊ + ∞₋) with xⁱ, i ≤ n, and y·xʲ, j ≤ n − g − 1.
- **Smooth plane curves**, D = nH: ℓ(nH) = C(n+2, 2) − C(n−d+2, 2).
- **Intersections** of plane curves by a homogeneous resultant after a generic integer change
  of coordinates; multiplicities from Yun's square-free decomposition in BigInt arithmetic,
  so they sum to d·e exactly (Bézout).
- **|3O|** recovers the cubic from sampled image points as the one-dimensional space of cubic
  relations among 1, x, y (a null-space computation), rather than writing it down.

Everything else (for example a divisor of degree 0 … 2g − 2 off ∞ on a hyperelliptic curve,
or a divisor on an abstract curve) is bounded by Riemann–Roch and Clifford and labelled as a
bound; the page never invents a basis. Curve pictures are real loci or schematics and say so;
the torus coordinates of real points come from the Abel–Jacobi integral ∫ dx/y (Carlson-free
Gauss–Legendre quadrature).

## Tests

This repository, [yujieteo/riemann-roch](https://github.com/yujieteo/riemann-roch), is where the
laboratory and its tests develop; `visuals/riemann-roch/` in yujieteo/site is a port of its page
files (this repository minus `tests/` and `.github/`) and runs none of these tests. From the root:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

`tests/riemann-roch.test.mjs` runs with Node's built-in runner. It checks that `index.html`
and `raw.json` are fresh, and covers every minimum computation of the specification: the
L(D) bases on P¹, E and hyperelliptic curves, ℓ(D) against Riemann–Roch, deg K = 2g − 2,
ℓ(D) = deg D on elliptic curves, the group law and E ≅ Pic⁰(E) through Abel–Jacobi
additivity, |2O| and |3O| with the recovered cubic, Riemann–Hurwitz, plane-curve genus and
adjunction, Bézout totals and tangency multiplicities, gap sequences, canonical maps, the
computation mode, the narrated decks and the WebMCP tools in a stand-in DOM.

## References

Cited at chapter level only: Hartshorne, *Algebraic Geometry* (II.6, II.7, IV.1–IV.5);
Vakil, *The Rising Sea* (the chapters on line bundles and divisors and on curves; numbering
differs between drafts); Miranda, *Algebraic Curves and Riemann Surfaces* (Ch. V, VI);
Griffiths–Harris, *Principles of Algebraic Geometry* (Ch. 2).
