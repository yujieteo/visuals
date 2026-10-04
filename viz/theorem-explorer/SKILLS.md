---
name: theorem-explorer
description: Use Theorem Explorer: which result to learn next to explore the view, read its state and the values derived from it, and keep it as JSON, a Markdown record or a narrated beamdswitch deck.
---

# Use Theorem Explorer: which result to learn next

The planned address after deployment is <https://teoyujie.org/visuals/theorem-explorer/>. A sortable, evidence-linked catalog of mathematical results from mathlib4, Wikidata, Wikipedia, nLab and the TheoremSearch dataset, and of 11,913 mathematical concepts from nLab, mathlib and the results, with rubric scores, prerequisite trees that join results to concepts, popularity per arXiv category, archive and group, concrete comparisons, field shares over time and JSON, CSV and beamdswitch exports. Works offline. To change the page, read [AGENTS.md](AGENTS.md).

## Tasks

| The request is to... | Use |
| --- | --- |
| Read the fields of the view, their bounds and defaults | `get_metadata` |
| Read the current view, its derived values and the URL that restores it | `get_state` |
| Read the current view as a Markdown record | `get_markdown` |
| Read one result: scores, aggregate, measurements, statement and sources | `get_result` |
| Find results by name, alias, concept, Lean name, type or category | `search_results` |
| Read the learn-next list for the current profile | `get_recommendations` |
| Read the prerequisite path to a result | `get_learning_path` |
| Read one comparison case with its calculated guarantees | `get_comparison` |
| Read one history series of the field shares | `get_field_series` |
| Read one concept: scores, definition, prerequisites, the results that name it, its nLab, mathlib and arXiv evidence | `get_concept` |
| Find concepts by name, alias, kind, Lean name, nLab page or category | `search_concepts` |
| Read the prerequisite tree of a result or a concept, with its study order | `get_prerequisite_tree` |
| Read the popularity of concepts or results in arXiv categories, archives or groups | `get_tag_popularity` |
| Keep the view as a talk or a document | the beamdswitch and Markdown buttons |

## WebMCP tools

All read-only.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_metadata` | none | The title, summary, state schema version and every state field with its type, bounds and default |
| `get_state` | none | The current state, the values derived from it, the JSON that "Load view JSON" restores and the URL |
| `get_markdown` | none | The Markdown record: the deck's frames without narration |
| `get_result` | `id` (required), for example `wd:Q755991` | The scores (0 to 4, `u` unknown, `na` not applicable), the aggregate under the current weights, the measurements, the statement, the sources and the relation counts |
| `search_results` | `query` (required), `limit` (1 to 100) | The ids, names and aggregates of the matched results, in the current sort order. Every word must match |
| `get_recommendations` | none | The learn-next list for the current profile, with the components of each priority |
| `get_learning_path` | `id` (required) | The prerequisite path, with cycles and the counts of supported and uncertain edges |
| `get_comparison` | `id` (required): a case id | The calculated guarantees, ranks, exclusions and the reference value of the case |
| `get_field_series` | `view`, `by`, `level`, `mode` | The shares and counts per year, or the bars or steps, for one history view |
| `get_concept` | `id` (required), for example `c:hilbert-space` | The kind, the scores under tc-rubric/1 (0 to 4, `u`, `na`), the aggregate under the current concept weights, the definition and its basis (judge, quoted nLab Idea passage or quoted mathlib doc comment), the prerequisites and their basis, the concepts that need it, the results that name it, and the nLab, mathlib and arXiv evidence |
| `search_concepts` | `query` (required), `limit` (1 to 100) | The ids, names, kinds, assessments (full or light) and aggregates of the matched concepts, in the current concept sort order |
| `get_prerequisite_tree` | `id` (required): a result or concept id; `depth` (1 to 8); `show` (`both`, `results`, `concepts`) | The nested tree (each item expanded once, known items not expanded, at most 400 nodes) and the study order of its unknown items |
| `get_tag_popularity` | `tags` (comma-separated arXiv ids at any level), `kind` (`concepts` or `results`), `metric` (`rate`, `count`, `lift`), `item` | The tags with their paper counts, the top items by the measure, the top 10 per tag, and one item's trend and most over-represented categories |

## Exports

- **beamdswitch deck:** `theorem-explorer-beamdswitch.md`, a narrated Markdown deck (voice `bf_emma`).
- **Markdown record:** `theorem-explorer-record.md`, the same frames without narration.
- **JSON view:** `theorem-explorer-view.json`, which "Load view JSON" restores. The URL holds the same view.
- **Concept CSV:** `theorem-explorer-concepts.csv`, the concepts that the concept table shows, in its order, with the same formula guard.
- **Table CSV:** `theorem-explorer-table.csv`, the rows and columns that the table shows. A cell that starts with `=`, `+`, `-` or `@` gets a `'` prefix.
- **Result JSON and profile JSON:** one result with its evidence, and the known results with the identity map of the snapshot.
- **Data:** [data.json](https://teoyujie.org/visuals/theorem-explorer/data.json) (`raw.json` here).
