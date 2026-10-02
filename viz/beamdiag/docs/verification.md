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
| `tests/beamdiag.test.mjs` | The engine against the closed forms in `fixtures.json` and against `reference.json`; equilibrium and support conditions; V and M jumps at point forces and couples; mesh invariance; solving, plotting and extrema at 10,000 elements per segment within one second; uncapped support, load and mesh counts; unit consistency; every unit convention consistent (stress is force per length squared), conversions exact to rounding on round trips, the same beam giving the same results in each convention and the closed forms in US customary numbers, and each convention's deck stating its units with numbers in them; error messages for mechanisms and invalid input; section formulas; and the fixed-column format of the exported deck. |
| `tests/review-regressions.test.mjs` | Exact short-span extrema and plot coverage; right-end attachments through transient invalid length inputs and preset changes; local startup and updates without URL model persistence; End puts a support handle exactly at L in any convention; a typed-back shown position lands exactly on the position it shows; the N, mm, MPa default; switching units converts entered values without changing the beam or the results, and typed values are read in the chosen units; diagrams, load arrows and labels kept inside the figure with exact tick and extreme labels for loads from 10⁹ to 10³⁰⁰ in every unit convention at desktop and phone widths, with normal loads drawn as before; the cursor readout and support-reaction labels kept compact at 10³⁰⁰ with the chosen unit symbols on a phone-width figure, and in plain digits under normal loads in kN, m. |
| `tests/ui.test.mjs` | The page's own state in a minimal stand-in DOM: an exactly balanced preset reports a relative error of 0; an invalid edit clears the deck and marks the plots, statistics and table stale until it is undone; typing a new length one keystroke at a time keeps supports and loads attached to the right end without capturing interior positions that match an intermediate length; and every diagram of 300,000 samples, beyond JavaScript's argument limits, is drawn whole with no `NaN` or `Infinity`. |
| `tests/figure.test.mjs` | Measuring x from mid-span gives the identical model and results, converts existing entries, keeps both ends attached and every other load where it was typed when the length changes, even one keystroke at a time, and restates solver messages; every diagram has labelled x and y axes ticked in the chosen origin, with titles and axis labels in the chosen unit convention; the saved SVG and PNG contain the diagrams and every result and reference nothing outside themselves; the PDF's structure, page size and lossless image; nothing is saved while the beam cannot be solved. It runs the built page in the stand-in DOM of `tests/page-harness.mjs`, so it checks what is drawn and encoded, not a browser's pixels. |
| `tests/beamdswitch.test.mjs` | `beamdswitch.js` is yujieteo/site's shared `templates/beamdswitch.js` unchanged (its read-only copy `tests/fixtures/beamdswitch/template.js`). The beamdswitch deck for every preset in every unit convention, from both origins, parses with beamdswitch's own deck and plot parsers (vendored read-only in `tests/fixtures/beamdswitch/`, source commit in each file's header) into the standard template's sections (those of the site's `templates/beamdswitch-report.md`, copied read-only to `tests/fixtures/beamdswitch/`), with Hand calculations between Results and Checks and takeaway, ending on a `::: key`, with `voice: bf_emma`; every slide carries its own `::: narration` of plain spoken prose; the three plotted curves agree with the solver's V, M and v between every pair of events to a relative 1e-7; the reactions, extremes and their locations, span ratio, peak stress and equilibrium residual are the solver's values in the page's own formatting; the narration reads numbers in the chosen units; the template refuses a report missing narration or a key, or whose Markdown would break a slide; and the page's button saves a deck whose numbers match the results shown under the figure, titles it after a preset only while the beam is still that preset, and Copy deck puts that same deck on the clipboard without downloading, says so when the clipboard is blocked, and neither saves nor copies anything while the beam cannot be solved. |
| `tests/handcalc.test.mjs` | The hand calculations on every fixture in `fixtures.json` (determinate and indeterminate beams, cantilevers, overhangs and continuous spans, up to forty supports), in every unit convention from both origins: the reactions solved from the written equilibrium or compatibility equations, then V, M, θ and v carried segment by segment from them, match the stiffness solver and `reference.json` at both ends of every segment to a relative 1e-6, and each segment's written polynomials land on the solver's values at its far end; only systems of more than eight unknowns are left unwritten, and those say so and list the solver's values. For every preset and three further beams in every convention and origin, the reactions, each segment's table of V, M, θ and v, the selected point's values, the peak stress and the equilibrium residual are the solver's in the page's own digits, and the method and the solver's authority are stated. `HandCalc.deck` adds only the Hand calculations section to the template's deck, numbering Checks and takeaway Part 5, and refuses a hand frame the template would refuse. The Markdown export and the deck's Hand calculations section parse with beamdswitch's parser with plain spoken narration on every slide and `voice: bf_emma`, every display equation is one `$$ … $$` line the page draws without leftover TeX, and a long beam's deck, like the Markdown, has a slide for every segment. On the page, the view lists every segment in the chosen units and origin, the selected-point frame follows the cursor and matches the readout, Save Markdown and Copy Markdown hand over the same document, the beamdswitch deck carries the hand calculations, and nothing is saved or copied while the beam cannot be solved. In the deck, for every preset and further beam, the long random fixtures, and simply supported and cantilever beams carrying 12 and 14 point loads, in every convention and origin, each step's slides carry its numbers in order and are each narrated, and every Hand calculations slide stays within what beamdswitch's slide holds at full size (12 rows of text, equations at most 60 drawn characters wide, a title of at most 50 characters). |
| `tests/browser.test.mjs` | In Chrome (skipped unless `BEAMDIAG_BROWSER_URL` is set, as in CI): dragging a point-force handle through the section cursor reaches the beam's end; and every preset's deck, in every unit convention from both origins, laid out by beamdswitch's own page (`tests/fixtures/beamdswitch/beamdswitch.html`, checked against the sha256 of the pinned upstream build), has no slide whose body overflows even at beamdswitch's smallest text or runs wider or taller than the slide, and every Hand calculations slide fits at 27 px text or more under a one-line title. |
| `tests/test_beamdiag.py` | `reference.json` is current; `reference.py` matches every closed form and is exactly in equilibrium and compatible; it rejects a mechanism; the engine (run through `node`) agrees with it on every fixture; the hand calculations' own chain (`handcalc.js`, its reactions from the written equations and its V, M, θ and v at both ends of every segment) agrees with it on every fixture in every unit convention from both origins; every exported deck reads back into the same beam and re-solves to the same reactions and deflections, in every unit convention; the reader rejects cards it cannot represent; `build.py` reproduces `index.html`; and the page is self-contained. |
| `tests/test_random_beams.py` | Sixty seeded random beams beyond the textbook layouts: lengths from 0.5 m to 120 m, one to forty pinned or fixed supports at arbitrary millimetre positions (not only the ends, so with overhangs), and up to forty mixed point forces, couples and trapezoidal distributed loads, on a range of E and I. Each is solved by the engine and by `reference.py` and compared at every support and load position to a relative 1e-7, and its exported deck is read back and re-solved. Also a 90 m beam on 46 supports through the same checks, and two loads 2 mm apart on a 5 m propped cantilever. |

`fixtures.json` covers pin–pin beams under point, uniform, triangular and
couple loads; fixed–fixed beams; a propped cantilever (fixed–pin); a
cantilever; continuous spans; and an asymmetric mixed case.

## Conventions

The engine works in SI (m, N, N/m, N·m, Pa, m², m⁴). The page converts to
and from the chosen unit convention (`UNIT_SYSTEMS` in `engine.js`) only where
values are typed or shown, and the deck is written in that convention with a
`$ Units` comment naming it. x runs along the beam from
its left end and +y is up (the page can also show and take positions from
mid-span, but the model and the solver always use the left end); couples and rotations are counter-clockwise
positive. A downward load is entered as a negative force. Shear V(x) is the
sum of the upward forces left of the section, and the bending moment M(x) is
positive when sagging. A reaction is the force, and for a fixed support also
the couple, that the support applies to the beam.

The deck writes every real exactly when it fits a 16-character large field,
and otherwise rounds it to as many digits as fit, so a deck
read back from random beams with supports a few millimetres apart re-solves to
reactions within a relative 1e-6 of the original rather than exactly.

## What is not checked

The exported `.bdf` is checked by reading it back and re-solving it, not by
running NASTRAN. No `.xdb` result file is produced or claimed here: an `.xdb`
only comes from running the deck in a compatible NASTRAN solver.

The beamdswitch deck and the hand-calculation Markdown are checked with
beamdswitch's parsers; the deck's slides are also laid out in beamdswitch's
page (`tests/browser.test.mjs`), but its narration and video are not rendered,
and the Markdown's slides are not laid out (it is a document first, and keeps
each step whole). The deck's Set-up, Method and Results slides written by
`engine.js` are checked to fit, but a long title of theirs can still wrap onto
a second line. The page draws the hand calculations' equations from a small TeX
subset of its own; the tests check that no TeX is left over, not how a given
browser lays the equations out (that was looked at by eye in Chrome, at
desktop and phone widths).
