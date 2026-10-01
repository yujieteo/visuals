# AGENTS.md

Find a convex 15-minute bet: A tappable 2 by 2 for choosing a low-cost experiment that can open a meaningful next step, with research sources for each quadrant.

Live: https://teoyujie.org/visuals/convex-payoffs/

## Source of truth

The standalone repository [yujieteo/convex-payoffs](https://github.com/yujieteo/convex-payoffs) is where this visualisation and its tests develop and where CI runs them. `viz/convex-payoffs/` in [yujieteo/visuals](https://github.com/yujieteo/visuals) is a port of its page files (with its data files in `data/convex-payoffs/`), refreshed when the visualisation is updated, and neither yujieteo/visuals nor yujieteo/site (which publishes it at <https://teoyujie.org/visuals/convex-payoffs/>) runs logic tests for it. Porting copies the repository minus `tests/` and `.github/`: the page files into `viz/convex-payoffs/` and the data files into `data/convex-payoffs/`.

## Files

| File | Role |
| --- | --- |
| `index.html` | The page, authored directly (no builder). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the page's data, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a yujieteo/convex-payoffs checkout (Node 22; nothing to install):

```sh
node --test 'tests/*.test.mjs'
```

There is no builder: edit `index.html`, `report.js` and the data directly, keeping the page's inlined copies of `beamdswitch.js` and `report.js` identical to the files. Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request.

## Data and tests

- Data: `raw.json` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/convex-payoffs-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for the deck's narration voice.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
