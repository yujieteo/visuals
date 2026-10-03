# beamdswitch test fixtures

Read-only copies the tests use to parse the page's deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs` | yujieteo/site `tests/fixtures/beamdswitch/deck.mjs` (vendored there from beamdswitch `src/deck.js` at commit 7dfd98d) |
| `deck.d.mts` | yujieteo/site `tests/fixtures/beamdswitch/`: the types the type checker reads in place of `deck.mjs` |
| `beamdswitch.js` | yujieteo/site `templates/beamdswitch.js` as of commit `42045c3` (voice defaults to `bf_emma`) |

The root `beamdswitch.js` is yujieteo/site `templates/beamdswitch.js` unchanged; `tests/beamdswitch-decks.mjs` checks it against this copy, and against a site checkout when one is at hand (`SITE_REPO`, or a sibling `site`).
