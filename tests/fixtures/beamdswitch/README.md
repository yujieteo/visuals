# beamdswitch test fixtures

Read-only copies used by the `*-beamdswitch.test.mjs` tests to parse each page's
deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs`, `plot.mjs` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch `src/deck.js` and `src/plot.js` at commit 7dfd98d) |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md`, the standard report skeleton whose `#` sections every deck follows |
| `beamdswitch.js` | yujieteo/site `templates/beamdswitch.js` at commit `de4f6e4b4ff01e88526a0b0d8c8c4bfd4d6318c9`, plus that template's default voice (`bf_emma` when a report names none; site branch `beamdswitch-voice-default-site-v1`), the copy each `viz/<slug>/beamdswitch.js` is compared against |

Each page's `viz/<slug>/beamdswitch.js` is yujieteo/site `templates/beamdswitch.js`
unchanged; the tests pin its SHA-256 (see `tests/finance-beamdswitch-checks.mjs`).
