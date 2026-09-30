# Change an export

Every export is rendered from the one report object built by `report.build` in
`src/report.js`, so exports agree with each other and with the page.

| Output | Where | Tested by |
| --- | --- | --- |
| Markdown tables and the YAML model block | `report.markdown`, `yaml.stringify` | `tests/report.test.mjs`, `tests/yaml.test.mjs` |
| Import (Markdown or YAML) | `report.modelFromText`, `yaml.parse`, then `section.normalize` | `tests/report.test.mjs` |
| PDF | `report.pdf` (PDF 1.4, Helvetica not embedded, ASCII text) | `tests/report.test.mjs` checks structure and cross-references |
| Print | `report.html` into `#print-report`, `@media print` in `template.html` | by hand |
| PNG | `report.sectionSvg` / `report.curveSvg` drawn on a canvas in `src/ui.js` | SVG in `tests/report.test.mjs`; PNG by hand |
| Share link | `encodeModel` / `decodeModel` in `src/ui.js` (base64url YAML after `#model=`) | `tests/page.test.mjs` |

1. Change the report object first when a new quantity must appear everywhere; change
   only the renderer when the change is presentational.
2. The YAML block must stay importable: keep `sectionlab: 1` first and keep within
   the subset in [the model format](../docs/model-format.md). A format change that old
   files cannot read needs a new schema version and a reader for the old one.
3. PDF text passes through `ascii()`; add a mapping in `ASCII_MAP` for any new symbol.
   Keep fonts unembedded (standard Helvetica).
4. Rebuild with `python build.py` and run [Verify](verify.md), including the hand
   checks for the output you changed.
