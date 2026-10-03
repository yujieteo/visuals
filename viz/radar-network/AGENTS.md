# Radar network: the range equation in 3D

`build.py` writes `index.html` and `raw.json` from `src/` (template, CSS and the classic-script modules), `data/`, `beamdswitch.js` and `vendor/`. Never edit `index.html` by hand. Change the sources, then run `python3 build.py`. The analytic model (`numerics`, `detector`, `model`, `state`, `calc`, `checks`, `report`) and the sampled processing (`signal`) are separate modules that the tests load with `require()`. `ui.js`, `views.js` and `app.js` run only in the browser.

`vendor/` holds MathJax 4.1.3 and `@mathjax/mathjax-fira-font` 4.1.3 from npm. `tools/vendor_mathjax.py` is the only code that uses the network: it checks the npm integrity and writes `vendor/manifest.json`. `data/evidence.json` comes from `../stealth-rcs/raw.json` through `tools/import_evidence.py`. Run that script by hand when stealth-rcs changes, because the checks never read another visual's folder.

Keep every rule of the specification in `spec.md`: synthetic absolute values, the NASA curves only in the evidence panel (no dBsm, no m², no power or range result), no zero for an invalid link, and no second implementation of a calculation. Write reader text in ASD-STE100.

Its tests are in `tests/`. `python3 ../../scripts/check.py radar-network` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
