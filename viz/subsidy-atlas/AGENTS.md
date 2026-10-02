# AGENTS.md: Subsidy Atlas

A consumer guide to subsidised products (free LLM tokens, cloud credits, ride and delivery promotions, policy rebates, merchant-funded financing), with sourced evidence, historical loss-leader lessons and a separately flagged speculative watchlist. Live at <https://teoyujie.org/visuals/subsidy-atlas/>.

## Source of truth

The standalone repository [yujieteo/subsidy-atlas](https://github.com/yujieteo/subsidy-atlas) is where this visualisation and its tests develop and where CI runs them. `visuals/subsidy-atlas/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/subsidy-atlas) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

See [README.md](README.md) for the evidence rules. `author.py` is the curated data source and writes `raw.json` (published as `data.json`); `engine.js` filters and builds the beamdswitch report; `style.css` and `beamdswitch.js` (an unchanged copy of `templates/beamdswitch.js`) are inlined by `build.py` into `index.html`, which is generated. `build.py` also reads the design tokens from the site's `static/css/style.css`, so it runs only inside a yujieteo/site checkout.

Tests live in `tests/` of yujieteo/subsidy-atlas: `tests/subsidy-atlas.test.cjs`, `tests/subsidy-atlas-beamdswitch.test.mjs`, `tests/site-theme.test.mjs` and `tests/test_subsidy_atlas.py`.

## Build, test and verify

Python 3 standard library and Node 22; nothing to install. `build.py` inlines the design tokens from yujieteo/site's `static/css/style.css`, two directories up, so it runs only inside `visuals/subsidy-atlas/` of a site checkout; the Python tests build in a temporary copy laid out that way beside the fixture `tests/fixtures/static/css/style.css`. From a site checkout's `visuals/subsidy-atlas/`:

```sh
python3 author.py          # after editing the evidence: rewrites raw.json
python3 build.py           # regenerate index.html
python3 build.py --verify  # check it is fresh
```

From the root of a yujieteo/subsidy-atlas checkout, as CI (`.github/workflows/ci.yml`) does:

```sh
node --test 'tests/*.test.{mjs,cjs}'
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Change workflow

Change and test this repository first, end to end (open the built page in a browser, filter, open a card, save the deck), and run no-mistakes here; then port the page files byte for byte into `visuals/subsidy-atlas/` of yujieteo/site, where a second no-mistakes run covers only the site's own tests. Logic tests stay here; never add them to the site.

## Conventions

- `index.html` is one self-contained HTML file with its styles, JavaScript and data inlined; it makes no external requests (external URLs are citations only).
- Every factual claim carries source ids; forecasts carry `speculative: true`. Never infer a per-token subsidy from company losses.
- Node tests use the built-in `node --test` runner and Python tests use `unittest`; never add Vitest, Jest or a `package.json`.
- The beamdswitch deck is written with the unchanged shared template and declares `voice: bf_emma` in its front matter.
