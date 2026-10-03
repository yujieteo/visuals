# Technical E2E for teoyujie.org's visuals

Browser end-to-end tests for the interactive visuals published at
<https://teoyujie.org/visuals/>, run against each visual as standalone
software: no site build, no deploy and no site navigation. Every visual the
site's catalogue names is staged exactly as the site publishes it
(`index.html`, `data.json` and its assets in a folder of its own), served
from localhost and opened from `file://`, then driven in Chromium, Firefox
and WebKit at desktop and mobile sizes. Tests are Node's built-in
`node --test` driving browsers through the Playwright library; the code is
JavaScript type-checked by the TypeScript compiler (`checkJs`).

## Where a test belongs

| Question | Owner |
| --- | --- |
| Does the mathematics or model work? | the visual's own repository (unit, model and fixture tests) |
| Does the standalone browser application work? | **this repository** |
| Does the deployed site expose and integrate it? | [yujieteo/site](https://github.com/yujieteo/site) (site-level smoke tests only) |

Each behaviour has one authoritative test owner. Do not copy site-navigation
tests here, and do not copy this suite into the site.

## Run it

Node 22 or later.

```sh
npm ci
npx playwright install chromium firefox webkit   # or one of them
npm run fetch-targets                            # clones yujieteo/site and yujieteo/visuals into .cache/
npm run test:baseline                            # every visual, every project
npm run test:full                                # the fuller checks for the visuals in tests/full/
npm run test:harness                             # the harness itself, no browser
npm run typecheck
```

Everything is chosen by environment variables:

| Variable | Meaning |
| --- | --- |
| `E2E_SITE` | a clone of yujieteo/site to read the catalogue from (default `.cache/site`) |
| `E2E_VISUALS` | a clone of yujieteo/visuals, for the visuals pinned to it (default `.cache/visuals`) |
| `E2E_ARTIFACT` | test one artifact instead: a folder with `index.html` (such as a visual's own repository), an HTML file, or an `http(s)://` or `file://` URL; `E2E_SLUG` names it when the folder name is not the slug |
| `E2E_BASE_URL` | test artifacts already served at `<base>/<slug>/`, e.g. `http://localhost:8000/visuals` over a built `site/` |
| `E2E_PROJECTS` | comma-separated projects: `chromium-desktop`, `firefox-desktop`, `webkit-desktop`, `chromium-mobile`, `webkit-mobile` (default all) |
| `E2E_ONLY` | comma-separated slugs |
| `E2E_SHARD` | `i/n`: every n-th visual from the i-th, for splitting a run across machines |
| `E2E_CONCURRENCY` | visuals tested at once per browser (default 4) |
| `E2E_RESULTS` | write one JSON line per check to `<folder>/<project>.<run>[.<shard>].jsonl`, where the run is `baseline` (a sharded baseline adds e.g. `1of2`) or `full-<slug>`; each run empties its own files for the selected projects when it starts, so rerunning into the same folder replaces that run's results, and an unsharded baseline also empties every shard's baseline file |
| `E2E_TMP` | where staged artifacts and downloads go (default the system temp folder) |

For example, to test a visual's repository before porting it:

```sh
E2E_ARTIFACT=../mohr E2E_PROJECTS=chromium-desktop npm run test:baseline
```

## What is checked

**Baseline, for every visual in every project** (`tests/baseline.test.js`):

| Check | Passes when |
| --- | --- |
| `opens` | the page loads over http and renders text, a canvas, an SVG or an image |
| `runtime-errors` | no uncaught exception or unhandled rejection while loading and using it |
| `console-errors` | no error-level console message |
| `network` | every request stays inside the artifact's folder; anything else is refused and counted, and no request of its own fails |
| `file-url` | from `file://` it loads with no errors and no requests (only for visuals that say they work offline or from `file://`) |
| `overflow-320` | nothing scrolls sideways in a 320 px viewport |
| `primary-control` | operating its primary control changes what the reader sees (URL, text, form values, ARIA state, SVG or canvas) |

The primary control comes from the visual's manifest, or else the first
visible slider, select, number field, tab, radio, checkbox, button or
focusable chart mark that is not an export, theme or help control.

**Full checks, per visual** (`tests/full/<slug>.test.js`):
`url-state`, `back-forward`, `keyboard`, `command-palette` (Cmd/Ctrl+K),
`reset`, `json-round-trip`, `markdown-export`, `beamdswitch-export`,
`dark-mode` and `reduced-motion`, written for each visual with a file in
`tests/full/`. Each drives the visual through its
user-visible interface (roles, accessible names, stable ids, `data-testid`
and URL state) and asserts on application state, not screenshots.

## Manifests and findings

`manifest/<slug>.json` holds everything specific to one visual, so workers
each owning a batch of visuals never edit the same file:

```json
{
  "primary": { "selector": "#prior", "action": "range", "value": "0.3" },
  "ready": "#selftest-badge",
  "offline": true,
  "skip": { "json-round-trip": "why it does not apply" },
  "findings": [
    { "check": "overflow-320", "projects": ["webkit-desktop"], "status": "finding",
      "evidence": "...", "owner": "https://github.com/yujieteo/..." }
  ]
}
```

A recorded finding runs as a `todo` test: reported on every run, not failing
CI. A check that fails only some of the time is recorded with
`"status": "flaky"` rather than retried until it passes. Any failure not in a
manifest fails CI. [FINDINGS.md](FINDINGS.md) lists them all, generated from
the manifests; CI fails when it is stale.

To record a run's failures:

```sh
E2E_RESULTS=results npm run test:baseline
node scripts/record-findings.js results && npm run findings
```

This repository records findings; it does not fix visuals. Each is fixed in
its owner repository and reaches the suite when the site picks the fix up.

## CI

`.github/workflows/ci.yml` type-checks, runs the harness tests and checks
FINDINGS.md, then runs the baseline in ten jobs, one per browser project and
half of the visuals, with the full checks in the first half's job. Each job
writes its per-test timings to the job summary, and a final job sums them
across the matrix. It runs on pull requests, on pushes to `main`, daily
against the site's `main`, and on demand against any site ref.

## Files

| Path | Role |
| --- | --- |
| `lib/catalogue.js` | discovers the visuals from `data/visuals/*.yaml`, `.pin` files and `visuals/<slug>/` folders |
| `lib/stage.js` | stages each visual as the site publishes it |
| `lib/server.js` | the localhost static server |
| `lib/targets.js` | turns the environment into the artifacts under test |
| `lib/browser.js` | the browser projects and the instrumented page |
| `lib/checks.js` | the in-page probes: state fingerprint, primary-control choice, overflow |
| `lib/baseline.js` | the baseline checks |
| `lib/full.js` | the runner and shared assertions for the full checks |
| `lib/manifest.js`, `manifest/` | per-visual manifests |
| `lib/results.js`, `scripts/` | results, findings, timings and fetching the targets |
| `tests/` | the suites, and `tests/fixtures/site/` for the harness tests |

## Licence

MIT; see [LICENSE](LICENSE).
