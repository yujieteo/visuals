# Python Notebook: Python in the browser

`build.py` writes `index.html` from `src/`, `vendor/`, `raw.json` and `downloads.json`. Never edit `index.html` by hand. The runtime files (Pyodide and the wheels) are not in Git: `downloads.json` pins each one by URL, bytes and SHA-256, and `python3 runtime_files.py fetch` puts them in the ignored `build/`. `vendor/runtime.js` is PyScript 0.7.31 with polyscript 0.20.20, from `tools/vendor_js.mjs`.

Known risk: PyScript has no supported way to start Pyodide from memory under `file://`. `src/runtime-patches.js` changes the PyScript worker source with 3 patches. Each patch must match exactly once, or Python does not start. Thus a version change fails closed and never adds a network request. Track this risk in this repository only. Do not open issues, pull requests or discussions with the PyScript project.

Change PyScript, polyscript or Pyodide only together, and run the gate after the change: `node tests/gate/gate.mjs` (add `--full` for the 100 MB CSV). Run the gate also after a change to `src/runtime-patches.js`, `src/worker-boot.js`, `src/pyodide-shim.mjs` or `src/kernel.py`. Before a release, run it in headed mode (`--headed`) in Chrome and Firefox. Playwright cannot drive a release Firefox, so do that check by hand.

Its tests are in `tests/` and `e2e/`. `python3 ../../scripts/check.py python-notebook` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
