# Findings

Failures the suite has found in the visuals, generated from the `findings` in `manifest/*.json` by `npm run findings`; do not edit by hand. Each runs as a todo test, so it is reported on every run without failing CI. The owner repository fixes the visual; when a fix lands there and reaches the site, delete the finding from the manifest (or rerun `scripts/record-findings.js` on a fresh run) and regenerate this file.

110 findings across 35 visuals, 8 marked flaky.

| Visual | Check | Browsers | Status | Evidence | Owner |
| --- | --- | --- | --- | --- | --- |
| bayes | markdown-export | * | finding | no Copy Markdown control: the page keeps a whole scenario (hypothesis, starting estimate, evidence and their judgements) but its only Markdown output is the beamdswitch presentation deck | yujieteo/bayes |
| beamdswitch | back-forward | * | finding | frames rewrite the hash with history.replaceState, so Back leaves the page instead of returning to the previous frame | yujieteo/beamdswitch |
| beamdswitch | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog> (/ and O open the frame overview search) | yujieteo/beamdswitch |
| beamdswitch | json-round-trip | * | finding | no control saves the view as JSON to import again (the deck saves and opens as Markdown) | yujieteo/beamdswitch |
| beamdswitch | reduced-motion | * | finding | still moves under reduced motion: div#progress transition 0.15s; fixed in https://github.com/yujieteo/beamdswitch/pull/9; reaches the site when it re-vendors beamdswitch | yujieteo/beamdswitch |
| beamdswitch | reset | * | finding | no Reset control: no button named Reset returns the player to its first frame (Sample replaces the editor with the sample deck, which is re-choosing an example, not Reset) | yujieteo/beamdswitch |
| breeden-litzenberger-density | markdown-export | * | finding | no Copy Markdown control: the page holds a session (a strike, a butterfly half-width and the densities they give) but its only Markdown output is the beamdswitch presentation deck and its copy | yujieteo/breeden-litzenberger |
| breeden-litzenberger-density | overflow-320 | firefox-desktop | finding | scrollWidth 365 > clientWidth 320: th (right 365 px); td (right 365 px) | yujieteo/visuals |
| calibrator | markdown-export | * | finding | no Copy Markdown control: the page keeps an answered session but exports it only as TOON, with no Markdown of the session state | yujieteo/calibrator |
| connes-qft | back-forward | * | finding | views rewrite the hash with history.replaceState, so Back leaves the page instead of returning to the previous view | yujieteo/connes-qft |
| connes-qft | json-round-trip | * | finding | no control saves the view as JSON to import again | yujieteo/connes-qft |
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
| frequency-response | back-forward | * | finding | Back stays in the visual and steps back through its states (spec section 12) | yujieteo/frequency-response |
| frequency-response | command-palette | * | finding | Cmd/Ctrl+K opens a command palette (spec section 11) | yujieteo/frequency-response |
| frequency-response | reset | * | finding | the page has a Reset control (spec section 28) | yujieteo/frequency-response |
| frequency-response | url-state | * | finding | choosing discrete time records the state in the URL (spec section 12) | yujieteo/frequency-response |
| generating-functions | markdown-export | * | finding | Copy Markdown copies the session state, not the beamdswitch deck (spec section 14) | yujieteo/generating-functions |
| grep-visualiser | back-forward | * | finding | Back stays in the visual and steps back through its states (spec section 12) | yujieteo/grep-visualiser |
| grep-visualiser | command-palette | * | finding | Cmd/Ctrl+K opens a command palette (spec section 11) | yujieteo/grep-visualiser |
| grep-visualiser | json-round-trip | * | finding | the page exports its state as JSON (spec section 14) | yujieteo/grep-visualiser |
| grep-visualiser | markdown-export | * | finding | the page copies its session state as Markdown (spec section 14) | yujieteo/grep-visualiser |
| grep-visualiser | reset | * | finding | the page has a Reset control (spec section 28) | yujieteo/grep-visualiser |
| grep-visualiser | url-state | * | finding | editing the pattern records the state in the URL (spec section 12) | yujieteo/grep-visualiser |
| haze-singapore | back-forward | * | finding | Back stays in the visual and steps back through its states (spec section 12) | yujieteo/haze-singapore |
| haze-singapore | command-palette | * | finding | Cmd/Ctrl+K opens a command palette (spec section 11) | yujieteo/haze-singapore |
| haze-singapore | json-round-trip | * | finding | the page exports and imports its view as JSON (spec section 14) | yujieteo/haze-singapore |
| haze-singapore | markdown-export | * | finding | the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14) | yujieteo/haze-singapore |
| haze-singapore | reset | * | finding | the page has a Reset control (spec section 28) | yujieteo/haze-singapore |
| haze-singapore | url-state | * | finding | choosing the hour and measure records them in the URL (spec section 12) | yujieteo/haze-singapore |
| infer-a-theory | back-forward | * | finding | Back stays in the visual and steps back through its states (spec section 12) | yujieteo/infer-a-theory |
| infer-a-theory | command-palette | * | finding | Cmd/Ctrl+K opens a command palette (spec section 11) | yujieteo/infer-a-theory |
| infer-a-theory | json-round-trip | * | finding | the page exports and imports its state as JSON (spec section 14) | yujieteo/infer-a-theory |
| infer-a-theory | markdown-export | * | finding | the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14) | yujieteo/infer-a-theory |
| infer-a-theory | url-state | * | finding | loading the binary example records the state in the URL (spec section 12) | yujieteo/infer-a-theory |
| infer-a-theory | primary-control | firefox-desktop | flaky | under parallel load, the inference the page starts on load (about 11 s in Firefox) can hold the page so long that clicking Binary example times out after 5 s; it passes when run alone | yujieteo/infer-a-theory |
| information-gain | back-forward | * | finding | Back stays in the visual and steps back through its states (spec section 12) | yujieteo/information-gain |
| information-gain | command-palette | * | finding | Cmd/Ctrl+K opens a command palette (spec section 11) | yujieteo/information-gain |
| information-gain | json-round-trip | * | finding | the page exports and imports its scenario as JSON (spec section 14) | yujieteo/information-gain |
| information-gain | url-state | * | finding | choosing an example records the scenario in the URL (spec section 12) | yujieteo/information-gain |
| kent | back-forward | * | finding | Back stays in the visual and steps back to the previous estimate (spec section 12) | yujieteo/kent |
| kent | markdown-export | * | finding | the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14) | yujieteo/kent |
| lug-joint | back-forward | * | finding | Back stays in the visual and steps back to the previous input (spec section 12) | yujieteo/lug-joint |
| lug-joint | command-palette | * | finding | Cmd/Ctrl+K opens a command palette (spec section 11) | yujieteo/lug-joint |
| lug-joint | markdown-export | * | finding | the page copies its session state as Markdown, separate from the beamdswitch deck (spec section 14) | yujieteo/lug-joint |
| lug-joint | reset | * | finding | the page has a Reset control (spec section 28) | yujieteo/lug-joint |
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
| subsidy-atlas | url-state | * | finding | the URL does not change when the view changes: the page keeps no URL state | yujieteo/subsidy-atlas |
| subsidy-atlas | back-forward | * | finding | history.length does not grow when the view changes, so Back leaves the page | yujieteo/subsidy-atlas |
| subsidy-atlas | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog> | yujieteo/subsidy-atlas |
| subsidy-atlas | json-round-trip | * | finding | no control saves the view as JSON to import again (data.json is the dataset, not the filter state) | yujieteo/subsidy-atlas |
| subsidy-atlas | markdown-export | * | finding | no control exports the view as Markdown: the only Markdown is the narrated beamdswitch deck | yujieteo/subsidy-atlas |
| tampines-food | url-state | * | finding | the URL does not change when the view changes: the page keeps no URL state | yujieteo/tampines-food |
| tampines-food | back-forward | * | finding | history.length does not grow when the view changes, so Back leaves the page | yujieteo/tampines-food |
| tampines-food | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog> | yujieteo/tampines-food |
| tampines-food | reset | * | finding | no Reset control: no button named Reset; choosing All in each chip row clears the filters | yujieteo/tampines-food |
| tampines-food | json-round-trip | * | finding | no control saves the view as JSON to import again | yujieteo/tampines-food |
| tampines-food | markdown-export | * | finding | no control exports the view as Markdown: the only Markdown is the narrated beamdswitch deck | yujieteo/tampines-food |
| toto-frequency | url-state | * | finding | the URL does not change when the view changes: the page keeps no URL state | yujieteo/toto-frequency |
| toto-frequency | back-forward | * | finding | history.length does not grow when the view changes, so Back leaves the page | yujieteo/toto-frequency |
| toto-frequency | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog> | yujieteo/toto-frequency |
| toto-frequency | reset | * | finding | no Reset control: no button named Reset | yujieteo/toto-frequency |
| toto-frequency | json-round-trip | * | finding | no control saves the view as JSON to import again | yujieteo/toto-frequency |
| toto-frequency | markdown-export | * | finding | no control exports the view as Markdown: the only Markdown is the narrated beamdswitch deck | yujieteo/toto-frequency |
| toulmin | url-state | * | finding | the URL does not change when the view changes: the page keeps no URL state (the draft lives in localStorage) | yujieteo/toulmin |
| toulmin | back-forward | * | finding | history.length does not grow when the view changes, so Back leaves the page | yujieteo/toulmin |
| toulmin | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog> | yujieteo/toulmin |
| toulmin | markdown-export | * | finding | no control exports the view as Markdown: the only Markdown is the narrated beamdswitch deck | yujieteo/toulmin |
| tourist-attractions | network | * | finding | unexpected https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js | yujieteo/visuals |
| tourist-attractions | primary-control | * | finding | no control changed the page (click "Show all results": no change; click "Zoom in": no change; click "Zoom out": no change) | yujieteo/visuals |
| tourist-attractions | runtime-errors | * | finding | ReferenceError: d3 is not defined \| at http://127.0.0.1:<port>/tourist-attractions/:381:12 | yujieteo/visuals |
| tourist-attractions | url-state | * | finding | the URL does not change when the view changes: the page keeps no URL state; on the published copy D3 also fails to load from cdn.jsdelivr.net (ReferenceError: d3 is not defined) | yujieteo/tourist-attractions |
| tourist-attractions | back-forward | * | finding | history.length does not grow when the view changes, so Back leaves the page; on the published copy D3 also fails to load from cdn.jsdelivr.net (ReferenceError: d3 is not defined) | yujieteo/tourist-attractions |
| tourist-attractions | keyboard | * | finding | ReferenceError: d3 is not defined: the published copy loads D3 from cdn.jsdelivr.net, which the suite refuses, so its controls never start; inlining D3 (https://github.com/yujieteo/visuals/pull/35, https://github.com/yujieteo/tourist-attractions/pull/3) makes this check pass once the site pin moves | yujieteo/visuals |
| tourist-attractions | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog>; on the published copy D3 also fails to load from cdn.jsdelivr.net (ReferenceError: d3 is not defined) | yujieteo/tourist-attractions |
| tourist-attractions | reset | * | finding | ReferenceError: d3 is not defined: the published copy loads D3 from cdn.jsdelivr.net, which the suite refuses, so its controls never start; inlining D3 (https://github.com/yujieteo/visuals/pull/35, https://github.com/yujieteo/tourist-attractions/pull/3) makes this check pass once the site pin moves | yujieteo/visuals |
| tourist-attractions | json-round-trip | * | finding | no control saves the view as JSON to import again; on the published copy D3 also fails to load from cdn.jsdelivr.net (ReferenceError: d3 is not defined) | yujieteo/tourist-attractions |
| tourist-attractions | markdown-export | * | finding | no control exports the view as Markdown: the only Markdown is the narrated beamdswitch deck | yujieteo/tourist-attractions |
| tourist-attractions | beamdswitch-export | * | finding | ReferenceError: d3 is not defined: the published copy loads D3 from cdn.jsdelivr.net, which the suite refuses, so its controls never start; inlining D3 (https://github.com/yujieteo/visuals/pull/35, https://github.com/yujieteo/tourist-attractions/pull/3) makes this check pass once the site pin moves | yujieteo/visuals |
| tourist-attractions | reduced-motion | * | finding | ReferenceError: d3 is not defined: the published copy loads D3 from cdn.jsdelivr.net, which the suite refuses, so its controls never start; inlining D3 (https://github.com/yujieteo/visuals/pull/35, https://github.com/yujieteo/tourist-attractions/pull/3) makes this check pass once the site pin moves | yujieteo/visuals |
| vgc-protect-fakeout-pivot-trainer | url-state | * | finding | the URL does not change when the view changes: the page keeps no URL state | yujieteo/vgc-trainer |
| vgc-protect-fakeout-pivot-trainer | back-forward | * | finding | history.length does not grow when the view changes, so Back leaves the page | yujieteo/vgc-trainer |
| vgc-protect-fakeout-pivot-trainer | command-palette | * | finding | Cmd/Ctrl+K opens nothing: no [role=dialog], [role=combobox] or open <dialog> | yujieteo/vgc-trainer |
| vgc-protect-fakeout-pivot-trainer | json-round-trip | * | finding | no control saves the view as JSON to import again | yujieteo/vgc-trainer |
| vgc-protect-fakeout-pivot-trainer | markdown-export | * | finding | no control exports the analysis as Markdown | yujieteo/vgc-trainer |
| vgc-protect-fakeout-pivot-trainer | beamdswitch-export | * | finding | no control exports a beamdswitch deck | yujieteo/vgc-trainer |
