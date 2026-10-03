# AGENTS.md

Find a convex 15-minute bet: A tappable 2 by 2 for choosing a low-cost experiment that can open a meaningful next step, with research sources for each quadrant.

Live: https://teoyujie.org/visuals/convex-payoffs/

## Source of truth

The standalone repository [yujieteo/convex-payoffs](https://github.com/yujieteo/convex-payoffs) is where this visualisation and its tests develop and where CI runs them. `viz/convex-payoffs/` in [yujieteo/visuals](https://github.com/yujieteo/visuals) is a byte-for-byte port of its page files, with its data files in `data/convex-payoffs/`. yujieteo/site publishes it at <https://teoyujie.org/visuals/convex-payoffs/> from the yujieteo/visuals commit pinned in its `data/visuals/convex-payoffs.pin`. Neither runs this repository's tests.

## Files

| File | Role |
| --- | --- |
| `index.html` | The page, authored directly (no builder). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the page's data, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a yujieteo/convex-payoffs checkout (Node 22; the tests need nothing installed):

```sh
node --test 'tests/*.test.mjs'
npm ci && npm run typecheck
```

The second line type-checks the JavaScript: `scripts/extract-inline.mjs` copies the page's own inline scripts into `.typecheck/inline/` (ignored by Git; each copy keeps `index.html`'s line numbers), then `tsc` checks them, `report.js` and the tests as `tsconfig.json` sets out, and emits nothing. `types/page.d.ts` declares the page's globals and `beamdswitch.d.ts` types the unchanged `beamdswitch.js`. `package.json` and `package-lock.json` only pin that tooling (TypeScript and the Node type definitions); there are no runtime dependencies and no test framework.

There is no builder: edit `index.html`, `report.js` and the data directly, keeping the page's inlined copies of `beamdswitch.js` and `report.js` identical to the files. CI (`.github/workflows/ci.yml`) runs the suite and the type check on every push and pull request.

## Change workflow

1. Change and test here. Run the suite and check the page end to end: open `index.html` in a browser, use each control and both deck buttons, and confirm the console shows no errors. When a change adds or removes tests, time the suite before and after (`time node --test 'tests/*.test.mjs'`) and give both times in the pull request. Validate the branch with no-mistakes and get CI green.
2. Port to yujieteo/visuals: copy `index.html`, `beamdswitch.js`, `report.js`, `AGENTS.md`, `SKILLS.md` and `LICENSE` byte for byte into `viz/convex-payoffs/` and `raw.json` and `meta.json` into `data/convex-payoffs/`. `README.md`, `tests/`, `.github/` and the type-check tooling (`.gitignore`, `package.json`, `package-lock.json`, `tsconfig.json`, `types/`, `beamdswitch.d.ts`, `scripts/extract-inline.mjs`, `.typecheck/`, `node_modules/`) stay here.
3. Publish: a yujieteo/site pull request moves `data/visuals/convex-payoffs.pin` to the new yujieteo/visuals commit. It runs only the site-level tests, never this repository's.

## Data and tests

- Data: `raw.json` and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/convex-payoffs-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for the deck's narration voice.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- Tests run with `node --test` (JavaScript) or `unittest` (Python) only; never add Vitest, pytest or another runner.
- `beamdswitch.js` stays byte-identical to yujieteo/site `templates/beamdswitch.js`; the tests check it.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
