# One repository for every visual

Every public visual lives here, one folder each, and CI tests only the visuals a change touches. This
replaces one `yujieteo/<slug>` repository per visual, which kept tests apart and conflicts rare but cost two to
four pull requests and pipeline runs per change (visual repository, port here or into yujieteo/site, pin)
and copied the same tooling into every repository.

## Properties

| Concern | How it is designed out |
| --- | --- |
| Every test on every change | `scripts/changed.py` maps the diff to the visuals it touches; CI runs one job per touched visual, plus repository-wide jobs on Python 3.9 and 3.12. A change to shared tooling runs every visual. |
| One visual's tests affecting another's | Each visual's checks run in their own job, from its folder, on a sparse checkout holding only the shared tooling and that folder, so a test that reads another visual's folder fails. Type checks run one `tsc` project per visual. |
| Merge conflicts between parallel changes | Nothing shared lists the visuals. A visual is added or changed inside its folder only; the catalogue, gallery and any combined list are generated from the folders and never committed. |
| Mechanical steps done by agents | No ports, pins or manifest entries: the site builds every visual straight from this repository. What remains mechanical runs in CI (below). |

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
  generated.json       for a visual scripts/new_visual.py wrote: its options, the kit's version and the template's SHA-256
e2e/                   the shared browser-check harness, and the checks of the visuals the site keeps (site/<slug>/)
scripts/               shared tooling: changed.py, check.py, build_catalogue.py, check_repo.py,
                       typecheck.mjs, with_chrome.py, and the builders' shared modules (page_parts, style_guide, stock_cases)
  new_visual.py        the generator of new visuals, and its drift check and update
  visual_build.py, visual_kit.py, kit/   what a generated page is built from: the shell, the state and export
                       runtime, the style tokens and the shared tests
  templates/           the site's beamdswitch template and its parsers, copied unchanged
  vendor/mathjax/      MathJax 4.1.3 and its Fira font, byte for byte, with their licences and SHA-256 list
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

`python3 scripts/check.py <slug>...` (or `--changed [base]`, `--all`; `--toon` for one TOON verdict with the full output in `build/logs/`, see [SKILLS.md](../SKILLS.md#one-call-verdicts)) runs, from each visual's folder:
`build.py --verify` when there is a builder, its `tests/*.test.{mjs,cjs}` with `node --test`, its
`tests/test_*.py` with unittest, its `tsconfig.json` with `tsc` after the shared extractor copies the page's
inline scripts, less the ones `typecheck.skip` names and blocks holding only a build placeholder, into
`.typecheck/inline/<id>.js` (`script-<n>.js` for the n-th, unnamed, `<script>`), which that `tsconfig.json` includes, and a check that `visual.json` and `SKILLS.md`
name exactly the WebMCP tools the page registers or defines (at least the literally registered ones, when the page
registers others in a loop). `checks` in `visual.json` replaces the first three. Then, for every visual, the
deterministic rules that replaced review by reading (`scripts/rules.py`, `scripts/deadcode.mjs`):

| Step | Fails when |
| --- | --- |
| `template` | a copy of the beamdswitch template (`beamdswitch.js`, its test fixtures, the block the page inlines) differs from the SHA-256 `scripts/sync_template.py` records in `scripts/templates/beamdswitch.sha256` |
| `requests` | the page requests a URL outside its published files (`index.html`, `data.json`, `assets`), also from CSS `@import` or `url()`: another origin, an absolute or parent path, or `notes.md`; uses `XMLHttpRequest`, `WebSocket`, `EventSource` or `sendBeacon`; fetches, imports or starts a worker from a computed URL; or sets an absolute http(s) URL as a source from script (teoyujie.org and w3.org aside) |
| `contrast` | a text token (`--fg`, `--muted`, `--focus`, `--hl`, `--ok`, `--warn`, `--bad`) is below 4.5:1 on `--bg`, `--control` or a series colour below 3:1, a control is outlined in a token below 3:1 (such as `--border`), in either theme, or the two dark-theme blocks disagree |
| `theme` | the page does not carry the site's theme script (`style_guide.THEME_SCRIPT`) unchanged before its first `<style>`, or a `[data-theme]` block does not set the matching `color-scheme` |
| `pydead` | the folder's Python has an unused import or local, or defines a function or class twice |
| `deadcode` | tsc finds an unused local or import, unreachable code, or a `let`, `const` or class declared twice in the page's inline scripts (one global scope, as the browser runs them) or its test modules; it needs `npm ci` |
| `sourcetests` | a test's every assertion checks the page's source text, or a value read out of it, instead of running its code |
| `vendor` | a vendored block of the page (`<script data-vendor>`, such as the embedded MathJax) is not the bundle `scripts/visual_kit.py` makes from `scripts/vendor/`; the type and dead-code checks leave such a block out |
| `generated` | a visual with a `generated.json` holds a mechanical file, or a `uses` or `typecheck` key, that differs from what `scripts/new_visual.py` writes now |

A finding a visual keeps on purpose goes in `visual.json` `allow`, under the check's name, as the check
prints it but without the line number after the file name, so an edit elsewhere in the file does not break
the entry. Each entry allows one finding: list it twice to allow two identical findings, so a new finding
with the same text still fails. An entry that no longer matches a finding fails, so the list shrinks as the
code is fixed.
`python3 scripts/check_repo.py` is the fast repository-wide check: every `visual.json` against the schema
(which requires at least 3 `webmcp_tools`), the folder rules, the absolute-path scan, no tracked `__pycache__`,
`*.pyc`, `.DS_Store` or AppleDouble `._*` file with `.gitignore` keeping them out, no unused or duplicated
Python in `scripts/` and `tests/`, every tracked `.py` file parsing on the running interpreter (without executing it or writing bytecode),
and the copies in `scripts/` unchanged: the vendored MathJax files against
`scripts/vendor/mathjax/SOURCES.json`, `scripts/kit/style-tokens.css` against `scripts/kit/SOURCES.json`, and
`scripts/templates/beamdswitch.js` against the SHA-256 that `scripts/sync_template.py` records. The tooling's own `tsconfig.json` fails on unused locals and unreachable code.
CI runs the repository job, including this check and the shared tooling's Python and Node tests, on
Python 3.9 and 3.12 on every change, independently of visual selection. Both versions run even if one
fails; `CI passed` requires both to succeed. Only the 3.12 job uploads the catalogue artifact. Visual
jobs continue to use Python 3.12: parsing catches newer visual syntax, while the shared tooling's tests
exercise its runtime compatibility.

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

## Generating a visual

`python3 scripts/new_visual.py <slug> --title ... --summary ... [--mathjax]` writes a new visual whose
mechanical parts come from shared, versioned code instead of copies: its `build.py` calls
`scripts/visual_build.py`, which inlines the kit (`scripts/kit/`), the style guide's tokens and, with
`--mathjax`, the vendored MathJax, and its `visual.json` lists those paths in `uses`, so a change to one runs
only the generated visuals. The one copy is `beamdswitch.js`, which must stay byte-identical to the site's
template; `generated.json` records its source and SHA-256, and `scripts/sync_template.py` updates both. The
folder's domain files (model, views, report, data, the domain's tests, `SKILLS.md`, `AGENTS.md`) are written
once from a starter and never rewritten. `--check` reports drift in the mechanical parts of a generated visual, and
`--update` rewrites them. `viz/visual-skeleton/` is the generator's output, committed
unchanged and unpublished, so CI and the daily browser run keep testing what the generator writes.

## Generated, never committed

`python3 scripts/build_catalogue.py` writes `build/catalogue.json` (every published visual, newest first)
and `build/index.html` (a gallery to browse locally). CI builds both on every run and keeps them as an
artifact. The site reads the folders' `visual.json` itself, so nothing generated is committed and no pull
request edits a list another one also edits.

## Mechanical steps CI does

With the ports, pins and catalogue stubs gone, one change still repeats across many folders: the site's
beamdswitch report template, which every narrated visual carries unchanged (its `beamdswitch.js`, its
tests' fixture copy, the block its page inlines, and in some tests the template's SHA-256) so that each folder
stays self-contained. When the site changes `templates/beamdswitch.js`, the "Sync beamdswitch template"
workflow (`.github/workflows/template.yml`, run by hand with the site branch) runs
`scripts/sync_template.py`, which replaces the old text and its hash in every file of each visual that
carries an older copy, and pushes the result to a branch whose pull request CI checks visual by visual. It
lands before the site's change, whose tests compare the site's template with these copies. The same script
runs locally. Publishing stays a deploy of the site, which CI never does; the site's CI builds against this
repository's `main` daily, so a change here that breaks the site shows within a day.

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

The technical E2E checks moved here from yujieteo/technical-e2e in one squash commit (de17f9c,
https://github.com/yujieteo/visuals/pull/49). That repository is deleted; the body of the squash commit
keeps the original commit subjects. Each visual's manifest
and fuller checks into its folder (`viz/<slug>/e2e/`), the shared harness to `e2e/`. CI runs a visual's
browser checks only when it changes, so a failure or recorded finding stays with its visual, and runs every
visual's once a day against new browser releases, with the two visuals the site keeps itself (their checks
are in `e2e/site/`). The combined findings list is generated in CI from the manifests, never committed.

## Review by risk

Data-only, documentation-only and mechanical changes take CI only, through a plain pull request. Mechanical
means moving or copying already-reviewed content without changing its logic, tests or tooling: a
byte-identical import of a repository's main with its history, a regenerated file, a copied page, a template
synced by `scripts/sync_template.py`. Anything touching a page's logic, a builder, tests, CI or shared tooling
keeps the full no-mistakes pipeline, and so does an import that also edits logic, tests or tooling to fit the
monorepo. The diff decides.
