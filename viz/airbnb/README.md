# airbnb

Airbnb cash conversion: Airbnb's (ABNB) annual revenue and operating cash-flow margin from audited SEC filings, as a bar chart with a Revenue / Operating cash margin toggle.

Live: <https://teoyujie.org/visuals/airbnb/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/airbnb/`, `data/airbnb/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `meta.json`, `raw.json` | The data, ported to `data/airbnb/` in yujieteo/visuals. |
| `scripts/templates/stock-cases-report.js` | The builder's deck template, which the page inlines. |
| `tests/` | `node --test` suites, with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
