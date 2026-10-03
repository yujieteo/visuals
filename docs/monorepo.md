# One repository for every visual

Every public visual lives here, one folder each, and CI tests only the visuals a change touches. This
replaces one `yujieteo/<slug>` repository per visual, which kept tests apart and conflicts rare but cost two to
four pull requests and pipeline runs per change (visual repository, port here or into yujieteo/site, pin)
and copied the same tooling into every repository.

## Properties

| Concern | How it is designed out |
| --- | --- |
| Every test on every change | `scripts/changed.py` maps the diff to the visuals it touches; CI runs one job per touched visual, plus one fast repository-wide job. A change to shared tooling runs every visual. |
| One visual's tests affecting another's | Each visual's checks run in their own job, from its folder, on a sparse checkout holding only the shared tooling and that folder, so a test that reads another visual's folder fails. Type checks run one `tsc` project per visual. |
| Merge conflicts between parallel changes | Nothing shared lists the visuals. A visual is added or changed inside its folder only; the catalogue, gallery and any combined list are generated from the folders and never committed. |
| Mechanical steps done by agents | No ports, pins or manifest entries: the site builds every visual straight from this repository. What remains mechanical runs in CI. |

## Layout

```text
viz/<slug>/            one visual, self-contained
  index.html           the published page: one file, works offline
  visual.json          its metadata: catalogue entry, checks, type check, shared modules it uses
  raw.json | raw.csv   the data published beside the page as data.json, with meta.json and other sources
  build.py, src/       its builder and sources, when the page is generated
  tests/               its own tests (node --test, Python unittest)
  SKILLS.md            how an agent uses the page and its WebMCP tools
  AGENTS.md            at most a few lines specific to changing this visual
  e2e/                 its browser checks: manifest.json and, when it has them, full.test.mjs
e2e/                   the shared browser-check harness, and the checks of the visuals the site keeps (site/<slug>/)
scripts/               shared tooling: changed.py, check.py, build_catalogue.py, check_repo.py,
                       typecheck.mjs, with_chrome.py, and the builders' shared modules (page_parts, style_guide, stock_cases)
schema/visual.schema.json   what visual.json may hold
tests/                 tests of the shared tooling only
package.json           pins typescript and @types/node, nothing else
tsconfig.base.json     compiler options every visual's tsconfig.json extends
```

`visual.json` carries the site's catalogue fields (`title`, `summary`, `source_url`, `fetched`, `data`,
`webmcp_tools`, `tags`, `category`, optional `links`, `assets`, `downloads`) and the tooling fields: `checks`
(commands run from the folder, when the defaults do not fit), `typecheck` (what the shared extractor
reads: `page`, the HTML when not `index.html`, such as a builder's template; and `skip`, the inline blocks
it leaves out, by id or by the folder file they copy: a builder's inlined `src/*.js`, checked from `src/`,
and the byte-identical `beamdswitch` and `report` templates), `uses` (shared files outside `viz/` the visual depends on, so changing one runs only its users) and
`published: false` for a visual the site does not publish. The folder name is the slug.

## Checks

`python3 scripts/check.py <slug>...` (or `--changed [base]`, `--all`) runs, from each visual's folder:
`build.py --verify` when there is a builder, its `tests/*.test.{mjs,cjs}` with `node --test`, its
`tests/test_*.py` with unittest, its `tsconfig.json` with `tsc` after the shared extractor copies the page's
inline scripts, less the ones `typecheck.skip` names and blocks holding only a build placeholder, into
`.typecheck/inline/<id>.js` (`script-<n>.js` for the n-th, unnamed, `<script>`), which that `tsconfig.json` includes, and a check that `visual.json` and `SKILLS.md`
name exactly the WebMCP tools the page registers (at least the literally registered ones, when the page
registers others in a loop). `checks` in `visual.json` replaces the first three. `python3 scripts/check_repo.py` is the fast
repository-wide check: every `visual.json` against the schema, the folder rules and the absolute-path scan.

`scripts/changed.py` decides what a change runs: a path in `viz/<slug>/` selects that visual; a path a
visual lists in `uses` selects its users; documentation (`*.md` at the root or in `e2e/`, `docs/`) selects
none; anything else is shared tooling and selects all. Browser checks follow the same selection, except
that a path in `e2e/site/<slug>/` runs only that site visual's browser checks (cloning yujieteo/site for
them), the rest of `e2e/` and CI run every visual's browser checks, the site's own visuals included (the
rest of `e2e/` runs no other visual check, while CI runs them all), and other shared tooling, which the
harness does not use, runs none. Each visual's browser checks get one job per
browser; when more than 40 visuals are selected they are split into 8 shards. CI computes it against the
pull request's base, or the previous commit on a push to `main`; `workflow_dispatch` and the daily run run
everything, the site's own visuals included.

## Generated, never committed

`python3 scripts/build_catalogue.py` writes `build/catalogue.json` (every published visual, newest first)
and `build/index.html` (a gallery to browse locally). CI builds both on every run and keeps them as an
artifact. The site reads the folders' `visual.json` itself, so nothing generated is committed and no pull
request edits a list another one also edits.

## Importing the visual repositories

Each public `yujieteo/<repo>` is imported with its history: `git filter-repo --to-subdirectory-filter
viz/<slug>` on a fresh clone of its `main`, then `git merge --allow-unrelated-histories` here. Rewriting is
deterministic, so importing again later merges only the newer commits. The merge commit drops what the
monorepo replaces (per-repository CI, `package.json`, copies of shared scripts and the extractor,
duplicated agent guidance), keeps lines that are specific to the visual, and adds `visual.json` from the
site's catalogue stub. Only a repository's `main` is imported: open pull requests stay in that repository
and are listed in the import pull request. The repositories are left untouched; archiving them is a later
decision.

Private repositories stay private and outside this public repository: `beamdswitch` (the site vendors its
built page) and `connes-qft` (the site keeps its port). The site keeps their folders and catalogue stubs.

## The site

yujieteo/site builds every visual from a checkout of this repository (`VISUALS_REPO`, as now): one
published page per `viz/<slug>/visual.json` without `published: false`, at the same
`teoyujie.org/visuals/<slug>/` URL, with `index.html`, the data file as `data.json`, and its assets. The
pins, the ports in `visuals/<slug>/` and the catalogue stubs of imported visuals go, and so does the
procedure of porting a change into the site.

## Browser checks

The technical E2E checks moved here from yujieteo/technical-e2e with their history: each visual's manifest
and fuller checks into its folder (`viz/<slug>/e2e/`), the shared harness to `e2e/`. CI runs a visual's
browser checks only when it changes, so a failure or recorded finding stays with its visual, and runs every
visual's once a day against new browser releases, with the two visuals the site keeps itself (their checks
are in `e2e/site/`). The combined findings list is generated in CI from the manifests, never committed.

## Review by risk

Data-only, documentation-only and mechanical changes take CI only, through a plain pull request. Mechanical
means moving or copying already-reviewed content without changing its logic, tests or tooling: a
byte-identical import of a repository's main with its history, a regenerated file, a copied page. Anything
touching a page's logic, a builder, tests, CI or shared tooling keeps the full no-mistakes pipeline, and so
does an import that also edits logic, tests or tooling to fit the monorepo. The diff decides.
