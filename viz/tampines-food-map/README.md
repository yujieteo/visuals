# tampines-food-map

Where to eat in Tampines hub: a map of the 20 best-rated places to eat across Tampines Mall, Century Square and Tampines 1, ranked by Google Maps rating among food-guide picks, with review summaries and HPB-based calorie and macro estimates for their mains. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/tampines-food-map/`, `data/tampines-food-map/`) and the builder that generates the page; see `AGENTS.md` for how changes flow. It is an older, separate version of the site's Tampines food page, [yujieteo/tampines-food](https://github.com/yujieteo/tampines-food), and is not published on teoyujie.org.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `raw.json`, `sgfoodid.json`, `osm.json`, `meta.json` | The data, moved here from `data/tampines-food-map/` in yujieteo/visuals. |
| `tests/` | `node --test` suite. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.{mjs,cjs}'
```
