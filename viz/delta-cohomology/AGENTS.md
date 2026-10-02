# Δ-Complex Cohomology Visualiser: notes for coding agents

An interactive proof that computes the simplicial cohomology of the sphere, the torus and the real projective plane from Δ-complexes of two oriented triangles each, in the order geometry → oriented simplices → boundary maps → coboundary maps → kernels and images → cohomology. Live at <https://teoyujie.org/visuals/delta-cohomology/>; its data is published at <https://teoyujie.org/visuals/delta-cohomology/data.json>.

## Where changes go

The standalone repository [yujieteo/delta-cohomology](https://github.com/yujieteo/delta-cohomology) is where this visualisation and its tests develop and where CI runs them. `visuals/delta-cohomology/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/delta-cohomology) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. The site checks that this file and SKILLS.md link only inside the folder. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/delta-cohomology checkout. There is no build step: edit `index.html` directly. Run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Data and tests

- `raw.json`: catalogue data published as `data.json` (the metadata, the gluing data, the derived matrices and cohomology table, and the stated matrices and table). The page never fetches it; after changing the engine's metadata or data, regenerate it from the engine (the test fails when it drifts).
- Inside `index.html`: `<script id="delta-cohomology-engine">` (pure core, `self.DeltaCohomology`), `<script id="delta-cohomology-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/delta-cohomology.test.mjs`: the derived matrices against the stated ones, ∂² = 0 for every orientation choice, the cohomology table over ℤ, 𝔽₂ and 𝔽₃, the Smith factor 2 of RP², orientation invariance, the cup-product rings, `raw.json`, the beamdswitch decks, and the page booted against a stand-in DOM to call its WebMCP tools and deck buttons. `tests/data-visuals-beamdswitch.mjs` holds the shared deck checks, and `tests/fixtures/beamdswitch/` read-only copies of beamdswitch's deck parser and the site's `templates/beamdswitch.js` and `templates/beamdswitch-report.md`.

## Workflow

Every change follows the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md):

1. Change and test it here first: run the commands above and check the page end to end in a browser.
2. Run the first no-mistakes pass in this repository. It also checks the page in a shallow clone of yujieteo/site (`git clone --depth 1 https://github.com/yujieteo/site`) with the change ported in; build and browse only this page there, never the site's full build or test suite.
3. Once this repository's pull request merges, port the page files byte for byte into `visuals/delta-cohomology/` in yujieteo/site (this repository minus `tests/` and `.github/`) and run the second no-mistakes pass on that pull request, which runs only the site-level tests.

Logic, end-to-end and other heavy tests live here, where they run only when this tool changes; the site adds none for it, so its test time stays flat.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests (a Content-Security-Policy forbids them). It works offline and from `file://`.
- The engine has no DOM, storage, clock, randomness or network use, so Node can load it.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`. When the site's template changes, copy it to both and paste it into `<script id="beamdswitch">`. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/delta-cohomology.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
