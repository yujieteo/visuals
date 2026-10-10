# beamdswitch parsers for tests

Read-only copies that `scripts/kit/checks.mjs` uses to parse a generated visual's deck the way beamdswitch
does. Do not edit them here. The template itself is `../beamdswitch.js`, the copy a new visual gets; yujieteo/site
no longer keeps the template or these files, so nothing syncs them.

| File | Copied from |
| --- | --- |
| `deck.mjs`, `deck.d.mts`, `plot.mjs`, `plot.d.mts` | yujieteo/site `tests/fixtures/beamdswitch/` (vendored there from beamdswitch's `src/`) |
| `report-template.md` | yujieteo/site `templates/beamdswitch-report.md`, the skeleton whose `#` sections every deck follows |
