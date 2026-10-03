# Findings

Failures the suite has found in the visuals, generated from the `findings` in `manifest/*.json` by `npm run findings`; do not edit by hand. Each runs as a todo test, so it is reported on every run without failing CI. The owner repository fixes the visual; when a fix lands there and reaches the site, delete the finding from the manifest (or rerun `scripts/record-findings.js` on a fresh run) and regenerate this file.

34 findings across 20 visuals, 7 marked flaky.

| Visual | Check | Browsers | Status | Evidence | Owner |
| --- | --- | --- | --- | --- | --- |
| bayes | markdown-export | * | finding | no Copy Markdown control: the page keeps a whole scenario (hypothesis, starting estimate, evidence and their judgements) but its only Markdown output is the beamdswitch presentation deck | yujieteo/bayes |
| breeden-litzenberger-density | markdown-export | * | finding | no Copy Markdown control: the page holds a session (a strike, a butterfly half-width and the densities they give) but its only Markdown output is the beamdswitch presentation deck and its copy | yujieteo/breeden-litzenberger |
| breeden-litzenberger-density | overflow-320 | firefox-desktop | finding | scrollWidth 365 > clientWidth 320: th (right 365 px); td (right 365 px) | yujieteo/visuals |
| calibrator | markdown-export | * | finding | no Copy Markdown control: the page keeps an answered session but exports it only as TOON, with no Markdown of the session state | yujieteo/calibrator |
| convexity-action-engine | markdown-export | * | finding | no Copy Markdown control: the page keeps a context and a decision history but its only Markdown output is the beamdswitch presentation deck | yujieteo/convexity-action-engine |
| delta-cohomology | markdown-export | * | finding | no Copy Markdown control: the page holds a session (a space, a ring of coefficients, an orientation and a place in the guided tour) but its only Markdown output is the beamdswitch presentation deck | yujieteo/delta-cohomology |
| distortion | markdown-export | * | finding | no Copy Markdown control: the page holds a session (a structure, five loads, presets and view settings) but its only Markdown output is the beamdswitch presentation deck | yujieteo/distortion |
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
| pigeonhole | back-forward | * | finding | after #pigeonhole → Next → #general → Next → #threshold, Back does not return to #general: entering a scene replaces the history entry (history.replaceState), so the scenes leave no history to walk | yujieteo/pigeonhole |
| probabilistic-method | back-forward | * | finding | after #first-moment/ramsey → Atlas (#atlas), Back does not return to the lab: every view and lab change replaces the history entry (history.replaceState; location.replace from file://), so the views leave no history to walk | yujieteo/probabilistic-method |
| probabilistic-method | markdown-export | * | finding | no Markdown export of a lab's session state (parameters, seed, quantities, assumptions); its Markdown controls are slide, technique-deck, course-deck and Beam MD Switch sequence exports | yujieteo/probabilistic-method |
| riemann-roch | markdown-export | * | finding | no Markdown export of the lab's session state (curve, divisor, L(D), ℓ(D)); its only Markdown control is the beamdswitch deck | yujieteo/riemann-roch |
| riemann-roch | reset | * | finding | no Reset control: after changing the divisor, only re-choosing a preset restores a known lab, which is not Reset | yujieteo/riemann-roch |
| sectionlab | overflow-320 | webkit-desktop, webkit-mobile | finding | scrollWidth 336 > clientWidth 320: line (right 746 px); table#curve-table (right 556 px); thead (right 556 px); tr (right 556 px) | yujieteo/sectionlab |
| sectionlab | reset | * | finding | no Reset control: after editing the section, only Undo or re-choosing a preset restores it, which is not Reset | yujieteo/sectionlab |
| snake-lemma | markdown-export | * | finding | no Markdown export of the session state (view, example lifts, lab moves); its only Markdown control is the beamdswitch deck | yujieteo/snake-lemma |
| stability | overflow-320 | chromium-desktop, chromium-mobile, webkit-desktop, webkit-mobile | finding | scrollWidth 349 > clientWidth 320: table#fit-table (right 473 px); thead (right 473 px); tr (right 473 px); th.l (right 473 px) | yujieteo/stability |
| stability | reset | * | finding | no Reset control: after changing an input, only re-choosing a material preset or importing a JSON file restores known inputs, which is not Reset | yujieteo/stability |
| tourist-attractions | network | * | finding | unexpected https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | yujieteo/visuals |
| tourist-attractions | primary-control | * | finding | no control changed the page (click "Show all results": no change; click "Zoom in": no change; click "Zoom out": no change) | yujieteo/visuals |
| tourist-attractions | runtime-errors | * | finding | ReferenceError: d3 is not defined \| at http://127.0.0.1:<port>/tourist-attractions/:381:12 | yujieteo/visuals |
