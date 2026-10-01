# AGENTS.md

Singapore haze, region by region: Hourly 24-hour PSI and PM2.5 for Singapore's five NEA regions from 1 April to 29 September 2026: no PSI above 100 until 4 September, then 15 Unhealthy days and a peak of 155 in Central.

Live: https://teoyujie.org/visuals/haze-singapore/

## Source of truth

This folder is `viz/haze-singapore/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/haze-singapore](https://github.com/yujieteo/haze-singapore) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

## Files

| File | Role |
| --- | --- |
| `index.html` | Generated page. Do not hand-edit. |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the page's data, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a `yujieteo/visuals` checkout (Python 3 standard library and Node 22; nothing to install):

```sh
python3 scripts/build_haze_singapore.py
python3 scripts/build_haze_singapore.py --verify
node --test tests/haze-singapore-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data or `scripts/build_haze_singapore.py`, then regenerate; never hand-edit `index.html`. `python3 scripts/fetch_haze.py` optionally refreshes the raw data first and needs network access. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/haze-singapore/raw.json`, `boundary.geojson` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/haze-singapore-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
