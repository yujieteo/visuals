# AGENTS.md: Entropy Methods in Combinatorics Lab

Entropy as a counting technology: choose an object of a finite family uniformly, so H(X) = log |F|, encode it by coordinates, bound the information with an entropy inequality and exponentiate. Thirty-four lessons from uniform entropy and the chain rule through Shearer, Loomis–Whitney and Bregman's theorem, with exact counts checked against every bound. Live at <https://teoyujie.org/visuals/entropy-combinatorics/>.

## Source of truth

This repository is the source of truth: the standalone repository [yujieteo/entropy-combinatorics](https://github.com/yujieteo/entropy-combinatorics) is where this visualisation and its tests develop, and its CI runs them. `visuals/entropy-combinatorics/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/entropy-combinatorics) is a port of the page files, refreshed whenever the lab is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). Edit `src/` and `template.html`, never `index.html` or `raw.json`: `build.mjs` inlines the sources into `index.html` as `<script id="entropy-combinatorics-engine">` (`self.EntropyLab`, the pure maths: no DOM, storage, clock or randomness), `-lessons`, `-render`, `-widgets` and `-ui` (the page and the WebMCP tools), renders the no-JavaScript reference from the lessons, and writes `raw.json` (published as `data.json`).

The tests are in `tests/`, with read-only copies of beamdswitch's deck parsers and the site's shared template (`templates/beamdswitch.js` and `templates/beamdswitch-report.md`) in `tests/fixtures/beamdswitch/`.

## Build, test and verify

From the repository root:

```sh
node build.mjs                     # write index.html and raw.json
node build.mjs --check             # exit 1 if either is stale
node --test 'tests/*.test.mjs'
```

CI (`.github/workflows/ci.yml`) runs `node build.mjs --check` and the tests on every push and pull request: `tests/entropy-combinatorics.test.mjs` checks the build is current, the engine's counts and bounds, every self-test, the lessons' TeX, every exported beamdswitch deck, and the WebMCP tools and deck export by booting the page in a stand-in DOM. In yujieteo/site the only checks for this lab are the site's integration tests: the published copy, the catalogue stub and the folder docs. The page also runs its self-tests and shows the result.

## Conventions

- `index.html` is one self-contained HTML file with no dependencies, no TeX library and no network access; it works from `file://`, offline and in an iframe.
- Every number is computed by the engine; counts are exact BigInt integers and probabilities stay integer weights until a logarithm is taken.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- Decks are written by `toMarkdown` in `src/lessons.js` and declare `voice: bf_emma` in their front matter.
- WebMCP tools stay read-only (`readOnlyHint: true`) and keep their names equal to `webmcp_tools` in `data/visuals/entropy-combinatorics.yaml` in yujieteo/site.
- `LICENSE` is MIT (Copyright (c) 2026 Yu Jie Teo).
