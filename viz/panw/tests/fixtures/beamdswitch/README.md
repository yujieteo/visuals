# beamdswitch test fixtures

Read-only copies the tests use to parse the page's deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs`, `plot.mjs` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch `src/deck.js` and `src/plot.js` at commit 7dfd98d) |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md` at commit `de4f6e4`, the standard report skeleton; the tests read only its `#` section headings |
| `beamdswitch.js` | yujieteo/site `templates/beamdswitch.js` as of commit `42045c3` (voice defaults to `bf_emma`) |

The root `beamdswitch.js` is yujieteo/site `templates/beamdswitch.js` unchanged; `tests/finance-beamdswitch-checks.mjs` pins its SHA-256, and compares it with a site checkout when `SITE_REPO` is set.
