# energy-email-productivity

Your energy dips mid-afternoon. Your inbox doesn't.: A stylised workday alertness curve beside measured email-interruption findings: 70% of emails answered within 6 seconds, 64 seconds to refocus, and less stress at three checks a day.

Live: <https://teoyujie.org/visuals/energy-email-productivity/>. MIT licence (see `LICENSE`).

This repository is where the visualisation and its tests develop; CI (`.github/workflows/ci.yml`) runs the tests on every push and pull request. [yujieteo/visuals](https://github.com/yujieteo/visuals) holds the copy (`viz/energy-email-productivity/`, `data/energy-email-productivity/`) that [yujieteo/site](https://github.com/yujieteo/site) publishes; see `AGENTS.md` for how changes flow.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | The self-contained page (CSS, data and JavaScript inline; no external requests). |
| `beamdswitch.js` | Unchanged copy of the site's beamdswitch report template, inlined into the page. |
| `report.js` | Builds the narrated beamdswitch deck, inlined into the page. |
| `meta.json`, `raw.json` | The data, ported to `data/energy-email-productivity/` in yujieteo/visuals. |
| `tests/` | `node --test` suites, with read-only beamdswitch fixtures under `tests/fixtures/`. |
| `AGENTS.md`, `SKILLS.md` | Guides for agents changing and using the page. |

## Test

```sh
node --test 'tests/*.test.mjs'
```
