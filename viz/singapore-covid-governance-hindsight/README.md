# sg-covid-hindsight

What did 2020 Singapore analyses say?: Four dated 2020 Singapore COVID-19 analyses paired with later public records; one is a direct conditional forecast outcome, the others show policy overlap, a related event, or a consistent trend.

Live: <https://teoyujie.org/visuals/singapore-covid-governance-hindsight/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/singapore-covid-governance-hindsight/`, `data/singapore-covid-governance-hindsight/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.csv` | The data, moved here from `data/singapore-covid-governance-hindsight/` in yujieteo/visuals. |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
