# graduate-employment-survey

The computing salary premium widened: Graduate Employment Survey degrees' gross monthly medians relative to each year's median: computing-titled degrees moved from 0.6% below it in 2013 to 36.4% above it in 2024.

Live: <https://teoyujie.org/visuals/graduate-employment-survey/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/graduate-employment-survey/`, `data/graduate-employment-survey/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.csv` | The data, moved here from `data/graduate-employment-survey/` in yujieteo/visuals. |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
