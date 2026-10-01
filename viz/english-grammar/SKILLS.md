---
name: english-grammar
description: Use the How English Grammar Works visualisation and its read-only WebMCP tools to answer questions from its embedded data or export a narrated beamdswitch deck.
---

# How English Grammar Works

An interactive explorer of English grammar following The Cambridge Grammar of the English Language (CGEL): concepts by chapter, analysed example sentences as trees, contrasts, and Ctrl/Cmd+K search.

Open `index.html` in a browser, or https://teoyujie.org/visuals/english-grammar/. It works offline. Development guide: [AGENTS.md](AGENTS.md).

## Tasks

| Task | Use |
| --- | --- |
| Find a grammar concept, alias or example | Ctrl/Cmd+K search, or `query` with `text` |
| Get one example's full tree analysis | `query` with `example` (an example id) |
| Browse the CGEL chapter outline and concepts | `get_data`, or the sidebar |
| Teach one concept as a narrated lesson | beamdswitch or Copy deck on a concept page |

## Inputs

- Embedded data: CGEL-ordered concepts, analysed example sentences with their trees, and contrasts.
- Controls: the sidebar, concept pages, example trees, Ctrl/Cmd+K search and the URL hash, which records the current view.

## WebMCP tools

Registered with `registerTool` on `document.modelContext` (or `navigator.modelContext`) when the browser provides one. All are read-only (`readOnlyHint: true`) and return one text content item holding JSON text.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_data` | none | JSON `{chapters, concepts, examples, truncated: true, next_steps}`; each example is only `{id, text, concepts}`, so use `query` for its analysis. |
| `get_metadata` | none | JSON `{title, key_message, book, verification, checked, assumptions, truncated}`. |
| `query` | `text` (string) or `example` (string id) | With `example`: `{example, truncated}` holding the full analysis (tokens and tree), or `{error, next_steps}`. Otherwise up to 50 search hits: `{results, total, truncated}`, each hit `{type, concept, label, detail, score}`. |

## Exports

| Export | How | Output |
| --- | --- | --- |
| Markdown beamdswitch deck | **beamdswitch** button | Saves `english-grammar-<concept>-beamdswitch.md`: a narrated talk about the open concept (its lesson: the concept, its main example and analysis, the explanation and its contrasts), with `voice: bf_emma`, to open in [beamdswitch](https://teoyujie.org/visuals/beamdswitch/). |
| Same deck on the clipboard | **Copy deck** button | The same Markdown, to paste into beamdswitch. |
| JSON | `https://teoyujie.org/visuals/english-grammar/data.json` | The source data the site publishes beside the page; not a file in this folder. |

The page has no image export.

## Worked example

1. Call `query` with `{"text":"subject"}`; one hit is the concept `subject`, "The subject".
2. Call `query` with `{"example":"kim-laughed"}` for "Kim laughed.": a Clause whose Subject is the NP "Kim" and whose Predicate is the VP "laughed" (Predicator, preterite).
3. Call `get_metadata` for the CGEL source and the verification notes.
