# tourist-attractions

How Singapore attractions are marketed: Which words recur in 106 descriptions of Singapore tourist attractions, and where the described places are, as a word cloud beside a map.

Live: <https://teoyujie.org/visuals/tourist-attractions/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/tourist-attractions/`, `data/tourist-attractions/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline, d3 7.9.0 included). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.json` | The data, ported to `data/tourist-attractions/` in yujieteo/visuals. |
| `tests/` | `node --test` suites (and `unittest` where present) with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.{mjs,cjs}'
```
