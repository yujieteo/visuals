# Findings

Failures the suite has found in the visuals, generated from the `findings` in `manifest/*.json` by `npm run findings`; do not edit by hand. Each runs as a todo test, so it is reported on every run without failing CI. The owner repository fixes the visual; when a fix lands there and reaches the site, delete the finding from the manifest (or rerun `scripts/record-findings.js` on a fresh run) and regenerate this file.

7 findings across 5 visuals.

| Visual | Check | Browsers | Status | Evidence | Owner |
| --- | --- | --- | --- | --- | --- |
| breeden-litzenberger-density | overflow-320 | firefox-desktop | finding | scrollWidth 365 > clientWidth 320: th (right 365 px); td (right 365 px) | yujieteo/visuals |
| everyday-actions | overflow-320 | * | finding | scrollWidth 369 > clientWidth 320: table#ledger.ledger (right 501 px); thead (right 501 px); tr (right 501 px); th (right 501 px) | yujieteo/everyday-actions |
| sectionlab | overflow-320 | webkit-desktop, webkit-mobile | finding | scrollWidth 336 > clientWidth 320: line (right 746 px); table#curve-table (right 556 px); thead (right 556 px); tr (right 556 px) | yujieteo/sectionlab |
| stability | overflow-320 | chromium-desktop, chromium-mobile, webkit-desktop, webkit-mobile | finding | scrollWidth 349 > clientWidth 320: table#fit-table (right 473 px); thead (right 473 px); tr (right 473 px); th.l (right 473 px) | yujieteo/stability |
| tourist-attractions | network | * | finding | unexpected https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | yujieteo/visuals |
| tourist-attractions | primary-control | * | finding | no control changed the page (click "Show all results": no change; click "Zoom in": no change; click "Zoom out": no change) | yujieteo/visuals |
| tourist-attractions | runtime-errors | * | finding | ReferenceError: d3 is not defined \| at http://127.0.0.1:<port>/tourist-attractions/:381:12 | yujieteo/visuals |
