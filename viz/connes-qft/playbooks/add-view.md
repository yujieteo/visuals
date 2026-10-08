# Add a view

A view (scene) is registered with `scene({...})` in one of the `src/ui/scenes-*.js` files, by lens.

1. Give it `id`, `track` (`qft`, `ck`, `ncg`, `aqft`, `synth`), `title`, the spec `sections` it implements, a `summary`, and the `refs` it cites (keys of `raw.json` → `references`).
2. Draw up to four panels (`space`, `field`, `diagram`, `algebra`); each returns `{ title, sub, body, foot }` as HTML. Use the helpers in `src/ui/draw.js` (`svg`, `feynman`, `lineChart`, `barChart`, `heatmap`, `laurentLayers`, `spectrumStrip`, `minkowski`, `riemannSphere`) and give every main figure an `aria-label`.
3. Controls come from `slider`, `seg`, `toggle`, `actBtn`, `stepper` in `src/ui/base.js`; state lives in `init()` and is set through `data-set`/`data-bind`; drags go through `drag`.
4. Every number must come from the engine (`ENG`, `QED`, `GR`, `HO`, `SP`, `AQ`); label finite, lattice and toy models.
5. Link it from the concept graph (`raw.json` → `concept.nodes[].scenes`) or the palette (`commands`) if it should be reachable there.
6. Run `python build.py` and the [Verify](verify.md) playbook; `tests/page.test.mjs` draws every view and fails on a panel error.
