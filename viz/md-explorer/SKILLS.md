---
name: md-explorer
description: Use Markdown Explorer to open markdown files as tabs and explore them offline by section tree, links, backlinks, inline #tags and fuzzy search, or to parse a markdown string into its sections, tags and links.
---

# Use Markdown Explorer

Live at <https://teoyujie.org/visuals/md-explorer/>. Paste or drop standard markdown (CommonMark plus GFM tables, task lists and strikethrough): a tab per file, a collapsible section tree from GitHub-style heading slugs, in-tab and cross-tab links that flag missing targets, backlinks, inline `#tags` with a tag view, and Ctrl/Cmd+K search across tab titles, headings, tags and text. Tabs are kept in this browser's storage; nothing is uploaded. To change the tool, read [AGENTS.md](AGENTS.md); for the full behaviour, read [README.md](README.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Parse a markdown string into sections, slugs, tags and links | `analyze_markdown` |
| List the open tabs | `list_tabs` |
| Get one tab's section tree | `get_outline` |
| Search across the open tabs | `search_notes`, or Ctrl/Cmd+K or `/` on the page |
| Read the parser version, licence, routes and storage | `get_metadata` |
| Open a file | drop a `.md` file, or "+" and paste |

## Inputs

Markdown text; a tab id such as `t1` (from `list_tabs`); a search query. On the page, routes are `#/tab/<tab-id>/<section-slug>` and `#/tag/<name>`.

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The scope, parser version and licence, routes and storage |
| `list_tabs` | none | Each tab's id, title, pinned name, size in characters, section count and tags, and the selected tab and section |
| `get_outline` | `tabId` (optional; default the active tab) | The tab's section tree: slugs, titles, depths and tags |
| `search_notes` | `query` (required), `tabId` (optional) | Matches across titles, headings, tags and text, ranked as in the Ctrl/Cmd+K palette |
| `analyze_markdown` | `markdown` (required) | Its section tree with GitHub-style slugs, the tags per section, and each section's links with how they resolve on their own, without changing the page |

## Exports

None: the page keeps tabs in `localStorage` and has no download or deck button. The metadata is published as [data.json](https://teoyujie.org/visuals/md-explorer/data.json).

## Worked example

`analyze_markdown({"markdown": "# Plan\n\nSee [notes](#notes). #todo\n\n## Notes\n\nText."})` returns two sections, `plan` and `notes` under it, the tag `todo` on `plan`, and the link `#notes` resolved to the `notes` section.
