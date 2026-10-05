# Checklist Manifesto Maker

`build.py` writes `index.html` from `src/page.html`, `src/body.html`, `src/style.css`, `raw.json`, `beamdswitch.js` (the site's template, unchanged), `src/model.js`, `src/formats.js` and `src/view.js`; edit those, run `python3 build.py`, never hand-edit `index.html`.

`src/model.js` is the pure model (no DOM, storage, clock or network) and `src/formats.js` the pure exports and imports; `src/view.js` only draws state and calls them. Keep the five categories distinct, never infer a result, status, route or condition, and keep content and progress out of the URL.

The Markdown profile in [README.md](README.md) is versioned: a change to what an export writes is a schema change, so raise `SCHEMA_VERSION`, add the migration from the old version to `MIGRATIONS`, update README.md, and rewrite the canonical fixtures with `UPDATE_FIXTURES=1 node --test tests/formats.test.mjs`.

Tests: `tests/` (model, formats and fixtures) and `e2e/` (browser checks and this visual's own workflows); `python3 ../../scripts/check.py checklist-manifesto-maker` runs the checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
