# Findings

Failures the suite has found in the visuals, generated from the `findings` in `manifest/*.json` by `npm run findings`; do not edit by hand. Each runs as a todo test, so it is reported on every run without failing CI. The owner repository fixes the visual; when a fix lands there and reaches the site, delete the finding from the manifest (or rerun `scripts/record-findings.js` on a fresh run) and regenerate this file.

20 findings across 11 visuals, 7 marked flaky.

| Visual | Check | Browsers | Status | Evidence | Owner |
| --- | --- | --- | --- | --- | --- |
| breeden-litzenberger-density | overflow-320 | firefox-desktop | finding | scrollWidth 365 > clientWidth 320: th (right 365 px); td (right 365 px) | yujieteo/visuals |
| entropy-combinatorics | markdown-export | * | finding | no Copy Markdown of the reader's session state (revealed hints, solved problems, laboratory settings); Copy Markdown in the BeamMD Switch menu copies a presentation deck | yujieteo/entropy-combinatorics |
| etale-fundamental-group | markdown-export | * | finding | no Markdown export of the laboratory's state (object, view and sliders); its only Markdown export is the beamdswitch deck | yujieteo/etale-fundamental-group |
| everyday-actions | markdown-export | * | finding | no Markdown export of the reconsideration ledger, the page's own session state; its only Markdown export is the beamdswitch deck of the charts | yujieteo/everyday-actions |
| everyday-actions | overflow-320 | * | finding | scrollWidth 369 > clientWidth 320: table#ledger.ledger (right 501 px); thead (right 501 px); tr (right 501 px); th (right 501 px) | yujieteo/everyday-actions |
| fbd | beamdswitch-export | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fbd | file-url | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fbd | json-round-trip | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fbd | keyboard | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fbd | markdown-export | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fbd | reset | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fbd | runtime-errors | chromium-mobile | flaky | uncaught TypeError: Cannot set properties of null (setting 'disabled') at draw (http://127.0.0.1:<port>/fbd/:1699:22): a draw scheduled before boot() builds the toolbar finds no #undo button | yujieteo/fbd |
| fpl-expected-goals | reduced-motion | * | finding | still moves under reduced motion: div#tip transition 0.1s + actual - expected | yujieteo/fpl-expected-goals |
| manchester-city-finances | markdown-export | * | finding | no Markdown export of the lane filter and selected item (canonical spec section 14); the only Markdown the page writes is the beamdswitch deck | yujieteo/manchester-city-finances |
| packets-to-playback | markdown-export | * | finding | no Markdown export of the scenario's state (canonical spec section 14); the only Markdown the page writes is the beamdswitch deck | yujieteo/packets-to-playback |
| sectionlab | overflow-320 | webkit-desktop, webkit-mobile | finding | scrollWidth 336 > clientWidth 320: line (right 746 px); table#curve-table (right 556 px); thead (right 556 px); tr (right 556 px) | yujieteo/sectionlab |
| stability | overflow-320 | chromium-desktop, chromium-mobile, webkit-desktop, webkit-mobile | finding | scrollWidth 349 > clientWidth 320: table#fit-table (right 473 px); thead (right 473 px); tr (right 473 px); th.l (right 473 px) | yujieteo/stability |
| tourist-attractions | network | * | finding | unexpected https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | yujieteo/visuals |
| tourist-attractions | primary-control | * | finding | no control changed the page (click "Show all results": no change; click "Zoom in": no change; click "Zoom out": no change) | yujieteo/visuals |
| tourist-attractions | runtime-errors | * | finding | ReferenceError: d3 is not defined \| at http://127.0.0.1:<port>/tourist-attractions/:381:12 | yujieteo/visuals |
