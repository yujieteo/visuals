# Change the engine

For changes to how properties, torsion or plastic results are computed.

1. Read [the architecture](../docs/architecture.md) and keep its invariants: exact
   line-and-arc geometry, contours with the region on the left, everything about the
   centroid, torsion only through the accuracy table.
2. Change the module that owns the result (`src/section.js`, `src/torsion.js` or
   `src/plastic.js`; shared geometry in `src/geometry.js`). Keep modules free of DOM
   access so they load in Node.
3. If the change alters what a result means, change the Python reference's method
   for the same quantity in `reference/` too. Do not make the reference call the
   engine: it must stay an independent calculation.
4. Add or adjust a test first when fixing a bug: a fixture in `reference/cases.py`
   with a closed form, or a Node test in `tests/`.
5. Regenerate what the change affects:
   `python reference/build_reference.py`, and for torsion
   `python reference/torsion_accuracy.py`. A formula that fails its stated accuracy
   is withdrawn automatically; never raise a stated accuracy just to pass without
   saying so in the change description.
6. Update `raw.json` (method, assumptions) and `docs/verification.md` if the method or a
   tolerance changed, then `python build.py`.
7. Run [Verify](verify.md).
