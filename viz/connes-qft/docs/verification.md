# Verification of the port

The laboratory sources, raw data and independent Python reference files came from the site copy. The former standalone repository is unavailable. Its original test files were not available for transfer.

## Current checks

- `tests/engine.test.mjs` runs the engine self-tests and checks agreement of the vacuum-polarization pipeline with its Birkhoff factors.
- `tests/reference.test.mjs` compares the vacuum-polarization pole, finite MS term, finite MS-bar term, and first Laurent coefficient with 3 independent Python reference cases.
- `reference/build_reference.py --check` checks that the stored reference values match their generator. The other reference groups remain available, but the new reference test does not compare them with the engine.
- `build.py --check` checks generated page freshness.
- The shared visual checks validate metadata, published requests, templates, themes, contrast, and unused code.
- `e2e/full.test.mjs` preserves the existing browser assertions for deep links, presentation controls, palette, reset, Markdown, and narrated exports.

The Chromium baseline and offline checks pass. Browser history and JSON state import/export retain their existing findings in `e2e/manifest.json`.

The scientific engines and Python references retain their original calculations. UI changes remove unused declarations and assignments, apply the shared site theme, and improve contrast of text and control outlines.
