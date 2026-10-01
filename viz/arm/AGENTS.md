# AGENTS.md

Arm cash conversion: Arm's (ARM) annual revenue and operating cash-flow margin from audited SEC filings, as a bar chart with a Revenue / Operating cash margin toggle.

Live: https://teoyujie.org/visuals/arm/

## Source of truth

This folder is `viz/arm/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/arm](https://github.com/yujieteo/arm) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

## Files

| File | Role |
| --- | --- |
| `index.html` | Generated page. Do not hand-edit. |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined by the builder. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a `yujieteo/visuals` checkout (Python 3 standard library and Node 22; nothing to install):

```sh
python3 scripts/build_stock_cases.py  # regenerates all four stock pages (airbnb, arm, marvell, panw) and the gallery
python3 scripts/build_stock_cases.py --verify
node --test tests/stock-cases-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data or `scripts/build_stock_cases.py`, then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/arm/raw.json` (SEC XBRL company facts) and `data/arm/meta.json`.
- Deck report: `scripts/templates/stock-cases-report.js` upstream (the builder inlines it; there is no `report.js` in this folder).
- Tests: `tests/stock-cases-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
