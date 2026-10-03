# Visuals

Self-contained, source-backed interactive visuals, published at
<https://teoyujie.org/visuals/>. Each visual is one folder, `viz/<slug>/`, and
its page is a single HTML file with its CSS, data and JavaScript inlined, so it
works offline and from `file://`.

## Quick start

Python 3 (standard library only) and Node 22. Open any `viz/<slug>/index.html`
in a browser, then:

```sh
python3 scripts/check.py <slug>        # one visual's checks, from its folder
python3 scripts/check.py --changed     # the visuals your branch changes (against origin/main)
python3 scripts/check.py --all         # every visual
python3 scripts/check_repo.py          # every visual.json, the folder rules, no absolute home paths
python3 scripts/build_catalogue.py     # build/catalogue.json and build/index.html, a gallery to browse
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
| `viz/<slug>/visual.json` | The visual's metadata: its catalogue entry (title, summary, source, fetch date, data file, WebMCP tools, tags), and optionally its own check commands, type-check settings and the shared files it `uses`. `schema/visual.schema.json` defines it. |
| `viz/<slug>/raw.json`, `raw.csv`, `meta.json`, ... | The unchanged source data (published as `data.json`) and its provenance. |
| `viz/<slug>/build.py` (or `build.mjs`), `src/` | The builder and page sources, for a generated page; `python3 build.py --verify` (or the check its `visual.json` names) checks the committed page and writes nothing. |
| `viz/<slug>/tests/` | The visual's own tests. |
| `viz/<slug>/e2e/` | Its browser checks: `manifest.json` and, when it has them, the fuller `full.test.mjs`. |
| `viz/<slug>/beamdswitch.js`, `report.js` | The site's unchanged beamdswitch report template and the page's report, for pages that export a narrated deck. |
| `viz/<slug>/SKILLS.md`, `AGENTS.md` | How an agent uses the page and its WebMCP tools; what is specific to changing it. |
| `scripts/check.py`, `changed.py`, `check_repo.py`, `build_catalogue.py`, `typecheck.mjs`, `with_chrome.py` | The shared tooling: per-visual checks, the changed-visual selection, the repository check, the generated catalogue, the type-check extractor, the headless Chrome a visual's browser tests use in CI. |
| `scripts/page_parts.py`, `style_guide.py`, `stock_cases.py`, `templates/` | Modules the builders share. |
| `design-tokens.json` | Shared colours, spacing, radius and fonts; `style_guide` holds the light and dark tokens of the shared visual style guide. |
| `tests/` | Tests of the shared tooling only. |
| `package.json`, `tsconfig.base.json`, `tsconfig.json` | The pinned type checker, the compiler options every visual's `tsconfig.json` extends, and the tooling's own project. |
| `e2e/` | The shared browser-check harness (Playwright, its own `package.json`), and the checks of the two visuals the site keeps; see [e2e/README.md](e2e/README.md). |
| `.github/workflows/ci.yml` | CI: one job per changed visual plus a repository-wide job ([docs/monorepo.md](docs/monorepo.md)). |
| `SKILLS.md` | Agent guide for this repository. |

## Checks

`scripts/check.py` runs each visual's checks from its own folder: its builder's
`--verify`, its `tests/*.test.{mjs,cjs}` with `node --test`, its
`tests/test_*.py` with unittest, its type check, and a check that
`visual.json` and `SKILLS.md` name exactly the WebMCP tools the page
registers. CI runs them only for the visuals a change touches, each in its own
job, and runs every visual when shared tooling changes. `.no-mistakes.yaml`
pins the gate's test step to the same scoped commands.

## Generated outputs

A page with a builder is generated: change its data, sources or builder and
rerun `python3 build.py` in its folder; running it twice leaves no diff. The
catalogue (`build/catalogue.json`) and the gallery (`build/index.html`) are
generated from the folders' `visual.json` files and never committed.
