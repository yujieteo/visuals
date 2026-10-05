# Universal Data Workbench

`build.py` writes `index.html` from `src/`, `vendor/`, the shared kit, `raw.json`, `examples/` and `downloads.json`. Never edit `index.html` by hand. The engine is not in Git: `downloads.json` pins DuckDB-WASM's worker and engine file and DuckDB's Parquet extension by URL, bytes and SHA-256; `python3 runtime_files.py fetch` puts them in the ignored `build/`, and `stage DIR` lays out the page as the site publishes it. `vendor/` holds the DuckDB-WASM client and Apache Arrow unchanged (`tools/vendor.py`). Change the engine, the client and Arrow only together.

`spec.md` is the specification and the agreed plan, step by step; keep its "Agreed decisions" true and mark each change with its evidence. `grammar.md` documents grammar v1 as built: change it with `src/grammar.js`, `src/chartspec.js`, `src/charts.js` or `src/render.js`, and bump the grammar version and `tests/fixtures/*-candidates.json` when a rule changes the candidates. Every query is in `src/sql.js` or, for charts, `src/chartsql.js`; results are only DOUBLE, BIGINT, BOOLEAN or VARCHAR. The checks run the page's own modules against the pinned engine (`tests/engine.mjs`), and `e2e/full.test.mjs` stages the page with its engine for every browser project.

`python3 ../../scripts/check.py data-workbench` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
