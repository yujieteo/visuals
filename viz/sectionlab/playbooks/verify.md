# Verify

Run from this folder. Every command must pass.

```sh
python build.py                                     # index.html is generated
node --test 'tests/*.test.mjs'                      # engine, plastic, torsion, YAML, report, page tools
pip install -r requirements-test.txt                # once: numpy, scipy, PyYAML
python -m unittest discover -s tests -p 'test_*.py' # references, torsion accuracy, PyYAML agreement, build
```

The Python suite fails if `index.html`, `reference/fixtures.json`,
`reference/reference.json` or `reference/torsion-accuracy.json` is stale. Rebuild
them with `python reference/build_reference.py`, `python reference/torsion_accuracy.py`
(about 30 seconds) and `python build.py`, in that order, and review the diff: a
reference value that moves is a change in behaviour and needs a reason.

Then open `index.html` in a browser and check by hand:

1. Drag a shape from the palette onto the section, move it, resize it from a handle,
   and set a corner radius by clicking the corner dot.
2. Nudge a part with the arrow keys, turn it with R, undo and redo.
3. The properties, torsion row and M–κ chart update; the notice says "Verify independently".
4. Download the Markdown and import it again: the same section returns.
5. Copy a share link, open it in a new tab: the same section returns.
6. Download the PDF and both PNGs, and open the print preview.
7. Repeat at phone width and in dark mode.

Tolerances and what each test compares are in [docs/verification.md](../docs/verification.md).
