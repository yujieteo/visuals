# Technical debt inventory

This file lists the debt findings for `visuals`. It covers the standalone artifact requirement.
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
- Maintenance cost: A regression in these 12 is not caught by the contract.
- Proposed fix: Set `"offline": true` in each of the 12 manifests, one pull request each owner may review. Do not change page text.
- Decision: SUSPECTED gap. The claim is a statement by the visual owner, so this pull request does not set it.
- Verification: One-off runs in Chromium, kept with the task evidence.

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

## Canonical owners of shared interfaces

| Interface | Canonical owner | Copies |
| --- | --- | --- |
| beamdswitch report template | site `templates/beamdswitch.js` | `viz/*/beamdswitch.js`, `scripts/templates/beamdswitch.js` |
| Theme script and style tokens | visuals `scripts/style_guide.py`, `scripts/kit/style-tokens.css` (source yujieteo/skills) | inline in each page |
| Catalogue entry of a visual | visuals `viz/<slug>/visual.json` | read by the site build |
| Published files of a visual | visuals `viz/<slug>/` (`index.html`, `data.json`, declared assets) | copied by the site build |
| Standalone contract | visuals `e2e/tests/standalone.test.js` | none |

Site revision pinning is outside this pull request. The counterpart site task owns it.
