# Beam diagram creator (beamdiag)

`index.html` is built: edit `template.html`, `engine.js` (`BeamDiag`, the stiffness-method solver, which is authoritative), `handcalc.js` (`HandCalc`, the hand calculations and the deck's Hand calculations section) or `raw.json`, then run `python3 build.py`; never hand-edit `index.html`. After editing `fixtures.json`, run `python3 reference.py` to rebuild `reference.json`, the independent exact-arithmetic Python solver's answers the tests compare the engine with.

The engine solves in SI (m, N, Pa); the page converts to and from the chosen units, and the WebMCP tools take and return SI. Loads are positive upward, couples counter-clockwise, and M is positive when sagging. Anything beamdiag adds to its decks lives in `handcalc.js`, never in `beamdswitch.js`.

[docs/verification.md](docs/verification.md) lists what each test checks. `tests/browser.test.mjs` drags handles in Chrome and lays out every preset's deck in `tests/fixtures/beamdswitch/beamdswitch.html`; it runs when `BEAMDIAG_BROWSER_URL` names a Chrome started with remote debugging (`scripts/with_chrome.py` starts one in CI) and skips otherwise. Rules for every visual: [SKILLS.md](../../SKILLS.md).
