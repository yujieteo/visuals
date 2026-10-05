---
name: okr-setter
description: Use OKR Setter to explore the view, read its state and the values derived from it, and keep it as JSON, a Markdown record or a narrated beamdswitch deck.
---

# Use OKR Setter

Live at <https://teoyujie.org/visuals/okr-setter/>. Set objectives and key results, see progress per key result and objective, and check each against plain rules for a good OKR. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the fields of the view, their bounds and defaults | `get_metadata` |
| Read the current view, its derived values and the URL that restores it | `get_state` |
| Read the current view as a Markdown record | `get_markdown` |
| Read one named example and its derived values | `get_example` |
| Read the set as TOON: objectives, key results and checks | `get_toon` |
| Keep the view as a talk or a document | the beamdswitch and Markdown buttons |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and every state field with its type, bounds and default |
| `get_state` | none | The current state, the values derived from it, the JSON that "Load view JSON" restores and the URL |
| `get_markdown` | none | The Markdown record: the deck's frames without narration |
| `get_example` | `id` (required) | One named example: its progress per objective and key result, and its check counts |
| `get_toon` | none | The current OKR set as TOON |

## Exports

- **TOON:** `okr-setter.toon` (Copy TOON, Save .toon): objectives, key results and checks, one table each.
- **beamdswitch deck:** `okr-setter-beamdswitch.md`, a narrated Markdown deck (voice `bf_emma`).
- **Markdown record:** `okr-setter-record.md`, the same frames without narration.
- **JSON view:** `okr-setter-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Data:** [data.json](https://teoyujie.org/visuals/okr-setter/data.json) (`raw.json` here).
