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
- Measure x from the left end (the default) or from mid-span, where x runs
  from −L/2 to +L/2. The choice changes only the positions you type and read,
  never the solution; switching converts every entry.
- Read the reactions, shear force diagram, bending moment diagram, deflection,
  extremes, bending stress and an equilibrium check. Every diagram has labelled
  x and y axes with units.
- Choose the units: SI N, mm, MPa (the default); SI kN, m, kPa; SI N, m, Pa;
  US customary lbf, in, psi; or US customary kip, in, ksi. Each is a
  consistent system used for every input, result, diagram label and the
  NASTRAN deck. The beam is solved in SI whichever you pick, so switching
  converts the values already entered and never changes the results.
- Save the diagrams with every result (model, reactions, extremes and their
  locations, section, material, and the values at each support and load) as a
  PNG or SVG image, or as a one-page PDF. They are drawn in the page and saved
  straight to your device, so saving works offline and uploads nothing.
- Save the beam as a narrated talk for
  [beamdswitch](https://teoyujie.org/visuals/beamdswitch/) with the
  beamdswitch button: one Markdown deck with the set-up, the method, the
  results with their plots, and the checks, and spoken narration on every
  slide. Every number is the solver's, written as the page writes it and read
  aloud in the chosen units. Open it in beamdswitch (Open, or drop the file) to
  get slides, a handout, narration and a video. Copy deck, beside it, puts the
  same deck on the clipboard to paste into beamdswitch, for when the browser
  blocks the download (a blocked download fails silently, so the page cannot
  tell and copy on its own).
- Download the same model as an MSC Nastran SOL 101 bulk data deck (`.bdf`) to
  run in NASTRAN yourself. “Elements per segment” sets only the export mesh,
  with no upper cap; it does not change the browser solution or plot sampling.

## Files

| Path | Role |
| --- | --- |
| `index.html` | The built page: `template.html` with `raw.json`, `engine.js` and `beamdswitch.js` inlined |
| `engine.js` | Stiffness-method solver, exact V/M recovery, section properties, NASTRAN SOL 101 exporter, number formatting and the beam's beamdswitch report (`beamReport`). Works in the browser (`BeamDiag`) and in Node (`require`) |
| `beamdswitch.js` | The standard beamdswitch report template: `deck(report)` writes a report as a beamdswitch Markdown deck. Shared by every visualisation; see below |
| `templates/beamdswitch-report.md` | The template's skeleton, with placeholders |
| `template.html` | Page markup, styles and UI code |
| `raw.json` | Presets, materials, conventions, assumptions, NASTRAN notes and sources |
| `build.py` | Inlines `raw.json`, `engine.js` and `beamdswitch.js` into `template.html` to write `index.html` |
| `reference.py` | Independent exact-arithmetic Python solver (Macaulay integration and compatibility) and a reader for the exported decks |
| `fixtures.json` | Test beams with closed-form expectations |
| `reference.json` | `reference.py` output on the fixtures, compared with `engine.js` by the tests |
| `tests/` | Node and Python tests; see [docs/verification.md](docs/verification.md). `tests/fixtures/beamdswitch/` holds a read-only copy of beamdswitch's deck and plot parsers |

```sh
python3 build.py              # rebuild index.html after editing template.html, engine.js, beamdswitch.js or raw.json
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

## beamdswitch report template

Every visualisation's narrated report follows one template, so their talks
read alike. `beamdswitch.js` is that template as a small pure function with no
dependencies: `Beamdswitch.deck(report)` in the browser, `require("./beamdswitch.js").deck(report)`
in Node. A report is plain data:

```js
{
  meta: { title, subtitle },        // front matter; author, date and voice are optional
  narration,                        // spoken over the title slide
  setup: [frame, ...],              // # Set-up: what was modelled, its units and conventions
  method: [frame, ...],             // # Method: how the tool solved it
  results: [frame, ...],            // # Results: the numbers, with key equations and plots
  checks: [frame, ..., { key }],    // # Checks and takeaway: ends on one ::: key
}
// frame: { title, body, narration, notes?, key?, plot?: { x: [a, b], xlabel, ylabel, curves: ["expr in x"] } }
```

`body` is Markdown with LaTeX maths; `narration` is plain spoken prose, one
caption per sentence, with numbers written out as they should be read. The
function writes the four sections in order, a `::: narration` on every slide
(including "Part N." on each section slide), and refuses a report with a
frame left unnarrated, a narration containing maths or markup, a body line
that would start a new slide or close a block early, or no closing key.
[templates/beamdswitch-report.md](templates/beamdswitch-report.md) shows the
resulting deck with placeholders. A visualisation supplies its own numbers,
formatted as its page shows them; here `BeamDiag.beamReport(result, options)`
builds the beam's report from the solver's result, and its `::: plot` curves
are the solver's shear, moment and deflection written as Macaulay brackets.

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
is rounded to as many significant digits as fit in its 16 characters. The
numbers are in the unit convention chosen on the page, which the second comment
line names (for example `$ Units N, mm, MPa (N/mm2).`), so results NASTRAN
writes come back in those units too. Run it
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
