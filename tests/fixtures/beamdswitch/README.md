# beamdswitch test fixtures

Read-only copies used by the `*-beamdswitch.test.mjs` tests to parse each page's
deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs`, `plot.mjs` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch `src/deck.js` and `src/plot.js` at commit 7dfd98d) |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md`, the standard report skeleton whose `#` sections every deck follows |

Each page's `viz/<slug>/beamdswitch.js` is yujieteo/site `templates/beamdswitch.js`
unchanged; the tests pin its SHA-256 (see `tests/finance-beamdswitch-checks.mjs`).
