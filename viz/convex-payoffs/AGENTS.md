# AGENTS.md

Find a convex 15-minute bet: A tappable 2 by 2 for choosing a low-cost experiment that can open a meaningful next step, with research sources for each quadrant.

Live: https://teoyujie.org/visuals/convex-payoffs/

## Source of truth

This folder is `viz/convex-payoffs/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/convex-payoffs](https://github.com/yujieteo/convex-payoffs) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

## Files

| File | Role |
| --- | --- |
| `index.html` | The page, authored directly (no builder). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the page's data, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a `yujieteo/visuals` checkout (Python 3 standard library and Node 22; nothing to install):

```sh
node --test tests/convex-payoffs-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

There is no builder: edit `index.html`, `report.js` and the data directly, keeping the page's inlined copies of `beamdswitch.js` and `report.js` identical to the files. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/convex-payoffs/raw.json` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/convex-payoffs-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
