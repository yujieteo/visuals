# beamdswitch test fixtures

Read-only copies the tests use to parse the page's deck the way beamdswitch itself does. Do not edit them here.

| File | Copied from |
| --- | --- |
| `deck.mjs`, `plot.mjs` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch's `src/`) |
| `beamdswitch.js` | yujieteo/site `templates/beamdswitch.js`, the standard report template; the folder's `beamdswitch.js` must stay identical to it |
| `deck.d.mts`, `plot.d.mts` | Not copied: written here to type `deck.mjs` and `plot.mjs` for `npm run typecheck`, which reads them in place of the untyped copies |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md`, the skeleton whose `#` sections every deck follows |
