# Toulmin argument builder

No build step: edit `index.html`. `<script id="toulmin-engine">` is the pure core (`self.Toulmin`) and `<script id="toulmin-ui">` the page, `localStorage` persistence and the WebMCP tools. After editing `TEMPLATE` in the engine, regenerate `raw.json`'s `template` and the golden deck `tests/fixtures/toulmin-template.md`, as the README's "Changing the template" says.

The deck writer is the page's own, not the shared template, so its narration timing and sentence splitter must match beamdswitch's (the test fails when they drift).

Its tests are in `tests/`; `python3 ../../scripts/check.py toulmin` runs its checks. `tests/toulmin-browser.test.mjs` is skipped unless `TOULMIN_BROWSER_URL` names a Chrome remote-debugging endpoint. Rules for every visual: [SKILLS.md](../../SKILLS.md).
