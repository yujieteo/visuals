# Browser checks

Browser end-to-end checks for the visuals, run against each visual as standalone software: no site build,
no deploy and no site navigation. Each visual is staged as the site publishes it (`index.html`,
`data.json` and its assets in a folder of its own), served from localhost and opened from `file://`, then
driven in Chromium, Firefox and WebKit at desktop and mobile sizes. Tests are Node's built-in `node --test`
driving browsers through the Playwright library; the code is JavaScript type-checked by `tsc` (`checkJs`).
They moved here from yujieteo/technical-e2e in one squash commit (de17f9c,
https://github.com/yujieteo/visuals/pull/49). That repository is deleted; the body of the squash commit
keeps the original commit subjects.

This folder is the shared harness. A visual's own checks live in its folder: `viz/<slug>/e2e/manifest.json`
(how to drive it, which checks do not apply, and known findings) and `viz/<slug>/e2e/full.test.mjs` (its
fuller checks). The beamdswitch viewer that the site keeps itself has its checks in
`site/<slug>/`. CI runs a visual's browser checks only when it changes (`.github/workflows/ci.yml`, one job
per browser project), and every visual's, with the site's own, once a day.

## Run it

Node 22 or later, from this folder:

```sh
npm ci
npx playwright install chromium firefox webkit   # or one of them
E2E_ONLY=mohr npm run test:baseline              # the baseline for one visual, every project
E2E_ONLY=mohr npm run test:standalone            # its standalone contract: index.html and declared assets only, offline, from file://
node --test ../viz/mohr/e2e/full.test.mjs        # its fuller checks
npm run test:harness                             # the harness itself, no browser
npm run typecheck
npm run fetch-targets                            # optional: clone yujieteo/site to test its own visuals too
```

Everything is chosen by environment variables:

| Variable | Meaning |
| --- | --- |
| `E2E_VISUALS` | the yujieteo/visuals checkout whose `viz/` visuals are tested (default: this repository) |
| `E2E_SITE` | a clone of yujieteo/site, to also test the visuals it keeps itself (default `.cache/site`, skipped when absent) |
| `E2E_ARTIFACT` | test one artifact instead: a folder with `index.html`, an HTML file, or an `http(s)://` or `file://` URL; `E2E_SLUG` names it |
| `E2E_BASE_URL` | test artifacts already served at `<base>/<slug>/`, e.g. `http://localhost:8000/visuals` over a built `site/` |
| `E2E_PROJECTS` | comma-separated projects: `chromium-desktop`, `firefox-desktop`, `webkit-desktop`, `chromium-mobile`, `webkit-mobile` (default all) |
| `E2E_ONLY` | comma-separated slugs |
| `E2E_SOURCE` | `site` or `visuals`: only the visuals the site keeps itself, or only this repository's |
| `E2E_SHARD` | `i/n`: every n-th visual from the i-th, for splitting a run across machines |
| `E2E_CONCURRENCY` | visuals tested at once per browser (default 4) |
| `E2E_RESULTS` | write one JSON line per check to `<folder>/<project>.<run>[.<shard>].jsonl` |
| `E2E_TMP` | where staged artifacts and downloads go (default the system temp folder) |

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
| `overflow-390` | nothing scrolls sideways when the same page is then 390 px wide, a common phone width |
| `primary-control` | operating its primary control changes what the reader sees (URL, text, form values, ARIA state, SVG or canvas) |
| `numeric-text` | no visible text reads `NaN`, `Infinity` or `undefined`, as the page opens and after each visible number field and slider (up to 12) is set to its minimum, its maximum, 0 when in range and, for a number field, empty; an error that driving raises counts here |

**Standalone contract, for every visual that claims to work offline** (`tests/standalone.test.js`): the page opens from
`file://` in an empty folder that holds its `index.html` and its declared `assets`, but no `data.json` and no site file, in
a browser context that is offline (WebKit refuses `file://` navigation when offline, so there every http(s) request is
refused and counted instead). It must raise no error and make no request, and its primary control must change what the
reader sees. Optional integrations such as WebMCP are absent in the test browsers, so a pass shows the core does not need them.

The primary control comes from the visual's manifest, or else the first
visible slider, select, number field, tab, radio, checkbox, button or
focusable chart mark that is not an export, theme or help control.

**Full checks, per visual** (its `e2e/full.test.mjs`):
`url-state`, `back-forward`, `keyboard`, `command-palette` (Cmd/Ctrl+K),
`reset`, `json-round-trip`, `markdown-export`, `beamdswitch-export`,
`dark-mode` and `reduced-motion`, written for each visual that has that file. Each drives the visual through its
user-visible interface (roles, accessible names, stable ids, `data-testid`
and URL state) and asserts on application state, not screenshots.

## One page, for agents: page-axi

`bin/page-axi.js` (the `page-axi` bin of this package) checks one page in one call and prints one TOON verdict,
so an agent does not hand-write browser probes:

```sh
node e2e/bin/page-axi.js check mohr                         # a visual, staged as the site publishes it
node e2e/bin/page-axi.js check viz/mohr --viewport 390 --themes dark
node e2e/bin/page-axi.js check path/to/page.html
node e2e/bin/page-axi.js check http://localhost:8000/visuals/mohr/
```

It loads the page once for each viewport (default 390, 768 and 1440 px) and theme (default light and dark, as
`prefers-color-scheme`) in one headless Chromium, with the instrumented page of `lib/browser.js` and the probes of
`lib/checks.js`, and saves a screenshot of each load. Its checks are `opens`, `console`, `network`, `overflow`,
`numeric-text` (with each number field and slider driven to its limits once), `contrast` (the token rule of
`scripts/rules.py`, through `scripts/page_rules.py`) and `webmcp-tools` (the tools the page registers at run time,
at least 3, against `visual.json` and `SKILLS.md`). Stdout gets the verdict, failed checks first; `run.json` beside
the screenshots (`build/page-axi/<name>/`, emptied at the start of each run) gets every error and request of
each load. Exit 0 when every check passes, 1 when one fails, 2 for a usage or environment error: an unknown slug, a
missing path, a folder without `index.html`, or no Chromium. A failure that a manifest records
as a known finding still fails, and its evidence says so. `npm run test:page-axi` runs it on the fixtures in
`tests/fixtures/page-axi/`.

## Manifests and findings

A visual's `e2e/manifest.json` holds everything specific to it, so workers each owning a visual never edit
the same file:

```json
{
  "primary": { "selector": "#prior", "action": "range", "value": "0.3" },
  "ready": "#selftest-badge",
  "offline": true,
  "skip": { "json-round-trip": "why it does not apply" },
  "findings": [
    { "check": "overflow-320", "projects": ["webkit-desktop"], "status": "finding", "evidence": "...", "owner": "https://github.com/yujieteo/visuals" }
  ]
}
```

A recorded finding runs as a `todo` test: reported on every run, not failing CI. A check that fails only
some of the time is recorded with `"status": "flaky"` rather than retried until it passes. Any failure not
in a manifest fails CI. The combined list is generated, never committed: `node scripts/findings.js` prints
it, and CI writes it to the job summary. To record a run's failures in the manifests:

```sh
E2E_RESULTS=results npm run test:baseline
node scripts/record-findings.js results
```

## Writing checks

- Assert on application and DOM state through stable, user-visible handles: roles, accessible names, ids,
  `data-testid`, URL state. Never layout selectors such as `div:nth-child(7)`, and never screenshots alone.
- A visual that `scripts/new_visual.py` generated runs every full check through the kit's shared controls with
  `kitSuite` from `lib/kit.js`; its `e2e/full.test.mjs` names only how to change its view.
- Teach the suite a visual's primary control with `"primary"` in its manifest. To add fuller checks, copy
  another visual's `e2e/full.test.mjs`, drive the visual through its roles, names and URL state, and skip
  in its manifest, with a reason, each check that does not apply.
- Every request outside the artifact's own folder is refused and counted: a visual must not depend on a CDN
  or an API.
- Node's built-in `node --test` driving the Playwright library; never the Playwright Test runner or another
  framework. Dependencies are pinned exactly in `package.json` and locked in `package-lock.json`.
- Change `lib/` only for behaviour every visual shares; everything about one visual stays in its own
  `e2e/`. Downloads and staged artifacts go under `E2E_TMP` or the system temp folder.
- Locally, prefer one project (`E2E_PROJECTS=chromium-desktop`) and let CI run the matrix.

## Files

| Path | Role |
| --- | --- |
| `lib/catalogue.js` | discovers the visuals: every `viz/<slug>/visual.json`, and the site's own from a site clone |
| `lib/stage.js` | stages each visual as the site publishes it |
| `lib/server.js` | the localhost static server |
| `lib/targets.js` | turns the environment into the artifacts under test |
| `lib/browser.js` | the browser projects and the instrumented page |
| `lib/checks.js` | the in-page probes: state fingerprint, primary-control choice, overflow |
| `lib/baseline.js` | the baseline checks |
| `lib/full.js` | the runner and shared assertions for the full checks |
| `lib/kit.js` | every full check of a generated visual, through the controls the shared kit gives its page |
| `lib/manifest.js` | finds and reads each visual's manifest |
| `lib/page-axi.js`, `bin/page-axi.js` | page-axi, the one-call check of one page |
| `lib/results.js`, `scripts/` | results, findings, timings and fetching the site |
| `tests/` | the baseline suite, the harness's and page-axi's own tests, with their fixtures |
| `site/<slug>/` | the manifests and full checks of the visuals the site keeps itself |

## Licence

MIT; see [LICENSE](LICENSE).
