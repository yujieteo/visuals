# Markdown Explorer

Paste or drop standard markdown and explore it: a tab per file, a section tree,
in-tab and cross-tab links, backlinks, inline `#tags` and Ctrl/Cmd+K search.
`index.html` is one self-contained file that works offline, with no build step
and no runtime network requests. MIT licence (see `LICENSE`).

Live at <https://teoyujie.org/visuals/md-explorer/>.

## What it does

- **Input.** CommonMark plus GFM tables, task lists and strikethrough, parsed by
  [marked](https://github.com/markedjs/marked) v18.0.14 (MIT), inlined unmodified
  apart from its sourceMappingURL comment. The top of `index.html` records the
  version, the sha256 of the inlined text and marked's licence. The only
  non-standard syntax is inline `#tags`.
- **Tabs and editor.** "+" opens an empty tab; dropped `.md` files open as tabs
  named after the file; other tabs take their first H1, else "Untitled",
  "Untitled 2" and so on. Double-click renames and pins a name (an empty name
  unpins). Closing shows a 5-second Undo. The editor drawer at the bottom
  re-renders 250 ms after the last keystroke; Tab inserts two spaces.
- **Sections.** Each heading starts a section; text before the first heading is
  an "Intro" node. Nesting is by relative depth, fenced code never makes
  headings, and slugs are GitHub's (`-1`, `-2` for duplicates, unique per tab).
  The reader shows only the selected section's subtree, in chunks when large.
- **Links.** `#anchor`, `other.md` and `other.md#anchor` go to a tab whose
  filename or pinned name matches, ignoring case; missing targets are styled as
  broken with a tooltip. The right panel shows the section's outline and its
  backlinks from every tab.
- **Tags and search.** `#tag` after whitespace or at a line start, outside code
  and URLs, becomes a chip; a tag view lists matching sections across tabs.
  Ctrl/Cmd+K, `/` or the search button searches tab titles, headings, tags and
  text, ranked in that order.
- **Routes.** `#/tab/<tab-id>/<section-slug>` and `#/tag/<name>`; back and
  forward (also Alt+← / Alt+→) work, and a reload restores the place.
- **Safety.** Raw HTML is shown as text. Only `http:`, `https:`, `mailto:` and
  in-app `#` links are live; other schemes (`javascript:`, `data:` ...) are plain
  text. Images load only over `https:`. A Content-Security-Policy meta tag backs
  this up.
- **Storage.** Tabs and the theme choice are saved to `localStorage` when it is
  available; without it the app runs without persistence. "Clear all" resets to
  the built-in guide.

## Files

| File | Role |
| --- | --- |
| `index.html` | The whole tool. `<script id="marked-lib">` is marked; `<script id="mdx-core">` is the pure core (parsing, slugs, section tree, link resolution, the backlink index, tags, search scoring, routes and the sanitising renderer; no DOM or storage; `self.MdxCore`); `<script id="mdx-ui">` is the page and the WebMCP tools. Edit this file directly. |
| `raw.json` | Published metadata; must equal the core's `META`. |
| `tests/md-explorer.test.mjs` | Node's built-in runner: `node --test 'tests/*.test.{mjs,cjs}'` from the repository root, which CI (`.github/workflows/ci.yml`) also runs. It loads marked and the core from `index.html` and checks slugs, the tree, links, the incremental backlink index, tags, search, routes, the security cases and a 5 MB input; it also boots the whole page in a `vm` with stub DOM and storage to check the CSP, that nothing fetches, the WebMCP tools and tab-switch edits. |
| `LICENSE` | MIT. |

To update marked, replace the body of `<script id="marked-lib">` with the new
`lib/marked.umd.js` (without its last sourceMappingURL line), then update the
version and sha256 in the header comment and `META.parser.version`; the tests
check all three.

WebMCP tools: `get_metadata`, `list_tabs`, `get_outline`, `search_notes`,
`analyze_markdown` (all read-only).
