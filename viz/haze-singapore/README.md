# haze-singapore

Singapore haze, region by region: Hourly 24-hour PSI and PM2.5 for Singapore's five NEA regions from 1 April to 29 September 2026: no PSI above 100 until 4 September, then 15 Unhealthy days and a peak of 155 in Central.

Live: <https://teoyujie.org/visuals/haze-singapore/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/haze-singapore/`, `data/haze-singapore/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `boundary.geojson`, `meta.json`, `raw.json` | The data, moved here from `data/haze-singapore/` in yujieteo/visuals. |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.{mjs,cjs}'
```
