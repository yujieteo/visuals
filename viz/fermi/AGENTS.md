# Fermi estimator: notes for coding agents

A back-of-the-envelope estimation tool: break a hard question into a few rough factors, each with a low, best and high value, and see the estimate, the exact range those values imply and which assumption matters most. Live at <https://teoyujie.org/visuals/fermi/>; its data is
published at <https://teoyujie.org/visuals/fermi/data.json>.

## Where changes go

The standalone repository [yujieteo/fermi](https://github.com/yujieteo/fermi) is where this visualisation and its tests develop and where CI runs them. `visuals/fermi/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/fermi) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`. `README.md` lists every file here and its role.

## Build, test and verify

Run these from the root of the yujieteo/fermi checkout. There is no build step: edit `index.html` directly. Check this tool alone with:

```sh
node --test tests/fermi.test.mjs
```

Before opening a pull request, run the whole suite, as CI (`.github/workflows/ci.yml`) does on every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

## Porting to yujieteo/site

Change and test this repository first, then port it; the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the full workflow.

1. Run the suite above, check the page end to end in a browser (load `index.html`, use what changed, call the WebMCP tools and the exports), and run no-mistakes here.
2. Copy this repository minus `tests/` and `.github/`, byte for byte, into `visuals/fermi/` of yujieteo/site, and run no-mistakes again on that pull request, which runs only the site-level tests. Never add logic tests to the site; its test cost must stay flat.

## Data and tests

- `raw.json`: catalogue data published as `data.json` (the default estimate, the examples, the rules and the messages). The page never fetches it; the test fails when it drifts from the engine.
- Inside `index.html`: `<script id="fermi-engine">` (pure core, `self.Fermi`, with in-source self-tests run on the page with `?selftest`), `<script id="fermi-ui">` (page and WebMCP tools) and `<script id="beamdswitch">`.
- `tests/fermi.test.mjs`: the spec's self-tests, invalid input, formatting, units, sanity checks, the copy summary, `raw.json`, the WebMCP tools and the beamdswitch deck buttons.

## Conventions

- One self-contained `index.html`: no external scripts, stylesheets, fonts or network requests. It works offline.
- The engine has no DOM, storage, clock or network use, so Node can load it.
- `index.html` stays under 100,000 bytes; the test enforces it.
- Tests use Node's built-in runner (`node --test`) only; never add Vitest, Jest, a `package.json` or another test framework.
- `beamdswitch.js` is a verbatim copy of yujieteo/site's `templates/beamdswitch.js` and is inlined unchanged; the tests check the copy against `tests/fixtures/beamdswitch/beamdswitch.js`, and the site's `tests/beamdswitch-voice.test.mjs` checks the port. Every beamdswitch deck declares the narration voice `bf_emma` in its front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`), never change the page, and keep their names equal to `webmcp_tools` in `data/visuals/fermi.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
