# AGENTS.md: Markdown Explorer

Paste or drop standard markdown and explore it offline: a tab per file, a section tree, in-tab and cross-tab links, backlinks, inline `#tags` and Ctrl/Cmd+K search. Live at <https://teoyujie.org/visuals/md-explorer/>.

## Source of truth

This repository, [yujieteo/md-explorer](https://github.com/yujieteo/md-explorer), is the source of truth: Markdown Explorer and its tests are developed here, and its CI runs them here. `visuals/md-explorer/` in [yujieteo/site](https://github.com/yujieteo/site/tree/main/visuals/md-explorer) is a port of the page files, refreshed whenever Markdown Explorer is updated, and the site runs no logic tests for it. Porting copies this repository minus `tests/` and `.github/`, so AGENTS.md and SKILLS.md must not link into either (the site checks that their links resolve).

## Files and data

See [README.md](README.md). `index.html` is the whole tool with no build step: edit it directly. `<script id="marked-lib">` is marked v18.0.14, `<script id="mdx-core">` the pure core (`self.MdxCore`; no DOM or storage) and `<script id="mdx-ui">` the page and the WebMCP tools. `raw.json` (published as `data.json`) must equal the core's `META`. The tests are in `tests/md-explorer.test.mjs`.

## Build, test and verify

There is no build step. From the repository root:

```sh
node --test 'tests/*.test.{mjs,cjs}'
```

CI (`.github/workflows/ci.yml`) runs this same command on Node 22 on every push and pull request. To update marked, follow the README.

## Porting to yujieteo/site

Change and test this repository first, then port it; the site's [add-visualization playbook](https://github.com/yujieteo/site/blob/main/skills/playbooks/add-visualization.md) owns the full workflow.

1. Run the suite above, check the page end to end in a browser (load `index.html`, use what changed, call the WebMCP tools and the exports), and run no-mistakes here.
2. Copy this repository minus `tests/` and `.github/`, byte for byte, into `visuals/md-explorer/` of yujieteo/site, and run no-mistakes again on that pull request, which runs only the site-level tests. Never add logic tests to the site; its test cost must stay flat.

## Conventions

- `index.html` is one self-contained HTML file with marked inlined; it makes no runtime network requests. The only remote loads are `https:` images written in the user's own markdown, and a Content-Security-Policy meta tag enforces the link and image rules.
- Raw HTML is shown as text; only `http:`, `https:`, `mailto:` and in-app `#` links are live.
- Tests use Node's built-in `node --test` runner only; never add Vitest, Jest or a `package.json`.
- The page has no beamdswitch deck; one added later must use the site's unchanged shared template, which declares `voice: bf_emma`.
