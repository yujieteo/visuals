# breeden-litzenberger

The risk-neutral density is the curvature of the call-price curve: Synthetic Black-Scholes call prices plotted against strike, with the risk-neutral density as e^rT times their second derivative and a butterfly-spread cross-check. Synthetic data, not market prices.

Live: <https://teoyujie.org/visuals/breeden-litzenberger-density/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/breeden-litzenberger-density/`, `data/breeden-litzenberger-density/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.json` | The data, ported to `data/breeden-litzenberger-density/` in yujieteo/visuals. |
| `tests/` | `node --test` suites, with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
