# AGENTS.md

How English Grammar Works: an interactive explorer of English grammar following The Cambridge Grammar of the English Language (CGEL): concepts by chapter, analysed example sentences as trees, contrasts, and Ctrl/Cmd+K search.

Live: https://teoyujie.org/visuals/english-grammar/

## Source of truth

This folder is `viz/english-grammar/` in [yujieteo/visuals](https://github.com/yujieteo/visuals). The standalone repository [yujieteo/english-grammar](https://github.com/yujieteo/english-grammar) is a read-only exact mirror of this folder. Make every change upstream in `yujieteo/visuals`; do not edit or open pull requests against the mirror.

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
python3 scripts/build_english_grammar.py
python3 scripts/build_english_grammar.py --verify
python3 -m unittest discover -s tests -p 'test_english_grammar.py'
node --test tests/english-grammar.test.mjs tests/english-grammar-beamdswitch.test.mjs tests/voice-beamdswitch.test.mjs
```

Change the data or `scripts/build_english_grammar.py`, then regenerate; never hand-edit `index.html`. Before opening a pull request, run the full suite in the upstream README's Verification section, which CI (`.github/workflows/verify.yml`) runs on every push.

## Data and tests

- Data: `data/english-grammar/concepts.json`, `examples.json`, `raw.json`, `meta.json` and `review.md`; page templates `scripts/templates/english-grammar.js`, `english-grammar-logic.js` and `english-grammar.css`.
- Deck report: `report.js` in this folder.
- Tests: `tests/test_english_grammar.py`, `tests/english-grammar.test.mjs`, `tests/english-grammar-beamdswitch.test.mjs`, and `tests/voice-beamdswitch.test.mjs` for every deck page.

## Conventions

- Single self-contained HTML page: CSS, data and JavaScript are inline, with no external requests.
- JavaScript tests run with `node --test` only; never add Vitest or another runner.
- Exported beamdswitch decks declare `voice: bf_emma` (the default in `beamdswitch.js`).
- WebMCP tools are read-only (`annotations: {readOnlyHint: true}`) and the page works without `modelContext`.
- The page must stay under the builder's 1 MB size budget (`--verify` checks it).
- Never commit credentials, host details or absolute home-directory paths.
