# AGENTS.md

Multi-armed Bandit: Thompson Sampling and UCB. A practitioner tool for choosing the next trial among variants with uncertain binary success rates: Thompson Sampling (one shared Beta prior) and UCB1 recommendations from your own evidence, plus a seeded simulation comparing them with equal allocation, and an hours mode that splits next week's hours among activities from how worthwhile their past hour-blocks felt.

Live: https://teoyujie.org/visuals/multi-armed-bandit/

## Source of truth

This repository, [yujieteo/multi-armed-bandit](https://github.com/yujieteo/multi-armed-bandit), is the source of truth: the page, its builder, its sources and its tests develop here, and its CI runs them here. `visuals/multi-armed-bandit/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/multi-armed-bandit) is a port of the page files, refreshed whenever the tool is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/` (and `.gitignore`), so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve). The older copy in yujieteo/visuals (`viz/multi-armed-bandit/`, built by its `scripts/build_multi_armed_bandit.py`) predates this layout and is no longer where changes land.

## Files

| File | Role |
| --- | --- |
| `index.html` | Generated page. Do not hand-edit; edit the sources and run `python3 build.py`. |
| `build.py` | Builds `index.html` from the sources and data and checks it (contrast, size, no external requests, embedded data); `--verify` checks the committed page without writing. |
| `src/multi-armed-bandit-logic.js` | Pure numerics, experiment state, validation and the simulation (`<script id="mab-logic">`). |
| `src/hours-logic.js` | Pure hours-mode model: evidence, chance best by quadrature, Thompson and UCB1 allocations, the Markdown plan and plan validation (`<script id="hours-logic">`). |
| `src/multi-armed-bandit.js` | The experiment and simulation interface, the tabs and the WebMCP tools (`<script id="mab-ui">`). |
| `src/hours.js` | The Next week's hours interface (`<script id="hours-ui">`). |
| `src/multi-armed-bandit.css`, `src/design-tokens.json` | Styles, with colour tokens filled in by `build.py`. |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the committed experiment, inlined into `index.html`. |
| `raw.json`, `meta.json` | The data: templates, assumptions and references, and the hours example (`hours`). `raw.json` is embedded in the page. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a checkout (Python 3.12+ and Node 22; nothing to install):

```sh
python3 build.py            # rebuild index.html after changing src/, raw.json, report.js or beamdswitch.js
python3 build.py --verify   # the committed page is current and passes its checks
node --test 'tests/*.test.mjs'
```

Never hand-edit `index.html`. The browser test `tests/multi-armed-bandit-page.test.mjs` drives headless Chrome over the DevTools protocol (set `CHROME_PATH` to choose one); it is skipped locally without Chrome and fails in CI. Before opening a pull request, run the whole suite and `--verify`, as CI (`.github/workflows/ci.yml`) does on every push and pull request.

## Change workflow

Change and test this repository first, end to end (open `index.html` in a browser, use its controls, save the deck and the plan), and run no-mistakes here. Then port the repository minus `tests/`, `.github/` and `.gitignore` byte for byte into `visuals/multi-armed-bandit/` of yujieteo/site, whose run covers only the site's own tests. Logic and browser tests stay here; never add them to the site.

## Data and tests

- Data: `raw.json` (templates with fictional counts, assumptions, method references, and the hours example with its own assumptions and next steps) and `meta.json`.
- Deck report: `report.js`.
- Tests: `tests/multi-armed-bandit.test.mjs` (Beta quantiles and sampling, UCB1, the seeded generator, recording and undo, input and JSON import validation, simulation determinism and regret), `tests/hours.test.mjs` (hours evidence, chance best against closed forms and seeded draws, apportioning, UCB1 hour by hour, sensitivity, validation, plan JSON and the Markdown plan, and the hours interface in a stand-in DOM), `tests/multi-armed-bandit-beamdswitch.test.mjs` (deck structure, escaping, buttons and WebMCP tools), `tests/voice-beamdswitch.test.mjs` for the deck's narration voice, and `tests/multi-armed-bandit-page.test.mjs` (the page in headless Chrome; it stands in for the technical E2E repository until one exists).

## Conventions

- Single self-contained HTML page under 150,000 bytes (the canonical specification's budget for an ordinary visual): CSS, data and JavaScript are inline, with no external requests.
- Randomness comes only from the seeded xoshiro128** generator, whose state is saved; never use `Math.random`. The hours plan uses no randomness: its chances are computed by quadrature.
- Experiments and hours plans are stored only in the browser's `localStorage`, under separate keys (`multi-armed-bandit:v1`, `multi-armed-bandit:hours:v1`); nothing is uploaded.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
