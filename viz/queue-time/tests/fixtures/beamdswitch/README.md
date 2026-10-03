# beamdswitch test fixtures

Read-only copies the tests use to parse the page's deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch's `src/`) |
| `beamdswitch.js` | yujieteo/site `templates/beamdswitch.js`, the standard report template; the folder's `beamdswitch.js` must stay identical to it |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md`, the skeleton whose `#` sections every deck follows |
| `deck.d.mts` | Not a copy: written here to type `deck.mjs` for `npm run typecheck`, so `deck.mjs` stays unedited |
