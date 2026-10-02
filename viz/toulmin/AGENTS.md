# AGENTS.md: Toulmin argument builder

Build an essay from up to twelve Toulmin arguments, one per tab, each with its claim, grounds, warrant, backing, qualifier and rebuttals, guided by a pilot-style checklist. Outputs a paragraph in two orderings, a narrated beamdswitch deck and a JSON file that imports back. Live at <https://teoyujie.org/visuals/toulmin/>.

## Source of truth

The standalone repository [yujieteo/toulmin](https://github.com/yujieteo/toulmin) is where this visualisation and its tests develop and where CI runs them. `visuals/toulmin/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/toulmin) is a port of its page files, refreshed when the visualisation is updated, and the site runs no logic tests for it. Porting copies the folder minus `tests/` and `.github/`.

## Files and data

See [README.md](README.md). `index.html` is the whole tool with no build step: edit it directly. `<script id="toulmin-engine">` is the pure core (`self.Toulmin`) and `<script id="toulmin-ui">` the page, `localStorage` persistence and the WebMCP tools. `raw.json` (published as `data.json`) holds the template essay, the Harry example and the constants; the page never fetches it.

Tests live in `tests/` of yujieteo/toulmin: `tests/toulmin.test.mjs` (with the golden deck `tests/fixtures/toulmin-template.md` and beamdswitch's parser in `tests/fixtures/beamdswitch/`) and `tests/toulmin-browser.test.mjs` (skipped unless `TOULMIN_BROWSER_URL` names a Chrome remote-debugging endpoint).

## Build, test and verify

Run from the root of a yujieteo/toulmin checkout, as CI (`.github/workflows/ci.yml`) does on Node 22 for every push and pull request:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

CI skips the browser test. Run it locally against an isolated Chrome started with `--remote-debugging-port=9227`: `TOULMIN_BROWSER_URL=http://127.0.0.1:9227 node --test tests/toulmin-browser.test.mjs`.

After editing `TEMPLATE` in the engine, regenerate `raw.json`'s `template` and the golden deck from the engine, as the README's "Changing the template" says.

## Porting to yujieteo/site

Change and test this repository first, then port it; the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the full workflow.

1. Run the suite above, check the page end to end in a browser (load `index.html`, use what changed, call the WebMCP tools and the exports), and run no-mistakes here.
2. Copy this repository minus `tests/` and `.github/`, byte for byte, into `visuals/toulmin/` of yujieteo/site, and run no-mistakes again on that pull request, which runs only the site-level tests. Never add logic tests to the site; its test cost must stay flat.

## Conventions

- `index.html` is one self-contained HTML file with no dependencies and no network access; it works from `file://` and inside a sandboxed iframe.
- The deck writer is the page's own, not the shared template, so its narration timing and sentence splitter must match beamdswitch's (the test fails when they drift).
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The default deck declares `voice: bf_emma` in its front matter; the reader may pick another voice from the page's list.
