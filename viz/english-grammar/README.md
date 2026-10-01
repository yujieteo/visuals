# english-grammar

How English Grammar Works: an interactive explorer of English grammar following The Cambridge Grammar of the English Language (CGEL): concepts by chapter, analysed example sentences as trees, contrasts, and Ctrl/Cmd+K search.

Live: <https://teoyujie.org/visuals/english-grammar/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/english-grammar/`, `data/english-grammar/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `concepts.json`, `examples.json`, `meta.json`, `raw.json`, `review.md` | The data, moved here from `data/english-grammar/` in yujieteo/visuals. |
| `scripts/`, `design-tokens.json` | The builder, its templates and the design tokens (see `AGENTS.md`). |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
python3 -m unittest discover -s tests -p 'test_*.py'
```
