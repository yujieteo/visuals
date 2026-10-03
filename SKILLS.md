---
name: visuals
description: Work in the visuals monorepo - add, change, refresh or check one visual in viz/<slug>/, or change the shared tooling - with the rules every change here keeps.
---

# Visuals

Every visual is one folder, `viz/<slug>/`: its page `index.html`, its data, its builder and sources when the page is generated, its own tests and its `visual.json`. Shared tooling lives once in `scripts/`. Why it is laid out this way: [docs/monorepo.md](docs/monorepo.md). Commands: [README.md](README.md). A folder's own `AGENTS.md` adds at most a few lines specific to it; read it before changing that visual.

What a visual must be (artifact contract, state and export, interaction and accessibility, pedagogy, visual grammar, test ownership, definition of done) is the [`interactive-visual-spec`](https://github.com/yujieteo/skills/tree/main/interactive-visual-spec) skill, and the story-first workflow from a dataset is [`generate-visualization`](https://github.com/yujieteo/skills/tree/main/generate-visualization), both in yujieteo/skills. Follow them; this file covers only this repository.

## Change one visual

1. Work inside `viz/<slug>/` only. Edit the data, `src/` or `build.py` and run `python3 build.py` when the folder has a builder (it regenerates `index.html`; never hand-edit a generated page); otherwise edit `index.html` directly.
2. Keep `visual.json` true: its `webmcp_tools` and the WebMCP tools table in `SKILLS.md` name exactly the tools the page registers, and `fetched` is the date of the data. `schema/visual.schema.json` says what each field means.
3. Put its tests in its own `tests/` (`*.test.mjs` for `node --test`, `test_*.py` for unittest). A test reads only its own folder and the shared tooling, never another visual's folder: CI runs it on a checkout without them. Time any test you add and keep it fast.
4. Check it: `python3 scripts/check.py <slug>`, then `python3 scripts/check.py --changed` for everything the branch touches.

## Browser checks

A visual's browser checks are its `e2e/manifest.json` (how to drive it, checks that do not apply, known findings) and, when it has them, its fuller checks `e2e/full.test.mjs`; the shared harness is `e2e/` ([e2e/README.md](e2e/README.md)). CI runs them only when the visual changes, one job per browser project, and every visual's once a day. Record a run's failures in the manifests with `e2e/scripts/record-findings.js`; the combined findings list is generated, never committed.

## Add a visual

Create `viz/<slug>/` with `index.html`, the data file, `visual.json` (copy a neighbour's and change every field) and its tests. Nothing else lists the visuals: CI, the catalogue and the site find the folder. Stdlib Python builders import the shared modules from `scripts/` (`page_parts`, `style_guide`, `stock_cases`) and read `design-tokens.json`; a builder for several pages lives in `scripts/` and each page lists it in `uses`.

## Change shared tooling

`scripts/`, `schema/`, `tests/` (the tooling's own tests), `design-tokens.json`, `package.json`, the tsconfig files and CI are shared: a change there runs every visual's checks. Run `python3 scripts/check_repo.py`, the tooling tests (`python3 -m unittest discover -s tests -p 'test_*.py'` and `node --test tests/*.test.mjs`), `npm ci && npm run typecheck`, and `python3 scripts/check.py --all`.

## Rules

- Pages are single files that work offline: inline CSS, data and JavaScript, no external requests, mobile friendly, and a page works without `modelContext`; WebMCP tools are read-only.
- Generated files are never committed: the catalogue and gallery come from `python3 scripts/build_catalogue.py` into the ignored `build/`. Never add a hand-maintained list of visuals anywhere.
- Every `viz/<slug>/beamdswitch.js` stays byte-identical to yujieteo/site `templates/beamdswitch.js`, and decks declare `voice: bf_emma` unless the report names another.
- Tests use `node --test` and Python `unittest` only; `package.json` pins the type-check tooling and nothing else.
- Never commit credentials, host details or deployment config, and never write an absolute user-home path in any file; `scripts/check_repo.py` scans for one.

## Review by risk

The diff decides how a pull request is reviewed. A data-only change (a visual's data and the page its builder regenerates from it), a documentation-only change, or a mechanical one takes CI only: open a plain pull request and land it once its CI passes on that commit. Mechanical means moving or copying already-reviewed content without changing its logic, tests or tooling: a byte-identical import of a repository's main with its history, a regenerated file, a copied page. Anything that touches a page's logic, a builder, `src/`, tests, CI or shared tooling keeps the full no-mistakes pipeline, and so does an import that also edits logic, tests or tooling to fit the monorepo.
