# social-values-surveydata

Connection rises as appetite to shape the future falls: Weighted survey aggregates by age group: older Singapore residents report stronger connection to the country but less interest in shaping its future, widening the gap from 0.09 to 1.07 points.

Live: <https://teoyujie.org/visuals/social-values-surveydata/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/social-values-surveydata/`, `data/social-values-surveydata/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.csv` | The data, ported to `data/social-values-surveydata/` in yujieteo/visuals. |
| `tests/` | `node --test` suites, with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
