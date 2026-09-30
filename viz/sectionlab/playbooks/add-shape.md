# Add a shape

A new catalogue entry touches the catalogue, the independent reference geometry and
the fixtures. The engine, exports and page pick it up without other changes.

1. **Catalogue.** Add an entry to `SHAPES` in `src/shapes.js` with `label`, `family`,
   `phase`, `dims` (`key`, `label`, `default`, and `min`, `max`, `integer` where they
   apply), `corners(d)`, `defaultRadii(d)`, `build(d, radii)` and `resize(d, sx, sy)`
   (plus `locked: true` if resizing must keep the aspect ratio).
   - Build the outline counter-clockwise with its bounding box centred on the origin.
     A straight-sided outline is `G.filletedPolygon(vertices, radii)`: it rounds
     convex and concave corners alike, so root fillets and toe radii come free.
   - A hollow shape returns its outer contour and `G.reverseContour(inner)`.
   - Thin-walled shapes: build the outer outline with outside radii (r + t) and the
     inner with inside radii r at the same corners.
   - Throw `RangeError` with a sentence naming the dimension when the dimensions
     cannot make the shape.
2. **Reference geometry.** Add the same shape to `shape_geometry` in
   `reference/sectionref.py`, written independently from the definition, not
   translated from the JavaScript: pieces for exact moments (polygons, circular
   segments, disks with ±1 weights) and contours for meshing.
3. **Fixtures.** Add cases to `reference/cases.py`: at least one with closed-form
   expectations (A, centroid, I, Q where they exist), one with rounded corners, one
   turned 90°, and one inside a composite. Mark cases `plastic: True` to check the M–κ
   curve against the Python reference.
4. **Torsion (optional).** Only with a verified formula: add it to `formula()` in
   `src/torsion.js` with its domain, add a sweep of cases inside that domain and a
   stated accuracy to `reference/torsion_accuracy.py`, and run it. Thin-walled open
   sections use Vlasov integration along the mid-line; state their accuracy the same
   way. A shape without a formula shows "n/a"; that needs no code.
5. **Docs.** Add the row to the catalogue table in `docs/model-format.md` and, if the
   shape belongs in the page's examples, a preset in `raw.json`.
6. Run [Verify](verify.md).
