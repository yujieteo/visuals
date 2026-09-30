# beamdiag
Interactive shear-force and bending-moment diagram creator with Python verification and NASTRAN BDF export

Open `index.html` in a browser. Everything runs on your own machine in that
one self-contained file: no server, no network requests, no install.
Models are not saved automatically; reloading starts from the first example.

- Set the beam length, then place pinned and fixed supports anywhere along it:
  pin–pin, fixed–fixed, fixed–pin, cantilevers, overhangs and continuous spans.
  There is no cap on the number of supports or loads. Statically indeterminate
  beams are solved exactly by the direct stiffness method.
- Add point forces, couples and linearly varying distributed loads; drag
  supports and loads along the beam or move them with the keyboard.
- Choose a section (rectangle, circle, tube, or your own A and I) and a
  material (presets, or your own E and ν).
- Read the reactions, shear force diagram, bending moment diagram, deflection,
  extremes, bending stress and an equilibrium check.
- Download the same model as an MSC Nastran SOL 101 bulk data deck (`.bdf`) to
  run in NASTRAN yourself. “Elements per segment” sets only the export mesh,
  with no upper cap; it does not change the browser solution or plot sampling.

## Files

| Path | Role |
| --- | --- |
| `index.html` | The built page: `template.html` with `raw.json` and `engine.js` inlined |
| `engine.js` | Stiffness-method solver, exact V/M recovery, section properties, NASTRAN SOL 101 exporter. Works in the browser (`BeamDiag`) and in Node (`require`) |
| `template.html` | Page markup, styles and UI code |
| `raw.json` | Presets, materials, conventions, assumptions, NASTRAN notes and sources |
| `build.py` | Inlines `raw.json` and `engine.js` into `template.html` to write `index.html` |
| `reference.py` | Independent exact-arithmetic Python solver (Macaulay integration and compatibility) and a reader for the exported decks |
| `fixtures.json` | Test beams with closed-form expectations |
| `reference.json` | `reference.py` output on the fixtures, compared with `engine.js` by the tests |
| `tests/` | Node and Python tests; see [docs/verification.md](docs/verification.md) |

```sh
python3 build.py              # rebuild index.html after editing template.html, engine.js or raw.json
python3 reference.py          # rebuild reference.json after editing fixtures.json
python3 reference.py --check  # fail if reference.json is stale
```

## Verify

Needs Python 3.10 or later (standard library only) and Node 22 or later.

```sh
node --test tests/*.test.mjs
python3 -m unittest discover -s tests -p 'test_*.py' -v
```

[docs/verification.md](docs/verification.md) lists what is checked, the sign
conventions, and what is not.

## NASTRAN

The exported deck is laid out the way it would be written by hand: a short
case control section, then small-field bulk data grouped under `$` comment
banners with column headings. Every GRID lies on basic X, with `PS=345` set
once on GRDSET; CBAR elements with orientation vector +Y share one PBAR (`I1`
is the in-plane I) and MAT1; SPC1 set 1 holds the supports (pin `12`, fixed
`126`); FORCE, MOMENT and PLOAD1 are in load set 2; and `PARAM,POST,0` makes
MSC Nastran write an `.xdb` results database. Reals are written in as few
characters as keep them exact (`2.E11`, `0.3`, `-10000.`); a group of cards
with a value that needs more than eight characters, such as a third-point
GRID, switches to large field, where a real that still does not fit exactly
is rounded to as many significant digits as fit in its 16 characters. Run it
with a licensed solver, for example `nastran beamdiag.bdf`.

The deck is checked here by reading it back and re-solving it. It has not been
run through NASTRAN, and this repository contains no `.xdb`: that file only
comes from running the deck in a compatible NASTRAN solver.

## Origin

The page, engine, Python reference, fixtures and tests come from the beam
diagram creator in [yujieteo/site](https://github.com/yujieteo/site)
(`visuals/beamdiag/`, commit `e6f0ca8`). The local implementation has since
diverged; see [docs/verification.md](docs/verification.md) for its regression
coverage.
