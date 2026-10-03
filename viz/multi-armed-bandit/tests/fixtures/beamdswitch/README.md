# beamdswitch test fixtures

Read-only copies used by the `*-beamdswitch.test.mjs` tests to parse each page's
deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch `src/deck.js` at commit 7dfd98d) |
| `deck.d.mts` | yujieteo/site `tests/fixtures/beamdswitch/`: the types the type checker reads in place of `deck.mjs` |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md`, the standard report skeleton whose `#` sections every deck follows |
| `beamdswitch.js` | yujieteo/site `templates/beamdswitch.js` (voice defaults to `bf_emma`), the copy the root `beamdswitch.js` is compared against |

The root `beamdswitch.js` is yujieteo/site `templates/beamdswitch.js` unchanged;
`assertTemplateCopy` in `tests/beamdswitch-decks.mjs` checks it against this copy,
and against `templates/beamdswitch.js` of a site checkout too when `SITE_REPO`
(or a sibling `site` directory) holds one.
