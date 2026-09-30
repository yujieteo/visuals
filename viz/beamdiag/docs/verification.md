# Verification

The browser engine (`engine.js`) solves beams by the direct stiffness method.
`reference.py` solves the same beams a different way, in exact rational
arithmetic with only the Python standard library: the support reactions and
the two integration constants of EI v'' = M(x) come from global equilibrium
plus the support conditions (v = 0 at every support, v' = 0 at every fixed
support), with M(x) written in Macaulay form. Agreement between the two is
evidence, not a repeated calculation.

Run everything from the repository root:

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

CI (`.github/workflows/ci.yml`) runs both on every push to `main` and every
pull request.

## What is checked

| File | Checks |
| --- | --- |
| `tests/beamdiag.test.mjs` | The engine against the closed forms in `fixtures.json` and against `reference.json`; equilibrium and support conditions; V and M jumps at point forces and couples; mesh invariance; solving, plotting and extrema at 10,000 elements per segment within one second; uncapped support, load and mesh counts; unit consistency; error messages for mechanisms and invalid input; section formulas; and the large-field format of the exported deck. |
| `tests/review-regressions.test.mjs` | Exact short-span extrema and plot coverage; right-end attachments through transient invalid length inputs and preset changes; local startup and updates without URL model persistence. |
| `tests/test_beamdiag.py` | `reference.json` is current; `reference.py` matches every closed form and is exactly in equilibrium and compatible; it rejects a mechanism; the engine (run through `node`) agrees with it on every fixture; every exported deck reads back into the same beam and re-solves to the same reactions and deflections; the reader rejects cards it cannot represent; `build.py` reproduces `index.html`; and the page is self-contained. |
| `tests/test_random_beams.py` | Sixty seeded random beams beyond the textbook layouts: lengths from 0.5 m to 120 m, one to forty pinned or fixed supports at arbitrary millimetre positions (not only the ends, so with overhangs), and up to forty mixed point forces, couples and trapezoidal distributed loads, on a range of E and I. Each is solved by the engine and by `reference.py` and compared at every support and load position to a relative 1e-7, and its exported deck is read back and re-solved. Also a 90 m beam on 46 supports through the same checks, and two loads 2 mm apart on a 5 m propped cantilever. |

`fixtures.json` covers pin–pin beams under point, uniform, triangular and
couple loads; fixed–fixed beams; a propped cantilever (fixed–pin); a
cantilever; continuous spans; and an asymmetric mixed case.

## Conventions

SI units throughout (m, N, N/m, N·m, Pa, m², m⁴). x runs along the beam from
its left end and +y is up; couples and rotations are counter-clockwise
positive. A downward load is entered as a negative force. Shear V(x) is the
sum of the upward forces left of the section, and the bending moment M(x) is
positive when sagging. A reaction is the force, and for a fixed support also
the couple, that the support applies to the beam.

The deck's large-field reals carry about ten significant digits, so a deck
read back from random beams with supports a few millimetres apart re-solves to
reactions within a relative 1e-6 of the original rather than exactly.

## What is not checked

The exported `.bdf` is checked by reading it back and re-solving it, not by
running NASTRAN. No `.xdb` result file is produced or claimed here: an `.xdb`
only comes from running the deck in a compatible NASTRAN solver.
