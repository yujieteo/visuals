# AGENTS.md

Multi-armed Bandit: Thompson Sampling and UCB. A practitioner tool for choosing the next trial among variants with uncertain binary success rates: Thompson Sampling (one shared Beta prior) and UCB1 recommendations from your own evidence, plus a seeded simulation comparing them with equal allocation.

Live: https://teoyujie.org/visuals/multi-armed-bandit/

## Source of truth

This folder is `viz/multi-armed-bandit/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/multi-armed-bandit](https://github.com/yujieteo/multi-armed-bandit) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

## Files

| File | Role |
| --- | --- |
| `index.html` | Generated page. Do not hand-edit. |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into `index.html`. |
| `report.js` | Builds the narrated deck from the committed experiment, inlined into `index.html`. |
| `AGENTS.md`, `SKILLS.md`, `LICENSE` | Agent guides and the MIT licence. |

## Build, test and verify

Run from the root of a `yujieteo/visuals` checkout (Python 3 standard library and Node 22; nothing to install):

```sh
python3 scripts/build_multi_armed_bandit.py
python3 scripts/build_multi_armed_bandit.py --verify
node --test tests/multi-armed-bandit.test.mjs tests/multi-armed-bandit-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data, `scripts/build_multi_armed_bandit.py` or its templates (`scripts/templates/multi-armed-bandit-logic.js`, `multi-armed-bandit.js`, `multi-armed-bandit.css`), then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/multi-armed-bandit/raw.json` (templates with fictional counts, assumptions, method references) and `meta.json`.
- Deck report: `report.js` in this folder.
- Tests: `tests/multi-armed-bandit.test.mjs` (Beta quantiles and sampling, UCB1, the seeded generator, recording and undo, input and JSON import validation, simulation determinism and regret), `tests/multi-armed-bandit-beamdswitch.test.mjs` (deck structure, escaping, buttons and WebMCP tools), and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page under 100 KiB: CSS, data and JavaScript are inline, with no external requests.
- Randomness comes only from the seeded xoshiro128** generator, whose state is saved; never use `Math.random`.
- Experiments are stored only in the browser's `localStorage`; nothing is uploaded.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- Never commit credentials, host details or absolute home-directory paths.
