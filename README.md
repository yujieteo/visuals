# Visuals

Self-contained, source-backed interactive visuals, published at
<https://teoyujie.org/visuals/>. Each visual is one folder, `viz/<slug>/`, and
its page is a single HTML file with its CSS, data and JavaScript inlined, so it
works offline and from `file://`.

## Quick start

Python 3.9 or later (standard library only) and Node 22. Open any `viz/<slug>/index.html`
in a browser, then:

```sh
python3 scripts/check.py <slug>        # one visual's checks, from its folder
python3 scripts/check.py --changed     # the visuals your branch changes (against origin/main)
python3 scripts/check.py --all         # every visual
python3 scripts/check.py --toon --changed  # one TOON verdict for agents; full output in build/logs/
npm run typecheck -- --summary         # every tsc project's errors as one TOON verdict, by code and file
node e2e/bin/page-axi.js check <slug>  # open the page headless at 3 widths in both themes: one verdict, screenshots in build/page-axi/<slug>/
python3 scripts/check_repo.py          # parse every tracked .py, check visual.json and folder rules, reject home paths and artifacts
python3 scripts/refresh.py <slug>      # refresh one visual's data from its source; --dry-run writes nothing
python3 scripts/build_catalogue.py     # build/catalogue.json and build/index.html, a gallery to browse
python3 scripts/sync_template.py <site>/templates/beamdswitch.js  # copy the site's report template into every visual that carries it
python3 scripts/new_visual.py <slug> --title "..." --summary "..." [--mathjax]  # a new visual with every mechanical part
python3 scripts/new_visual.py --check --all   # which generated visuals' mechanical parts drift from the generator's
python3 scripts/new_visual.py --update <slug> # rewrite a generated visual's mechanical parts, never its domain code
```

`npm ci` installs the pinned TypeScript; after it, `npm run typecheck` checks
the shared tooling and `scripts/check.py` also type-checks every visual with a
`tsconfig.json`: its `src/`, its tests and the page's own inline scripts (or its
builder template's, as `typecheck.page` says), less the blocks its `visual.json`
`typecheck.skip` names.

## Layout

| Path | Role |
| --- | --- |
| `viz/<slug>/index.html` | The page the site publishes at `teoyujie.org/visuals/<slug>/`. |
| `viz/<slug>/visual.json` | The visual's metadata: its catalogue entry (title, summary, source, fetch date, data file, WebMCP tools, tags), and optionally its own check commands, type-check settings, the shared files it `uses` and the `site_page` that replaced its page (the folder then keeps only data and fixtures). `schema/visual.schema.json` defines it. |
| `viz/<slug>/raw.json`, `raw.csv`, `meta.json`, ... | The unchanged source data (published as `data.json`) and its provenance. |
| `viz/<slug>/build.py` (or `build.mjs`), `src/` | The builder and page sources, for a generated page; `python3 build.py --verify` (or the check its `visual.json` names) checks the committed page and writes nothing. |
| `viz/<slug>/tests/` | The visual's own tests. |
| `viz/<slug>/e2e/` | Its browser checks: `manifest.json` and, when it has them, the fuller `full.test.mjs`. |
| `viz/<slug>/beamdswitch.js`, `report.js` | The site's unchanged beamdswitch report template and the page's report, for pages that export a narrated deck. |
| `viz/<slug>/SKILLS.md`, `AGENTS.md` | How an agent uses the page and its WebMCP tools; what is specific to changing it. |
| `viz/<slug>/generated.json` | For a visual `scripts/new_visual.py` wrote: its options, the kit's version and the beamdswitch template's source and SHA-256. |
| `scripts/check.py`, `changed.py`, `check_repo.py`, `rules.py`, `page_rules.py`, `deadcode.mjs`, `build_catalogue.py`, `typecheck.mjs`, `with_chrome.py`, `sync_template.py` | The shared tooling: per-visual checks, the changed-visual selection, the repository check, the deterministic rules, the dead-code check, the static rules page-axi prints, the generated catalogue, the type-check extractor, the headless Chrome a visual's browser tests use in CI, the beamdswitch template sync. |
| `scripts/page_parts.py`, `style_guide.py`, `stock_cases.py`, `templates/` | Modules the builders share. |
| `scripts/new_visual.py`, `visual_build.py`, `visual_kit.py`, `kit/`, `vendor/mathjax/` | The generator of new visuals, the builder of their pages, the kit they inline (state, URL, JSON, exports, palette, WebMCP, style tokens, shared tests) and the vendored MathJax 4.1.3 with Fira Math. |
| `design-tokens.json` | Shared colours, spacing, radius and fonts; `style_guide` holds the light and dark tokens of the shared visual style guide. |
| `tests/` | Tests of the shared tooling only. |
| `package.json`, `tsconfig.base.json`, `tsconfig.json` | The pinned type checker, the compiler options every visual's `tsconfig.json` extends, and the tooling's own project. |
| `e2e/` | The shared browser-check harness (Playwright, its own `package.json`), and the checks of the two visuals the site keeps; see [e2e/README.md](e2e/README.md). |
| `.github/workflows/ci.yml` | CI: one job per changed visual, its browser checks' jobs, and a repository-wide job ([docs/monorepo.md](docs/monorepo.md)). |
| `.github/workflows/template.yml` | Run by hand: copies the site's changed beamdswitch template into every visual that carries it and pushes a branch for the pull request. |
| `SKILLS.md` | Agent guide for this repository. |

## Checks

`scripts/check.py` runs each visual's checks from its own folder: its builder's
`--verify`, its `tests/*.test.{mjs,cjs}` with `node --test`, its
`tests/test_*.py` with unittest, its type check, a check that
`visual.json` and `SKILLS.md` name exactly the WebMCP tools the page
registers, and the deterministic rules of `scripts/rules.py` and
`scripts/deadcode.mjs`: the beamdswitch template copies, the page's requests,
colour contrast in both themes, and dead or duplicated code
([docs/monorepo.md](docs/monorepo.md#checks)). CI runs them only for the
visuals a change touches, each in its own job, and runs every visual when
shared tooling changes. On every change, CI also runs the repository check and
shared tooling's tests on Python 3.9 and 3.12. The repository check parses every
tracked `.py` file without executing it, so newer syntax in any visual fails
the Python 3.9 check even when that visual is not selected. Runtime compatibility
is covered by the shared tooling's tests; visual checks still run on Python 3.12.
`.no-mistakes.yaml` pins the gate's test step to the same scoped commands.

## Generated outputs

A page with a builder is generated: change its data, sources or builder and
rerun `python3 build.py` in its folder; running it twice leaves no diff. The
catalogue (`build/catalogue.json`) and the gallery (`build/index.html`) are
generated from the folders' `visual.json` files and never committed.
