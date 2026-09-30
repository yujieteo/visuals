# Structural Stability Visualiser (STABILITY)

An exploration tool for column buckling, second-order beam-columns, flat-plate
shear buckling and NACA TN 2661 diagonal tension on plane webs. **Not for
certification**: the page says so on a permanent banner and every export
repeats it. `index.html` is one self-contained file with no dependencies that
works offline.

| File | Role |
| --- | --- |
| `engine.js` | Pure calculation core: material model, the shared column-strength function, the four analyses, the beam FE eigenvalue solve, figure fits, unit conversion, Markdown and JSON export and import, and the self-test. No DOM access. Works in the browser (`Stability`) and in Node (`require`). |
| `template.html` | Page markup, styles, SVG plots, UI code and WebMCP tools |
| `raw.json` | Sources, reference notes, scope and the digitised NASA figure points (published as `data.json`) |
| `build.py` | Inlines `raw.json` and `engine.js` into `template.html` to write `index.html` |

```sh
python build.py   # rebuild index.html after editing template.html, engine.js or raw.json
```

Every formula carries a source tag: `NASA` (report and section), `classical`
(no NASA source found) or `fit` (a closed form fitted to a NASA report figure,
with the fit error computed from the digitised points in `raw.json`). A
chart-based relation outside its figure shows "unavailable: chart data not
sourced" rather than a number: kss beyond fig. 12(a) (hc/dc above 5) blocks the
web buckling stress and every later diagonal-tension result. The one exception
is fig. 12(b) beyond t/t = 3, held at its end value as NACA TN 2661 section 7,
example 1 (p. 57) does, and tagged with that source and a warning. TN 2661
section 4.2 note 2 (uprights disregarded) is not checked, because the report
gives no kss for that panel; a warning says so.

The tests are `tests/stability.test.mjs` (Node: the self-test, the TN 2661
worked examples, the FE and secant cross-checks, validation, exports and the
page's WebMCP tools) and `tests/test_stability.py` (Python: build
reproducibility, the catalogue stub, the published copy and the self-test under
Node). The page runs the same self-test on every load and shows a pass/fail
badge.

Values are stored in N, mm and MPa whatever units are displayed, so exported
files stay valid; `displayUnits` in a file only restores the SI/US switch.
