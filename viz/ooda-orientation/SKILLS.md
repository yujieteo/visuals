---
name: ooda-orientation
description: Use the Orient OODA orientation planner and its read-only WebMCP tools to look up its destruction operations, worked examples and cards, search a situation, or export a narrated beamdswitch deck.
---

# Orient: destroy the wrong model, act from the better one

A Boyd-inspired OODA orientation planner: build an orientation from reality, attack its assumptions, compare alternatives, then choose an action that tests the model.

Open `index.html` in a browser, or https://teoyujie.org/visuals/ooda-orientation/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| List the destruction operations, worked examples, cards and methodology | `get_data` |
| Check the sources and provenance classes | `get_metadata` |
| Find an operation, card or item in the current situation | `query` with `text`, or Ctrl+K in the page |
| Present a situation as a narrated talk | beamdswitch or Copy deck, once a situation exists |

## Inputs

- Embedded data: 39 destruction operations, 3 worked examples, 10 cards and 9 sources, authored for this page; no network fetch at runtime.
- The user's situation, kept in the browser's `localStorage`.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{operations, examples, cards, methodology, truncated}`; each example is `{id, title, purpose}`. |
| `get_metadata` | none | JSON `{title, sources, provenance, schemaVersion, truncated}`. |
| `query` | `text` (string, optional) | JSON `{results, total, truncated}` searching the current situation and the built-in material; each result is `{type, title, location, loop}`; at most 50 results. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `ooda-orientation-beamdswitch.md`: a narrated talk walking the situation's current lineage, with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | **Export JSON** | `orient-situation.json`, the lossless archive of the situation; **Import JSON** restores it. |
| Markdown | **Copy Markdown** | The situation as Markdown on the clipboard. |

The page has no image export.

## Worked example

1. Call `query` with `{"text":"negate"}` on a blank situation.
2. The one result is `{"type":"Destruction operation","title":"Negate an assumption","location":"Method","loop":null}`.
3. Call `get_data` and find the operation with id `a-negate` for its challenge: "What if the opposite of this were true?"
