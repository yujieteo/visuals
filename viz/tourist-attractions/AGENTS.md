# AGENTS.md

How Singapore attractions are marketed: Which words recur in 106 descriptions of Singapore tourist attractions, and where the described places are, as a word cloud beside a map.

Live: https://teoyujie.org/visuals/tourist-attractions/

## Source of truth

This folder is `viz/tourist-attractions/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/tourist-attractions](https://github.com/yujieteo/tourist-attractions) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

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
python3 scripts/build.py
python3 scripts/build.py --verify
node --test tests/tourist-attractions-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data or `scripts/build.py`, then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/tourist-attractions/raw.json` (the TouristAttractions GeoJSON) and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/tourist-attractions-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline. The one exception is d3 7.9.0, loaded from jsDelivr by design.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
