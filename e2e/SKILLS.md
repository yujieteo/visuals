---
name: technical-e2e
description: Run, extend and read the technical browser E2E suite for teoyujie.org's interactive visuals - baseline checks for every visual across Chromium, Firefox and WebKit, fuller section-28 checks per visual, per-visual manifests and recorded findings.
---

# Use the technical E2E suite

It tests each visual the site publishes as standalone software in real browsers, without building or deploying the site. To change the harness, read [AGENTS.md](AGENTS.md); for every option and check, read [README.md](README.md).

## Tasks

| The request is to... | Do |
| --- | --- |
| Test every visual | `npm run fetch-targets`, then `npm run test:baseline` |
| Test one visual on the site | `E2E_ONLY=<slug> npm run test:baseline` |
| Test a visual's own repository before porting | `E2E_ARTIFACT=<path to the clone> npm run test:baseline` |
| Test a built or deployed site | `E2E_BASE_URL=<origin>/visuals npm run test:baseline` |
| Test a site branch | `node scripts/fetch-targets.js <branch>`, then run the suite |
| Teach the suite a visual's primary control | `"primary"` in `manifest/<slug>.json` |
| Add the fuller checks for a visual | copy a file in `tests/full/`, drive the visual through its roles, names and URL state, and skip the checks that do not apply in its manifest with a reason |
| Record what a run found | run with `E2E_RESULTS=results`, then `node scripts/record-findings.js results && npm run findings` |
| Read what is broken and who fixes it | [FINDINGS.md](FINDINGS.md) |
| Close a fixed finding | delete it from the manifest, then `npm run findings` |

## Checks

Baseline, every visual: `opens`, `runtime-errors`, `console-errors`, `network`, `file-url`, `overflow-320`, `primary-control`. Full, per visual: `url-state`, `back-forward`, `keyboard`, `command-palette`, `reset`, `json-round-trip`, `markdown-export`, `beamdswitch-export`, `dark-mode`, `reduced-motion`.

## Browser projects

`chromium-desktop`, `firefox-desktop`, `webkit-desktop` (1280 × 800), `chromium-mobile` (Pixel 7) and `webkit-mobile` (iPhone 15). Choose with `E2E_PROJECTS`.
