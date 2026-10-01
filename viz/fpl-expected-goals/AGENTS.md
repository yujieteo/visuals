# AGENTS.md

How much of the early FPL points are repeatable?: Fantasy Premier League outfield players after Gameweek 5 of 2026/27, plotting actual goal involvements against expected goal involvements (xGI) to show whose points are least likely to repeat.

Live: https://teoyujie.org/visuals/fpl-expected-goals/

## Source of truth

The standalone repository [yujieteo/fpl-expected-goals](https://github.com/yujieteo/fpl-expected-goals) is where this visualisation and its tests develop and where CI runs them. `viz/fpl-expected-goals/` in [yujieteo/visuals](https://github.com/yujieteo/visuals) is a port of its page files (with its data files in `data/fpl-expected-goals/`), refreshed when the visualisation is updated, and neither yujieteo/visuals nor yujieteo/site (which publishes it at <https://teoyujie.org/visuals/fpl-expected-goals/>) runs logic tests for it. Porting copies the repository minus `tests/` and `.github/`: the page files into `viz/fpl-expected-goals/` and the data files into `data/fpl-expected-goals/`.

## Files

| File | Role |
| --- | --- |
| `index.html` | The page, authored directly (no builder). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the page's data, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a yujieteo/fpl-expected-goals checkout (Node 22; nothing to install):

```sh
node --test 'tests/*.test.mjs'
```

There is no builder: edit `index.html`, `report.js` and the data directly, keeping the page's inlined copies of `beamdswitch.js` and `report.js` identical to the files. Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request.

## Data and tests

- Data: `raw.json` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/fpl-expected-goals-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for the deck's narration voice.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
