# AGENTS.md: Technical E2E

Browser end-to-end tests for the interactive visuals at <https://teoyujie.org/visuals/>, each tested as standalone software in real browsers, independently of the site. Read [README.md](README.md) for how to run it and what each check means; [SKILLS.md](SKILLS.md) routes common tasks.

## Ownership boundary

This repository owns one layer of a three-layer split, and the split is mandatory:

- **Model** (does the mathematics work?): each visual's own repository, with its unit, model and fixture tests.
- **Browser product** (does the standalone page work in a browser?): this repository.
- **Website integration** (does the deployed site expose it correctly?): [yujieteo/site](https://github.com/yujieteo/site), with site-level smoke tests only.

So: no site-navigation, gallery, routing or deployment tests here, and no copy of this suite in the site. A behaviour has one authoritative test owner. This repository records what is broken; it does not fix visuals. A failure is fixed in the visual's owner repository (each finding names it), then reaches the site, then this suite.

## Conventions

- Node 22+, ES modules, and Node's built-in `node --test`. Browsers are driven through the Playwright library (`import { chromium } from "playwright"`); never add the Playwright Test runner, Vitest, Jest or another framework.
- JavaScript with JSDoc types, checked by `tsc --noEmit` (`checkJs`, `strict`). Files stay `.js`. `npm run typecheck` must pass.
- Dependencies are pinned exactly in `package.json` and locked in `package-lock.json`.
- Assert on application and DOM state through stable, user-visible handles: roles, accessible names, ids, `data-testid`, URL state. Never layout selectors such as `div:nth-child(7)`, and never screenshots alone.
- Every request outside the artifact's own folder is refused and counted; a visual must not depend on a CDN or an API.
- Everything about one visual lives in `manifest/<slug>.json` or `tests/full/<slug>.test.js`, so workers owning different visuals never edit the same file. Change `lib/` only for behaviour every visual shares.
- A failing check is recorded as a finding in the visual's manifest (it then runs as a todo) with its evidence and owner; mark one that comes and goes `"status": "flaky"` instead of retrying until it passes. Regenerate [FINDINGS.md](FINDINGS.md) with `npm run findings`; never edit it by hand.
- Downloads and staged artifacts go under `E2E_TMP` or the system temp folder, never a home folder.

## Test and verify

```sh
npm ci && npx playwright install chromium firefox webkit
npm run fetch-targets
npm run typecheck && npm run test:harness && node scripts/findings.js --check
npm run test:baseline && npm run test:full
```

Locally, prefer one project (`E2E_PROJECTS=chromium-desktop`) on a busy machine and let CI run the full matrix. CI (`.github/workflows/ci.yml`) shards by browser project and by visual batch; add a shard when a job nears ten minutes.
