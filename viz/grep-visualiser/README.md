# Grep Visualiser

A live match visualiser and scratchpad. Paste some text, type a pattern and see
what ripgrep 14, GNU grep 3.x, PowerShell 7 and VS Code (Find and Search) would
match. `index.html` is one self-contained file. It has no dependencies, no
network access and no build step, and it works from `file://`. The build spec
names the page `visuals/grep-visualiser.html`; this site keeps each
visualization at `visuals/<slug>/index.html`, so that is where it lives.

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="grep-engine">` is the pure core: dialect translators, matching models, flag parsing, command quoting, the replace engines and the self-test. It has no DOM, storage, clock, randomness or network use, and it is `self.GrepViz` in the page and in its Web Worker. `<script id="grep-ui">` is the page, the worker runner and the WebMCP tools. Edit this file directly. |
| `raw.json` | Published metadata: the engine's `META` (presets, confidence levels, matching models, flags and replace syntaxes). It must equal `META`, and the test says when it has drifted. |
| `AGENTS.md` | Notes for coding agents: where changes go (the standalone repository, where this visualisation and its tests develop; yujieteo/site holds a port of the page files), how to build and test, and the conventions. |
| `SKILLS.md` | For agents using the tool: its tasks, inputs, read-only WebMCP tools, exports and a worked example. |
| `LICENSE` | MIT. |

The tests are `tests/grep-visualiser.test.mjs`, run with Node's built-in runner
(`node --test`). They extract the engine script from `index.html` and check BRE
and ERE escaping, POSIX classes, the Unicode `\d` and `\w` rewrites, named groups,
`\<` and `\>`, the "cannot emulate here" constructs, CRLF and `$`, each matching
model, rg's `$1`-followed-by-digits trap, PowerShell and bash quoting, VS Code's
case modifiers and Preserve Case, and that the page makes no network calls. The
page runs the same self-test on every load and shows a pass/fail badge in the footer.

How it works: every dialect except VS Code Find (which is JavaScript already) is
parsed and emitted as a JavaScript `RegExp` in `v` mode. Anchors become
look-arounds, so no engine depends on JavaScript's own `m` flag, and `\d`, `\w`,
`\s` and `\b` become the engine's own Unicode classes. Matching runs in a Worker
built from a Blob of the engine script. A run that takes more than 1.5 s is
stopped and reported as a timeout. The Content-Security-Policy meta tag
(`connect-src 'none'`, `worker-src blob:`) is a guardrail; the self-test is the
check that the code makes no network calls.
