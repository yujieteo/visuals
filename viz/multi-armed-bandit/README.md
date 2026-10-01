# multi-armed-bandit

Multi-armed Bandit: Thompson Sampling and UCB. A practitioner tool for choosing the next trial among variants with uncertain binary success rates: Thompson Sampling (one shared Beta prior) and UCB1 recommendations from your own evidence, plus a seeded simulation comparing them with equal allocation.

Live: <https://teoyujie.org/visuals/multi-armed-bandit/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/multi-armed-bandit/`, `data/multi-armed-bandit/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.json` | The data, moved here from `data/multi-armed-bandit/` in yujieteo/visuals. |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
