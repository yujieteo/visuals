# Verification

The engine is JavaScript; every result class is checked against a Python reference
that uses a different method, plus closed forms.

| Result | Engine method | Reference | Tolerance in the tests | Typical agreement |
| --- | --- | --- | --- | --- |
| Area properties, Q | Green's theorem on exact lines and arcs, 16-point Gauss–Legendre | `reference/sectionref.py`: polygons + circular segments + disks with closed-form moments; exact disk ∩ half-plane clipping for Q | 1e-9 relative | 1e-15 |
| Closed forms (A, I, Q, J, Z_p, …) | as above | formulas in `reference/cases.py` | 1e-9 relative | 1e-15 |
| Torsion constant | exact formulas, Saint-Venant series, Bredt–Batho, Vlasov thin-walled open section | `reference/prandtl.py`: Prandtl stress function, linear FEM, three uniform refinements, Richardson | per formula, stated in `torsion-accuracy.json` | see the table |
| M–κ, κ_lim, M_lim, M_p, M_p(N) | strip fibres with exact strip moments, quadratic stress interpolation | `reference/plasticref.py`: exact width function, 400-point Gauss–Legendre between breakpoints | 1e-6 relative | 1e-8 |
| YAML | `src/yaml.js` | PyYAML (tests only) | exact data equality both ways | — |
| Hand calculations (`src/handcalc.js`) | composite parts: each part's own moments, then Σ n_i A_i, first moments and the parallel-axis theorem | the engine and `reference/reference.json` on every fixture and example; hand-worked literal tees and a mixed-material section with a void; closed forms (b h³/12, π d⁴/64, the tube and the sharp box) against each part's boundary integral; each torsion formula's steps against the engine's J | 1e-9 relative (closed forms 1e-12) | 1e-15 |

"Relative" is measured against the larger of the two values and the section's own
scale: √A raised to the property's length dimension, and M_lim for curve moments. Values that are zero only up to rounding (cx of a symmetric
section, M at κ = 0 under axial force) therefore compare on that scale rather than
against themselves.

## Torsion accuracy

`reference/torsion_accuracy.py` runs the page's own formula (through Node) and the
FEM reference on a sweep of shapes inside each formula's domain and records the
largest relative error. The stated accuracies are:

| Formula | Stated | Domain |
| --- | --- | --- |
| circle, circular hollow | 0.01% | exact |
| semicircle, equilateral triangle | 0.01% | exact (Saint-Venant) |
| sharp rectangle | 0.01% | Saint-Venant series |
| rectangular hollow, sharp or mixed corners | 6% | Bredt–Batho, t ≤ 0.1 min(b, h) |
| rectangular hollow, rounded uniform wall | 3.5% | Bredt–Batho, t ≤ 0.1 min(b, h), inner radius = outer − t |
| I, channel, Z, tee, angle, cross with sharp corners | 6% | Vlasov thin-walled open section, J = (1/3) Σ L t³ on the mid-lines, walls ≤ 0.15 min(b, h), thicker wall ≤ 1.4 × thinner |
| cold-formed angle, channel, Z, top hat | 5% | Vlasov thin-walled open section with a uniform wall, J = L t³/3 on the developed mid-line, t ≤ 0.1 min(b, h) |

For exact formulas the 0.01% bound is the reference's own accuracy, not the
formula's. Bredt–Batho underestimates J; its error grows with t / b and is largest
for sharp corners. The open-section formula overestimates J for the I, channel, Z,
tee and angle, underestimates it for the cross, and ignores root fillets, which add
6–20% stiffness, so filleted rolled shapes show "n/a". A formula whose measured error
exceeds its stated accuracy is recorded as withdrawn and the page shows "n/a" for it.

## Running the checks

```sh
node --test 'tests/*.test.mjs'
python -m unittest discover -s tests -p 'test_*.py'
```

`tests/handcalc.test.mjs` also checks that every number the hand calculations show
is the engine's value in the page's own formatting, that re-adding each written sum
(A, I_x, I_y) lands on its result, that Q, M_el, M_p and the curve are quoted from the
solver rather than derived, and that the Markdown is a narrated beamdswitch document
(`voice: bf_emma`, a `. . .` reveal between formula, substitution and result, plain
spoken narration, and no TeX the page cannot draw). `tests/beamdswitch.test.mjs`
parses that Markdown and the deck with beamdswitch's own parser and clicks Save
Markdown and Copy Markdown on the built page. `tests/browser.test.mjs` opens the
built `index.html` in headless Chrome (found from `CHROME_PATH` or the usual install
paths; skipped locally without one, required under CI): it opens the hand
calculations, checks one card per step with drawn equations and no raw TeX, saves the
Markdown through a real download and copies it through the real clipboard (both must
equal the engine's document), and checks the page does not scroll sideways at 375 px.

The Python suite also confirms that `index.html`, `reference/fixtures.json`,
`reference/reference.json` and `reference/torsion-accuracy.json` are current.
