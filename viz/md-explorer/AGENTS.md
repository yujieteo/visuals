# Markdown Explorer

No build step: edit `index.html`. `<script id="marked-lib">` is marked v18.0.14, `<script id="mdx-core">` the pure core (`self.MdxCore`: no DOM or storage) and `<script id="mdx-ui">` the page and the WebMCP tools; `raw.json` must equal the core's `META`.

Raw HTML is shown as text; only `http:`, `https:`, `mailto:` and in-app `#` links are live. The page exports no beamdswitch deck.

Its tests are in `tests/`; `python3 ../../scripts/check.py md-explorer` runs its checks. Rules for every visual: [SKILLS.md](../../SKILLS.md).
