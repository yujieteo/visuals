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
3. Put its tests in its own `tests/` (`*.test.mjs` for `node --test`, `test_*.py` for unittest). A test reads only its own folder and the shared tooling, never another visual's folder: CI runs it on a checkout without them. A test runs the page's code and asserts on what it does; the `sourcetests` step fails a test that only searches the page's source text. Time any test you add and keep it fast.
4. Check it: `python3 scripts/check.py --toon <slug> --scoped`, and `node e2e/bin/page-axi.js check <slug>` for the page in a browser, then `python3 scripts/check.py --toon --changed --scoped` for everything the branch touches. Run `npm ci` once first, so the type and dead-code checks run too. Fix a failure; do not add it to `allow` in `visual.json` unless the finding is deliberate, and then say why in the pull request.

## One-call verdicts

Agents call these and read their output; do not pipe a check's output through `tail` or `grep`, and do not sort type errors by hand. Each prints one short TOON verdict, the failures first with their `file:line`, counts and `help` lines with the next command, and writes the full output to a log in `build/logs/` whose path it prints. Exit 0 is a pass, 1 a failure, 2 a usage or environment error.

| Command | Verdict on |
| --- | --- |
| `python3 scripts/check.py --toon` | every visual's checks |
| `python3 scripts/check.py --toon <slug>... --scoped` | the named visuals only |
| `python3 scripts/check.py --toon --changed [BASE] --scoped` | the visuals the branch changes |
| `npm run typecheck -- --summary` | every tsc project: the shared tooling and each visual with a `tsconfig.json`; errors by code and by file, the first 20 in place order, inline-script errors at their page line |
| `npm run typecheck -- --summary [<slug>...] [--file PATH] [--since REF] [--scoped] [--first N]` | the same, with the errors filtered |

A selection or filter never passes silently: the output gives the selected count and the total, and the verdict counts every visual or error unless `--scoped` is given, when the output says so and counts what lies outside. An unknown visual, a missing path, an unknown ref, or a filter that matches nothing exits 2.

## Refresh data

Refresh a visual's data with one command, never by hand: `python3 scripts/refresh.py <slug>`. Each folder with a `refresh.py` has a refresh.

1. Run `python3 scripts/refresh.py <slug>`. It reads the source, checks the data against the visual's schema and compares it with the current data. Then it writes the changed data and `visual.json`'s `fetched`, runs the builder and prints a TOON summary. Add `--dry-run` to print the summary and write nothing.
2. Read the summary. Its `notes` say what the new numbers can make false, such as fixed claims in a builder.
3. Read the diff of the page, run `python3 scripts/check.py <slug>`, and put the summary in the pull request. A data-only refresh takes CI only (Review by risk, below).

The exit code is 2, and nothing is written, when the source fails, answers empty or with a bot check, or the data does not match the schema. When the builder fails after the write, every file in the folder goes back to what it was. Never get past a bot check: try again later.

The stock pages (`airbnb`, `arm`, `marvell`, `panw`) read SEC, which asks for a name and an email in the User-Agent. Set them in the `SEC_CONTACT` environment variable, such as `SEC_CONTACT='Jane Tan jane@example.com'`. Never commit them. If `SEC_CONTACT` is not set, the refresh exits 2 and names the variable.

A new refresh is `viz/<slug>/refresh.py` with a `refresh(source, folder, args)` that reads only through `source` and returns a `refresh_kit.Update`; `scripts/refresh_kit.py` says what each field means. Its tests replay recorded answers with `refresh_kit.Replay`, never the network, and the visual lists `scripts/refresh_kit.py` in `uses`. `tampines-library-events` is the one exception: its sources are JSON POST searches, so it reads them with its own `request()`, and its tests mock that function.

These visuals have data from an outside source but no refresh script, because a person must do the steps:

| Visual | Why a person refreshes it |
| --- | --- |
| `fpl-expected-goals` | No builder: the page text tells the story of one dated gameweek snapshot, so new data needs new text. |
| `tampines-food-map`, `tampines-food` | The ratings come from Google Maps in a browser, and the picks from food guides that a person reads. |
| `work-lanyards` | A hand-made snapshot of Amazon.sg listings, which answer a script with a bot check. |
| `social-values-surveydata`, `graduate-employment-survey`, `tourist-attractions` | A provided dataset of one survey wave. A new wave is a new dataset, and the claims in `build.py` are about this one. |
| `manchester-city-finances` | The figures come from published accounts and news articles that a person reads. |
| `vgc-protect-fakeout-pivot-trainer` | The team list of one finished tournament: the data does not change. |

The other visuals use fixed sources, such as papers, books or their own examples, so they have no refresh.

## What the checks decide

These rules are scripts, so do not check them by reading. `scripts/check.py` runs them for each visual, CI runs them for each changed visual, and [docs/monorepo.md](docs/monorepo.md#checks) lists each step.

| Rule | Step |
| --- | --- |
| A generated page matches its builder on Node 22, the version CI uses; review still decides whether a builder's output changes on other Node versions | `build` (`build.py --verify` on CI's Node 22) |
| `visual.json` and `SKILLS.md` name exactly the WebMCP tools the page registers, at least 3 | `tools`, and the schema in `scripts/check_repo.py` |
| Every `beamdswitch.js` copy is the site's template | `template` (`scripts/templates/beamdswitch.sha256`) |
| The page requests only its own published files, never `notes.md` | `requests`, and the browser check `network` |
| Colour tokens meet WCAG contrast in both themes; no control is outlined in `--border` | `contrast` |
| No unused imports or locals, unreachable code, or names declared twice | `deadcode` (JavaScript, with tsc), `pydead` (Python) |
| No `__pycache__`, `*.pyc`, `.DS_Store` or AppleDouble `._*` file is tracked | `scripts/check_repo.py` |
| No horizontal overflow at 320 px or 390 px; no NaN, Infinity or undefined shown at any input's limits | the browser checks `overflow-320`, `overflow-390`, `numeric-text` |
| A page's vendored block (`<script data-vendor>`, the embedded MathJax) is the bundle of `scripts/vendor/`, and the vendored files are unchanged | `vendor`, and `scripts/check_repo.py` (`scripts/vendor/mathjax/SOURCES.json`) |
| A generated visual holds the generator's current mechanical files | `generated` (`scripts/new_visual.py --check`) |

Review still decides what no script can: whether the mathematics, data and wording are right, whether a test covers the behaviour that matters, whether two different-looking pieces of code are the same rule, and the manual acceptance pass of the `interactive-visual-spec` skill.

## Browser checks

To check a page in a browser, use one call, not hand-written `chrome-devtools-axi` open, resize, screenshot, console and `scrollWidth` probes:

```sh
node e2e/bin/page-axi.js check <slug|path|url> [--viewport 390,768,1440] [--themes light,dark]
```

It stages the visual as the site publishes it, opens it in one headless Chromium for each viewport and theme, and closes the browser at the end. It prints one TOON verdict: the failed checks first (`opens`, `console`, `network`, `overflow`, `numeric-text`, `contrast`, `webmcp-tools`), the screenshot paths, the path of `run.json` with the full evidence, and the next steps. Exit 0 means every check passed, 1 means a check failed, and 2 means a usage or environment error, such as a slug or path that names no page. Run `cd e2e && npm ci && npx playwright install chromium` once first. Read the screenshots it names. Do not read `run.json` unless a check failed.

A visual's browser checks are its `e2e/manifest.json` (how to drive it, checks that do not apply, known findings) and, when it has them, its fuller checks `e2e/full.test.mjs`; the shared harness is `e2e/` ([e2e/README.md](e2e/README.md)). CI runs them only when the visual changes, one job per browser project, and every visual's once a day. Record a run's failures in the manifests with `e2e/scripts/record-findings.js`; the combined findings list is generated, never committed.

## Add a visual

Generate it, then write only the domain:

```sh
python3 scripts/new_visual.py <slug> --title "Title" --summary "One line for the catalogue." [--mathjax]
```

It writes a complete `viz/<slug>/` that passes `scripts/check.py`, CI and its browser checks with no edit: a damped-oscillator starter that shows every mechanical part working. Replace the starter with the domain (the list below), run `python3 build.py` in the folder, and check it. `--mathjax` embeds MathJax 4.1.3 with its Fira font and their licences. `--help` lists the catalogue options (subject, category, tags, source URL, date, `--unpublished`). The same arguments always give the same bytes. `viz/visual-skeleton/` is the generator's output, committed unchanged (`published: false`), so CI and the daily browser run test it.

| Mechanical part of the specification | Where a generated visual gets it | What checks it |
| --- | --- | --- |
| Folder layout, `visual.json` with its `uses` and `typecheck`, `generated.json` | `scripts/new_visual.py` | `scripts/check_repo.py` (schema), `generated` |
| One self-contained offline page: metadata, canonical URL, Open Graph, `Visuals` link, no-JS text, print (§2, §3, §23, §39, §40) | `scripts/kit/shell.html`, built by `scripts/visual_build.py` from `build.py` | `build`, `requests`, browser `network`, `file-url` |
| Style guide tokens, both themes, the site's theme script (§7) | `scripts/kit/style-tokens.css` (yujieteo/skills, recorded in `scripts/kit/SOURCES.json`), `scripts/style_guide.py` | `contrast`, browser `dark-mode` |
| Versioned state, URL fragment, Back and Forward, Reset, JSON import and export with validation (§5, §12, §13, §14) | `scripts/kit/kit.js` (`VisualKit`), inlined unchanged | `tests/<slug>-kit.test.mjs` (`scripts/kit/checks.mjs`), browser `url-state`, `back-forward`, `reset`, `json-round-trip` |
| At least 3 read-only WebMCP tools | the kit's `get_metadata`, `get_state`, `get_markdown`, and the starter's `get_example` | `tools`, schema |
| Cmd/Ctrl+K palette, keyboard and touch controls (§9, §10) | the kit | browser `command-palette`, `keyboard`, `overflow-320` |
| `beamdswitch.js` unchanged, and the `deck(report)` and Markdown exports (§14, §15) | `scripts/templates/beamdswitch.js` copied byte for byte (source and SHA-256 in `generated.json`); the kit calls `Beamdswitch.deck(report)` | `template`, `tests/<slug>-kit.test.mjs` (deck parse with beamdswitch's parser), browser `markdown-export`, `beamdswitch-export` |
| MathJax 4.1.3 with Fira Math, offline, with licences (`--mathjax`) | `scripts/vendor/mathjax/`, inlined as one `data-vendor` block by `scripts/visual_kit.py` | `vendor`, `scripts/check_repo.py`, browser `network`, `file-url` |
| Type check, dead code, tests and browser checks wired into CI | `tsconfig.json`, `types/globals.d.ts`, `tests/`, `e2e/manifest.json`, `e2e/full.test.mjs` (`e2e/lib/kit.js`) | `types`, `deadcode`, `node`, CI's visual and browser jobs, which find the folder |

What stays manual, in files the generator writes once and never rewrites:

- the domain model: `src/model.js` (state fields, schema version, examples with stable ids, `derive`) and `raw.json`;
- the views: `src/view.js` (render, controls, the domain's WebMCP tools and palette commands), `src/body.html`, `src/style.css`;
- the pedagogy and the exports' content: the lede, the order of the explanation, and `report.js` (the report `deck(report)` writes);
- the domain's tests: `tests/<slug>-model.test.mjs` (fixtures and invariants, §36 and §37) and what `e2e/full.test.mjs` changes;
- `SKILLS.md`, `AGENTS.md` and the catalogue fields of `visual.json`;
- the review that no script makes: the mathematics, the data, the wording and the manual acceptance pass.

`python3 scripts/new_visual.py --check <slug>...` (or `--all`) reports where a generated visual's mechanical parts differ from the current generator's, and `--update <slug>...` rewrites its mechanical files and rebuilds its page; neither writes a domain file. Both refuse a visual made by hand, and `--all` reads only the generated visuals. A change to `scripts/kit/`, `scripts/visual_build.py`, `scripts/visual_kit.py`, `scripts/vendor/` or the beamdswitch template fails each generated visual's `build` or `generated` step until `--update` runs for it.

To make a visual by hand instead, create `viz/<slug>/` with `index.html`, the data file, `visual.json` (copy a neighbour's and change every field) and its tests. Nothing else lists the visuals: CI, the catalogue and the site find the folder. Stdlib Python builders import the shared modules from `scripts/` (`page_parts`, `style_guide`, `stock_cases`) and read `design-tokens.json`; a builder for several pages lives in `scripts/` and each page lists it in `uses`.

## Change shared tooling

`scripts/`, `schema/`, `tests/` (the tooling's own tests), `design-tokens.json`, `package.json`, the tsconfig files and CI are shared: a change there runs every visual's checks. Run `python3 scripts/check_repo.py`, `npm ci && npm run typecheck -- --summary`, the tooling tests (`python3 -m unittest discover -s tests -p 'test_*.py'` and `node --test tests/*.test.mjs`), and `python3 scripts/check.py --toon`. A new check goes in `scripts/rules.py` (or the browser harness, for a check that needs a browser), runs no network, replays at least one past finding in its tests, and fixes or lists in `allow` every existing violation.

## Rules

- Pages are single files that work offline: inline CSS, data and JavaScript, no external requests, mobile friendly, and a page works without `modelContext`; WebMCP tools are read-only.
- Generated files are never committed: the catalogue and gallery come from `python3 scripts/build_catalogue.py` into the ignored `build/`. Never add a hand-maintained list of visuals anywhere.
- Every `viz/<slug>/beamdswitch.js` stays byte-identical to yujieteo/site `templates/beamdswitch.js` (the `template` step compares each copy with the SHA-256 in `scripts/templates/beamdswitch.sha256`), and decks declare `voice: bf_emma` unless the report names another. Never re-copy a changed template by hand: run the "Sync beamdswitch template" workflow with the site branch that changes it (or `python3 scripts/sync_template.py <site>/templates/beamdswitch.js`, which also records the new SHA-256), open the pull request its summary links, and merge it before the site's change.
- Tests use `node --test` and Python `unittest` only; `package.json` pins the type-check tooling and nothing else.
- Never commit credentials, host details or deployment config, and never write an absolute user-home path in any file; `scripts/check_repo.py` scans for one, and for tracked build or OS files. On macOS, make an archive with `COPYFILE_DISABLE=1 tar ...`, or it holds AppleDouble `._*` files.

## Review by risk

The diff decides how a pull request is reviewed. A data-only change (a visual's data and the page its builder regenerates from it, such as a `scripts/refresh.py` run), a documentation-only change, or a mechanical one takes CI only: open a plain pull request and land it once its CI passes on that commit. Mechanical means moving or copying already-reviewed content without changing its logic, tests or tooling: a byte-identical import of a repository's main with its history, a regenerated file, a copied page, a template synced by `scripts/sync_template.py`. Anything that touches a page's logic, a builder, `src/`, tests, CI or shared tooling keeps the full no-mistakes pipeline, and so does an import that also edits logic, tests or tooling to fit the monorepo.
