# AGENTS.md

Connection rises as appetite to shape the future falls: Weighted survey aggregates by age group: older Singapore residents report stronger connection to the country but less interest in shaping its future, widening the gap from 0.09 to 1.07 points.

Live: https://teoyujie.org/visuals/social-values-surveydata/

## Source of truth

This folder is `viz/social-values-surveydata/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/social-values-surveydata](https://github.com/yujieteo/social-values-surveydata) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

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
python3 scripts/build_social_values.py
python3 scripts/build_social_values.py --verify
node --test tests/social-values-surveydata-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data or `scripts/build_social_values.py`, then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/social-values-surveydata/raw.csv` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/social-values-surveydata-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
