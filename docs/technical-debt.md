# Technical debt inventory

This file lists the debt findings for `visuals`. It covers the standalone artifact requirement, deterministic builds, the reverse dependency on the site, and command ownership with measured overlap.
Other findings stay here until a separate pull request closes them.
The architecture is in [monorepo.md](monorepo.md), [SKILLS.md](../SKILLS.md) and [e2e/README.md](../e2e/README.md).

Classes: CONFIRMED means a test or a command showed it. SUSPECTED means it is not yet shown. NOT A DEFECT means the design is intentional and useful.

## Baseline

| Item | Value |
| --- | --- |
| visuals commit | `2da4dd20375904dc1465df3240a1966327a48eea` |
| site commit read as interface evidence | `e0483bfe4bd7afd08142bebca0f6df9b4eee3cd0` |
| `python3 scripts/check_repo.py` | PASS, 0.71 s |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | PASS, 120 tests, 13.68 s |
| `node --test tests/*.test.mjs` | PASS, 23 tests, 1.83 s |
| `python3 scripts/check.py --toon --all` | PASS, 71 visuals, 725 steps, 630.36 s |
| `npm run typecheck -- --summary` | PASS, 3.17 s |
| `python3 scripts/build_catalogue.py` | PASS, 0.03 s |
| `e2e` `test:baseline`, chromium-desktop, concurrency 1 | 691 pass, 0 fail, 13 skip, 6 todo, 201.24 s |
| `e2e` full checks, chromium-desktop | 428 pass, 0 fail, 165 skip, 88 todo, 522.09 s |
| `e2e` `test:harness`, `typecheck`, `test:page-axi` | PASS |

The first attempt of the full visual check stopped when the session restarted. It has no verdict and no time.
A second run produced the numbers above.
The baseline run reported no failure.
Findings that a manifest records as todo are known and are not new.
Those todo checks run, report their failure, and do not fail the run.

## After the change

| Item | Value |
| --- | --- |
| `test:standalone`, chromium-desktop and chromium-mobile | 116 pass, 0 fail, 26 skip, about 52 s for each project |
| `test:standalone`, webkit-desktop and webkit-mobile | 116 pass, 0 fail, 26 skip |
| `test:standalone`, firefox-desktop | NOT RUN: Firefox cannot start here ("Could not find profile folder") |
| Negative proof | a fixture page that requests a CDN fails the test, and a clean fixture passes |

The standalone test adds no build step and no dependency.
It does not change any artifact.
Firefox runs in CI, where `test:standalone` runs for every browser project.
The risk is that a Firefox-only failure shows first in CI.

## Findings

### SA-1
- ID: SA-1
- Repository: visuals
- Location: `e2e/lib/baseline.js` (`file-url`), `e2e/lib/browser.js` (`openSession`)
- Problem: The `file-url` check opened the staged folder, with `data.json` and assets. It did not operate a control. The browser was not offline.
- Evidence: The folder holds the files that the site publishes, so a page that read `data.json` passed the check.
- Severity: Medium
- Maintenance cost: A future dependency on a sibling file or a network call can pass unseen.
- Proposed fix: Add `e2e/tests/standalone.test.js`. It copies the staged folder without `data.json`, opens `index.html` from `file://` in an offline context, drives the primary control, and asserts no error, no request and a changed page.
- Decision: CONFIRMED as a coverage gap, and fixed. The existing `file-url` check stays, because it detects other failures.
- Verification: 58 of 58 offline-claiming visuals pass in 4 browser projects. A fixture with a CDN request fails.

### SA-2
- ID: SA-2
- Repository: visuals
- Location: `viz/work-lanyards/index.html`, `viz/work-lanyards/e2e/manifest.json`
- Problem: The page loads product photos from `m.media-amazon.com` at run time.
- Evidence: `network` fails with 85 refused requests. The manifest records it as a known finding. The visual does not claim to work offline.
- Severity: Medium
- Maintenance cost: The photos disappear offline and when the shop changes the links. The core tables still work.
- Proposed fix: Embed the photos, or remove them, or keep the page as a hand-made snapshot. Each choice changes content or file size, so the owner must decide.
- Decision: CONFIRMED. Retained in this pull request, because the choice is a content decision. Follow-on instruction is in the p2 notes.
- Verification: The standalone test, run on a copy that claims offline use, fails on the same URLs.

### SA-3
- ID: SA-3
- Repository: visuals
- Location: `viz/stealth-rcs/index.html` (`img/` paths), `viz/stealth-rcs/visual.json` (`assets`)
- Problem: The photos are separate published files, not inline.
- Evidence: Without `img/`, the page raises 404 errors for the photos. With the declared assets, it passes offline.
- Severity: Low
- Maintenance cost: A copy of only `index.html` loses the photos.
- Proposed fix: None now. The assets are declared in `visual.json`, the site publishes them, and inline photos would add about 12 JPEG files to the page.
- Decision: NOT A DEFECT. Media assets declared in `visual.json` are an allowed published file. The contract test copies them.
- Verification: `test:standalone` for `stealth-rcs` passes in 4 browser projects.

### SA-4
- ID: SA-4
- Repository: visuals
- Location: `viz/<slug>/data.json`, `raw.json`, `raw.csv`
- Problem: The data file is published beside the page. A reader can suspect that the page needs it.
- Evidence: The test removes `data.json` and every offline-claiming page still works. The data is inline in `index.html`.
- Severity: Low
- Maintenance cost: None found.
- Proposed fix: None.
- Decision: NOT A DEFECT. `data.json` is a download for readers and agents.
- Verification: `test:standalone`.

### SA-5
- ID: SA-5
- Repository: visuals
- Location: `scripts/rules.py` (`requests`), `e2e/lib/baseline.js` (`network`)
- Problem: A reader can suspect that the request checks repeat each other.
- Evidence: `requests` reads the source and finds computed URLs and CSS imports. `network` observes real requests in a browser. Each finds failures that the other cannot.
- Severity: None
- Maintenance cost: Low.
- Proposed fix: None.
- Decision: NOT A DEFECT. Keep both.
- Verification: Both ran in the baseline and passed, except the recorded `work-lanyards` finding.

### SA-6
- ID: SA-6
- Repository: visuals
- Location: `viz/*/e2e/manifest.json` and `visual.json` (`offline`, summary text)
- Problem: 13 visuals do not claim to work offline, so `file-url` and `test:standalone` skip them.
- Evidence: A copy of each with an offline claim passed `test:standalone` in Chromium, except `work-lanyards` (SA-2). The other 12 are `data-workbench`, `manchester-city-finances`, `marvell`, `multi-armed-bandit`, `ooda-orientation`, `panw`, `root-locus`, `sectionlab`, `singapore-covid-governance-hindsight`, `social-values-surveydata`, `tampines-food-map` and `tourist-attractions`.
- Severity: Low
- Maintenance cost: A regression in these 11 is not caught by the contract.
- Proposed fix: Set `"offline": true` in 11 of the 12 manifests, one pull request each owner may review. Do not change page text.
- Decision: CONFIRMED, and fixed: `"offline": true` is set in the 11 manifests. `tampines-food-map` had no manifest, so one is added that holds only that key. `data-workbench` stays without the claim: its spec says the page opens from the site, not from `file://`. No page text changes.
- Verification: For the 11 visuals, `test:standalone` gives 11 pass, 0 fail in chromium-desktop, chromium-mobile, webkit-desktop and webkit-mobile. `test:baseline` gives 0 fail in the same 4 projects, and its `file-url` check now runs and passes for each of the 11. Firefox could not start here, so CI is the first Firefox run.

### SA-7
- ID: SA-7
- Repository: visuals
- Location: `viz/*/beamdswitch.js`, `scripts/templates/beamdswitch.sha256`
- Problem: The site owns the beamdswitch report template, and every narrated visual keeps a byte copy.
- Evidence: The `template` step compares each copy with a recorded SHA-256. The site's tests compare its template with these copies.
- Severity: None
- Maintenance cost: One mechanical sync pull request for each template change.
- Proposed fix: None. Each copy keeps the visual self-contained.
- Decision: NOT A DEFECT. This is a frozen copy that improves independence. The canonical owner is yujieteo/site `templates/beamdswitch.js`.
- Verification: `python3 scripts/check_repo.py` and the `template` step passed.

### SA-8
- ID: SA-8
- Repository: visuals
- Location: `viz/*/e2e/manifest.json` (`findings`), 88 todo results in the full checks
- Problem: Many visuals record known failures of the fuller checks (URL state, Back, command palette, exports).
- Evidence: The full checks in Chromium gave 83 recorded failures as todo and 0 unexpected failures.
- Severity: Low
- Maintenance cost: Each is a known gap in one visual, not a shared defect.
- Proposed fix: Out of scope. Each visual owner closes its own findings.
- Decision: SUSPECTED, retained.
- Verification: The per-check results of the baseline run, kept with the task evidence..

### SA-9
- ID: SA-9
- Repository: visuals
- Location: `.no-mistakes.yaml`, `.github/workflows/ci.yml`
- Problem: The gate test step runs no browser, so `test:standalone` runs only in CI.
- Evidence: The file says the gate runs no browser and no real network on purpose.
- Severity: Low
- Maintenance cost: A browser failure shows in CI and not in the gate.
- Proposed fix: None. The step stays cheap on purpose.
- Decision: NOT A DEFECT.
- Verification: CI runs `npm run test:standalone` after the baseline step in every browser project.

### DB-1
- ID: DB-1
- Repository: visuals
- Location: `scripts/check.py` (`check`, the default `build` step), `viz/{beamdiag,edge-pitch,generating-functions,lug-joint,stability,vgc-protect-fakeout-pivot-trainer}/build.py`
- Problem: The default `build` step runs `build.py --verify`. Six builders ignore `--verify` and write the page. The step then passes even when the committed page is stale.
- Evidence: In a scratch copy, a changed `index.html` of each of the six was rewritten by `build.py --verify` with exit code 0. See `verify-drift.txt` in the task evidence.
- Severity: Medium
- Maintenance cost: A stale generated page can pass `check.py` and show only as a diff in the working tree.
- Proposed fix: `check.py` records the folder files before the `build` step. It fails the visual when the step changed a file, and it restores the files. No builder changes.
- Decision: CONFIRMED, and fixed. The builders stay as they are, because a visual owns its builder.
- Verification: `tests/test_check.py` has a builder that writes (fails, folder restored) and a builder that only checks (passes). All 41 builders run clean with no change. `check.py --toon --changed main`: 71 visuals, 725 steps, 0 fail.

### DB-2
- ID: DB-2
- Repository: visuals
- Location: `viz/*/build.py` (41 builders), `build/` (ignored by Git)
- Problem: A reader can suspect that a second build changes the generated output.
- Evidence: In a scratch copy of HEAD, each of the 41 builders ran twice. Both runs exited 0 and changed no tracked file. `build/catalogue.json` and `build/index.html` have the same SHA-256 after two runs of `build_catalogue.py`. `build/` is ignored by Git.
- Severity: None
- Maintenance cost: None found.
- Proposed fix: None.
- Decision: NOT A DEFECT. Builds are deterministic, and the canonical data (`raw.*`, `meta.json`) stays apart from the generated page.
- Verification: `rebuild-twice.sh` and `rebuild-twice.txt` in the task evidence. A page that a builder embeds into a hand-written `index.html` (for example `stealth-rcs`) checks only its generated blocks, by design.

### RD-1
- ID: RD-1
- Repository: visuals
- Location: `e2e/scripts/fetch-targets.js`, `e2e/lib/targets.js` (`E2E_SITE`), the `Fetch yujieteo/site` step of `.github/workflows/ci.yml`
- Problem: `fetch-targets` clones `yujieteo/site` at its `main` branch. A change in the site can change a visuals test result.
- Evidence: Only the jobs with `site: true` fetch it: a change under `e2e/site/<slug>/`, and the job for every site-kept visual (`scripts/changed.py`). No job for a visual in `viz/` fetches or reads the site. `build_catalogue.py`, `check.py` and `check_repo.py` read no site file.
- Severity: Low
- Maintenance cost: A site change can fail a visuals job for `beamdswitch` or `connes-qft`. Those two visuals live in the site, so the failure is correct.
- Proposed fix: None now. `npm run fetch-targets <ref>` already takes a branch, tag or commit. A fixed pin would add a file, and the pin of the site revision belongs to the site task.
- Decision: NOT A DEFECT for the core artifacts. The dependency covers the visuals that the site keeps, and it is optional (`E2E_SITE` can be absent). The scheduled run needs the floating revision on purpose, to find new site changes.
- Verification: `grep` of `scripts/`, `tests/` and `viz/` finds no read of a site clone. The template copies (SA-7) are frozen in `viz/*/beamdswitch.js` and compared with a recorded SHA-256, not with a site checkout.

### VC-1
- ID: VC-1
- Repository: visuals
- Location: the commands in the table "Verification commands"
- Problem: Several commands look alike: `check_repo.py` and `build_catalogue.py` both read every `visual.json`; `requests` and `network`, `file-url` and `test:standalone`, and `template` and `check_repo.py` all inspect the same files or pages.
- Evidence: Each pair fails on a different input (the "Detects" column). `build_catalogue.py` costs 0.03 s, `check_repo.py` 0.71 s, and `requests` runs inside the visual's own step. The slow commands are the node tests of the visuals (365 s of 664 s, on one core) and the browser suites. No pair has the same failure set.
- Severity: Low
- Maintenance cost: Low. No overlapping command costs more than 1 s of a run.
- Proposed fix: None. Removing one command of a pair would lose a failure mode. The time is in tests that protect the mathematical and data results.
- Decision: NOT A DEFECT. Keep every command. No check is removed, weakened or retimed.
- Verification: The times in the table come from the runs recorded in `step-times.json` and in the baseline above. The step names `template`, `requests`, `contrast`, `theme`, `pydead`, `sourcetests`, `tools`, `vendor` and `generated` run in memory, so they have no time of their own (the total of 664 s includes them).

## Verification commands

Owner: the repository owner `yujieteo`, through the file that defines the command. The visual folder owns its own `checks`, tests and `e2e/` files.
Times: one run on the author machine, one core, Python 3.13 and Node 22, on 2026-10-08. The numbers are measured, not estimated.

| Command | Defined in | Purpose | Detects | Time |
| --- | --- | --- | --- | --- |
| `python3 scripts/check_repo.py` | `scripts/check_repo.py` | Fast repository check on every change | Invalid `visual.json`, a file named but missing, a home path, a tracked build or OS artifact, a Python file that does not parse, stale vendored MathJax, kit or template copies | 0.71 s |
| `python3 -m unittest discover -s tests -p 'test_*.py'` | `tests/` | Unit tests of the shared tooling, on Python 3.9 and 3.12 in CI | A wrong result of `check.py`, `changed.py`, `rules.py`, `new_visual.py`, `refresh_kit.py` and the other tools | 13.7 s (120 tests) |
| `node --test tests/*.test.mjs` | `tests/` | Tests of the type check, the dead-code check and the shared beamdswitch and theme code | A broken `typecheck.mjs`, `deadcode.mjs` or shared script | 1.5 s |
| `npm run typecheck` | `scripts/typecheck.mjs` | `tsc` over the shared tooling, one project for each visual with a `tsconfig.json` | A JSDoc type error | 3.2 s |
| `python3 scripts/check.py <slug>` | `scripts/check.py` | One visual: build, its node and Python tests, types and the rule steps | A stale page (DB-1), a failing visual test, a type error, a rule finding | 664 s for 71 visuals, 725 steps |
| `check.py` step `build` | `viz/<slug>/build.py` | The builder verifies its output | Stale generated output | 1.8 s for 29 default steps |
| `check.py` step `node` and `python` | `viz/<slug>/tests/` | Mathematical results, data, WebMCP tools, exports | A wrong model, wrong data, a broken tool | 365 s for 52 node steps, 3.6 s for 9 Python steps |
| `check.py` custom `checks` | `viz/<slug>/visual.json` | Replaces the default steps where they do not fit | The same failures, with the visual's commands | 238 s for 42 commands |
| `check.py` step `types` | `scripts/typecheck.mjs` | Type check of the page's inline scripts | A type error in an inline script | 3.9 s for 27 visuals |
| `check.py` step `deadcode` | `scripts/deadcode.mjs` | Unused locals, unreachable code, duplicate declarations | Dead or doubled code | 9.1 s for 71 visuals |
| `check.py` rule steps | `scripts/rules.py` | `template`, `requests`, `contrast`, `theme`, `pydead`, `sourcetests`, `tools`, `vendor`, `generated` | See [monorepo.md](monorepo.md#checks) | in memory, no own time |
| `python3 scripts/build_catalogue.py [--verify]` | `scripts/build_catalogue.py` | Generates the ignored `build/` catalogue and gallery | An invalid catalogue entry | 0.03 s |
| `python3 scripts/new_visual.py --check --all` | `scripts/new_visual.py` | A generated visual holds the current mechanical files | Drift from the generator | 0.17 s |
| `python3 scripts/changed.py` | `scripts/changed.py` | Maps a diff to the visuals and browser jobs | A wrong job plan | 0.09 s |
| `npm run test:baseline` (`e2e`) | `e2e/lib/baseline.js` | Browser baseline: load, errors, requests, accessibility, `file://` | A console error, a refused request, an accessibility violation | 201 s (chromium-desktop, baseline run) |
| `npm run test:standalone` (`e2e`) | `e2e/tests/standalone.test.js` | Offline `file://` contract in an empty folder | A hidden dependency on a sibling file or the network | about 52 s per project |
| `npm run test:full` and each `viz/<slug>/e2e/full.test.mjs` | the visual | Fuller checks of the visual | Known findings (todo) and new failures | 522 s (chromium-desktop, baseline run) |
| `npm run test:harness`, `npm run typecheck`, `npm run test:page-axi` (`e2e`) | `e2e/` | The harness itself, its types, `page-axi` on fixtures | A broken harness | 0.4 s, 0.2 s, 5.0 s |

The CI file `.github/workflows/ci.yml` runs these commands in one job each: repository (Python 3.9 and 3.12), one job per touched visual, and one browser job per touched visual and project. `.no-mistakes.yaml` runs the cheap subset that needs no browser.

## Requirement map

Each visuals-side P1 and P2 requirement, with its status and evidence. Pull requests: [#106](https://github.com/yujieteo/visuals/pull/106), [#107](https://github.com/yujieteo/visuals/pull/107), [#108](https://github.com/yujieteo/visuals/pull/108), [#109](https://github.com/yujieteo/visuals/pull/109).

| Requirement | Status | Evidence |
| --- | --- | --- |
| P1 ownership: list shared and copied files and name the canonical source | Done | Table "Canonical owners of shared interfaces" below, with SA-7 |
| P1 ownership: remove unnecessary reverse dependencies | Done, none found | RD-1: no core artifact, builder or check reads the site. Only the site-kept visuals read a site clone |
| P1 ownership: keep frozen copies and test boundaries | Kept | SA-7, and no test file was merged or removed |
| P1 verification tools: list, owner, purpose, time, failures | Done | Table "Verification commands" |
| P1 verification tools: find repeated checks, remove only when equivalent | Done, none removed | VC-1 |
| P1 generated artifacts: generated files stay outside Git | Confirmed | `build/` and `.typecheck/` are in `.gitignore`; `check_repo.py` fails on a tracked build artifact |
| P1 generated artifacts: reproducible build and an unchanged second build | Confirmed, and a gap fixed | DB-2 for 41 builders; DB-1 for the `build` step that could not fail |
| P1 generated artifacts: keep canonical data, sources and history apart from output | Kept | No data or source file changed in any of the four pull requests |
| P1 generated artifacts: an archived visual needs no site generator | Confirmed | SA-1 and SA-4: `test:standalone` runs each offline-claiming page from an empty folder |
| P2 site-specific maintenance (visuals side) | Done, nothing to change here | The two site-kept visuals keep their checks in `e2e/site/`; the site owns their code. Publication logic stays in the site |
| Standalone and offline contract | Done | SA-1 to SA-6; 11 more visuals now run the contract (SA-6) |
| Known findings kept | Kept | SA-2 (`work-lanyards` photos, content decision of the owner) and SA-8 (recorded findings) |

## Report

Repository commits: visuals `b306894` (#106), `cabbc95` (#107), `8a34eee` (#108), `c90999c` (#109). The site commit read as interface evidence is `e0483bfe4bd7afd08142bebca0f6df9b4eee3cd0`.
Issues fixed: SA-1, SA-6 (11 of 12 visuals), DB-1.
Issues retained: SA-2 and SA-8 (owner decisions), `data-workbench` in SA-6, and the findings that are not defects.
Tests passed: the checks named in "Baseline", "After the change", DB-1 and SA-6, each with its recorded run.
Tests not run: Firefox projects (Firefox cannot start on the author machine; CI runs them). The `file-url` result of `data-workbench` differed between the author machine and CI, see SA-6.
Build time before and after: a second build changes nothing, and `check.py` over all 71 visuals took 630 s before and 664 s after, within the noise of one run on one machine. The change adds one file snapshot to each default build step.
Test time before and after: the unit tests took 13.7 s before and about 13 s after. The standalone contract adds about 52 s for each browser project in CI.
New dependencies: none. Removed dependencies: none.
Remaining risks: the Firefox result is first seen in CI; the WebKit jobs in CI can hang or time out (tracked apart from this file); the site clone in the browser jobs follows the site `main` branch.

## Canonical owners of shared interfaces

| Interface | Canonical owner | Copies |
| --- | --- | --- |
| beamdswitch report template | site `templates/beamdswitch.js` | `viz/*/beamdswitch.js`, `scripts/templates/beamdswitch.js` |
| Theme script and style tokens | visuals `scripts/style_guide.py`, `scripts/kit/style-tokens.css` (source yujieteo/skills) | inline in each page |
| Catalogue entry of a visual | visuals `viz/<slug>/visual.json` | read by the site build |
| Published files of a visual | visuals `viz/<slug>/` (`index.html`, `data.json`, declared assets) | copied by the site build |
| Standalone contract | visuals `e2e/tests/standalone.test.js` | none |

Site revision pinning is outside this pull request. The counterpart site task owns it.

## Live evidence

The author ran this check live on 2026-10-08. It ran outside the pipeline.

Command: `cd e2e && E2E_PROJECTS=chromium-desktop E2E_ONLY=mohr,theorem-explorer,okr-setter node --test tests/standalone.test.js`.

The command starts one headless Chromium. It closes the browser afterwards.

For each visual, the test copies the built folder into an empty scratch folder. The copy has no `data.json`.

The test opens `index.html` from file:// in an offline browser context. It operates the primary control.

The test asserts no error, no request and a changed page.

Result: 3 pass, 0 fail. Time: mohr 1207 ms, okr-setter 757 ms, theorem-explorer 1020 ms, total 1.59 s.

Full run of all 58 offline-claiming visuals: 58 pass in each of chromium-desktop, chromium-mobile, webkit-desktop and webkit-mobile.

Limit: Firefox did not start in the author environment. The standalone test is untested in Firefox until CI runs it.
