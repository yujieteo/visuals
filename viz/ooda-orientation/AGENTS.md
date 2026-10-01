# AGENTS.md

Orient: destroy the wrong model, act from the better one. A Boyd-inspired OODA orientation planner: build an orientation from reality, attack its assumptions, compare alternatives, then choose an action that tests the model.

Live: https://teoyujie.org/visuals/ooda-orientation/

## Source of truth

This folder is `viz/ooda-orientation/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/ooda-orientation](https://github.com/yujieteo/ooda-orientation) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

## Files

| File | Role |
| --- | --- |
| `index.html` | Generated page. Do not hand-edit. |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the current situation, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a `yujieteo/visuals` checkout (Python 3 standard library and Node 22; nothing to install):

```sh
python3 scripts/build_ooda_orientation.py
python3 scripts/build_ooda_orientation.py --verify
node --test tests/ooda-orientation.test.mjs tests/ooda-orientation-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data, `scripts/build_ooda_orientation.py` or its templates (`scripts/templates/ooda-orientation-logic.js`, `ooda-orientation.js`, `ooda-orientation.css`), then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/ooda-orientation/raw.json` (authored planner content) and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/ooda-orientation.test.mjs` (planner state and search logic), `tests/ooda-orientation-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- User situations are stored only in the browser's `localStorage`; nothing is uploaded.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
