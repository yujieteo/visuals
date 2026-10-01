# manchester-city-finances

What Manchester City's charges and accounts do and do not show: an evidence-first timeline that separates the Premier League allegations, the distinct 2020 CAS UEFA case, and Manchester City's latest filed accounts.

Live: <https://teoyujie.org/visuals/manchester-city-finances/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/manchester-city-finances/`, `data/manchester-city-finances/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.csv` | The data, moved here from `data/manchester-city-finances/` in yujieteo/visuals. |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
