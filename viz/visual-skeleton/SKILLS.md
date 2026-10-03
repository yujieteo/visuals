---
name: visual-skeleton
description: Use Visual skeleton: the generator's example to explore the view, read its state and the values derived from it, and keep it as JSON, a Markdown record or a narrated beamdswitch deck.
---

# Use Visual skeleton: the generator's example

Live at <https://teoyujie.org/visuals/visual-skeleton/>. The page scripts/new_visual.py writes for a new visual, with MathJax: a damped oscillator whose state lives in the URL, saves and loads as JSON, and exports a Markdown record and a narrated beamdswitch deck. Works offline. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the fields of the view, their bounds and defaults | `get_metadata` |
| Read the current view, its derived values and the URL that restores it | `get_state` |
| Read the current view as a Markdown record | `get_markdown` |
| Read one named example and its derived values | `get_example` |
| Keep the view as a talk or a document | the beamdswitch and Markdown buttons |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and every state field with its type, bounds and default |
| `get_state` | none | The current state, the values derived from it, the JSON that "Load view JSON" restores and the URL |
| `get_markdown` | none | The Markdown record: the deck's frames without narration |
| `get_example` | `id` (required) | One named example's state and the values derived from it |

## Exports

- **beamdswitch deck:** `visual-skeleton-beamdswitch.md`, a narrated Markdown deck (voice `bf_emma`).
- **Markdown record:** `visual-skeleton-record.md`, the same frames without narration.
- **JSON view:** `visual-skeleton-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Data:** [data.json](https://teoyujie.org/visuals/visual-skeleton/data.json) (`raw.json` here).
