---
name: {{slug}}
description: Use {{title}} to {{purpose}}
---

# Use {{title}}

Live at <https://teoyujie.org/visuals/{{slug}}/>. {{lede}} To change the page, read [AGENTS.md](AGENTS.md).

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

- **beamdswitch deck:** `{{slug}}-beamdswitch.md`, a narrated Markdown deck (voice `bf_emma`).
- **Markdown record:** `{{slug}}-record.md`, the same frames without narration.
- **JSON view:** `{{slug}}-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Data:** [data.json](https://teoyujie.org/visuals/{{slug}}/data.json) (`raw.json` here).
